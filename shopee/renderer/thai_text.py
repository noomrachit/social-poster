"""Thai text helpers: word tokenize + line wrapping for TextClip.

ไทยไม่มีเว้นวรรค ต้องตัดคำด้วย pythainlp แล้วประกอบบรรทัดเอง
เพื่อกันข้อความขาดกลางคำ / กล่องสี่เหลี่ยมจากฟอนต์ที่ไม่มีไทย
"""
from __future__ import annotations

from functools import lru_cache

from pythainlp.tokenize import word_tokenize

try:
    from pythainlp import thai_word_tokenize as _fast
except ImportError:  # pragma: no cover
    _fast = None


@lru_cache(maxsize=2048)
def _tokens(text: str) -> tuple[str, ...]:
    tokenizer = _fast or word_tokenize
    return tuple(tokenizer(text, keep_whitespace=False))


def display_price(raw_price: str) -> str:
    """ราคาเป็นบาท -> '฿1,290' ห้ามปัดเศษเอง ห้ามแปลงสกุลเงิน."""
    try:
        return f"฿{int(float(raw_price)):,}"
    except (TypeError, ValueError):
        return ""


def wrap_thai(text: str, max_chars: int = 28) -> list[str]:
    """ตัดคำไทยแล้วต่อบรรทัดให้ยาวไม่เกิน max_chars."""
    lines: list[str] = []
    cur = ""
    for tok in _tokens(text):
        # ขึ้นบรรทัดใหม่เมื่อเกิน หรือเจอ newline ที่ส่งเข้ามา
        if "\n" in tok:
            for part in tok.split("\n"):
                lines.append(cur + part)
                cur = ""
            continue
        if len(cur) + len(tok) <= max_chars:
            cur += tok
        else:
            if cur:
                lines.append(cur)
            cur = tok
    if cur:
        lines.append(cur)
    return lines or [""]