-- schema.sql — โครงฐานข้อมูล D1 ของคอลัมน์ "คนพูดถึงเรา" (Zocial Eye)
-- =====================================================================
-- ⚠️ ยังไม่ได้รันจริง — โปรเจกต์นี้ยังไม่เคยเปิด D1 เลย (§7.4 ของ ZOCIAL-HANDOFF.md)
--    เจ้าของต้องสร้าง database + binding ใน Cloudflare ก่อน แล้วค่อยรันไฟล์นี้
--    วิธีรัน (จากเครื่องที่มี wrangler):  wrangler d1 execute <ชื่อ db> --file tools/zocial/schema.sql
--
-- 🔐 หลักที่ยึด (จาก §4 §5 ของ handoff — เจ้าของเคาะแล้ว)
--    · เก็บชื่อจริง + ลิงก์ ทั้งเพจและบุคคล **ไม่ hash** (hash แล้วยังเก็บ URL = หลอกตัวเอง)
--    · ตัวที่ป้องกันคือ Cloudflare Access + การลบตามกำหนด ไม่ใช่การ hash
--    · เพจ/สื่อ/องค์กร = เก็บถาวร · บุคคลธรรมดา = ลบตาม retention
--    · 🔴 account_type = 'unknown' ให้ถือว่าเป็น "บุคคล" เสมอ (คอลัมน์ expires ตัดสินไว้ตั้งแต่ตอน insert)

PRAGMA foreign_keys = ON;

-- ── 1. ทุกครั้งที่มีคน upload 1 ไฟล์ = 1 แถวที่นี่ ────────────────────────
CREATE TABLE IF NOT EXISTS upload_batch (
  id           TEXT PRIMARY KEY,          -- uuid ที่ฝั่งเซิร์ฟเวอร์สร้าง
  campaign     TEXT NOT NULL,
  tz_mode      TEXT NOT NULL,             -- 'th' | 'utc' — ผู้ใช้เลือกตอน preview (§7.3)
  rows_total   INTEGER NOT NULL,
  rows_kept    INTEGER NOT NULL,
  rows_dropped INTEGER NOT NULL,
  date_from    TEXT,                       -- 'YYYY-MM-DD' ตามปฏิทินไทย
  date_to      TEXT,
  uploaded_at  TEXT NOT NULL,              -- ISO 8601 พร้อม offset
  uploaded_by  TEXT                        -- อีเมลจาก Cloudflare Access · null ได้ถ้ายังไม่ได้ตั้ง Access
  -- 🚫 ห้ามเก็บชื่อไฟล์ดิบ — ชื่อไฟล์ที่ export ออกมามัก "มี campaign id ของลูกค้าอยู่ข้างใน"
);

-- ── 2. แถวดิบจากไฟล์ — ลบทั้งหมดตาม retention ────────────────────────────
-- 🔴 เก็บ "คอมเมนต์และคำตอบกลับ" ตั้งแต่วันแรกด้วย ถึงจะยังไม่เอาขึ้นหน้าจอ
--    (สั่งโดยห้องกรองข่าว 3 ก.ย. 2026) — ไม่เก็บตอนนี้ = กู้ย้อนหลังไม่ได้เลยเมื่อไฟล์ต้นทางหาย
--    ในไฟล์จริง 12,004 แถว เป็นคอมเมนต์ 7,062 + ตอบกลับ 1,394 = เกินครึ่งของไฟล์
CREATE TABLE IF NOT EXISTS raw_messages (
  id           TEXT PRIMARY KEY,          -- rowId() = ลิงก์ + เวลา · upload ไฟล์ซ้ำจึงไม่เกิดแถวซ้ำ
  batch_id     TEXT NOT NULL REFERENCES upload_batch(id) ON DELETE CASCADE,
  campaign     TEXT NOT NULL,
  date         TEXT NOT NULL,             -- 'YYYY-MM-DD' ปฏิทินไทย = คีย์ที่แดชบอร์ดใช้
  posted_at    TEXT NOT NULL,             -- ISO 8601 พร้อม offset (ห้ามเก็บเป็นข้อความไทย)
  source       TEXT NOT NULL,             -- facebook|x|instagram|tiktok|youtube|forum|news|other
  kind         TEXT NOT NULL,             -- post|comment|reply  ⚠️ ไฟล์เอามาปนกันในชีตเดียว
  post_url     TEXT,                      -- คอมเมนต์อยู่ใต้โพสต์ไหน (ใช้จับกลุ่มตอนทำการ์ด)
  account      TEXT,
  account_type TEXT NOT NULL,             -- page|person|unknown
  expires      INTEGER NOT NULL,          -- 1 = ลบตาม retention · 0 = เก็บถาวร (เพจเท่านั้น)
  snippet      TEXT NOT NULL,             -- ≤200 ตัวอักษร
  url          TEXT NOT NULL,
  engagement   INTEGER, comments INTEGER, likes INTEGER, shares INTEGER,
  sentiment_raw   TEXT,                   -- ค่าดิบจาก Zocial · ⚠️ ผิดบ่อยและผิดแรง ห้ามโชว์โดยไม่บอกที่มา
  sentiment_final TEXT,                   -- ของเราเอง · 🔴 คำนวณไม่ได้ต้องเป็น NULL ห้ามเติม 'neu'
  -- 3 ช่องล่างมาจากข้อตกลงกับห้อง sentiment (3 ก.ย. 2026)
  sentiment_checked  INTEGER NOT NULL DEFAULT 0,  -- 0 = ยังใช้ค่าดิบของ Zocial อยู่ ยังไม่ผ่านตัวตัดสินของเรา
  sentiment_profile  TEXT,                -- 'news_post' | 'cp_comment' — คนละเกณฑ์กัน ห้ามเอามาเทียบกันตรงๆ
  rubric_version     TEXT                 -- ⚠️ ต้องเอามาจากคำตอบของ worker ห้ามเราเขียนเอง ไม่งั้นเป็นเลขที่โกหก
);
CREATE INDEX IF NOT EXISTS raw_messages_day   ON raw_messages (campaign, date);
CREATE INDEX IF NOT EXISTS raw_messages_purge ON raw_messages (expires, date);
CREATE INDEX IF NOT EXISTS raw_messages_post  ON raw_messages (post_url);

