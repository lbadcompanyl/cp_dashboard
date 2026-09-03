/**
 * store.js — ประกอบคำสั่ง SQL ของคอลัมน์ "คนพูดถึงเรา"
 * ====================================================
 * 🎯 ทุกฟังก์ชันที่นี่ **คืนค่าเป็น {sql, params} เฉยๆ ไม่ยิงเข้า D1 เอง**
 *    เพื่อให้เทสต์ตรวจได้ว่า "จะยิงคำสั่งอะไร กี่ครั้ง แตะตารางไหน" โดยไม่ต้องมี D1 จริง
 *    (เครื่องที่รัน session ไม่มี D1 — ยืนยันของจริงต้องให้เจ้าของเปิดดูเอง)
 */
import { DDL, PURGE_TABLES, RETENTION_DEFAULT_DAYS } from "./schema.js";

export { DDL, PURGE_TABLES, RETENTION_DEFAULT_DAYS };

/** คอลัมน์ที่ "มาจากไฟล์ต้นทาง" — upload ไฟล์ใหม่ทับได้ */
const RAW_FROM_FILE = ["campaign", "date", "posted_at", "source", "kind", "post_url",
  "account", "account_type", "expires", "snippet", "url",
  "engagement", "comments", "likes", "shares", "sentiment_raw"];

/**
 * 🚫 คอลัมน์ที่ห้ามถูก upload ทับเด็ดขาด — เป็นผลจากตัวตัดสินของเราเอง
 *    upload ไฟล์เดิมซ้ำแล้ว sentiment ที่ตรวจไว้หายหมด = ต้องจ่ายค่า AI ตรวจใหม่ทั้งกอง
 */
export const NEVER_OVERWRITE = ["sentiment_final", "sentiment_checked", "sentiment_profile", "rubric_version"];

const RAW_COLS = ["id", "batch_id", ...RAW_FROM_FILE, "sentiment_final", "sentiment_checked", "sentiment_profile", "rubric_version"];

const qs = (n) => Array(n).fill("?").join(",");

/** แถวดิบ 1 ใบ → คำสั่ง insert (ทับเฉพาะคอลัมน์ที่มาจากไฟล์) */
export function insertRaw(batchId, r) {
  const set = RAW_FROM_FILE.map((c) => `${c}=excluded.${c}`).join(", ");
  return {
    sql: `INSERT INTO raw_messages (${RAW_COLS.join(",")}) VALUES (${qs(RAW_COLS.length)})
          ON CONFLICT(id) DO UPDATE SET ${set}`,
    params: [r.id, batchId, r.campaign, r.date, r.postedAt, r.source, r.kind, r.postUrl,
      r.account, r.accountType, r.expires ? 1 : 0, r.snippet, r.url,
      num(r.engagement), num(r.comments), num(r.likes), num(r.shares), r.sentimentRaw,
      null, 0, null, null],
  };
}

const NEWS_FROM_FILE = ["campaign", "date", "posted_at", "source", "account", "account_type",
  "expires", "snippet", "url", "engagement", "post_sent", "post_sent_src"];
const NEWS_COLS = ["id", ...NEWS_FROM_FILE, "comment_count", "comment_sent_neg", "comment_sent_neu",
  "comment_sent_pos", "sentiment_checked", "sentiment_profile", "rubric_version"];

/**
 * โพสต์ 1 ใบ → คำสั่ง insert ลงตารางการ์ด
 * ⚠️ เฉพาะ kind === "post" — คอมเมนต์ไม่ขึ้นการ์ด (แต่ยังเก็บครบใน raw_messages)
 * ⚠️ post_sent ระยะแรกเป็นค่าดิบของ Zocial จึงต้องมี post_sent_src = "zocial" ติดไปเสมอ
 *    ห้ามใส่ค่าโดยไม่บอกที่มา — หน้าเว็บต้องเอาไปขึ้นป้ายให้ผู้ใช้เห็น
 */
export function insertNews(r) {
  const set = NEWS_FROM_FILE.map((c) => `${c}=excluded.${c}`).join(", ");
  const sent = zocialSent(r.sentimentRaw);
  return {
    sql: `INSERT INTO daily_news (${NEWS_COLS.join(",")}) VALUES (${qs(NEWS_COLS.length)})
          ON CONFLICT(id) DO UPDATE SET ${set}`,
    params: [r.id, r.campaign, r.date, r.postedAt, r.source, r.account, r.accountType,
      r.expires ? 1 : 0, r.snippet, r.url, num(r.engagement),
      sent, sent === null ? null : "zocial",
      null, null, null, null, 0, null, null],
  };
}

/** "Negative" ของ Zocial → "neg" · อ่านไม่ออกคืน null 🚫 ห้ามเดาเป็น "neu" */
export function zocialSent(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("neg") || s === "ลบ") return "neg";
  if (s.startsWith("pos") || s === "บวก") return "pos";
  if (s.startsWith("neu") || s === "กลาง") return "neu";
  return null;
}

