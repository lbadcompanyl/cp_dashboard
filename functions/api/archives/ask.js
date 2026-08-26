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
  // ⚠️ **คำสั่งเป็นภาษาอังกฤษ แต่เนื้อหาเป็นไทย** — วัดจากของจริงแล้วโมเดลเล็กทำตามรูปแบบ
  //    ได้ดีกว่ามากเมื่อคำสั่งเป็นอังกฤษ (รอบแรกสั่งเป็นไทยล้วน แล้วได้ "ตอบมาแต่แกะไม่ได้")
  const prompt =
    "Convert the Thai search question into JSON. Output JSON only, no explanation.\n" +
    'Format: {"terms":["…"],"from":"","to":"","judge":""}\n' +
    "terms = words that literally appear in a Thai news headline (things, places, companies). Keep Thai text as-is.\n" +
    "  Do NOT include question words such as หาข่าว, ข่าว, ของ, เกี่ยวกับ, ทั้งหมด, ล่าสุด.\n" +
    "  Do NOT include opinion words (ดี, ร้าย, บวก, ลบ) — those go in judge.\n" +
    "from/to = YYYY-MM-DD, empty string if the question has no date range.\n" +
    'judge = a condition that requires reading the headline, e.g. "เป็นข่าวเชิงบวก". Empty string if none.\n\n' +
    'Q: หาข่าวด้านดีของปลาหมอคางดำทั้งหมด\n{"terms":["ปลาหมอคางดำ"],"from":"","to":"","judge":"เป็นข่าวเชิงบวก"}\n' +
    'Q: หาข่าว dna ของ ปลาหมอคางดำ\n{"terms":["ปลาหมอคางดำ","dna"],"from":"","to":"","judge":""}\n' +
    'Q: ข่าว PM 2.5 เชียงใหม่\n{"terms":["PM 2.5","เชียงใหม่"],"from":"","to":"","judge":""}\n\n' +
    "Q: " + q;

  const r = await runAI(env, prompt, 200, PLAN_MODELS);
  if (!r.obj) return { plan: null, why: r.why };

  const terms = clean(r.obj.terms).slice(0, 6);
  // ⚠️ AI ตอบมาไม่มีคำค้นเลย = ตีความไม่ออก ห้ามคืนผลว่าง (จะกลายเป็น "ค้นทั้งคลัง")
  if (!terms.length) return { plan: null, why: "แยกคำค้นออกมาไม่ได้" };

  return {
    plan: {
      terms,
      from: isDate(r.obj.from) ? r.obj.from : "",
      to: isDate(r.obj.to) ? r.obj.to : "",
      judge: String(r.obj.judge || "").trim().slice(0, 120),
    },
    why: "",
  };
}

/* ⚠️ **ไล่โมเดลจากใหญ่ไปเล็ก** — รอบแรกใช้ตัวเล็กตัวเดียว (llama-3.2-3b) แล้วเจ้าของเจอจริง
   บน production ว่า "ตอบมาแต่แกะไม่ได้" ตัวเล็กทำตามรูปแบบ JSON ภาษาไทยไม่ไหว
   · ชื่อโมเดลที่ Cloudflare ไม่รู้จักจะโยน error → ตกไปตัวถัดไปเอง (ไม่ต้องมาไล่แก้ทีละครั้ง)
   · คำตอบถูก cache 24 ชม.ต่อคำถาม ตัวใหญ่จึงถูกเรียกไม่บ่อย */
const PLAN_MODELS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/meta/llama-3.2-3b-instruct",
];
// การคัดพาดหัวยิงเยอะกว่ามาก (200 ใบ = 10 ครั้ง) จึงเริ่มที่ตัวกลาง ไม่ใช่ตัวใหญ่สุด
const JUDGE_MODELS = ["@cf/meta/llama-3.1-8b-instruct", "@cf/meta/llama-3.2-3b-instruct"];

