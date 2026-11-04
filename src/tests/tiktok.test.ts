import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.TOKEN_ENCRYPTION_KEY ??= "0".repeat(64);
process.env.TIKTOK_CLIENT_KEY = "ck";
process.env.TIKTOK_CLIENT_SECRET = "cs";
process.env.APP_BASE_URL = "https://app.test";

const lib = await import("../lib/tiktok.js");
const tp = await import("../providers/tiktok.js");
const { encryptToken } = await import("../lib/crypto.js");

const MB = 1024 * 1024;

test("PKCE + authorize URL", () => {
  const { verifier, challenge } = lib.makePkce();
  assert.equal(challenge, createHash("sha256").update(verifier).digest("hex"));
  const u = new URL(lib.buildAuthorizeUrl("ck", "https://app.test/auth/tiktok/callback", "st", challenge));
  assert.equal(u.origin + u.pathname, "https://www.tiktok.com/v2/auth/authorize/");
  assert.equal(u.searchParams.get("scope"), "user.info.basic,video.upload,video.publish");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("state"), "st");
});

test("chunk plan ตามกฎ TikTok", () => {
  assert.deepEqual(tp.planChunks(10 * MB), { chunkSize: 10 * MB, total: 1 });
  assert.deepEqual(tp.planChunks(63 * MB), { chunkSize: 63 * MB, total: 1 });
  const p = tp.planChunks(105 * MB);
  assert.deepEqual(p, { chunkSize: 10 * MB, total: 10 });
  const r = tp.chunkRanges(105 * MB, p.chunkSize, p.total);
  assert.equal(r.at(-1)!.end, 105 * MB - 1);
  assert.ok(r.at(-1)!.end - r.at(-1)!.start + 1 <= 128 * MB);
});

test("privacy: ใช้ค่าที่ขอถ้าอนุญาต ไม่งั้น SELF_ONLY", () => {
  assert.equal(tp.choosePrivacy("PUBLIC_TO_EVERYONE", ["SELF_ONLY"]), "SELF_ONLY");
  assert.equal(tp.choosePrivacy("PUBLIC_TO_EVERYONE", ["PUBLIC_TO_EVERYONE", "SELF_ONLY"]), "PUBLIC_TO_EVERYONE");
  assert.equal(tp.choosePrivacy(undefined, ["PUBLIC_TO_EVERYONE"]), "SELF_ONLY");
});

test("exchangeCode ส่ง code_verifier และ secret แบบ form", async () => {
  let body = "";
  const f: any = async (_u: string, init: any) => { body = init.body; return new Response(JSON.stringify({ access_token: "a", refresh_token: "r", expires_in: 86400, open_id: "o" })); };
  const t = await lib.exchangeCode("cd", "ver", f);
  assert.equal(t.access_token, "a");
  const p = new URLSearchParams(body);
  assert.equal(p.get("code_verifier"), "ver");
  assert.equal(p.get("grant_type"), "authorization_code");
  assert.equal(p.get("redirect_uri"), "https://app.test/auth/tiktok/callback");
});

test("fetchUserInfo", async () => {
  const f: any = async (u: string) => {
    assert.match(u, /fields=open_id,display_name,avatar_url/);
    return new Response(JSON.stringify({ data: { user: { open_id: "o1", display_name: "pora" } }, error: { code: "ok" } }));
  };
  assert.equal((await lib.fetchUserInfo("tok", f)).display_name, "pora");
});

function integration(expiresInMs: number): any {
  return {
    id: "i1", platform: "tiktok", display_name: "pora", external_account_id: "o1",
    access_token_enc: encryptToken("old"), refresh_token_enc: encryptToken("rt"),
    token_expires_at: new Date(Date.now() + expiresInMs).toISOString(),
  };
}

test("publish: refresh token, init, chunk PUT, poll status", async () => {
  const calls: Array<{ url: string; init?: any }> = [];
  const video = Buffer.alloc(1000, 1);
  const f: any = async (url: string, init?: any) => {
    calls.push({ url, init });
    if (url.endsWith("/v2/oauth/token/")) return new Response(JSON.stringify({ access_token: "new", refresh_token: "rt2", expires_in: 86400 }));
    if (url.endsWith("/creator_info/query/")) return new Response(JSON.stringify({ data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } }));
    if (url === "https://media.test/v.mp4") return new Response(video, { headers: { "content-type": "video/mp4" } });
    if (url.endsWith("/video/init/")) return new Response(JSON.stringify({ data: { publish_id: "p1", upload_url: "https://up.test/u" }, error: { code: "ok" } }));
    if (url === "https://up.test/u") return new Response(null, { status: 201 });
    if (url.endsWith("/status/fetch/")) {
      const n = calls.filter((c) => c.url.endsWith("/status/fetch/")).length;
      return new Response(JSON.stringify({ data: n < 2 ? { status: "PROCESSING_UPLOAD" } : { status: "PUBLISH_COMPLETE" }, error: { code: "ok" } }));
    }
    throw new Error("unexpected " + url);
  };
  let saved: any = null;
  const provider = tp.createTiktokProvider({ fetch: f, sleep: async () => {}, saveTokens: async (_id, c) => { saved = c; }, pollAttempts: 5 });
  const r = await provider.publish(integration(60_000), { content: "x".repeat(3000), mediaUrls: ["https://media.test/v.mp4"], privacyStatus: "public" });
  assert.equal(r.status, "success", r.errorMessage);
  assert.equal(r.remotePostId, "p1");
  assert.ok(saved?.access_token_enc);
  const init = JSON.parse(calls.find((c) => c.url.endsWith("/video/init/"))!.init.body);
  assert.equal(init.post_info.privacy_level, "SELF_ONLY");
  assert.equal(init.post_info.title.length, 2200);
  assert.deepEqual(init.source_info, { source: "FILE_UPLOAD", video_size: 1000, chunk_size: 1000, total_chunk_count: 1 });
  const put = calls.find((c) => c.url === "https://up.test/u")!;
  assert.equal(put.init.headers["Content-Range"], "bytes 0-999/1000");
  assert.match(calls.find((c) => c.url.endsWith("/creator_info/query/"))!.init.headers.Authorization, /Bearer new/);
});

test("publish: FAILED status คืน error", async () => {
  const f: any = async (url: string) => {
    if (url.endsWith("/creator_info/query/")) return new Response(JSON.stringify({ data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } }));
    if (url.startsWith("https://media.test")) return new Response(Buffer.alloc(10), { headers: { "content-type": "video/mp4" } });
    if (url.endsWith("/video/init/")) return new Response(JSON.stringify({ data: { publish_id: "p", upload_url: "https://up.test/u" }, error: { code: "ok" } }));
    if (url === "https://up.test/u") return new Response(null, { status: 200 });
    return new Response(JSON.stringify({ data: { status: "FAILED", fail_reason: "spam" }, error: { code: "ok" } }));
  };
  const provider = tp.createTiktokProvider({ fetch: f, sleep: async () => {}, saveTokens: async () => {}, pollAttempts: 3 });
  const r = await provider.publish(integration(86_400_000), { content: "hi", mediaUrls: ["https://media.test/v"] });
  assert.equal(r.status, "error");
  assert.match(r.errorMessage!, /spam/);
});

test("publish: ไม่มีวิดีโอ", async () => {
  const r = await tp.tiktokProvider.publish(integration(86_400_000), { content: "x", mediaUrls: [] });
  assert.equal(r.status, "error");
});
