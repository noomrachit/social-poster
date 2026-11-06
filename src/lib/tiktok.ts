import { createHash, randomBytes } from "node:crypto";
import { decryptToken, encryptToken } from "./crypto.js";

export const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_API = "https://open.tiktokapis.com";
export const TIKTOK_SCOPES = "user.info.basic,video.upload,video.publish";

export function tiktokConfig() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const baseUrl = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
  if (!clientKey || !clientSecret) throw new Error("TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET is not set");
  if (!baseUrl) throw new Error("APP_BASE_URL is not set (ใช้สร้าง redirect URI ของ TikTok)");
  return { clientKey, clientSecret, redirectUri: `${baseUrl}/auth/tiktok/callback` };
}

/** PKCE: TikTok ใช้ code_challenge = hex(SHA256(verifier)) ตามเอกสาร Login Kit for Web */
export function makePkce() {
  const verifier = randomBytes(48).toString("base64url").slice(0, 64);
  const challenge = createHash("sha256").update(verifier).digest("hex");
  return { verifier, challenge };
}

export function buildAuthorizeUrl(clientKey: string, redirectUri: string, state: string, challenge: string): string {
  const u = new URL(TIKTOK_AUTH_URL);
  u.searchParams.set("client_key", clientKey);
  u.searchParams.set("scope", TIKTOK_SCOPES);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

export interface TikTokTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  open_id?: string;
  scope?: string;
}

async function tokenRequest(params: Record<string, string>, fetchImpl: typeof fetch): Promise<TikTokTokenResponse> {
  const res = await fetchImpl(`${TIKTOK_API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`TikTok token error: ${data.error ?? res.status} ${data.error_description ?? ""}`.trim());
  }
  return data;
}

export function exchangeCode(code: string, verifier: string, fetchImpl: typeof fetch = fetch) {
  const c = tiktokConfig();
  return tokenRequest(
    { client_key: c.clientKey, client_secret: c.clientSecret, code, grant_type: "authorization_code", redirect_uri: c.redirectUri, code_verifier: verifier },
    fetchImpl
  );
}

export function refreshAccessToken(refreshToken: string, fetchImpl: typeof fetch = fetch) {
  const c = tiktokConfig();
  return tokenRequest(
    { client_key: c.clientKey, client_secret: c.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken },
    fetchImpl
  );
}

/** ยกเลิกสิทธิ์ที่ TikTok (best effort) ตอนผู้ใช้กดยกเลิกการเชื่อม */
export async function revokeToken(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const c = tiktokConfig();
  await fetchImpl(`${TIKTOK_API}/v2/oauth/revoke/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: c.clientKey, client_secret: c.clientSecret, token: accessToken }).toString(),
  });
}

export async function fetchUserInfo(accessToken: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`${TIKTOK_API}/v2/user/info/?fields=open_id,display_name,avatar_url`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: any = await res.json().catch(() => ({}));
  const user = data?.data?.user;
  if (!res.ok || !user?.open_id) throw new Error(`TikTok user info error: ${data?.error?.code ?? res.status}`);
  return user as { open_id: string; display_name?: string; avatar_url?: string };
}

export function tokenColumns(t: TikTokTokenResponse, now = Date.now()) {
  return {
    access_token_enc: encryptToken(t.access_token),
    refresh_token_enc: t.refresh_token ? encryptToken(t.refresh_token) : null,
    token_expires_at: t.expires_in ? new Date(now + t.expires_in * 1000) : null,
  };
}

export { decryptToken };
