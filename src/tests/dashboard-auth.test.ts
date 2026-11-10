import { test } from "node:test";
import assert from "node:assert/strict";
import { isDashboardAllowed, requireAdminOrDashboard } from "../lib/dashboard-auth.js";
import { corsAllowlist, parseCorsOrigins } from "../lib/cors.js";

function run(opts: { admin?: string; dash?: string; method?: string; url?: string; body?: any }) {
  let status = 200;
  let nextCalled = false;
  const headers: Record<string, string | undefined> = { "x-admin-token": opts.admin, "x-dashboard-token": opts.dash };
  const req: any = {
    method: opts.method ?? "GET",
    originalUrl: opts.url ?? "/posts",
    body: opts.body,
    header: (n: string) => headers[n.toLowerCase()],
  };
  const res: any = { status(c: number) { status = c; return this; }, json() { return this; } };
  requireAdminOrDashboard(req, res, () => { nextCalled = true; });
  return { status, nextCalled, req };
}

test("ADMIN_TOKEN เดิมยังเข้าได้ทุกเส้นทาง/ทุก method", () => {
  process.env.ADMIN_TOKEN = "admin-x";
  process.env.DASHBOARD_TOKEN = "dash-x";
  assert.equal(run({ admin: "admin-x", method: "DELETE", url: "/posts/1" }).nextCalled, true);
  assert.equal(run({ admin: "admin-x", method: "POST", url: "/posts", body: { mode: "now" } }).nextCalled, true);
  assert.equal(run({ admin: "wrong" }).status, 401);
  assert.equal(run({}).status, 401);
});

test("DASHBOARD_TOKEN เข้าได้เฉพาะเส้นทางที่อนุญาต", () => {
  process.env.ADMIN_TOKEN = "admin-x";
  process.env.DASHBOARD_TOKEN = "dash-x";
  assert.equal(run({ dash: "dash-x", url: "/integrations" }).nextCalled, true);
  assert.equal(run({ dash: "dash-x", url: "/posts?x=1" }).nextCalled, true);
  assert.equal(run({ dash: "dash-x", url: "/posts/abc" }).nextCalled, true);
  assert.equal(run({ dash: "dash-x", method: "POST", url: "/media" }).nextCalled, true);
});

test("DASHBOARD_TOKEN ถูกปฏิเสธ 403 กับเส้นทาง/เมธอดอื่น", () => {
  process.env.DASHBOARD_TOKEN = "dash-x";
  const cases: [string, string][] = [
    ["DELETE", "/posts/1"], ["PATCH", "/posts/1"], ["POST", "/posts/1/publish"], ["POST", "/posts/1/cancel"],
    ["POST", "/posts/1/media"], ["POST", "/posts/import/yingad"], ["DELETE", "/integrations/1"],
    ["GET", "/analytics"], ["POST", "/studio-api/draft"], ["POST", "/tts"], ["GET", "/agents-api/config"],
    ["POST", "/POSTS/1/PUBLISH"], ["GET", "/posts/1/publish"], ["POST", "/integrations"],
  ];
  for (const [method, url] of cases) {
    const r = run({ dash: "dash-x", method, url, body: { mode: "draft" } });
    assert.equal(r.status, 403, `${method} ${url}`);
    assert.equal(r.nextCalled, false);
  }
});

test("DASHBOARD_TOKEN ผิดหรือไม่ได้ตั้งค่า = 401", () => {
  process.env.DASHBOARD_TOKEN = "dash-x";
  assert.equal(run({ dash: "nope" }).status, 401);
  delete process.env.DASHBOARD_TOKEN;
  const r = run({ dash: "dash-x", url: "/posts" });
  assert.equal(r.status, 401);
  assert.equal(r.nextCalled, false);
  assert.equal(run({ dash: "" }).status, 401);
});

