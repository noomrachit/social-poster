import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.TOKEN_ENCRYPTION_KEY ??= "0".repeat(64);

const { buildFacebookAuthUrl, FB_SCOPES } = await import("../lib/facebook-graph.js");
const { isPageAllowed } = await import("../routes/facebook-auth.js");
const { facebookProvider } = await import("../providers/facebook.js");
const { encryptToken } = await import("../lib/crypto.js");

test("auth url มี scope, state, redirect ครบ", () => {
  process.env.FB_APP_ID = "123";
  process.env.FB_APP_SECRET = "sec";
  process.env.FB_REDIRECT_URI = "https://x.test/auth/facebook/callback";
  const u = new URL(buildFacebookAuthUrl("st"));
  assert.equal(u.searchParams.get("client_id"), "123");
  assert.equal(u.searchParams.get("state"), "st");
  assert.equal(u.searchParams.get("redirect_uri"), "https://x.test/auth/facebook/callback");
  assert.deepEqual(u.searchParams.get("scope")!.split(","), FB_SCOPES);
  assert.ok(!FB_SCOPES.includes("publish_video"));
});

test("ALLOWED_FB_PAGE_IDS", () => {
  assert.equal(isPageAllowed("1", ""), true);
  assert.equal(isPageAllowed("1", "1,2"), true);
  assert.equal(isPageAllowed("3", "1,2"), false);
});

const integ = { id: "i", platform: "facebook", display_name: "p", external_account_id: "PAGE1",
  access_token_enc: encryptToken("PTOKEN"), refresh_token_enc: null, token_expires_at: null };

test("ไม่มีวิดีโอ → error", async () => {
  const r = await facebookProvider.publish(integ, { content: "x", mediaUrls: [] });
  assert.equal(r.status, "error");
});

test("Reel flow: start → upload(file_url) → finish พร้อม description", async () => {
  const calls: { url: string; init: any }[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const s = String(url);
    if (s.includes("rupload")) return new Response(JSON.stringify({ success: true }));
    const body = JSON.parse(init.body);
    if (body.upload_phase === "start") return new Response(JSON.stringify({ video_id: "V1", upload_url: "https://rupload.facebook.com/video-upload/v21.0/V1" }));
    return new Response(JSON.stringify({ success: true }));
  }) as any;
  try {
    const r = await facebookProvider.publish(integ, { content: "แคปชั่น", mediaUrls: ["https://cdn/x.mp4"] });
    assert.deepEqual(r, { status: "success", remotePostId: "V1" });
    assert.equal(calls.length, 3);
    assert.ok(calls[0].url.includes("/PAGE1/video_reels"));
    assert.equal(calls[1].init.headers.file_url, "https://cdn/x.mp4");
    assert.equal(calls[1].init.headers.Authorization, "OAuth PTOKEN");
    const fin = JSON.parse(calls[2].init.body);
    assert.equal(fin.video_state, "PUBLISHED");
    assert.equal(fin.description, "แคปชั่น");
  } finally { globalThis.fetch = orig; }
});

test("Reel ล้ม → fallback /videos; ล้มทั้งคู่ → error", async () => {
  const orig = globalThis.fetch;
  let videosOk = true;
  globalThis.fetch = (async (url: any) => {
    const s = String(url);
    if (s.includes("video_reels")) return new Response(JSON.stringify({ error: { message: "bad ratio" } }), { status: 400 });
    if (s.includes("/videos") && videosOk) return new Response(JSON.stringify({ id: "VID9" }));
    return new Response(JSON.stringify({ error: { message: "nope" } }), { status: 400 });
  }) as any;
  const warn = console.warn; console.warn = () => {};
  try {
    assert.deepEqual(await facebookProvider.publish(integ, { content: "c", mediaUrls: ["u"] }), { status: "success", remotePostId: "VID9" });
    videosOk = false;
    const r = await facebookProvider.publish(integ, { content: "c", mediaUrls: ["u"] });
    assert.equal(r.status, "error");
    assert.match(r.errorMessage!, /nope/);
  } finally { globalThis.fetch = orig; console.warn = warn; }
});
