import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

// ป้องกัน API ที่โพสต์/ลบ/ดูบัญชีได้ ด้วย token ใน header x-admin-token
// ถ้าไม่ได้ตั้ง ADMIN_TOKEN จะปฏิเสธทุกคำขอ (fail closed) ไม่เปิดให้เข้าได้โดยไม่มีรหัส
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    res.status(500).json({ error: "ADMIN_TOKEN ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์" });
    return;
  }

  if (!tokenMatches(req.header("x-admin-token") ?? "", expected)) {
    res.status(401).json({ error: "token ไม่ถูกต้อง" });
    return;
  }
  next();
}

/** เทียบ token แบบ constant-time */
export function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// สำหรับหน้าที่เปิดในเบราว์เซอร์ (เช่น /auth/youtube/start) รับ token ได้ทั้ง header x-admin-token และ ?token=
export function requireAdminQueryOrHeader(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    res.status(500).send("ADMIN_TOKEN ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์");
    return;
  }
  const q = req.query?.token;
  const provided = req.header("x-admin-token") ?? (typeof q === "string" ? q : "");
  if (!tokenMatches(provided, expected)) {
    res.status(401).send("token ไม่ถูกต้อง — เปิด /auth/youtube/start?token=<ADMIN_TOKEN>");
    return;
  }
  next();
}