const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * นับคอมเมนต์ที่อยู่ใต้โพสต์แต่ละใบ (เฉพาะที่อยู่ในฐานข้อมูลของเรา)
 * ⚠️ ไม่ใช่ยอดจริงบนโพสต์ — หน้าเว็บต้องเขียนกำกับว่า "ในไฟล์" เสมอ
 */
export function refreshCommentCounts(campaign, dates) {
  return {
    sql: `UPDATE daily_news SET comment_count = (
            SELECT COUNT(*) FROM raw_messages r
            WHERE r.campaign = daily_news.campaign AND r.post_url = daily_news.url
              AND r.kind IN ('comment','reply'))
          WHERE campaign = ? AND date IN (${qs(dates.length)})`,
    params: [campaign, ...dates],
  };
}

/**
 * สรุปตัวเลขรายวัน → daily_aggregate (ตัวเลขล้วน เก็บถาวร)
 * 🔴 ต้องทำ "ตอน upload" ไม่ใช่ตอนเปิดหน้าเว็บ — คอมเมนต์เกือบทั้งหมดเป็นของบุคคล
 *    ซึ่งจะถูกลบเมื่อครบกำหนด ถ้ารอไปนับทีหลังจะไม่เหลืออะไรให้นับ
 * ⚠️ sent_src = "zocial" เพราะระยะนี้ยังไม่มีตัวตัดสินของเรา — ตัวเลขนี้อยู่ถาวร
 *    ถ้าไม่เขียนที่มาไว้ อีก 2 ปีจะไม่มีใครรู้ว่ามันมาจากเกณฑ์ไหน
 */
export function rebuildAggregate(campaign, dates, now) {
  const cnt = (kind, sent) =>
    `SUM(CASE WHEN kind ${kind} AND lower(COALESCE(sentiment_final, sentiment_raw)) LIKE '${sent}%' THEN 1 ELSE 0 END)`;
  return {
    sql: `INSERT INTO daily_aggregate
            (campaign,date,source,posts,comments,engagement,neg,neu,pos,comment_neg,comment_neu,comment_pos,sent_src,updated_at)
          SELECT campaign, date, source,
            SUM(CASE WHEN kind = 'post' THEN 1 ELSE 0 END),
            SUM(CASE WHEN kind IN ('comment','reply') THEN 1 ELSE 0 END),
            SUM(COALESCE(engagement,0)),
            ${cnt("= 'post'", "neg")}, ${cnt("= 'post'", "neu")}, ${cnt("= 'post'", "pos")},
            ${cnt("IN ('comment','reply')", "neg")}, ${cnt("IN ('comment','reply')", "neu")}, ${cnt("IN ('comment','reply')", "pos")},
            CASE WHEN SUM(sentiment_checked) > 0 THEN 'mixed' ELSE 'zocial' END,
            ?
          FROM raw_messages WHERE campaign = ? AND date IN (${qs(dates.length)})
          GROUP BY campaign, date, source
          ON CONFLICT(campaign,date,source) DO UPDATE SET
            posts=excluded.posts, comments=excluded.comments, engagement=excluded.engagement,
            neg=excluded.neg, neu=excluded.neu, pos=excluded.pos,
            comment_neg=excluded.comment_neg, comment_neu=excluded.comment_neu, comment_pos=excluded.comment_pos,
            sent_src=excluded.sent_src, updated_at=excluded.updated_at`,
    params: [now, campaign, ...dates],
  };
}

/**
 * ลบข้อมูลที่เกินกำหนด — ทำตอนมีคน upload (Pages ตั้ง cron ไม่ได้)
 * 🚫 แตะได้แค่ตารางใน PURGE_TABLES — daily_aggregate ห้ามแตะเด็ดขาด (ตัวเลขล้วน ไม่มีข้อมูลบุคคล)
 * 🚫 และลบเฉพาะ expires = 1 — เพจ/สื่อ/องค์กรเก็บถาวร
 */
export function purge(cutoffDate) {
  return PURGE_TABLES.map((t) => ({
    sql: `DELETE FROM ${t} WHERE expires = 1 AND date < ?`,
    params: [cutoffDate],
  }));
}

/** วันที่ตัด = วันนี้ (ปฏิทินไทย) ถอยหลังไป N วัน */
export function cutoffDate(todayKey, days) {
  const [y, m, d] = todayKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - days * 86400000);
  const p = (n) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

/** {sql,params} → statement ของ D1 · ที่เดียวที่แตะ db จริง */
export const bind = (db, s) => db.prepare(s.sql).bind(...s.params);

/** ยิงเป็นก้อน — D1 รับ batch ได้ทีละมากๆ แต่ก้อนใหญ่เกินจะ timeout จึงหั่นเป็นชิ้น */
export async function runAll(db, stmts, chunk = 200) {
  let n = 0;
  for (let i = 0; i < stmts.length; i += chunk) {
    await db.batch(stmts.slice(i, i + chunk).map((s) => bind(db, s)));
    n += Math.min(chunk, stmts.length - i);
  }
  return n;
}
