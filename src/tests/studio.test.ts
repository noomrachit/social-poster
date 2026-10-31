import assert from "node:assert/strict";
import { test } from "node:test";
import { draftShort, parseDraftInput, parseSpeakInput, speakShort } from "../lib/studio.js";

test("parseDraftInput: ตรวจหัวข้อ สูตร และความยาว", () => {
  const ok = parseDraftInput({ topic: "  เก็บเงิน   ทุกเดือน ", style: "tips", seconds: 30, useAi: true });
  assert.equal(ok.topic, "เก็บเงิน ทุกเดือน");
  assert.equal(ok.useAi, true);
  assert.equal(ok.withImage, false);
  assert.throws(() => parseDraftInput({ topic: "a", style: "tips", seconds: 30 }));
  assert.throws(() => parseDraftInput({ topic: "หัวข้อ", style: "nope", seconds: 30 }));
  assert.throws(() => parseDraftInput({ topic: "หัวข้อ", style: "tips", seconds: 20 }));
  assert.throws(() => parseDraftInput(null));
});

test("draftShort: ไม่มี XAI_API_KEY ใช้ร่างในเครื่องพร้อม note", async () => {
  const saved = process.env.XAI_API_KEY;
  delete process.env.XAI_API_KEY;
  try {
    const out = await draftShort(parseDraftInput({ topic: "กาแฟท้องว่าง", style: "hook", seconds: 15, useAi: true, withImage: true }));
    assert.equal(out.plan.source, "local");
    assert.equal(out.plan.scenes.length, 3);
    assert.equal(out.image, null);
    assert.match(out.note ?? "", /AI ยังไม่พร้อม/);
  } finally {
    if (saved !== undefined) process.env.XAI_API_KEY = saved;
  }
});

test("speakShort: ไม่มี XAI_API_KEY คืน ok:false ให้หน้าเว็บใช้เสียงเครื่อง", async () => {
  const saved = process.env.XAI_API_KEY;
  delete process.env.XAI_API_KEY;
  try {
    const r = await speakShort(parseSpeakInput({ text: "สวัสดีครับ", voice: "ไม่มีเสียงนี้" }));
    assert.equal(r.ok, false);
    assert.throws(() => parseSpeakInput({ text: " " }));
    assert.equal(parseSpeakInput({ text: "สวัสดี", voice: "x" }).voice, "eve");
  } finally {
    if (saved !== undefined) process.env.XAI_API_KEY = saved;
  }
});
