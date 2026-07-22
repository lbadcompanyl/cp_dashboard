// Cloudflare Pages Function: GET /api/ir/feeds
// ดึง+แปลง RSS ทุกฟีดของหน้า IR (News · Alert 1 · Alert 2) ฝั่งเซิร์ฟเวอร์ → JSON (แก้ CORS)
// stale-while-revalidate: ส่งของใน cache ทันที แล้วรีเฟรชเบื้องหลัง

import feeds from "../../../ir-feeds.config.js";
import { parseGeneric } from "../trend/_lib/parser.js";

const EDGE_TTL = 3600;
const FRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT = 12000;
const CACHE_VER = "11"; // bump: Alert1 = CP+ซีพี รวมคอลัมน์, Alert2 = ปศุสัตว์/อาหาร/การค้า
const SOURCES = ["news", "alert1", "alert2"];
const LABELS = { news: "News", alert1: "CP / ซีพี", alert2: "ปศุสัตว์ · อาหาร · การค้า" };

export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request(
    new URL(context.request.url).origin + "/api/ir/feeds?v=" + CACHE_VER,
    { method: "GET" }
  );

  const hit = await cache.match(cacheKey);
  if (hit) {
    const age = Date.now() - Number(hit.headers.get("x-cached-at") || 0);
    if (age > FRESH_MS) context.waitUntil(buildAndStore(cache, cacheKey));
    return browserCopy(hit);
  }
  return browserCopy(await buildAndStore(cache, cacheKey));
}

async function buildAndStore(cache, cacheKey) {
  const sources = {};
  for (const s of SOURCES) sources[s] = { label: LABELS[s], items: [], feedCount: 0 };
  for (const f of feeds) if (sources[f.source]) sources[f.source].feedCount++;
  const errors = [];

  await Promise.all(
    feeds.map(async (f) => {
      if (!sources[f.source]) return;
      try {
        const res = await fetchWithTimeout(f.url, FETCH_TIMEOUT);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const xml = await res.text();
        const items = parseGeneric(xml, f.source);
        for (const it of items) {
          if (!it.sourceLabel) it.sourceLabel = f.label;
          // some feeds (e.g. Workpoint) give relative links — resolve against the feed URL
          if (it.link && it.link.startsWith("/")) { try { it.link = new URL(it.link, f.url).href; } catch {} }
        }
        sources[f.source].items.push(...items);
      } catch (e) {
        errors.push({ id: f.id, source: f.source, label: f.label, message: String(e.message || e) });
      }
    })
  );

  // ตัดซ้ำตาม link + เรียงใหม่ล่าสุดก่อน ต่อแหล่ง
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

  const body = JSON.stringify({ generatedAt: new Date().toISOString(), sources, errors });
  const resp = new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${EDGE_TTL}`,
      "x-cached-at": String(Date.now()),
    },
  });
  if (Object.values(sources).some((s) => s.items.length > 0)) await cache.put(cacheKey, resp.clone());
  return resp;
}

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
