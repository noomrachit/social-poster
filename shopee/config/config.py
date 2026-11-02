"""Central config loaded from environment (.env)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def _bool(v: str | None, default: bool = False) -> bool:
    if v is None:
        return default
    return v.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class ShopeeConfig:
    app_id: str = field(default_factory=lambda: os.getenv("SHOPEE_APP_ID", ""))
    app_secret: str = field(default_factory=lambda: os.getenv("SHOPEE_APP_SECRET", ""))
    graphql_url: str = field(
        default_factory=lambda: os.getenv(
            "SHOPEE_GRAPHQL_URL",
            "https://open-api.affiliate.shopee.co.th/graphql",
        )
    )


@dataclass
class TikTokConfig:
    client_key: str = field(default_factory=lambda: os.getenv("TIKTOK_CLIENT_KEY", ""))
    client_secret: str = field(default_factory=lambda: os.getenv("TIKTOK_CLIENT_SECRET", ""))
    redirect_uri: str = field(default_factory=lambda: os.getenv("TIKTOK_REDIRECT_URI", ""))
    access_token: str = field(default_factory=lambda: os.getenv("TIKTOK_ACCESS_TOKEN", ""))
    refresh_token: str = field(default_factory=lambda: os.getenv("TIKTOK_REFRESH_TOKEN", ""))
    open_id: str = field(default_factory=lambda: os.getenv("TIKTOK_OPEN_ID", ""))


@dataclass
class GoogleConfig:
    client_id: str = field(default_factory=lambda: os.getenv("GOOGLE_CLIENT_ID", ""))
    client_secret: str = field(default_factory=lambda: os.getenv("GOOGLE_CLIENT_SECRET", ""))
    refresh_token: str = field(default_factory=lambda: os.getenv("GOOGLE_REFRESH_TOKEN", ""))
    category_id: str = field(default_factory=lambda: os.getenv("YOUTUBE_CATEGORY_ID", "22"))


@dataclass
class AppConfig:
    db_path: str = field(default_factory=lambda: os.getenv("DATABASE_PATH", "state.db"))
    output_dir: Path = field(default_factory=lambda: Path(os.getenv("OUTPUT_DIR", "out")))
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))
    approval_required: bool = field(
        default_factory=lambda: _bool(os.getenv("APPROVAL_REQUIRED"), True)
    )
    discord_webhook: str = field(default_factory=lambda: os.getenv("DISCORD_WEBHOOK_URL", ""))


@dataclass
class Config:
    shopee: ShopeeConfig = field(default_factory=ShopeeConfig)
    tiktok: TikTokConfig = field(default_factory=TikTokConfig)
    google: GoogleConfig = field(default_factory=GoogleConfig)
    app: AppConfig = field(default_factory=AppConfig)


def load() -> Config:
    cfg = Config()
    cfg.app.output_dir.mkdir(parents=True, exist_ok=True)
    return cfg