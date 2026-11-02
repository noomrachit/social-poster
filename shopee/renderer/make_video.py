"""MoviePy renderer: ภาพสินค้าจริง + ข้อความซ้อน 10-20 วิ (9:16).

ฟอนต์ไทยต้อง bundle .ttf เอง (Noto Sans Thai / Sarabun) วางใน assets/fonts/
และระบุ path ตรง ๆ — ระวังได้กล่องสี่เหลี่ยมถ้าใช้ฟอนต์ประจำระบบ
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from moviepy import (  # noqa: E402
    ImageClip, TextClip, ColorClip, CompositeVideoClip,
    AudioFileClip, vfx,
)

from renderer.thai_text import wrap_thai, display_price  # noqa: E402

W, H, FPS, DUR = 1080, 1920, 30, 15

FONT_BOLD = Path("assets/fonts/NotoSansThai-Bold.ttf")
FONT_REG = Path("assets/fonts/NotoSansThai-Regular.ttf")


def _font(path: Path) -> str:
    if path.exists():
        return str(path.resolve())
    # fallback: ปล่อยให้ MoviePy ใช้ฟอนต์ default (จะขึ้นกล่องถ้าไม่มีไทย)
    return "DejaVu-Sans"


def _slide(img_path: str, headline: str, sub: str, start: float,
           dur: float, price: str = "") -> CompositeVideoClip:
    bg = (
        ImageClip(img_path)
        .resized(height=H)
        .cropped(width=W, height=H, x_center=W / 2, y_center=H / 2)
        .with_duration(dur)
        .with_effects([vfx.Resize(lambda t: 1 + 0.04 * t)])
    )

    scrim = (
        ColorClip((W, 480), color=(0, 0, 0))
        .with_opacity(0.55)
        .with_duration(dur)
        .with_position(("center", H - 640))
    )

    # ตัดคำไทยก่อนเข้า TextClip กันคำขาดกลางบรรทัด
    headline_lines = wrap_thai(headline, max_chars=24)
    headline_text = "\n".join(headline_lines)

    t1 = (
        TextClip(
            font=_font(FONT_BOLD), text=headline_text,
            font_size=72, color="white", method="caption",
            size=(W - 140, None), text_align="center",
            stroke_color="black", stroke_width=3,
        )
        .with_duration(dur)
        .with_position(("center", H - 620))
    )

    sub_text = sub
    if price:
        sub_text = f"{sub} {price}"
    t2 = (
        TextClip(
            font=_font(FONT_REG), text=sub_text,
            font_size=52, color="#FFD400", method="caption",
            size=(W - 160, None), text_align="center",
        )
        .with_duration(dur)
        .with_position(("center", H - 400))
    )

    return CompositeVideoClip([bg, scrim, t1, t2], size=(W, H)).with_start(start)


def render(product: dict[str, Any], out_path: str,
           images: dict[str, str], bgm_path: str | None = None) -> str:
    """product: มี name, price, bullet
    images: {"hook": path, "spec": path, "cta": path}
    คืน path ของวิดีโอที่ render เสร็จ"""
    price_baht = display_price(product.get("price", ""))
    headline = str(product.get("name", ""))[:60]
    bullet = str(product.get("bullet", "จุดเด่น"))[:80]

    clips = [
        _slide(images["hook"], headline, "ราคาจากข้อมูลสินค้า", 0, 5, price_baht),
        _slide(images["spec"], "รายละเอียดสินค้า", bullet, 5, 6),
        _slide(images["cta"], "ตรวจสอบราคาก่อนสั่งซื้อ", "ลิงก์แอฟฟิลิเอต มีค่าคอมมิชชัน", 11, 4),
    ]

    video = CompositeVideoClip(clips, size=(W, H)).with_duration(DUR)

    if bgm_path and Path(bgm_path).exists():
        bgm = AudioFileClip(bgm_path).subclipped(0, DUR)
        video = video.with_audio(bgm)

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    video.write_videofile(
        out_path, fps=FPS, codec="libx264", audio_codec="aac",
        preset="medium", threads=4,
    )
    return out_path
