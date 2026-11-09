// ศูนย์ควบคุมเอเจนต์: เอเจนต์ 12 ตัว + พรีเซ็ต 4 แบบ + ไปป์ไลน์ 5 ขั้น ทุกขั้นเรียก Claude ผ่านเซิร์ฟเวอร์
export interface Agent { name: string; role: string; desc: string; pod: string }
export interface Preset { id: number; title: string; desc: string; brief: string }
export interface Step { title: string; agents: string[]; detail: string }

export const AGENTS: Agent[] = [
  { name: "เก่ง", role: "Master Orchestrator", desc: "วางแผนทั้งโปรเจกต์ แยกงานให้เอเจนต์ที่เหมาะ แล้วรวมผลให้เป็นชิ้นงานเดียว", pod: "พ็อดควบคุมหลัก" },
  { name: "คอนเทนต์", role: "Content Strategist", desc: "วางโครงเนื้อหา หัวข้อ และมุมเล่าให้ตรงกลุ่มเป้าหมาย", pod: "พ็อดคอนเทนต์" },
  { name: "เรื่องเล่า", role: "Storyteller", desc: "เปลี่ยนข้อมูลแห้งๆ ให้เป็นเรื่องเล่าที่จำง่ายและชวนติดตาม", pod: "พ็อดคอนเทนต์" },
  { name: "พร้อมต์ภาพ", role: "Image Prompt Designer", desc: "เขียนพร้อมต์ภาพให้ได้ภาพตรงสไตล์ องค์ประกอบ และโทนที่ต้องการ", pod: "พ็อดคอนเทนต์" },
  { name: "วิเคราะห์ SEO", role: "SEO Analyst", desc: "เช็กคีย์เวิร์ด โครงหัวข้อ และคำค้นที่คนไทยใช้จริง", pod: "พ็อดคอนเทนต์" },
  { name: "ฟีเจอร์แอป", role: "App Feature Builder", desc: "แตกฟีเจอร์เป็นงานย่อย ระบุหน้าจอ ข้อมูล และพฤติกรรมผู้ใช้", pod: "พ็อดแอป" },
  { name: "ตรวจสอบบั๊กแอป", role: "App QA Checker", desc: "ไล่เช็กเคสพัง ขอบเขตข้อมูล และจุดที่ผู้ใช้หลงทาง", pod: "พ็อดแอป" },
  { name: "ส่งออกโซเชียล", role: "Social Exporter", desc: "ปรับเนื้อหาให้พอดีกับแต่ละแพลตฟอร์ม ทั้งแคปชันและรูปแบบโพสต์", pod: "พ็อดส่งออก" },
  { name: "ตัดต่อคลิป FFmpeg", role: "Video Pipeline", desc: "วางลำดับตัดต่อ คำสั่ง FFmpeg และเช็กลิสต์ไฟล์ก่อนส่งออก", pod: "พ็อดส่งออก" },
  { name: "มานะ", role: "Diligence Partner", desc: "ทบทวนงานซ้ำ เก็บรายละเอียด และเตือนจุดที่ยังไม่ครบ", pod: "พ็อดร่วมงาน" },
  { name: "เพื่อนร่วมงาน", role: "Collaboration Buddy", desc: "ช่วยระดมไอเดีย ถามคำถามดีๆ และเสนอทางเลือกที่ทำได้จริง", pod: "พ็อดร่วมงาน" },
  { name: "งาน ต่อ C", role: "Utility Runner", desc: "งานจุกจิกต่อท้าย เช่น จัดรูปแบบไฟล์ ตั้งชื่อ สรุป และเตรียมส่ง", pod: "พ็อดงานทั่วไป" },
];

