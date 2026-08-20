import { startLog, finishLog, resetLog } from "../_lib/syslog.js";
// Cloudflare Pages Function: /api/issue/state  (GET อ่าน · POST เขียนทั้งชุด)
// เก็บกลุ่มประเด็น + keyword ของหน้า Trends ใน Issue Dashboard บน KV → ซิงก์ข้ามเครื่อง
// โครงเดียวกับ /api/sd/state ต่างกันแค่ key ("issue:state") จึงไม่ทับค่าของ SD
//
// ⚠️ KV แผนฟรีเขียนได้ 1,000 ครั้ง/วัน และ FLAGS_KV ใช้ร่วมกันทั้งโปรเจกต์
// endpoint นี้เขียน "1 ครั้งต่อ 1 POST" และฝั่งหน้าเว็บหน่วง (debounce) 800ms
// ก่อนยิง — พิมพ์ชื่อกลุ่มรัวๆ 20 ตัวอักษรจึงเป็นการเขียนครั้งเดียว ไม่ใช่ 20 ครั้ง
//
// ยังไม่ bind KV → คืน { configured:false } ให้หน้าเว็บใช้ localStorage/URL ต่อได้ ไม่พัง

const H = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: H });
const kvKey = (env) => (env && env.APP_ENV ? String(env.APP_ENV) + ":" : "") + "issue:state";

// ทำความสะอาด/จำกัดขนาดก่อนเก็บ (กันข้อมูลบวม/ยิงมั่ว)
function clean(body) {
  if (!body || !Array.isArray(body.g) || body.g.length === 0) return null;
  return {
    g: body.g.slice(0, 20).map((x) => ({
      n: String((x && x.n) || "ประเด็น").slice(0, 60),
      k: (Array.isArray(x && x.k) ? x.k : []).slice(0, 40).map((s) => String(s).slice(0, 80)),
    })),
    geo: typeof body.geo === "string" ? body.geo.slice(0, 4) : "",
    per: typeof body.per === "string" ? body.per.slice(0, 6) : "12m",
    act: Number.isFinite(body.act) ? body.act | 0 : 0,
    updatedAt: Date.now(),
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.FLAGS_KV) return json({ configured: false, state: null });

  if (request.method === "GET") {
    let state = null;
    try { const raw = await env.FLAGS_KV.get(kvKey(env)); state = raw ? JSON.parse(raw) : null; } catch {}
    return json({ configured: true, state });
  }

  if (request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch {}
    const s = clean(body);
    if (!s) return json({ error: "bad state" }, 400);
    // ⚠️ บันทึกระบบ **เฉพาะตอนเขียนไม่สำเร็จ** — ตอนสำเร็จเขียน KV ไปแล้ว 1 ครั้ง
    //    ถ้าบันทึก log ด้วยจะกลายเป็น 2 ครั้งต่อการบันทึกค่า 1 ครั้ง
    try {
      await env.FLAGS_KV.put(kvKey(env), JSON.stringify(s));
    } catch (e) {
      const err = String((e && e.message) || e).slice(0, 80);
      resetLog();
      const L = startLog("issue/state");
      context.waitUntil(finishLog(env, L, { err }));
      return json({ error: "บันทึกไม่สำเร็จ: " + err }, 500);
    }
    return json({ configured: true, state: s });
  }

  return json({ error: "method not allowed" }, 405);
}
