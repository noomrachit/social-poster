import { google } from "googleapis";

export const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];

export function createGoogleOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = process.env.APP_BASE_URL;
  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / APP_BASE_URL is not set");
  }
  return new google.auth.OAuth2(clientId, clientSecret, `${baseUrl}/auth/youtube/callback`);
}
