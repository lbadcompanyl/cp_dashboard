// GET /api/issue/feeds — ข่าวรายประเด็น (Issue Dashboard)
// โครงเดียวกับ /api/trend/feeds ทั้งชุด: edge cache + SWR + KV archive 10 วัน + highlight [[hl]] + ยุบข่าวซ้ำ + ?errors
// ต่างที่แหล่งข้อมูล: ไม่มี Google Alert RSS — ค้นจาก Bing News RSS ตาม query ของแต่ละประเด็น (Google News fallback)

import { parseGeneric } from "../trend/_lib/parser.js";

const EDGE_TTL = 3600;            // เก็บใน edge cache นานพอสำหรับ SWR (~1 ชม.)
const FRESH_MS = 3 * 60 * 1000;   // ของใน cache เก่ากว่า 3 นาที → รีเฟรชเบื้องหลัง
const FETCH_TIMEOUT = 12000;
const CACHE_VER = "1";

// ═══ ประเด็นที่ติดตาม — แก้/เพิ่มที่นี่ (queries = คำค้นข่าว, terms = คำที่ไฮไลต์) ═══
const ISSUES = [
  {
    src: "alert1", cat: "i0", label: "อาหารแปรรูป × มะเร็ง",
    queries: ["อาหารแปรรูป มะเร็ง", "เนื้อแปรรูป มะเร็ง", "ไส้กรอก มะเร็ง", "processed meat cancer"],
    terms: ["อาหารแปรรูป", "เนื้อแปรรูป", "ไส้กรอก", "มะเร็ง", "processed meat", "cancer"],
  },
  {
    src: "alert2", cat: "i1", label: "สัตว์ต่างถิ่น",
    queries: ["สัตว์ต่างถิ่น", "เอเลียนสปีชีส์", "ปลาหมอคางดำ", "invasive species"],
    terms: ["สัตว์ต่างถิ่น", "เอเลียนสปีชีส์", "เอเลี่ยนสปีชีส์", "ปลาหมอคางดำ", "หมอคางดำ", "invasive species", "alien species"],
  },
];

const ARCHIVE_KEY = "issue:archive"; // สะสมข่าวใน KV แม้หลุดจากผลค้นแล้ว (10 วัน)
const ARCHIVE_CFG = { news: { days: 10, max: 400 }, alert1: { days: 10, max: 300 }, alert2: { days: 10, max: 300 } };
const envPrefix = (env) => (env && env.APP_ENV ? String(env.APP_ENV) + ":" : "");

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const cache = caches.default;
  const cacheKey = new Request(url.origin + `/api/issue/feeds?v=${CACHE_VER}`, { method: "GET" });
  const wantRebuild = url.searchParams.has("rebuild") || url.searchParams.has("errors");

  let resp;
  if (wantRebuild) {
    resp = await buildAndStore(cache, cacheKey, context.env);
  } else {
    resp = await cache.match(cacheKey);
    if (!resp) {
      resp = await buildAndStore(cache, cacheKey, context.env);
    } else {
      try {
        const j = JSON.parse(await resp.clone().text());
        const age = Date.now() - new Date(j.generatedAt || 0).getTime();
        if (age > FRESH_MS) context.waitUntil(buildAndStore(cache, cacheKey, context.env));
      } catch {}
    }
  }

  if (url.searchParams.has("errors")) {
    let txt;
    try {
      const j = JSON.parse(await resp.clone().text());
      const s = j.sources || {};
      txt =
        `จำนวนข่าว: รวม=${(s.news?.items || []).length}  ` +
        ISSUES.map((c) => `${c.label}=${(s[c.src]?.items || []).length}`).join("  ") + "\n" +
        `คลังเก็บสะสม (KV 10 วัน): ${JSON.stringify(j.archive || {})}\n` +
        `อัปเดต: ${j.generatedAt || "-"}\n\n` +
        ((j.errors || []).length
          ? (j.errors || []).map((e) => `✗ ${e.label}  [${e.source}/${e.id}]  →  ${e.message}`).join("\n")
          : "✓ ทุก query ค้นได้หมด");
    } catch (e) { txt = "อ่าน errors ไม่ได้: " + String(e); }
    return new Response(txt, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }

  return browserCopy(resp);
}

