// Cloudflare Pages Function: GET /api/feeds
// ตัวกลางฝั่งเซิร์ฟเวอร์ — ดึง+แปลง RSS ทุกฟีด, ส่ง JSON (แก้ปัญหา CORS)
// ใช้ stale-while-revalidate: ส่งของใน cache ทันที (เร็ว) แล้วดึงของใหม่เบื้องหลัง

import feeds from "../../../trend-feeds.config.js";
import { parseGeneric, parseTrends } from "./_lib/parser.js";

const EDGE_TTL = 3600; // เก็บใน edge cache นานพอสำหรับ SWR (~1 ชม.)
const FRESH_MS = 5 * 60 * 1000; // ถ้าของใน cache เก่ากว่านี้ (5 นาที) → รีเฟรชเบื้องหลัง
const FETCH_TIMEOUT = 12000; // ms (เผื่อ cold start)
const CACHE_VER = "13"; // bump: auto-sync ปุ่ม 🔤 (แนบ sources[*].queries จาก title ฟีด Alert)

export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request(
    new URL(context.request.url).origin + "/api/trend/feeds?v=" + CACHE_VER,
    { method: "GET" }
  );

  // ?rebuild = build สดพร้อม verify ทันที (ทดสอบตัวกรอง related-block · เลี่ยงรอ background 5 นาที)
  if (new URL(context.request.url).searchParams.has("rebuild")) {
    return browserCopy(await buildAndStore(cache, cacheKey, true));
  }

  const hit = await cache.match(cacheKey);
  if (hit) {
    const age = Date.now() - Number(hit.headers.get("x-cached-at") || 0);
    if (age > FRESH_MS) {
      // ของเริ่มเก่า → ดึงใหม่เบื้องหลัง (ผู้ใช้ไม่ต้องรอ) · เปิด verify เฉพาะรอบนี้
      context.waitUntil(buildAndStore(cache, cacheKey, true));
    }
    return browserCopy(hit); // ส่งของใน cache ทันที — เร็วเสมอ
  }

  // ไม่มีใน cache (ครั้งแรกสุด) → ดึงสด · ไม่ verify (กันคำขอแรกหน่วง)
  const fresh = await buildAndStore(cache, cacheKey, false);
  return browserCopy(fresh);
}

// ดึงทุกฟีด, ประกอบ response, เก็บลง cache (เฉพาะตอนไม่มี error), แล้วคืน response
// แกะ query จาก title ของฟีด Google Alert: "<title>Google Alert - QUERY</title>" → "QUERY"
function alertQueryFromXml(xml) {
  const m = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  const t = m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
  const i = t.indexOf(" - ");
  return i >= 0 ? t.slice(i + 3).trim() : "";
}

