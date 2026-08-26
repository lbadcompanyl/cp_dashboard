import { startLog, finishLog, resetLog } from "../_lib/syslog.js";
// ถามคลังข่าวเป็นประโยค — /api/archives/ask
//
// เจ้าของสั่ง 26 ส.ค. 2026: "อยากให้ search เป็นแบบ chat ai
//   เช่น หาข่าวด้านดีของปลาหมอคางดำทั้งหมด"
//
// คำถามแบบนั้นมี 2 ส่วนที่ต้องทำคนละแบบ:
//   "ปลาหมอคางดำ"  → เป็นคำที่อยู่ในพาดหัวตรงๆ  → ค้นด้วยตัวอักษรได้เลย (เร็ว ฟรี ตรวจสอบได้)
//   "ด้านดี"        → ไม่ได้อยู่ในพาดหัว ต้องอ่านแล้วตีความ → ต้องให้ AI อ่านทีละใบ
//
// 🎯 **หน้าที่ของไฟล์นี้คือส่วนที่เป็น AI เท่านั้น — ไม่แตะข้อมูลข่าวเลย**
//    การค้นยังทำในเบราว์เซอร์เหมือนเดิม (ข้อมูลโหลดอยู่ในเครื่องผู้ใช้อยู่แล้ว)
//    ส่งข้อมูลขึ้นมาทั้งก้อนเพื่อค้นบนเซิร์ฟเวอร์ = ช้าลงและเปลืองโดยไม่ได้อะไร
//
//   GET  ?q=<คำถาม>              → ตีความคำถาม: { terms, from, to, judge }
//   POST { judge, titles: [...] } → คัดว่าใบไหนเข้าเงื่อนไข: { keep: [index, …] }
//
// 💧 **งบ KV: ไม่เขียนเลย** — ผู้ใช้พิมพ์อะไรก็ได้ จำนวน key จึงไม่มีขอบเขต
//    (กฎเดียวกับ trend/kwcheck) ใช้ edge cache อย่างเดียว
//    บันทึกระบบเขียนเฉพาะตอน "ผิดปกติจริง" และมีตัวกันเขียนซ้ำของ syslog คุมอีกชั้น
//
// 🚫 **POST ตรงนี้ไม่ได้เขียนอะไรลง KV** จึงไม่ชนกฎ "ห้ามเปิดให้ POST เข้ามาเขียน log"
//    แต่ยังเปลือง **โควตา AI** ได้ถ้าโดนยิงรัวๆ → จำกัดขนาดคำขอ + cache ตามเนื้อคำขอ

const AI_MODEL = "@cf/meta/llama-3.2-3b-instruct"; // ตัวเดียวกับที่จัดหมวดข่าวใช้อยู่
const CACHE_VER = "1";
const EDGE_TTL = 24 * 3600; // คำถามเดิมได้คำตอบเดิม — ข้อมูลไม่ได้เปลี่ยนรายชั่วโมง

const MAX_Q = 200; // ความยาวคำถาม
const MAX_TITLES = 200; // พาดหัวต่อ 1 คำขอ — กันไม่ให้ยิงทั้งคลังมาให้ AI อ่าน
const MAX_TITLE_LEN = 200;
const MAX_BODY = 64 * 1024;
const BATCH = 20; // อ่านทีละ 20 ใบ — โมเดลเล็ก ถ้ายัดทีเดียวจะตอบไม่ครบ

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === "GET") return handlePlan(url, env || {});
  if (request.method === "POST") return handleJudge(request, url, env || {});
  return json({ error: "รองรับแค่ GET กับ POST" }, 405, 0);
}

/* ─────────── GET — ตีความคำถามเป็นคำค้น + เงื่อนไข ─────────── */

