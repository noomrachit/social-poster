// แปลงข้อความเป็นเสียงพูด (mp3) — เลือกผู้ให้บริการด้วย TTS_PROVIDER = openai | elevenlabs | google
// คีย์อ่านจาก ENV เท่านั้น: OPENAI_API_KEY / ELEVENLABS_API_KEY (+ ELEVENLABS_VOICE_ID) / GOOGLE_TTS_API_KEY

export const MAX_TTS_CHARS = 2000;
export const TTS_PROVIDERS = ["openai", "elevenlabs", "google"] as const;
export type TtsProvider = (typeof TTS_PROVIDERS)[number];

export class TtsError extends Error {}

type Fetch = typeof fetch;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new TtsError(`ยังไม่ได้ตั้ง ${name} บนเซิร์ฟเวอร์`);
  return v;
}

async function ok(res: Response, who: string): Promise<Response> {
  if (res.ok) return res;
  const body = (await res.text().catch(() => "")).slice(0, 200);
  throw new TtsError(`${who}: HTTP ${res.status} ${body}`);
}

export function currentProvider(): TtsProvider {
  const p = (process.env.TTS_PROVIDER ?? "").toLowerCase();
  if (!(TTS_PROVIDERS as readonly string[]).includes(p)) {
    throw new TtsError(`ยังไม่ได้ตั้ง TTS_PROVIDER (เลือก ${TTS_PROVIDERS.join(" / ")})`);
  }
  return p as TtsProvider;
}

/** คืนไฟล์เสียง mp3 เป็น Buffer; voice ใช้แทนค่าเริ่มต้นของผู้ให้บริการ (ถ้าระบุ) */
export async function synthesize(text: string, voice?: string, fetchImpl: Fetch = fetch): Promise<Buffer> {
  const input = text.trim();
  if (!input) throw new TtsError("ไม่มีข้อความ");
  if (input.length > MAX_TTS_CHARS) throw new TtsError(`ข้อความยาวเกิน ${MAX_TTS_CHARS} ตัวอักษร`);

  switch (currentProvider()) {
    case "openai": {
      const res = await ok(
        await fetchImpl("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: { Authorization: `Bearer ${need("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: process.env.TTS_OPENAI_MODEL || "tts-1",
            voice: voice || process.env.TTS_OPENAI_VOICE || "alloy",
            input,
            response_format: "mp3",
          }),
        }),
        "OpenAI"
      );
      return Buffer.from(await res.arrayBuffer());
    }
    case "elevenlabs": {
      const voiceId = voice || need("ELEVENLABS_VOICE_ID");
      const res = await ok(
        await fetchImpl(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: { "xi-api-key": need("ELEVENLABS_API_KEY"), "Content-Type": "application/json" },
            body: JSON.stringify({ text: input, model_id: process.env.TTS_ELEVENLABS_MODEL || "eleven_multilingual_v2" }),
          }
        ),
        "ElevenLabs"
      );
      return Buffer.from(await res.arrayBuffer());
    }
    case "google": {
      const name = voice || process.env.TTS_GOOGLE_VOICE;
      const res = await ok(
        await fetchImpl(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(need("GOOGLE_TTS_API_KEY"))}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              input: { text: input },
              voice: { languageCode: "th-TH", ...(name ? { name } : {}) },
              audioConfig: { audioEncoding: "MP3" },
            }),
          }
        ),
        "Google TTS"
      );
      const data = (await res.json()) as { audioContent?: string };
      if (!data.audioContent) throw new TtsError("Google TTS: ไม่มีข้อมูลเสียงกลับมา");
      return Buffer.from(data.audioContent, "base64");
    }
  }
}
