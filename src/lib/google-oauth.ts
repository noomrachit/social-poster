import { google } from "googleapis";

// youtube.upload: อัปโหลดวิดีโอ
// youtube.readonly: อ่านข้อมูลช่อง (channels.list ตอนเชื่อมบัญชี) และสถิติวิดีโอ (videos.list)
// เปลี่ยน scope แล้วต้องกดเชื่อมบัญชีใหม่ผ่าน /auth/youtube/start เพื่อให้ token ได้สิทธิ์ครบ
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export function createGoogleOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = process.env.APP_BASE_URL;
  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / APP_BASE_URL is not set");
  }
  return new google.auth.OAuth2(clientId, clientSecret, `${baseUrl}/auth/youtube/callback`);
}
