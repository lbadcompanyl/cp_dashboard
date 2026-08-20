// ตัวช่วยกลางของแดชบอร์ดโซเชียล — cache + รูปแบบคำตอบ
//
// ⚠️ กฎ KV ของโปรเจกต์: อ่าน/เขียนได้ไม่เกิน 1-2 ครั้งต่อ 1 request
//    (โควตาแผนฟรี 1,000 เขียน/วัน ใช้ร่วมกันทั้งโปรเจกต์ — ดู CLAUDE.md)
//    ตัวนี้จึงอ่าน KV ได้มากสุด 1 ครั้ง และเขียนมากสุด 1 ครั้งต่อ request เสมอ
//
// ⚠️ ต้องบวก DATA_VER ของ endpoint ทุกครั้งที่แก้โครงข้อมูลที่คืนออกไป
//    ไม่งั้นของเก่าใน KV จะถูกเสิร์ฟต่อจนกว่าจะหมดอายุ — "ดูเหมือนโค้ดไม่ทำงาน ทั้งที่ทำงานถูก"

/** สถานะที่หน้าเว็บใช้ตัดสินว่าจะวาดอะไร — อย่าเพิ่มค่าใหม่โดยไม่แก้ฝั่งหน้าเว็บด้วย */
export const ST = {
  OK: "ok",                     // ได้ข้อมูลจริง
  NOT_CONFIGURED: "not-configured", // ยังไม่ได้ใส่ env/token — ยังไม่ได้เชื่อมต่อ
  AUTH_FAILED: "auth-failed",   // มี token แต่ต้นทางไม่รับ (หมดอายุ/ถูกถอนสิทธิ์)
  ERROR: "error",               // ต้นทางล่ม หรือตอบมาไม่เข้าใจ
};

/**
 * คำตอบมาตรฐานของทุก endpoint ในแดชบอร์ดนี้
 *
 * ⚠️ ห้ามคืนคอลัมน์ว่างเงียบๆ เวลา token ตายหรือยังไม่ได้ใส่ค่า —
 *    เอกสาร handoff กำชับไว้ว่าต้องบอกให้เจ้าของรู้ว่าขาดอะไร
 *    ฟิลด์ `need` คือรายชื่อ env ที่ยังขาด ให้หน้าเว็บเอาไปแสดงตรงๆ
 */
export function payload({ status, data = null, need = [], message = "", stale = false, at = 0 }) {
  return {
    ok: status === ST.OK,
    status,
    need,          // ["TIKTOK_CLIENT_KEY", ...] — ชื่อ env ที่ยังไม่ได้ตั้ง
    message,       // ข้อความภาษาคน ให้แสดงบนหน้าเว็บได้เลย
    stale,         // true = เป็นของเก่าใน KV เพราะต้นทางล่ม (ยังดีกว่าไม่มีอะไรเลย)
    at: at || Date.now(),
    data,
  };
}

/** ตอบ JSON พร้อมสั่ง cache ที่ขอบ — ของที่ยังไม่พร้อมห้าม cache นาน จะได้เห็นผลทันทีที่ใส่ token */
export function json(body, { edgeTtl = 0 } = {}) {
  const ttl = body && body.ok ? edgeTtl : Math.min(edgeTtl, 60);
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": ttl > 0 ? `public, max-age=${ttl}` : "no-store",
    },
  });
}

/** แยก env ของ preview กับ production ออกจากกัน ไม่ให้ทับ key กัน */
export function envPrefix(env) {
  return env && env.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH !== "main" ? "dev:" : "";
}

/**
 * ตรวจว่า env ที่ต้องใช้ครบไหม — คืนรายชื่อตัวที่ขาด
 * เรียกก่อนยิงต้นทางเสมอ จะได้ไม่เสียเวลายิงทั้งที่รู้อยู่แล้วว่าไม่มี token
 */
export function missingEnv(env, names) {
  return names.filter((n) => !(env && String(env[n] || "").trim()));
}

/**
 * อ่านของที่ cache ไว้ แล้วสร้างใหม่ถ้าหมดอายุ
 *
 * ลำดับ: edge cache → KV (อ่าน 1 ครั้ง) → ยิงต้นทาง → เขียน KV (1 ครั้ง)
 * ต้นทางล่มแล้วมีของเก่าใน KV → คืนของเก่าพร้อมติดธง stale ไม่ปล่อยให้หน้าจอว่าง
 *
 * @param {object} o.build ฟังก์ชัน async ที่ยิงต้นทางจริง คืน payload()
 */
