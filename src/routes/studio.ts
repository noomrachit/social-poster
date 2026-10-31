import { Router } from "express";
import { draftShort, parseDraftInput, parseSpeakInput, speakShort } from "../lib/studio.js";

// การล็อก token ทำใน src/index.ts (ครอบ /studio-api)
export const studioRouter = Router();

// POST /studio-api/draft — ให้ Grok เขียนสคริปต์คลิป (+ภาพฉากถ้าขอ) ถ้า AI ใช้ไม่ได้จะคืนร่างในเครื่องพร้อม note
studioRouter.post("/studio-api/draft", async (req, res) => {
  let input;
  try {
    input = parseDraftInput(req.body);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
  res.json(await draftShort(input));
});

// POST /studio-api/speak — สร้างเสียงพากย์ไทย (base64) ถ้าไม่ได้คืน { ok:false, error } ให้หน้าเว็บใช้เสียงเครื่องแทน
studioRouter.post("/studio-api/speak", async (req, res) => {
  let input;
  try {
    input = parseSpeakInput(req.body);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
  res.json(await speakShort(input));
});
