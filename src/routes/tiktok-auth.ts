import { Router } from "express";
import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { pool } from "../db/pool.js";
import { requireAdminQueryOrHeader, tokenMatches } from "../lib/admin-auth.js";
import { readCookie } from "./auth.js";
import { buildAuthorizeUrl, exchangeCode, fetchUserInfo, makePkce, tiktokConfig, tokenColumns } from "../lib/tiktok.js";

const STATE_COOKIE = "tt_oauth_state";
const VERIFIER_COOKIE = "tt_oauth_verifier";
const MAX_AGE_MS = 10 * 60 * 1000;

export const tiktokAuthRouter = Router();

tiktokAuthRouter.get("/auth/tiktok/start", requireAdminQueryOrHeader, (_req, res) => {
  let cfg;
  try { cfg = tiktokConfig(); } catch (e: any) { res.status(500).send(e.message); return; }
  const state = randomBytes(32).toString("hex");
  const { verifier, challenge } = makePkce();
  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || cfg.redirectUri.startsWith("https://"),
    maxAge: MAX_AGE_MS,
    path: "/auth/tiktok",
  };
  res.cookie(STATE_COOKIE, state, opts);
  res.cookie(VERIFIER_COOKIE, verifier, opts);
  res.redirect(buildAuthorizeUrl(cfg.clientKey, cfg.redirectUri, state, challenge));
});

tiktokAuthRouter.get("/auth/tiktok/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const expected = readCookie(req.headers.cookie, STATE_COOKIE) ?? "";
  const verifier = readCookie(req.headers.cookie, VERIFIER_COOKIE) ?? "";
  res.clearCookie(STATE_COOKIE, { path: "/auth/tiktok" });
  res.clearCookie(VERIFIER_COOKIE, { path: "/auth/tiktok" });
  if (!state || !expected || !tokenMatches(state, expected) || !verifier) {
    res.status(400).send("state ไม่ตรงหรือหมดอายุ — เริ่มใหม่ที่ /auth/tiktok/start?token=<ADMIN_TOKEN>");
    return;
  }
  if (!code) {
    res.status(400).send(`Missing code${req.query.error ? `: ${String(req.query.error)}` : ""}`);
    return;
  }
  try {
    const tokens = await exchangeCode(code, verifier);
    const user = await fetchUserInfo(tokens.access_token);
    const cols = tokenColumns(tokens);
    await pool.query(
      `INSERT INTO integrations (id, platform, display_name, external_account_id, access_token_enc, refresh_token_enc, token_expires_at)
       VALUES ($1, 'tiktok', $2, $3, $4, $5, $6)
       ON CONFLICT (platform, external_account_id) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           access_token_enc = EXCLUDED.access_token_enc,
           refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, integrations.refresh_token_enc),
           token_expires_at = EXCLUDED.token_expires_at,
           needs_reauth = false,
           last_error = NULL,
           updated_at = now()`,
      [nanoid(), user.display_name || "TikTok", user.open_id, cols.access_token_enc, cols.refresh_token_enc, cols.token_expires_at]
    );
    res.send(`เชื่อม TikTok "${user.display_name ?? user.open_id}" สำเร็จแล้ว ปิดหน้านี้ได้เลย`);
  } catch (err: any) {
    res.status(500).send(`เชื่อมไม่สำเร็จ: ${err?.message ?? err}`);
  }
});
