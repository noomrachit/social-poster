import { test } from "node:test";
import assert from "node:assert/strict";

// routes/auth.ts → db/pool.ts เช็ก DATABASE_URL ตอน import (ไม่ได้เชื่อมต่อ DB จริงในเทสต์นี้) จึงต้องตั้งก่อน import
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.TOKEN_ENCRYPTION_KEY ??= "0".repeat(64);

const { requireAdminQueryOrHeader } = await import("../lib/admin-auth.js");
const { isChannelAllowed } = await import("../routes/auth.js");

function run(query: Record<string, string>, header?: string) {
  let status = 200;
  let nextCalled = false;
  const req: any = { query, header: (n: string) => (n === "x-admin-token" ? header : undefined) };
  const res: any = { status(c: number) { status = c; return this; }, send() { return this; } };
  requireAdminQueryOrHeader(req, res, () => { nextCalled = true; });
  return { status, nextCalled };
}

test("start ต้องมี token (query หรือ header)", () => {
  process.env.ADMIN_TOKEN = "abc123";
  assert.equal(run({}).status, 401);
  assert.equal(run({ token: "wrong" }).status, 401);
  assert.equal(run({ token: "abc123" }).nextCalled, true);
  assert.equal(run({}, "abc123").nextCalled, true);
});

test("ALLOWED_YT_CHANNEL_IDS", () => {
  assert.equal(isChannelAllowed("UCa", ""), true);
  assert.equal(isChannelAllowed("UCa", "UCa, UCb"), true);
  assert.equal(isChannelAllowed("UCc", "UCa,UCb"), false);
});
