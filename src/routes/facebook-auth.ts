import { Router } from "express";
import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { encryptToken } from "../lib/crypto.js";
import { pool } from "../db/pool.js";
import { requireAdminQueryOrHeader, tokenMatches } from "../lib/admin-auth.js";
import { buildFacebookAuthUrl, exchangeCodeForPages } from "../lib/facebook-graph.js";
import { readCookie } from "./auth.js";

const STATE_COOKIE = "fb_oauth_state";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

/** ALLOWED_FB_PAGE_IDS=123,456 (ว่าง = เก็บทุกเพจ) */
export function isPageAllowed(pageId: string, env = process.env.ALLOWED_FB_PAGE_IDS): boolean {
  const list = (env ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length === 0 || list.includes(pageId);
}

export const facebookAuthRouter = Router();

facebookAuthRouter.get("/auth/facebook/start", requireAdminQueryOrHeader, (_req, res) => {
  let url: string;
  const state = randomBytes(32).toString("hex");
  try {
    url = buildFacebookAuthUrl(state);
  } catch (err: any) {
    res.status(500).send(err?.message ?? String(err));
    return;
  }
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || (process.env.APP_BASE_URL ?? "").startsWith("https://"),
    maxAge: STATE_MAX_AGE_MS,
    path: "/auth/facebook",
  });
  res.redirect(url);
});

facebookAuthRouter.get("/auth/facebook/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const expectedState = readCookie(req.headers.cookie, STATE_COOKIE) ?? "";
  res.clearCookie(STATE_COOKIE, { path: "/auth/facebook" });
  if (!state || !expectedState || !tokenMatches(state, expectedState)) {
    res.status(400).send("state ไม่ตรงหรือหมดอายุ — เริ่มใหม่ที่ /auth/facebook/start?token=<ADMIN_TOKEN>");
    return;
  }
  if (!code) {
    res.status(400).send(`ไม่ได้รับ code จาก Facebook ${req.query.error_description ?? ""}`);
    return;
  }
  try {
    const pages = (await exchangeCodeForPages(code)).filter((p) => isPageAllowed(p.id));
    if (pages.length === 0) {
      res.status(400).send("ไม่พบเพจที่อนุญาต — ตอนล็อกอินต้องติ๊กเลือกเพจด้วย");
      return;
    }
    for (const p of pages) {
      await pool.query(
        `INSERT INTO integrations (id, platform, display_name, external_account_id, access_token_enc, refresh_token_enc, token_expires_at)
         VALUES ($1, 'facebook', $2, $3, $4, NULL, NULL)
         ON CONFLICT (platform, external_account_id) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             access_token_enc = EXCLUDED.access_token_enc,
             token_expires_at = NULL,
             needs_reauth = false,
             last_error = NULL,
             updated_at = now()`,
        [nanoid(), p.name, p.id, encryptToken(p.access_token)]
      );
    }
    res.send(`เชื่อมเพจ Facebook สำเร็จ: ${pages.map((p) => p.name).join(", ")} ปิดหน้านี้ได้เลย`);
  } catch (err: any) {
    res.status(500).send(`เชื่อมไม่สำเร็จ: ${err?.message ?? err}`);
  }
});
