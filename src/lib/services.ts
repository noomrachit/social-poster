// ตรรกะหลักที่ใช้ร่วมกันระหว่าง REST (routes/*) และ MCP (mcp.ts)
import { nanoid } from "nanoid";
import { pool } from "../db/pool.js";
import { providers } from "../providers/registry.js";
import type { IntegrationRow, PostStats, PrivacyStatus } from "../providers/types.js";
import { fetchDailyPick, isDate, parseDailyPick, todayIn, toYoutubeContent } from "./yingad.js";

export async function listIntegrations() {
  const { rows } = await pool.query(
    `SELECT id, platform, display_name, external_account_id, created_at
     FROM integrations ORDER BY created_at DESC`
  );
  return rows;
}

export async function listPosts(limit = 50) {
  const { rows: posts } = await pool.query(
    `SELECT id, content, media_urls, status, scheduled_at, source, created_at FROM posts ORDER BY created_at DESC LIMIT $1`,
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

export const POST_STATUSES = ["published", "draft", "scheduled", "publishing", "failed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

async function findIntegrations(integrationIds?: string[] | null): Promise<IntegrationRow[]> {
  const filter = integrationIds?.length
    ? { sql: `WHERE id = ANY($1)`, params: [integrationIds] }
    : { sql: ``, params: [] };
  const { rows } = await pool.query<IntegrationRow>(`SELECT * FROM integrations ${filter.sql}`, filter.params);
  return rows;
}

/** ยิงโพสต์ที่บันทึกแล้วไปทุกบัญชี แต่ละแพลตฟอร์มพังไม่กระทบตัวอื่น ผลแยกรายแพลตฟอร์มลง post_results */
async function fanOut(
  postId: string,
  integrations: IntegrationRow[],
  content: string,
  mediaUrls: string[],
  privacyStatus?: PrivacyStatus
): Promise<CreatePostOutcome> {
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

/** โพสต์ครั้งเดียว ยิงทุกบัญชี (หรือเฉพาะ integrationIds) คืน null ถ้าไม่มีบัญชีตรงกับที่ขอ */
export async function createPost(
  content: string,
  mediaUrls: string[] = [],
  integrationIds?: string[],
  privacyStatus?: PrivacyStatus
): Promise<CreatePostOutcome | null> {
  const integrations = await findIntegrations(integrationIds);
  if (integrations.length === 0) return null;

  const postId = nanoid();
  await pool.query(
    `INSERT INTO posts (id, content, media_urls, status, integration_ids, privacy_status)
     VALUES ($1, $2, $3, 'published', $4, $5)`,
    [postId, content, JSON.stringify(mediaUrls), integrationIds?.length ? JSON.stringify(integrationIds) : null, privacyStatus ?? null]
  );
  return fanOut(postId, integrations, content, mediaUrls, privacyStatus);
}

export interface DraftInput {
  content: string;
  mediaUrls?: string[];
  integrationIds?: string[];
  privacyStatus?: PrivacyStatus;
  /** ใส่ = ตั้งเวลา (status scheduled) ไม่ใส่ = ฉบับร่าง (status draft) */
  scheduledAt?: Date;
  source?: string;
}

/** บันทึกเป็นฉบับร่างหรือตั้งเวลา ยังไม่ยิงไปแพลตฟอร์มใด คืน null ถ้าไม่มีบัญชีตรงกับที่ขอ */
export async function createDraft(input: DraftInput): Promise<{ postId: string; status: PostStatus; scheduledAt: string | null } | null> {
  const integrations = await findIntegrations(input.integrationIds);
  if (integrations.length === 0) return null;
  const postId = nanoid();
  const status: PostStatus = input.scheduledAt ? "scheduled" : "draft";
  await pool.query(
    `INSERT INTO posts (id, content, media_urls, status, scheduled_at, integration_ids, privacy_status, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      postId,
      input.content,
      JSON.stringify(input.mediaUrls ?? []),
      status,
      input.scheduledAt ?? null,
      input.integrationIds?.length ? JSON.stringify(input.integrationIds) : null,
      input.privacyStatus ?? null,
      input.source ?? null,
    ]
  );
  return { postId, status, scheduledAt: input.scheduledAt?.toISOString() ?? null };
}

export type PublishStoredOutcome =
  | { ok: true; outcome: CreatePostOutcome }
  | { ok: false; reason: "not_found" | "not_publishable" | "no_integrations"; status?: string };

/** ยิงโพสต์ที่เป็นร่าง/ตั้งเวลาไว้ จองแถวด้วย UPDATE ... WHERE status กันยิงซ้ำ */
export async function publishStoredPost(postId: string, opts: { onlyIfDue?: boolean } = {}): Promise<PublishStoredOutcome> {
  const { rows } = await pool.query(
    `UPDATE posts SET status = 'publishing'
     WHERE id = $1 AND status IN ('draft', 'scheduled')
       AND ($2::boolean IS NOT TRUE OR (status = 'scheduled' AND scheduled_at <= now()))
     RETURNING id, content, media_urls, integration_ids, privacy_status`,
    [postId, opts.onlyIfDue ?? false]
  );
  const post = rows[0];
  if (!post) {
    const { rows: existing } = await pool.query(`SELECT status FROM posts WHERE id = $1`, [postId]);
    return existing[0] ? { ok: false, reason: "not_publishable", status: existing[0].status } : { ok: false, reason: "not_found" };
  }
  const integrations = await findIntegrations(post.integration_ids);
  if (integrations.length === 0) {
    await pool.query(`UPDATE posts SET status = 'failed' WHERE id = $1`, [postId]);
    return { ok: false, reason: "no_integrations" };
  }
  const outcome = await fanOut(postId, integrations, post.content, post.media_urls ?? [], post.privacy_status ?? undefined);
  const anySuccess = outcome.results.some((r) => r.status === "success");
  await pool.query(`UPDATE posts SET status = $2 WHERE id = $1`, [postId, anySuccess ? "published" : "failed"]);
  return { ok: true, outcome };
}

/** ยิงโพสต์ตั้งเวลาที่ถึงเวลาแล้ว (ตัวตั้งเวลาใน index.ts เรียกทุกนาที) */
export async function runDuePosts(limit = 10): Promise<number> {
  const { rows } = await pool.query(
    `SELECT id FROM posts WHERE status = 'scheduled' AND scheduled_at <= now() ORDER BY scheduled_at LIMIT $1`,
    [limit]
  );
  for (const r of rows) {
    try {
      await publishStoredPost(r.id, { onlyIfDue: true });
    } catch (err) {
      console.error(`scheduler: post ${r.id} failed:`, err);
      await pool.query(`UPDATE posts SET status = 'failed' WHERE id = $1 AND status = 'publishing'`, [r.id]);
    }
  }
  return rows.length;
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

export type ImportYingadOutcome =
  | { ok: true; postId: string; status: PostStatus; scheduledAt: string | null; product: string; duplicate: boolean }
  | { ok: false; error: string };

/** ดึง daily-pick ของยิงแอดมาเป็นฉบับร่าง (หรือตั้งเวลา) ซ้ำวันเดิม = คืนโพสต์เดิม ไม่สร้างใหม่ */
export async function importYingad(opts: {
  date?: string;
  integrationIds?: string[];
  privacyStatus?: PrivacyStatus;
  scheduledAt?: Date;
}): Promise<ImportYingadOutcome> {
  const date = opts.date ?? todayIn();
  if (!isDate(date)) return { ok: false, error: "date ต้องเป็นรูปแบบ YYYY-MM-DD" };
  const source = `yingad:${date}`;

  const { rows: existing } = await pool.query(
    `SELECT id, status, scheduled_at FROM posts WHERE source = $1 AND status <> 'failed' ORDER BY created_at DESC LIMIT 1`,
    [source]
  );
  const markdown = await fetchDailyPick(date);
  if (markdown === null) return { ok: false, error: `ยังไม่มี daily-pick ของวันที่ ${date}` };
  const pick = parseDailyPick(markdown, date);
  if (!pick) return { ok: false, error: `อ่าน daily-pick ${date} ไม่ออก (ไม่พบหัวข้อสินค้าเด่น TikTok / คลิป / แคปชัน)` };
  if (existing[0]) {
    return {
      ok: true,
      postId: existing[0].id,
      status: existing[0].status,
      scheduledAt: existing[0].scheduled_at ? new Date(existing[0].scheduled_at).toISOString() : null,
      product: pick.product,
      duplicate: true,
    };
  }

  const draft = await createDraft({
    content: toYoutubeContent(pick),
    mediaUrls: [pick.videoUrl],
    integrationIds: opts.integrationIds,
    privacyStatus: opts.privacyStatus,
    scheduledAt: opts.scheduledAt,
    source,
  });
  if (!draft) return { ok: false, error: "ไม่มีบัญชีที่เชื่อมไว้ตรงกับที่ขอ (ดู GET /integrations)" };
  return { ok: true, ...draft, product: pick.product, duplicate: false };
}
