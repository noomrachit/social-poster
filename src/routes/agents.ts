import { Router } from "express";
import { AGENTS, PRESETS, STEPS, agentByName, agentSystem, cleanText, stepPrompt } from "../lib/agents.js";
import { ClaudeError, CLAUDE_MODELS, askClaude, claudeModel, claudeReady } from "../lib/claude.js";

// การล็อก token ทำใน src/index.ts (ครอบเฉพาะ /agents-api)
export const agentsRouter = Router();

agentsRouter.get("/agents-api/config", (_req, res) => {
  res.json({ agents: AGENTS, presets: PRESETS, steps: STEPS, models: CLAUDE_MODELS, defaultModel: claudeModel(), ready: claudeReady() });
});

function fail(res: import("express").Response, err: unknown) {
  if (err instanceof ClaudeError) {
    res.status(err.status === 503 ? 503 : err.status === 429 ? 429 : 502).json({ error: err.message });
    return;
  }
  res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
}

// POST /agents-api/test — ทดสอบเอเจนต์ตัวเดียว { agent, project?, brief?, model? }
agentsRouter.post("/agents-api/test", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const agent = agentByName(b.agent);
  if (!agent) { res.status(400).json({ error: "ไม่รู้จักเอเจนต์นี้" }); return; }
  try {
    const text = await askClaude(
      agentSystem(agent),
      `ทดสอบเดี่ยวด้วยโจทย์นี้: ${cleanText(b.brief) || "-"}\nโปรเจกต์: ${cleanText(b.project, 200) || "-"}`,
      { model: b.model, maxTokens: 900 }
    );
    res.json({ agent: agent.name, model: claudeModel(b.model), text });
  } catch (err) { fail(res, err); }
});

// POST /agents-api/step — รัน 1 ขั้นของไปป์ไลน์ { step: 0-4, project, brief, previous: string[], model? }
// หน้าเว็บเรียกทีละขั้นตามลำดับ เพื่อแสดงความคืบหน้าและไม่ให้คำขอเดียวยาวเกินไป
agentsRouter.post("/agents-api/step", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const idx = Number(b.step);
  if (!Number.isInteger(idx) || idx < 0 || idx >= STEPS.length) { res.status(400).json({ error: `step ต้องเป็น 0-${STEPS.length - 1}` }); return; }
  const previous = Array.isArray(b.previous) ? b.previous.slice(0, STEPS.length).map((p) => cleanText(p, 6000)).filter(Boolean) : [];
  const project = cleanText(b.project, 200);
  const brief = cleanText(b.brief);
  const step = STEPS[idx]!;
  try {
    const outputs: { agent: string; text: string }[] = [];
    for (const name of step.agents) {
      const agent = agentByName(name)!;
      const own = outputs.map((o) => `[${o.agent}]\n${o.text}`);
      const text = await askClaude(agentSystem(agent), stepPrompt(project, brief, idx, [...previous, ...own]), { model: b.model, maxTokens: 1000, timeoutMs: 60000 });
      outputs.push({ agent: name, text });
    }
    res.json({ step: idx, title: step.title, outputs });
  } catch (err) { fail(res, err); }
});
