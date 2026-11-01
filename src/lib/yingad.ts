// สะพานจากโปรเจกต์ยิงแอด (noomrachit/yingad-links) → social-poster
// อ่านไฟล์ daily-pick/YYYY-MM-DD.md ที่เดชา (Claude) ทำทุกเช้า แล้วแปลงเป็นฉบับร่างโพสต์
// ไม่เปิดลิงก์ Shopee ใด ๆ (กันคลิกปลอม) ดึงแค่ไฟล์ข้อความจาก GitHub

const DEFAULT_RAW_BASE = "https://raw.githubusercontent.com/noomrachit/yingad-links/main";
const DEFAULT_HUB_URL = "https://noomrachit.github.io/yingad-links/";

export interface DailyPick {
  date: string;
  product: string;
  hook: string;
  videoUrl: string;
  tiktokCaption: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(value: string): boolean {
  return DATE_RE.test(value);
}

/** วันที่วันนี้ตามเขตเวลาที่กำหนด (ค่าเริ่มต้น Asia/Jerusalem ตามเวลาของทีม) */
export function todayIn(timeZone = process.env.YINGAD_TZ || "Asia/Jerusalem", now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function field(section: string, name: string): string | undefined {
  const m = section.match(new RegExp(`^- ${name}:\\s*(.+)$`, "m"));
  return m?.[1].trim();
}

/** แยกหัวข้อ "สินค้าเด่น TikTok" ออกจาก daily-pick คืน null ถ้ารูปแบบไม่ตรง */
export function parseDailyPick(markdown: string, date: string): DailyPick | null {
  const start = markdown.indexOf("## สินค้าเด่น TikTok");
  if (start < 0) return null;
  const rest = markdown.slice(start + 3);
  const next = rest.search(/^## /m);
  const section = next < 0 ? rest : rest.slice(0, next);

  const product = field(section, "ชื่อ");
  const hook = field(section, "title \\(hook\\)");
  const videoUrl = field(section, "คลิป")?.match(/https?:\/\/\S+\.mp4/)?.[0];
  const caption = section.match(/\*\*แคปชัน TikTok\*\*[^\n]*\n```\n([\s\S]*?)\n```/)?.[1].trim();
  if (!product || !hook || !videoUrl || !caption) return null;
  return { date, product, hook, videoUrl, tiktokCaption: caption };
}

/**
 * ทำเนื้อหาสำหรับ YouTube Shorts (บรรทัดแรก = ชื่อคลิป ตามรูปแบบของ youtube provider)
 * แคปชัน TikTok บอกให้ไปดูลิงก์ในโปรไฟล์ — บน YouTube เติมลิงก์หน้ารวมลิงก์ให้กดได้ทันที
 */
export function toYoutubeContent(pick: DailyPick, hubUrl = process.env.YINGAD_HUB_URL || DEFAULT_HUB_URL): string {
  const title = `${pick.hook} #Shorts`.slice(0, 100);
  const body = pick.tiktokCaption.replace(/กดดูที่ลิงก์ในโปรไฟล์/g, "กดดูที่ลิงก์ด้านล่าง");
  const hubLine = body.includes(hubUrl) ? "" : `\nลิงก์ทั้งหมด → ${hubUrl}`;
  return `${title}\n${body}${hubLine}`;
}

/** ดึง daily-pick ของวันที่ระบุจาก GitHub */
export async function fetchDailyPick(date: string, rawBase = process.env.YINGAD_RAW_BASE || DEFAULT_RAW_BASE): Promise<string | null> {
  if (!isDate(date)) throw new Error("date ต้องเป็นรูปแบบ YYYY-MM-DD");
  const res = await fetch(`${rawBase}/daily-pick/${date}.md`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ดึง daily-pick ไม่สำเร็จ (HTTP ${res.status})`);
  return res.text();
}
