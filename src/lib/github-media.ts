// ดึงคลิปที่ Grok ส่งออกลงรีโป GitHub (ส่วนตัว) เข้าที่เก็บสื่อของแอป เพื่อเอาไปใช้กับ render_clip ได้
// ต้องตั้ง GITHUB_READ_TOKEN (fine-grained, อ่านอย่างเดียว เฉพาะรีโปนั้น) และอาจตั้ง GROK_EXPORT_REPO
import { Readable } from "node:stream";
import { saveMedia } from "./media-store.js";

const DEFAULT_REPO = "noomrachit/grove-cosmic-able-yellow";
const DIR = "artifacts/imagine_videos";
const FILE_RE = /^[A-Za-z0-9_-]{3,40}\.mp4$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_BYTES = 60 * 1024 * 1024;

function config(): { repo: string; token: string } {
  const token = process.env.GITHUB_READ_TOKEN;
  if (!token) throw new Error("ยังไม่ได้ตั้ง GITHUB_READ_TOKEN บนเซิร์ฟเวอร์ (โทเคนอ่านอย่างเดียวของรีโป Grok)");
  const repo = process.env.GROK_EXPORT_REPO || DEFAULT_REPO;
  if (!REPO_RE.test(repo)) throw new Error("GROK_EXPORT_REPO ไม่ถูกรูปแบบ owner/repo");
  return { repo, token };
}

/** ยอมรับเฉพาะไฟล์ .mp4 ในโฟลเดอร์ artifacts/imagine_videos (รับได้ทั้งชื่อไฟล์เปล่าหรือพาธเต็ม) */
export function normalizeGrokPath(input: string): string {
  const p = input.trim().replace(/^\/+/, "");
  const file = p.startsWith(`${DIR}/`) ? p.slice(DIR.length + 1) : p;
  if (!FILE_RE.test(file)) throw new Error("ชื่อไฟล์ไม่ถูกต้อง ต้องเป็น .mp4 ในโฟลเดอร์ artifacts/imagine_videos");
  return `${DIR}/${file}`;
}

const headers = (token: string, accept: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: accept,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "social-poster",
});

export async function listGrokVideos(): Promise<{ file: string; bytes: number }[]> {
  const { repo, token } = config();
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${DIR}`, {
    headers: headers(token, "application/vnd.github+json"),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} (ตรวจสิทธิ์ของโทเคนและชื่อรีโป)`);
  const items: any[] = await res.json();
  return items.filter((i) => i.type === "file" && FILE_RE.test(i.name)).map((i) => ({ file: i.name as string, bytes: i.size as number }));
}

/** ดึงไฟล์ 1 ไฟล์เข้าที่เก็บสื่อของแอป คืนชื่อไฟล์ใหม่ใน /media */
export async function importGrokVideo(path: string): Promise<{ name: string; size: number }> {
  const { repo, token } = config();
  const safe = normalizeGrokPath(path);
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${safe}`, {
    headers: headers(token, "application/vnd.github.raw+json"),
    redirect: "follow",
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok || !res.body) throw new Error(`ดึงไฟล์ไม่สำเร็จ (GitHub ${res.status})`);
  const saved = await saveMedia(Readable.fromWeb(res.body as any), "video/mp4", safe, MAX_BYTES);
  return { name: saved.name, size: saved.size };
}
