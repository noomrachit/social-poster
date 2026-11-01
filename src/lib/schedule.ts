// ตรวจเวลาตั้งโพสต์ ใช้ร่วมกันระหว่าง REST และ MCP

/** ตรวจเวลาตั้งโพสต์: คืน Date หรือข้อความผิดพลาด */
export function parseScheduledAt(value: unknown, now = Date.now()): Date | string {
  if (typeof value !== "string" || value === "") return "scheduledAt is required when mode = schedule";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "scheduledAt must be an ISO 8601 date-time";
  if (d.getTime() < now - 60_000) return "scheduledAt must be in the future";
  return d;
}
