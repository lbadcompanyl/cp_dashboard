// GET /api/trend/trending?geo=TH&hours=24
// เทรนด์แบบ "Trending Now" (search volume + % + เวลาเริ่ม) เลือกช่วง 4/24/48/168 ชม.
// ถ้า API ใหม่พัง -> fallback กลับไป RSS คำฮิตรายวัน

import { parseTrends } from "./_lib/parser.js";
import { fetchTrendingNow } from "./_lib/trends.js";
import { startLog, finishLog, resetLog } from "../_lib/syslog.js";

const VALID_HOURS = [4, 24, 48, 168];
// หมวดหมู่แบบ Google Trends "Trending now" (0 = ทุกหมวด) — ต้องตรงกับ dropdown ใน trend/index.html
// 0 = ทุกหมวด · 1-19 = หมวดของ Google เรียงตามตัวอักษรอังกฤษ (ดูตาราง TREND_CATS ใน trend/app.js)
const VALID_CATS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const geo = (url.searchParams.get("geo") || "TH").toUpperCase().slice(0, 5);
  const hoursRaw = Number(url.searchParams.get("hours"));
  const hours = VALID_HOURS.includes(hoursRaw) ? hoursRaw : 24;
  const catRaw = Number(url.searchParams.get("cat"));
  const cat = VALID_CATS.includes(catRaw) ? catRaw : 0;

  const cache = caches.default;
  const key = new Request(url.origin + `/api/trend/trending?geo=${geo}&hours=${hours}&cat=${cat}&v=5`, { method: "GET" });
  const hit = await cache.match(key);
  // ⚠️ cache hit ต้องออกก่อนถึงบรรทัด log — ไม่งั้นทุกคนที่เปิดหน้าเว็บกินโควตา KV คนละครั้ง
  if (hit) return browserCopy(hit);

  resetLog();
  const L = startLog("trend/trending");
  const out = { geo, hours, cat, items: [], error: null, source: "trendingnow" };
  try {
    out.items = await fetchTrendingNow(geo, hours, cat);
    // เฉพาะ "ทุกหมวด" ที่ว่าง = ผิดปกติ -> ลอง fallback; หมวดเจาะจงว่างได้ (แค่ไม่มีเทรนด์ในหมวดนั้นตอนนี้)
    if (out.items.length === 0 && cat === 0) throw new Error("empty result");
  } catch (e) {
    // RSS fallback ไม่มี topic id ให้กรอง จึงใช้ได้เฉพาะ "ทุกหมวด" — เลี่ยงการโชว์ผลข้ามหมวด
    if (cat === 0) {
      try {
        const r = await fetch(`https://trends.google.com/trending/rss?geo=${geo}`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; TrendDashboard/1.0)" },
        });
        if (!r.ok) throw new Error("HTTP " + r.status);
        out.items = parseTrends(await r.text());
        out.source = "rss-fallback";
        out.error = "trendingnow ล้มเหลว: " + String(e.message || e);
      } catch (e2) {
        out.error = String(e2.message || e2);
      }
    } else {
      out.error = "trendingnow ล้มเหลว: " + String(e.message || e);
    }
  }

  const edge = new Response(JSON.stringify(out), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=600",
    },
  });
  // cache เฉพาะตอนมีข้อมูลจริง — ถ้าดึงไม่ได้เลย อย่าเก็บไว้ ให้รอบหน้าลองใหม่
  if (out.items.length > 0) context.waitUntil(cache.put(key, edge.clone()));

  // บันทึกเฉพาะตอนพัง/ผิดปกติ — endpoint นี้ cache key แตกตาม geo/hours/cat
  // ถ้าบันทึกทุก build จะกินโควตา KV เป็นสิบเท่าของข่าว (ดูเหตุผลเต็มใน _lib/syslog.js)
  L.cache = "miss";
  L.count("items", out.items.length);
  if (out.source !== "trendingnow") L.warn("ตกไปใช้ต้นทางสำรอง (RSS)");
  if (out.error) L.fail("trends.google.com", out.error);
  // "ทุกหมวด" แล้วยังว่าง = ผิดปกติ · หมวดเจาะจงว่างได้ตามปกติ ไม่ต้องบันทึก
  else if (!out.items.length && cat === 0) L.warn("ดึงสำเร็จแต่ไม่ได้เทรนด์เลย");
  context.waitUntil(finishLog(context.env, L, { err: out.items.length ? "" : (out.error || "") }));
  return browserCopy(edge);
}

function browserCopy(resp) {
  const h = new Headers(resp.headers);
  h.set("cache-control", "no-store");
  return new Response(resp.body, { status: resp.status, headers: h });
}
