/* ท่อนบันทึกลง D1 ของคอลัมน์ "คนพูดถึงเรา" — รัน: node tests/zocialdb.mjs
 *
 * ⚠️ เครื่องที่รัน session ไม่มี D1 จริง เทสต์นี้จึงปลอม db แล้ววัดว่า
 *    "ยิงคำสั่งอะไร แตะตารางไหน กี่ครั้ง" — ไม่ใช่ "ข้อมูลใน D1 ถูกไหม"
 *    ของจริงต้องให้เจ้าของ upload ไฟล์บน preview แล้วดูผลเอง
 */
import fs from "node:fs";
import * as S from "../functions/issue/api/_lib/store.js";
import { onRequestPost } from "../functions/issue/api/upload.js";
import { onRequestGet } from "../functions/issue/api/listen.js";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

/** D1 ปลอม — จดทุกคำสั่งที่ถูกยิง */
function fakeDb(rows = {}) {
  const log = [];
  const mk = (sql, params = []) => ({
    sql, params,
    run: async () => (log.push({ sql, params }), { meta: { changes: rows.changes ?? 0 } }),
    first: async () => (log.push({ sql, params }), rows.first ? rows.first(sql) : null),
    all: async () => (log.push({ sql, params }), { results: rows.all ? rows.all(sql) : [] }),
  });
  return {
    log,
    prepare: (sql) => ({ ...mk(sql), bind: (...p) => mk(sql, p) }),
    batch: async (stmts) => { for (const s of stmts) log.push({ sql: s.sql, params: s.params, batched: true }); return []; },
  };
}
const post = (env, body) => onRequestPost({ env, request: { json: async () => body, headers: { get: () => null } } });
const rec = (o = {}) => ({ id: "r1", campaign: "c", date: "2026-09-02", postedAt: "2026-09-02T09:00:00+07:00",
  source: "facebook", kind: "post", postUrl: "https://a/p", account: "ก", accountType: "page", expires: false,
  snippet: "ข้อความ", url: "https://a/p", engagement: 5, comments: null, likes: null, shares: null,
  sentimentRaw: "Negative", ...o });

console.log("\n[1] ไม่มี D1 ต้องบอกให้ถูกเรื่อง ไม่ใช่พังเฉยๆ");
{
  const r = await post({}, { op: "begin" });
  const b = await r.json();
  ok("ตอบ 503 ไม่ใช่ 500", r.status === 503, String(r.status));
  ok("บอกชื่อตัวแปรที่ต้องตั้ง", b.message.includes("ZOCIAL_DB"));
  ok("บอกด้วยว่าต้องทำทั้ง Production และ Preview", b.message.includes("Preview"));
}

console.log("\n[2] begin — สร้างตารางให้เอง แล้วคืน batchId");
{
  const db = fakeDb();
  const b = await (await post({ ZOCIAL_DB: db }, { op: "begin", campaign: "c", tz: "th", total: 10, kept: 9, dropped: 1 })).json();
  ok("ได้ batchId", !!b.batchId);
  ok("รัน CREATE TABLE ให้ครบ", db.log.filter((l) => /CREATE TABLE IF NOT EXISTS/.test(l.sql)).length >= 5);
  ok("บันทึกว่าไฟล์นี้มากี่แถว", db.log.some((l) => /INSERT INTO upload_batch/.test(l.sql)));
  // 🚫 ชื่อไฟล์มี campaign id ของลูกค้าอยู่ข้างใน จึงห้ามเก็บ
  ok("ไม่มีคอลัมน์ชื่อไฟล์ในตาราง", !S.DDL.join(" ").includes("filename"));
}

console.log("\n[3] rows — คอมเมนต์เก็บไว้ แต่ไม่ขึ้นการ์ด");
{
  const db = fakeDb();
  await post({ ZOCIAL_DB: db }, { op: "rows", batchId: "b1", rows: [
    rec({ id: "p1", kind: "post" }),
    rec({ id: "c1", kind: "comment" }),
    rec({ id: "c2", kind: "reply" }),
  ] });
  const raw = db.log.filter((l) => /INSERT INTO raw_messages/.test(l.sql));
  const news = db.log.filter((l) => /INSERT INTO daily_news/.test(l.sql));
  ok("เก็บครบทั้ง 3 แถวใน raw_messages", raw.length === 3, String(raw.length));
  ok("ขึ้นการ์ดเฉพาะโพสต์ 1 ใบ", news.length === 1, String(news.length));
  ok("ส่งเป็นก้อน (batch) ไม่ยิงทีละคำสั่ง", db.log.every((l) => l.batched));
}

