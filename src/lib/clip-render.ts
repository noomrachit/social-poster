// สร้างคลิป 9:16 อัตโนมัติจากวิดีโอสต็อกฟรี (Pexels) หรือวิดีโอในแอป + ข้อความบนจอ + เสียงพากย์ + ดนตรีสังเคราะห์
// ต้องมี ffmpeg และฟอนต์ไทย (fonts-thai-tlwg) บนเซิร์ฟเวอร์ และตั้ง PEXELS_API_KEY (ฟรี) ถ้าจะค้นหาวิดีโอสต็อก
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile, rename, stat } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { nanoid } from "nanoid";
import { mediaDir, mediaPath, SAFE_NAME } from "./media-store.js";

const PEXELS = "https://api.pexels.com/videos";
const ALLOWED_HOSTS = [/(^|\.)pexels\.com$/];
const MAX_DOWNLOAD = 120 * 1024 * 1024;

export type SceneInput = { pexelsId?: number; mediaUrl?: string; seconds: number; text?: string };

function pexelsKey(): string {
  const k = process.env.PEXELS_API_KEY;
  if (!k) throw new Error("ยังไม่ได้ตั้ง PEXELS_API_KEY บนเซิร์ฟเวอร์ (สมัครฟรีที่ pexels.com/api)");
  return k;
}

export type PexelsFile = { quality?: string; file_type?: string; width: number; height: number; link: string };

/** เลือกไฟล์แนวตั้ง mp4 ที่กว้างอย่างน้อย 720 และเล็กที่สุดเท่าที่ทำได้ (ประหยัดเน็ต) */
export function pickPexelsFile(files: PexelsFile[]): PexelsFile | null {
  const ok = files.filter((f) => f.file_type === "video/mp4" && f.height > f.width && f.width >= 720);
  if (ok.length === 0) return null;
  return ok.sort((a, b) => a.width - b.width)[0];
}

