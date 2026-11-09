import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENTS, STEPS, agentByName, stepPrompt } from "../lib/agents.js";
import { ClaudeError, askClaude, claudeModel } from "../lib/claude.js";

test("ทุกเอเจนต์ในไปป์ไลน์มีอยู่จริง และครบ 12 ตัว", () => {
  assert.equal(AGENTS.length, 12);
  for (const s of STEPS) for (const n of s.agents) assert.ok(agentByName(n), n);
  assert.equal(STEPS.length, 5);
});

test("stepPrompt แนบผลขั้นก่อนหน้า", () => {
  const p = stepPrompt("โปรเจกต์", "โจทย์", 1, ["แผนจากเก่ง"]);
  assert.match(p, /ขั้นที่ 2\/5/);
  assert.match(p, /แผนจากเก่ง/);
});

test("claudeModel รับเฉพาะรุ่นที่อนุญาต", () => {
  assert.equal(claudeModel("claude-haiku-5-5"), "claude-haiku-5-5");
  assert.equal(claudeModel("gpt-4o"), "claude-sonnet-5-5");
});

test("askClaude: ไม่มีคีย์ได้ 503, มีคีย์เรียก Anthropic ด้วย header ถูกต้อง", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await assert.rejects(askClaude("s", "u"), (e: unknown) => e instanceof ClaudeError && e.status === 503);
    process.env.ANTHROPIC_API_KEY = "test-key";
    let seen: { url: string; headers: Record<string, string>; body: { model: string; system: string } } | null = null;
    const fake = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
      seen = { url, headers: init.headers, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ content: [{ type: "text", text: "สวัสดี" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await askClaude("sys", "usr", { fetchImpl: fake });
    assert.equal(out, "สวัสดี");
    assert.equal(seen!.url, "https://api.anthropic.com/v1/messages");
    assert.equal(seen!.headers["x-api-key"], "test-key");
    assert.equal(seen!.body.system, "sys");
    const bad = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    await assert.rejects(askClaude("s", "u", { fetchImpl: bad }), /401/);
  } finally {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved;
  }
});