export async function cached(context, o) {
  const { key, ver, edgeTtl = 900, kvFresh = 15 * 60 * 1000, kvTtl = 7 * 24 * 3600, build } = o;
  const env = context.env || {};
  const url = new URL(context.request.url);
  const force = url.searchParams.has("rebuild");

  // ── ชั้นที่ 1: edge cache ─────────────────────────────────────────────
  // ⚠️ ใส่ ver ลงใน cache key ด้วย ไม่งั้นแก้โครงข้อมูลแล้วผู้ใช้ยังเห็นของเก่า
  const cache = caches.default;
  const ck = new Request(url.origin + `/social/api/${key}?v=${ver}`, { method: "GET" });
  if (!force) {
    const hit = await cache.match(ck);
    if (hit) return hit;
  }

  const kv = env.FLAGS_KV;
  const kvKey = `${envPrefix(env)}social:${key}:${ver}`;

  // ── ชั้นที่ 2: KV (อ่านครั้งเดียวเท่านั้น) ────────────────────────────
  let old = null;
  if (kv) {
    try {
      const raw = await kv.get(kvKey);
      if (raw) old = JSON.parse(raw);
    } catch (e) { old = null; }
  }
  if (!force && old && old.ok && Date.now() - (old.at || 0) < kvFresh) {
    const res = json(old, { edgeTtl });
    context.waitUntil(cache.put(ck, res.clone()));
    return res;
  }

  // ── ชั้นที่ 3: ยิงต้นทางจริง ──────────────────────────────────────────
  let fresh;
  try {
    fresh = await build();
  } catch (e) {
    fresh = payload({ status: ST.ERROR, message: "ดึงข้อมูลไม่สำเร็จ: " + (e && e.message ? e.message : String(e)) });
  }

  // ต้นทางล่มแต่ยังมีของเก่า → เสิร์ฟของเก่า ติดธงบอกว่าเก่า
  if (!fresh.ok && old && old.ok) {
    const staleBody = { ...old, stale: true, message: fresh.message || "ต้นทางไม่ตอบ กำลังแสดงข้อมูลรอบก่อน" };
    return json(staleBody, { edgeTtl: 60 });
  }

  // เขียน KV เฉพาะตอนได้ของจริง (เขียนครั้งเดียว) — ของที่ยังไม่เชื่อมต่อไม่ต้องเปลืองโควตาเก็บ
  if (kv && fresh.ok) {
    context.waitUntil(kv.put(kvKey, JSON.stringify(fresh), { expirationTtl: kvTtl }).catch(() => {}));
  }

  const res = json(fresh, { edgeTtl });
  if (fresh.ok) context.waitUntil(cache.put(ck, res.clone()));
  return res;
}

/** ยิงเน็ตแบบมีเวลาจำกัด — ต้นทางค้างต้องไม่ลากทั้ง request ไปด้วย */
export async function fetchJSON(url, { timeout = 8000, headers = {} } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { accept: "application/json", ...headers } });
    const text = await r.text();
    let body = null;
    try { body = JSON.parse(text); } catch (e) { /* ต้นทางตอบไม่ใช่ JSON */ }
    return { status: r.status, ok: r.ok, body, text };
  } finally {
    clearTimeout(t);
  }
}

/**
 * ช่อง YouTube ที่จะดูสถิติ — อ่านจาก env
 *
 * ⚠️ ชื่อช่องอยู่ใน env ไม่ได้เขียนไว้ในโค้ด — repo เป็น public และเจ้าของ
 *    ขอไม่ให้ชื่อบริษัทอยู่ในของที่เปิดสาธารณะ (14 ส.ค. 2026)
 *    ใส่อย่างใดอย่างหนึ่ง: YT_CHANNEL_ID (ขึ้นต้น UC...) หรือ YT_CHANNEL_HANDLE (@ชื่อช่อง)
 *
 * 🔴 ยกมาไว้ตรงนี้เพราะ endpoint ที่ถาม YouTube Analytics ทุกตัวต้องใช้ (20 ส.ค. 2026)
 *    ก่อนหน้านี้มีอยู่แต่ใน youtube.js ส่วน youtube-top.js ฮาร์ดโค้ด channel==MINE ไว้
 *    ซึ่งเป็นบั๊กเดียวกับที่เคยเจอแล้วแก้ไปแล้วรอบหนึ่ง — ดูคำเตือนที่ resolveChannelId()
 */
export function channelQuery(env) {
  const id = String(env.YT_CHANNEL_ID || "").trim();
  if (/^UC[\w-]{20,}$/.test(id)) return { key: "id", val: id };
  const h = String(env.YT_CHANNEL_HANDLE || "").trim();
  if (h) return { key: "forHandle", val: h.startsWith("@") ? h : "@" + h };
  return null;
}

/**
 * แปลง env ให้เป็น "รหัสช่องจริง" (UC...) ด้วย Data API
 *
 * 🚫 อย่าถาม YouTube Analytics ด้วย channel==MINE เป็นทางหลักเด็ดขาด
 *    ถ้าบัญชี Google ที่กดอนุญาตไม่ได้เป็นเจ้าของช่องนี้ MINE จะไปหยิบ
 *    "ช่องของบัญชีนั้น" ซึ่งมักว่างเปล่า แล้ว **ตอบ 200 พร้อมข้อมูลเปล่า**
 *    ไม่มี error อะไรบอกเลย — เจอจริง 2 รอบ (19 ส.ค. กับ 20 ส.ค. 2026)
 *    ต้องถามด้วย channel==<รหัสช่อง> ก่อนเสมอ แล้วค่อยตกไปที่ MINE
 */
export async function resolveChannelId(env, ch) {
  if (ch.key === "id") return ch.val;
  const u = "https://www.googleapis.com/youtube/v3/channels?part=id&" +
    ch.key + "=" + encodeURIComponent(ch.val) + "&key=" + env.YT_API_KEY;
  const r = await fetchJSON(u);
  return (r.ok && r.body?.items?.[0]?.id) || "";
}
