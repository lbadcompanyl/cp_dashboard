// GET /api/sd/news?q=<คำในกลุ่ม join ด้วย OR>&geo=TH
// ข่าวที่เกี่ยวข้องของกลุ่มคำใน SD dashboard — ค้น "ทีละ keyword" แล้ว merge (แก้ CORS ฝั่ง server)
// Bing News RSS ไม่รองรับ operator OR → ต้องยิงทีละคำแล้วรวม (ตัดซ้ำ+เรียงใหม่ล่าสุด)
// Google News fallback ต่อคำ (Google มักบล็อก IP datacenter ด้วย 503)
// คืน JSON { q, geo, articles:[{title,link,sourceLabel,publishedAt}], provider, diag }

import { parseGeneric } from "../trend/_lib/parser.js";
import { startLog, finishLog, resetLog } from "../_lib/syslog.js";

const FETCH_TIMEOUT = 12000;
const EDGE_TTL = 1800;   // cache 30 นาที ที่ edge
const MAX_ARTICLES = 14; // จำนวนข่าวหลัง merge
const MAX_TERMS = 4;     // ยิงมากสุดกี่คำต่อกลุ่ม (กัน request บานปลาย)
const CACHE_VER = "11"; // bump: แนบ snippet ให้ Issue dashboard

const MKT = { "": "en-US", TH: "th-TH", US: "en-US", SG: "en-SG", GB: "en-GB" };
const HLGL = { "": ["en", "US"], TH: ["th", "TH"], US: ["en", "US"], SG: ["en", "SG"], GB: ["en", "GB"] };

const bingUrl = (term, geo) =>
  `https://www.bing.com/news/search?q=${encodeURIComponent(term)}&format=RSS&setmkt=${MKT[geo] || MKT[""]}`;
const googleUrl = (term, geo) => {
  const [hl, gl] = HLGL[geo] || HLGL[""];
  return `https://news.google.com/rss/search?q=${encodeURIComponent(term)}&hl=${hl}&gl=${gl}&ceid=${gl}:${hl}`;
};

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const geo = (url.searchParams.get("geo") || "").toUpperCase().slice(0, 2);
  if (!q) return json({ q, articles: [], error: "missing q" });

  const cache = caches.default;
  const key = new Request(url.origin + `/api/sd/news?v=${CACHE_VER}&q=${encodeURIComponent(q)}&geo=${geo}`, { method: "GET" });
  const hit = await cache.match(key);
  // ⚠️ cache hit ต้องออกก่อนถึงบรรทัด log — ไม่งั้นทุกคนที่เปิดหน้าเว็บกินโควตา KV คนละครั้ง
  if (hit) return browserCopy(hit);

  // บันทึกระบบ — คำค้นมีได้ไม่จำกัด cache key จึงแตกเยอะมาก
  // **ห้ามบันทึกทุก build** บันทึกเฉพาะตอนต้นทางล่มหรือหาข่าวไม่เจอเลย
  resetLog();
  const L = startLog("sd/news");

  // แยกคำในกลุ่มกลับจาก "a OR \"b c\" OR d" → ["a","b c","d"]
  const terms = q.split(/\s+OR\s+/i).map((t) => t.replace(/^"|"$/g, "").trim()).filter(Boolean).slice(0, MAX_TERMS);
  const diag = [];
  let provider = "bing";

  // ยิง Bing ทีละคำพร้อมกัน แล้ว merge
  let pool = (await Promise.all(terms.map((term) => fetchTerm(bingUrl(term, geo), term, "bing", diag)))).flat();

  // ถ้า Bing ว่างหมด (โดนบล็อก/ตลาดไม่มีข่าว) → ลอง Google ทีละคำ
  if (pool.length === 0) {
    provider = "google";
    pool = (await Promise.all(terms.map((term) => fetchTerm(googleUrl(term, geo), term, "google", diag)))).flat();
  }

  // ตัดซ้ำตามลิงก์ + เรียงใหม่ล่าสุดก่อน + ตัดจำนวน
  const seen = new Set();
  const articles = pool
    .filter((a) => a.link && !seen.has(a.link) && seen.add(a.link))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, MAX_ARTICLES);

  // ฟีดไม่แนบรูป → ดึง og:image รายบทความ (เฉพาะที่จะโชว์จริง) แบบ parallel
  await enrichImages(articles);
  diag.push({ imgFilled: articles.filter((a) => a.image).length, of: articles.length });

  const body = json({ q, geo, articles, provider, diag }, articles.length ? EDGE_TTL : 0);
  if (articles.length) context.waitUntil(cache.put(key, body.clone()));

  L.cache = "miss";
  L.count("articles", articles.length);
  for (const d of diag) if (d && d.err) L.fail(d.provider || d.term || "?", d.err);
  if (provider !== "bing") L.warn("Bing ไม่ได้ข่าวเลย — ตกไปใช้ Google");
  else if (!articles.length) L.warn("ไม่ได้ข่าวเลยทั้งสองต้นทาง: " + q.slice(0, 60));
  context.waitUntil(finishLog(context.env, L));
  return browserCopy(body);
}

