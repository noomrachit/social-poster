"""TikTok Content Posting API client (chunked upload + poll status).

ข้อจำกัดที่ต้องรู้: แอปที่ยังไม่ผ่าน audit โพสต์ได้เฉพาะ SELF_ONLY (private)
อย่าออกแบบระบบโดยสมมติว่าได้ public auto-post วันแรก — เริ่มโหมดดราฟต์/private
แล้วให้คนกดยืนยันก่อน ระหว่างยื่น audit (ดูเอกสารแผนงานหัวข้อ Spam Automation)
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import requests

from core.ratelimit import backoff

BASE = "https://open.tiktokapis.com/v2"


class TikTokClient:
    def __init__(self, access_token: str, client_key: str = "",
                 client_secret: str = ""):
        self.token = access_token
        self.client_key = client_key
        self.client_secret = client_secret
        self._auth = {"Authorization": f"Bearer {self.token}"}

    def _refresh(self) -> None:
        # TODO: เรียก /v2/oauth/token/ ด้วย refresh_token เพื่อต่ออายุ access token
        raise NotImplementedError("refresh token flow ต้องต่อใน oauth_server.py")

    @backoff(retries=3)
    def creator_info(self) -> dict:
        r = requests.post(
            f"{BASE}/post/publish/creator_info/query/",
            headers=self._auth, timeout=30,
        )
        r.raise_for_status()
        return r.json()

    def _init_upload(self, video_size: int) -> dict:
        chunk_size = 5 * 1024 * 1024
        total_chunks = (video_size + chunk_size - 1) // chunk_size
        body = {
            "post_info": {
                "title": "tbd",
                "privacy_level": "SELF_ONLY",  # เปลี่ยนเป็น PUBLIC หลังผ่าน audit
                "disable_duet": False,
                "disable_comment": False,
                "disable_stitch": False,
            },
            "source_info": {
                "source": "FILE_UPLOAD",
                "video_size": video_size,
                "chunk_size": chunk_size,
                "total_chunk_count": total_chunks,
            },
        }
        r = requests.post(
            f"{BASE}/post/publish/video/init/",
            headers={**self._auth, "Content-Type": "application/json"},
            json=body, timeout=30,
        )
        r.raise_for_status()
        data = r.json()["data"]
        return {
            "publish_id": data["publish_id"],
            "upload_url": data["upload_url"],
            "chunk_size": chunk_size,
            "total_chunks": total_chunks,
        }

    def _upload_chunk(self, upload_url: str, data: bytes) -> None:
        r = requests.put(
            upload_url,
            headers={"Content-Range": f"bytes 0-{len(data)-1}/{len(data)}"},
            data=data, timeout=120,
        )
        r.raise_for_status()

    def _poll(self, publish_id: str, timeout: int = 300) -> str:
        body = {"publish_id": publish_id}
        deadline = time.time() + timeout
        while time.time() < deadline:
            r = requests.post(
                f"{BASE}/post/publish/status/fetch/",
                headers={**self._auth, "Content-Type": "application/json"},
                json=body, timeout=30,
            )
            r.raise_for_status()
            status = r.json().get("data", {}).get("status", "")
            if status in ("PUBLISH_COMPLETE", "FAILED"):
                return status
            time.sleep(5)
        return "TIMEOUT"

    def upload_video(self, path: str, privacy: str = "SELF_ONLY") -> dict:
        """อัปโหลดทีละ chunk แล้ว poll สถานะ. หมายเหตุ: ตัวอย่างใช้ chunk เดียว
        (ไฟล์วิดีโอ affiliate ทั่วไป < 64MB) — ขยายเป็น multi-chunk ตาม init ได้"""
        data = Path(path).read_bytes()
        init = self._init_upload(len(data))
        self._upload_chunk(init["upload_url"], data)
        status = self._poll(init["publish_id"])
        return {"publish_id": init["publish_id"], "status": status, "privacy": privacy}