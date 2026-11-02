"""Orchestrator: collect -> render -> (approve) -> publish.

หลักการ Human-in-the-loop: ถ้า APPROVAL_REQUIRED=true จะเรนเดอร์ + เตรียม metadata
แต่หยุดรอ approve ก่อนโพสต์ (publish status = pending, รอคนกดยืนยัน)
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config.config import load  # noqa: E402
from core.db import DB  # noqa: E402
from core.logger import get_logger  # noqa: E402
from collector.fetch_products import run as collect  # noqa: E402
from collector.images import select_scenes
from scripts.download_images import downloader, prepare
from renderer.make_video import render as render_video  # noqa: E402
from renderer import qa  # noqa: E402

log = get_logger("pipeline")


def run() -> dict:
    cfg = load()
    worker = downloader()  # Validate host configuration before any API requests.

    # 1) collect
    stats = collect()
    db = DB(cfg.app.db_path)

    # 2) render
    rendered = 0
    for row in db.list_products("ready"):
        product = dict(row)
        key = f"{product['item_id']}:{product['shop_id']}"
        out_path = str(cfg.app.output_dir / f"{key}.mp4")

        product["bullet"] = "ตรวจสอบรายละเอียดและราคาปัจจุบันก่อนสั่งซื้อ"
        try:
            paths = prepare(db, product, worker)
        except ValueError as exc:
            log.warning("image download failed %s: %s", key, exc)
            continue
        try:
            render_video(product, out_path, select_scenes(paths))
            ok, reason = qa.check_video(out_path)
            if not ok:
                log.warning("QA fail %s: %s", key, reason)
                db.set_product_status(product["item_id"], product["shop_id"], "rejected")
                continue
        except Exception as exc:  # noqa: BLE001
            log.error("render fail %s: %s", key, exc)
            db.set_product_status(product["item_id"], product["shop_id"], "rejected")
            continue

        db.add_render(key, out_path, "done")
        db.set_product_status(product["item_id"], product["shop_id"], "rendered")

        # 3) สร้าง publish entries เป็น pending (รอ approve)
        for platform in ("tiktok", "youtube"):
            privacy = "private" if platform == "youtube" else "SELF_ONLY"
            db.add_publish(key, platform, out_path, status="pending", privacy=privacy)
        rendered += 1

    db.close()
    log.info("pipeline: %s", {**stats, "rendered": rendered})
    return {**stats, "rendered": rendered}


if __name__ == "__main__":
    print(run())
