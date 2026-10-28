import { Router } from "express";
import { nanoid } from "nanoid";
import { pool } from "../db/pool.js";
import { providers } from "../providers/registry.js";
import type { IntegrationRow } from "../providers/types.js";
import { requireAdmin } from "../lib/admin-auth.js";

export const postsRouter = Router();
postsRouter.use(requireAdmin);

// GET /posts — ประวัติโพสต์ล่าสุด พร้อมผลลัพธ์แยกรายแพลตฟอร์ม
postsRouter.get("/posts", async (_req, res) => {
  const { rows: posts } = await pool.query(
    `SELECT id, content, media_urls, created_at FROM posts ORDER BY created_at DESC LIMIT 50`
  );
  if (posts.length === 0) {
    res.json([]);
    return;
  }
  const { rows: results } = await pool.query(
    `SELECT post_id, platform, status, remote_post_id, error_message
     FROM post_results WHERE post_id = ANY($1) ORDER BY created_at`,
    [posts.map((p) => p.id)]
  );
  const byPost = new Map<string, unknown[]>();
  for (const r of results) {
    const list = byPost.get(r.post_id) ?? [];
    list.push(r);
    byPost.set(r.post_id, list);
  }
  res.json(posts.map((p) => ({ ...p, results: byPost.get(p.id) ?? [] })));
});

interface CreatePostBody {
  content: string;
  mediaUrls?: string[];
  integrationIds?: string[]; // ไม่ส่งมา = โพสต์ไปทุกบัญชีที่เชื่อมไว้
}

// POST /posts — โพสต์ครั้งเดียว ยิงไปทุกแพลตฟอร์ม (หรือเฉพาะ integrationIds ที่เลือก)
// Response: array เดียวกับ Postiz (postId, integration) แต่เพิ่ม status/platform/error มาด้วย
// เพราะยิงจริงแบบ sync แล้วรอผลทุกแพลตฟอร์มก่อนตอบ (ไม่ต้อง poll แยกทีหลังแบบ Postiz)
postsRouter.post("/posts", async (req, res) => {
  const body = req.body as CreatePostBody;
  if (!body?.content) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const client = await pool.connect();
  try {
    const postId = nanoid();
    const mediaUrls = body.mediaUrls ?? [];

    await client.query(
      `INSERT INTO posts (id, content, media_urls) VALUES ($1, $2, $3)`,
      [postId, body.content, JSON.stringify(mediaUrls)]
    );

    const integrationFilter = body.integrationIds?.length
      ? { sql: `WHERE id = ANY($1)`, params: [body.integrationIds] }
      : { sql: ``, params: [] };

    const { rows: integrations } = await client.query<IntegrationRow>(
      `SELECT * FROM integrations ${integrationFilter.sql}`,
      integrationFilter.params
    );

    if (integrations.length === 0) {
      res.status(400).json({ error: "ไม่มีบัญชีที่เชื่อมไว้ตรงกับที่ขอ (ดู GET /integrations)" });
      return;
    }

    // ยิงไปทุกแพลตฟอร์มพร้อมกัน แต่ละตัวพังไม่กระทบตัวอื่น (Promise.allSettled)
    const outcomes = await Promise.allSettled(
      integrations.map(async (integration) => {
        const resultId = nanoid();
        const provider = providers[integration.platform];

        if (!provider) {
          await client.query(
            `INSERT INTO post_results (id, post_id, integration_id, platform, status, error_message)
             VALUES ($1, $2, $3, $4, 'error', $5)`,
            [resultId, postId, integration.id, integration.platform, `ไม่รู้จักแพลตฟอร์ม ${integration.platform}`]
          );
          return { integration: integration.id, platform: integration.platform, status: "error" as const, error: `ไม่รู้จักแพลตฟอร์ม ${integration.platform}` };
        }

        const result = await provider.publish(integration, { content: body.content, mediaUrls });

        await client.query(
          `INSERT INTO post_results (id, post_id, integration_id, platform, status, remote_post_id, error_message)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [resultId, postId, integration.id, integration.platform, result.status, result.remotePostId ?? null, result.errorMessage ?? null]
        );

        return {
          integration: integration.id,
          platform: integration.platform,
          status: result.status,
          postId: result.remotePostId,
          error: result.errorMessage,
        };
      })
    );

    const results = outcomes.map((o) =>
      o.status === "fulfilled" ? o.value : { status: "error" as const, error: String(o.reason) }
    );

    res.json({ postId, results });
  } finally {
    client.release();
  }
});

// GET /posts/:id — ดูรายละเอียดโพสต์ + ผลลัพธ์แยกรายแพลตฟอร์ม
postsRouter.get("/posts/:id", async (req, res) => {
  const { rows: postRows } = await pool.query(`SELECT * FROM posts WHERE id = $1`, [req.params.id]);
  const post = postRows[0];
  if (!post) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const { rows: results } = await pool.query(
    `SELECT platform, status, remote_post_id, error_message, updated_at
     FROM post_results WHERE post_id = $1 ORDER BY created_at`,
    [req.params.id]
  );

  res.json({ ...post, results });
});
