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
