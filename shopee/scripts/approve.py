"""CLI มือกด approve รายการ pending ก่อนโพสต์ (human review)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config.config import load  # noqa: E402
from core.db import DB  # noqa: E402


def list_pending() -> None:
    cfg = load()
    db = DB(cfg.app.db_path)
    rows = db.list_publishes("pending")
    if not rows:
        print("ไม่มีรายการรอ approve")
    for r in rows:
        print(f"[{r['id']}] {r['platform']:8s} {r['product_key']}  ({r['video_path']})")
    db.close()


def approve(publish_id: int) -> None:
    cfg = load()
    db = DB(cfg.app.db_path)
    db.set_publish_status(publish_id, "approved")
    db.close()
    print(f"approved #{publish_id} -> รัน scripts/publish_approved.py ต่อ")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "list":
        list_pending()
    elif len(sys.argv) > 1 and sys.argv[1].isdigit():
        approve(int(sys.argv[1]))
    else:
        print("ใช้: python scripts/approve.py list   หรือ   python scripts/approve.py <id>")