"""Fetch products from Shopee Affiliate API + Data-Check + store to DB."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config.config import load  # noqa: E402
from core.db import DB  # noqa: E402
from core.logger import get_logger  # noqa: E402
from collector.data_check import check, CheckResult  # noqa: E402
from collector.graphql_client import ShopeeAffiliateClient  # noqa: E402

log = get_logger("collector")

PRODUCTS_QUERY = """
query Fetch($page: Int!, $limit: Int!) {
  productOfferV2(listType: 0, sortType: 2, page: $page, limit: $limit) {
    nodes {
      itemId shopId productName imageUrl price sales ratingStar
      commission commissionRate shopName productLink offerLink
    }
    pageInfo { page limit hasNextPage }
  }
}
"""


def write_reject(reason: str, raw: dict) -> None:
    with open("rejects.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps({"reason": reason, "raw": raw}, ensure_ascii=False) + "\n")


def run(pages: int = 2, limit: int = 50, dedupe_days: int = 7,
        min_rating: float = 4.0) -> dict[str, int]:
    cfg = load()
    if not cfg.shopee.app_id or not cfg.shopee.app_secret:
        raise RuntimeError("SHOPEE_APP_ID / SHOPEE_APP_SECRET ไม่ครบ (กรอก .env ก่อน)")

    client = ShopeeAffiliateClient(
        cfg.shopee.app_id, cfg.shopee.app_secret, cfg.shopee.graphql_url
    )
    db = DB(cfg.app.db_path)
    stats = {"seen": 0, "ok": 0, "rejected": 0, "duplicate": 0}
    image_paths = tuple(p.strip() for p in os.getenv("SHOPEE_IMAGE_PATHS", "imageUrl").split(",") if p.strip())
    query_file = os.getenv("SHOPEE_PRODUCTS_QUERY_FILE", "")
    query = Path(query_file).read_text(encoding="utf-8") if query_file else PRODUCTS_QUERY

    try:
        for page in range(1, pages + 1):
            data = client.call(query, {"page": page, "limit": limit})
            offer = data.get("productOfferV2") or {}
            nodes = offer.get("nodes") or []
            page_info = offer.get("pageInfo") or {}

            for raw in nodes:
                stats["seen"] += 1
                item_id = raw.get("itemId")
                shop_id = raw.get("shopId") or raw.get("shop_id") or 0

                if dedupe_days > 0 and db.product_seen_recently(item_id, shop_id, dedupe_days):
                    stats["duplicate"] += 1
                    continue

                result: CheckResult = check(raw, min_rating=min_rating, image_paths=image_paths)
                if not result.ok:
                    stats["rejected"] += 1
                    write_reject(result.reason, raw)
                    continue

                db.upsert_product(result.product)
                stats["ok"] += 1

            if not page_info.get("hasNextPage"):
                break
    finally:
        db.close()

    log.info("collector done: %s", stats)
    return stats


if __name__ == "__main__":
    print(run())
