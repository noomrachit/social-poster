"""Exponential backoff + jitter + quota ledger helpers."""
from __future__ import annotations

import random
import time
from collections import defaultdict
from functools import wraps
from typing import Any, Callable

from .logger import get_logger

log = get_logger("ratelimit")


def backoff(retries: int = 4, base: float = 2.0, cap: float = 60.0,
            jitter: float = 0.5) -> Callable:
    """Retry decorator with exponential backoff + jitter.
    Re-raises on final failure; honours Retry-After header when present.
    """
    def deco(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            last_exc: Exception | None = None
            for attempt in range(retries):
                try:
                    return fn(*args, **kwargs)
                except Exception as exc:  # noqa: BLE001
                    last_exc = exc
                    retry_after = getattr(exc, "response", None)
                    delay = None
                    if retry_after is not None:
                        hdr = retry_after.headers.get("Retry-After")
                        if hdr:
                            try:
                                delay = float(hdr)
                            except ValueError:
                                delay = None
                    if delay is None:
                        delay = min(cap, base ** attempt)
                        delay += random.uniform(0, delay * jitter)
                    if attempt < retries - 1:
                        log.warning("retry %d/%d in %.1fs: %s",
                                    attempt + 1, retries - 1, delay, exc)
                        time.sleep(delay)
            assert last_exc is not None
            raise last_exc
        return wrapper
    return deco


class QuotaLedger:
    """นับหน่วย quota ที่ใช้ต่อวัน (สำหรับ YouTube) และหยุดเมื่อถึง threshold."""

    def __init__(self, daily_limit: int = 10_000, stop_at: float = 0.85):
        self.daily_limit = daily_limit
        self.stop_at = stop_at
        self._used: dict[str, int] = defaultdict(int)  # date_key -> units

    def _key(self) -> str:
        return time.strftime("%Y-%m-%d", time.gmtime())

    def track(self, units: int) -> None:
        self._used[self._key()] += units

    def used_today(self) -> int:
        return self._used[self._key()]

    def can_fire(self, units: int) -> bool:
        return self.used_today() + units <= int(self.daily_limit * self.stop_at)

    def reset_day(self) -> None:
        self._used.pop(self._key(), None)