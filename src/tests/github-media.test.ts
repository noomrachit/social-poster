import test from "node:test";
import assert from "node:assert/strict";
const { normalizeGrokPath } = await import("../lib/github-media.js");

test("normalizeGrokPath รับชื่อไฟล์เปล่าและพาธเต็ม", () => {
  assert.equal(normalizeGrokPath("KFPkY.mp4"), "artifacts/imagine_videos/KFPkY.mp4");
  assert.equal(normalizeGrokPath("/artifacts/imagine_videos/Gw4tb.mp4"), "artifacts/imagine_videos/Gw4tb.mp4");
});

test("normalizeGrokPath ปฏิเสธพาธอันตรายและนามสกุลอื่น", () => {
  for (const bad of ["../secret.mp4", "artifacts/imagine_videos/../../.env", "a/b.mp4", "x.sh", "KFPkY.mp4/../x", ".env", "ab.mp4"]) {
    assert.throws(() => normalizeGrokPath(bad), /ไม่ถูกต้อง/, bad);
  }
});
