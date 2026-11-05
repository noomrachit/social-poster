import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.TOKEN_ENCRYPTION_KEY ??= "0".repeat(64);
process.env.GOOGLE_CLIENT_ID ??= "cid";
process.env.GOOGLE_CLIENT_SECRET ??= "sec";
process.env.APP_BASE_URL ??= "http://localhost";

const { refreshAndPersist, ReauthRequiredError, youtubeProvider } = await import("../providers/youtube.js");
const { youtubeAuthUrlOptions, createGoogleOAuthClient } = await import("../lib/google-oauth.js");
const { encryptToken, decryptToken } = await import("../lib/crypto.js");
const { FbApiError, isFbAuthError } = await import("../lib/facebook-graph.js");
const { facebookProvider } = await import("../providers/facebook.js");
const { cancelPost, deletePost, updatePost } = await import("../lib/services.js");
const { pool } = await import("../db/pool.js");
const { google } = await import("googleapis");

const ytInteg = (over: any = {}) => ({ id: "Y1", platform: "youtube", display_name: "c", external_account_id: "UC1",
  access_token_enc: encryptToken("old"), refresh_token_enc: encryptToken("rt"), token_expires_at: new Date(Date.now() - 60e3).toISOString(), ...over });

test("auth url ขอ offline + consent (ได้ refresh_token)", () => {
  const u = new URL(createGoogleOAuthClient().generateAuthUrl(youtubeAuthUrlOptions("s")));
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("prompt"), "consent");
});

test("refreshAndPersist: refresh แล้วบันทึก token ใหม่ (เก็บ refresh_token เดิมถ้า Google ไม่ส่ง)", async () => {
  const q: any[] = [];
  const db = { query: async (...a: any[]) => (q.push(a), { rows: [] }) };
  await refreshAndPersist({ refreshAccessToken: async () => ({ credentials: { access_token: "NEW", expiry_date: 123456 } }) }, ytInteg(), db);
  assert.equal(q.length, 1);
  const [sql, params] = q[0];
  assert.match(sql, /COALESCE\(\$2, refresh_token_enc\)/);
  assert.equal(decryptToken(params[0]), "NEW");
  assert.equal(params[1], null);
  assert.equal(params[3], "Y1");
});

test("refreshAndPersist: invalid_grant / ไม่มี refresh_token → ReauthRequiredError", async () => {
  const db = { query: async () => ({ rows: [] }) };
  const bad = { refreshAccessToken: async () => { const e: any = new Error("invalid_grant"); e.response = { data: { error: "invalid_grant" } }; throw e; } };
  await assert.rejects(refreshAndPersist(bad, ytInteg(), db), ReauthRequiredError);
  await assert.rejects(refreshAndPersist(bad, ytInteg({ refresh_token_enc: null }), db), ReauthRequiredError);
});

test("youtube publish: refresh ล้ม → mark needs_reauth และไม่อัปโหลด", async () => {
  const q: string[] = []; const origQ = pool.query; (pool as any).query = async (s: string) => (q.push(s), { rows: [] });
  const origR = google.auth.OAuth2.prototype.refreshAccessToken;
  (google.auth.OAuth2.prototype as any).refreshAccessToken = async () => { const e: any = new Error("x"); e.response = { data: { error: "invalid_grant" } }; throw e; };
  try {
    const r = await youtubeProvider.publish(ytInteg(), { content: "t", mediaUrls: ["http://x/v.mp4"] });
    assert.equal(r.status, "error");
    assert.match(r.errorMessage!, /ต้องเชื่อมใหม่/);
    assert.ok(q.some((s) => /needs_reauth = true/.test(s)));
  } finally { (pool as any).query = origQ; (google.auth.OAuth2.prototype as any).refreshAccessToken = origR; }
});

test("isFbAuthError", () => {
  assert.ok(isFbAuthError(new FbApiError("Facebook API: Cannot call API for app 1 on behalf of user 2", 200)));
  assert.ok(isFbAuthError(new FbApiError("x", 190)));
  assert.ok(!isFbAuthError(new FbApiError("bad ratio", 100)));
});

