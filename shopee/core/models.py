"""Dataclasses for the pipeline state."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Product:
    """สินค้าที่ผ่าน Data-Check แล้วพร้อมทำวิดีโอ."""
    item_id: int
    shop_id: int
    name: str
    price: str            # ราคาเป็นบาท เก็บเป็น str ตรงตาม API
    image_url: str
    offer_link: str
    product_link: str = ""
    commission_rate: str = ""
    commission: str = ""
    sales: int = 0
    rating: float = 0.0
    shop_name: str = ""
    local_image: str = ""  # path ภาพที่ดาวน์โหลดแล้ว
    status: str = "new"    # new | ready | rendered | published | rejected
    first_seen: str = field(default_factory=_now_iso)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Render:
    product_key: str       # item_id:shop_id
    video_path: str
    status: str = "pending"  # pending | done | failed
    created_at: str = field(default_factory=_now_iso)
    error: str = ""


@dataclass
class Publish:
    product_key: str
    platform: str          # tiktok | youtube
    video_path: str
    status: str = "pending"  # pending | approved | published | failed
    remote_id: str = ""
    privacy: str = "private"  # private | public | SELF_ONLY
    created_at: str = field(default_factory=_now_iso)
    published_at: str = ""
    error: str = ""