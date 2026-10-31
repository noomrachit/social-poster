import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.TOKEN_ENCRYPTION_KEY ??= "0".repeat(64);
process.env.ADMIN_TOKEN = "admin-secret-token";
const SECRET = "p".repeat(40);

const { isAuthorized } = await import("../mcp.js");

test("Bearer และ x-admin-token ที่ถูกต้องผ่าน", () => {
  assert.ok(isAuthorized({ authorization: "Bearer admin-secret-token" }));
  assert.ok(isAuthorized({ "x-admin-token": "admin-secret-token" }));
});

test("ไม่มี/ผิด token ไม่ผ่าน", () => {
  assert.ok(!isAuthorized({}));
  assert.ok(!isAuthorized({ authorization: "Bearer wrong" }));
  assert.ok(!isAuthorized({ authorization: "Bearer " }));
});

test("path secret: ปิดไว้ถ้าไม่ได้ตั้ง MCP_PATH_SECRET", () => {
  delete process.env.MCP_PATH_SECRET;
  assert.ok(!isAuthorized({}, SECRET));
});

test("path secret: ต้องตรงและยาว ≥ 32; ADMIN_TOKEN ใช้เป็น path secret ไม่ได้", () => {
  process.env.MCP_PATH_SECRET = SECRET;
  assert.ok(isAuthorized({}, SECRET));
  assert.ok(!isAuthorized({}, "x".repeat(40)));
  assert.ok(!isAuthorized({}, "admin-secret-token"));
  process.env.MCP_PATH_SECRET = "short";
  assert.ok(!isAuthorized({}, "short"));
});