console.log("\n[4] 🔴 upload ไฟล์ซ้ำ ห้ามลบผลตรวจ sentiment ของเราทิ้ง");
{
  const set = S.insertRaw("b1", rec()).sql.split("DO UPDATE SET")[1];
  for (const c of S.NEVER_OVERWRITE) ok(`ไม่เขียนทับ ${c}`, !set.includes(`${c}=excluded`), set.slice(0, 80));
  ok("แต่ยังทับค่าที่มาจากไฟล์ได้ (engagement)", set.includes("engagement=excluded.engagement"));
  ok("ใช้ id เป็นตัวชนกัน", S.insertRaw("b1", rec()).sql.includes("ON CONFLICT(id)"));
}

console.log("\n[5] ค่า sentiment ดิบ — แปลงได้ก็แปลง แปลงไม่ได้ต้องเป็น null");
{
  ok("Negative → neg", S.zocialSent("Negative") === "neg");
  ok("Positive → pos", S.zocialSent("Positive") === "pos");
  ok("Neutral → neu", S.zocialSent("Neutral") === "neu");
  // 🔴 กฎเหล็ก: ไม่รู้ ห้ามกลืนเป็น "กลาง"
  for (const v of ["", "-", "N/A", "???", null, undefined]) {
    ok(`อ่านไม่ออกคืน null: ${JSON.stringify(v)}`, S.zocialSent(v) === null, String(S.zocialSent(v)));
  }
  const p = S.insertNews(rec({ sentimentRaw: "Negative" })).params;
  ok("ลงการ์ดพร้อมป้ายที่มา zocial", p.includes("neg") && p.includes("zocial"));
  const p2 = S.insertNews(rec({ sentimentRaw: "" })).params;
  ok("ไม่มีค่าดิบ = ไม่ต้องมีที่มา", !p2.includes("zocial"));
}

console.log("\n[6] finish — สรุปตัวเลข แล้วลบของเกินกำหนด");
{
  const db = fakeDb({ first: (sql) => (/FROM setting/.test(sql) ? { value: "180" } : null) });
  const b = await (await post({ ZOCIAL_DB: db }, { op: "finish", campaign: "c", dates: ["2026-09-01", "2026-09-02"] })).json();
  ok("นับคอมเมนต์ใต้โพสต์", db.log.some((l) => /UPDATE daily_news SET comment_count/.test(l.sql)));
  ok("สรุปลง daily_aggregate", db.log.some((l) => /INSERT INTO daily_aggregate/.test(l.sql)));
  ok("อ่านจำนวนวันที่เก็บจากค่าตั้งค่า", b.retentionDays === 180, String(b.retentionDays));
  ok("คิดวันตัดถูก (180 วันก่อน 2 ก.ย.)", b.cutoff === "2026-03-06", String(b.cutoff));

  const del = db.log.filter((l) => /^DELETE/.test(l.sql.trim()));
  ok("ลบ 2 ตาราง", del.length === 2, String(del.length));
  // 🚫 ข้อห้ามใหญ่ที่สุดของตัวลบ
  ok("ไม่แตะ daily_aggregate เด็ดขาด", !db.log.some((l) => /DELETE.*daily_aggregate/.test(l.sql)));
  ok("ลบเฉพาะ expires = 1 (เพจไม่โดน)", del.every((l) => /expires = 1/.test(l.sql)));
  ok("ลบเฉพาะที่เก่ากว่าวันตัด", del.every((l) => /date < \?/.test(l.sql)));
}

console.log("\n[7] เพดานรายวันของ D1 ต้องแยกออกจาก error อื่น");
{
  const db = { prepare: () => { throw new Error("D1_ERROR: too many rows written (daily limit exceeded)"); } };
  const b = await (await post({ ZOCIAL_DB: db }, { op: "begin", campaign: "c" })).json();
  ok("รู้ว่าเป็นเรื่องเพดาน", b.error === "d1-limit", b.error);
  ok("บอกทางออกให้ผู้ใช้", /รอข้ามวัน|อัปเกรด/.test(b.message));
  const db2 = { prepare: () => { throw new Error("something else broke"); } };
  const b2 = await (await post({ ZOCIAL_DB: db2 }, { op: "begin" })).json();
  ok("error อื่นไม่ถูกเหมารวม", b2.error === "d1-error", b2.error);
}

