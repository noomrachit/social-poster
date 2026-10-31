import { test } from "node:test";
import assert from "node:assert/strict";
import { isUrl, mimeFor, parseArgs, splitList } from "../cli-args.js";

test("parseArgs แยกคำสั่ง ข้อความ และ flag ซ้ำได้", () => {
  const r = parseArgs(["post", "สวัสดี", "ชาวโลก", "--media", "a.mp4", "--media=b.png", "--to", "x,y"]);
  assert.equal(r.command, "post");
  assert.deepEqual(r.positional, ["สวัสดี", "ชาวโลก"]);
  assert.deepEqual(r.flags.media, ["a.mp4", "b.png"]);
  assert.deepEqual(splitList(r.flags.to), ["x", "y"]);
});

test("parseArgs: flag ไม่มีค่า = true และไม่กินคำสั่งถัดไป", () => {
  const r = parseArgs(["history", "--verbose", "--n", "5"]);
  assert.deepEqual(r.flags.verbose, ["true"]);
  assert.deepEqual(r.flags.n, ["5"]);
});

test("parseArgs: ไม่มี argument = help", () => {
  assert.equal(parseArgs([]).command, "help");
});

test("isUrl / mimeFor", () => {
  assert.ok(isUrl("https://x.com/a.mp4"));
  assert.ok(!isUrl("./a.mp4"));
  assert.equal(mimeFor("/tmp/Clip.MP4"), "video/mp4");
  assert.equal(mimeFor("a.txt"), null);
});
