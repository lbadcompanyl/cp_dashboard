// Cloudflare Pages Function: /api/flags  (GET อ่าน · POST แก้)
// เก็บ flag/keyword ของแดชบอร์ดบน KV → sync ข้ามเครื่อง/ทุกคน (แยกตาม scope: ir / pr)
// ต้อง bind KV namespace ชื่อ FLAGS_KV ใน Cloudflare Pages → Settings → Functions → KV bindings
// ถ้ายังไม่ bind: คืน { configured:false } เพื่อให้ฝั่ง client ใช้ localStorage ต่อ (หน้าไม่พัง)

const SCOPES = new Set(["ir", "pr", "root"]);
const MAX_RECORDS = 2000; // กันโตไม่จำกัด

const H = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: H });

const kvKey = (scope) => "flags:" + scope;

async function readState(env, scope) {
  const raw = await env.FLAGS_KV.get(kvKey(scope));
  if (!raw) return { records: [], kw: {} };
  try {
    const o = JSON.parse(raw);
    return {
      records: Array.isArray(o.records) ? o.records : [],
      kw: o.kw && typeof o.kw === "object" ? o.kw : {},
    };
  } catch {
    return { records: [], kw: {} };
  }
}

function applyOp(s, body) {
  switch (body && body.op) {
    case "flag":
      if (body.rec && body.rec.link && !s.records.some((r) => r.link === body.rec.link)) {
        s.records.push(body.rec);
      }
      break;
    case "unflag":
      if (body.link) s.records = s.records.filter((r) => r.link !== body.link);
      break;
    case "clearSource":
      if (body.source) s.records = s.records.filter((r) => r.source !== body.source);
      break;
    case "setKw":
      if (body.source) {
        s.kw = s.kw || {};
        s.kw[body.source] = Array.isArray(body.terms) ? body.terms.slice(0, 200) : [];
      }
      break;
  }
  if (s.records.length > MAX_RECORDS) s.records = s.records.slice(-MAX_RECORDS);
  return s;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const scope = (url.searchParams.get("scope") || "root").toLowerCase();

  if (!SCOPES.has(scope)) return json({ error: "bad scope" }, 400);
  // ยังไม่ได้ bind KV → บอก client ให้ fallback เป็น localStorage
  if (!env.FLAGS_KV) return json({ configured: false, records: [], kw: {} });

  if (request.method === "GET") {
    const s = await readState(env, scope);
    return json({ configured: true, ...s });
  }

  if (request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch {}
    const s = applyOp(await readState(env, scope), body);
    await env.FLAGS_KV.put(kvKey(scope), JSON.stringify(s));
    return json({ configured: true, ...s });
  }

  return json({ error: "method not allowed" }, 405);
}
