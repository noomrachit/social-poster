"""Download only image URLs present in the API response.

Additional JSON paths are operator-configured, NOT presumed Shopee schema.
No scraping, generated CDN URLs, redirects or private-network requests.
"""
from __future__ import annotations

import hashlib
import ipaddress
import json
import socket
import time
import warnings
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit

import requests
from PIL import Image, ImageOps


def extract_urls(raw: dict, paths: tuple[str, ...] = ("imageUrl",)) -> list[str]:
    """Dotted paths traverse objects and lists, e.g. gallery.url.

The example path is illustrative only. Missing configured paths yield no URLs.
"""
    def walk(value, keys):
        if isinstance(value, list):
            return [url for item in value for url in walk(item, keys)]
        if keys:
            return walk(value.get(keys[0]), keys[1:]) if isinstance(value, dict) else []
        return [value.strip()] if isinstance(value, str) and value.strip() else []

    return list(dict.fromkeys(url for path in paths for url in walk(raw, path.split("."))))


@dataclass(frozen=True)
class ImageOptions:
    root: Path = Path("assets/products")
    allowed_hosts: tuple[str, ...] = ()
    max_images: int = 6
    max_bytes: int = 10 * 1024 * 1024
    min_side: int = 500
    max_pixels: int = 20_000_000
    attempts: int = 3


def validate_url(url: str, allowed_hosts: tuple[str, ...]) -> None:
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower()
    if (parsed.scheme != "https" or not host or parsed.username or parsed.password
            or parsed.port not in (None, 443) or parsed.fragment):
        raise ValueError("image URL must be HTTPS without credentials or fragment")
    if host not in allowed_hosts:
        raise ValueError(f"image host not approved: {host}")
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError("non-public image host blocked")


class ImageDownloader:
    def __init__(self, options: ImageOptions, session=None):
        self.options = options
        if not options.allowed_hosts:
            raise ValueError("IMAGE_ALLOWED_HOSTS must contain verified exact image hostnames")
        if not (1 <= options.max_images <= 20 and options.attempts >= 1):
            raise ValueError("invalid image limits")
        self.session = session or requests.Session()
        self.session.trust_env = False

    def _get(self, url: str) -> bytes:
        for attempt in range(self.options.attempts):
            validate_url(url, self.options.allowed_hosts)
            try:
                with self.session.get(url, stream=True, allow_redirects=False,
                                      timeout=(10, 30)) as response:
                    if response.status_code in (429, 500, 502, 503, 504):
                        if attempt + 1 < self.options.attempts:
                            # Bounded retry; long rate limits fail for operator retry.
                            retry = response.headers.get("Retry-After", "")
                            delay = float(retry) if retry.isdigit() else 2 ** attempt
                            if delay > 30:
                                raise ValueError("rate limited; retry the image batch later")
                            time.sleep(delay)
                            continue
                    if 300 <= response.status_code < 400:
                        raise ValueError("image redirects blocked; verify the final API URL")
                    response.raise_for_status()
                    if response.status_code != 200:
                        raise ValueError("image response must be HTTP 200")
                    size = response.headers.get("Content-Length")
                    if size and int(size) > self.options.max_bytes:
                        raise ValueError("image exceeds byte limit")
                    data = bytearray()
                    for block in response.iter_content(64 * 1024):
                        data.extend(block)
                        if len(data) > self.options.max_bytes:
                            raise ValueError("image exceeds byte limit")
                    return bytes(data)
            except (requests.Timeout, requests.ConnectionError):
                if attempt + 1 == self.options.attempts:
                    raise
                time.sleep(2 ** attempt)
        raise RuntimeError("image download exhausted")

    def _decode(self, blob: bytes):
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(blob)) as probe:
                if probe.format not in {"JPEG", "PNG", "WEBP"}:
                    raise ValueError("unsupported image format")
                if min(probe.size) < self.options.min_side:
                    raise ValueError("image dimensions too small")
                if probe.width * probe.height > self.options.max_pixels:
                    raise ValueError("image exceeds pixel limit")
                probe.verify()
            with Image.open(BytesIO(blob)) as source:
                rgba = ImageOps.exif_transpose(source).convert("RGBA")
                rgb = Image.new("RGB", rgba.size, "white")
                rgb.paste(rgba, mask=rgba.getchannel("A"))
                rgba.close()
                return rgb

    def download(self, product: dict) -> dict:
        # Parse as ints to prevent path traversal in product-controlled paths.
        key = f"{int(product['item_id'])}_{int(product['shop_id'])}"
        folder = self.options.root / key
        folder.mkdir(parents=True, exist_ok=True)
        urls = product.get("image_urls")
        if isinstance(urls, str):
            urls = json.loads(urls)
        if not urls:
            urls = [product.get("image_url", "")]
        if not isinstance(urls, list) or not all(isinstance(u, str) for u in urls):
            raise ValueError("image_urls must be a list of URL strings")
        result = {"product_key": key, "images": [], "rejected": [], "duplicates": []}
        hashes = set()
        # Bound failed candidates too; do not download an unbounded gallery.
        for url in list(dict.fromkeys(urls))[:self.options.max_images * 3]:
            if len(result["images"]) >= self.options.max_images:
                break
            try:
                image = self._decode(self._get(url))
                try:
                    digest = hashlib.sha256(str(image.size).encode() + image.tobytes()).hexdigest()
                    if digest in hashes:
                        result["duplicates"].append({"url": url, "sha256": digest})
                        continue
                    path = folder / f"{digest}.jpg"
                    temporary = path.with_suffix(".part")
                    image.save(temporary, format="JPEG", quality=95)
                    temporary.replace(path)
                    hashes.add(digest)
                    result["images"].append({"url": url, "path": str(path.resolve()),
                                             "sha256": digest, "width": image.width,
                                             "height": image.height})
                finally:
                    image.close()
            except (ValueError, OSError, requests.RequestException,
                    Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
                # Do not log response bodies / signed query strings in exceptions.
                result["rejected"].append({"url": url, "reason": type(exc).__name__ + ": " +
                                           (str(exc) if isinstance(exc, ValueError) else "download/decode failed")})
        result["status"] = "ready" if result["images"] else "image_failed"
        temporary = folder / "manifest.part"
        temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(folder / "manifest.json")
        return result


def select_scenes(paths: list[str]) -> dict[str, str]:
    if not paths:
        raise ValueError("no validated local images")
    return dict(zip(("hook", "spec", "cta"), (paths[i % len(paths)] for i in range(3))))
