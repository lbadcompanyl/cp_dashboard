import { startLog, finishLog, resetLog } from "./_lib/syslog.js";
// Cloudflare Pages Function: /api/flags  (GET อ่าน · POST แก้)
// เก็บ flag/keyword ของแดชบอร์ดบน KV → sync ข้ามเครื่อง/ทุกคน (แยกตาม scope: ir / pr)
// ต้อง bind KV namespace ชื่อ FLAGS_KV ใน Cloudflare Pages → Settings → Functions → KV bindings
// ถ้ายังไม่ bind: คืน { configured:false } เพื่อให้ฝั่ง client ใช้ localStorage ต่อ (หน้าไม่พัง)

const SCOPES = new Set(["ir", "pr", "root"]);
const MAX_RECORDS = 2000; // กันโตไม่จำกัด
const MAX_CATLOG = 40; // ตัวอย่างแก้หมวดล่าสุด (ใช้เป็น few-shot ให้ AI)

const H = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: H });

// prefix ตาม environment (ตั้ง APP_ENV=dev ที่ Preview) → dev/prod แยก flag/keyword ไม่ปนกัน
const kvKey = (env, scope) => (env && env.APP_ENV ? String(env.APP_ENV) + ":" : "") + "flags:" + scope;

async function readState(env, scope) {
  const raw = await env.FLAGS_KV.get(kvKey(env, scope));
  if (!raw) return { records: [], kw: {}, dismissed: [], cats: {}, catlog: [] };
  try {
    const o = JSON.parse(raw);
    return {
      records: Array.isArray(o.records) ? o.records : [],
      kw: o.kw && typeof o.kw === "object" ? o.kw : {},
      dismissed: Array.isArray(o.dismissed) ? o.dismissed : [],
      cats: o.cats && typeof o.cats === "object" ? o.cats : {}, // { link: catKey } — ผู้ใช้แก้หมวดเอง
      catlog: Array.isArray(o.catlog) ? o.catlog : [], // [{ t:title, c:cat }] ตัวอย่างล่าสุด → few-shot
    };
  } catch {
    return { records: [], kw: {}, dismissed: [], cats: {}, catlog: [] };
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
      if (body.link) {
        s.records = s.records.filter((r) => r.link !== body.link);
        s.dismissed = (s.dismissed || []).filter((l) => l !== body.link);
      }
      break;
    case "dismiss": // ลบออกจากรายการ แต่ยังซ่อนข่าว
      if (body.link) {
        s.records = s.records.filter((r) => r.link !== body.link);
        s.dismissed = s.dismissed || [];
        if (!s.dismissed.includes(body.link)) s.dismissed.push(body.link);
        if (s.dismissed.length > 3000) s.dismissed = s.dismissed.slice(-3000);
      }
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
    case "setCat": // ผู้ใช้จัดหมวดข่าวเอง (override) + เก็บ log ไว้สอน AI
      if (body.link) {
        s.cats = s.cats || {};
        if (body.cat) {
          s.cats[body.link] = body.cat;
          s.catlog = s.catlog || [];
          const t = String(body.title || "").slice(0, 160);
          if (t) {
            s.catlog = s.catlog.filter((e) => e.t !== t); // กันซ้ำ
            s.catlog.push({ t, c: body.cat });
            if (s.catlog.length > MAX_CATLOG) s.catlog = s.catlog.slice(-MAX_CATLOG);
          }
        } else {
          delete s.cats[body.link]; // ล้าง = กลับไปอัตโนมัติ
        }
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
    // ⚠️ บันทึกระบบ **เฉพาะตอนเขียนไม่สำเร็จ** — ตรงนี้เขียน KV อยู่แล้ว 1 ครั้ง
    //    ถ้าบันทึกตอนสำเร็จด้วยจะเป็น 2 ครั้งต่อการกดปุ่ม ⚑/🗂 หนึ่งครั้ง = โควตาหมดเร็วเท่าตัว
    //    และปุ่มพวกนี้อยู่บนแดชบอร์ดสาธารณะ ใครก็กดได้ ยิ่งต้องระวัง
    try {
      await env.FLAGS_KV.put(kvKey(env, scope), JSON.stringify(s));
    } catch (e) {
      const err = String((e && e.message) || e).slice(0, 80);
      resetLog();
      const L = startLog("api/flags");
      L.note = "scope " + scope + " · op " + String(body.op || "?").slice(0, 20);
      context.waitUntil(finishLog(env, L, { err }));
      return json({ error: "บันทึกไม่สำเร็จ: " + err }, 500);
    }
    return json({ configured: true, ...s });
  }

  return json({ error: "method not allowed" }, 405);
}
