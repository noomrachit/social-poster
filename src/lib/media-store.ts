import { createWriteStream } from "node:fs";
import { appendFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform, type Readable } from "node:stream";
import { nanoid } from "nanoid";

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 500) * 1024 * 1024;

const ALLOWED_PREFIXES = ["video/", "image/", "audio/"];
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
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
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

const UPLOAD_ID = /^[A-Za-z0-9_-]{16}$/;
const PARTIAL_DIR = ".partial";

/**
 * อัปโหลดแบบแบ่งก้อน (base64) สำหรับ client ที่ส่งไฟล์ดิบไม่ได้ เช่น MCP
 * ก้อนแรกไม่ต้องส่ง uploadId → ได้ uploadId กลับ; ก้อนสุดท้ายใส่ last=true → ย้ายเป็นไฟล์จริง
 */
export async function appendMediaChunk(opts: {
  uploadId?: string;
  data: Buffer;
  contentType: string;
  name?: string;
  last: boolean;
  maxBytes?: number;
}): Promise<{ uploadId: string; size: number; done: false } | { done: true; name: string; size: number; contentType: string }> {
  const maxBytes = opts.maxBytes ?? MAX_UPLOAD_BYTES;
  if (!isAllowedType(opts.contentType)) throw new Error("รองรับเฉพาะไฟล์ video/*, image/* และ audio/*");
  if (opts.uploadId !== undefined && !UPLOAD_ID.test(opts.uploadId)) throw new Error("uploadId ไม่ถูกต้อง");
  const dir = join(mediaDir(), PARTIAL_DIR);
  await mkdir(dir, { recursive: true });
  const uploadId = opts.uploadId ?? nanoid(16).replace(/[^A-Za-z0-9_-]/g, "x").padEnd(16, "x").slice(0, 16);
  const partial = join(dir, uploadId);
  if (opts.uploadId !== undefined) {
    await stat(partial).catch(() => {
      throw new Error("ไม่พบ uploadId นี้ (เริ่มใหม่โดยไม่ส่ง uploadId)");
    });
  }
  const prev = opts.uploadId !== undefined ? (await stat(partial)).size : 0;
  if (prev + opts.data.length > maxBytes) {
    await unlink(partial).catch(() => {});
    throw new UploadTooLargeError(`ไฟล์ใหญ่เกิน ${Math.floor(maxBytes / 1024 / 1024)} MB`);
  }
  await appendFile(partial, opts.data);
  const size = prev + opts.data.length;
  if (!opts.last) return { uploadId, size, done: false };
  if (size === 0) {
    await unlink(partial).catch(() => {});
    throw new Error("ไฟล์ว่างเปล่า");
  }
  const name = `${nanoid(16)}${extensionFor(opts.contentType, opts.name)}`;
  await rename(partial, join(mediaDir(), name));
  return { done: true, name, size, contentType: opts.contentType };
}