async function handlePlan(url, env) {
  const q = (url.searchParams.get("q") || "").trim().slice(0, MAX_Q);
  if (!q) return json({ error: "ยังไม่ได้ถามอะไรมา" }, 400, 0);

  const cache = caches.default;
  const key = new Request(`${url.origin}/api/archives/ask?q=${encodeURIComponent(q)}&_v=${CACHE_VER}`, { method: "GET" });
  const hit = await cache.match(key);
  // ⚠️ cache hit ต้องออกก่อนถึงบรรทัด startLog เสมอ (กฎของ syslog.js)
  if (hit) return browserCopy(hit);

  resetLog();
  const L = startLog("archives/ask");

  let plan = null;
  let err = "";
  let why = env && env.AI ? "" : "ยังไม่ได้ต่อ AI";
  try {
    const r = await askPlan(env, q);
    plan = r.plan;
    why = why || r.why;
  } catch (e) {
    err = String((e && e.message) || e);
    why = err.slice(0, 80);
  }

  // ⚠️ **ต้องมีทางถอยเสมอ** — AI ล่ม/ไม่มี binding ห้ามทำให้ช่องค้นหาใช้ไม่ได้
  //    ตกลงมาที่ "เอาคำถามไปค้นตรงๆ" ซึ่งคือพฤติกรรมเดิมของหน้าเว็บเป๊ะ
  if (!plan) {
    // ⚠️ **บอกด้วยว่าไม่ตอบเพราะอะไร** — ของเดิมบอกแค่ "ไม่ตอบ" แล้วไล่ต่อไม่ได้เลย
    //    (เจ้าของเจอจริงบน preview: ขึ้นว่าไม่ตอบ แต่ไม่มีทางรู้ว่าไม่มี binding หรือตอบมาแล้วแกะไม่ได้)
    L.warn(why || "ตัวช่วยตีความคำถามไม่ตอบ");
    await finishLog(env, L, { err });
    return json({ ...fallbackPlan(q), ai: false, why: why || "ไม่ตอบ" }, 200, 0);
  }

  const res = json({ ...plan, ai: true }, 200, EDGE_TTL);
  await cache.put(key, res.clone());
  return res;
}

// ให้ AI แยกว่าอะไร "ค้นด้วยตัวอักษรได้" กับอะไร "ต้องอ่านแล้วตีความ"
async function askPlan(env, q) {
  if (!env || !env.AI) return { plan: null, why: "ยังไม่ได้ต่อ AI" };
  const prompt =
    "คุณคือตัวช่วยค้นข่าวภาษาไทย แปลงคำถามเป็น JSON เท่านั้น ห้ามอธิบาย\n" +
    'รูปแบบ: {"terms":["คำ"],"from":"","to":"","judge":""}\n' +
    "- terms = คำที่ต้องปรากฏในพาดหัวข่าวจริงๆ (ชื่อสิ่งของ/สถานที่/บริษัท) ใส่ได้หลายคำ ทุกคำต้องเจอพร้อมกัน\n" +
    "- from/to = วันที่แบบ YYYY-MM-DD ถ้าคำถามไม่ได้ระบุช่วงเวลาให้เป็นค่าว่าง\n" +
    '- judge = เงื่อนไขที่ต้องอ่านพาดหัวแล้วตีความ เช่น "เป็นข่าวเชิงบวก" ถ้าไม่มีให้เป็นค่าว่าง\n' +
    "ห้ามใส่คำบอกทัศนคติ (ดี ร้าย บวก ลบ) ลงใน terms เด็ดขาด — พวกนั้นไปอยู่ใน judge\n" +
    'ตัวอย่าง: "หาข่าวด้านดีของปลาหมอคางดำทั้งหมด"\n' +
    '{"terms":["ปลาหมอคางดำ"],"from":"","to":"","judge":"เป็นข่าวเชิงบวก"}\n\n' +
    "คำถาม: " + q;

  const out = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 200 });
  const raw = (out && (out.response || out.result || "")) || "";
  const obj = parseJSON(raw);
  if (!obj) return { plan: null, why: raw ? "ตอบมาแต่แกะไม่ได้" : "ตอบมาว่างเปล่า" };

  const terms = clean(obj.terms).slice(0, 6);
  // ⚠️ AI ตอบมาไม่มีคำค้นเลย = ตีความไม่ออก ห้ามคืนผลว่าง (จะกลายเป็น "ค้นทั้งคลัง")
  if (!terms.length) return { plan: null, why: "แยกคำค้นออกมาไม่ได้" };

  return {
    plan: {
      terms,
      from: isDate(obj.from) ? obj.from : "",
      to: isDate(obj.to) ? obj.to : "",
      judge: String(obj.judge || "").trim().slice(0, 120),
    },
    why: "",
  };
}

// AI ใช้ไม่ได้ → ทำตัวเหมือนช่องค้นหาเดิมทุกประการ (แยกคำตามช่องว่าง)
function fallbackPlan(q) {
  return { terms: q.split(/\s+/).filter(Boolean).slice(0, 6), from: "", to: "", judge: "" };
}