/** เรียก AI ไล่ทีละโมเดลจนกว่าจะได้ JSON ที่แกะได้ · คืนเหตุผลกลับไปด้วยเสมอ */
async function runAI(env, prompt, maxTokens, models) {
  let why = "ไม่มีโมเดลที่ใช้ได้";
  for (const model of models) {
    let raw = "";
    try {
      const out = await env.AI.run(model, { messages: [{ role: "user", content: prompt }], max_tokens: maxTokens });
      raw = (out && (out.response || out.result || "")) || "";
    } catch (e) {
      why = `${short(model)}: ${String((e && e.message) || e).slice(0, 50)}`;
      continue;                       // โมเดลนี้ใช้ไม่ได้ ลองตัวถัดไป
    }
    const obj = parseJSON(raw);
    if (obj) return { obj, raw, model, why: "" };
    // ⚠️ บอกด้วยว่ามันตอบว่าอะไร — ไม่งั้นไล่ปัญหาต่อไม่ได้เลย (บทเรียนจากรอบที่แล้ว)
    why = raw ? `${short(model)} ตอบมาแต่แกะไม่ได้: ${raw.replace(/\s+/g, " ").slice(0, 60)}` : `${short(model)} ตอบมาว่างเปล่า`;
  }
  return { obj: null, raw: "", model: "", why };
}

const short = (m) => String(m).split("/").pop().replace("-instruct", "").replace("-fp8-fast", "");

/* AI ใช้ไม่ได้ → ค้นด้วยคำที่พิมพ์มา
   ⚠️ **ต้องตัดคำถามทิ้งก่อน** — เจ้าของเจอจริง: ถาม "หาข่าว dna ของ ปลาหมอคางดำ"
      แล้วได้ 0 ข่าว เพราะเอาทั้งประโยครวม "หาข่าว" กับ "ของ" ไปหาในพาดหัว
      (หน้านี้ใช้กฎ "ต้องมีครบทุกคำ" ซึ่งไม่มีพาดหัวไหนมีคำพวกนี้อยู่จริง) */
const STOP_WORDS = new Set([
  "หาข่าว", "หา", "ข่าว", "ของ", "เกี่ยวกับ", "ทั้งหมด", "ล่าสุด", "เรื่อง", "ที่", "ใน",
  "จาก", "และ", "กับ", "ช่วง", "แบบ", "ขอ", "ดู", "อยาก", "ช่วย", "หน่อย", "ครับ", "ค่ะ",
  "news", "about", "all", "the", "of", "find", "search",
]);
// export ไว้ให้เทสต์เรียกตรงๆ — ตรรกะตัดคำถามทิ้งพลาดแล้วผู้ใช้เจอ '0 ข่าว' ทันที
export function fallbackPlan(q) {
  const words = q.split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
  // ⚠️ ตัดจนไม่เหลืออะไรเลย = ใช้ของเดิมทั้งประโยค ดีกว่าค้นด้วยคำว่าง (จะได้ทั้งคลัง)
  return { terms: (kept.length ? kept : words).slice(0, 6), from: "", to: "", judge: "" };
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
  // คำสั่งเป็นอังกฤษ เนื้อหาเป็นไทย — เหตุผลเดียวกับ askPlan
  const prompt =
    "Read the Thai news headlines below. Which ones match this condition: " + judge + "\n" +
    'Answer with JSON only, no explanation: {"yes":[numbers]}\n' +
    'If none match, answer {"yes":[]}\n\n' + list;

  const r = await runAI(env, prompt, 120, JUDGE_MODELS);
  if (!r.obj || !Array.isArray(r.obj.yes)) return null;
  return r.obj.yes.map((n) => Number(n) - 1).filter((n) => Number.isInteger(n));
}

/* ─────────── ตัวช่วย ─────────── */

// โมเดลเล็กชอบพ่วงข้อความก่อน/หลัง JSON และชอบครอบด้วย ```json — เฉือนให้เหลือแต่ก้อนจริง
export function parseJSON(text) {
  let s = String(text || "").replace(/```[a-z]*\s*/gi, "").replace(/```/g, "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch (e) { /* ลองซ่อมข้างล่าง */ }
  // ⚠️ เจอบ่อย: มีจุลภาคเกินก่อนวงเล็บปิด — ซ่อมให้ ดีกว่าทิ้งคำตอบทั้งก้อน
  try { return JSON.parse(s.replace(/,\s*([}\]])/g, "$1")); } catch (e) { return null; }
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
