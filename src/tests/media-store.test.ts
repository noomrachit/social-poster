import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.MEDIA_DIR = await mkdtemp(join(tmpdir(), "media-test-"));
const { saveMedia, mediaPath, isAllowedType, UploadTooLargeError, SAFE_NAME } = await import("../lib/media-store.js");

test("saveMedia เก็บไฟล์และ mediaPath หาเจอ", async () => {
  const saved = await saveMedia(Readable.from([Buffer.from("hello"), Buffer.from("world")]), "video/mp4", "x.mp4");
  assert.match(saved.name, SAFE_NAME);
  assert.ok(saved.name.endsWith(".mp4"));
  assert.equal(saved.size, 10);
  const p = await mediaPath(saved.name);
  assert.ok(p);
  assert.equal((await readFile(p!)).toString(), "helloworld");
});

test("เกินลิมิต → throw และไม่ทิ้งไฟล์ค้าง", async () => {
  const before = (await readdir(process.env.MEDIA_DIR!)).length;
  await assert.rejects(
    saveMedia(Readable.from([Buffer.alloc(100)]), "image/png", "a.png", 50),
    UploadTooLargeError
  );
  assert.equal((await readdir(process.env.MEDIA_DIR!)).length, before);
});

test("ไฟล์ว่าง → ปฏิเสธ", async () => {
  await assert.rejects(saveMedia(Readable.from([]), "image/png"));
});

test("mediaPath กัน path traversal และชื่อแปลก", async () => {
  assert.equal(await mediaPath("../../etc/passwd"), null);
  assert.equal(await mediaPath("..%2f..%2fx.mp4"), null);
  assert.equal(await mediaPath("nonexistent1234567.mp4"), null);
});

test("isAllowedType รับเฉพาะ video/image", () => {
  assert.ok(isAllowedType("video/mp4"));
  assert.ok(isAllowedType("image/png"));
  assert.ok(!isAllowedType("text/html"));
  assert.ok(!isAllowedType("application/octet-stream"));
});
