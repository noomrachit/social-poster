import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from core.db import DB
from publisher.social_poster import SocialPosterClient, SocialPosterError
from scripts import publish_approved


def resp(status=200, body=None):
    r = MagicMock()
    r.ok = status < 400
    r.status_code = status
    r.json.return_value = body if body is not None else {}
    r.text = str(body)
    return r


class ClientTests(unittest.TestCase):
    def test_requires_config(self):
        with self.assertRaises(SocialPosterError):
            SocialPosterClient("", "")

    def test_create_draft_sends_draft_mode_and_privacy(self):
        c = SocialPosterClient("https://x.test/", "tok")
        with patch("publisher.social_poster.requests.post", return_value=resp(201, {"postId": "p1"})) as post:
            self.assertEqual(c.create_draft("t", "u", ["i1"], "unlisted"), "p1")
        body = post.call_args.kwargs["json"]
        self.assertEqual(body["mode"], "draft")
        self.assertEqual(body["privacyStatus"], "unlisted")
        self.assertEqual(post.call_args.kwargs["headers"], {"x-admin-token": "tok"})
        self.assertEqual(post.call_args.args[0], "https://x.test/posts")

    def test_bad_privacy_rejected_before_request(self):
        c = SocialPosterClient("https://x.test", "tok")
        with patch("publisher.social_poster.requests.post") as post:
            with self.assertRaises(SocialPosterError):
                c.create_draft("t", "u", ["i"], "everyone")
        post.assert_not_called()

    def test_http_error_surfaces_server_message(self):
        c = SocialPosterClient("https://x.test", "tok")
        with patch("publisher.social_poster.requests.get", return_value=resp(401, {"error": "token ไม่ถูกต้อง"})):
            with self.assertRaisesRegex(SocialPosterError, "401.*token"):
                c.integrations()

    def test_missing_video_file(self):
        c = SocialPosterClient("https://x.test", "tok")
        with self.assertRaises(SocialPosterError):
            c.upload_video("/nonexistent/v.mp4")


class HandOffTests(unittest.TestCase):
    def test_drafts_youtube_and_skips_platform_without_integration(self):
        with tempfile.TemporaryDirectory() as d:
            video = Path(d) / "v.mp4"
            video.write_bytes(b"x")
            db = DB(str(Path(d) / "s.db"))
            yt = db.add_publish("1:1", "youtube", str(video), status="approved", privacy="private")
            tt = db.add_publish("1:1", "tiktok", str(video), status="approved")
            cfg = MagicMock()
            cfg.social_poster.url, cfg.social_poster.token = "https://x.test", "tok"

            def get(url, **kw):
                return resp(200, [{"id": "int-yt", "platform": "youtube"}])

            def post(url, **kw):
                if url.endswith("/media"):
                    return resp(201, {"url": "https://x.test/media/a.mp4"})
                return resp(201, {"postId": "draft-1"})

            with patch("publisher.social_poster.requests.get", side_effect=get), \
                 patch("publisher.social_poster.requests.post", side_effect=post):
                count = publish_approved.hand_off(cfg, db)

            self.assertEqual(count, {"drafted": 1, "skipped": 1, "failed": 0})
            rows = {r["id"]: dict(r) for r in db.list_publishes()}
            self.assertEqual(rows[yt]["status"], "drafted")
            self.assertEqual(rows[yt]["remote_id"], "draft-1")
            self.assertEqual(rows[tt]["status"], "approved")
            db.close()


if __name__ == "__main__":
    unittest.main()
