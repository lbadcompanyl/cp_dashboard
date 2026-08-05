// GET /api/trend/xnews?q=<คำ/แฮชแท็ก>
// ข่าวที่เกี่ยวข้องกับเทรนด์บน X — ใช้ตอนกดที่เทรนด์ในคอลัมน์ X
//
// ⚠️ ทำไมเป็น "ข่าว" ไม่ใช่ "โพสต์บน X":
// การดึงโพสต์จริงต้องใช้ X API ซึ่งอยู่ tier Pro (~$5,000/เดือน) — ไม่คุ้ม
// จึงค้นข่าวด้วยคำเดียวกันแทน ได้บริบทว่าเทรนด์นั้นเรื่องอะไร โดยไม่มีค่าใช้จ่าย
// (ถ้าอยากอ่านโพสต์จริง ปุ่มเปิดหน้าค้นหาบน X ยังอยู่ที่การ์ดเทรนด์)
//
// ใช้ Bing News RSS เพราะ news.google.com คืน 503 จาก IP ของ Cloudflare
// (ดู TREND-HANDOFF.md — อย่าเปลี่ยนกลับไปใช้ Google News)

import { parseGeneric } from "./_lib/parser.js";

const TIMEOUT = 8000;
const EDGE_TTL = 900; // 15 นาที — เทรนด์เดิมกดซ้ำไม่ต้องยิงใหม่
const MAX_ITEMS = 8;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  if (!q) return json({ q: "", articles: [], error: "missing q" }, 400);

  const cache = caches.default;
  const key = new Request(url.origin + "/api/trend/xnews?q=" + encodeURIComponent(q), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return browserCopy(hit);

  // ตัด # ออกก่อนค้น — ค้นด้วย "#abc" ได้ผลน้อยกว่า "abc" มาก
  const term = q.replace(/^#/, "").replace(/[_]/g, " ");
  const src = `https://www.bing.com/news/search?q=${encodeURIComponent(term)}&format=RSS&setmkt=th-TH`;

  try {
    const xml = await fetchText(src);
    const items = parseGeneric(xml, "news")
      .slice(0, MAX_ITEMS)
      .map((it) => ({
        title: it.title,
        link: unwrapBing(it.link),
        source: hostLabel(unwrapBing(it.link)),
        publishedAt: it.publishedAt || null,
      }));
    const body = json({ q, term, count: items.length, articles: items }, 200, EDGE_TTL);
    context.waitUntil(cache.put(key, body.clone()));
    return browserCopy(body);
  } catch (e) {
    return browserCopy(json({ q, articles: [], error: String((e && e.message) || e).slice(0, 120) }, 200, 120));
  }
}

async function fetchText(target) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(target, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml,application/xml,text/xml",
        "Accept-Language": "th,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error("http " + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Bing ห่อลิงก์เป็น bing.com/news/apiclick.aspx?...&url=<ของจริง> → แกะออก
function unwrapBing(link) {
  try {
    const u = new URL(link);
    if (u.hostname.includes("bing.com")) {
      const real = u.searchParams.get("url");
      if (real) return real;
    }
  } catch {}
  return link;
}
function hostLabel(link) {
  try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return ""; }
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
