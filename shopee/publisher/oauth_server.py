"""OAuth authorization flows (local, ใช้ครั้งเดียวเพื่อขอ token) แล้วเก็บ refresh token.

- TikTok: authorization code + PKCE (Content Posting API) -> access + refresh
- YouTube: Google OAuth consent -> refresh token (เก็บใน secret store)

หมายเหตุ: ไฟล์นี้คือโครงร่างสำหรับรันบนเครื่องมีเบราว์เซอร์ ครั้งเดียว
ไม่ใช่ endpoint สำหรับ production ที่รับผู้ใช้หลายคน
"""
from __future__ import annotations

import hashlib
import secrets
import webbrowser
from urllib.parse import urlencode

import requests

# ---------------- TikTok ----------------
TIKTOK_AUTH = "https://www.tiktok.com/v2/auth/authorize/"
TIKTOK_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/"


def tiktok_flow(client_key: str, redirect_uri: str) -> str:
    """สร้าง authorization URL (client key ต้องเลือก Content Posting + Login Kit)"""
    state = secrets.token_urlsafe(16)
    code_verifier = secrets.token_urlsafe(64)
    code_challenge = hashlib.sha256(code_verifier.encode()).hexdigest()
    params = urlencode({
        "client_key": client_key,
        "scope": "user.info.basic,video.publish",
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    })
    print("code_verifier (เก็บไว้ใช้ตอนแลก token):", code_verifier)
    webbrowser.open(f"{TIKTOK_AUTH}?{params}")
    return code_verifier


def tiktok_exchange(client_key: str, client_secret: str, redirect_uri: str,
                    code: str, code_verifier: str) -> dict:
    r = requests.post(
        TIKTOK_TOKEN,
        data={
            "client_key": client_key,
            "client_secret": client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
            "code_verifier": code_verifier,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


# ---------------- YouTube / Google ----------------
def google_flow(client_id: str, client_secret: str, refresh_token: str) -> str:
    """โครงร่าง: ใช้ google-auth-oauthlib ทำ consent บนเครื่องมีเบราว์เซอร์.
    TODO: เชื่อม InstalledAppFlow.from_client_secrets_file + local server
    เพื่อขอ refresh token แล้ว print ให้ copy ไปเก็บใน .env"""
    raise NotImplementedError(
        "ใช้ InstalledAppFlow ขอ refresh token ครั้งเดียวบนเครื่องมีเบราว์เซอร์ "
        "แล้วเก็บ refresh token เข้า secret store"
    )