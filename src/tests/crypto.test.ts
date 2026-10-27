import { test } from "node:test";
import assert from "node:assert/strict";

// TOKEN_ENCRYPTION_KEY ต้องตั้งก่อน import crypto.ts (อ่าน ENV ตอนเรียกใช้ฟังก์ชัน ไม่ใช่ตอน import จึงตั้งตรงนี้ได้)
process.env.TOKEN_ENCRYPTION_KEY ??= "0".repeat(64);

const { encryptToken, decryptToken } = await import("../lib/crypto.js");

test("encryptToken → decryptToken คืนค่าเดิม", () => {
  const plaintext = "ya29.a0-example-access-token";
  const encrypted = encryptToken(plaintext);
  assert.notEqual(encrypted, plaintext);
  assert.equal(decryptToken(encrypted), plaintext);
});

test("เข้ารหัสข้อความเดียวกันสองครั้งได้ ciphertext ไม่ซ้ำกัน (IV สุ่มทุกครั้ง)", () => {
  const plaintext = "same-token";
  const a = encryptToken(plaintext);
  const b = encryptToken(plaintext);
  assert.notEqual(a, b);
  assert.equal(decryptToken(a), plaintext);
  assert.equal(decryptToken(b), plaintext);
});

test("decryptToken โยน error เมื่อ format ผิด", () => {
  assert.throws(() => decryptToken("not-a-valid-token"));
});

test("encryptToken เก็บเป็น iv:authTag:ciphertext (3 ส่วนคั่นด้วย :)", () => {
  const encrypted = encryptToken("x");
  assert.equal(encrypted.split(":").length, 3);
});
