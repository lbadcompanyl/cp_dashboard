import { startLog, finishLog, resetLog } from "../_lib/syslog.js";
// GET /api/trend/kwcheck?q=ไข่แพง&geo=TH&time=today%2012-m
// เช็ค Trend ของคำเดียว ว่าคนสนใจแค่ไหน — ใช้ตัดสินว่าควรเอาเข้า Alert ไหม
//
// 2 ชั้นข้อมูล:
//   1. Google Trends — ความสนใจ 0-100 เทียบกันเอง + คำที่เกี่ยวข้อง · ใช้ได้เลย ไม่ต้องมี key
//   2. Google Ads (Keyword Planner) — ยอดค้นหาต่อเดือนเป็นตัวเลขจริง · รอ token อนุมัติ
// ชั้นที่ 2 ไม่มีก็ไม่พัง แค่ส่ง volume.available = false กลับไปให้หน้าเว็บบอกผู้ใช้
//
// 💧 งบ KV: ไม่เขียน KV เลย
// ผู้ใช้พิมพ์คำอะไรก็ได้ = จำนวน key ไม่มีขอบเขต ถ้าเขียนลง KV ทุกคำที่ถูกค้น
// โควตา 1,000 ครั้ง/วันที่ใช้ร่วมทั้งโปรเจกต์จะหมดจากคอลัมน์เดียว
// ใช้ edge cache อย่างเดียวพอ — ค่าความสนใจเป็นข้อมูลรายสัปดาห์/เดือน ไม่ต้องสดวินาที

import { fetchKeywordCheck } from "./_lib/trends.js";
import { fetchSearchVolume, adsConfig } from "./_lib/adsvolume.js";

const CACHE_VER = "1";
const EDGE_TTL = 6 * 3600; // 6 ชม. — Google Trends อัปเดตเป็นวัน ไม่ต้องถี่กว่านี้
const MAX_Q = 80;
// ต้องตรงกับที่ Google รับ ไม่งั้น explore ตอบ 400
const TIMES = new Set(["now 7-d", "today 1-m", "today 3-m", "today 12-m", "today 5-y"]);
const GEOS = new Set(["TH", "US", "GB", "JP", "KR", "SG", "IN", ""]);

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const env = context.env || {};

  const q = (url.searchParams.get("q") || "").trim().slice(0, MAX_Q);
  const geoRaw = (url.searchParams.get("geo") || "TH").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  const geo = GEOS.has(geoRaw) ? geoRaw : "TH";
  const timeRaw = url.searchParams.get("time") || "today 12-m";
  const time = TIMES.has(timeRaw) ? timeRaw : "today 12-m";

  if (!q) return json({ error: "ใส่คำที่ต้องการเช็คด้วย" }, 400, 0);

  const ads = adsConfig(env);
  const cache = caches.default;
  // ⚠️ ใส่สถานะ "มี token ของ Ads หรือยัง" ลงใน cache key ด้วย
  // ไม่งั้นวันที่ token มาถึง ผู้ใช้จะยังเห็นผลเดิมที่ไม่มีตัวเลขยอดค้นหาไปอีก 6 ชม.
  // (บทเรียนเดิมจากตอนใส่ YT_API_KEY แล้วนึกว่าใส่ไม่สำเร็จ)
  const key = new Request(
    `${url.origin}/api/trend/kwcheck?q=${encodeURIComponent(q)}&geo=${geo}&time=${encodeURIComponent(time)}` +
      `&_v=${CACHE_VER}&_a=${ads.available ? 1 : 0}`,
    { method: "GET" }
  );
  const hit = await cache.match(key);
  // ⚠️ cache hit ต้องออกก่อนถึงบรรทัด log — ไม่งั้นทุกครั้งที่กดค้นซ้ำกินโควตา KV
  if (hit) return browserCopy(hit);

  // บันทึกระบบ — ผู้ใช้พิมพ์คำอะไรก็ได้ cache key จึงไม่มีขอบเขต
  // **ห้ามบันทึกทุกครั้งที่ค้น** บันทึกเฉพาะตอนดึงไม่ได้ (เช่นโดน Google แบน 429)
  resetLog();
  const L = startLog("trend/kwcheck");

  const out = { q, geo, time, interest: null, related: { top: [], rising: [] }, volume: { available: false }, errors: [] };

  // สองแหล่งไม่ขึ้นต่อกัน — Ads ล่มไม่ควรทำให้ Trends หายไปด้วย และกลับกัน
  const [trendRes, volRes] = await Promise.allSettled([
    fetchKeywordCheck(q, geo, time),
    ads.available ? fetchSearchVolume([q], geo, env) : Promise.resolve({ available: false, missing: ads.missing, metrics: {} }),
  ]);

  if (trendRes.status === "fulfilled") {
    out.interest = trendRes.value.interest;
    out.related = trendRes.value.related;
    out.empty = trendRes.value.empty;
    out.rateLimited = !!trendRes.value.rateLimited;
    out.errors.push(...(trendRes.value.errors || []));
  } else {
    out.errors.push("trends: " + String(trendRes.reason?.message || trendRes.reason).slice(0, 160));
  }

  if (volRes.status === "fulfilled") {
    const v = volRes.value;
    out.volume = v.available
      ? { available: true, ...(v.metrics[q.toLowerCase()] || {}) }
      : { available: false, missing: v.missing || [] };
  } else {
    out.volume = { available: false, error: String(volRes.reason?.message || volRes.reason).slice(0, 160) };
  }

  const ok = !!out.interest || out.related.top.length > 0 || out.empty;
  // ดึงไม่ได้ = cache สั้นๆ 60 วิ ไม่ใช่ไม่ cache เลย
  // ถ้าไม่ cache ผู้ใช้กดซ้ำรัวๆ ตอนโดน 429 จะยิ่งไปกระทืบ Google ให้แบนนานขึ้น
  // แต่ก็ต้องสั้นพอที่พอหายแบนแล้วกดใหม่ได้ผลทันที
  const resp = json(out, 200, ok ? EDGE_TTL : 60);
  context.waitUntil(cache.put(key, resp.clone()));

  L.cache = "miss";
  for (const e of out.errors) L.fail("trends.google.com", e);
  if (out.rateLimited) L.warn("Google แบนชั่วคราว (429) — เช็คคำไม่ได้");
  else if (!ok) L.warn("ดึงข้อมูลเช็คคำไม่ได้: " + q.slice(0, 40));
  context.waitUntil(finishLog(env, L, { err: ok ? "" : "ดึงข้อมูลไม่สำเร็จ" }));
  return browserCopy(resp);
}

function json(obj, status, ttl) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": ttl ? `public, max-age=${ttl}` : "no-store",
    },
  });
}
function browserCopy(resp) {
  const h = new Headers(resp.headers);
  h.set("cache-control", "no-store");
  return new Response(resp.body, { status: resp.status, headers: h });
}