console.log("\n[8] listen — ไม่มีข้อมูล ห้ามคืนลิสต์ว่างเฉยๆ");
{
  const req = (url) => ({ url, headers: { get: () => null } });
  const b0 = await (await onRequestGet({ env: {}, request: req("https://x/issue/api/listen") })).json();
  ok("ไม่มี D1 → hasData:false + บอกสาเหตุ", b0.hasData === false && b0.message.includes("ZOCIAL_DB"));

  const empty = fakeDb({ first: () => null });
  const b1 = await (await onRequestGet({ env: { ZOCIAL_DB: empty }, request: req("https://x/issue/api/listen") })).json();
  ok("ยังไม่มีใคร upload → hasData:false", b1.hasData === false && b1.cards.length === 0);
  ok("และบอกเป็นภาษาคนว่าทำไม", /ยังไม่มีใคร upload/.test(b1.note), b1.note);

  const noTable = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error("no such table: upload_batch"); } }),
    first: async () => { throw new Error("no such table: upload_batch"); } }) };
  const b2 = await (await onRequestGet({ env: { ZOCIAL_DB: noTable }, request: req("https://x/issue/api/listen") })).json();
  ok("ตารางยังไม่ถูกสร้าง = ยังไม่เคย upload ไม่ใช่ระบบพัง", b2.hasData === false && !b2.error, JSON.stringify(b2).slice(0, 80));
}

console.log("\n[9] listen — การ์ดต้องบอกที่มาของป้าย sentiment เสมอ");
{
  const row = { id: "p1", source: "facebook", account: "ก", account_type: "page", snippet: "x", url: "https://a/p",
    posted_at: "2026-09-02T09:00:00+07:00", engagement: 5, comment_count: 7,
    comment_sent_neg: null, comment_sent_neu: null, comment_sent_pos: null,
    post_sent: "neg", post_sent_src: "zocial", sentiment_checked: 0, sentiment_profile: null, rubric_version: null };
  const db = fakeDb({ first: (sql) => (/upload_batch/.test(sql) ? { campaign: "c" } : /MAX\(date\)/.test(sql) ? { d: "2026-09-02" } : { u: "t" }),
    all: () => [row] });
  const b = await (await onRequestGet({ env: { ZOCIAL_DB: db }, request: { url: "https://x/issue/api/listen", headers: { get: () => null } } })).json();
  const c = b.cards[0];
  ok("hasData true เมื่อมีการ์ด", b.hasData === true);
  ok("ติดที่มาว่าเป็นค่าดิบของ Zocial", c.postSentSrc === "zocial");
  ok("บอกว่ายังไม่ผ่านตัวตัดสินของเรา", c.sentimentChecked === false);
  ok("คอมเมนต์ที่ยังไม่ได้ตรวจ = null ไม่ใช่ศูนย์", c.sent === null, JSON.stringify(c.sent));
  ok("บอกว่าจำนวนคอมเมนต์เป็นของ 'ในไฟล์'", c.commentsAreFromFile === true);
  ok("เรียงตาม engagement", /ORDER BY COALESCE\(engagement,0\) DESC/.test(db.log.map((l) => l.sql).join(" ")));
}

console.log("\n[10] เอกสาร schema.sql ต้องตรงกับโค้ดเสมอ");
{
  const sql = fs.readFileSync(new URL("../tools/zocial/schema.sql", import.meta.url), "utf8");
  const missing = S.DDL.filter((d) => !sql.includes(d.trim()));
  ok("ทุกคำสั่งในโค้ดมีอยู่ในไฟล์ .sql", missing.length === 0,
     missing.length ? "ลืมรัน node tools/zocial/gen-schema.mjs" : "");
  ok("ไฟล์ .sql เตือนว่าห้ามแก้ด้วยมือ", sql.includes("ห้ามแก้ด้วยมือ"));
}

console.log("\n[11] ด่านกันแก้กลับ — พิสูจน์ว่าเทสต์จับของพังได้จริง");
{
  ok("ถ้ามีใครใส่ daily_aggregate ลง PURGE_TABLES ด่าน [6] จะตก", !S.PURGE_TABLES.includes("daily_aggregate"));
  ok("ถ้ามีใครถอด expires ออกจาก DELETE ด่าน [6] จะตก", S.purge("2026-01-01").every((s) => s.sql.includes("expires = 1")));
  ok("ถ้ามีใครทำให้ zocialSent คืน 'neu' ตอนอ่านไม่ออก ด่าน [5] จะตก", S.zocialSent("???") !== "neu");
}

console.log(`\n${fail ? "❌" : "✅"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
