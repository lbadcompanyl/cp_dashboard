// GET /api/trend/related?q=<คำ>&geo=TH&time=now%201-d
// ดึง Related queries (Top + Rising) ของคำที่ระบุ จาก Google Trends API (ไม่เป็นทางการ)
// Google จำกัด rate จาก edge IP บ่อย (429) → เก็บผลสำเร็จลง KV ไว้เสิร์ฟแทนตอนโดนจำกัด
// (เก็บหลักชั่วโมงพอ — เกินนั้นข้อมูลเก่าเกินไป)

import { fetchRelated } from "./_lib/trends.js";

const KV_TTL = 6 * 3600; // เก็บ 6 ชม.

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const q = url.searchParams.get("q");
  const geo = (url.searchParams.get("geo") || "TH").toUpperCase().slice(0, 5);
  const time = url.searchParams.get("time") || "now 1-d";

  if (!q) return json({ error: "missing q", top: [], rising: [] }, 400);

  const cache = caches.default;
  const key = new Request(
    url.origin + `/api/trend/related?q=${encodeURIComponent(q)}&geo=${geo}&time=${encodeURIComponent(time)}`,
    { method: "GET" }
  );
  const hit = await cache.match(key);
  if (hit) return browserCopy(hit);

  const kv = context.env && context.env.FLAGS_KV;
  const env = context.env || {};
  const kvKey = (env.APP_ENV ? String(env.APP_ENV) + ":" : "") + `rel:${geo}|${time}|${q}`;

  try {
    const data = await fetchRelated(q, geo, time);
    if ((data.top || []).length || (data.rising || []).length) {
      // สำเร็จและมีข้อมูล → เก็บ KV ไว้เป็น fallback รอบหน้า
      if (kv) context.waitUntil(kv.put(kvKey, JSON.stringify(data), { expirationTtl: KV_TTL }).catch(() => {}));
      const edge = json({ q, geo, time, ...data }, 200, 1800); // cache 30 นาที ที่ edge
      context.waitUntil(cache.put(key, edge.clone()));
      return browserCopy(edge);
    }
    // สำเร็จแต่ว่าง (Google ไม่มี breakdown ให้) → ลองของเก่าใน KV ก่อนยอมว่าง
    const stale = kv ? await kv.get(kvKey) : null;
    if (stale) return browserCopy(json({ q, geo, time, ...JSON.parse(stale), stale: true }, 200));
    return browserCopy(json({ q, geo, time, ...data }, 200));
  } catch (e) {
    // โดน 429/ผิดพลาด → เสิร์ฟของล่าสุดจาก KV (ถ้ามี) + cache สั้นๆ กันยิงถี่
    try {
      const stale = kv ? await kv.get(kvKey) : null;
      if (stale) {
        const edge = json({ q, geo, time, ...JSON.parse(stale), stale: true }, 200, 300);
        context.waitUntil(cache.put(key, edge.clone()));
        return browserCopy(edge);
      }
    } catch {}
    // ไม่ throw — ส่ง error กลับให้ UI แสดง fallback (ไม่ให้พังทั้งจอ)
    return json({ q, geo, time, top: [], rising: [], error: String(e.message || e) }, 200);
  }
}

function json(obj, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
    },
  });
}

function browserCopy(resp) {
  const h = new Headers(resp.headers);
  h.set("cache-control", "no-store");
  return new Response(resp.body, { status: resp.status, headers: h });
}
