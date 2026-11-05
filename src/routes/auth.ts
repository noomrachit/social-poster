import { Router } from "express";
import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { google } from "googleapis";
import { createGoogleOAuthClient, youtubeAuthUrlOptions } from "../lib/google-oauth.js";
import { encryptToken } from "../lib/crypto.js";
import { pool } from "../db/pool.js";
import { requireAdminQueryOrHeader, tokenMatches } from "../lib/admin-auth.js";

const STATE_COOKIE = "yt_oauth_state";
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 นาที

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** ALLOWED_YT_CHANNEL_IDS=UCxxx,UCyyy (ว่าง = อนุญาตทุกช่อง) */
export function isChannelAllowed(channelId: string, env = process.env.ALLOWED_YT_CHANNEL_IDS): boolean {
  const list = (env ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length === 0 || list.includes(channelId);
}

export const authRouter = Router();

// ขั้นที่ 1: เปิดหน้านี้ในเบราว์เซอร์เพื่อเริ่มเชื่อม YouTube
// ต้องใช้ ADMIN_TOKEN: /auth/youtube/start?token=<ADMIN_TOKEN> (หรือ header x-admin-token)
authRouter.get("/auth/youtube/start", requireAdminQueryOrHeader, (_req, res) => {
  const state = randomBytes(32).toString("hex");
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || (process.env.APP_BASE_URL ?? "").startsWith("https://"),
    maxAge: STATE_MAX_AGE_MS,
    path: "/auth/youtube",
  });
  const client = createGoogleOAuthClient();
  const url = client.generateAuthUrl(youtubeAuthUrlOptions(state)); // offline + consent → ได้ refresh_token
  res.redirect(url);
});

// ขั้นที่ 2: Google เรียกกลับมาที่นี่หลังผู้ใช้กดอนุญาต
authRouter.get("/auth/youtube/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const expectedState = readCookie(req.headers.cookie, STATE_COOKIE) ?? "";
  res.clearCookie(STATE_COOKIE, { path: "/auth/youtube" });
  if (!state || !expectedState || !tokenMatches(state, expectedState)) {
    res.status(400).send("state ไม่ตรงหรือหมดอายุ — เริ่มใหม่ที่ /auth/youtube/start?token=<ADMIN_TOKEN>");
    return;
  }
  if (!code) {
    res.status(400).send("Missing code");
    return;
  }

  try {
    const client = createGoogleOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token) {
      res.status(400).send("Google ไม่ได้ส่ง access_token กลับมา");
      return;
    }

    client.setCredentials(tokens);
    const youtube = google.youtube({ version: "v3", auth: client });
    const channelRes = await youtube.channels.list({ part: ["snippet"], mine: true });
    const channel = channelRes.data.items?.[0];
    if (!channel?.id) {
      res.status(400).send("หาช่อง YouTube ของบัญชีนี้ไม่เจอ");
      return;
    }
    if (!isChannelAllowed(channel.id)) {
      res.status(403).send(`ช่อง ${channel.id} ไม่อยู่ใน ALLOWED_YT_CHANNEL_IDS — ไม่ได้บันทึก`);
      return;
    }

    const id = nanoid();
    const saved = await pool.query(
      `INSERT INTO integrations (id, platform, display_name, external_account_id, access_token_enc, refresh_token_enc, token_expires_at)
       VALUES ($1, 'youtube', $2, $3, $4, $5, $6)
       ON CONFLICT (platform, external_account_id) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           access_token_enc = EXCLUDED.access_token_enc,
           refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, integrations.refresh_token_enc),
           token_expires_at = EXCLUDED.token_expires_at,
           needs_reauth = false,
           last_error = NULL,
           updated_at = now()
       RETURNING id, (refresh_token_enc IS NOT NULL) AS has_refresh`,
      [
        id,
        channel.snippet?.title ?? "YouTube channel",
        channel.id,
        encryptToken(tokens.access_token),
        tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      ]
    );

    if (!saved.rows[0]?.has_refresh) {
      res.status(400).send("เชื่อมแล้วแต่ Google ไม่ส่ง refresh_token — เข้า myaccount.google.com/permissions ลบสิทธิ์แอปนี้ แล้วเชื่อมใหม่");
      return;
    }
    res.send(`เชื่อมช่อง YouTube "${channel.snippet?.title}" สำเร็จแล้ว (integration ${saved.rows[0].id}) ปิดหน้านี้ได้เลย`);
  } catch (err: any) {
    res.status(500).send(`เชื่อมไม่สำเร็จ: ${err?.message ?? err}`);
  }
});
