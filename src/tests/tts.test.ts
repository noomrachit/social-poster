import { test } from "node:test";
import assert from "node:assert/strict";
import { synthesize, TtsError, MAX_TTS_CHARS } from "../lib/tts.js";

const bytes = Buffer.from("ID3fake-mp3");
const fakeFetch = (calls: Array<{ url: string; init: any }>, body: () => Response) =>
  (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return body();
  }) as typeof fetch;

function env(vars: Record<string, string | undefined>) {
  for (const k of ["TTS_PROVIDER", "OPENAI_API_KEY", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "GOOGLE_TTS_API_KEY"]) delete process.env[k];
  Object.assign(process.env, vars);
}

test("ไม่ตั้ง provider / ไม่มีข้อความ / ยาวเกิน → TtsError", async () => {
  env({});
  await assert.rejects(synthesize("สวัสดี"), TtsError);
  env({ TTS_PROVIDER: "openai", OPENAI_API_KEY: "k" });
  await assert.rejects(synthesize("   "), TtsError);
  await assert.rejects(synthesize("ก".repeat(MAX_TTS_CHARS + 1)), TtsError);
});

test("openai: ส่ง key ใน header และคืนไบต์เสียง", async () => {
  env({ TTS_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" });
  const calls: any[] = [];
  const out = await synthesize("สวัสดี", undefined, fakeFetch(calls, () => new Response(bytes)));
  assert.deepEqual(out, bytes);
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk-test");
  assert.equal(JSON.parse(calls[0].init.body).input, "สวัสดี");
});

test("elevenlabs: ต้องมี voice id, ใช้ header xi-api-key", async () => {
  env({ TTS_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: "el" });
  await assert.rejects(synthesize("สวัสดี"), /ELEVENLABS_VOICE_ID/);
  const calls: any[] = [];
  const out = await synthesize("สวัสดี", "voice123", fakeFetch(calls, () => new Response(bytes)));
  assert.deepEqual(out, bytes);
  assert.ok(calls[0].url.includes("/text-to-speech/voice123"));
  assert.equal(calls[0].init.headers["xi-api-key"], "el");
});

test("google: ถอด base64 และใช้ th-TH", async () => {
  env({ TTS_PROVIDER: "google", GOOGLE_TTS_API_KEY: "g" });
  const calls: any[] = [];
  const out = await synthesize("สวัสดี", undefined, fakeFetch(calls, () => Response.json({ audioContent: bytes.toString("base64") })));
  assert.deepEqual(out, bytes);
  assert.equal(JSON.parse(calls[0].init.body).voice.languageCode, "th-TH");
});

test("HTTP error จากผู้ให้บริการถูกแปลงเป็น TtsError", async () => {
  env({ TTS_PROVIDER: "openai", OPENAI_API_KEY: "k" });
  await assert.rejects(synthesize("สวัสดี", undefined, fakeFetch([], () => new Response("bad key", { status: 401 }))), /401/);
});
