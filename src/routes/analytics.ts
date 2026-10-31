import { Router } from "express";
import { pool } from "../db/pool.js";
import { providers } from "../providers/registry.js";
import type { IntegrationRow, PostStats } from "../providers/types.js";

export const analyticsRouter = Router();

// GET /analytics?postId=... — สถิติของโพสต์ที่ส่งสำเร็จ (ไม่ใส่ postId = 20 โพสต์ล่าสุด)
// ดึงสดจากแพลตฟอร์มปลายทาง; แพลตฟอร์มที่ยังไม่รองรับ/ดึงพลาด จะแสดง note แทน ไม่ทำให้ทั้งคำขอล้ม
analyticsRouter.get("/analytics", async (req, res) => {
  const postId = typeof req.query.postId === "string" ? req.query.postId : null;
  const { rows } = await pool.query(
    `SELECT r.post_id, r.platform, r.remote_post_id, r.integration_id
     FROM post_results r
     WHERE r.status = 'success' AND r.remote_post_id IS NOT NULL
       AND ($1::text IS NULL OR r.post_id = $1)
       AND ($1::text IS NOT NULL OR r.post_id IN (SELECT id FROM posts ORDER BY created_at DESC LIMIT 20))
     ORDER BY r.created_at DESC`,
    [postId]
  );

  const byIntegration = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byIntegration.get(r.integration_id) ?? [];
    list.push(r);
    byIntegration.set(r.integration_id, list);
  }

  const items: Array<{ postId: string; platform: string; remotePostId: string; stats?: PostStats; note?: string }> = [];
  for (const [integrationId, list] of byIntegration) {
    const { rows: integ } = await pool.query<IntegrationRow>(`SELECT * FROM integrations WHERE id = $1`, [integrationId]);
    const provider = providers[list[0].platform];
    let stats: Record<string, PostStats> = {};
    let note: string | undefined;
    if (!integ[0]) note = "บัญชีที่เชื่อมไว้ถูกลบแล้ว";
    else if (!provider?.getStats) note = "แพลตฟอร์มนี้ยังไม่รองรับการดึงสถิติ";
    else {
      try {
        stats = await provider.getStats(integ[0], list.map((r) => r.remote_post_id));
      } catch (err) {
        note = err instanceof Error ? err.message : String(err);
      }
    }
    for (const r of list) {
      items.push({
        postId: r.post_id,
        platform: r.platform,
        remotePostId: r.remote_post_id,
        stats: stats[r.remote_post_id],
        note: note ?? (stats[r.remote_post_id] ? undefined : "ไม่พบโพสต์บนแพลตฟอร์ม (อาจถูกลบหรือยังประมวลผลอยู่)"),
      });
    }
  }
  res.json(items);
});
