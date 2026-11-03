// Helper เรียก Meta Graph API (ใช้ fetch ของ Node ล้วน ไม่มี dependency เพิ่ม)
export const FB_GRAPH_VERSION = process.env.FB_GRAPH_VERSION || "v21.0";
export const FB_SCOPES = ["pages_show_list", "pages_manage_posts", "pages_read_engagement"];

export function graphUrl(path: string, params: Record<string, string> = {}): string {
  const u = new URL(`https://graph.facebook.com/${FB_GRAPH_VERSION}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export function fbConfig() {
  const appId = process.env.FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
  const redirectUri = process.env.FB_REDIRECT_URI || (base ? `${base}/auth/facebook/callback` : "");
  if (!appId || !appSecret || !redirectUri) {
    throw new Error("ยังไม่ได้ตั้ง FB_APP_ID / FB_APP_SECRET / FB_REDIRECT_URI");
  }
  return { appId, appSecret, redirectUri };
}

export function buildFacebookAuthUrl(state: string): string {
  const { appId, redirectUri } = fbConfig();
  const u = new URL(`https://www.facebook.com/${FB_GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", appId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", FB_SCOPES.join(","));
  return u.toString();
}

export async function graphJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data?.error) {
    const msg = data?.error?.message ?? data?.raw ?? `HTTP ${res.status}`;
    throw new Error(`Facebook API: ${msg}`);
  }
  return data;
}

export interface FbPage { id: string; name: string; access_token: string; tasks?: string[] }

/** code → short-lived user token → long-lived user token → รายชื่อเพจ (page token ที่ได้จาก long-lived user token ไม่หมดอายุ) */
export async function exchangeCodeForPages(code: string): Promise<FbPage[]> {
  const { appId, appSecret, redirectUri } = fbConfig();
  const short = await graphJson(graphUrl("oauth/access_token", {
    client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code,
  }));
  const long = await graphJson(graphUrl("oauth/access_token", {
    grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token,
  }));
  const pages: FbPage[] = [];
  let next: string | undefined = graphUrl("me/accounts", {
    access_token: long.access_token, fields: "id,name,access_token,tasks", limit: "100",
  });
  while (next) {
    const data: any = await graphJson(next);
    for (const p of data.data ?? []) if (p.id && p.access_token) pages.push(p);
    next = data.paging?.next;
  }
  // บางเพจ (เพจแบบใหม่/อยู่ใน Business) ไม่โผล่ใน me/accounts → ดึงตรงจาก ID ใน ALLOWED_FB_PAGE_IDS
  const wanted = (process.env.ALLOWED_FB_PAGE_IDS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const id of wanted) {
    if (pages.some((p) => p.id === id)) continue;
    try {
      const p: any = await graphJson(graphUrl(id, { access_token: long.access_token, fields: "id,name,access_token" }));
      if (p.id && p.access_token) pages.push(p);
    } catch { /* ข้ามเพจที่ไม่มีสิทธิ์ */ }
  }
  return pages;
}
