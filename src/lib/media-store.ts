import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform, type Readable } from "node:stream";
import { nanoid } from "nanoid";

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 500) * 1024 * 1024;

const ALLOWED_PREFIXES = ["video/", "image/"];
// ชื่อไฟล์ที่เราสร้างเองเท่านั้น (nanoid + นามสกุล) — ใช้กัน path traversal ตอนอ่านไฟล์
export const SAFE_NAME = /^[A-Za-z0-9_-]{10,}\.[a-z0-9]{1,5}$/;

export function mediaDir(): string {
  return process.env.MEDIA_DIR || join(process.cwd(), "uploads");
}

const EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-matroska": ".mkv",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export function isAllowedType(contentType: string): boolean {
  return ALLOWED_PREFIXES.some((p) => contentType.startsWith(p));
}

export function extensionFor(contentType: string, originalName?: string): string {
  if (EXT_BY_TYPE[contentType]) return EXT_BY_TYPE[contentType];
  const ext = originalName ? extname(originalName).toLowerCase() : "";
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : ".bin";
}

export class UploadTooLargeError extends Error {}

/** เก็บ stream ลงดิสก์แบบไม่โหลดทั้งไฟล์เข้า memory; เกินลิมิตจะลบไฟล์ทิ้งแล้ว throw */
export async function saveMedia(
  source: Readable,
  contentType: string,
  originalName?: string,
  maxBytes = MAX_UPLOAD_BYTES
): Promise<{ name: string; size: number; contentType: string }> {
  const dir = mediaDir();
  await mkdir(dir, { recursive: true });
  const name = `${nanoid(16)}${extensionFor(contentType, originalName)}`;
  const path = join(dir, name);

  let size = 0;
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > maxBytes) cb(new UploadTooLargeError(`ไฟล์ใหญ่เกิน ${Math.floor(maxBytes / 1024 / 1024)} MB`));
      else cb(null, chunk);
    },
  });

  try {
    await pipeline(source, limiter, createWriteStream(path));
  } catch (err) {
    await unlink(path).catch(() => {});
    throw err;
  }
  if (size === 0) {
    await unlink(path).catch(() => {});
    throw new Error("ไฟล์ว่างเปล่า");
  }
  return { name, size, contentType };
}

export async function mediaPath(name: string): Promise<string | null> {
  if (!SAFE_NAME.test(name)) return null;
  const path = join(mediaDir(), name);
  try {
    const s = await stat(path);
    return s.isFile() ? path : null;
  } catch {
    return null;
  }
}
