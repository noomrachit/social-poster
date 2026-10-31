export const STYLES = [
  { id: "hook", label: "ฮุคแรง", hint: "เปิดให้หยุดนิ้ว", group: "clip" },
  { id: "tips", label: "ข้อควรรู้", hint: "ขั้นตอนใช้ได้จริง", group: "clip" },
  { id: "story", label: "เล่าเรื่อง", hint: "เรื่องสั้นมีปม", group: "clip" },
  { id: "list", label: "ลิสต์สั้น", hint: "นับข้อให้ดูจบ", group: "clip" },
  { id: "review", label: "รีวิวของ", hint: "เหมาะกับใคร", group: "clip" },
  { id: "analyze", label: "วิเคราะห์", hint: "/analyze ปัญหา", group: "think" },
  { id: "compare", label: "เปรียบเทียบ", hint: "/compare สองทาง", group: "think" },
  { id: "pros", label: "ข้อดีข้อเสีย", hint: "/pros-cons", group: "think" },
  { id: "evaluate", label: "ประเมิน", hint: "/evaluate ก่อนตัดสิน", group: "think" },
  { id: "recommend", label: "แนะนำทาง", hint: "/recommend", group: "think" },
  { id: "brainstorm", label: "ระดมไอเดีย", hint: "/brainstorm", group: "think" },
  { id: "solve", label: "แก้ปัญหา", hint: "/solve", group: "think" },
  { id: "challenge", label: "ท้าทายสมมติ", hint: "/challenge", group: "think" },
] as const;

export type StyleId = (typeof STYLES)[number]["id"];

export const LENGTHS = [15, 30, 45] as const;
export type Seconds = (typeof LENGTHS)[number];

export const MOTIONS = [
  { id: "hold", label: "นิ่ง" },
  { id: "in", label: "ซูมเข้า" },
  { id: "out", label: "ซูมออก" },
  { id: "left", label: "เลื่อนซ้าย" },
  { id: "right", label: "เลื่อนขวา" },
  { id: "drift", label: "ลอยช้า" },
] as const;

export type MotionId = (typeof MOTIONS)[number]["id"];

export const VOICES = [
  { id: "eve", label: "อีฟ", hint: "สดใส" },
  { id: "ara", label: "อารา", hint: "นุ่ม" },
  { id: "leo", label: "ลีโอ", hint: "ชัด" },
  { id: "rex", label: "เร็กซ์", hint: "ทุ้ม" },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

export type Scene = {
  kicker: string;
  caption: string;
  narration: string;
};

export type ShortPlan = {
  topic: string;
  style: StyleId;
  seconds: Seconds;
  title: string;
  description: string;
  hashtags: string[];
  scenes: Scene[];
  imagePrompt: string;
  source: "grok" | "local";
};

export type DraftInput = {
  topic: string;
  style: StyleId;
  seconds: Seconds;
  useAi: boolean;
  withImage: boolean;
};

export function sceneCount(seconds: Seconds) {
  if (seconds === 15) return 3;
  if (seconds === 30) return 5;
  return 6;
}

export function styleLabel(id: StyleId) {
  return STYLES.find((s) => s.id === id)?.label ?? id;
}

export const STYLE_BRIEFS: Record<StyleId, string> = {
  hook: "ฮุคแรง: ประโยคแรกขัดความเชื่อ แล้วให้เหตุผลสั้น",
  tips: "ข้อควรรู้: เรียงขั้นตอนที่ใช้ได้จริง จากง่ายไปยาก",
  story: "เล่าเรื่อง: มีสถานการณ์หนึ่ง แล้วบทเรียนท้ายคลิป",
  list: "ลิสต์: นับจุดให้ชัด ทุกฉากกลางขึ้นต้นด้วยลำดับ",
  review: "รีวิว: เหมาะกับใคร ไม่เหมาะกับใคร และข้อควรระวังหนึ่งข้อ",
  analyze: "วิเคราะห์ปัญหา: บอกปัญหาให้ชัด สาเหตุหนึ่ง แล้วผลที่ตามมา",
  compare: "เปรียบเทียบ: วางสองทางของหัวข้อนี้ให้เห็นความต่างจริง",
  pros: "ข้อดีข้อเสีย: สลับข้อดีกับข้อเสีย แล้วปิดว่าใครควรเลือกแบบไหน",
  evaluate: "ประเมิน: ชั่งด้วยเกณฑ์สั้น ๆ ว่าคุ้มไหม ไม่ตัดสินแทนคนดูทั้งกระดาน",
  recommend: "แนะนำแนวทาง: ทางที่ควรลองก่อน ทางที่ไม่ควรเริ่ม และเหตุผล",
  brainstorm: "ระดมไอเดีย: โยนทางเลือกหลายแบบที่ต่างกัน ยังไม่สรุปว่าอันไหนชนะ",
  solve: "แก้ปัญหา: อาการ สาเหตุที่แก้ได้ แล้วหนึ่งขั้นที่ทำวันนี้",
  challenge: "ท้าทายสมมติฐาน: ยกความเชื่อที่คนมักมี แล้วแย้งด้วยข้อสังเกต",
};
