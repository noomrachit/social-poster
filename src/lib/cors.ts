import type { NextFunction, Request, Response } from "express";

// CORS แบบ allowlist ผ่าน ENV CORS_ORIGINS (คั่นด้วยจุลภาค เช่น https://a.example,https://b.example)
// - ไม่ตั้ง CORS_ORIGINS = ปิด CORS ทั้งหมด (พฤติกรรมเดิม)
// - ไม่รองรับ "*" (ถูกตัดทิ้ง) และไม่ส่ง Access-Control-Allow-Credentials
// - ตอบ preflight (OPTIONS) ตรงนี้ก่อนถึง auth
const ALLOWED_HEADERS = "x-dashboard-token, x-admin-token, content-type";
const ALLOWED_METHODS = "GET, POST, OPTIONS";

export function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => s && s !== "*");
}

export function corsAllowlist(req: Request, res: Response, next: NextFunction): void {
  const allowed = parseCorsOrigins(process.env.CORS_ORIGINS);
  if (allowed.length === 0) {
    next();
    return;
  }

  const origin = req.header("origin");
  const isPreflight = req.method === "OPTIONS";
  if (!origin) {
    next();
    return;
  }

  if (!allowed.includes(origin)) {
    if (isPreflight) {
      res.status(403).json({ error: "origin ไม่อยู่ในรายการที่อนุญาต" });
      return;
    }
    next(); // ไม่ใส่ header CORS ให้ — เบราว์เซอร์จะบล็อกเอง
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  if (isPreflight) {
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
    res.setHeader("Access-Control-Max-Age", "600");
    res.status(204).end();
    return;
  }
  next();
}
