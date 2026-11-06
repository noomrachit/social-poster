import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.TOKEN_ENCRYPTION_KEY ??= "0".repeat(64);

const { pool } = await import("../db/pool.js");
const { providers } = await import("../providers/registry.js");
const { createPost } = await import("../lib/services.js");

test("createPost: provider โยน exception → ยังบันทึก post_results เป็น error และตัวอื่นไม่กระทบ", async () => {
  const inserted: any[][] = [];
  const origQuery = pool.query.bind(pool);
  (pool as any).query = async (sql: string, params: any[] = []) => {
    if (/SELECT \* FROM integrations/.test(sql)) {
      return { rows: [
        { id: "i1", platform: "tiktok", external_account_id: "a", access_token_enc: "x" },
        { id: "i2", platform: "youtube", external_account_id: "b", access_token_enc: "x" },
      ] };
    }
    if (/INSERT INTO post_results/.test(sql)) inserted.push(params);
    return { rows: [] };
  };
  const origTt = providers.tiktok, origYt = providers.youtube;
  providers.tiktok = { platform: "tiktok", publish: async () => { throw new Error("decrypt พัง"); } } as any;
  providers.youtube = { platform: "youtube", publish: async () => ({ status: "success", remotePostId: "yt1" }) } as any;
  try {
    const out = await createPost("hi", ["https://m/v.mp4"]);
    assert.equal(out!.results.length, 2);
    const tt = out!.results.find((r) => r.platform === "tiktok")!;
    assert.equal(tt.status, "error");
    assert.match(tt.error!, /decrypt พัง/);
    assert.equal(out!.results.find((r) => r.platform === "youtube")!.status, "success");
    assert.equal(inserted.length, 2, "ต้องมีแถว post_results ครบทั้ง 2 แพลตฟอร์ม");
  } finally {
    (pool as any).query = origQuery;
    providers.tiktok = origTt;
    providers.youtube = origYt;
  }
});
