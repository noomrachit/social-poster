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

  const provided = req.header("x-admin-token") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);

  if (!ok) {
    res.status(401).json({ error: "token ไม่ถูกต้อง" });
    return;
  }
  next();
}