export const PRESETS: Preset[] = [
  { id: 1, title: "คอนเทนต์ + วิดีโอ", desc: "บทความ สคริปต์ พร้อมต์ภาพ และแผนตัดต่อในชุดเดียว", brief: "ทำชุดคอนเทนต์เปิดตัวสินค้า 1 ชุด พร้อมสคริปต์คลิปสั้นและพร้อมต์ภาพปก" },
  { id: 2, title: "แอปรวดเร็ว + ดักบั๊ก", desc: "สเปกฟีเจอร์ เคสทดสอบ และเช็กลิสต์ก่อนปล่อยงาน", brief: "ออกแบบฟีเจอร์หน้าแรกของแอป พร้อมเคสทดสอบและจุดที่ต้องระวัง" },
  { id: 3, title: "กลยุทธ์หาเงิน", desc: "ข้อเสนอขาย แผนเนื้อหา และตัวชี้วัดรายสัปดาห์", brief: "วางแผนหารายได้ 30 วันจากทักษะที่มีอยู่ พร้อมแผนเนื้อหารายสัปดาห์" },
  { id: 4, title: "กำหนดเอง", desc: "เริ่มจากโจทย์เปล่า แล้วให้เก่งวางแผนให้ทั้งหมด", brief: "เล่าโจทย์ของคุณให้ชัด แล้วบอกผลลัพธ์ที่อยากได้ภายใน 1 สัปดาห์" },
];

export const STEPS: Step[] = [
  { title: "วางแผนและแยกงาน", agents: ["เก่ง"], detail: "สรุปเป้าหมาย กลุ่มเป้าหมาย และลำดับงาน" },
  { title: "สร้างเนื้อหาและเรื่องเล่า", agents: ["คอนเทนต์", "เรื่องเล่า"], detail: "โครงเนื้อหา สคริปต์ และมุมเล่า" },
  { title: "วิเคราะห์ SEO และพร้อมต์ภาพ", agents: ["วิเคราะห์ SEO", "พร้อมต์ภาพ"], detail: "คีย์เวิร์ดและภาพปกที่ตรงโทน" },
  { title: "สเปกแอปและตรวจบั๊ก", agents: ["ฟีเจอร์แอป", "ตรวจสอบบั๊กแอป"], detail: "งานที่ต้องทำและเคสที่ต้องทดสอบ" },
  { title: "ส่งออกโซเชียลและตรวจคุณภาพ", agents: ["ส่งออกโซเชียล", "มานะ", "งาน ต่อ C"], detail: "แคปชัน เช็กลิสต์ และไฟล์พร้อมส่ง" },
];

export const MAX_TEXT = 4000;

export function agentByName(name: unknown): Agent | undefined {
  return AGENTS.find((a) => a.name === name);
}

export function agentSystem(a: Agent): string {
  return `คุณคือเอเจนต์ชื่อ ${a.name} หน้าที่ ${a.role} (${a.desc})
ตอบเป็นภาษาไทย กระชับ ทำได้จริง ไม่เกิน 12 บรรทัด ใช้หัวข้อสั้นและข้อย่อยได้ ห้ามแต่งตัวเลขหรือข้อมูลอ้างอิงที่ไม่ได้ให้มา ถ้าข้อมูลไม่พอให้บอกว่าขาดอะไร`;
}

export function cleanText(v: unknown, max = MAX_TEXT): string {
  return typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, max) : "";
}

/** ข้อความสั่งงานของเอเจนต์ในขั้นที่ index โดยแนบผลขั้นก่อนหน้า (previous) ให้ต่อยอด */
export function stepPrompt(project: string, brief: string, stepIndex: number, previous: string[]): string {
  const step = STEPS[stepIndex]!;
  const prev = previous.length ? `\n\nผลจากขั้นก่อนหน้า:\n${previous.map((p, i) => `[ขั้น ${i + 1}]\n${p}`).join("\n\n")}` : "";
  return `โปรเจกต์: ${project || "ไม่ตั้งชื่อ"}\nโจทย์: ${brief || "-"}\nขั้นที่ ${stepIndex + 1}/${STEPS.length}: ${step.title} — ${step.detail}${prev}\n\nทำงานในส่วนของคุณให้จบในขั้นนี้`;
}