async function buildAndStore(cache, cacheKey, allowVerify) {
  const sources = {
    news: { label: "Google News", items: [], feedCount: 0 },
    alert1: { label: "CP", items: [], feedCount: 0 },
    alert2: { label: "หัวข้อที่จับตามอง", items: [], feedCount: 0 },
    trends: { label: "Google Trends", items: [], feedCount: 0 },
  };
  for (const f of feeds) if (sources[f.source]) sources[f.source].feedCount++;
  const errors = [];
  const queriesBySource = {}; // query ที่แกะจาก title ฟีด Alert (auto-sync ปุ่ม 🔤)

  await Promise.all(
    feeds.map(async (f) => {
      try {
        const res = await fetchWithTimeout(f.url, FETCH_TIMEOUT);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const xml = await res.text();
        const items = f.source === "trends" ? parseTrends(xml) : parseGeneric(xml, f.source);
        if (f.source.startsWith("alert")) {
          const q = alertQueryFromXml(xml);
          if (q) (queriesBySource[f.source] = queriesBySource[f.source] || []).push(q);
        }
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
  for (const s of Object.keys(queriesBySource)) if (sources[s]) sources[s].queries = queriesBySource[s];

  // Hybrid alert filter: keyword ต้องอยู่ในเนื้อ/meta ของบทความจริง (ไม่ใช่ related block)
  // เฉพาะ background refresh (allowVerify) → คำขอเย็นครั้งแรกไม่โดนหน่วง · ทำก่อน stale-fill กันสะสม noise
  const alertVerify = {};
  if (allowVerify) { try { await verifyAlertItems(cache, sources, alertVerify); } catch (e) { alertVerify.err = String((e && e.message) || e).slice(0, 120); } }

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

  const body = JSON.stringify({ generatedAt: new Date().toISOString(), sources, errors, alertVerify });
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

// ---------- Hybrid alert filter: keyword ต้องอยู่ในเนื้อ/meta ของบทความจริง (ไม่ใช่ related block) ----------
// ต้นเหตุ false positive: Google Alert จับ keyword จากบล็อก "ข่าวที่เกี่ยวข้อง/แนะนำ/roundup" ท้ายหน้า
const ROUNDUP_RE = /สรุปข่าวประจำวัน|สรุปข่าวเด่น|รวมข่าวเด่นประจำ|ข่าวเด่นประจำวัน/;
// คำที่ Google ไฮไลต์ (= คำที่ match) จาก marker [[hl]]…[[/hl]] ใน title+snippet
function highlightedTerms(it) {
  const s = (it.title || "") + " " + (it.snippet || "");
  const out = new Set(); let m;
  const re = /\[\[hl\]\]([\s\S]*?)\[\[\/hl\]\]/g;
  while ((m = re.exec(s))) { const w = m[1].replace(/\[\[\/?hl\]\]/g, "").trim().toLowerCase(); if (w.length >= 2) out.add(w); }
  return [...out];
}
function decodeEnt(s = "") {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#0*39;/g, "'").replace(/&nbsp;/gi, " ");
}
// เนื้อหา "ของบทความเอง" — meta/title/h1 (related block จะไม่โผล่ในนี้) → ใช้ตัดสินว่า match มาจากเนื้อจริงไหม
function articleMainText(html) {
  const grab = (re) => { const m = html.match(re); return m ? m[1] : ""; };
  const parts = [
    grab(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i),
    grab(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i),
    grab(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i),
    grab(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:description["']/i),
    grab(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i),
    grab(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']description["']/i),
    grab(/<title[^>]*>([\s\S]*?)<\/title>/i),
    (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || []).join(" "),
  ];
  return decodeEnt(parts.join("  ").replace(/<[^>]+>/g, " ")).toLowerCase();
}
// ตรวจว่า term ที่ match อยู่ในเนื้อบทความไหม (cache verdict ต่อ link ที่ edge → ไม่ fetch ซ้ำ)
async function verifyInBody(cache, link, terms) {
  const vkey = new Request("https://verify.local/trend?u=" + encodeURIComponent(link), { method: "GET" });
  try { const hit = await cache.match(vkey); if (hit) return (await hit.json()).ok; } catch {}
  let ok = true; // default: เก็บไว้เมื่อไม่แน่ใจ (กันตัดพลาด)
  try {
    const res = await fetchWithTimeout(link, 6000);
    if (res.ok && /html/i.test(res.headers.get("content-type") || "")) {
      let html = await res.text();
      if (html.length > 200000) html = html.slice(0, 200000);
      const main = articleMainText(html);
      if (main && main.length > 20) ok = terms.some((t) => main.includes(t)); // main มีจริงถึงจะตัดสิน
    }
  } catch { ok = true; }
  try { await cache.put(vkey, new Response(JSON.stringify({ ok }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=86400" } })); } catch {}
  return ok;
}
async function verifyAlertItems(cache, sources, diag) {
  for (const src of ["alert1", "alert2"]) {
    if (!sources[src]) continue;
    const items = sources[src].items;
    const before = items.length;
    const verdict = await mapPoolResults(items, 6, async (it) => {
      if (/\[\[hl\]\]/.test(it.title || "")) return true;                 // ชั้น 1: match อยู่ใน title → เชื่อ (ฟรี)
      if (ROUNDUP_RE.test((it.title || "").replace(/\[\[\/?hl\]\]/g, ""))) return false; // ชั้น 2: roundup → ทิ้ง (ฟรี)
      const terms = highlightedTerms(it);
      if (!terms.length) return true;                                     // ไม่รู้ match อะไร → เก็บ
      return await verifyInBody(cache, it.link, terms);                   // ชั้น 3: body/meta check (fetch+cache)
    });
    sources[src].items = items.filter((_, i) => verdict[i] !== false);
    diag[src] = before - sources[src].items.length;
  }
}
async function mapPoolResults(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; results[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return results;
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
