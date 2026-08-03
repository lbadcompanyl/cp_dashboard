// Cloudflare Pages Function: GET /api/feeds
// ตัวกลางฝั่งเซิร์ฟเวอร์ — ดึง+แปลง RSS ทุกฟีด, ส่ง JSON (แก้ปัญหา CORS)
// ใช้ stale-while-revalidate: ส่งของใน cache ทันที (เร็ว) แล้วดึงของใหม่เบื้องหลัง

import feeds from "../../../trend-feeds.config.js";
import { parseGeneric, parseTrends } from "./_lib/parser.js";

const EDGE_TTL = 3600; // เก็บใน edge cache นานพอสำหรับ SWR (~1 ชม.)
const FRESH_MS = 5 * 60 * 1000; // ถ้าของใน cache เก่ากว่านี้ (5 นาที) → รีเฟรชเบื้องหลัง
const FETCH_TIMEOUT = 12000; // ms (เผื่อ cold start)
const CACHE_VER = "18"; // bump: noise filter (shopping/daily-report/gallery) ในคอลัมน์ alert

export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request(
    new URL(context.request.url).origin + "/api/trend/feeds?v=" + CACHE_VER,
    { method: "GET" }
  );

  const params = new URL(context.request.url).searchParams;
  const wantRebuild = params.has("rebuild") || params.has("errors"); // ?errors บังคับ build+verify เพื่อให้เห็น dropped

  let resp;
  if (wantRebuild) {
    // ?rebuild/?errors = build สดพร้อม verify ทันที (ทดสอบตัวกรอง related-block · เลี่ยงรอ background 5 นาที)
    resp = await buildAndStore(cache, cacheKey, true);
  } else {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const age = Date.now() - Number(hit.headers.get("x-cached-at") || 0);
      // ของเริ่มเก่า → ดึงใหม่เบื้องหลัง (ผู้ใช้ไม่ต้องรอ) · เปิด verify เฉพาะรอบนี้
      if (age > FRESH_MS) context.waitUntil(buildAndStore(cache, cacheKey, true));
      resp = hit; // ส่งของใน cache ทันที — เร็วเสมอ
    } else {
      // ไม่มีใน cache (ครั้งแรกสุด) → ดึงสด · ไม่ verify (กันคำขอแรกหน่วง)
      resp = await buildAndStore(cache, cacheKey, false);
    }
  }

  // มุมมองอ่านง่าย — เปิด /api/trend/feeds?errors (โชว์ฟีดพัง + รายการข่าวที่ตัด)
  if (params.has("errors")) {
    let txt;
    try {
      const j = JSON.parse(await resp.clone().text());
      const s = j.sources || {};
      const v = j.alertVerify || {};
      txt =
        `feeds ที่โหลดไม่ได้: ${(j.errors || []).length}\n` +
        `จำนวนข่าว: news=${(s.news?.items || []).length}  CP=${(s.alert1?.items || []).length}  จับตามอง=${(s.alert2?.items || []).length}\n` +
        `ตัด related-block (keyword ไม่อยู่ในเนื้อจริง): alert1=${v.alert1 ?? "-"}  alert2=${v.alert2 ?? "-"}\n` +
        ((v.dropped || []).length
          ? (v.dropped || []).map((d) => `   ✂ [${d.src}${d.why ? "/" + d.why : ""}]${d.terms?.length ? " (" + d.terms.join(",") + ")" : ""} ${d.title}\n      ${d.link}`).join("\n") + "\n"
          : "") +
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

  // ตัด related-block: พาดหัว (ฟรี) + เนื้อข่าวจริง articleBody เฉพาะ background (allowVerify) · ก่อน stale-fill กันสะสม noise
  const alertVerify = {};
  try { await verifyAlertItems(cache, sources, alertVerify, allowVerify); } catch (e) { alertVerify.err = String((e && e.message) || e).slice(0, 120); }

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

// ---------- Noise filter: ตัด "โฆษณา/ขายของ" และ "รายงานประจำวัน" ที่ match keyword แต่ไม่ใช่ข่าวน่าจับตา ----------
// โดเมนร้านค้า/มาร์เก็ตเพลส/เว็บ affiliate — เนื้อหาเป็นสินค้าไม่ใช่ข่าว
const SHOP_HOSTS = [
  "thaisuperphone", "shopee.", "lazada.", "kaidee.", "thaisecondhand", "weloveshopping", "priceza",
  "lnwshop", "tarad.com", "aliexpress", "amazon.", "bananastore", "advice.co.th", "jib.co.th",
  "powerbuy", "mercular", "itopplus", "bentoweb", "makewebeasy", "pantipmarket", "chilindo", "nocnoc",
];
// วลีเชิงพาณิชย์ในพาดหัว/สนิปเป็ต (คัดเฉพาะสัญญาณแรง เลี่ยงคำข่าว เช่น "วางจำหน่าย/เปิดตัว")
const SHOP_RE =
  /โปรโมชั่น|โปรโมชัน|ลดราคา|ราคาพิเศษ|ราคาถูก|สั่งซื้อ|สั่งเลย|ซื้อเลย|ช้อปเลย|ส่งฟรี|พร้อมส่ง|ของแท้ราคา|สินค้าขายดี|shop now|buy now|order now|for sale|free shipping|best price|add to cart|with our |protect yourself/i;
// รายงาน/พยากรณ์รายวันที่วนซ้ำ — routine ไม่ใช่ข่าวเด่น (ระวัง "โรคประจำตัว" ต้องไม่โดน = จับ "ประจำวัน" ตรง ๆ)
const DAILY_RE =
  /ประจำวัน|พยากรณ์อากาศ|รายงานสถานการณ์ฝุ่น|รายงานค่าฝุ่น|รายงานคุณภาพอากาศ|สรุปสภาพอากาศ|ค่าฝุ่นละออง[\s\S]{0,12}วันที่/;
// หน้าแกลเลอรี/ดูรูป — match keyword จาก caption รูป ไม่ใช่บทความข่าว (เช่น .../Gallery/viewpic2d.php)
const GALLERY_RE = /\/gallery\/|viewpic|gallery\.php|\/album\/|\/photos?\/|\/pic\/|viewimage|showpic/i;

function hostOf(link) {
  try { return new URL(link).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}
// คืนเหตุผลถ้าเป็น noise (shopping/daily/gallery) มิฉะนั้น null — ใช้ title+snippet ที่ถอด marker hl แล้ว
function noiseReason(it, title) {
  const link = it.link || "";
  if (GALLERY_RE.test(link)) return "gallery";
  const snip = (it.snippet || "").replace(/\[\[\/?hl\]\]/g, "").toLowerCase();
  const text = title + " " + snip;
  if (DAILY_RE.test(text)) return "daily";
  const host = hostOf(link);
  if (host && SHOP_HOSTS.some((h) => host.includes(h))) return "shopping";
  if (SHOP_RE.test(text)) return "shopping";
  return null;
}
// ตระกูลแบรนด์ในเครือ CP — บทความ CP มักเรียกตัวเองด้วยชื่อลูก (CPF/เซเว่น/แม็คโคร) ไม่ใช่คำว่า "ซีพี" ตรง ๆ
// ใช้ตอน verify คอลัมน์ alert1: ถ้า meta มีชื่อในเครือ = ข่าว CP จริง แม้ Google จะไฮไลต์ "ซีพี" จาก related block
const CP_BRANDS = [
  "ซีพี", "cp all", "cpall", "cpf", "ซีพีเอฟ", "ซีพี ออลล์", "ซีพีแรม", "cpram", "cp axtra", "แอ็กซ์ตร้า",
  "cp group", "cp foods", "cp land", "cp brand", "cp fresh", "cp meiji", "cp-meiji", "cp intertrade",
  "เจริญโภคภัณฑ์", "charoen pokphand", "pokphand", "เจียรวนนท์",
  "เซเว่น", "7-eleven", "7 eleven", "seven eleven", "7-11", "7 11", "แม็คโคร", "makro", "โลตัส", "lotus's",
];
// คำ match ที่ "อ่อนเกิน" — bare "cp" อังกฤษ โผล่ในใบเซอร์/OCR มั่ว/Canadian Pacific/cpu ฯลฯ → ไม่นับเป็นสัญญาณ ต้องพิสูจน์ด้วยชื่อเต็ม
const WEAK_TERMS = new Set(["cp", "cd", "cpi", "cpu"]);
// คำที่ Google ไฮไลต์ (= คำที่ match) จาก marker [[hl]]…[[/hl]] ใน title+snippet
function highlightedTerms(it) {
  const s = (it.title || "") + " " + (it.snippet || "");
  const out = new Set(); let m;
  const re = /\[\[hl\]\]([\s\S]*?)\[\[\/hl\]\]/g;
  while ((m = re.exec(s))) { const w = m[1].replace(/\[\[\/?hl\]\]/g, "").trim().toLowerCase(); if (w.length >= 2) out.add(w); }
  return [...out];
}
// "เนื้อข่าวจริง" จาก JSON-LD articleBody/description ที่สำนักข่าวประกาศไว้ — เป็น prose ของบทความล้วน (related/หุ้นแนะนำ ไม่อยู่ในนี้)
function articleBodyText(html) {
  const out = [];
  const blocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const b of blocks) {
    const jsonStr = b.replace(/^[\s\S]*?<script[^>]*>/i, "").replace(/<\/script>\s*$/i, "");
    let parsed; try { parsed = JSON.parse(jsonStr); } catch { continue; }
    const nodes = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed]);
    for (const n of nodes) {
      if (n && typeof n.articleBody === "string" && n.articleBody.length > 20) out.push(n.articleBody);
      else if (n && typeof n.description === "string" && n.description.length > 20) out.push(n.description);
    }
  }
  return out.join("  ").replace(/<[^>]+>/g, " ").toLowerCase();
}
async function bodyHasKeep(cache, link, keep) {
  if (!keep || !keep.length) return false;
  const vkey = new Request("https://verify.local/trend4?u=" + encodeURIComponent(link), { method: "GET" });
  let body = null;
  try { const hit = await cache.match(vkey); if (hit) body = (await hit.json()).b || ""; } catch {}
  if (body === null) {
    body = "";
    try {
      const res = await fetchWithTimeout(link, 6000);
      if (res.ok && /html/i.test(res.headers.get("content-type") || "")) {
        let html = await res.text();
        if (html.length > 400000) html = html.slice(0, 400000);
        body = articleBodyText(html).slice(0, 20000);
      }
    } catch { body = ""; }
    try { await cache.put(vkey, new Response(JSON.stringify({ b: body }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=86400" } })); } catch {}
  }
  return !!body && keep.some((t) => body.includes(t));
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
// ตัด related-block 3 ชั้น: (1) พาดหัวมีคำ match/keep → เก็บฟรี (2) roundup → ตัดฟรี (3) พาดหัวไม่มี → อ่านเนื้อข่าวจริง (articleBody ไม่รวม related)
// ชั้น 3 fetch เฉพาะ background (allowFetch)
async function verifyAlertItems(cache, sources, diag, allowFetch) {
  diag.dropped = []; // รายการข่าวที่ถูกตัด (ไว้ debug ผ่าน ?errors)
  for (const src of ["alert1", "alert2"]) {
    if (!sources[src]) continue;
    const items = sources[src].items;
    const extra = src === "alert1" ? CP_BRANDS : []; // คอลัมน์ CP → ยอมรับชื่อในเครือด้วย
    const verdict = items.map((it) => {
      const bare = (it.title || "").replace(/\[\[\/?hl\]\]/g, "");
      const title = bare.toLowerCase();
      const noise = noiseReason(it, title); // ตัดโฆษณา/รายงานประจำวัน/หน้าแกลเลอรี ก่อนเช็ค related-block
      if (noise) return { ok: false, why: noise, terms: [], bare, link: it.link };
      if (ROUNDUP_RE.test(title)) return { ok: false, why: "roundup", terms: [], bare, link: it.link };
      const terms = highlightedTerms(it).filter((t) => !WEAK_TERMS.has(t)); // ตัดคำ match ที่อ่อนเกิน (bare cp) ทิ้ง
      if (terms.some((t) => title.includes(t)) || extra.some((t) => title.includes(t))) return { ok: true }; // ชั้น 1
      return { ok: "body", why: "ไม่อยู่ในพาดหัว/เนื้อ", terms, bare, link: it.link };
    });
    const needBody = [];
    verdict.forEach((v, i) => { if (v.ok === "body") needBody.push(i); });
    if (allowFetch && needBody.length) {
      const hits = await mapPoolResults(needBody, 6, (i) => bodyHasKeep(cache, items[i].link, extra));
      needBody.forEach((i, k) => { verdict[i].ok = hits[k] === true; });
    } else {
      needBody.forEach((i) => { verdict[i].ok = false; });
    }
    const kept = [];
    verdict.forEach((v, i) => {
      if (v.ok === true) kept.push(items[i]);
      else diag.dropped.push({ src, why: v.why, terms: v.terms || [], title: v.bare, link: v.link });
    });
    diag[src] = items.length - kept.length;
    sources[src].items = kept;
  }
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
