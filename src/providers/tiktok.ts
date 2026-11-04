import { pool } from "../db/pool.js";
import { decryptToken, refreshAccessToken, tokenColumns, TIKTOK_API } from "../lib/tiktok.js";
import type { IntegrationRow, PublishInput, PublishResult, SocialProvider } from "./types.js";

const MB = 1024 * 1024;
export const MIN_CHUNK = 5 * MB;
export const MAX_CHUNK = 64 * MB;
export const DEFAULT_CHUNK = 10 * MB;
export const TITLE_MAX = 2200;

/** กฎ TikTok: <64MB ส่งก้อนเดียว; ใหญ่กว่านั้นแบ่งก้อนละ 5–64MB, ก้อนสุดท้ายรวมเศษ (ไม่เกิน 128MB) */
export function planChunks(size: number, chunk = DEFAULT_CHUNK) {
  if (size <= 0) throw new Error("ไฟล์ว่าง");
  if (size < MAX_CHUNK) return { chunkSize: size, total: 1 };
  const c = Math.min(Math.max(chunk, MIN_CHUNK), MAX_CHUNK);
  return { chunkSize: c, total: Math.floor(size / c) };
}

export function chunkRanges(size: number, chunkSize: number, total: number) {
  const out: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < total; i++) {
    const start = i * chunkSize;
    const end = i === total - 1 ? size - 1 : start + chunkSize - 1;
    out.push({ start, end });
  }
  return out;
}

export function choosePrivacy(requested: string | undefined, allowed: string[]): string {
  if (requested && allowed.includes(requested)) return requested;
  return "SELF_ONLY";
}

/** แปลง privacyStatus แบบ YouTube → TikTok (public→PUBLIC_TO_EVERYONE ฯลฯ); ไม่ระบุ = SELF_ONLY */
export function mapPrivacy(p?: string): string | undefined {
  if (p === "public") return "PUBLIC_TO_EVERYONE";
  if (p === "unlisted") return "MUTUAL_FOLLOW_FRIENDS";
  if (p === "private") return "SELF_ONLY";
  return undefined;
}

interface Deps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  saveTokens: (id: string, cols: ReturnType<typeof tokenColumns>) => Promise<void>;
  pollAttempts: number;
}

const defaultDeps: Deps = {
  fetch: (...a) => fetch(...a),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  saveTokens: async (id, c) => {
    await pool.query(
      `UPDATE integrations SET access_token_enc=$1, refresh_token_enc=COALESCE($2, refresh_token_enc), token_expires_at=$3, updated_at=now() WHERE id=$4`,
      [c.access_token_enc, c.refresh_token_enc, c.token_expires_at, id]
    );
  },
  pollAttempts: 60,
};

/** คืน access token ที่ใช้ได้ รีเฟรชถ้าจะหมดใน 5 นาที */
export async function getAccessToken(integration: IntegrationRow, deps: Deps = defaultDeps): Promise<string> {
  const exp = integration.token_expires_at ? new Date(integration.token_expires_at).getTime() : Infinity;
  if (exp - Date.now() > 5 * 60 * 1000 || !integration.refresh_token_enc) {
    return decryptToken(integration.access_token_enc);
  }
  const t = await refreshAccessToken(decryptToken(integration.refresh_token_enc), deps.fetch);
  await deps.saveTokens(integration.id, tokenColumns(t));
  return t.access_token;
}

async function api(deps: Deps, token: string, path: string, body: unknown) {
  const res = await deps.fetch(`${TIKTOK_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || (data?.error?.code && data.error.code !== "ok")) {
    throw new Error(`TikTok ${path}: ${data?.error?.code ?? res.status} ${data?.error?.message ?? ""}`.trim());
  }
  return data.data ?? {};
}

export function createTiktokProvider(deps: Deps = defaultDeps): SocialProvider {
  return {
    platform: "tiktok",
    async publish(integration: IntegrationRow, input: PublishInput & { tiktokPrivacy?: string }): Promise<PublishResult> {
      const videoUrl = input.mediaUrls[0];
      if (!videoUrl) return { status: "error", errorMessage: "TikTok ต้องมีไฟล์วิดีโอ 1 ไฟล์ใน mediaUrls" };
      try {
        const token = await getAccessToken(integration, deps);
        const creator = await api(deps, token, "/v2/post/publish/creator_info/query/", {});
        const allowed: string[] = creator.privacy_level_options ?? [];
        const privacy = choosePrivacy(input.tiktokPrivacy ?? mapPrivacy(input.privacyStatus), allowed);

        const vr = await deps.fetch(videoUrl);
        if (!vr.ok) return { status: "error", errorMessage: `ดึงไฟล์วิดีโอไม่ได้: HTTP ${vr.status}` };
        const buf = Buffer.from(await vr.arrayBuffer());
        const { chunkSize, total } = planChunks(buf.length);

        const init = await api(deps, token, "/v2/post/publish/video/init/", {
          post_info: {
            title: input.content.slice(0, TITLE_MAX),
            privacy_level: privacy,
            disable_comment: !!creator.comment_disabled,
            disable_duet: !!creator.duet_disabled,
            disable_stitch: !!creator.stitch_disabled,
          },
          source_info: { source: "FILE_UPLOAD", video_size: buf.length, chunk_size: chunkSize, total_chunk_count: total },
        });
        const publishId: string = init.publish_id;
        const uploadUrl: string = init.upload_url;
        if (!publishId || !uploadUrl) throw new Error("TikTok ไม่ได้คืน publish_id/upload_url");

        for (const { start, end } of chunkRanges(buf.length, chunkSize, total)) {
          const r = await deps.fetch(uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": vr.headers.get("content-type")?.startsWith("video/") ? vr.headers.get("content-type")! : "video/mp4",
              "Content-Length": String(end - start + 1),
              "Content-Range": `bytes ${start}-${end}/${buf.length}`,
            },
            body: buf.subarray(start, end + 1),
          });
          if (!r.ok) throw new Error(`อัปโหลดก้อน ${start}-${end} ไม่สำเร็จ: HTTP ${r.status}`);
        }

        for (let i = 0; i < deps.pollAttempts; i++) {
          const s = await api(deps, token, "/v2/post/publish/status/fetch/", { publish_id: publishId });
          if (s.status === "PUBLISH_COMPLETE") {
            const id = s.publicaly_available_post_id?.[0] ?? s.publicly_available_post_id?.[0];
            return { status: "success", remotePostId: id ? String(id) : publishId };
          }
          if (s.status === "FAILED") return { status: "error", errorMessage: `TikTok publish failed: ${s.fail_reason ?? "unknown"}` };
          await deps.sleep(5000);
        }
        // ยังประมวลผลอยู่ ถือว่าส่งสำเร็จ (SELF_ONLY มักไม่มี post id สาธารณะ)
        return { status: "success", remotePostId: publishId };
      } catch (err: any) {
        return { status: "error", errorMessage: err?.message ?? String(err) };
      }
    },
  };
}

export const tiktokProvider = createTiktokProvider();
