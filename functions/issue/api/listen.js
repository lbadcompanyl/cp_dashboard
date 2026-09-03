/**
 * GET /issue/api/listen — การ์ด "คนพูดถึงเรา" ให้คอลัมน์บน /issue/ เอาไปแสดง
 * =========================================================================
 * รูปคำตอบตกลงกันไว้แล้วใน ZOCIAL-HANDOFF.md §2 — 🚫 เปลี่ยนรูปต้องบอกห้องแดชบอร์ดข่าวก่อน
 *
 *   ?date=2026-09-02&campaign=<id>&limit=30
 *   → { date, campaign, updatedAt, hasData, cards:[…] }
 *
 * 🔴 ไม่มีข้อมูลของวันนั้น ห้ามคืน cards: [] เฉยๆ — ต้องมี hasData: false ไปด้วย
 *    ไม่งั้นหน้าเว็บแยกไม่ออกระหว่าง "ยังโหลดไม่เสร็จ" กับ "วันนั้นลืม upload" แล้วจะหมุนค้าง
 */
import * as S from "./_lib/store.js";

const MAX_LIMIT = 100;
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const db = env.ZOCIAL_DB;
  if (!db) return json({ ok: false, error: "no-binding", hasData: false, cards: [],
    message: "ยังไม่ได้ผูกฐานข้อมูล D1 (ตัวแปร ZOCIAL_DB)" }, 503);

  const u = new URL(request.url);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(u.searchParams.get("limit")) || 30));
  let campaign = u.searchParams.get("campaign") || "";
  let date = u.searchParams.get("date") || "";

  try {
    if (!campaign) {
      const row = await db.prepare("SELECT campaign FROM upload_batch ORDER BY uploaded_at DESC LIMIT 1").first();
      campaign = (row && row.campaign) || "";
    }
    if (!campaign) return json({ date: null, campaign: null, updatedAt: null, hasData: false, cards: [],
      note: "ยังไม่มีใคร upload ไฟล์เข้ามาเลย" });

    if (!date) {
      const row = await db.prepare("SELECT MAX(date) AS d FROM daily_news WHERE campaign = ?").bind(campaign).first();
      date = (row && row.d) || "";
    }
    if (!date) return json({ date: null, campaign, updatedAt: null, hasData: false, cards: [],
      note: "แคมเปญนี้ยังไม่มีข้อมูลสักวัน" });

    const { results } = await db.prepare(
      `SELECT id, source, account, account_type, snippet, url, posted_at, engagement,
              comment_count, comment_sent_neg, comment_sent_neu, comment_sent_pos,
              post_sent, post_sent_src, sentiment_checked, sentiment_profile, rubric_version
       FROM daily_news WHERE campaign = ? AND date = ?
       ORDER BY COALESCE(engagement,0) DESC, posted_at DESC LIMIT ?`
    ).bind(campaign, date, limit).all();

    const upd = await db.prepare("SELECT MAX(updated_at) AS u FROM daily_aggregate WHERE campaign = ? AND date = ?")
      .bind(campaign, date).first();

    const cards = (results || []).map((r) => ({
      id: r.id,
      source: r.source,
      account: r.account || null,
      accountType: r.account_type,
      snippet: r.snippet,
      url: r.url,
      postedAt: r.posted_at,
      engagement: r.engagement,
      // ⚠️ นับเฉพาะคอมเมนต์ที่อยู่ในไฟล์ที่ upload ไม่ใช่ยอดจริงบนโพสต์
      //    หน้าเว็บต้องเขียนกำกับว่า "ในไฟล์" — เลขนี้ขยับได้ทุกครั้งที่ export ใหม่
      comments: r.comment_count,
      commentsAreFromFile: true,
      // 🔴 ยังไม่มีตัวตัดสินของเรา — ทั้ง 3 ช่องเป็น null ห้ามเติมศูนย์ให้ดูเต็ม
      sent: hasSent(r) ? { neg: r.comment_sent_neg, neu: r.comment_sent_neu, pos: r.comment_sent_pos } : null,
      postSent: r.post_sent,
      // ⚠️ บอกที่มาของป้ายเสมอ — "zocial" คือค่าดิบที่ยังไม่ผ่านเกณฑ์ของเรา
      //    ในไฟล์จริงค่าดิบเป็นลบถึง 60% ถ้าโชว์เฉยๆ ผู้ใช้จะเชื่อว่าเป็นข้อสรุปของเรา
      postSentSrc: r.post_sent_src,
      sentimentChecked: !!r.sentiment_checked,
      sentimentProfile: r.sentiment_profile,
      rubricVersion: r.rubric_version,
    }));

    return json({ date, campaign, updatedAt: (upd && upd.u) || null, hasData: cards.length > 0, cards });
  } catch (e) {
    const msg = String(e && e.message || e);
    // ตารางยังไม่ถูกสร้าง = ยังไม่เคยมีใคร upload — ไม่ใช่ระบบพัง ต้องบอกให้ถูกเรื่อง
    if (/no such table/i.test(msg)) return json({ date: null, campaign: null, updatedAt: null, hasData: false, cards: [],
      note: "ยังไม่มีใคร upload ไฟล์เข้ามาเลย" });
    return json({ ok: false, error: "d1-error", hasData: false, cards: [], message: "อ่านข้อมูลไม่สำเร็จ: " + msg }, 500);
  }
}

const hasSent = (r) => r.comment_sent_neg !== null || r.comment_sent_neu !== null || r.comment_sent_pos !== null;
