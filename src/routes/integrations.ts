import { Router } from "express";
import { pool } from "../db/pool.js";
import { decryptToken, revokeToken } from "../lib/tiktok.js";

// การล็อก token ทำใน src/index.ts (ครอบเฉพาะ /integrations) ไม่ใช้ router.use เพราะจะครอบทุกเส้นทางที่ mount ทีหลัง
export const integrationsRouter = Router();

// รายการบัญชีที่เชื่อมไว้แล้ว (ไม่คืน token กลับไปเด็ดขาด)
integrationsRouter.get("/integrations", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, platform, display_name, external_account_id, created_at, updated_at, needs_reauth, last_error
     FROM integrations ORDER BY created_at DESC`
  );
  res.json(rows);
});

// ยกเลิกการเชื่อมบัญชี (ลบ integration ทิ้ง — post_results เก่าที่อ้างถึงจะถูกลบตามด้วย ON DELETE CASCADE)
// token (access/refresh) อยู่ในแถว integrations จึงถูกลบไปพร้อมกัน; TikTok ยกเลิกสิทธิ์ที่ต้นทางด้วย (best effort)
integrationsRouter.delete("/integrations/:id", async (req, res) => {
  const pre = await pool.query(`SELECT platform, access_token_enc FROM integrations WHERE id = $1`, [req.params.id]);
  if (pre.rows[0]?.platform === "tiktok") {
    try { await revokeToken(decryptToken(pre.rows[0].access_token_enc)); } catch (e) { console.error("TikTok revoke failed"); }
  }
  const { rows } = await pool.query(
    `DELETE FROM integrations WHERE id = $1 RETURNING id, platform, display_name`,
    [req.params.id]
  );
  const deleted = rows[0];
  if (!deleted) {
    res.status(404).json({ error: "ไม่พบบัญชีที่เชื่อมไว้ตาม id นี้" });
    return;
  }
  res.json({ deleted });
});
