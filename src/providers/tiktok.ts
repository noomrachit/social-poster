import type { IntegrationRow, PublishInput, PublishResult, SocialProvider } from "./types.js";

/**
 * TODO: ยังใช้งานไม่ได้จริง — รอสมัคร TikTok for Developers App + ผ่าน App Review
 * (ต้องใช้ Content Posting API, scope video.publish)
 * ดู docs/tiktok-setup.md
 */
export const tiktokProvider: SocialProvider = {
  platform: "tiktok",
  async publish(_integration: IntegrationRow, _input: PublishInput): Promise<PublishResult> {
    return {
      status: "error",
      errorMessage: "TikTok provider ยังไม่เปิดใช้งาน — ต้องสมัคร TikTok Developer App และผ่าน App Review ก่อน (ดู docs/tiktok-setup.md)",
    };
  },
};