/* ─────────── POST — อ่านพาดหัวแล้วคัดตามเงื่อนไข ─────────── */

async function handleJudge(request, url, env) {
  let body = null;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: "คำขอใหญ่เกินไป" }, 413, 0);
    body = JSON.parse(raw);
  } catch (e) {
    return json({ error: "อ่านคำขอไม่ได้" }, 400, 0);
  }

  const judge = String((body && body.judge) || "").trim().slice(0, 120);
  const titles = clean(body && body.titles).slice(0, MAX_TITLES).map((t) => t.slice(0, MAX_TITLE_LEN));
  // ไม่มีเงื่อนไข = ไม่ต้องคัด เก็บทุกใบ (ไม่เรียก AI เลย)
  if (!judge || !titles.length) return json({ keep: titles.map((_, i) => i), ai: false }, 200, 0);

  // cache ตาม "เนื้อคำขอ" — ถามซ้ำด้วยชุดเดิมจะไม่เรียก AI อีก
  const cache = caches.default;
  const sig = await hash(JSON.stringify({ judge, titles }));
  const key = new Request(`${url.origin}/api/archives/ask?j=${sig}&_v=${CACHE_VER}`, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return browserCopy(hit);

  resetLog();
  const L = startLog("archives/ask");

  if (!env.AI) {
    // ⚠️ ไม่มี AI = **เก็บทุกใบ ไม่ใช่ตัดทุกใบ** — ตัดทิ้งเงียบๆ คือของหายโดยไม่มีใครรู้
    L.warn("ยังไม่ได้ต่อ AI จึงไม่ได้คัดตามเงื่อนไข");
    await finishLog(env, L);
    return json({ keep: titles.map((_, i) => i), ai: false, why: "ยังไม่ได้ต่อ AI จึงไม่ได้คัดให้" }, 200, 0);
  }

  const keep = [];
  let failed = 0;
  for (let i = 0; i < titles.length; i += BATCH) {
    const chunk = titles.slice(i, i + BATCH);
    let picked = null;
    try {
      picked = await askJudge(env, judge, chunk);
    } catch (e) {
      failed++;
    }
    // ⚠️ ก้อนไหนถามไม่สำเร็จ ให้ **เก็บทั้งก้อน** ไม่ใช่ทิ้ง (เหตุผลเดียวกับข้างบน)
    if (!picked) { chunk.forEach((_, k) => keep.push(i + k)); continue; }
    picked.forEach((k) => { if (k >= 0 && k < chunk.length) keep.push(i + k); });
  }

  if (failed) { L.warn(`ถาม AI ไม่สำเร็จ ${failed} ก้อน — ก้อนพวกนั้นเก็บไว้ทั้งหมด`); await finishLog(env, L); }

  const res = json({ keep: [...new Set(keep)].sort((a, b) => a - b), ai: true, partial: failed > 0 }, 200, EDGE_TTL);
  await cache.put(key, res.clone());
  return res;
}

async function askJudge(env, judge, titles) {
  const list = titles.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const prompt =
    "อ่านพาดหัวข่าวภาษาไทยข้างล่าง แล้วบอกว่าใบไหนเข้าเงื่อนไขนี้: " + judge + "\n" +
    'ตอบเป็น JSON เท่านั้น: {"yes":[หมายเลขที่เข้าเงื่อนไข]} ห้ามอธิบาย\n' +
    "ถ้าไม่มีใบไหนเข้าเลยให้ตอบ {\"yes\":[]}\n\n" + list;

  const out = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 120 });
  const obj = parseJSON(out && (out.response || out.result || ""));
  if (!obj || !Array.isArray(obj.yes)) return null;
  return obj.yes.map((n) => Number(n) - 1).filter((n) => Number.isInteger(n));
}

/* ─────────── ตัวช่วย ─────────── */

// โมเดลเล็กชอบพ่วงข้อความก่อน/หลัง JSON — เฉือนเอาเฉพาะก้อนวงเล็บปีกกา
function parseJSON(text) {
  const s = String(text || "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
}

const clean = (arr) =>
  (Array.isArray(arr) ? arr : []).map((s) => String(s == null ? "" : s).trim()).filter(Boolean);

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

async function hash(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(obj, status = 200, ttl = 0) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": ttl ? `public, max-age=${ttl}` : "no-store",
    },
  });
}

function browserCopy(res) {
  const r = new Response(res.body, res);
  r.headers.set("x-cache", "hit");
  return r;
}