async function buildAndStore(cache, cacheKey, env) {
  const errors = [];
  const sources = { news: { label: "ข่าวรวมทุกประเด็น", items: [] } };

  // ค้นข่าวทุก query ของทุกประเด็นพร้อมกัน (Bing ก่อน → Google fallback ต่อ query)
  await Promise.all(ISSUES.map(async (iss) => {
    const results = await Promise.all(iss.queries.map((q) => fetchQuery(q, iss, errors)));
    const seen = new Set();
    const items = results.flat()
      .filter((it) => { const k = normLink(it.link); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, 120);
    sources[iss.src] = { label: iss.label, items, queries: [iss.queries.map((q) => `"${q}"`).join(" OR ")] };
  }));

  // คอลัมน์ข่าวรวม: ทุกประเด็น dedup + ติด tag ประเด็น (it.cat) ให้ชิพกรองฝั่ง client
  {
    const seen = new Set();
    const all = [];
    for (const iss of ISSUES) for (const it of sources[iss.src].items) {
      const k = normLink(it.link);
      if (seen.has(k)) continue;
      seen.add(k);
      all.push({ ...it, cat: iss.cat });
    }
    all.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    sources.news.items = all;
  }

  // สะสมลง KV (กันข่าวหายเมื่อหลุดจากผลค้น) — merge ของเก่า + re-sort + ตัดตามอายุ
  const archive = {};
  try { await mergeArchives(env, sources, archive); } catch (e) { archive.err = String((e && e.message) || e).slice(0, 120); }

  // ไฮไลต์คำของประเด็น (ลบ marker เก่าก่อน ครอบใหม่ทุกรอบ — ของจาก KV ก็สดเสมอ)
  for (const iss of ISSUES) {
    const s = sources[iss.src];
    if (s) for (const it of s.items) { it.title = hlAll(it.title, iss.terms); it.snippet = hlAll(it.snippet, iss.terms); }
  }
  const termsByCat = Object.fromEntries(ISSUES.map((i) => [i.cat, i.terms]));
  for (const it of sources.news.items) {
    const t = termsByCat[it.cat] || [];
    it.title = hlAll(it.title, t); it.snippet = hlAll(it.snippet, t);
  }

  // ยุบข่าวซ้ำหลายสำนัก (เหมือน trend) — เฉพาะผลแสดงผล
  try { for (const s of Object.keys(sources)) collapseDupes(sources, s); } catch {}

  const body = JSON.stringify({ generatedAt: new Date().toISOString(), sources, errors, archive });
  const resp = new Response(body, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${EDGE_TTL}` },
  });
  if (sources.news.items.length) { try { await cache.put(cacheKey, resp.clone()); } catch {} }
  return resp;
}

// ---------- ค้นข่าว 1 query (Bing → Google fallback) ----------
const bingUrl = (q) => `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=RSS&setmkt=th-TH`;
const googleUrl = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=th&gl=TH&ceid=TH:th`;

async function fetchQuery(q, iss, errors) {
  let items = await fetchFeed(bingUrl(q));
  if (items === null || items.length === 0) {
    const g = await fetchFeed(googleUrl(q));
    if (g === null && items === null) errors.push({ source: iss.src, id: q, label: iss.label, message: "Bing+Google ค้นไม่ได้" });
    items = g || items || [];
  }
  return items.map((it) => {
    let title = it.title || "", sourceLabel = "";
    const i = title.lastIndexOf(" - "); // Google News: "หัวข้อ - สำนักข่าว"
    if (i > 0) { sourceLabel = title.slice(i + 3).trim(); title = title.slice(0, i).trim(); }
    const link = unwrapBing(it.link);
    if (!sourceLabel) sourceLabel = hostOf(link);
    return { title, link, sourceLabel, snippet: (it.snippet || "").slice(0, 260), publishedAt: it.publishedAt };
  }).filter((a) => a.title && a.link);
}

async function fetchFeed(u) {
  try {
    const res = await fetchWithTimeout(u, FETCH_TIMEOUT);
    if (!res.ok) return null;
    const xml = await res.text();
    return parseGeneric(xml, "news");
  } catch { return null; }
}

// ---------- utils (แบบเดียวกับ trend/feeds.js) ----------
function normLink(url) {
  try { const u = new URL(url); return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, ""); }
  catch { return url || ""; }
}
function unwrapBing(link) {
  try { const u = new URL(link); if (u.hostname.includes("bing.com")) { const real = u.searchParams.get("url"); if (real) return real; } } catch {}
  return link;
}
function hostOf(link) {
  try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return ""; }
}
// ไฮไลต์ทุก term: ลบ marker เดิมแล้วครอบใหม่ทีเดียว (longest-first กันครอบซ้อน)
function hlAll(text, terms) {
  if (!text) return text || "";
  const stripped = String(text).replace(/\[\[\/?hl\]\]/g, "");
  const esc = [...new Set((terms || []).filter(Boolean).map(String))]
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!esc.length) return stripped;
  return stripped.replace(new RegExp("(" + esc.join("|") + ")", "gi"), (m) => `[[hl]]${m}[[/hl]]`);
}
// ยุบข่าวซ้ำหลายสำนัก (bigram Jaccard ≥ 0.3 + เวลาใกล้กัน <72 ชม.) — ใบซ้ำเก็บใน it.also
function dupKeyText(t) { return String(t || "").replace(/\[\[\/?hl\]\]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); }
function dupBigrams(s) { const o = new Set(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o; }
function dupSim(a, b) { if (!a.size || !b.size) return 0; let n = 0; for (const g of a) if (b.has(g)) n++; return n / (a.size + b.size - n); }
function collapseDupes(sources, src) {
  const s = sources[src];
  if (!s || !s.items || s.items.length < 2) return;
  const metas = s.items.map((it) => ({ it, g: dupBigrams(dupKeyText(it.title)), t: new Date(it.publishedAt).getTime() }));
  const kept = [];
  for (const m of metas) {
    const host = m.g.size >= 12
      ? kept.find((k) => k.g.size >= 12 && Math.abs(m.t - k.t) < 72 * 3600e3 && dupSim(m.g, k.g) >= 0.3)
      : null;
    if (host) {
      host.it.also = host.it.also || [];
      if (host.it.also.length < 5 && m.it.link) host.it.also.push({ label: m.it.sourceLabel || "", link: m.it.link });
    } else kept.push(m);
  }
  s.items = kept.map((k) => k.it);
}
// สะสมข่าวลง KV 10 วัน (แบบเดียวกับ trend) — ของสดทับของเก่าตามลิงก์
async function mergeArchives(env, sources, diag) {
  const kv = env && env.FLAGS_KV;
  diag.enabled = !!kv;
  if (!kv) return;
  const now = Date.now();
  const key = envPrefix(env) + ARCHIVE_KEY;
  let store = {};
  try { const raw = await kv.get(key); if (raw) store = JSON.parse(raw) || {}; } catch {}
  const out = {};
  for (const src of Object.keys(ARCHIVE_CFG)) {
    if (!sources[src]) continue;
    const cfg = ARCHIVE_CFG[src];
    const cutoff = now - cfg.days * 86400000;
    const byLink = new Map();
    for (const it of (store[src] || [])) if (it && it.link) byLink.set(it.link, it);
    for (const it of sources[src].items) if (it && it.link) byLink.set(it.link, it);
    const merged = [...byLink.values()]
      .filter((it) => { const t = new Date(it.publishedAt).getTime(); return isNaN(t) || t >= cutoff; })
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, cfg.max);
    sources[src].items = merged;
    out[src] = merged;
    diag[src] = merged.length;
  }
  try { await kv.put(key, JSON.stringify(out)); diag.saved = true; diag.env = env.APP_ENV || "prod"; } catch (e) { diag.err = String((e && e.message) || e).slice(0, 120); }
}

function browserCopy(resp) {
  const h = new Headers(resp.headers);
  h.set("cache-control", "no-store");
  return new Response(resp.body, { status: resp.status, headers: h });
}
async function fetchWithTimeout(u, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(u, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "th,en;q=0.9",
      },
      signal: ctrl.signal,
    });
  } finally { clearTimeout(t); }
}
