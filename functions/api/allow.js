// GET/POST /api/allow — รายชื่อข่าวที่เจ้าของสั่งว่า "อันนี้ไม่ควรโดนตัด"
//
// ตัวกรองอัตโนมัติตัดพลาดได้เสมอ หน้า /admin/ จึงมีปุ่ม ↩ เอากลับ ให้กดคืนข่าวรายใบ
// ลิงก์ที่ถูกกดคืนจะถูกจำไว้ที่นี่ แล้ว feeds.js จะข้ามด่านตัดให้ข่าวใบนั้นตลอดไป
//
// ⚠️ เก็บเป็น blob เดียว ไม่แยก key ต่อข่าว — โควตาเขียน KV ของแผนฟรีมี 1,000 ครั้ง/วัน
//    ใช้ร่วมกันทั้งโปรเจกต์ (ดูกฎเรื่อง KV ใน CLAUDE.md)
//    อ่าน: 1 ครั้งต่อการ build feed · เขียน: เฉพาะตอนเจ้าของกดปุ่ม

export const ALLOW_KEY = "noise:allow";
const MAX = 500; // กันไม่ให้ blob โตไม่มีที่สิ้นสุด — เก่าสุดหลุดออกก่อน

// เทียบลิงก์แบบเดียวกับที่ feeds.js ใช้ dedupe (ตัด query/ท้าย /) ไม่งั้นลิงก์เดิมที่พ่วง
// พารามิเตอร์ต่างกันจะกลายเป็นคนละใบ แล้วกดคืนแล้วไม่มีผล
export function allowKey(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "");
  } catch {
    return String(url || "").trim().toLowerCase();
  }
}

const prefix = (env) => (env && env.APP_ENV ? String(env.APP_ENV) + ":" : "");

export async function readAllow(env) {
  const kv = env && env.FLAGS_KV;
  if (!kv) return {};
  try {
    const raw = await kv.get(prefix(env) + ALLOW_KEY);
    const j = raw ? JSON.parse(raw) : null;
    return (j && j.items) || {};
  } catch {
    return {};
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env && env.FLAGS_KV;
  if (!kv) return json({ error: "ยังไม่ได้ผูก KV" }, 503);

  const items = await readAllow(env);

  if (request.method === "GET") {
    return json({ count: Object.keys(items).length, items });
  }

  if (request.method !== "POST") return json({ error: "ใช้ GET หรือ POST" }, 405);

  let body = {};
  try { body = await request.json(); } catch {}
  const link = String(body.link || "").trim();
  if (!link) return json({ error: "ต้องมี link" }, 400);
  const key = allowKey(link);
  if (!key) return json({ error: "ลิงก์ไม่ถูกต้อง" }, 400);

  if (body.on === false) {
    delete items[key];
  } else {
    items[key] = {
      link,
      title: String(body.title || "").slice(0, 300),
      why: String(body.why || "").slice(0, 60),
      at: new Date().toISOString(),
    };
    // เกินเพดาน → ตัดอันที่เก่าที่สุดทิ้ง
    const keys = Object.keys(items);
    if (keys.length > MAX) {
      keys.sort((a, b) => String(items[a].at).localeCompare(String(items[b].at)));
      for (const k of keys.slice(0, keys.length - MAX)) delete items[k];
    }
  }

  try {
    await kv.put(prefix(env) + ALLOW_KEY, JSON.stringify({ items }));
  } catch (e) {
    return json({ error: "บันทึกไม่สำเร็จ: " + String((e && e.message) || e).slice(0, 80) }, 500);
  }
  return json({ ok: true, on: body.on !== false, count: Object.keys(items).length });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
