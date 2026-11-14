import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), "chunk-"));
const { appendMediaChunk } = await import("../lib/media-store.js");

test("แบ่งก้อนแล้วประกอบเป็นไฟล์เดียว", async () => {
  const a = await appendMediaChunk({ data: Buffer.from("hello "), contentType: "video/mp4", last: false });
  assert.equal(a.done, false);
  if (a.done) return;
  const b = await appendMediaChunk({ uploadId: a.uploadId, data: Buffer.from("world"), contentType: "video/mp4", last: true });
  assert.equal(b.done, true);
  if (!b.done) return;
  assert.equal(b.size, 11);
  assert.equal(readFileSync(join(process.env.MEDIA_DIR!, b.name), "utf8"), "hello world");
});

test("ปฏิเสธชนิดไฟล์ที่ไม่รองรับและ uploadId แปลก", async () => {
  await assert.rejects(appendMediaChunk({ data: Buffer.from("x"), contentType: "text/html", last: true }));
  await assert.rejects(appendMediaChunk({ uploadId: "../../etc/passwd", data: Buffer.from("x"), contentType: "video/mp4", last: true }));
});
