import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDate, parseDailyPick, todayIn, toYoutubeContent } from "../lib/yingad.js";
import { parseScheduledAt } from "../lib/schedule.js";

const sample = readFileSync(join(process.cwd(), "src/tests/fixtures/daily-pick-2026-10-19.md"), "utf8");

test("parseDailyPick อ่านสินค้าเด่น TikTok จาก daily-pick จริง", () => {
  const pick = parseDailyPick(sample, "2026-10-19");
  assert.ok(pick);
  assert.equal(pick.product, "Maxim กาแฟซอง");
  assert.equal(pick.hook, "3 เหตุผลที่ควรมี Maxim กาแฟซอง");
  assert.equal(pick.videoUrl, "https://noomrachit.github.io/yingad-links/media/2026-10-19.mp4");
  assert.match(pick.tiktokCaption, /ลิงก์นายหน้า ช่องได้ค่าคอมมิชชันเล็กน้อย/);
  assert.ok(!pick.tiktokCaption.includes("```"));
});

test("parseDailyPick: รูปแบบไม่ตรง = null", () => {
  assert.equal(parseDailyPick("# ไม่มีหัวข้อ", "2026-10-19"), null);
  assert.equal(parseDailyPick("## สินค้าเด่น TikTok\n- ชื่อ: X\n", "2026-10-19"), null);
});

test("toYoutubeContent: บรรทัดแรกเป็นชื่อคลิป มี #Shorts ลิงก์กดได้ และคงข้อความเปิดเผย", () => {
  const pick = parseDailyPick(sample, "2026-10-19")!;
  const content = toYoutubeContent(pick, "https://hub.example/");
  const [title] = content.split("\n");
  assert.equal(title, "3 เหตุผลที่ควรมี Maxim กาแฟซอง #Shorts");
  assert.ok(title.length <= 100);
  assert.match(content, /ลิงก์ทั้งหมด → https:\/\/hub\.example\//);
  assert.ok(!content.includes("ลิงก์ในโปรไฟล์"));
  assert.match(content, /ลิงก์นายหน้า/);
  assert.ok(!/undefined|null/.test(content));
});

test("todayIn / isDate", () => {
  assert.equal(todayIn("Asia/Jerusalem", new Date("2026-11-01T23:30:00Z")), "2026-11-02");
  assert.ok(isDate("2026-11-02"));
  assert.ok(!isDate("2026-11-2"));
  assert.ok(!isDate("../etc/passwd"));
});

test("parseScheduledAt", () => {
  const now = Date.parse("2026-11-01T20:00:00Z");
  assert.equal(parseScheduledAt(undefined, now), "scheduledAt is required when mode = schedule");
  assert.equal(parseScheduledAt("พรุ่งนี้", now), "scheduledAt must be an ISO 8601 date-time");
  assert.equal(parseScheduledAt("2026-11-01T10:00:00Z", now), "scheduledAt must be in the future");
  const d = parseScheduledAt("2026-11-02T19:00:00+02:00", now);
  assert.ok(d instanceof Date);
  assert.equal(d.toISOString(), "2026-11-02T17:00:00.000Z");
});
