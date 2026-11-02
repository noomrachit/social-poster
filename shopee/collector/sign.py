"""Shopee Affiliate GraphQL HMAC-SHA256 signature (Thailand).

หมายเหตุ (ตามกติกา Source-Control): รูปแบบ Authorization string และลำดับ
field ที่ใช้เซ็น signature ด้านล่างอ้างจากแนวทางฝั่ง Shopee Open API
ที่ตรวจสอบได้จากแหล่งไม่เป็นทางการ — ต้องเทียบกับเอกสารหน้า
`affiliate.shopee.co.th/open_api` ของบัญชีไทยคุณเองก่อนใช้งานจริง
(ดูหัวข้อ "ยังยืนยันไม่ได้" ในเอกสารแผนงาน)
"""
from __future__ import annotations

import hashlib
import json
import time
from typing import Any


def _canonical_payload(query: str, variables: dict[str, Any] | None) -> str:
    body: dict[str, Any] = {"query": query}
    if variables:
        body["variables"] = variables
    return json.dumps(body, separators=(",", ":"), ensure_ascii=False)


def build_signature(app_id: str, secret: str, payload: str, ts: int) -> str:
    """base = app_id + timestamp + payload + secret แล้ว sha256 hex."""
    base = f"{app_id}{ts}{payload}{secret}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def build_auth_header(app_id: str, secret: str, payload: str,
                      ts: int | None = None) -> tuple[str, int]:
    ts = ts if ts is not None else int(time.time())
    sign = build_signature(app_id, secret, payload, ts)
    header = f"SHA256 Credential={app_id}, Timestamp={ts}, Signature={sign}"
    return header, ts