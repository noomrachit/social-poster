import { test } from "node:test";
import assert from "node:assert/strict";

// registry.ts → youtube.ts → db/pool.ts เช็ก DATABASE_URL ตอน import module (top-level) เลยต้องตั้งก่อน import
// (ไม่ได้เชื่อมต่อ DB จริงในเทสต์นี้ — แค่เลี่ยง throw ตอน import)
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.TOKEN_ENCRYPTION_KEY ??= "0".repeat(64);

const { providers } = await import("../providers/registry.js");

test("registry มีครบทั้ง 3 แพลตฟอร์ม", () => {
  assert.ok(providers.youtube);
  assert.ok(providers.facebook);
  assert.ok(providers.tiktok);
});

test("แต่ละ provider มี platform ตรงกับ key ของตัวเองใน registry", () => {
  for (const [key, provider] of Object.entries(providers)) {
    assert.equal(provider.platform, key);
  }
});

test("facebook/tiktok เป็น stub — publish ต้องคืน status error เสมอ (ยังไม่ผ่าน App Review)", async () => {
  const dummyIntegration = {
    id: "x",
    platform: "facebook",
    display_name: "x",
    external_account_id: "x",
    access_token_enc: "x",
    refresh_token_enc: null,
    token_expires_at: null,
  };
  const result = await providers.facebook.publish(dummyIntegration, { content: "test", mediaUrls: [] });
  assert.equal(result.status, "error");
});

test("youtube publish ส่ง privacyStatus เป็น private โดยค่าเริ่มต้น และใช้ค่าที่ระบุถ้ามี", async () => {
  const { google } = await import("googleapis");
  const calls: any[] = [];
  const origYoutube = google.youtube;
  const origFetch = globalThis.fetch;
  (google as any).youtube = () => ({ videos: { insert: async (args: any) => (calls.push(args), { data: { id: "vid" } }) } });
  globalThis.fetch = (async () =>
    new Response("x", { headers: { "content-type": "video/mp4" } })) as typeof fetch;
  process.env.GOOGLE_CLIENT_ID ??= "test-client";
  process.env.GOOGLE_CLIENT_SECRET ??= "test-secret";
  process.env.APP_BASE_URL ??= "http://localhost";
  const { encryptToken } = await import("../lib/crypto.js");
  const integration = {
    id: "x", platform: "youtube", display_name: "x", external_account_id: "x",
    access_token_enc: encryptToken("tok"), refresh_token_enc: null, token_expires_at: null,
  };
  try {
    await providers.youtube.publish(integration, { content: "t", mediaUrls: ["http://x/v.mp4"] });
    await providers.youtube.publish(integration, { content: "t", mediaUrls: ["http://x/v.mp4"], privacyStatus: "unlisted" });
  } finally {
    (google as any).youtube = origYoutube;
    globalThis.fetch = origFetch;
  }
  {
    assert.equal(calls.length, 2);
    assert.equal(calls[0].requestBody.status.privacyStatus, "private");
    assert.equal(calls[1].requestBody.status.privacyStatus, "unlisted");
  }
});
