// GET /api/trend/related?q=<คำ>&geo=TH&time=now%201-d
// ดึง Related queries (Top + Rising) ของคำที่ระบุ จาก Google Trends API (ไม่เป็นทางการ)

import { fetchRelated } from "./_lib/trends.js";

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

  try {
    const data = await fetchRelated(q, geo, time);
    const edge = json({ q, geo, time, ...data }, 200, 1800); // cache 30 นาที ที่ edge
    context.waitUntil(cache.put(key, edge.clone()));
    return browserCopy(edge);
  } catch (e) {
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
