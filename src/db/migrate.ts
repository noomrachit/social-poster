import { readFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";
import { pool } from "./pool.js";

// อ่านจาก src/db/schema.sql เสมอ (ไม่ใช่ dist) เพื่อไม่ต้องคัดลอกไฟล์ .sql ตอน build
// รันคำสั่งนี้จาก root ของ repo เท่านั้น (npm run migrate / migrate:dev ทำแบบนี้อยู่แล้ว)
async function main() {
  const sql = readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8");
  await pool.query(sql);
  console.log("Migration applied.");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
