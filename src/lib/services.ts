// ตรรกะหลักที่ใช้ร่วมกันระหว่าง REST (routes/*) และ MCP (mcp.ts)
import { nanoid } from "nanoid";
import { pool } from "../db/pool.js";
import { providers } from "../providers/registry.js";
import type { IntegrationRow, PostStats, PrivacyStatus } from "../providers/types.js";

export async function listIntegrations() {
  const { rows } = await pool.query(
    `SELECT id, platform, display_name, external_account_id, created_at
     FROM integrations ORDER BY created_at DESC`
  );
  return rows;
}

export async function listPosts(limit = 50) {
  const { rows: posts } = await pool.query(
    `SELECT id, content, media_urls, created_at FROM posts ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  if (posts.length === 0) return [];
  const { rows: results } = await pool.query(
    `SELECT post_id, platform, status, remote_post_id, error_message
     FROM post_results WHERE post_id = ANY($1) ORDER BY created_at`,
    [posts.map((p) => p.id)]
  );
  const byPost = new Map<string, unknown[]>();
  for (const r of results) {
    const list = byPost.get(r.post_id) ?? [];
    list.push(r);
    byPost.set(r.post_id, list);
  }
  return posts.map((p) => ({ ...p, results: byPost.get(p.id) ?? [] }));
}

export interface CreatePostOutcome {
  postId: string;
  results: Array<{ integration?: string; platform?: string; status: "success" | "error"; postId?: string; error?: string }>;
}

/** โพสต์ครั้งเดียว ยิงทุกบัญชี (หรือเฉพาะ integrationIds) คืน null ถ้าไม่มีบัญชีตรงกับที่ขอ */
export async function createPost(
  content: string,
  mediaUrls: string[] = [],
  integrationIds?: string[],
  privacyStatus?: PrivacyStatus
): Promise<CreatePostOutcome | null> {
  const filter = integrationIds?.length
    ? { sql: `WHERE id = ANY($1)`, params: [integrationIds] }
    : { sql: ``, params: [] };
  const { rows: integrations } = await pool.query<IntegrationRow>(`SELECT * FROM integrations ${filter.sql}`, filter.params);
  if (integrations.length === 0) return null;

  const postId = nanoid();
  await pool.query(`INSERT INTO posts (id, content, media_urls) VALUES ($1, $2, $3)`, [
    postId,
    content,
    JSON.stringify(mediaUrls),
  ]);

  // ยิงพร้อมกัน แต่ละแพลตฟอร์มพังไม่กระทบตัวอื่น
  const outcomes = await Promise.allSettled(
    integrations.map(async (integration) => {
      const provider = providers[integration.platform];
      const result = provider
        ? await provider.publish(integration, { content, mediaUrls, privacyStatus })
        : { status: "error" as const, errorMessage: `ไม่รู้จักแพลตฟอร์ม ${integration.platform}` };

      await pool.query(
        `INSERT INTO post_results (id, post_id, integration_id, platform, status, remote_post_id, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [nanoid(), postId, integration.id, integration.platform, result.status, result.remotePostId ?? null, result.errorMessage ?? null]
      );
      return {
        integration: integration.id,
        platform: integration.platform,
        status: result.status,
        postId: result.remotePostId,
        error: result.errorMessage,
      };
    })
  );

  const results = outcomes.map((o) =>
    o.status === "fulfilled" ? o.value : { status: "error" as const, error: String(o.reason) }
  );
  return { postId, results };
}

export interface AnalyticsItem {
  postId: string;
  platform: string;
  remotePostId: string;
  stats?: PostStats;
  note?: string;
}

/** สถิติโพสต์ที่ส่งสำเร็จ (ไม่ระบุ postId = 20 โพสต์ล่าสุด) ดึงสดจากแพลตฟอร์มปลายทาง */
export async function getAnalytics(postId: string | null): Promise<AnalyticsItem[]> {
  const { rows } = await pool.query(
    `SELECT r.post_id, r.platform, r.remote_post_id, r.integration_id
     FROM post_results r
     WHERE r.status = 'success' AND r.remote_post_id IS NOT NULL
       AND ($1::text IS NULL OR r.post_id = $1)
       AND ($1::text IS NOT NULL OR r.post_id IN (SELECT id FROM posts ORDER BY created_at DESC LIMIT 20))
     ORDER BY r.created_at DESC`,
    [postId]
  );

  const byIntegration = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byIntegration.get(r.integration_id) ?? [];
    list.push(r);
    byIntegration.set(r.integration_id, list);
  }

  const items: AnalyticsItem[] = [];
  for (const [integrationId, list] of byIntegration) {
    const { rows: integ } = await pool.query<IntegrationRow>(`SELECT * FROM integrations WHERE id = $1`, [integrationId]);
    const provider = providers[list[0].platform];
    let stats: Record<string, PostStats> = {};
    let note: string | undefined;
    if (!integ[0]) note = "บัญชีที่เชื่อมไว้ถูกลบแล้ว";
    else if (!provider?.getStats) note = "แพลตฟอร์มนี้ยังไม่รองรับการดึงสถิติ";
    else {
      try {
        stats = await provider.getStats(integ[0], list.map((r) => r.remote_post_id));
      } catch (err) {
        note = err instanceof Error ? err.message : String(err);
      }
    }
    for (const r of list) {
      items.push({
        postId: r.post_id,
        platform: r.platform,
        remotePostId: r.remote_post_id,
        stats: stats[r.remote_post_id],
        note: note ?? (stats[r.remote_post_id] ? undefined : "ไม่พบโพสต์บนแพลตฟอร์ม (อาจถูกลบหรือยังประมวลผลอยู่)"),
      });
    }
  }
  return items;
}
