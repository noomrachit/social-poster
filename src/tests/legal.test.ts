import { test } from "node:test";
import assert from "node:assert/strict";
import { HOME_HTML, TERMS_HTML, PRIVACY_HTML, tiktokVerifyContent } from "../routes/legal.js";

test("terms และ privacy มีเนื้อหาและอีเมลติดต่อ", () => {
  for (const h of [HOME_HTML, TERMS_HTML, PRIVACY_HTML]) {
    assert.match(h, /noomrachit@gmail\.com/);
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

test("หน้าแรกลิงก์ไป privacy/terms และ privacy อ้าง Limited Use", () => {
  assert.match(HOME_HTML, /href="\/privacy"/);
  assert.match(HOME_HTML, /href="\/terms"/);
  assert.match(HOME_HTML, /YouTube Data API/);
  assert.match(PRIVACY_HTML, /Limited Use/);
  assert.match(PRIVACY_HTML, /api-services-user-data-policy/);
});
