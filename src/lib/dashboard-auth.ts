import type { NextFunction, Request, Response } from "express";
import { requireAdmin, tokenMatches } from "./admin-auth.js";

// โทเคนสิทธิ์จำกัดสำหรับแดชบอร์ด (header x-dashboard-token, ENV DASHBOARD_TOKEN)
// ใช้ได้เฉพาะเส้นทางใน allowlist ด้านล่าง ส่วน ADMIN_TOKEN (x-admin-token) ทำงานเหมือนเดิมทุกอย่าง
// ไม่ log ค่า token

/** เส้นทางที่ DASHBOARD_TOKEN เข้าได้ (เทียบแบบ allowlist ตัวพิมพ์เล็ก ตัด query และ / ท้าย) */
export function isDashboardAllowed(method: string, rawUrl: string): boolean {
  const path = (rawUrl.split("?")[0] ?? "").toLowerCase().replace(/\/+$/, "") || "/";
  const m = method.toUpperCase();
  if (m === "GET" && (path === "/integrations" || path === "/posts")) return true;
  if (m === "POST" && (path === "/posts" || path === "/media")) return true;
  // GET /posts/:id (เซกเมนต์เดียว)
  if (m === "GET" && /^\/posts\/[^/]+$/.test(path)) return true;
  return false;
}

/**
 * ใช้แทน requireAdmin: มี x-admin-token → ตรวจแบบเดิมเป๊ะ
 * มีเฉพาะ x-dashboard-token → ตรวจ DASHBOARD_TOKEN + จำกัดเส้นทาง + บังคับกฎของ POST /posts
 * ไม่มีทั้งคู่ → พฤติกรรมเดิมของ requireAdmin
 */
export function requireAdminOrDashboard(req: Request, res: Response, next: NextFunction): void {
  const dashboardHeader = req.header("x-dashboard-token");
  if (req.header("x-admin-token") !== undefined || dashboardHeader === undefined) {
    requireAdmin(req, res, next);
    return;
  }

  const expected = process.env.DASHBOARD_TOKEN;
  // ไม่ตั้ง DASHBOARD_TOKEN = ปฏิเสธทุกคำขอที่ใช้โทเคนนี้ (ตอบเหมือน token ผิด ไม่เปิดเผยการตั้งค่า)
  if (!expected || !tokenMatches(dashboardHeader, expected)) {
    res.status(401).json({ error: "token ไม่ถูกต้อง" });
    return;
  }

  const url = req.originalUrl ?? req.url ?? "";
  if (!isDashboardAllowed(req.method, url)) {
    res.status(403).json({ error: "token นี้ไม่มีสิทธิ์เข้าเส้นทางนี้" });
    return;
  }

  const path = (url.split("?")[0] ?? "").toLowerCase().replace(/\/+$/, "");
  if (req.method.toUpperCase() === "POST" && path === "/posts") {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== "object" || (body.mode !== "draft" && body.mode !== "schedule")) {
      res.status(403).json({ error: "token นี้สร้างโพสต์ได้เฉพาะ mode = draft หรือ schedule (ห้ามโพสต์ทันที)" });
      return;
    }
    if (body.privacyStatus === undefined) body.privacyStatus = "private";
  }
  next();
}
