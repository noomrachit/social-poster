import { Router } from "express";
import { Readable } from "node:stream";
import { saveMedia } from "../lib/media-store.js";
import { synthesize, TtsError } from "../lib/tts.js";

export const ttsRouter = Router();

// POST /tts { text, voice? } — สร้างเสียงพูด เก็บไฟล์ mp3 แล้วคืน URL (ล็อกด้วย token ที่ src/index.ts)
ttsRouter.post("/tts", async (req, res) => {
  const { text, voice } = (req.body ?? {}) as { text?: unknown; voice?: unknown };
  if (typeof text !== "string" || (voice !== undefined && typeof voice !== "string")) {
    res.status(400).json({ error: "text (ข้อความ) จำเป็น และ voice ต้องเป็นข้อความ" });
    return;
  }
  try {
    const audio = await synthesize(text, voice);
    const saved = await saveMedia(Readable.from(audio), "audio/mpeg", "speech.mp3");
    const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? `${req.protocol}://${req.get("host")}`;
    res.status(201).json({ url: `${base}/media/${saved.name}`, name: saved.name, size: saved.size, contentType: "audio/mpeg" });
  } catch (err) {
    if (err instanceof TtsError) {
      res.status(err.message.includes("ยังไม่ได้ตั้ง") ? 503 : 400).json({ error: err.message });
      return;
    }
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