export async function searchStock(query: string, limit = 6) {
  const url = `${PEXELS}/search?query=${encodeURIComponent(query)}&orientation=portrait&size=medium&per_page=${Math.min(Math.max(limit, 1), 15)}`;
  const res = await fetch(url, { headers: { Authorization: pexelsKey() }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const data: any = await res.json();
  return (data.videos ?? []).map((v: any) => ({
    id: v.id as number,
    seconds: v.duration as number,
    page: v.url as string,
    preview: v.image as string,
    usable: pickPexelsFile(v.video_files ?? []) !== null,
  }));
}

async function download(link: string, dest: string): Promise<void> {
  const u = new URL(link);
  if (u.protocol !== "https:" || !ALLOWED_HOSTS.some((r) => r.test(u.hostname))) throw new Error("ดาวน์โหลดได้เฉพาะจาก pexels.com");
  const res = await fetch(link, { redirect: "follow", signal: AbortSignal.timeout(60_000) });
  if (!res.ok || !res.body) throw new Error(`ดาวน์โหลดไม่สำเร็จ (${res.status})`);
  const final = new URL(res.url || link);
  if (final.protocol !== "https:" || !ALLOWED_HOSTS.some((r) => r.test(final.hostname))) {
    await res.body.cancel();
    throw new Error("ลิงก์ถูกเปลี่ยนเส้นทางไปนอก pexels.com");
  }
  if (Number(res.headers.get("content-length") ?? 0) > MAX_DOWNLOAD) {
    await res.body.cancel();
    throw new Error("ไฟล์ใหญ่เกินกำหนด");
  }
  let size = 0;
  const limiter = new Transform({
    transform(chunk, _e, cb) {
      size += chunk.length;
      size > MAX_DOWNLOAD ? cb(new Error("ไฟล์ใหญ่เกินกำหนด")) : cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body as any), limiter, createWriteStream(dest));
  } catch (e) {
    await rm(dest, { force: true });
    throw e;
  }
}

async function fetchPexelsVideo(id: number, dest: string): Promise<void> {
  const res = await fetch(`${PEXELS}/videos/${id}`, { headers: { Authorization: pexelsKey() }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ไม่พบวิดีโอ Pexels ${id} (${res.status})`);
  const v: any = await res.json();
  const f = pickPexelsFile(v.video_files ?? []);
  if (!f) throw new Error(`วิดีโอ Pexels ${id} ไม่มีไฟล์แนวตั้งที่ใช้ได้`);
  await download(f.link, dest);
}

/** ตัดบรรทัดข้อความไทยตามขอบเขตคำ (ไม่เกิน maxChars ตัวอักษรต่อบรรทัด) */
export function wrapThai(text: string, maxChars = 16): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const seg = new (Intl as any).Segmenter("th", { granularity: "word" });
  const lines: string[] = [];
  let cur = "";
  for (const { segment } of seg.segment(clean) as Iterable<{ segment: string }>) {
    if ((cur + segment).trim().length > maxChars && cur.trim() !== "") {
      lines.push(cur.trim());
      cur = segment.trimStart();
    } else cur += segment;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.join("\n");
}

export function findFont(): string | null {
  const c = [
    process.env.CLIP_FONT,
    "/usr/share/fonts/opentype/tlwg/Loma.otf",
    "/usr/share/fonts/truetype/tlwg/Loma.ttf",
    "/usr/share/fonts/opentype/tlwg/Garuda.otf",
    "/usr/share/fonts/truetype/tlwg/Garuda.ttf",
  ].filter(Boolean) as string[];
  return c.find((p) => existsSync(p)) ?? null;
}

export function buildFilter(opts: { scenes: { seconds: number; textFile?: string }[]; font: string | null; voiceIndex: number | null; total: number }): string {
  const { scenes, font, voiceIndex, total } = opts;
  const parts: string[] = [];
  scenes.forEach((s, i) => {
    const fade = `fade=t=in:st=0:d=0.4,fade=t=out:st=${Math.max(s.seconds - 0.4, 0).toFixed(2)}:d=0.4`;
    let chain = `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,eq=brightness=-0.05:saturation=0.9,${fade}`;
    if (s.textFile && font) {
      chain += `,drawtext=fontfile=${font}:textfile=${s.textFile}:fontsize=64:fontcolor=white:expansion=none:line_spacing=14:box=1:boxcolor=black@0.35:boxborderw=28:x=(w-text_w)/2:y=h*0.70`;
    }
    parts.push(`${chain}[v${i}]`);
  });
  parts.push(`${scenes.map((_, i) => `[v${i}]`).join("")}concat=n=${scenes.length}:v=1:a=0[v]`);
  const music = `aevalsrc='0.22*(sin(2*PI*220*t)+sin(2*PI*261.63*t)+sin(2*PI*329.63*t))*(0.65+0.35*sin(2*PI*0.12*t))':s=44100:d=${total},lowpass=f=900,volume=0.5,afade=t=in:d=2,afade=t=out:st=${Math.max(total - 2, 0)}:d=2[mu]`;
  parts.push(music);
  if (voiceIndex !== null) {
    parts.push(`[${voiceIndex}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=400|400,apad=whole_dur=${total}[vo]`);
    parts.push(`[mu]aformat=channel_layouts=stereo,volume=0.35[mq]`);
    parts.push(`[vo][mq]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.9[a]`);
  } else {
    parts.push(`[mu]aformat=channel_layouts=stereo,volume=0.8[a]`);
  }
  return parts.join(";");
}

function run(cmd: string, args: string[], timeoutMs = 300_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`${cmd} ใช้เวลานานเกิน ${Math.round(timeoutMs / 1000)} วินาที จึงยกเลิก`));
    }, timeoutMs);
    p.on("close", () => clearTimeout(timer));
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err = (err + d).slice(-800)));
    p.on("error", () => reject(new Error(`เซิร์ฟเวอร์ไม่มี ${cmd}`)));
    p.on("close", (c) => (c === 0 ? resolve(out) : reject(new Error(`${cmd} ล้มเหลว: ${err}`))));
  });
}

function nameFromUrl(u: string): string {
  const n = u.split("?")[0].split("/").pop() ?? "";
  if (!SAFE_NAME.test(n)) throw new Error("ใช้ได้เฉพาะ url ที่ได้จากแอปนี้ (/media/...)");
  return n;
}

async function renderClipUnlocked(input: { scenes: SceneInput[]; voiceUrl?: string }): Promise<{ url: string; seconds: number; warnings: string[] }> {
  const { scenes, voiceUrl } = input;
  if (scenes.length < 2 || scenes.length > 8) throw new Error("ใส่ 2–8 ฉาก");
  const total = scenes.reduce((a, s) => a + s.seconds, 0);
  if (total < 15 || total > 30) throw new Error(`ความยาวรวม ${total} วินาที ต้องอยู่ระหว่าง 15–30`);
  for (const s of scenes) {
    if (!(s.seconds >= 3 && s.seconds <= 8)) throw new Error("ฉากละ 3–8 วินาที");
    if (!!s.pexelsId === !!s.mediaUrl) throw new Error("แต่ละฉากต้องระบุ pexelsId หรือ mediaUrl อย่างใดอย่างหนึ่ง");
  }
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("ยังไม่ได้ตั้ง APP_BASE_URL บนเซิร์ฟเวอร์");
  const warnings: string[] = [];
  const font = findFont();
  if (scenes.some((s) => s.text) && !font) warnings.push("ไม่พบฟอนต์ไทยบนเซิร์ฟเวอร์ จึงไม่ใส่ข้อความบนจอ (ติดตั้ง fonts-thai-tlwg)");

  const dir = await mkdtemp(join(tmpdir(), "clip-"));
  try {
    const files: string[] = [];
    const textFiles: (string | undefined)[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      if (s.mediaUrl) {
        const p = await mediaPath(nameFromUrl(s.mediaUrl));
        if (!p) throw new Error(`ไม่พบไฟล์ฉาก ${i + 1}`);
        files.push(p);
      } else {
        const dest = join(dir, `s${i}.mp4`);
        await fetchPexelsVideo(s.pexelsId!, dest);
        files.push(dest);
      }
      if (s.text && font) {
        const tf = join(dir, `t${i}.txt`);
        await writeFile(tf, wrapThai(s.text), "utf8");
        textFiles.push(tf);
      } else textFiles.push(undefined);
    }
    let voicePath: string | null = null;
    if (voiceUrl) {
      voicePath = await mediaPath(nameFromUrl(voiceUrl));
      if (!voicePath) throw new Error("ไม่พบไฟล์เสียงพากย์");
      const dur = parseFloat(await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", voicePath]));
      if (dur > total - 0.4) warnings.push(`เสียงพากย์ยาว ${dur.toFixed(1)} วินาที เกินความยาวคลิป ${total} วินาที ท้ายเสียงจะถูกตัด`);
    }
    const args = ["-y", "-loglevel", "error"];
    scenes.forEach((s, i) => args.push("-stream_loop", "-1", "-t", String(s.seconds), "-i", files[i]));
    if (voicePath) args.push("-i", voicePath);
    const filter = buildFilter({
      scenes: scenes.map((s, i) => ({ seconds: s.seconds, textFile: textFiles[i] })),
      font,
      voiceIndex: voicePath ? scenes.length : null,
      total,
    });
    await mkdir(mediaDir(), { recursive: true });
    const name = `${nanoid(16)}.mp4`;
    const tmp = join(mediaDir(), `.tmp-${name}`);
    args.push("-filter_complex", filter, "-map", "[v]", "-map", "[a]", "-t", String(total),
      "-threads", "2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", tmp);
    try {
      await run("ffmpeg", args);
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
    await rename(tmp, join(mediaDir(), name));
    return { url: `${base}/media/${name}`, seconds: total, warnings };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// รันทีละงาน กัน ffmpeg หลายตัวกินเครื่องพร้อมกัน
let queue: Promise<unknown> = Promise.resolve();
export function renderClip(input: { scenes: SceneInput[]; voiceUrl?: string }): Promise<{ url: string; seconds: number; warnings: string[] }> {
  const job = queue.then(() => renderClipUnlocked(input));
  queue = job.catch(() => {});
  return job;
}