test("POST /posts ด้วย DASHBOARD_TOKEN: ต้อง draft/schedule และ privacyStatus เป็น private เสมอ", () => {
  process.env.DASHBOARD_TOKEN = "dash-x";
  for (const body of [{ mode: "now" }, {}, undefined, { mode: "publish" }]) {
    const r = run({ dash: "dash-x", method: "POST", url: "/posts", body: body ? { content: "x", ...body } : body });
    assert.equal(r.status, 403);
    assert.equal(r.nextCalled, false);
  }
  const ok = run({ dash: "dash-x", method: "POST", url: "/posts", body: { content: "x", mode: "draft" } });
  assert.equal(ok.nextCalled, true);
  assert.equal(ok.req.body.privacyStatus, "private");
  for (const ps of ["public", "unlisted", "private", "garbage"]) {
    const r = run({ dash: "dash-x", method: "POST", url: "/posts", body: { content: "x", mode: "schedule", privacyStatus: ps } });
    assert.equal(r.nextCalled, true);
    assert.equal(r.req.body.privacyStatus, "private", `ส่ง ${ps} ต้องถูกทับเป็น private`);
  }
  // ADMIN_TOKEN ไม่ถูกบังคับ
  process.env.ADMIN_TOKEN = "admin-x";
  const adm = run({ admin: "admin-x", method: "POST", url: "/posts", body: { content: "x", mode: "now", privacyStatus: "public" } });
  assert.equal(adm.req.body.privacyStatus, "public");
});

test("isDashboardAllowed: / ท้ายและ query ไม่ทำให้หลุด allowlist", () => {
  assert.equal(isDashboardAllowed("GET", "/posts/"), true);
  assert.equal(isDashboardAllowed("GET", "/posts/a/b"), false);
  assert.equal(isDashboardAllowed("PUT", "/posts"), false);
});

function runCors(origin: string | undefined, method = "GET") {
  const h: Record<string, string> = {};
  let status = 0;
  let ended = false;
  let nextCalled = false;
  const req: any = { method, header: (n: string) => (n.toLowerCase() === "origin" ? origin : undefined) };
  const res: any = {
    setHeader(k: string, v: string) { h[k.toLowerCase()] = v; },
    status(c: number) { status = c; return this; },
    json() { ended = true; return this; },
    end() { ended = true; return this; },
  };
  corsAllowlist(req, res, () => { nextCalled = true; });
  return { h, status, ended, nextCalled };
}

test("CORS: ไม่ตั้ง CORS_ORIGINS = ปิด ไม่มี header", () => {
  delete process.env.CORS_ORIGINS;
  const r = runCors("https://a.example", "OPTIONS");
  assert.equal(r.nextCalled, true);
  assert.deepEqual(r.h, {});
});

test("CORS: allowlist ตอบ preflight 204 ก่อน auth และไม่รับ *", () => {
  process.env.CORS_ORIGINS = " https://a.example/ , * ,https://b.example";
  assert.deepEqual(parseCorsOrigins(process.env.CORS_ORIGINS), ["https://a.example", "https://b.example"]);
  const ok = runCors("https://a.example", "OPTIONS");
  assert.equal(ok.status, 204);
  assert.equal(ok.nextCalled, false);
  assert.equal(ok.h["access-control-allow-origin"], "https://a.example");
  assert.match(ok.h["access-control-allow-headers"], /x-dashboard-token/);
  assert.match(ok.h["access-control-allow-headers"], /x-admin-token/);
  assert.match(ok.h["access-control-allow-headers"], /content-type/);
  assert.equal(ok.h["access-control-allow-credentials"], undefined);

  const bad = runCors("https://evil.example", "OPTIONS");
  assert.equal(bad.status, 403);
  assert.equal(bad.h["access-control-allow-origin"], undefined);

  const normal = runCors("https://evil.example", "GET");
  assert.equal(normal.nextCalled, true);
  assert.equal(normal.h["access-control-allow-origin"], undefined);

  const normalOk = runCors("https://b.example", "GET");
  assert.equal(normalOk.nextCalled, true);
  assert.equal(normalOk.h["access-control-allow-origin"], "https://b.example");
});
