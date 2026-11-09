// เรียก Claude (Anthropic Messages API) จากฝั่งเซิร์ฟเวอร์เท่านั้น
// ANTHROPIC_API_KEY ตั้งผ่าน ENV (Railway Variables) ไม่ส่งไปเบราว์เซอร์ ไม่เก็บลงฐานข้อมูล
export const CLAUDE_MODELS = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"] as const;
export type ClaudeModel = (typeof CLAUDE_MODELS)[number];

export class ClaudeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function claudeModel(requested?: unknown): ClaudeModel {
  if (CLAUDE_MODELS.includes(requested as ClaudeModel)) return requested as ClaudeModel;
  const fromEnv = process.env.ANTHROPIC_MODEL;
  return CLAUDE_MODELS.includes(fromEnv as ClaudeModel) ? (fromEnv as ClaudeModel) : "claude-sonnet-5-5";
}

export function claudeReady(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

interface AskOptions {
  model?: unknown;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function askClaude(system: string, user: string, opts: AskOptions = {}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ClaudeError("ANTHROPIC_API_KEY ยังไม่ได้ตั้งบนเซิร์ฟเวอร์", 503);
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60000),
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: claudeModel(opts.model),
      max_tokens: opts.maxTokens ?? 1000,
      temperature: opts.temperature ?? 0.7,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new ClaudeError("401 — ANTHROPIC_API_KEY ผิดหรือหมดอายุ", 502);
    if (res.status === 429) throw new ClaudeError("429 — ใช้งานถี่เกินไป ลองใหม่ภายหลัง", 429);
    throw new ClaudeError(`${res.status} — เรียก Claude ไม่สำเร็จ`, 502);
  }
  const body = (await res.json()) as { content?: { type?: string; text?: string }[] };
  const text = (body.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
  if (!text) throw new ClaudeError("Claude ไม่ส่งข้อความกลับมา", 502);
  return text;
}
