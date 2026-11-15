// เรียก Gemini API (TTS สร้างเสียงพากย์) และประกอบคลิปด้วย ffmpeg — ไม่มีการสร้างวิดีโอผ่าน API (คิดเงิน) ตั้งใจตัดออก
// ต้องตั้ง GEMINI_API_KEY; ไม่ตั้ง = เครื่องมือจะแจ้งว่ายังใช้ไม่ได้ (ไม่พังทั้งแอป)
import { spawn } from "node:child_process";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { nanoid } from "nanoid";
import { mediaDir, mediaPath, SAFE_NAME } from "./media-store.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
export const TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("ยังไม่ได้ตั้ง GEMINI_API_KEY บนเซิร์ฟเวอร์");
  return k;
}

async function gfetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { "x-goog-api-key": apiKey(), "content-type": "application/json", ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res;
}

async function saveBuffer(buf: Buffer, ext: string): Promise<string> {
  const dir = mediaDir();
  await mkdir(dir, { recursive: true });
  const name = `${nanoid(16)}${ext}`;
  await writeFile(join(dir, name), buf);
  return name;
}

function publicUrl(name: string): string {
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("ยังไม่ได้ตั้ง APP_BASE_URL บนเซิร์ฟเวอร์");
  return `${base}/media/${name}`;
}

/** ห่อ PCM 16-bit mono 24kHz เป็นไฟล์ WAV */
export function pcmToWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** สร้างเสียงพากย์ไทย style = คำกำกับน้ำเสียง เช่น "พูดช้า นุ่ม อบอุ่น" */
export async function makeSpeech(text: string, voice: string, style: string): Promise<{ url: string }> {
  const res = await gfetch(`${BASE}/models/${TTS_MODEL}:generateContent`, {
    method: "POST",
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${style}: ${text}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  });
  const data: any = await res.json();
  const b64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error("Gemini ไม่คืนเสียง");
  const name = await saveBuffer(pcmToWav(Buffer.from(b64, "base64")), ".wav");
  return { url: publicUrl(name) };
}

function nameFromUrl(u: string): string {
  const n = u.split("?")[0].split("/").pop() ?? "";
  if (!SAFE_NAME.test(n)) throw new Error("ใช้ได้เฉพาะ url ที่ได้จากแอปนี้ (/media/...)");
  return n;
}

export function buildFfmpegArgs(videos: string[], voice: string | null, out: string): string[] {
  const args: string[] = ["-y"];
  for (const v of videos) args.push("-i", v);
  if (voice) args.push("-i", voice);
  const n = videos.length;
  const vin = videos.map((_, i) => `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1[v${i}];[${i}:a]aresample=44100,aformat=channel_layouts=stereo[a${i}]`).join(";");
  const cat = videos.map((_, i) => `[v${i}][a${i}]`).join("") + `concat=n=${n}:v=1:a=1[v][a]`;
  let filter = `${vin};${cat}`;
  let amap = "[a]";
  if (voice) {
    filter += `;[${n}:a]aresample=44100,aformat=channel_layouts=stereo[vo];[a]volume=0.3[bg];[bg][vo]amix=inputs=2:duration=first:normalize=0[am]`;
    amap = "[am]";
  }
  args.push("-filter_complex", filter, "-map", "[v]", "-map", amap,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out);
  return args;
}

/** ต่อฉากวิดีโอ (จากแอปนี้) เป็นคลิปเดียว แล้วผสมเสียงพากย์ถ้ามี */
export async function assembleClip(videoUrls: string[], voiceUrl?: string): Promise<{ url: string }> {
  if (videoUrls.length < 1 || videoUrls.length > 8) throw new Error("ใส่วิดีโอ 1–8 ฉาก");
  const paths: string[] = [];
  for (const u of videoUrls) {
    const p = await mediaPath(nameFromUrl(u));
    if (!p) throw new Error(`ไม่พบไฟล์: ${u}`);
    paths.push(p);
  }
  let voice: string | null = null;
  if (voiceUrl) {
    voice = await mediaPath(nameFromUrl(voiceUrl));
    if (!voice) throw new Error(`ไม่พบไฟล์เสียง: ${voiceUrl}`);
  }
  const name = `${nanoid(16)}.mp4`;
  const tmp = join(mediaDir(), `.tmp-${name}`);
  const final = join(mediaDir(), name);
  const args = buildFfmpegArgs(paths, voice, tmp.endsWith(".mp4") ? tmp : `${tmp}.mp4`);
  const outPath = args[args.length - 1];
  await new Promise<void>((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err = (err + d).slice(-600)));
    p.on("error", () => reject(new Error("เซิร์ฟเวอร์ไม่มี ffmpeg")));
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ล้มเหลว: ${err}`))));
  }).catch(async (e) => {
    await unlink(outPath).catch(() => {});
    throw e;
  });
  const { rename } = await import("node:fs/promises");
  await rename(outPath, final);
  return { url: publicUrl(name) };
}
