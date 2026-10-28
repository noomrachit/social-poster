import "dotenv/config";
import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter } from "./routes/auth.js";
import { integrationsRouter } from "./routes/integrations.js";
import { postsRouter } from "./routes/posts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: "10mb" }));

// หน้าเว็บสำหรับใช้งาน (ไม่มีข้อมูลลับในหน้านี้ — ข้อมูลทั้งหมดเรียก API ที่ต้องใช้ token)
app.use(express.static(join(__dirname, "..", "public")));

// OAuth callback ต้องเปิดสาธารณะ (Google เป็นคนเรียก) จึงวางก่อน integrations/posts ที่มี requireAdmin
app.use(authRouter);
app.use(integrationsRouter);
app.use(postsRouter);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`social-poster listening on port ${port}`);
});
