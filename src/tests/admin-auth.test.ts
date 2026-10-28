import { test } from "node:test";
import assert from "node:assert/strict";
import { requireAdmin } from "../lib/admin-auth.js";

function run(headerToken: string | undefined) {
  let status = 200;
  let nextCalled = false;
  const req: any = { header: (name: string) => (name === "x-admin-token" ? headerToken : undefined) };
  const res: any = {
    status(code: number) { status = code; return this; },
    json() { return this; },
  };
  requireAdmin(req, res, () => { nextCalled = true; });
  return { status, nextCalled };
}

test("ปฏิเสธทุกคำขอเมื่อยังไม่ได้ตั้ง ADMIN_TOKEN (fail closed)", () => {
  delete process.env.ADMIN_TOKEN;
  const r = run("anything");
  assert.equal(r.status, 500);
  assert.equal(r.nextCalled, false);
});

test("ให้ผ่านเมื่อ token ตรงกับ ADMIN_TOKEN", () => {
  process.env.ADMIN_TOKEN = "secret-token-123";
  const r = run("secret-token-123");
  assert.equal(r.nextCalled, true);
});

test("ปฏิเสธ 401 เมื่อ token ไม่ตรงหรือไม่ได้ส่งมา", () => {
  process.env.ADMIN_TOKEN = "secret-token-123";
  assert.equal(run("wrong").status, 401);
  assert.equal(run(undefined).status, 401);
  assert.equal(run("secret-token-124").nextCalled, false);
});
