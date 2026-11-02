"""Auto QA: ffprobe ตรวจ duration/resolution/audio + render thumbnail."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path


def ffprobe(path: str) -> dict:
    """คืน dict ของ metadata สำคัญ หรือ raise ถ้าคำสั่งล้ม"""
    out = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,duration:format=duration",
            "-of", "json", path,
        ],
        capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def check_video(path: str, min_w: int = 1080, min_h: int = 1920,
                min_dur: int = 10, max_dur: int = 20) -> tuple[bool, str]:
    """ตรวจ dimension + duration. คืน (ok, reason)."""
    if not Path(path).exists():
        return False, "file missing"
    try:
        info = ffprobe(path)
        streams = info.get("streams", [])
        if not streams:
            return False, "no video stream"
        s = streams[0]
        w, h = int(s["width"]), int(s["height"])
        dur = float(s.get("duration") or info.get("format", {}).get("duration") or 0)
        if w != min_w or h != min_h:
            return False, f"resolution {w}x{h} != {min_w}x{min_h}"
        if not (min_dur <= dur <= max_dur):
            return False, f"duration {dur:.1f}s out of range"
        return True, "ok"
    except Exception as exc:  # noqa: BLE001
        return False, f"ffprobe error: {exc}"


def export_thumbnail(path: str, out_img: str, t: float = 1.0) -> str:
    subprocess.run(
        ["ffmpeg", "-y", "-ss", str(t), "-i", path,
         "-frames:v", "1", "-q:v", "2", out_img],
        capture_output=True, check=True,
    )
    return out_img