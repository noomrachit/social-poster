import { Router } from "express";
import { isAllowedType, mediaPath, saveMedia, UploadTooLargeError } from "../lib/media-store.js";
import { requireAdmin } from "../lib/admin-auth.js";

export const mediaRouter = Router();

// POST /media — อัปโหลดไฟล์ดิบ (body = ไฟล์เลย, ไม่ใช่ multipart)
//   curl -H "x-admin-token: $T" -H "content-type: video/mp4" --data-binary @clip.mp4 "$URL/media?name=clip.mp4"
// คืน { url } เอาไปใส่ mediaUrls ตอนโพสต์ได้เลย
mediaRouter.post("/media", requireAdmin, async (req, res) => {
  const contentType = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (!isAllowedType(contentType)) {
    res.status(415).json({ error: "รองรับเฉพาะไฟล์ video/* และ image/* (ตั้ง content-type ให้ตรงชนิดไฟล์)" });
    return;
  }
  try {
    const name = typeof req.query.name === "string" ? req.query.name : undefined;
    const saved = await saveMedia(req, contentType, name);
    const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? `${req.protocol}://${req.get("host")}`;
    res.status(201).json({ url: `${base}/media/${saved.name}`, name: saved.name, size: saved.size, contentType });
  } catch (err) {
    if (err instanceof UploadTooLargeError) {
      res.status(413).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /media/:name — เปิดสาธารณะ (ชื่อไฟล์สุ่ม เดาไม่ได้) เพื่อให้แพลตฟอร์มปลายทางดึงไฟล์ไปได้
mediaRouter.get("/media/:name", async (req, res) => {
  const path = await mediaPath(req.params.name);
  if (!path) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.sendFile(path, { dotfiles: "deny" });
});
