/**
 * POST /issue/api/upload — บันทึกไฟล์ export ของ Zocial ลง D1
 * ==========================================================
 * 🔐 อยู่ใต้ /issue/ จึงได้ Cloudflare Access ครอบให้เอง (กฎเดียวกับที่ handoff วางไว้)
 *    🚫 ห้ามย้ายไป /api/... — ตรงนั้นเปิดสาธารณะเพราะแดชบอร์ดอื่นเรียกอยู่
 *
 * ส่งมาเป็น 3 จังหวะ เพราะไฟล์จริงมีหมื่นกว่าแถว ยัดมาก้อนเดียวจะ timeout
 *    begin  → ได้ batchId (สร้างตารางให้เองถ้ายังไม่มี)
 *    rows   → ส่งทีละ ≤ MAX_ROWS แถว (ซ้ำได้ ไม่เกิดแถวซ้ำ)
 *    finish → นับคอมเมนต์ · สรุปตัวเลขรายวัน · ลบของที่เกินกำหนด
 *
 * 🚫 ไม่แตะ KV เลยสักครั้ง — โควตา 1,000 เขียน/วันเป็นของทั้งโปรเจกต์
 */
import * as S from "./_lib/store.js";

const MAX_ROWS = 500;
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function onRequestPost({ request, env }) {
  const db = env.ZOCIAL_DB;
  // 🔴 ไม่มี binding ต้องบอกตรงๆ ว่าต้องไปตั้งอะไร ห้ามพังเป็นหน้า error เปล่าๆ
  if (!db) return json({ ok: false, error: "no-binding",
    message: "ยังไม่ได้ผูกฐานข้อมูล D1 เข้ากับโปรเจกต์ — ตั้งที่ Settings → Bindings ชื่อตัวแปร ZOCIAL_DB (ทั้ง Production และ Preview) แล้ว Retry deployment" }, 503);

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "bad-json", message: "อ่านข้อมูลที่ส่งมาไม่ได้" }, 400); }

  try {
    if (body.op === "begin") return await begin(db, body, request);
    if (body.op === "rows") return await rows(db, body);
    if (body.op === "finish") return await finish(db, body);
    return json({ ok: false, error: "bad-op", message: "ไม่รู้จักคำสั่งนี้" }, 400);
  } catch (e) {
    const msg = String(e && e.message || e);
    // เพดานรายวันของแผนฟรีถูกบังคับใช้จริงตั้งแต่ 1 ก.ย. 2026 — ต้องแยกให้ออกจาก error อื่น
    const limit = /limit|exceeded|quota|too many/i.test(msg);
    return json({ ok: false, error: limit ? "d1-limit" : "d1-error",
      message: limit
        ? "ฐานข้อมูลชนเพดานการใช้งานรายวันของแผนฟรี — รอข้ามวัน (รีเซ็ต 07:00 น. เวลาไทย) หรืออัปเกรดแผน"
        : "บันทึกไม่สำเร็จ: " + msg }, 500);
  }
}

async function begin(db, b, request) {
  for (const sql of S.DDL) await db.prepare(sql).run();   // CREATE ... IF NOT EXISTS ทั้งชุด

  const id = crypto.randomUUID();
  const who = request.headers.get("cf-access-authenticated-user-email") || null;
  await S.bind(db, {
    sql: `INSERT INTO upload_batch (id,campaign,tz_mode,rows_total,rows_kept,rows_dropped,date_from,date_to,uploaded_at,uploaded_by)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    params: [id, String(b.campaign || ""), String(b.tz || "th"),
      n(b.total), n(b.kept), n(b.dropped), b.dateFrom || null, b.dateTo || null,
      new Date().toISOString(), who],
  }).run();
  return json({ ok: true, batchId: id, maxRows: MAX_ROWS });
}

async function rows(db, b) {
  const list = Array.isArray(b.rows) ? b.rows : [];
  if (!b.batchId) return json({ ok: false, error: "no-batch", message: "ไม่ได้บอกว่าเป็นไฟล์ไหน" }, 400);
  if (list.length > MAX_ROWS) return json({ ok: false, error: "too-many",
    message: `ส่งมาทีละไม่เกิน ${MAX_ROWS} แถว` }, 413);

  const stmts = [];
  for (const r of list) {
    if (!r || !r.id || !r.date) continue;             // ข้อมูลไม่ครบ ข้ามไป ไม่เดาให้
    stmts.push(S.insertRaw(b.batchId, r));
    if (r.kind === "post") stmts.push(S.insertNews(r)); // คอมเมนต์ไม่ขึ้นการ์ด แต่ยังเก็บใน raw
  }
  const wrote = await S.runAll(db, stmts);
  return json({ ok: true, received: list.length, statements: wrote });
}

async function finish(db, b) {
  const campaign = String(b.campaign || "");
  const dates = [...new Set((b.dates || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
  if (!campaign || !dates.length) return json({ ok: false, error: "no-dates", message: "ไม่รู้ว่าต้องสรุปวันไหน" }, 400);

  const now = new Date().toISOString();
  await S.bind(db, S.refreshCommentCounts(campaign, dates)).run();
  await S.bind(db, S.rebuildAggregate(campaign, dates, now)).run();

  // ลบของที่เกินกำหนด — ทำตอนนี้เพราะ Pages ตั้ง cron ไม่ได้
  const days = await settingNum(db, "retention_days", S.RETENTION_DEFAULT_DAYS);
  const cutoff = S.cutoffDate(dates.sort().at(-1), days);
  let removed = 0;
  for (const st of S.purge(cutoff)) {
    const r = await S.bind(db, st).run();
    removed += (r && r.meta && r.meta.changes) || 0;
  }
  return json({ ok: true, dates: dates.length, retentionDays: days, cutoff, removed });
}

async function settingNum(db, key, dflt) {
  const row = await db.prepare("SELECT value FROM setting WHERE key = ?").bind(key).first();
  const v = row && Number(row.value);
  return Number.isFinite(v) && v > 0 ? v : dflt;
}

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
