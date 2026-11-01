import "dotenv/config";
import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter } from "./routes/auth.js";
import { integrationsRouter } from "./routes/integrations.js";
import { postsRouter } from "./routes/posts.js";
import { analyticsRouter } from "./routes/analytics.js";
import { mediaRouter } from "./routes/media.js";
import { studioRouter } from "./routes/studio.js";
import { mcpRouter } from "./mcp.js";
import { requireAdmin } from "./lib/admin-auth.js";
import { runDuePosts } from "./lib/services.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: "10mb" }));

// หน้าเว็บสำหรับใช้งาน (ไม่มีข้อมูลลับในหน้านี้ — ข้อมูลทั้งหมดเรียก API ที่ต้องใช้ token)
app.use(express.static(join(__dirname, "..", "public")));

// เส้นทางที่ต้องใช้ token ระบุชัดเจนตรงนี้ที่เดียว (ไม่ใช้ router.use ใน router เพราะจะครอบเส้นทางอื่นที่ mount ทีหลัง)
app.use(["/integrations", "/posts", "/analytics", "/studio-api"], requireAdmin);

// สาธารณะ: OAuth callback (Google เรียก) และ GET /media/:name (แพลตฟอร์มปลายทางดึงไฟล์) — POST /media ล็อกใน router เอง
app.use(authRouter);
app.use(mediaRouter);
app.use(mcpRouter); // ตรวจสิทธิ์เองใน mcp.ts (Bearer/x-admin-token หรือ MCP_PATH_SECRET)
app.use(integrationsRouter);
app.use(postsRouter);
app.use(analyticsRouter);
app.use(studioRouter);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`social-poster listening on port ${port}`);
});

// ตัวตั้งเวลา: ทุก 60 วินาที ยิงโพสต์ status = scheduled ที่ถึงเวลาแล้ว (ปิดได้ด้วย SCHEDULER_DISABLED=1)
if (process.env.SCHEDULER_DISABLED !== "1") {
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    runDuePosts()
      .catch((err) => console.error("scheduler error:", err))
      .finally(() => {
        running = false;
      });
  }, 60_000).unref();
}
