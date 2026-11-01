-- Schema สำหรับระบบโพสต์ข้ามแพลตฟอร์ม
-- รันผ่าน: npm run migrate (หรือ migrate:dev ตอนพัฒนา)

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,                 -- nanoid
  platform TEXT NOT NULL,              -- 'youtube' | 'facebook' | 'tiktok' | ...
  display_name TEXT NOT NULL,          -- ชื่อ/ชื่อช่องที่โชว์ในแอป
  external_account_id TEXT NOT NULL,   -- id ของบัญชีจากแพลตฟอร์มนั้น
  access_token_enc TEXT NOT NULL,      -- access token เข้ารหัสด้วย TOKEN_ENCRYPTION_KEY
  refresh_token_enc TEXT,              -- refresh token เข้ารหัส (ถ้าแพลตฟอร์มมี)
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, external_account_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,                 -- nanoid
  content TEXT NOT NULL,
  media_urls JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ผลลัพธ์แยกรายแพลตฟอร์มของโพสต์แต่ละอัน (รูปแบบเดียวกับที่ Postiz ทำ)
CREATE TABLE IF NOT EXISTS post_results (
  id TEXT PRIMARY KEY,                 -- nanoid
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | success | error
  remote_post_id TEXT,                 -- id ของโพสต์ที่แพลตฟอร์มปลายทางคืนมา
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ฉบับร่าง / ตั้งเวลา (แนวคิดจาก Postiz: draft → schedule → publish)
--   status: published (โพสต์ทันที แบบเดิม) | draft (รออนุมัติ) | scheduled (รอถึงเวลา) | publishing | failed
ALTER TABLE posts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS integration_ids JSONB;      -- ปลายทางที่เลือกไว้ (null = ทุกบัญชี)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS privacy_status TEXT;        -- YouTube: private | unlisted | public
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source TEXT;                -- ที่มา เช่น 'yingad:2026-10-19'
CREATE INDEX IF NOT EXISTS idx_posts_due ON posts(scheduled_at) WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_post_results_post_id ON post_results(post_id);
CREATE INDEX IF NOT EXISTS idx_integrations_platform ON integrations(platform);
