"""YouTube Data API v3 upload (Shorts) พร้อม quota ledger.

videos.insert = 1,600 units (ตามตารางทางการ) => ~6 อัปโหลด/วัน/โปรเจกต์
ออกแบบให้ check quota ก่อนยิง และหยุดที่ 85% (ดู QuotaLedger)
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

from core.ratelimit import QuotaLedger

INSERT_COST = 1600


class YouTubeClient:
    def __init__(self, client_id: str, client_secret: str, refresh_token: str,
                 category_id: str = "22"):
        self.creds = Credentials(
            token=None, refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id, client_secret=client_secret,
            scopes=["https://www.googleapis.com/auth/youtube.upload"],
        )
        self.category_id = category_id
        self.ledger = QuotaLedger()
        self._service = None

    def _svc(self):
        if self._service is None:
            self.creds.refresh(Request())
            self._service = build("youtube", "v3", credentials=self.creds)
        return self._service

    def upload_shorts(self, path: str, title: str, description: str,
                      tags: list[str], privacy: str = "private") -> dict:
        if not self.ledger.can_fire(INSERT_COST):
            raise RuntimeError("quota near limit — เลื่อนไปวันถัดไป")

        short_title = title[:100] + " #Shorts"
        body = {
            "snippet": {
                "title": short_title,
                "description": description[:5000],
                "tags": tags[:15],
                "categoryId": self.category_id,
            },
            "status": {
                "privacyStatus": privacy,
                "selfDeclaredMadeForKids": False,
            },
        }
        media = MediaFileUpload(
            path, chunksize=8 * 1024 * 1024, resumable=True, mimetype="video/mp4"
        )
        req = self._svc().videos().insert(
            part="snippet,status", body=body, media_body=media
        )
        self.ledger.track(INSERT_COST)

        resp: dict[str, Any] | None = None
        while resp is None:
            status, resp = req.next_chunk()
            if status:
                # status.progress() ไว้ log upload progress ได้
                pass
        return {"video_id": resp.get("id"), "privacy": privacy}