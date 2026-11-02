"""ส่งวิดีโอที่อนุมัติแล้วไปเป็น "ฉบับร่าง" ใน social-poster (ไม่โพสต์จริง)

ขั้นตอน: อัปโหลดไฟล์ไป POST /media -> สร้างร่างด้วย POST /posts (mode=draft)
คนกดโพสต์จริงจากหน้าเว็บ social-poster อีกที
"""
from __future__ import annotations

from pathlib import Path

import requests

ALLOWED_PRIVACY = {"private", "unlisted", "public"}


class SocialPosterError(RuntimeError):
    pass


class SocialPosterClient:
    def __init__(self, base_url: str, token: str, timeout: int = 600):
        if not base_url or not token:
            raise SocialPosterError("ต้องตั้ง SOCIAL_POSTER_URL และ SOCIAL_POSTER_TOKEN")
        self.base = base_url.rstrip("/")
        self.headers = {"x-admin-token": token}
        self.timeout = timeout

    def _check(self, r: requests.Response):
        if not r.ok:
            try:
                msg = r.json().get("error", r.text)
            except ValueError:
                msg = r.text
            raise SocialPosterError(f"HTTP {r.status_code}: {str(msg)[:300]}")
        return r.json()

    def integrations(self, platform: str | None = None) -> list[dict]:
        rows = self._check(requests.get(f"{self.base}/integrations", headers=self.headers, timeout=30))
        return [r for r in rows if platform is None or r["platform"] == platform]

    def upload_video(self, path: str) -> str:
        p = Path(path)
        if not p.is_file():
            raise SocialPosterError(f"ไม่พบไฟล์วิดีโอ: {path}")
        with p.open("rb") as f:
            r = requests.post(
                f"{self.base}/media",
                params={"name": p.name},
                headers={**self.headers, "Content-Type": "video/mp4"},
                data=f,  # สตรีมจากดิสก์ ไม่โหลดทั้งไฟล์เข้า memory
                timeout=self.timeout,
            )
        return self._check(r)["url"]

    def create_draft(self, content: str, media_url: str, integration_ids: list[str],
                     privacy: str = "private") -> str:
        if privacy not in ALLOWED_PRIVACY:
            raise SocialPosterError(f"privacy ต้องเป็น {', '.join(sorted(ALLOWED_PRIVACY))}")
        r = requests.post(
            f"{self.base}/posts",
            headers=self.headers,
            json={
                "content": content,
                "mediaUrls": [media_url],
                "integrationIds": integration_ids,
                "privacyStatus": privacy,
                "mode": "draft",
            },
            timeout=60,
        )
        return self._check(r)["postId"]
