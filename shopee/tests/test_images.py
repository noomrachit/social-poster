import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import requests
from PIL import Image

from collector.images import (ImageDownloader, ImageOptions, extract_urls,
                              select_scenes, validate_url)
from collector.data_check import check
from core.db import DB
from scripts.download_images import prepare


def blob(color="red", size=(600, 600), mode="RGB"):
    stream = io.BytesIO()
    with Image.new(mode, size, color) as image:
        image.save(stream, format="PNG")
    return stream.getvalue()


class Response:
    def __init__(self, content=b"", status=200, headers=None):
        self.content, self.status_code = content, status
        self.headers = headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(response=self)

    def iter_content(self, size):
        for i in range(0, len(self.content), size):
            yield self.content[i:i + size]


class Session:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        result = next(self.responses)
        if isinstance(result, Exception):
            raise result
        return result


class ImageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.dns = patch("collector.images.socket.getaddrinfo",
                         return_value=[(2, 1, 6, "", ("8.8.8.8", 443))])
        self.dns.start()
        self.addCleanup(self.dns.stop)

    def worker(self, responses, **kwargs):
        self.session = Session(responses)
        return ImageDownloader(ImageOptions(root=self.root, allowed_hosts=("cdn.example",),
                                            **kwargs), self.session)

    def product(self, count=3):
        return {"item_id": 10, "shop_id": 20,
                "image_urls": [f"https://cdn.example/{n}" for n in range(count)]}

    def test_extract_only_configured_paths(self):
        raw = {"imageUrl": "https://cdn.example/1",
               "fixtureGallery": [{"url": "https://cdn.example/2"},
                                  {"url": "https://cdn.example/1"}],
               "untrusted": "https://other.example/3"}
        self.assertEqual(len(extract_urls(raw)), 1)
        self.assertEqual(len(extract_urls(raw, ("imageUrl", "fixtureGallery.url"))), 2)
        self.assertEqual(extract_urls(raw, ("missing.field",)), [])

    def test_download_three_and_scene_order(self):
        worker = self.worker([Response(blob(c)) for c in ("red", "green", "blue")])
        result = worker.download(self.product())
        paths = [i["path"] for i in result["images"]]
        self.assertEqual(len(paths), 3)
        self.assertEqual(select_scenes(paths), dict(zip(("hook", "spec", "cta"), paths)))
        self.assertTrue(all(Path(p).is_file() for p in paths))
        for url, kwargs in self.session.calls:
            self.assertFalse(kwargs["allow_redirects"])
        self.assertEqual(json.loads((self.root / "10_20/manifest.json").read_text())["status"], "ready")

    def test_duplicate_content_and_url(self):
        product = self.product(2)
        product["image_urls"].append(product["image_urls"][0])
        result = self.worker([Response(blob()), Response(blob())]).download(product)
        self.assertEqual(len(result["images"]), 1)
        self.assertEqual(len(result["duplicates"]), 1)
        self.assertEqual(len(self.session.calls), 2)

    def test_partial_failure_still_usable(self):
        result = self.worker([Response(b"not an image"), Response(blob()),
                              Response(blob(size=(100, 100)))]).download(self.product())
        self.assertEqual(result["status"], "ready")
        self.assertEqual(len(result["rejected"]), 2)

    def test_byte_limit(self):
        result = self.worker([Response(blob())], max_bytes=10).download(self.product(1))
        self.assertEqual(result["status"], "image_failed")

    def test_content_length_limit(self):
        result = self.worker([Response(b"", headers={"Content-Length": "999999999"})]).download(self.product(1))
        self.assertEqual(len(result["rejected"]), 1)

    def test_pixel_limit(self):
        result = self.worker([Response(blob())], max_pixels=100).download(self.product(1))
        self.assertEqual(result["status"], "image_failed")

    def test_redirect_blocked(self):
        result = self.worker([Response(status=302)]).download(self.product(1))
        self.assertEqual(result["status"], "image_failed")
        self.assertEqual(len(self.session.calls), 1)

    def test_404_no_retry(self):
        self.worker([Response(status=404)]).download(self.product(1))
        self.assertEqual(len(self.session.calls), 1)

    @patch("collector.images.time.sleep")
    def test_429_retry(self, sleep):
        result = self.worker([Response(status=429), Response(blob())]).download(self.product(1))
        self.assertEqual(result["status"], "ready")
        self.assertEqual(len(self.session.calls), 2)

    @patch("collector.images.time.sleep")
    def test_timeout_retry_exhaustion(self, sleep):
        result = self.worker([requests.Timeout()] * 3).download(self.product(1))
        self.assertEqual(result["status"], "image_failed")
        self.assertEqual(len(self.session.calls), 3)

    def test_long_retry_after_fails_without_sleep(self):
        result = self.worker([Response(status=429, headers={"Retry-After": "3600"})]).download(self.product(1))
        self.assertEqual(result["status"], "image_failed")

    def test_allowlist_required(self):
        with self.assertRaises(ValueError):
            ImageDownloader(ImageOptions())

    def test_unsafe_urls(self):
        for url in ("http://cdn.example/a", "file:///etc/passwd",
                    "https://other.example/a", "https://user:pass@cdn.example/a",
                    "https://cdn.example:444/a"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_url(url, ("cdn.example",))

    def test_private_dns_blocked(self):
        with patch("collector.images.socket.getaddrinfo",
                   return_value=[(2, 1, 6, "", ("127.0.0.1", 443))]):
            with self.assertRaises(ValueError):
                validate_url("https://cdn.example/a", ("cdn.example",))

    def test_two_and_one_image_fallback(self):
        self.assertEqual(select_scenes(["a", "b"]), {"hook": "a", "spec": "b", "cta": "a"})
        self.assertEqual(set(select_scenes(["a"]).values()), {"a"})
        with self.assertRaises(ValueError):
            select_scenes([])

    def test_transparent_image_becomes_rgb(self):
        result = self.worker([Response(blob((255, 0, 0, 0), mode="RGBA"))]).download(self.product(1))
        with Image.open(result["images"][0]["path"]) as image:
            self.assertEqual(image.mode, "RGB")
            self.assertEqual(image.getpixel((0, 0)), (255, 255, 255))

    def test_max_images(self):
        result = self.worker([Response(blob("red")), Response(blob("blue"))],
                             max_images=1).download(self.product(2))
        self.assertEqual(len(result["images"]), 1)
        self.assertEqual(len(self.session.calls), 1)

    def test_database_integration_and_no_status_reset(self):
        checked = check({"itemId": 10, "shopId": 20, "imageUrl": "https://cdn.example/0",
                         "productName": "ทดสอบ", "price": "1290.50", "offerLink": "test"})
        self.assertTrue(checked.ok)
        db = DB(str(self.root / "state.db"))
        self.addCleanup(db.close)
        db.upsert_product(checked.product)
        row = dict(db.list_products()[0])
        self.assertTrue(row["first_seen"])
        paths = prepare(db, row, self.worker([Response(blob())]))
        self.assertEqual(json.loads(db.list_products()[0]["local_images"]), paths)
        db.set_product_status(10, 20, "rendered")
        db.upsert_product(checked.product)
        self.assertEqual(len(db.list_products("rendered")), 1)
        self.assertTrue(db.product_seen_recently(10, 20, 7))

    def test_database_migration_idempotent(self):
        import sqlite3
        from core.db import _SCHEMA
        path = str(self.root / "legacy.db")
        connection = sqlite3.connect(path)
        connection.executescript(_SCHEMA)
        connection.close()
        for _ in range(2):
            db = DB(path)
            columns = {r[1] for r in db._conn.execute("PRAGMA table_info(products)")}
            self.assertTrue({"image_urls", "local_images"} <= columns)
            db.close()

    def test_failed_images_not_ready_for_render(self):
        product = check({"itemId": 10, "shopId": 20, "imageUrl": "https://cdn.example/0",
                         "productName": "ทดสอบ", "price": "20", "offerLink": "test"}).product
        db = DB(str(self.root / "state.db"))
        self.addCleanup(db.close)
        db.upsert_product(product)
        with self.assertRaises(ValueError):
            prepare(db, dict(db.list_products()[0]), self.worker([Response(status=404)]))
        self.assertEqual(len(db.list_products("image_failed")), 1)


if __name__ == "__main__":
    unittest.main()
