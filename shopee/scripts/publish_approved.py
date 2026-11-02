"""เผยแพร่เฉพาะรายการ publish ที่ status = approved แล้ว (Human-in-the-loop)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config.config import load  # noqa: E402
from core.db import DB  # noqa: E402
from core.logger import get_logger  # noqa: E402
from publisher.youtube import YouTubeClient  # noqa: E402
from publisher.tiktok import TikTokClient  # noqa: E402

log = get_logger("publish")


def run() -> dict:
    cfg = load()
    db = DB(cfg.app.db_path)
    count = {"tiktok": 0, "youtube": 0, "failed": 0}

    try:
        for row in db.list_publishes("approved"):
            publish = dict(row)
            pid = publish["id"]
            platform = publish["platform"]
            video = publish["video_path"]

            try:
                if platform == "tiktok":
                    client = TikTokClient(cfg.tiktok.access_token)
                    res = client.upload_video(video, privacy=publish["privacy"])
                    rid = res["publish_id"]
                else:
                    client = YouTubeClient(
                        cfg.google.client_id, cfg.google.client_secret,
                        cfg.google.refresh_token, cfg.google.category_id,
                    )
                    res = client.upload_shorts(
                        video,
                        title="สินค้าดีบอกต่อ #Shorts",
                        description="ลิงก์อยู่ในคอมเมนต์ (ลิงก์แอฟฟิลิเอต มีค่าคอมมิชชัน)",
                        tags=["shopee", "รีวิว", "ของดีบอกต่อ"],
                        privacy=publish["privacy"],
                    )
                    rid = res["video_id"]

                db.set_publish_status(pid, "published", remote_id=rid)
                count[platform] += 1
                log.info("published %s -> %s", platform, rid)
            except Exception as exc:  # noqa: BLE001
                db.set_publish_status(pid, "failed", error=str(exc))
                count["failed"] += 1
                log.error("publish fail %s: %s", platform, exc)
    finally:
        db.close()

    return count


if __name__ == "__main__":
    print(run())