import { Router } from "express";
import { pool } from "../db/pool.js";

export const integrationsRouter = Router();

// รายการบัญชีที่เชื่อมไว้แล้ว (ไม่คืน token กลับไปเด็ดขาด)
integrationsRouter.get("/integrations", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, platform, display_name, external_account_id, created_at
     FROM integrations ORDER BY created_at DESC`
  );
  res.json(rows);
});

// ยกเลิกการเชื่อมบัญชี (ลบ integration ทิ้ง — post_results เก่าที่อ้างถึงจะถูกลบตามด้วย ON DELETE CASCADE)
integrationsRouter.delete("/integrations/:id", async (req, res) => {
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