-- ── 3. การ์ดที่แดชบอร์ดหยิบไปแสดง ────────────────────────────────────────
--    เพจ = เก็บถาวร (นิติบุคคล + ต้องย้อนดู monitoring ได้)
--    บุคคล/unknown = ลบพร้อม raw · ไม่งั้น "ลบ raw แต่สำเนายังอยู่ถาวร = ไม่ได้ลบจริง"
CREATE TABLE IF NOT EXISTS daily_news (
  id           TEXT PRIMARY KEY,
  campaign     TEXT NOT NULL,
  date         TEXT NOT NULL,
  posted_at    TEXT NOT NULL,
  source       TEXT NOT NULL,
  account      TEXT,
  account_type TEXT NOT NULL,
  expires      INTEGER NOT NULL,
  snippet      TEXT NOT NULL,
  url          TEXT NOT NULL,
  engagement   INTEGER,
  comment_count INTEGER,                  -- ⚠️ นับเฉพาะที่อยู่ในไฟล์ ไม่ใช่ยอดจริงบนโพสต์ (§7.1)
  -- ของคอมเมนต์ใต้โพสต์ · ปล่อย NULL ไว้ก่อนได้ แต่ต้องมีช่องไว้ตั้งแต่วันแรก
  comment_sent_neg INTEGER, comment_sent_neu INTEGER, comment_sent_pos INTEGER,
  post_sent    TEXT,                      -- ของตัวโพสต์เอง · NULL = ยังไม่รู้ ห้ามเติม 'neu'
  post_sent_src TEXT,                     -- 'zocial' = ค่าดิบ · 'ours' = ผ่านตัวตัดสินของเราแล้ว
  sentiment_checked INTEGER NOT NULL DEFAULT 0,
  sentiment_profile TEXT,
  rubric_version    TEXT
);
CREATE INDEX IF NOT EXISTS daily_news_day   ON daily_news (campaign, date, engagement DESC);
CREATE INDEX IF NOT EXISTS daily_news_purge ON daily_news (expires, date);

-- ── 4. ตัวเลขล้วน ไม่มีอะไรระบุตัวบุคคล → เก็บถาวร ──────────────────────
--    🚫 ตัวลบ retention ห้ามแตะตารางนี้เด็ดขาด
-- 🔴 ต้องคำนวณ "ตอน upload" ไม่ใช่คำนวณตอนเปิดหน้าเว็บ
--    คอมเมนต์เกือบทั้งหมดเป็นของบุคคล = ถูกลบเมื่อครบกำหนด ถ้ารอไปคำนวณทีหลัง
--    พอถึงวันที่ 181 จะไม่เหลืออะไรให้นับ แล้วกราฟย้อนหลังจะกลายเป็นศูนย์ทั้งแถบ
CREATE TABLE IF NOT EXISTS daily_aggregate (
  campaign   TEXT NOT NULL,
  date       TEXT NOT NULL,
  source     TEXT NOT NULL,
  posts      INTEGER NOT NULL,
  comments   INTEGER,
  engagement INTEGER,
  neg INTEGER, neu INTEGER, pos INTEGER,                        -- ของโพสต์
  comment_neg INTEGER, comment_neu INTEGER, comment_pos INTEGER, -- ของคอมเมนต์
  updated_at TEXT NOT NULL,
  PRIMARY KEY (campaign, date, source)
);

-- ── 5. ค่าตั้งค่าที่ผู้ใช้เลือกไว้ (timezone ของไฟล์ · จำนวนวันที่เก็บ) ──────
CREATE TABLE IF NOT EXISTS setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO setting (key, value) VALUES
  ('tz_mode', 'th'),          -- ⚠️ ค่าตั้งต้น ไม่ใช่คำตอบที่ยืนยันแล้ว — §7.3 ยังค้าง
  ('retention_days', '180');
