// GET /api/sd/news?q=<คำค้น (join ด้วย OR)>&geo=TH
// ข่าวที่เกี่ยวข้องของกลุ่มคำใน SD dashboard — ดึงจาก Google News RSS search (ฝั่ง server แก้ CORS)
// คืน JSON { q, geo, articles:[{title, link, sourceLabel, publishedAt}], searchUrl }

import { parseGeneric } from "../trend/_lib/parser.js";

const FETCH_TIMEOUT = 12000;
const EDGE_TTL = 1800; // cache 30 นาที ที่ edge (ข่าวไม่ต้องสดวินาที)
const MAX_ARTICLES = 12;

// geo → (hl ภาษา, gl ประเทศ) สำหรับ Google News
const GEO_MAP = {
  "":   { hl: "en", gl: "US" }, // ทั่วโลก
  TH:   { hl: "th", gl: "TH" },
  US:   { hl: "en", gl: "US" },
  SG:   { hl: "en", gl: "SG" },
  GB:   { hl: "en", gl: "GB" },
};

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const geo = (url.searchParams.get("geo") || "").toUpperCase().slice(0, 2);
  if (!q) return json({ q, articles: [], error: "missing q" });

  const g = GEO_MAP[geo] || GEO_MAP[""];
  const searchUrl =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(q) +
    `&hl=${g.hl}&gl=${g.gl}&ceid=${g.gl}:${g.hl}`;

  const cache = caches.default;
  const key = new Request(url.origin + `/api/sd/news?v=2&q=${encodeURIComponent(q)}&geo=${geo}`, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return browserCopy(hit);

  try {
    const res = await fetchWithTimeout(searchUrl, FETCH_TIMEOUT);
    const xml = await res.text();
    const rawItems = (xml.match(/<item\b/g) || []).length;
    const diag = { http: res.status, xmlLen: xml.length, rawItems, ct: res.headers.get("content-type") || "" };
    if (!res.ok) return json({ q, geo, articles: [], searchUrl, diag, error: "HTTP " + res.status });
    const articles = parseGeneric(xml, "news")
      .map((it) => {
        // Google News: title = "หัวข้อ - สำนักข่าว" → แยกชื่อสำนักข่าวออกมาโชว์แยก
        let title = it.title;
        let sourceLabel = "";
        const i = title.lastIndexOf(" - ");
        if (i > 0) {
          sourceLabel = title.slice(i + 3).trim();
          title = title.slice(0, i).trim();
        }
        return { title, link: it.link, sourceLabel, publishedAt: it.publishedAt };
      })
      .filter((a) => a.title)
      .slice(0, MAX_ARTICLES);

    const edge = json({ q, geo, articles, searchUrl, diag }, EDGE_TTL);
    context.waitUntil(cache.put(key, edge.clone()));
    return browserCopy(edge);
  } catch (e) {
    // ไม่ throw — UI จะซ่อนส่วนข่าวเองถ้าว่าง
    return json({ q, geo, articles: [], searchUrl, error: String((e && e.message) || e) });
  }
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
