import { composeLocal } from "../studio-client/compose.js";
import {
  sceneCount,
  STYLE_BRIEFS,
  STYLES,
  VOICES,
  type DraftInput,
  type Scene,
  type Seconds,
  type ShortPlan,
  type StyleId,
  type VoiceId,
} from "../studio-client/types.js";

// ฝั่งเซิร์ฟเวอร์ของสตูดิโอ: เรียก xAI (Grok) เขียนสคริปต์ / สร้างภาพฉาก / สร้างเสียงพากย์
// XAI_API_KEY ตั้งผ่าน ENV ของเซิร์ฟเวอร์เท่านั้น ไม่ส่งไปเบราว์เซอร์

const STYLE_IDS: StyleId[] = STYLES.map((item) => item.id);
const VOICE_IDS: VoiceId[] = VOICES.map((item) => item.id);
const MAX_SPEAK_CHARS = 900;

export function parseDraftInput(input: unknown): DraftInput {
  if (!input || typeof input !== "object") throw new Error("ข้อมูลไม่ครบ");
  const raw = input as Record<string, unknown>;
  const topic = typeof raw.topic === "string" ? raw.topic.trim().replace(/\s+/g, " ") : "";
  if (topic.length < 2 || topic.length > 80) throw new Error("หัวข้อควรยาว 2–80 ตัวอักษร");
  if (!STYLE_IDS.includes(raw.style as StyleId)) throw new Error("สูตรคลิปไม่ถูกต้อง");
  if (raw.seconds !== 15 && raw.seconds !== 30 && raw.seconds !== 45) {
    throw new Error("ความยาวต้องเป็น 15, 30 หรือ 45 วินาที");
  }
  return {
    topic,
    style: raw.style as StyleId,
    seconds: raw.seconds as Seconds,
    useAi: raw.useAi === true,
    withImage: raw.withImage === true,
  };
}

function clip(value: unknown, max: number, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  return [...text].slice(0, max).join("");
}

function normalizeTags(tags: unknown) {
  const list = Array.isArray(tags)
    ? tags
    : typeof tags === "string"
      ? tags.split(/[\s,]+/)
      : [];
  const clean = list
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
  if (!clean.some((tag) => tag.toLowerCase() === "#shorts")) clean.unshift("#Shorts");
  for (const tag of ["#YouTubeShorts", "#คลิปสั้น"]) {
    if (!clean.some((item) => item.toLowerCase() === tag.toLowerCase())) clean.push(tag);
  }
  return [...new Set(clean)].slice(0, 8);
}

function contentText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String(part.text ?? "");
        return "";
      })
      .join("");
  }
  return "";
}

function parseJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("สคริปต์ที่ได้ไม่ใช่ JSON");
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

function asScenes(value: unknown, fallback: Scene[], count: number): Scene[] {
  const rows = Array.isArray(value) ? value : [];
  const scenes: Scene[] = [];
  for (let i = 0; i < count; i += 1) {
    const row = rows[i];
    const base = fallback[i] ?? fallback[fallback.length - 1];
    if (!row || typeof row !== "object") {
      scenes.push(base);
      continue;
    }
    const item = row as Record<string, unknown>;
    scenes.push({
      kicker: clip(item.kicker, 16, base.kicker),
      caption: clip(item.caption, 90, base.caption),
      narration: clip(item.narration, 220, base.narration),
    });
  }
  return scenes;
}

const SYSTEM = `คุณเป็นผู้เขียนสคริปต์ YouTube Shorts ภาษาไทย
โทนพูดตรง เป็นธรรมชาติ อ่านบนจอแล้วเข้าใจโดยไม่ต้องมีเสียง ห้ามใช้อีโมจิ ห้ามแฮชแท็กใน caption
ห้ามอ้างว่ารักษาโรคได้หรือการันตีรายได้ ถ้าหัวข้อเสี่ยง ให้พูดเป็นข้อสังเกตทั่วไป
ตอบเป็น JSON ล้วนเท่านั้น
{
  "title": "ไม่เกิน 70 ตัวอักษร",
  "description": "สองประโยค ไม่ใส่แฮชแท็ก",
  "hashtags": ["#Shorts"],
  "imagePrompt": "English cinematic still, no text no logo no watermark",
  "scenes": [{"kicker":"ป้ายสั้น","caption":"ไม่เกิน 2 บรรทัด คั่นด้วย \\n แต่ละบรรทัดไม่เกิน 18 ตัวอักษร","narration":"ประโยคพากย์หนึ่งประโยค"}]
}`;

