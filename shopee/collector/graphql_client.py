"""Thin GraphQL client for Shopee Affiliate Open API (Thailand)."""
from __future__ import annotations

import json
import time
from typing import Any

import requests

from core.ratelimit import backoff
from collector.sign import _canonical_payload, build_auth_header


class ShopeeAffiliateClient:
    def __init__(self, app_id: str, app_secret: str, url: str,
                 timeout: int = 30):
        self.app_id = app_id
        self.secret = app_secret
        self.url = url
        self.timeout = timeout

    @backoff(retries=4)
    def call(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = _canonical_payload(query, variables)
        ts = int(time.time())
        auth, _ = build_auth_header(self.app_id, self.secret, payload, ts)
        headers = {
            "Content-Type": "application/json",
            "Authorization": auth,
        }
        r = requests.post(self.url, data=payload.encode("utf-8"),
                          headers=headers, timeout=self.timeout)
        r.raise_for_status()
        body = r.json()
        if body.get("errors"):
            raise RuntimeError(json.dumps(body["errors"], ensure_ascii=False))
        return body.get("data", {})