"""SQLite state store: products / renders / publishes."""
from __future__ import annotations

import sqlite3
import json
from datetime import datetime, timezone
from contextlib import contextmanager
from typing import Any, Iterator

_SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
    item_id       INTEGER NOT NULL,
    shop_id       INTEGER NOT NULL,
    name          TEXT,
    price         TEXT,
    image_url     TEXT,
    offer_link    TEXT,
    product_link  TEXT,
    commission_rate TEXT,
    commission    TEXT,
    sales         INTEGER DEFAULT 0,
    rating        REAL DEFAULT 0.0,
    shop_name     TEXT,
    local_image   TEXT,
    status        TEXT DEFAULT 'new',
    first_seen    TEXT,
    PRIMARY KEY (item_id, shop_id)
);

CREATE TABLE IF NOT EXISTS renders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_key TEXT NOT NULL,
    video_path TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT,
    error TEXT
);

CREATE TABLE IF NOT EXISTS publishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_key TEXT NOT NULL,
    platform TEXT NOT NULL,
    video_path TEXT,
    status TEXT DEFAULT 'pending',
    remote_id TEXT,
    privacy TEXT DEFAULT 'private',
    created_at TEXT,
    published_at TEXT,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_publishes_status ON publishes(status, platform);
"""


class DB:
    def __init__(self, path: str):
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        columns = {row[1] for row in self._conn.execute("PRAGMA table_info(products)")}
        for name in ("image_urls", "local_images"):
            if name not in columns:
                self._conn.execute(f"ALTER TABLE products ADD COLUMN {name} TEXT DEFAULT '[]'")
        self._conn.commit()

    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        try:
            yield self._conn
            self._conn.commit()
        except Exception:
            self._conn.rollback()
            raise

    # ---- products ----
    def upsert_product(self, p: dict[str, Any]) -> None:
        p = dict(p)
        p.setdefault("first_seen", datetime.now(timezone.utc).isoformat())
        p["image_urls"] = json.dumps(p.get("image_urls", [p["image_url"]]), ensure_ascii=False)
        with self._tx() as c:
            c.execute(
                """
                INSERT INTO products (item_id, shop_id, name, price, image_url,
                    offer_link, product_link, commission_rate, commission,
                    sales, rating, shop_name, local_image, status, first_seen, image_urls)
                VALUES (:item_id, :shop_id, :name, :price, :image_url,
                    :offer_link, :product_link, :commission_rate, :commission,
                    :sales, :rating, :shop_name, :local_image, :status, :first_seen, :image_urls)
                ON CONFLICT(item_id, shop_id) DO UPDATE SET
                    name=excluded.name, price=excluded.price,
                    image_url=excluded.image_url, offer_link=excluded.offer_link,
                    image_urls=excluded.image_urls
                """,
                p,
            )

    def save_images(self, item_id: int, shop_id: int, paths: list[str]) -> None:
        with self._tx() as c:
            c.execute("UPDATE products SET local_image=?, local_images=? WHERE item_id=? AND shop_id=?",
                      (paths[0] if paths else "", json.dumps(paths), item_id, shop_id))

    def list_products(self, status: str = "ready") -> list[sqlite3.Row]:
        return self._conn.execute(
            "SELECT * FROM products WHERE status=? ORDER BY first_seen", (status,)
        ).fetchall()

    def set_product_status(self, item_id: int, shop_id: int, status: str) -> None:
        with self._tx() as c:
            c.execute(
                "UPDATE products SET status=? WHERE item_id=? AND shop_id=?",
                (status, item_id, shop_id),
            )

    def product_seen_recently(self, item_id: int, shop_id: int, days: int) -> bool:
        row = self._conn.execute(
            "SELECT 1 FROM products WHERE item_id=? AND shop_id=? AND "
            "DATE(first_seen) >= DATE('now', ?)",
            (item_id, shop_id, f"-{days} days"),
        ).fetchone()
        return row is not None

    # ---- renders ----
    def add_render(self, product_key: str, video_path: str, status: str = "pending") -> int:
        with self._tx() as c:
            cur = c.execute(
                "INSERT INTO renders (product_key, video_path, status) VALUES (?,?,?)",
                (product_key, video_path, status),
            )
            return cur.lastrowid

    # ---- publishes ----
    def add_publish(self, product_key: str, platform: str, video_path: str,
                    status: str = "pending", privacy: str = "private") -> int:
        with self._tx() as c:
            cur = c.execute(
                "INSERT INTO publishes (product_key, platform, video_path, status, privacy) "
                "VALUES (?,?,?,?,?)",
                (product_key, platform, video_path, status, privacy),
            )
            return cur.lastrowid

    def list_publishes(self, status: str | None = None) -> list[sqlite3.Row]:
        if status:
            return self._conn.execute(
                "SELECT * FROM publishes WHERE status=? ORDER BY created_at", (status,)
            ).fetchall()
        return self._conn.execute(
            "SELECT * FROM publishes ORDER BY created_at"
        ).fetchall()

    def set_publish_status(self, publish_id: int, status: str,
                           remote_id: str = "", error: str = "") -> None:
        with self._tx() as c:
            c.execute(
                "UPDATE publishes SET status=?, remote_id=?, error=?, "
                "published_at=CASE WHEN ?='published' THEN datetime('now') "
                "ELSE published_at END WHERE id=?",
                (status, remote_id, error, status, publish_id),
            )

    def close(self) -> None:
        self._conn.close()
