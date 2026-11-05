import { decryptToken } from "../lib/crypto.js";
import { checkFbToken, FB_GRAPH_VERSION, FB_REAUTH_HINT, graphJson, graphUrl, isFbAuthError } from "../lib/facebook-graph.js";
import { markNeedsReauth } from "../lib/reauth.js";
import type { IntegrationRow, PublishInput, PublishResult, SocialProvider } from "./types.js";

type FetchLike = typeof fetch;

/**
 * โพสต์วิดีโอลงเพจ Facebook
 * - ค่าเริ่มต้น: Reels (/{page-id}/video_reels) เหมาะกับคลิปแนวตั้ง 3-90 วินาที
 * - ถ้า Reels ล้มเหลว (เช่น สัดส่วนหรือความยาวไม่เข้าเงื่อนไข) จะ fallback ไปโพสต์วิดีโอปกติ (/{page-id}/videos ด้วย file_url)
 * - FB_POST_MODE=video บังคับโพสต์เป็นวิดีโอปกติ
 * caption ทั้งหมด (content) ใช้เป็น description
 */
export async function publishReel(pageId: string, token: string, videoUrl: string, description: string, f: FetchLike = fetch): Promise<string> {
  const start = await graphJson(graphUrl(`${pageId}/video_reels`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ upload_phase: "start", access_token: token }),
  });
  const videoId: string = start.video_id;
  if (!videoId) throw new Error("Facebook ไม่ได้ส่ง video_id กลับมา");
  const upRes = await f(start.upload_url ?? `https://rupload.facebook.com/video-upload/${FB_GRAPH_VERSION}/${videoId}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, file_url: videoUrl },
  });
  if (!upRes.ok) throw new Error(`อัปโหลด Reel ไม่สำเร็จ: HTTP ${upRes.status} ${await upRes.text()}`);
  await graphJson(graphUrl(`${pageId}/video_reels`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ upload_phase: "finish", video_id: videoId, video_state: "PUBLISHED", description, access_token: token }),
  });
  return videoId;
}

export async function publishVideo(pageId: string, token: string, videoUrl: string, description: string): Promise<string> {
  const data = await graphJson(graphUrl(`${pageId}/videos`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ file_url: videoUrl, description, access_token: token }),
  });
  if (!data.id) throw new Error("Facebook ไม่ได้ส่ง id วิดีโอกลับมา");
  return data.id;
}

export const facebookProvider: SocialProvider = {
  platform: "facebook",
  async publish(integration: IntegrationRow, input: PublishInput): Promise<PublishResult> {
    const videoUrl = input.mediaUrls[0];
    if (!videoUrl) return { status: "error", errorMessage: "Facebook ต้องมีไฟล์วิดีโออย่างน้อย 1 ไฟล์ใน mediaUrls" };
    try {
      const token = decryptToken(integration.access_token_enc);
      const pageId = integration.external_account_id;
      const bad = await checkFbToken(token);
      if (bad) {
        await markNeedsReauth(integration.id, bad);
        return { status: "error", errorMessage: `Facebook ต้องเชื่อมใหม่: ${bad} — ${FB_REAUTH_HINT}` };
      }
      if (process.env.FB_POST_MODE === "video") {
        return { status: "success", remotePostId: await publishVideo(pageId, token, videoUrl, input.content) };
      }
      try {
        return { status: "success", remotePostId: await publishReel(pageId, token, videoUrl, input.content) };
      } catch (reelErr: any) {
        if (isFbAuthError(reelErr)) throw reelErr; // สิทธิ์เสีย: fallback ไปก็ล้มเหมือนกัน
        console.warn(`Facebook Reel ล้มเหลว ลองโพสต์เป็นวิดีโอปกติแทน: ${reelErr?.message ?? reelErr}`);
        return { status: "success", remotePostId: await publishVideo(pageId, token, videoUrl, input.content) };
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (isFbAuthError(err)) {
        await markNeedsReauth(integration.id, msg);
        return { status: "error", errorMessage: `Facebook ต้องเชื่อมใหม่: ${msg} — ${FB_REAUTH_HINT}` };
      }
      return { status: "error", errorMessage: msg };
    }
  },
};