async function fromGrok(input: DraftInput, apiKey: string, fallback: ShortPlan): Promise<ShortPlan> {
  const count = sceneCount(input.seconds);
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0.7,
      max_tokens: 900,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `หัวข้อ: ${input.topic}
สูตร: ${STYLE_BRIEFS[input.style]}
ความยาว: ${input.seconds} วินาที
จำนวนฉาก: ${count} ฉากเป๊ะ ฉากแรกคือฮุค ฉากสุดท้ายชวนให้ทำหรือจำ
ผูกเนื้อหากับหัวข้อนี้จริง ห้ามเขียนคำแนะนำที่ใช้กับทุกหัวข้อได้`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`เขียนสคริปต์ไม่สำเร็จ (${res.status})`);
  const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const parsed = parseJson(contentText(body.choices?.[0]?.message?.content));
  return {
    topic: input.topic,
    style: input.style,
    seconds: input.seconds,
    title: clip(parsed.title, 80, fallback.title),
    description: clip(parsed.description, 280, fallback.description),
    hashtags: normalizeTags(parsed.hashtags),
    scenes: asScenes(parsed.scenes, fallback.scenes, count),
    imagePrompt: clip(parsed.imagePrompt, 400, fallback.imagePrompt),
    source: "grok",
  };
}

async function generateStill(prompt: string, apiKey: string) {
  const models = ["grok-imagine-image", "grok-imagine-image-2.0"];
  for (const model of models) {
    const res = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      signal: AbortSignal.timeout(45000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt: `${prompt}. Vertical photograph, 9:16, no text, no letters, no logo, no watermark, no collage.`,
        n: 1,
        aspect_ratio: "9:16",
        resolution: "1k",
        response_format: "b64_json",
      }),
    });
    if (!res.ok) continue;
    const body = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const item = body.data?.[0];
    if (item?.b64_json) return `data:image/jpeg;base64,${item.b64_json}`;
    if (item?.url) {
      const img = await fetch(item.url, { signal: AbortSignal.timeout(20000) });
      if (!img.ok) return null;
      const mime = img.headers.get("content-type") || "image/jpeg";
      const buf = Buffer.from(await img.arrayBuffer());
      return `data:${mime};base64,${buf.toString("base64")}`;
    }
  }
  return null;
}

function joinNote(current: string | null, extra: string) {
  return current ? `${current} ${extra}` : extra;
}


export async function draftShort(data: DraftInput): Promise<{ plan: ShortPlan; image: string | null; note: string | null }> {
  const apiKey = process.env.XAI_API_KEY;
  let plan = composeLocal(data);
  let note: string | null = null;

  if (data.useAi) {
    if (!apiKey) {
      note = "ใช้ร่างในเครื่อง เพราะ AI ยังไม่พร้อม";
    } else {
      try {
        plan = await fromGrok(data, apiKey, plan);
      } catch {
        note = "ใช้ร่างในเครื่อง เพราะเขียนด้วย Grok ไม่สำเร็จ";
      }
    }
  }

  let image: string | null = null;
  if (data.withImage) {
    if (!apiKey) {
      note = joinNote(note, "ข้ามภาพฉาก เพราะ AI ยังไม่พร้อม");
    } else {
      try {
        image = await generateStill(plan.imagePrompt || plan.topic, apiKey);
        if (!image) note = joinNote(note, "สคริปต์พร้อมแล้ว แต่สร้างภาพฉากไม่สำเร็จ");
      } catch {
        note = joinNote(note, "สคริปต์พร้อมแล้ว แต่สร้างภาพฉากไม่สำเร็จ");
      }
    }
  }

  return { plan, image, note };
}

export function parseSpeakInput(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("ข้อมูลเสียงไม่ครบ");
  const raw = input as Record<string, unknown>;
  const text = typeof raw.text === "string" ? raw.text.replace(/\s+/g, " ").trim() : "";
  const chars = [...text];
  if (chars.length < 2) throw new Error("ยังไม่มีข้อความพากย์");
  const voice = VOICE_IDS.includes(raw.voice as VoiceId) ? (raw.voice as VoiceId) : "eve";
  return { text: chars.slice(0, MAX_SPEAK_CHARS).join(""), voice, trimmed: chars.length > MAX_SPEAK_CHARS };
}

export type SpeakResult =
  | { ok: true; audio: string; mime: string; trimmed: boolean }
  | { ok: false; error: string };

export async function speakShort(data: ReturnType<typeof parseSpeakInput>): Promise<SpeakResult> {
  const apiKey = process.env.XAI_API_KEY;
  const fallback = (why: string): SpeakResult => ({ ok: false, error: `ใช้เสียงของเครื่องนี้แทน เพราะ${why}` });
  if (!apiKey) return fallback("บริการพากย์ยังไม่พร้อม");

  let res: Response;
  try {
    res = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: data.text, voice_id: data.voice, language: "th" }),
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    return fallback("ติดต่อบริการพากย์ไม่สำเร็จ");
  }
  if (!res.ok) return fallback("สร้างไฟล์เสียงไม่สำเร็จ");

  const type = (res.headers.get("content-type") || "audio/mpeg").split(";")[0]?.trim() || "audio/mpeg";
  if (type.includes("json") || type.startsWith("text/")) return fallback("บริการพากย์ตอบกลับไม่ใช่ไฟล์เสียง");

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength < 200 || buf.byteLength > 1_800_000) return fallback("ไฟล์เสียงใช้ไม่ได้");
  return { ok: true, audio: buf.toString("base64"), mime: type, trimmed: data.trimmed };
}
