"""Data-Check: ตรวจความครบถ้วน / ความซ้ำ / ความผิดปกติก่อนส่งต่อ.

ราคาเป็นบาท (THB) — ห้ามแปลงสกุลเงิน ห้ามปัดเศษเอง
สินค้าที่ไม่ผ่านจะถูกบันทึกแยกพร้อมเหตุผล (ไม่เดา ไม่เติมค่าเอง)
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from collector.images import extract_urls

REQUIRED_FIELDS = ("itemId", "imageUrl", "productName", "price", "offerLink")


@dataclass
class CheckResult:
    ok: bool
    product: dict[str, Any] | None = None
    reason: str = ""


def _num(v: Any) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def check(raw: dict[str, Any], min_rating: float = 4.0,
          min_sales: int = 1, image_paths: tuple[str, ...] = ("imageUrl",)) -> CheckResult:
    """คืน CheckResult.ok=True พร้อม product dict ที่ normalize แล้ว
    หรือ ok=False พร้อมเหตุผลกรณีไม่ผ่าน"""
    # ครบถ้วน
    missing = [f for f in REQUIRED_FIELDS if not raw.get(f)]
    if missing:
        return CheckResult(False, reason=f"missing fields: {missing}")

    item_id = raw.get("itemId")
    shop_id = raw.get("shopId") or raw.get("shop_id") or 0
    price = raw.get("price")
    rate = raw.get("commissionRate")
    rating = raw.get("ratingStar")
    sales = raw.get("sales")

    # ผิดปกติ: ราคา 0 / ติดลบ (เป็นบาท)
    pn = _num(price)
    if pn is None or pn <= 0:
        return CheckResult(False, reason=f"invalid price THB: {price}")

    # commission rate ต้องไม่เป็น 0 (ไม่งั้นไม่ได้ค่าคอม)
    rn = _num(rate)
    if rn is not None and rn <= 0:
        return CheckResult(False, reason=f"commissionRate=0 -> {rate}")

    # rating / sales ต่ำเกิน
    rt = _num(rating)
    if rt is not None and rt < min_rating:
        return CheckResult(False, reason=f"rating {rt} < {min_rating}")

    sl = _num(sales)
    if sl is not None and sl < min_sales:
        return CheckResult(False, reason=f"sales {sl} < {min_sales}")

    product = {
        "item_id": int(item_id),
        "shop_id": int(shop_id),
        "name": str(raw["productName"]),
        "price": str(price),  # เก็บเป็น str ตรงตาม API ไม่ปัดเศษ
        "image_url": str(raw["imageUrl"]),
        "image_urls": extract_urls(raw, image_paths),
        "offer_link": str(raw["offerLink"]),
        "product_link": str(raw.get("productLink") or ""),
        "commission_rate": str(rate) if rate is not None else "",
        "commission": str(raw.get("commission") or ""),
        "sales": int(sl) if sl is not None else 0,
        "rating": float(rt) if rt is not None else 0.0,
        "shop_name": str(raw.get("shopName") or ""),
        "local_image": "",
        "status": "ready",
        "first_seen": datetime.now(timezone.utc).isoformat(),
    }
    return CheckResult(True, product=product)
