import { test } from "node:test";
import assert from "node:assert/strict";
import { TERMS_HTML, PRIVACY_HTML, tiktokVerifyContent } from "../routes/legal.js";

test("terms และ privacy มีเนื้อหาและอีเมลติดต่อ", () => {
  for (const h of [TERMS_HTML, PRIVACY_HTML]) {
    assert.match(h, /poralitlit@gmail\.com/);
    assert.match(h, /<html/);
  }
  assert.match(TERMS_HTML, /Terms of Service/);
  assert.match(PRIVACY_HTML, /never sold/);
});

test("ไฟล์ยืนยัน TikTok เสิร์ฟเมื่อชื่อตรง", () => {
  const env = { TIKTOK_VERIFY_FILENAME: "tiktokABC.txt", TIKTOK_VERIFY_CONTENT: "tiktok-developers-site-verification=XYZ" };
  assert.equal(tiktokVerifyContent("/tiktokABC.txt", env), "tiktok-developers-site-verification=XYZ");
  assert.equal(tiktokVerifyContent("/other.txt", env), null);
});

test("ไม่เสิร์ฟเมื่อไม่ได้ตั้งค่า", () => {
  assert.equal(tiktokVerifyContent("/tiktokABC.txt", {}), null);
  assert.equal(tiktokVerifyContent("/x", { TIKTOK_VERIFY_FILENAME: "x" }), null);
});
