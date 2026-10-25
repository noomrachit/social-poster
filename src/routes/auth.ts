import { Router } from "express";
import { nanoid } from "nanoid";
import { google } from "googleapis";
import { createGoogleOAuthClient, YOUTUBE_SCOPES } from "../lib/google-oauth.js";
import { encryptToken } from "../lib/crypto.js";
import { pool } from "../db/pool.js";

export const authRouter = Router();

// ขั้นที่ 1: เปิดหน้านี้ในเบราว์เซอร์เพื่อเริ่มเชื่อม YouTube
authRouter.get("/auth/youtube/start", (_req, res) => {
  const client = createGoogleOAuthClient();
  const url = client.generateAuthUrl({
    access_type: "offline", // ต้องได้ refresh_token กลับมา
    prompt: "consent",
    scope: YOUTUBE_SCOPES,
  });
  res.redirect(url);
});

// ขั้นที่ 2: Google เรียกกลับมาที่นี่หลังผู้ใช้กดอนุญาต
authRouter.get("/auth/youtube/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
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

    const id = nanoid();
    await pool.query(
      `INSERT INTO integrations (id, platform, display_name, external_account_id, access_token_enc, refresh_token_enc, token_expires_at)
       VALUES ($1, 'youtube', $2, $3, $4, $5, $6)
       ON CONFLICT (platform, external_account_id) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           access_token_enc = EXCLUDED.access_token_enc,
           refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, integrations.refresh_token_enc),
           token_expires_at = EXCLUDED.token_expires_at,
           updated_at = now()`,
      [
        id,
        channel.snippet?.title ?? "YouTube channel",
        channel.id,
        encryptToken(tokens.access_token),
        tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      ]
    );

    res.send(`เชื่อมช่อง YouTube "${channel.snippet?.title}" สำเร็จแล้ว ปิดหน้านี้ได้เลย`);
  } catch (err: any) {
    res.status(500).send(`เชื่อมไม่สำเร็จ: ${err?.message ?? err}`);
  }
});
