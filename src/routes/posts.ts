import { Router } from "express";
import { pool } from "../db/pool.js";
import { createDraft, createPost, importYingad, listPosts, publishStoredPost } from "../lib/services.js";
import { parseScheduledAt } from "../lib/schedule.js";
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
  mode?: "now" | "draft" | "schedule"; // ค่าเริ่มต้น now (โพสต์ทันที แบบเดิม)
  scheduledAt?: string; // ISO 8601 ต้องใส่เมื่อ mode = schedule
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
  const mode = body.mode ?? "now";
  if (!["now", "draft", "schedule"].includes(mode)) {
    res.status(400).json({ error: "mode must be one of: now, draft, schedule" });
    return;
  }
  if (mode !== "now") {
    let scheduledAt: Date | undefined;
    if (mode === "schedule") {
      const parsed = parseScheduledAt(body.scheduledAt);
      if (typeof parsed === "string") {
        res.status(400).json({ error: parsed });
        return;
      }
      scheduledAt = parsed;
    }
    const draft = await createDraft({ ...body, scheduledAt });
    if (!draft) {
      res.status(400).json({ error: "ไม่มีบัญชีที่เชื่อมไว้ตรงกับที่ขอ (ดู GET /integrations)" });
      return;
    }
    res.status(201).json(draft);
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

// POST /posts/:id/publish — อนุมัติแล้วยิงโพสต์ที่เป็นร่าง/ตั้งเวลาไว้ทันที
postsRouter.post("/posts/:id/publish", async (req, res) => {
  const out = await publishStoredPost(req.params.id);
  if (out.ok) {
    res.json(out.outcome);
    return;
  }
  if (out.reason === "not_found") res.status(404).json({ error: "not found" });
  else if (out.reason === "not_publishable") res.status(409).json({ error: `โพสต์นี้สถานะ ${out.status} แล้ว ยิงซ้ำไม่ได้` });
  else res.status(400).json({ error: "ไม่มีบัญชีที่เชื่อมไว้ตรงกับที่ขอ" });
});

// POST /posts/import/yingad — ดึง daily-pick ของยิงแอดมาเป็นฉบับร่าง YouTube Shorts (ไม่โพสต์จนกว่าจะ publish)
//   body: { date?: "YYYY-MM-DD", integrationIds?: string[], privacyStatus?, scheduledAt?: ISO }
postsRouter.post("/posts/import/yingad", async (req, res) => {
  const body = (req.body ?? {}) as { date?: string; integrationIds?: string[]; privacyStatus?: PrivacyStatus; scheduledAt?: string };
  if (body.privacyStatus !== undefined && !PRIVACY_STATUSES.includes(body.privacyStatus)) {
    res.status(400).json({ error: `privacyStatus must be one of: ${PRIVACY_STATUSES.join(", ")}` });
    return;
  }
  let scheduledAt: Date | undefined;
  if (body.scheduledAt !== undefined) {
    const parsed = parseScheduledAt(body.scheduledAt);
    if (typeof parsed === "string") {
      res.status(400).json({ error: parsed });
      return;
    }
    scheduledAt = parsed;
  }
  try {
    const out = await importYingad({ ...body, scheduledAt });
    if (!out.ok) {
      res.status(400).json({ error: out.error });
      return;
    }
    res.status(out.duplicate ? 200 : 201).json(out);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
