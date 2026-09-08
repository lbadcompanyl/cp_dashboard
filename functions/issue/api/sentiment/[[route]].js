/**
 * ทางเข้าของเครื่องมือ sentiment — `/issue/api/sentiment/*`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 🎯 ทำไมต้องย้ายมาอยู่ตรงนี้ (เจ้าของสั่ง 4 ก.ย. 2026)
 *
 *    ของเดิมหน้าเว็บคุยกับ `comment-sentiment.*.workers.dev` ตรงๆ ซึ่งเป็น
 *    **ที่อยู่สาธารณะ** ใครรู้ก็สั่งให้ทำงานได้ แล้ว **เงินออกจากบัญชีเรา**
 *    (เครดิต ScrapeCreators + ค่า Claude) — endpoint ที่เผาเงินเปิดอยู่ 6 ตัว
 *
 *    ใส่กุญแจในหน้าเว็บไม่ได้ เพราะใครกด View source ก็เห็น = ไม่ลับตั้งแต่แรก
 *    (บทเรียนเดียวกับปุ่ม ⚑ กับ `/api/flags` ใน CLAUDE.md)
 *
 *    ✅ ทางแก้: ย้ายมาอยู่ **ใต้ `/issue/`** ซึ่งมี Cloudflare Access ครอบอยู่แล้ว
 *       คนนอกไม่ผ่านหน้าล็อกอินก็มาไม่ถึงโค้ดนี้เลย
 *
 * 🎁 ได้ของแถมที่เจ้าของอยากได้ที่สุด: **เลิกก๊อปวาง `worker.js` เอง**
 *    ไฟล์นี้อยู่ใน `functions/` แล้ว → push แล้ว Cloudflare สร้างให้เอง
 *
 * ⚠️ ผลข้างเคียงที่ต้องรู้: ตอนนี้ `_core.js` อยู่ในก้อนเดียวกับทั้งเว็บ
 *    **ไฟล์นี้พัง = ทั้งเว็บ deploy ไม่ได้** (ไม่ใช่แค่หน้า sentiment)
 *    🚫 ห้าม push ถ้า `node tests/imports.mjs` ไม่ผ่าน — ด่านนั้นครอบไฟล์นี้ให้แล้ว
 *
 * 🔑 ต้องตั้ง env ที่ **หน้า Pages** (ไม่ใช่หน้า Worker) และต้องใส่ทั้ง Production
 *    และ Preview เพราะ Cloudflare แยกคนละชุด:
 *      ANTHROPIC_API_KEY · SCRAPECREATORS_API_KEY · YOUTUBE_API_KEY
 *      (ถ้าจะใช้กองรอตรวจด้วย ต้องผูก KV ชื่อ FEEDBACK_KV + ตั้ง FEEDBACK_KEY)
 */
import core from "./_core.js";

/* ชื่อ path ที่หน้าเว็บเรียก — ตัดส่วนหน้าออกก่อนส่งให้โค้ดเดิม
   เพราะโค้ดเดิมรู้จักแค่ "/analyze" "/classify" ฯลฯ ไม่รู้จัก "/issue/api/sentiment/..." */
const PREFIX = "/issue/api/sentiment";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  /* ตัดคำนำหน้าออก · เรียกเปล่าๆ (`/issue/api/sentiment`) = หน้าบอกเวอร์ชัน "/" */
  const rest = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : url.pathname;
  url.pathname = rest || "/";

  const inner = new Request(url.toString(), request);

  /* 🔓 ธง "มาจากข้างใน" — คำขอที่มาถึงตรงนี้ผ่าน Cloudflare Access มาแล้ว
     จึงไม่ต้องมีกุญแจอีกชั้น
     🚫 **ห้ามรับค่านี้จาก header หรือ query ของผู้เรียกเด็ดขาด** ไม่งั้นใครก็ปลอมได้
        มันถูกตั้งตรงนี้ที่เดียว ในโค้ดฝั่งเซิร์ฟเวอร์ ผู้เรียกยัดเข้ามาไม่ได้ */
  return core.fetch(inner, { ...env, INTERNAL: true }, context);
}
