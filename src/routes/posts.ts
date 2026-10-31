import { Router } from "express";
import { pool } from "../db/pool.js";
import { createPost, listPosts } from "../lib/services.js";
import { PRIVACY_STATUSES, type PrivacyStatus } from "../providers/types.js";

// การล็อก token ทำใน src/index.ts (ครอบเฉพาะ /posts)
export const postsRouter = Router();

// GET /posts — ประวัติโพสต์ล่าสุด พร้อมผลลัพธ์แยกรายแพลตฟอร์ม
postsRouter.get("/posts", async (_req, res) => {
  res.json(await listPosts());
});

interface CreatePostBody {
  content: string;
  mediaUrls?: string[];
  integrationIds?: string[]; // ไม่ส่งมา = โพสต์ไปทุกบัญชีที่เชื่อมไว้
  privacyStatus?: PrivacyStatus; // YouTube: private (ค่าเริ่มต้น) | unlisted | public
}

// POST /posts — โพสต์ครั้งเดียว ยิงทุกแพลตฟอร์ม (หรือเฉพาะ integrationIds ที่เลือก) แล้วรอผลทุกแพลตฟอร์มก่อนตอบ
postsRouter.post("/posts", async (req, res) => {
  const body = req.body as CreatePostBody;
  if (!body?.content) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  if (body.privacyStatus !== undefined && !PRIVACY_STATUSES.includes(body.privacyStatus)) {
    res.status(400).json({ error: `privacyStatus must be one of: ${PRIVACY_STATUSES.join(", ")}` });
    return;
  }
  const outcome = await createPost(body.content, body.mediaUrls ?? [], body.integrationIds, body.privacyStatus);
  if (!outcome) {
    res.status(400).json({ error: "ไม่มีบัญชีที่เชื่อมไว้ตรงกับที่ขอ (ดู GET /integrations)" });
    return;
  }
  res.json(outcome);
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
