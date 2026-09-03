-- ไฟล์นี้ "สร้างจากโค้ด" — ห้ามแก้ด้วยมือ
-- แก้ที่ functions/issue/api/_lib/schema.js แล้วรัน: node tools/zocial/gen-schema.mjs
-- (เทสต์ tests/zocial.mjs เทียบ 2 ไฟล์ให้ ถ้าไม่ตรงกันจะตก)
--
-- ⚠️ ปกติไม่ต้องรันไฟล์นี้เอง — endpoint สร้างตารางให้เองครั้งแรกที่ใช้งาน
--    เก็บไว้ให้คนอ่านและไว้กู้ระบบเวลาต้องสร้างใหม่จากศูนย์

CREATE TABLE IF NOT EXISTS upload_batch (
  id TEXT PRIMARY KEY, campaign TEXT NOT NULL, tz_mode TEXT NOT NULL,
  rows_total INTEGER NOT NULL, rows_kept INTEGER NOT NULL, rows_dropped INTEGER NOT NULL,
  date_from TEXT, date_to TEXT, uploaded_at TEXT NOT NULL, uploaded_by TEXT
);

CREATE TABLE IF NOT EXISTS raw_messages (
  id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, campaign TEXT NOT NULL,
  date TEXT NOT NULL, posted_at TEXT NOT NULL, source TEXT NOT NULL,
  kind TEXT NOT NULL, post_url TEXT,
  account TEXT, account_type TEXT NOT NULL, expires INTEGER NOT NULL,
  snippet TEXT NOT NULL, url TEXT NOT NULL,
  engagement INTEGER, comments INTEGER, likes INTEGER, shares INTEGER,
  sentiment_raw TEXT, sentiment_final TEXT,
  sentiment_checked INTEGER NOT NULL DEFAULT 0, sentiment_profile TEXT, rubric_version TEXT
);

CREATE INDEX IF NOT EXISTS raw_messages_day ON raw_messages (campaign, date);

CREATE INDEX IF NOT EXISTS raw_messages_purge ON raw_messages (expires, date);

CREATE INDEX IF NOT EXISTS raw_messages_post ON raw_messages (post_url);

CREATE TABLE IF NOT EXISTS daily_news (
  id TEXT PRIMARY KEY, campaign TEXT NOT NULL, date TEXT NOT NULL, posted_at TEXT NOT NULL,
  source TEXT NOT NULL, account TEXT, account_type TEXT NOT NULL, expires INTEGER NOT NULL,
  snippet TEXT NOT NULL, url TEXT NOT NULL, engagement INTEGER,
  comment_count INTEGER,
  comment_sent_neg INTEGER, comment_sent_neu INTEGER, comment_sent_pos INTEGER,
  post_sent TEXT, post_sent_src TEXT,
  sentiment_checked INTEGER NOT NULL DEFAULT 0, sentiment_profile TEXT, rubric_version TEXT
);

CREATE INDEX IF NOT EXISTS daily_news_day ON daily_news (campaign, date, engagement DESC);

CREATE INDEX IF NOT EXISTS daily_news_purge ON daily_news (expires, date);

CREATE TABLE IF NOT EXISTS daily_aggregate (
  campaign TEXT NOT NULL, date TEXT NOT NULL, source TEXT NOT NULL,
  posts INTEGER NOT NULL, comments INTEGER, engagement INTEGER,
  neg INTEGER, neu INTEGER, pos INTEGER,
  comment_neg INTEGER, comment_neu INTEGER, comment_pos INTEGER,
  sent_src TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (campaign, date, source)
);

CREATE TABLE IF NOT EXISTS setting (key TEXT PRIMARY KEY, value TEXT NOT NULL);

INSERT OR IGNORE INTO setting (key, value) VALUES ('tz_mode','th');

INSERT OR IGNORE INTO setting (key, value) VALUES ('retention_days','180');