test("facebook: auth error → ไม่ fallback ไป /videos, mark needs_reauth, ข้อความชัด", async () => {
  process.env.FB_APP_ID = "930751546638226"; process.env.FB_APP_SECRET = "s"; process.env.FB_REDIRECT_URI = "https://x/cb";
  const urls: string[] = []; const q: string[] = [];
  const origF = globalThis.fetch; const origQ = pool.query;
  (pool as any).query = async (s: string) => (q.push(s), { rows: [] });
  globalThis.fetch = (async (url: any) => {
    const s = String(url); urls.push(s);
    if (s.includes("debug_token")) return new Response(JSON.stringify({ data: { is_valid: true } }));
    return new Response(JSON.stringify({ error: { message: "Cannot call API for app 930751546638226 on behalf of user 29085592517728603", code: 200 } }), { status: 400 });
  }) as any;
  try {
    const r = await facebookProvider.publish({ id: "F1", platform: "facebook", display_name: "p", external_account_id: "P", access_token_enc: encryptToken("t"), refresh_token_enc: null, token_expires_at: null }, { content: "c", mediaUrls: ["u"] });
    assert.equal(r.status, "error");
    assert.match(r.errorMessage!, /ต้องเชื่อมใหม่/);
    assert.ok(!urls.some((u) => u.includes("/P/videos")));
    assert.ok(q.some((s) => /needs_reauth = true/.test(s)));
  } finally { globalThis.fetch = origF; (pool as any).query = origQ; }
});

test("facebook: debug_token is_valid=false → ไม่โพสต์", async () => {
  const urls: string[] = []; const origF = globalThis.fetch; const origQ = pool.query;
  (pool as any).query = async () => ({ rows: [] });
  globalThis.fetch = (async (url: any) => { urls.push(String(url)); return new Response(JSON.stringify({ data: { is_valid: false, error: { message: "Session invalidated" } } })); }) as any;
  try {
    const r = await facebookProvider.publish({ id: "F1", platform: "facebook", display_name: "p", external_account_id: "P", access_token_enc: encryptToken("t"), refresh_token_enc: null, token_expires_at: null }, { content: "c", mediaUrls: ["u"] });
    assert.equal(r.status, "error");
    assert.equal(urls.length, 1);
  } finally { globalThis.fetch = origF; (pool as any).query = origQ; }
});

function fakeDb(first: any[], second: any[] = []) {
  const calls: any[] = [];
  let n = 0;
  return { calls, query: async (sql: string, params?: any[]) => (calls.push({ sql, params }), { rows: n++ === 0 ? first : second }) };
}

test("cancelPost", async () => {
  let db = fakeDb([{ id: "p", status: "cancelled" }]);
  assert.deepEqual(await cancelPost("p", db), { ok: true, post: { id: "p", status: "cancelled" } });
  assert.match(db.calls[0].sql, /status IN \('draft', 'scheduled'\)/);
  db = fakeDb([], [{ status: "published" }]);
  assert.equal((await cancelPost("p", db) as any).reason, "not_cancellable");
  db = fakeDb([], []);
  assert.equal((await cancelPost("p", db) as any).reason, "not_found");
});

test("deletePost", async () => {
  assert.deepEqual(await deletePost("p", fakeDb([{ id: "p" }])), { ok: true, deleted: "p" });
  assert.equal((await deletePost("p", fakeDb([], [{ status: "publishing" }])) as any).reason, "publishing");
});

test("updatePost เปลี่ยนคลิป + เวลา", async () => {
  const when = new Date(Date.now() + 3600e3);
  const db = fakeDb([{ id: "p", status: "scheduled" }]);
  const r = await updatePost("p", { mediaUrls: ["https://x/v3.mp4"], scheduledAt: when }, db);
  assert.equal(r.ok, true);
  assert.equal(db.calls[0].params[1], JSON.stringify(["https://x/v3.mp4"]));
  assert.equal(db.calls[0].params[3], when);
  assert.equal((await updatePost("p", { content: "x" }, fakeDb([], [{ status: "published" }])) as any).reason, "not_editable");
});
