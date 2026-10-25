import { google } from "googleapis";
import { createGoogleOAuthClient } from "../lib/google-oauth.js";
import { decryptToken } from "../lib/crypto.js";
import type { IntegrationRow, PublishInput, PublishResult, SocialProvider } from "./types.js";

/**
 * YouTube ไม่มี "โพสต์ข้อความ" แบบ X/Facebook — การโพสต์ที่นี่คือการอัปโหลดวิดีโอ
 * ดังนั้นต้องมี mediaUrls[0] เป็นลิงก์วิดีโอ (ไฟล์ mp4 ที่เข้าถึงได้แบบ public) มาด้วยเสมอ
 * - บรรทัดแรกของ content ใช้เป็นชื่อวิดีโอ (title)
 * - ที่เหลือใช้เป็นคำอธิบาย (description)
 */
export const youtubeProvider: SocialProvider = {
  platform: "youtube",

  async publish(integration: IntegrationRow, input: PublishInput): Promise<PublishResult> {
    const videoUrl = input.mediaUrls[0];
    if (!videoUrl) {
      return { status: "error", errorMessage: "YouTube ต้องมีไฟล์วิดีโออย่างน้อย 1 ไฟล์ใน mediaUrls" };
    }

    try {
      const auth = createGoogleOAuthClient();
      auth.setCredentials({
        access_token: decryptToken(integration.access_token_enc),
        refresh_token: integration.refresh_token_enc ? decryptToken(integration.refresh_token_enc) : undefined,
      });

      const youtube = google.youtube({ version: "v3", auth });

      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok || !videoResponse.body) {
        return { status: "error", errorMessage: `ดึงไฟล์วิดีโอไม่ได้: HTTP ${videoResponse.status}` };
      }

      const lines = input.content.split("\n");
      const title = (lines[0] || "Untitled").slice(0, 100);
      const description = lines.slice(1).join("\n");

      const res = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: { title, description },
          status: { privacyStatus: "public" },
        },
        media: {
          // Node's fetch body (a web ReadableStream) works directly with googleapis' media.body
          body: videoResponse.body as unknown as NodeJS.ReadableStream,
        },
      });

      return { status: "success", remotePostId: res.data.id ?? undefined };
    } catch (err: any) {
      return { status: "error", errorMessage: err?.message ?? String(err) };
    }
  },
};
