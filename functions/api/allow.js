// GET/POST /api/allow — คำตัดสินรายข่าวของเจ้าของ **ใช้ร่วมกันทุกแดชบอร์ด**
//
//   allow  = "อันนี้ไม่ควรโดนตัด"  (ปุ่ม ↩ เอากลับ บนหน้า /admin/)
//   block  = "ตัดข่าวใบนี้ทิ้ง"     (ปุ่ม ⚑ บนการ์ด — กดที่ไหนก็หายทุกแดชบอร์ด)
//
// 🎯 เจ้าของสั่ง (13 ส.ค. 2026): **ตัดที่เดียวต้องหายทุกแดชบอร์ด**
// ของเดิมปุ่ม ⚑ ซ่อนการ์ดเฉพาะแดชบอร์ดที่กด (เก็บใน flags:pr / flags:ir / flags:root
// ซึ่งแยกกันคนละกอง) ข่าวใบเดียวกันจึงยังโผล่ที่อื่นอยู่ — ตอนนี้ย้ายมาเก็บรวมที่นี่
//
// ⚠️ เก็บ allow กับ block ไว้ใน **blob เดียวกัน** (key `noise:allow`) ตั้งใจ
//    จะได้อ่าน KV ครั้งเดียวได้ทั้งสองอย่าง · โควตาเขียนแผนฟรีมี 1,000 ครั้ง/วันใช้ร่วมทั้งโปรเจกต์
//    อ่าน: 1 ครั้งต่อการ build feed · เขียน: เฉพาะตอนเจ้าของกดปุ่ม
//    (blob เก่าที่มีแต่ items ยังอ่านได้ตามปกติ — ไม่ต้องย้ายข้อมูล)

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

async function readBlob(env) {
  const kv = env && env.FLAGS_KV;
  if (!kv) return {};
  try {
    const raw = await kv.get(prefix(env) + ALLOW_KEY);
    return (raw ? JSON.parse(raw) : null) || {};
  } catch {
    return {};
  }
}

/** อ่านทั้งสองรายการด้วย KV ครั้งเดียว — feeds.js ทุกแดชบอร์ดใช้ตัวนี้ */
export async function readDecisions(env) {
  const j = await readBlob(env);
  return { allowed: j.items || {}, blocked: j.blocked || {} };
}

/** ของเดิม เผื่อมีที่ไหนเรียกอยู่ */
export async function readAllow(env) {
  return (await readBlob(env)).items || {};
}

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env && env.FLAGS_KV;
  if (!kv) return json({ error: "ยังไม่ได้ผูก KV" }, 503);

  const blob = await readBlob(env);
  const items = blob.items || {};
  const blocked = blob.blocked || {};

  if (request.method === "GET") {
    return json({ count: Object.keys(items).length, items, blockedCount: Object.keys(blocked).length, blocked });
  }

  if (request.method !== "POST") return json({ error: "ใช้ GET หรือ POST" }, 405);

  let body = {};
  try { body = await request.json(); } catch {}
  const link = String(body.link || "").trim();
  if (!link) return json({ error: "ต้องมี link" }, 400);
  const key = allowKey(link);
  if (!key) return json({ error: "ลิงก์ไม่ถูกต้อง" }, 400);

  // mode: "allow" (ค่าเริ่มต้น เพื่อความเข้ากันได้กับของเดิม) หรือ "block"
  const mode = body.mode === "block" ? "block" : "allow";
  const target = mode === "block" ? blocked : items;
  const other = mode === "block" ? items : blocked;

  if (body.on === false) {
    delete target[key];
  } else {
    target[key] = {
      link,
      title: String(body.title || "").slice(0, 300),
      why: String(body.why || "").slice(0, 60),
      at: new Date().toISOString(),
    };
    // ⚠️ อยู่สองฝั่งพร้อมกันไม่ได้ — สั่งตัดแล้วต้องหลุดจากรายการเอากลับ และกลับกัน
    delete other[key];
    trim(target);
  }

  try {
    await kv.put(prefix(env) + ALLOW_KEY, JSON.stringify({ items, blocked }));
  } catch (e) {
    return json({ error: "บันทึกไม่สำเร็จ: " + String((e && e.message) || e).slice(0, 80) }, 500);
  }
  return json({ ok: true, mode, on: body.on !== false, count: Object.keys(target).length });
}

// เกินเพดาน → ตัดอันที่เก่าที่สุดทิ้ง (กัน blob โตไม่มีที่สิ้นสุด)
function trim(map) {
  const keys = Object.keys(map);
  if (keys.length <= MAX) return;
  keys.sort((a, b) => String(map[a].at).localeCompare(String(map[b].at)));
  for (const k of keys.slice(0, keys.length - MAX)) delete map[k];
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
