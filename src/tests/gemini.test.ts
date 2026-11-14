import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { pcmToWav, pickVideoUri, buildFfmpegArgs } = await import("../lib/gemini.js");

test("pcmToWav ใส่หัว WAV ถูกต้อง", () => {
  const w = pcmToWav(Buffer.alloc(100));
  assert.equal(w.length, 144);
  assert.equal(w.toString("ascii", 0, 4), "RIFF");
  assert.equal(w.readUInt32LE(24), 24000);
  assert.equal(w.readUInt32LE(40), 100);
});

test("pickVideoUri อ่านผลสำเร็จ/ถูกกรอง/error", () => {
  assert.equal(pickVideoUri({ response: { generateVideoResponse: { generatedSamples: [{ video: { uri: "u" } }] } } }).uri, "u");
  assert.match(pickVideoUri({ response: { generateVideoResponse: { raiMediaFilteredReasons: ["x"] } } }).error!, /ปฏิเสธ/);
  assert.equal(pickVideoUri({ error: { message: "boom" } }).error, "boom");
});

test("buildFfmpegArgs ต่อ 2 ฉากพร้อมเสียงพากย์", () => {
  const a = buildFfmpegArgs(["/a.mp4", "/b.mp4"], "/v.wav", "/o.mp4");
  assert.equal(a.filter((x) => x === "-i").length, 3);
  const f = a[a.indexOf("-filter_complex") + 1];
  assert.match(f, /concat=n=2:v=1:a=1/);
  assert.match(f, /amix/);
  assert.equal(a[a.length - 1], "/o.mp4");
});
