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
from publisher.social_poster import SocialPosterClient  # noqa: E402

log = get_logger("publish")


TITLE = "สินค้าดีบอกต่อ #Shorts"
DESCRIPTION = "ลิงก์อยู่ในคอมเมนต์ (ลิงก์แอฟฟิลิเอต มีค่าคอมมิชชัน)"


def hand_off(cfg, db) -> dict:
    """ส่งรายการ approved ไปเป็นฉบับร่างใน social-poster; แพลตฟอร์มที่ยังไม่มีบัญชีเชื่อมไว้จะข้าม (คงสถานะ approved)"""
    client = SocialPosterClient(cfg.social_poster.url, cfg.social_poster.token)
    count = {"drafted": 0, "skipped": 0, "failed": 0}
    for row in db.list_publishes("approved"):
        publish = dict(row)
        pid, platform = publish["id"], publish["platform"]
        try:
            ids = [i["id"] for i in client.integrations(platform)]
            if not ids:
                count["skipped"] += 1
                log.warning("ข้าม %s (publish %s): ยังไม่มีบัญชีนี้ใน social-poster", platform, pid)
                continue
            url = client.upload_video(publish["video_path"])
            draft_id = client.create_draft(f"{TITLE}\n{DESCRIPTION}", url, ids, publish["privacy"])
            db.set_publish_status(pid, "drafted", remote_id=draft_id)
            count["drafted"] += 1
            log.info("drafted %s -> social-poster %s", platform, draft_id)
        except Exception as exc:  # noqa: BLE001
            db.set_publish_status(pid, "failed", error=str(exc))
            count["failed"] += 1
            log.error("hand-off fail %s: %s", platform, exc)
    return count


def run() -> dict:
    cfg = load()
    db = DB(cfg.app.db_path)
    if cfg.social_poster.enabled:
        try:
            return hand_off(cfg, db)
        finally:
            db.close()
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
                        title=TITLE,
                        description=DESCRIPTION,
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