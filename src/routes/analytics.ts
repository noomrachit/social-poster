import { Router } from "express";
import { getAnalytics } from "../lib/services.js";

export const analyticsRouter = Router();

// GET /analytics?postId=... — สถิติโพสต์ที่ส่งสำเร็จ (ไม่ใส่ postId = 20 โพสต์ล่าสุด)
analyticsRouter.get("/analytics", async (req, res) => {
  const postId = typeof req.query.postId === "string" ? req.query.postId : null;
  res.json(await getAnalytics(postId));
});
