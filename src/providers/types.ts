// Interface ที่ทุก provider (youtube, facebook, tiktok, ...) ต้องทำตาม
// แต่ละ provider รับผิดชอบ: OAuth flow ของตัวเอง + การโพสต์ไปยังแพลตฟอร์มของตัวเอง

export interface IntegrationRow {
  id: string;
  platform: string;
  display_name: string;
  external_account_id: string;
  access_token_enc: string;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
}

export const PRIVACY_STATUSES = ["private", "unlisted", "public"] as const;
export type PrivacyStatus = (typeof PRIVACY_STATUSES)[number];

export interface PublishInput {
  content: string;
  mediaUrls: string[];
  /** ใช้กับ YouTube (ค่าเริ่มต้น private ถ้าไม่ระบุ) */
  privacyStatus?: PrivacyStatus;
}

export interface PublishResult {
  status: "success" | "error";
  remotePostId?: string;
  errorMessage?: string;
}

export interface PostStats {
  views?: number;
  likes?: number;
  comments?: number;
}

export interface SocialProvider {
  platform: string;
  /** (ไม่บังคับ) ดึงสถิติของโพสต์ที่โพสต์ไปแล้ว คืน map: remotePostId → สถิติ; id ที่หาไม่เจอไม่ต้องใส่ */
  getStats?(integration: IntegrationRow, remotePostIds: string[]): Promise<Record<string, PostStats>>;
  /** ยิงโพสต์ไปยังแพลตฟอร์มนี้ ด้วย integration ที่เชื่อมไว้แล้ว 1 บัญชี */
  publish(integration: IntegrationRow, input: PublishInput): Promise<PublishResult>;
}
