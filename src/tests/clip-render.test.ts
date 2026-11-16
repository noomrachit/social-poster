import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), "clipr-"));
process.env.APP_BASE_URL = "http://x";
const { wrapThai, pickPexelsFile, pickPixabayFile, buildFilter, renderClip } = await import("../lib/clip-render.js");
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

test("wrapThai ตัดบรรทัดตามคำ", () => {
  const w = wrapThai("ยังไม่ต้องทิ้งวันนี้ก็ได้ พร้อมเมื่อไหร่ค่อยตัดสินใจ", 14);
  assert.ok(w.includes("\n"));
  for (const l of w.split("\n")) assert.ok(l.length <= 20);
  assert.equal(wrapThai("สั้นๆ", 14), "สั้นๆ");
});

test("pickPexelsFile เลือกแนวตั้ง mp4 กว้างน้อยสุดที่ >= 720", () => {
  const f = pickPexelsFile([
    { file_type: "video/mp4", width: 1080, height: 1920, link: "a" },
    { file_type: "video/mp4", width: 720, height: 1280, link: "b" },
    { file_type: "video/mp4", width: 1920, height: 1080, link: "c" },
    { file_type: "video/mp4", width: 360, height: 640, link: "d" },
  ]);
  assert.equal(f?.link, "b");
  assert.equal(pickPexelsFile([{ file_type: "video/mp4", width: 1920, height: 1080, link: "c" }]), null);
});

test("buildFilter มีเสียงพากย์และไม่มีเสียงพากย์", () => {
  const withVo = buildFilter({ scenes: [{ seconds: 6 }, { seconds: 6 }], font: null, voiceIndex: 2, total: 12 });
  assert.match(withVo, /concat=n=2/);
  assert.match(withVo, /\[2:a\]/);
  const noVo = buildFilter({ scenes: [{ seconds: 6 }, { seconds: 6 }], font: null, voiceIndex: null, total: 12 });
  assert.doesNotMatch(noVo, /amix/);
});

test("renderClip ตรวจเงื่อนไขอินพุต", async () => {
  await assert.rejects(renderClip({ scenes: [{ mediaUrl: "x", seconds: 6 }] }), /2–8/);
  await assert.rejects(renderClip({ scenes: [{ mediaUrl: "x", seconds: 4 }, { mediaUrl: "x", seconds: 4 }] }), /15–30/);
  await assert.rejects(renderClip({ scenes: [{ seconds: 8 }, { seconds: 8 }] }), /pexelsId หรือ pixabayId หรือ mediaUrl/);
});

test("renderClip ทำงานจริงด้วย ffmpeg (ข้ามถ้าไม่มี)", { skip: !hasFfmpeg }, async () => {
  const dir = process.env.MEDIA_DIR!;
  const mk = (n: string, color: string, secs: number) =>
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=${color}:s=720x1280:d=${secs}:r=24`, "-c:v", "libx264", "-pix_fmt", "yuv420p", join(dir, n)]);
  mk("aaaaaaaaaaaa1.mp4", "0x886644", 2); // สั้นกว่า 6 วินาที ทดสอบ stream_loop
  mk("bbbbbbbbbbbb2.mp4", "0x446688", 7);
  spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=f=300:d=20", join(dir, "vvvvvvvvvvvv3.wav")]);
  const r = await renderClip({
    scenes: [
      { mediaUrl: "http://x/media/aaaaaaaaaaaa1.mp4", seconds: 6, text: "ยังไม่ต้องทิ้งวันนี้ก็ได้" },
      { mediaUrl: "http://x/media/bbbbbbbbbbbb2.mp4", seconds: 6, text: "หากล่องสักใบ" },
      { mediaUrl: "http://x/media/aaaaaaaaaaaa1.mp4", seconds: 6 },
      { mediaUrl: "http://x/media/bbbbbbbbbbbb2.mp4", seconds: 6, text: "หนักเกินไป โทร 1323" },
    ],
    voiceUrl: "http://x/media/vvvvvvvvvvvv3.wav",
  });
  assert.equal(r.seconds, 24);
  const name = r.url.split("/").pop()!;
  assert.ok(existsSync(join(dir, name)));
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,duration", "-of", "csv=p=0", join(dir, name)]).stdout.toString();
  assert.match(probe, /video,1080,1920/);
  assert.match(probe, /audio/);
  assert.deepEqual(r.warnings, []); // wav 20 วินาที สั้นกว่าคลิป 24 วินาที ไม่ต้องเตือน
});

test("pickPixabayFile เลือก medium ถ้ากว้าง >= 720 ไม่งั้น large", () => {
  assert.equal(pickPixabayFile({ medium: { url: "m", width: 1280, height: 720 }, large: { url: "l", width: 1920, height: 1080 } })?.url, "m");
  assert.equal(pickPixabayFile({ medium: { url: "m", width: 640, height: 360 }, large: { url: "l", width: 1920, height: 1080 } })?.url, "l");
  assert.equal(pickPixabayFile({ medium: { url: "m", width: 640, height: 360 } }), null);
  assert.equal(pickPixabayFile(undefined), null);
});
