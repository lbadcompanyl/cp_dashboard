// Cloudflare Pages Function: /api/sd/state  (GET อ่าน · POST เขียนทั้งชุด)
// เก็บ topic (กลุ่ม) + keyword set ของ SD dashboard บน KV → sync ข้ามเครื่อง (ชุดเดียวรวมทั้งองค์กร)
// ใช้ binding FLAGS_KV เดียวกับ IR/PR · APP_ENV prefix แยก dev/prod
// ยังไม่ bind KV → { configured:false } ให้ client ใช้ localStorage/URL ต่อ (หน้าไม่พัง)

const H = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: H });
const kvKey = (env) => (env && env.APP_ENV ? String(env.APP_ENV) + ":" : "") + "sd:state";

// ทำความสะอาด/จำกัดขนาด ก่อนเก็บ (กันข้อมูลบวม/ยิงมั่ว)
function clean(body) {
  if (!body || !Array.isArray(body.g) || body.g.length === 0) return null;
  return {
    g: body.g.slice(0, 20).map((x) => ({
      n: String((x && x.n) || "กลุ่ม").slice(0, 60),
      k: (Array.isArray(x && x.k) ? x.k : []).slice(0, 40).map((s) => String(s).slice(0, 80)),
    })),
    geo: typeof body.geo === "string" ? body.geo.slice(0, 4) : "",
    per: typeof body.per === "string" ? body.per.slice(0, 6) : "5y",
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
    await env.FLAGS_KV.put(kvKey(env), JSON.stringify(s));
    return json({ configured: true, state: s });
  }

  return json({ error: "method not allowed" }, 405);
}
