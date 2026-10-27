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
