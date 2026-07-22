// Cloudflare Pages Function: GET /api/ir/feeds
// ดึง+แปลง RSS ทุกฟีดของหน้า IR (News · Alert 1 · Alert 2) ฝั่งเซิร์ฟเวอร์ → JSON (แก้ CORS)
// stale-while-revalidate: ส่งของใน cache ทันที แล้วรีเฟรชเบื้องหลัง

import feeds from "../../../ir-feeds.config.js";
import { parseGeneric } from "../trend/_lib/parser.js";

const EDGE_TTL = 3600;
const FRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT = 12000;
const CACHE_VER = "17"; // bump: ลดฟีดเหลือ ~24 + harden กัน worker crash (1101)
const POOL = 8; // ดึงทีละ 8 ฟีด (คุม memory/CPU peak)
const MAX_XML = 600000; // ตัด XML ที่ใหญ่เกินก่อน parse (กัน CPU พุ่ง/ReDoS)
const MAX_PER_FEED = 60; // เก็บข่าวต่อฟีดไม่เกินนี้
const SOURCES = ["news", "alert1", "alert2"];
const LABELS = { news: "News", alert1: "CP / ซีพี", alert2: "ปศุสัตว์ · อาหาร · การค้า" };

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const cache = caches.default;
  const cacheKey = new Request(url.origin + "/api/ir/feeds?v=" + CACHE_VER, { method: "GET" });

  let resp = await cache.match(cacheKey);
  if (resp) {
    const age = Date.now() - Number(resp.headers.get("x-cached-at") || 0);
    if (age > FRESH_MS) context.waitUntil(buildAndStore(cache, cacheKey));
  } else {
    // cold cache — build สด แต่กัน exception ไม่ให้ worker crash (1101)
    try {
      resp = await buildAndStore(cache, cacheKey);
    } catch (e) {
      resp = new Response(
        JSON.stringify({ generatedAt: new Date().toISOString(), sources: {}, errors: [{ id: "_build", source: "_", label: "build failed", message: String((e && e.message) || e) }] }),
        { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-cached-at": String(Date.now()) } }
      );
    }
  }

  // มุมมองอ่านง่ายสำหรับเช็คฟีดพัง — เปิด /api/ir/feeds?errors
  if (url.searchParams.has("errors")) {
    let txt;
    try {
      const j = JSON.parse(await resp.clone().text());
      const s = j.sources || {};
      txt =
        `feeds ที่โหลดไม่ได้: ${(j.errors || []).length}\n` +
        `จำนวนข่าว: news=${(s.news?.items || []).length}  alert1=${(s.alert1?.items || []).length}  alert2=${(s.alert2?.items || []).length}\n` +
        `อัปเดต: ${j.generatedAt || "-"}\n\n` +
        ((j.errors || []).length
          ? (j.errors || []).map((e) => `✗ ${e.label}  [${e.source}/${e.id}]  →  ${e.message}`).join("\n")
          : "✓ ทุกฟีดโหลดได้หมด");
    } catch (e) {
      txt = "อ่าน errors ไม่ได้: " + String(e);
    }
    return new Response(txt, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }

  return browserCopy(resp);
}

async function buildAndStore(cache, cacheKey) {
  const sources = {};
  for (const s of SOURCES) sources[s] = { label: LABELS[s], items: [], feedCount: 0 };
  for (const f of feeds) if (sources[f.source]) sources[f.source].feedCount++;
  const errors = [];

  await mapPool(feeds, POOL, async (f) => {
    if (!sources[f.source]) return;
    try {
      const res = await fetchWithTimeout(f.url, FETCH_TIMEOUT);
      if (!res.ok) throw new Error("HTTP " + res.status);
      let xml = await res.text();
      if (xml.length > MAX_XML) xml = xml.slice(0, MAX_XML); // กัน CPU พุ่งจากฟีดยักษ์
      const items = parseGeneric(xml, f.source).slice(0, MAX_PER_FEED);
      for (const it of items) {
        if (!it.sourceLabel) it.sourceLabel = f.label;
        it.group = f.group || "gen"; // biz | intl | gen — สำหรับแยกช่องบน/ล่าง
        // some feeds (e.g. Workpoint) give relative links — resolve against the feed URL
        if (it.link && it.link.startsWith("/")) { try { it.link = new URL(it.link, f.url).href; } catch {} }
      }
      sources[f.source].items.push(...items);
    } catch (e) {
      errors.push({ id: f.id, source: f.source, label: f.label, message: String(e.message || e) });
    }
  });

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

// ดึงทีละ `limit` ตัว (คุม peak) — total subrequest ยังเท่าเดิม แต่ไม่ระเบิดพร้อมกัน
async function mapPool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
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
