// GET /api/sd/news?q=<คำค้น (join ด้วย OR)>&geo=TH
// ข่าวที่เกี่ยวข้องของกลุ่มคำใน SD dashboard — ดึงจาก news RSS search ฝั่ง server (แก้ CORS)
// ลองหลายแหล่งตามลำดับ: Bing News RSS → Google News RSS (Google มักบล็อก IP datacenter ด้วย 503)
// คืน JSON { q, geo, articles:[{title, link, sourceLabel, publishedAt}], provider, searchUrl, diag }

import { parseGeneric } from "../trend/_lib/parser.js";

const FETCH_TIMEOUT = 12000;
const EDGE_TTL = 1800; // cache 30 นาที ที่ edge
const MAX_ARTICLES = 12;
const CACHE_VER = "4";

// Bing ห่อลิงก์เป็น bing.com/news/apiclick.aspx?...&url=<ของจริง> → แกะออกให้เป็นลิงก์ตรง
function unwrapLink(link) {
  try {
    const u = new URL(link);
    if (u.hostname.includes("bing.com")) {
      const real = u.searchParams.get("url");
      if (real) return real;
    }
  } catch {}
  return link;
}
// ชื่อสำนักข่าวจากโดเมน (fallback เมื่อ title ไม่มี " - สำนักข่าว")
function hostLabel(link) {
  try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// geo → market/lang
const MKT = { "": "en-US", TH: "th-TH", US: "en-US", SG: "en-SG", GB: "en-GB" };
const HLGL = { "": ["en", "US"], TH: ["th", "TH"], US: ["en", "US"], SG: ["en", "SG"], GB: ["en", "GB"] };

function providers(q, geo) {
  const mkt = MKT[geo] || MKT[""];
  const [hl, gl] = HLGL[geo] || HLGL[""];
  return [
    { name: "bing", url: `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=RSS&setmkt=${mkt}` },
    { name: "google", url: `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}&ceid=${gl}:${hl}` },
  ];
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const geo = (url.searchParams.get("geo") || "").toUpperCase().slice(0, 2);
  if (!q) return json({ q, articles: [], error: "missing q" });

  const cache = caches.default;
  const key = new Request(url.origin + `/api/sd/news?v=${CACHE_VER}&q=${encodeURIComponent(q)}&geo=${geo}`, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return browserCopy(hit);

  const diag = [];
  let articles = [];
  let provider = "";
  let searchUrl = "";

  for (const p of providers(q, geo)) {
    try {
      const res = await fetchWithTimeout(p.url, FETCH_TIMEOUT);
      const xml = await res.text();
      const rawItems = (xml.match(/<item\b/g) || []).length;
      diag.push({ name: p.name, http: res.status, xmlLen: xml.length, rawItems });
      if (!res.ok || rawItems === 0) continue;
      const parsed = parseGeneric(xml, "news")
        .map((it) => {
          let title = it.title, sourceLabel = "";
          const i = title.lastIndexOf(" - "); // Google News: "หัวข้อ - สำนักข่าว"
          if (i > 0) { sourceLabel = title.slice(i + 3).trim(); title = title.slice(0, i).trim(); }
          const link = unwrapLink(it.link);
          if (!sourceLabel) sourceLabel = hostLabel(link); // Bing: ไม่มีชื่อใน title → ใช้โดเมน
          return { title, link, sourceLabel, publishedAt: it.publishedAt };
        })
        .filter((a) => a.title && a.link)
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)); // ล่าสุดก่อน
      if (parsed.length) { articles = parsed.slice(0, MAX_ARTICLES); provider = p.name; searchUrl = p.url; break; }
    } catch (e) {
      diag.push({ name: p.name, err: String((e && e.message) || e).slice(0, 60) });
    }
  }

  const body = json({ q, geo, articles, provider, searchUrl, diag }, articles.length ? EDGE_TTL : 0);
  if (articles.length) context.waitUntil(cache.put(key, body.clone()));
  return browserCopy(body);
}

function json(obj, maxAge = 0) {
  return new Response(JSON.stringify(obj), {
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
async function fetchWithTimeout(u, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(u, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "th,en;q=0.9",
      },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}
