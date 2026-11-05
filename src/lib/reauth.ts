import { pool } from "../db/pool.js";

/** mark ว่า integration นี้ต้องเชื่อมใหม่ (token ถูกถอน/หมดอายุถาวร) */
export async function markNeedsReauth(id: string, msg: string): Promise<void> {
  try {
    await pool.query(`UPDATE integrations SET needs_reauth = true, last_error = $2, updated_at = now() WHERE id = $1`, [id, msg.slice(0, 500)]);
  } catch (e) {
    console.error(`mark needs_reauth ไม่สำเร็จ (integration ${id})`);
  }
}
