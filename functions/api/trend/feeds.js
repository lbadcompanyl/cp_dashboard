// Cloudflare Pages Function: GET /api/feeds
// ตัวกลางฝั่งเซิร์ฟเวอร์ — ดึง+แปลง RSS ทุกฟีด, ส่ง JSON (แก้ปัญหา CORS)
// ใช้ stale-while-revalidate: ส่งของใน cache ทันที (เร็ว) แล้วดึงของใหม่เบื้องหลัง

import feeds from "../../../trend-feeds.config.js";
import { parseGeneric, parseTrends } from "./_lib/parser.js";

const EDGE_TTL = 3600; // เก็บใน edge cache นานพอสำหรับ SWR (~1 ชม.)
const FRESH_MS = 5 * 60 * 1000; // ถ้าของใน cache เก่ากว่านี้ (5 นาที) → รีเฟรชเบื้องหลัง
const FETCH_TIMEOUT = 12000; // ms (เผื่อ cold start)
const CACHE_VER = "12"; // แยก alert → alert1 + เพิ่มคอลัมน์ alert2

export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request(
    new URL(context.request.url).origin + "/api/trend/feeds?v=" + CACHE_VER,
    { method: "GET" }
  );

  const hit = await cache.match(cacheKey);
  if (hit) {
    const age = Date.now() - Number(hit.headers.get("x-cached-at") || 0);
    if (age > FRESH_MS) {
      // ของเริ่มเก่า → ดึงใหม่เบื้องหลัง (ผู้ใช้ไม่ต้องรอ)
      context.waitUntil(buildAndStore(cache, cacheKey));
    }
    return browserCopy(hit); // ส่งของใน cache ทันที — เร็วเสมอ
  }

  // ไม่มีใน cache (ครั้งแรกสุด) → ดึงสด
  const fresh = await buildAndStore(cache, cacheKey);
  return browserCopy(fresh);
}

// ดึงทุกฟีด, ประกอบ response, เก็บลง cache (เฉพาะตอนไม่มี error), แล้วคืน response
async function buildAndStore(cache, cacheKey) {
  const sources = {
    news: { label: "Google News", items: [], feedCount: 0 },
    alert1: { label: "Alert 1 · CP", items: [], feedCount: 0 },
    alert2: { label: "หัวข้อที่จับตามอง", items: [], feedCount: 0 },
    trends: { label: "Google Trends", items: [], feedCount: 0 },
  };
  for (const f of feeds) if (sources[f.source]) sources[f.source].feedCount++;
  const errors = [];

  await Promise.all(
    feeds.map(async (f) => {
      try {
        const res = await fetchWithTimeout(f.url, FETCH_TIMEOUT);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const xml = await res.text();
        const items = f.source === "trends" ? parseTrends(xml) : parseGeneric(xml, f.source);
        for (const it of items) {
          if (!it.sourceLabel) it.sourceLabel = f.label;
          // some feeds (e.g. Workpoint) give relative links — resolve against the feed URL
          if (it.link && it.link.startsWith("/")) { try { it.link = new URL(it.link, f.url).href; } catch {} }
        }
        (sources[f.source] || (sources[f.source] = { label: f.label, items: [] })).items.push(...items);
      } catch (e) {
        errors.push({ id: f.id, source: f.source, label: f.label, message: String(e.message || e) });
      }
    })
  );

  // ตัดซ้ำ (ตาม link) + เรียงใหม่ล่าสุดก่อน ต่อแหล่ง
  for (const key of Object.keys(sources)) {
    const seen = new Set();
    sources[key].items = sources[key].items
      .filter((it) => {
        const k = it.link || it.title;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  }

  // Google Alert ส่งว่างชั่วคราว (ฟีดรีเซ็ตหลังแก้ query / โดน throttle) → คงชุดเดิมจาก cache กันแผงว่าง
  try {
    const prev = await cache.match(cacheKey);
    const pj = prev ? JSON.parse(await prev.clone().text()) : null;
    for (const k of ["alert1", "alert2"]) {
      if (sources[k].items.length === 0 && pj?.sources?.[k]?.items?.length) {
        sources[k].items = pj.sources[k].items;
        sources[k].stale = true;
      }
    }
  } catch {}

  const body = JSON.stringify({ generatedAt: new Date().toISOString(), sources, errors });
  const resp = new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${EDGE_TTL}`,
      "x-cached-at": String(Date.now()),
    },
  });

  // เก็บ cache ตราบใดที่ได้ข่าวมาบ้าง (ทนฟีดพังบางเจ้า) — จะรีเฟรชเบื้องหลังเองตาม SWR
  if (Object.values(sources).some((s) => s.items.length > 0)) await cache.put(cacheKey, resp.clone());
  return resp;
}

// ส่งสำเนาที่ไม่ให้เบราว์เซอร์ cache (กดรีเฟรชแล้วได้ของล่าสุดจาก edge เสมอ)
function browserCopy(resp) {
  const h = new Headers(resp.headers);
  h.set("cache-control", "no-store");
  return new Response(resp.body, { status: resp.status, headers: h });
}

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "th,en;q=0.9",
      },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}
