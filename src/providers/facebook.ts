import type { IntegrationRow, PublishInput, PublishResult, SocialProvider } from "./types.js";

/**
 * TODO: ยังใช้งานไม่ได้จริง — รอสมัคร Meta Developer App + ผ่าน App Review
 * (permission ที่ต้องขอ: pages_manage_posts, pages_read_engagement เป็นอย่างน้อย)
 * ดู docs/facebook-setup.md
 */
export const facebookProvider: SocialProvider = {
  platform: "facebook",
  async publish(_integration: IntegrationRow, _input: PublishInput): Promise<PublishResult> {
    return {
      status: "error",
      errorMessage: "Facebook provider ยังไม่เปิดใช้งาน — ต้องสมัคร Meta App และผ่าน App Review ก่อน (ดู docs/facebook-setup.md)",
    };
  },
};
