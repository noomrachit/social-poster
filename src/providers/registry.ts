import { youtubeProvider } from "./youtube.js";
import { facebookProvider } from "./facebook.js";
import { tiktokProvider } from "./tiktok.js";
import type { SocialProvider } from "./types.js";

// เพิ่มแพลตฟอร์มใหม่: implement SocialProvider แล้วเพิ่มเข้า map นี้ที่เดียว
export const providers: Record<string, SocialProvider> = {
  youtube: youtubeProvider,
  facebook: facebookProvider,
  tiktok: tiktokProvider,
};