async function fetchTerm(u, term, name, diag) {
  try {
    const res = await fetchWithTimeout(u, FETCH_TIMEOUT);
    const xml = await res.text();
    const rawItems = (xml.match(/<item\b/g) || []).length;
    if (!res.ok || rawItems === 0) { diag.push({ term, name, http: res.status, rawItems }); return []; }
    const arts = mapArticles(xml);
    diag.push({ term, name, http: res.status, rawItems, imgs: arts.filter((a) => a.image).length });
    return arts;
  } catch (e) {
    diag.push({ term, name, err: String((e && e.message) || e).slice(0, 60) });
    return [];
  }
}

function mapArticles(xml) {
  const imgByLink = imageMap(xml); // รูป thumbnail จากฟีด (Bing แนบมา) แมปตาม <link> ดิบ
  return parseGeneric(xml, "news")
    .map((it) => {
      let title = it.title, sourceLabel = "";
      const i = title.lastIndexOf(" - "); // Google News: "หัวข้อ - สำนักข่าว"
      if (i > 0) { sourceLabel = title.slice(i + 3).trim(); title = title.slice(0, i).trim(); }
      const image = imgByLink[it.link] || "";
      const link = unwrapLink(it.link);
      if (!sourceLabel) sourceLabel = hostLabel(link); // Bing: ไม่มีชื่อใน title → ใช้โดเมน
      return { title, link, sourceLabel, image, snippet: (it.snippet || "").slice(0, 220), publishedAt: it.publishedAt };
    })
    .filter((a) => a.title && a.link);
}

// ดึง og:image รายบทความ (ฟีด news ส่วนใหญ่ไม่มีรูปใน RSS) — parallel + timeout สั้น, พังก็ปล่อยว่าง
async function enrichImages(articles) {
  await Promise.all(
    articles.map(async (a) => {
      if (a.image) return;
      try {
        const res = await fetchWithTimeout(a.link, 7000);
        if (!res.ok) return;
        if (!/html/i.test(res.headers.get("content-type") || "")) return;
        let html = await res.text();
        if (html.length > 220000) html = html.slice(0, 220000); // og:image อยู่ใน <head> ตอนต้น
        a.image = ogImage(html);
      } catch { /* ปล่อยว่าง → client โชว์กล่องตัวอักษรแทน */ }
    })
  );
}
function ogImage(html) {
  const pats = [
    /<meta[^>]+(?:property|name)=["']og:image(?::url|:secure_url)?["'][^>]*\scontent=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image(?::url|:secure_url)?["']/i,
    /<meta[^>]+(?:property|name)=["']twitter:image(?::src)?["'][^>]*\scontent=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']twitter:image(?::src)?["']/i,
    /<link[^>]+rel=["']image_src["'][^>]*\shref=["']([^"']+)["']/i,
    /"image"\s*:\s*(?:\{[^{}]*?"url"\s*:\s*)?["'](https?:\/\/[^"']+?\.(?:jpe?g|png|webp|avif)[^"']*)["']/i, // JSON-LD
  ];
  for (const p of pats) {
    const m = html.match(p);
    if (m && /^https?:\/\//i.test(m[1])) return dec(m[1]).trim();
  }
  return "";
}

// แกะ URL รูปจากแต่ละ <item> แมปตาม <link> ดิบ (ก่อน unwrap) — รองรับหลายรูปแบบฟีด
function imageMap(xml) {
  const map = {};
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const b of items) {
    const lm = b.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
    const link = lm ? dec(lm[1]).trim() : "";
    if (!link) continue;
    const img = imgFromBlock(b);
    if (img) map[link] = img;
  }
  return map;
}
function imgFromBlock(b) {
  let m =
    b.match(/<[a-z]*:?Image[^>]*>[\s\S]*?<[a-z]*:?Url[^>]*>([\s\S]*?)<\/[a-z]*:?Url>/i) ||  // Bing <News:Image><News:Url>
    b.match(/<media:(?:thumbnail|content)[^>]*\burl="([^"]+)"/i) ||                          // media:thumbnail/content
    b.match(/<enclosure[^>]*\burl="([^"]+)"[^>]*type="image/i) ||
    b.match(/<enclosure[^>]*type="image[^>]*\burl="([^"]+)"/i) ||
    b.match(/<image>\s*(?:<url>)?([\s\S]*?)(?:<\/url>)?\s*<\/image>/i);
  const u = m ? dec(m[1]).trim() : "";
  return /^https?:\/\//i.test(u) ? u : "";
}
function dec(s = "") {
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  let prev; // decode จนสุด (บางเว็บ encode &amp; ซ้อนหลายชั้นใน URL รูป → กัน client escape เป๊ะเกินจนรูปพัง)
  do { prev = s; s = s.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#0*39;/g, "'"); } while (s !== prev);
  return s;
}

// Bing ห่อลิงก์เป็น bing.com/news/apiclick.aspx?...&url=<ของจริง> → แกะออก
function unwrapLink(link) {
  try {
    const u = new URL(link);
    if (u.hostname.includes("bing.com")) { const real = u.searchParams.get("url"); if (real) return real; }
  } catch {}
  return link;
}
function hostLabel(link) {
  try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return ""; }
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
