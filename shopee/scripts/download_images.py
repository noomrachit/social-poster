"""Download images for collected products. No publishing or Shopee requests."""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config.config import load
from core.db import DB
from collector.images import ImageDownloader, ImageOptions


def downloader() -> ImageDownloader:
    return ImageDownloader(ImageOptions(
        root=Path(os.getenv("IMAGE_DIR", "assets/products")),
        allowed_hosts=tuple(h.strip().lower() for h in os.getenv("IMAGE_ALLOWED_HOSTS", "").split(",") if h.strip()),
        max_images=int(os.getenv("IMAGE_MAX_PER_PRODUCT", "6")),
    ))


def prepare(db: DB, product: dict, worker: ImageDownloader) -> list[str]:
    result = worker.download(product)
    paths = [image["path"] for image in result["images"]]
    db.save_images(product["item_id"], product["shop_id"], paths)
    if not paths:
        db.set_product_status(product["item_id"], product["shop_id"], "image_failed")
        raise ValueError("no usable images; inspect product manifest.json")
    return paths


def run(retry_failed: bool = False) -> dict:
    cfg = load()
    worker = downloader()
    db = DB(cfg.app.db_path)
    stats = {"ready": 0, "failed": 0}
    try:
        rows = db.list_products("image_failed" if retry_failed else "ready")
        for row in rows:
            product = dict(row)
            try:
                prepare(db, product, worker)
                db.set_product_status(product["item_id"], product["shop_id"], "ready")
                stats["ready"] += 1
            except ValueError:
                stats["failed"] += 1
    finally:
        db.close()
    return stats


if __name__ == "__main__":
    print(run("--retry-failed" in sys.argv))
