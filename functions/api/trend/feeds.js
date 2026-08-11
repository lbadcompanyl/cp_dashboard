// Cloudflare Pages Function: GET /api/feeds
// ตัวกลางฝั่งเซิร์ฟเวอร์ — ดึง+แปลง RSS ทุกฟีด, ส่ง JSON (แก้ปัญหา CORS)
// ใช้ stale-while-revalidate: ส่งของใน cache ทันที (เร็ว) แล้วดึงของใหม่เบื้องหลัง

import feeds from "../../../trend-feeds.config.js";
import { parseGeneric, parseTrends, unwrapRedirect } from "./_lib/parser.js";
import { readAllow, allowKey } from "../allow.js";

const EDGE_TTL = 3600; // เก็บใน edge cache นานพอสำหรับ SWR (~1 ชม.)
const FRESH_MS = 3 * 60 * 1000; // ถ้าของใน cache เก่ากว่านี้ (3 นาที) → รีเฟรชเบื้องหลัง
const FETCH_TIMEOUT = 12000; // ms (เผื่อ cold start)
const AI_MODEL_CAT = "@cf/meta/llama-3.2-3b-instruct"; // โมเดลเดียวกับที่หน้า IR ใช้
const CACHE_VER = "60"; // bump: เว็บแจกข่าว PR ตัดเฉพาะใบที่ไม่มีชื่อเครือ CP ในพาดหัว

// เก็บสะสม alert ลง Cloudflare KV เพื่อไม่ให้หลุดตามหน้าต่างฟีด Google Alert (เหมือนหน้า IR)
// key แยกจาก IR (pr:archive ≠ ir:archive) จะได้ไม่ทับกัน
const ARCHIVE_KEY = "pr:archive";
// days = เก็บไว้ใน KV นานแค่ไหน · show = ส่งให้หน้าเว็บกี่รายการ
//
// ⚠️ สองค่านี้ต้องแยกกัน — ถ้าส่งทั้งคลัง 90 วันไปให้เบราว์เซอร์ทุกครั้ง
// payload จะโตเป็นหลาย MB และถ่วงการโหลดแดชบอร์ดโดยไม่มีใครได้ใช้
// หน้าเว็บดูของล่าสุดเท่านั้น ส่วนของเก่าเอาไว้ export (ดู /api/trend/archive)
const ARCHIVE_CFG = {
  alert1: { days: 90, max: 3000, show: 300 }, // CP
  alert2: { days: 90, max: 3000, show: 400 }, // หัวข้อที่จับตามอง
};
const envPrefix = (env) => (env && env.APP_ENV ? String(env.APP_ENV) + ":" : "");

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
    resp = await buildAndStore(cache, cacheKey, true, context.env);
  } else {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const age = Date.now() - Number(hit.headers.get("x-cached-at") || 0);
      // ของเริ่มเก่า → ดึงใหม่เบื้องหลัง (ผู้ใช้ไม่ต้องรอ) · เปิด verify เฉพาะรอบนี้
      if (age > FRESH_MS) context.waitUntil(buildAndStore(cache, cacheKey, true, context.env));
      resp = hit; // ส่งของใน cache ทันที — เร็วเสมอ
    } else {
      // ไม่มีใน cache (ครั้งแรกสุด) → ดึงสด · ไม่ verify (กันคำขอแรกหน่วง)
      resp = await buildAndStore(cache, cacheKey, false, context.env);
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
        `คลังเก็บสะสม (KV — CP/จับตามอง 10 วัน): ${JSON.stringify(j.archive || {})}\n` +
        `ตัด related-block (keyword ไม่อยู่ในเนื้อจริง): alert1=${v.alert1 ?? "-"}  alert2=${v.alert2 ?? "-"}\n` +
        ((v.dropped || []).length
          ? (v.dropped || []).map((d) => `   ✂ [${d.src}${d.why ? "/" + d.why : ""}]${d.terms?.length ? " (" + d.terms.join(",") + ")" : ""} ${d.title}\n      ${d.link}`).join("\n") + "\n"
          : "") +
        `ตัดข่าว merge ที่ไม่ match keyword ปัจจุบัน (prune): alert1=${(j.pruned?.alert1 || []).length}  alert2=${(j.pruned?.alert2 || []).length}\n` +
        (["alert1", "alert2"].flatMap((s2) => (j.pruned?.[s2] || []).map((d) => `   ✂ [${s2}/prune] ${d.title}\n      ${d.link}`)).join("\n") + "\n").replace(/^\n$/, "") +
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

// ---------- ไฮบริด: บวกข่าว Google News ที่ match keyword เข้าคอลัมน์ alert (dedup ด้วย link ที่ normalize) ----------
function normLink(url) {
  try { const u = new URL(url); return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, ""); }
  catch { return url || ""; }
}
// map โดเมน → ชื่อสำนักข่าว (จาก feed config); ไม่รู้จัก → ใช้โดเมน
const OUTLET_BY_HOST = {};
for (const _f of feeds) { try { const _h = new URL(_f.url).hostname.replace(/^www\./, ""); if (!_h.includes("bing.com") && !OUTLET_BY_HOST[_h]) OUTLET_BY_HOST[_h] = _f.label; } catch {} }
// query ตัวเต็มที่เขียนไว้ใน config (ถ้ามี) — ใช้แทน <title> ของฟีดเมื่อ Google ตัดให้สั้น
const CONFIG_Q = {};
for (const _f of feeds) if (_f.query) (CONFIG_Q[_f.source] = CONFIG_Q[_f.source] || []).push(_f.query);
// คำเพิ่มที่ไม่ได้อยู่ใน Google Alerts — ใช้ดึงข่าวจากคอลัมน์ News เข้าคอลัมน์ alert เท่านั้น
// (ช่อง query ของ Google Alerts มีเพดานความยาว ใส่เพิ่มไม่ได้แล้ว — ดู trend-feeds.config.js)
const CONFIG_EXTRA = {};
for (const _f of feeds) for (const _t of (_f.extraTerms || [])) {
  (CONFIG_EXTRA[_f.source] = CONFIG_EXTRA[_f.source] || []).push(String(_t).toLowerCase());
}
function outletOf(link) {
  try { const h = new URL(link).hostname.replace(/^www\./, ""); return h.includes("google.") ? "" : (OUTLET_BY_HOST[h] || h); } catch { return ""; }
}
// ครอบคำที่ match ด้วย marker [[hl]] ให้ frontend ไฮไลต์ (เหมือน <b> ของ Google Alert)
function hlWrap(text, term) {
  if (!text || !term) return text || "";
  // termPattern: คำอังกฤษต้องตรงทั้งคำ ไม่งั้นจะไปไฮไลต์ "slapp" กลางคำ "slapped"
  const re = new RegExp(termPattern(term), "gi");
  return text.replace(re, (m) => `[[hl]]${m}[[/hl]]`);
}
// ไฮไลต์ทุก term ที่ตามอยู่ในข้อความเดียว: ลบ marker เดิม (ของ Google หรือรอบก่อน) แล้วครอบใหม่ทีเดียว
// longest-first + regex เดียว → ไม่ครอบซ้อนกัน (เช่น "ซีพี" ใน "ซีพีเอฟ")
function hlAll(text, terms) {
  if (!text) return text || "";
  const stripped = text.replace(/\[\[\/?hl\]\]/g, "");
  const esc = [...new Set(terms.filter(Boolean).map((t) => String(t)))]
    .sort((a, b) => b.length - a.length)
    .map(termPattern);
  if (!esc.length) return stripped;
  const re = new RegExp("(" + esc.join("|") + ")", "gi");
  return stripped.replace(re, (m) => `[[hl]]${m}[[/hl]]`);
}
// ตัดข่าวที่ "merge เข้ามา" (fromNews) ซึ่งไม่ match term ปัจจุบันแล้ว — เช่นเคยเพิ่ม brand แล้วเอาออก
// ข่าว native/alert เดิมไม่แตะ (Google Alert อาจ match เชิงความหมายโดยไม่มีคำตรงๆ)
function pruneStaleMerged(sources, alertSrc, terms) {
  const s = sources[alertSrc];
  const cut = []; // รายการที่ตัด (โชว์ใน ?errors)
  if (!s || !terms || !terms.length) return cut;
  // ต้องใช้เกณฑ์เดียวกับ mergeNewsIntoAlert เป๊ะ ไม่งั้นจะดึงเข้ามาแล้วลบทิ้งสลับกันทุกรอบ
  const matchers = buildMatchers(terms);
  s.items = s.items.filter((it) => {
    if (!it.fromNews) return true;
    const hay = ((it.title || "") + " " + (it.snippet || "")).toLowerCase().replace(/\[\[\/?hl\]\]/g, "");
    if (anyTermIn(hay, matchers)) return true;
    if (cut.length < 40) cut.push({ title: (it.title || "").replace(/\[\[\/?hl\]\]/g, ""), link: it.link });
    return false;
  });
  return cut;
}
// ---------- ยุบข่าวซ้ำ (เรื่องเดียวกันหลายสำนัก) ----------
// เทียบพาดหัวด้วย bigram Jaccard: เรื่องเดียวกันต่างสำนัก ~0.3-0.7 · คนละเรื่องแม้หัวข้อเดียวกัน <0.2 (วัดจากตัวอย่างจริง)
function dupKeyText(t) {
  return String(t || "").replace(/\[\[\/?hl\]\]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
function dupBigrams(s) { const o = new Set(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o; }
function dupSim(a, b) { if (!a.size || !b.size) return 0; let n = 0; for (const g of a) if (b.has(g)) n++; return n / (a.size + b.size - n); }
// ใบแรก (ใหม่สุด) เป็นตัวแทน · ใบซ้ำยุบเป็น it.also = [{label, link}] ให้ frontend โชว์ "อ่านจากสำนักอื่น"
// เงื่อนไข: พาดหัวยาวพอ (กัน false-positive หัวข้อสั้น) + เผยแพร่ห่างกัน <72 ชม. (กันคนละเหตุการณ์หัวข้อคล้าย)
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
// ไฮไลต์ทุก item ในคอลัมน์ alert (ทั้งข่าว native + ที่ merge เข้ามา + ที่ค้างใน KV) ให้สม่ำเสมอ
function highlightAlertItems(sources, alertSrc, terms) {
  const s = sources[alertSrc];
  if (!s || !terms || !terms.length) return;
  // กันไฮไลต์ "ซีพี" ที่ซ่อนอยู่ในชื่อลวง (บีแอลซีพี) — พักไว้เป็น token ก่อน แล้วคืนหลังไฮไลต์
  const mask = (t) => { const keep = []; const masked = String(t || "").replace(CP_FALSE_RE, (m) => { keep.push(m); return "\u0001" + (keep.length - 1) + "\u0002"; }); return [masked, keep]; };
  const unmask = (t, keep) => String(t || "").replace(/\u0001(\d+)\u0002/g, (_, i) => keep[+i] || "");
  for (const it of s.items) {
    const [mt, kt] = mask(it.title); it.title = unmask(hlAll(mt, terms), kt);
    const [ms, ks] = mask(it.snippet); it.snippet = unmask(hlAll(ms, terms), ks);
  }
}
// คำที่ Google Alert สั่ง "ไม่เอา" — `-shopee`, `-"ทำนายฝัน"` (ต้องมีช่องว่างนำ ไม่งั้น e-commerce จะโดนด้วย)
const EXCLUDE_RE = /(?:^|\s)-\s*(?:"([^"]*)"|(\S+))/g;
// แตกคำจาก query ของ Google Alert เช่น '"PM2.5" OR ฝุ่น' -> ["pm2.5","ฝุ่น"]
//
// ⚠️ ต้องถอดคำ `-ไม่เอา` ทิ้งก่อนแยกด้วย OR — มันอยู่ท้าย query ต่อจากคำสุดท้าย
// ถ้าไม่ถอด คำสุดท้ายจะกลายเป็น 'wastewater discharge -linkedin -jobdb …' ก้อนเดียว
// ซึ่งไม่มีวัน match อะไรเลย = เสียคำสุดท้ายไปเงียบๆ
function parseAlertTerms(queries) {
  const out = new Set();
  for (const q of (queries || [])) {
    const positive = String(q).replace(EXCLUDE_RE, " ");
    for (const part of positive.split(/\bOR\b/i)) {
      const t = part.replace(/["'()]/g, "").trim().toLowerCase();
      if (t.length >= 2 && !t.startsWith("-")) out.add(t);
    }
  }
  return [...out];
}
// คำที่สั่งไม่เอา -> ["linkedin","ทำนายฝัน",…] ใช้กรองข่าวที่จะดึงเข้าคอลัมน์ alert
function parseAlertExcludes(queries) {
  const out = new Set();
  for (const q of (queries || [])) {
    EXCLUDE_RE.lastIndex = 0; // regex มี /g — ต้องรีเซ็ตเอง ไม่งั้นรอบถัดไปเริ่มกลางสตริง
    let m;
    while ((m = EXCLUDE_RE.exec(String(q)))) {
      const t = (m[1] || m[2] || "").replace(/["'()]/g, "").trim().toLowerCase();
      if (t.length >= 2) out.add(t);
    }
  }
  return [...out];
}
// ---------- เทียบคำ ----------
// ภาษาไทยไม่มีช่องว่างคั่นคำ จะเทียบแบบ substring เท่านั้น
// แต่คำอังกฤษต้องตรงทั้งคำ ไม่งั้น "SLAPP" (คดีฟ้องปิดปาก) จะไปจับ "slapped" ในพาดหัวอังกฤษ
// ซึ่งเจอบ่อยมาก (slapped with a fine / slapped tariffs) — คอลัมน์จะเต็มไปด้วยข่าวที่ไม่เกี่ยว
const LATIN_TERM = /^[\x20-\x7e]+$/;
function termPattern(t) {
  const esc = String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return LATIN_TERM.test(t) ? "(?<![a-z0-9])" + esc + "(?![a-z0-9])" : esc;
}
function anyTermIn(hay, matchers) {
  for (const m of matchers) if (m.test(hay)) return m.term;
  return null;
}
function buildMatchers(terms) {
  return (terms || []).filter(Boolean).map((t) => {
    const re = new RegExp(termPattern(t), "i");
    return { term: String(t).toLowerCase(), test: (hay) => re.test(hay) };
  });
}
// เอาข่าวจาก newsKeys ที่ (title+snippet) มี term -> เพิ่มเข้า alertSrc ถ้ายังไม่ซ้ำ (ตาม normLink)
// excludes = คำที่ Google Alert สั่งไม่เอา — ข่าวที่ติดคำพวกนี้จะไม่ถูกดึงเข้ามา
function mergeNewsIntoAlert(sources, alertSrc, newsKeys, terms, excludes) {
  if (!sources[alertSrc] || !terms.length) return 0;
  const matchers = buildMatchers(terms);
  const blockers = buildMatchers(excludes);
  const have = new Set(sources[alertSrc].items.map((it) => normLink(it.link)));
  let added = 0;
  for (const nk of newsKeys) for (const it of (sources[nk]?.items || [])) {
    const hay = ((it.title || "") + " " + (it.snippet || "")).toLowerCase();
    const matched = anyTermIn(hay, matchers);
    if (!matched) continue;
    if (anyTermIn(hay, blockers)) continue;
    const nl = normLink(it.link);
    if (have.has(nl)) continue;
    have.add(nl);
    sources[alertSrc].items.push({ ...it, fromNews: true, title: hlWrap(it.title, matched), snippet: hlWrap(it.snippet, matched) });
    added++;
  }
  return added;
}

async function buildAndStore(cache, cacheKey, allowVerify, env) {
  try { ALLOWED = await readAllow(env); } catch { ALLOWED = {}; }
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
          // some feeds (e.g. Workpoint) give relative links — resolve against the feed URL
          if (it.link && it.link.startsWith("/")) { try { it.link = new URL(it.link, f.url).href; } catch {} }
          // Alert: โชว์สำนักข่าวจริงจากโดเมน (ไม่ใช่ label ของ query เช่น "ซีพี") · News: ใช้ label ฟีด
          it.sourceLabel = f.source.startsWith("alert") ? (outletOf(it.link) || f.label) : (it.sourceLabel || f.label);
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
  // query ที่จะยึด = อันที่ได้ keyword มากกว่า ระหว่างที่แกะจากฟีดกับที่เขียนไว้ใน config
  // (Google ตัด <title> ให้สั้นเมื่อ query ยาว — ดูหมายเหตุใน trend-feeds.config.js)
  for (const s of new Set([...Object.keys(queriesBySource), ...Object.keys(CONFIG_Q)])) {
    if (!sources[s]) continue;
    const feedQ = queriesBySource[s] || [];
    const cfgQ = CONFIG_Q[s] || [];
    sources[s].queries = parseAlertTerms(cfgQ).length > parseAlertTerms(feedQ).length ? cfgQ : feedQ;
  }
  const a2q = (sources.alert2 && sources.alert2.queries) || [];
  // คำจาก Google Alert + คำเพิ่มที่ใช้กับข่าวจากคอลัมน์ News เท่านั้น
  // ⚠️ ต้องใช้ชุดเดียวกันทั้ง merge / prune / highlight ไม่งั้นจะดึงเข้ามาแล้วลบทิ้งสลับกันทุกรอบ
  const a2terms = [...new Set([...parseAlertTerms(a2q), ...(CONFIG_EXTRA.alert2 || [])])];
  const a2excl = parseAlertExcludes(a2q);

  // ไฮบริด: บวกข่าว Google News ที่ match keyword ของคอลัมน์เข้ามา (เสถียรขึ้น ไม่พึ่ง Google Alert อย่างเดียว)
  mergeNewsIntoAlert(sources, "alert1", ["news"], CP_BRANDS);
  mergeNewsIntoAlert(sources, "alert2", ["news"], a2terms, a2excl);

  // แก้เวลาที่ฟีดส่งมาผิดก่อนทุกอย่าง — ตัวกรองเวลาและการเรียงลำดับที่ตามมาจะได้ใช้ของจริง
  const dateFix = fixContentDates(sources);

  // ตัด related-block: พาดหัว (ฟรี) + เนื้อข่าวจริง articleBody เฉพาะ background (allowVerify) · ก่อน stale-fill กันสะสม noise
  const alertVerify = {};
  try { await verifyAlertItems(cache, sources, alertVerify, allowVerify); } catch (e) { alertVerify.err = String((e && e.message) || e).slice(0, 120); }

  // เก็บสะสม alert ลง KV (CP/จับตามอง 10 วัน) แม้หลุดจากฟีด Google Alert แล้ว — หลัง verify กันสะสม noise
  const archive = {};
  let archiveOut = null;
  try { archiveOut = await mergeArchives(env, sources, archive); } catch (e) { archive.err = String((e && e.message) || e).slice(0, 120); }

  // เติมพาดหัวที่ถูกตัดสั้น — ต้องทำ "หลัง" merge เพื่อให้เห็นของเก่าใน KV ด้วย
  // ⚠️ ของเก่าที่เก็บไว้ตอนยังไม่มีตัวเติมจะถูกตัดค้างอยู่ตลอด ถ้าเติมก่อน merge
  // จะแตะได้แต่ของสดที่เพิ่งดึงมา (เคยพลาดมาแล้ว — พาดหัวเก่ายังขาดอยู่หลัง release)
  const titles = {};
  try { await fillClippedTitles(cache, sources, archiveOut, titles, allowVerify); } catch (e) { titles.err = String((e && e.message) || e).slice(0, 120); }

  // เขียน KV หลังเติมพาดหัวแล้ว — ไม่งั้นที่เติมได้จะหายทุกรอบแล้วต้องยิงซ้ำไม่จบ
  // (item ใน sources[].items เป็นตัวเดียวกับใน archiveOut — แก้ที่หนึ่งจึงติดไปอีกที่เอง)
  try { await saveArchives(env, archiveOut, archive); } catch (e) { archive.err = String((e && e.message) || e).slice(0, 120); }

  // กวาดประกาศงาน/อสังหา/หน้าขายของที่ค้างอยู่ใน KV ออกด้วย (verify ทำงานก่อน archive)
  const swept = {};
  try { dropNoiseAfterArchive(sources, swept); } catch (e) { swept.err = String((e && e.message) || e).slice(0, 120); }

  // ตัดข่าว merge ที่ไม่ match แล้ว (กัน brand เก่าค้าง) + ไฮไลต์ keyword ให้สม่ำเสมอ — หลัง merge+archive
  const pruned = {};
  try {
    pruned.alert1 = pruneStaleMerged(sources, "alert1", CP_BRANDS);
    pruned.alert2 = pruneStaleMerged(sources, "alert2", a2terms);
    highlightAlertItems(sources, "alert1", CP_BRANDS);
    highlightAlertItems(sources, "alert2", a2terms);
  } catch {}

  // ยุบข่าวซ้ำหลายสำนัก (พาดหัวคล้าย+เวลาใกล้กัน) เหลือใบเดียว แนบลิงก์สำนักอื่นใน it.also — เฉพาะผลแสดงผล ไม่แตะ KV
  try { for (const s of ["news", "alert1", "alert2"]) collapseDupes(sources, s); } catch {}

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

  // จัดหมวดข่าว (แบบเดียวกับหน้า IR) — ทำท้ายสุด หลังยุบข่าวซ้ำแล้ว จะได้ไม่เสีย AI ให้ใบที่ถูกทิ้ง
  const catDiag = {};
  try {
    // หมวดที่ AI เคยจัดไว้รอบก่อน — ข่าวเดิมไม่ต้องถามซ้ำ
    const prevCat = {};
    try {
      const prevResp = await cache.match(cacheKey);
      const pj2 = prevResp ? JSON.parse(await prevResp.clone().text()) : null;
      if (pj2) {
        for (const s2 of ["news", "alert1", "alert2"]) {
          for (const it of (pj2.sources?.[s2]?.items || [])) {
            if (it.byAI && it.link && it.cat) prevCat[it.link] = it.cat;
          }
        }
      }
    } catch {}
    // หมวดที่ผู้ใช้แก้เอง + ตัวอย่างล่าสุดไว้สอน AI (คนละ scope กับ IR: flags:pr)
    let userCats = {}, catExamples = [];
    try {
      if (env && env.FLAGS_KV) {
        const fraw = await env.FLAGS_KV.get(envPrefix(env) + "flags:pr");
        if (fraw) { const fs = JSON.parse(fraw); userCats = fs.cats || {}; catExamples = fs.catlog || []; }
      }
    } catch {}
    await enrichCategories(env, sources, prevCat, catDiag, userCats, catExamples);
  } catch (e) { catDiag.fatal = String((e && e.message) || e).slice(0, 200); }

  const body = JSON.stringify({ generatedAt: new Date().toISOString(), sources, errors, alertVerify, titles, swept, archive, pruned, dateFix, cats: catDiag });
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

// สะสม alert ลง KV: merge ของสด+ของเก่า, ตัดซ้ำด้วย link, คงเฉพาะ N วันต่อคอลัมน์ (blob เดียว)
async function mergeArchives(env, sources, diag) {
  const kv = env && env.FLAGS_KV;
  diag.enabled = !!kv;
  if (!kv) return; // ไม่มี KV → ใช้เฉพาะที่ดึงสด (หน้าไม่พัง)
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
    // ⚠️ ต้องแกะลิงก์ตัวเปลี่ยนทางก่อน dedupe — ของเก่าใน KV เก็บลิงก์ Bing ที่มี `tid=`
    // เปลี่ยนทุกรอบ ข่าวใบเดียวจึงกองอยู่หลายสิบใบ · แกะแล้ว key จะตรงกันแล้วยุบเหลือใบเดียว
    const put = (it) => {
      if (!it || !it.link) return;
      it.link = unwrapRedirect(it.link);
      byLink.set(normLink(it.link), it);
    };
    for (const it of (store[src] || [])) put(it);
    for (const it of sources[src].items) put(it); // ของสดทับของเก่า
    const merged = [...byLink.values()]
      .filter((it) => { const t = new Date(it.publishedAt).getTime(); return isNaN(t) || t >= cutoff; })
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, cfg.max);
    if (src.startsWith("alert")) for (const it of merged) if (!it.fromNews) it.sourceLabel = outletOf(it.link) || it.sourceLabel; // refresh label สำนักข่าว (กันของเก่าใน KV ค้าง "ซีพี")
    sources[src].items = merged.slice(0, cfg.show); // หน้าเว็บ: เฉพาะล่าสุด
    out[src] = merged;                              // KV: เก็บเต็มไว้ export
    diag[src] = merged.length;
  }
  return out; // ยังไม่เขียน KV — รอเติมพาดหัวก่อน แล้วค่อยเรียก saveArchives()
}

// เขียนคลังข่าวลง KV — แยกจาก mergeArchives เพื่อให้เติมพาดหัวที่ถูกตัดได้ก่อนเขียน
// ⚠️ เขียนครั้งเดียวต่อ request เท่านั้น (โควตาเขียนของแผนฟรี 1,000 ครั้ง/วัน ใช้ร่วมทั้งโปรเจกต์)
async function saveArchives(env, out, diag) {
  const kv = env && env.FLAGS_KV;
  if (!kv || !out) return;
  try {
    await kv.put(envPrefix(env) + ARCHIVE_KEY, JSON.stringify(out));
    diag.saved = true;
    diag.env = env.APP_ENV || "prod";
  } catch (e) {
    diag.err = String((e && e.message) || e).slice(0, 120);
  }
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
// หน้าแกลเลอรี/ดูรูป — เฉพาะสคริปต์เปิดดูรูปจริง (เช่น .../Gallery/viewpic2d.php) ไม่จับ /gallery/ เปล่า ๆ
// (บางหน่วยงานเช่น moc.go.th ใช้ /gallery/ เป็นหมวดข่าว/บทความจริง — ไม่ใช่อัลบั้มรูป)
const GALLERY_RE = /viewpic|viewimage|showpic|gallery\.php|\/album\//i;
// พาดหัวขึ้นต้น "ข่าวประชาสัมพันธ์" = หน้าประกาศ/PR ราชการ-หน่วยงาน (มัก match keyword จากเมนู/บล็อกลิงก์ ไม่ใช่ตัวข่าว)
const PR_RE = /^\s*ข่าวประชาสัมพันธ์/;
// เว็บที่รับแจกข่าวประชาสัมพันธ์ล้วนๆ (ไม่มีกองบรรณาธิการคัดข่าว)
const PR_HOSTS = ["newswit.com", "thaipr.net", "prnewswire.com", "businesswire.com"];

// ---- ประกาศงาน / อสังหา / หน้าขายสินค้า — ไม่ใช่ข่าว ----
// เจ้าของสั่งตัดออก (7 ส.ค. 69): jobsdb, dotproperty, epower ฯลฯ โผล่ในคอลัมน์ CP
// จับที่ "โดเมน" เป็นหลักเพราะแม่นกว่าจับคำ — คำเอาไว้กันเว็บที่ยังไม่อยู่ในลิสต์
const JOB_HOSTS = [
  "jobsdb", "jooble", "jobbkk", "jobthai", "indeed.", "glassdoor", "linkedin.", "jobtopgun",
  "careerjet", "talent.com", "workventure", "jobnisit", "trabajo.", "th.joblum", "joboko",
  "monster.co", "monster.com", "jobstreet", "prosple", "hiring.cafe", "jobsbkk", "th.jora.com",
  "seek.com", "seek.co", "jobseek", "jobdb",
];
// ⚠️ ประกาศงานภาษาอังกฤษไม่ได้เขียนว่า "hiring" เสมอไป — เจอจริงในคอลัมน์ IR:
// "AI Business Partner/ AI Expert with 5 - 7 Years of Experience at thai union"
// เข้ามาเพราะมีคำว่า thai union · จับที่รูปประโยคของใบประกาศงานเพิ่ม
const JOB_RE = /รับสมัครงาน|สมัครงาน|หางาน|ตำแหน่งงาน|งานเต็มเวลา|งานพาร์ทไทม์|งานพาร์ท-?ไทม์|jobs in |job vacanc|job opening|now hiring|apply now|years of experience|job purpose|job description|full[- ]time|responsibilities:|qualifications:|we are (?:looking for|hiring)|join our team/i;
const PROP_HOSTS = [
  "dotproperty", "ddproperty", "livinginsider", "baania", "hipflat", "thinkofliving",
  "propertyhub", "prakard", "realist.co.th", "bahtsold", "propfit", "homenayoo",
];
// "ให้เช่า" คำเดียวพอ — ประกาศเช่าใช้ทุกใบ ส่วนข่าวธุรกิจจะเขียน "ปล่อยเช่า/สัญญาเช่า" แทน
const PROP_RE = /ให้เช่า|ห้องเช่า|หอพัก|ขายบ้าน|ขายคอนโด|ขายทาวน์|ขายที่ดิน|ขายดาวน์|for rent|ห้องนอน[\s\S]{0,20}ห้องน้ำ/i;
// หน้าขายสินค้า/บริการของผู้ขาย (ไม่ใช่ข่าว) — ภาษาแบบใบเสนอราคา/แคตตาล็อก
const VENDOR_RE = /ตัวแทนจำหน่าย|ผลิตและจำหน่าย|รับติดตั้ง|บริการติดตั้ง|สอบถามราคา|ใบเสนอราคา|ราคาโรงงาน|สินค้าและบริการ|เครื่องกรองน้ำ|เครื่องกรองอากาศ|water purifier|air purifier|air quality sensor|เซนเซอร์วัดคุณภาพอากาศ/i;

// ---- แอดเวอร์ทอเรียล (โฆษณาที่เขียนให้ดูเหมือนข่าว) ----
// เจอจริง: "ปาร์ตี้ฉลองท้ายปีหน้าแน่นแค่ไหนก็รอด! สเต็ปคลีนหน้าด้วยรีมูฟเวอร์…"
// เข้าคอลัมน์ CP เพราะในเนื้อบอกว่า "หาซื้อได้ที่เซเว่น" — ขายของ ไม่ใช่ข่าวของเครือ
//
// ⚠️ คำพวกนี้อยู่ในข่าวจริงได้เหมือนกัน จึงต้องเจอ "ภาษาชวนซื้อ" ด้วยอย่างน้อย 1 คำ
// ไม่ใช่เจอชื่อสินค้าแล้วตัดเลย (ข่าวเรียกคืนเครื่องสำอางก็มีคำว่าครีม/เซรั่ม)
const AD_PRODUCT_RE = /ครีม|เซรั่ม|เซรัม|serum|รีมูฟเวอร์|คลีนซิ่ง|สกินแคร์|skincare|มาส์ก|โลชั่น|แป้งพัฟ|ลิปสติก|บำรุงผิว|บำรุงหน้า|ผิวกระจ่างใส/i;
const AD_PITCH_RE = /หาซื้อได้ที่|วางจำหน่ายแล้ว|พร้อมจำหน่าย|ราคาเพียง|ราคาพิเศษ|โปรโมชั่?น|ลดราคา|สั่งซื้อ|ตัวช่วย|ปัง|ตัวท็อป|ห้ามพลาด|บอกเลยว่า|ต้องมีติดบ้าน|ติดกระเป๋า/i;

function hostOf(link) {
  try { return new URL(link).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}
// คืนเหตุผลถ้าเป็น noise (gallery/pr/daily/shopping) มิฉะนั้น null — ใช้ title+snippet ที่ถอด marker hl แล้ว
// ข่าวที่เจ้าของกด "↩ เอากลับ" ไว้ที่หน้า /admin/ — ต้องรอดทุกด่าน
// ⚠️ ตั้งค่าใหม่ทุกครั้งที่ build · Workers ใช้โมดูลเดิมซ้ำข้าม request ถ้าไม่ตั้งใหม่จะค้างของเก่า
let ALLOWED = {};
const isAllowed = (it) => !!(it && it.link && ALLOWED[allowKey(it.link)]);

function noiseReason(it, title) {
  if (isAllowed(it)) return null; // เจ้าของสั่งคืนไว้ — ไม่ต้องตัดอีก
  const link = it.link || "";
  if (GALLERY_RE.test(link)) return "gallery";
  if (PR_RE.test(title)) return "pr";
  // เว็บรับแจกข่าวประชาสัมพันธ์ — ตัดเฉพาะใบที่ "ชื่อเครือ CP ไม่ได้อยู่ในพาดหัว"
  //
  // ⚠️ เคยตัดทั้งเว็บ แล้วข่าวจริงของเครือหายไปด้วย (ซีพี แอ็กซ์ตร้า แจ้งผลประกอบการ ·
  // Makro ครบรอบ 37 ปี) — บริษัทใหญ่ส่งข่าวของตัวเองผ่านเว็บพวกนี้เป็นปกติ
  // ที่ไม่เอาคือใบที่ชื่อเครือโผล่แค่ในเนื้อ เช่น รายชื่อผู้รับรางวัลท้ายข่าว
  // (เจอจริง: newswit "นาคราชอวอร์ด" พาดหัวเป็นชื่อดารา ซีพี ออลล์ อยู่ท้ายข่าว)
  if (hostOf(it.link || "") && PR_HOSTS.some((h) => hostOf(it.link || "").includes(h)) && !realCP(title)) return "pr";
  const snip = (it.snippet || "").replace(/\[\[\/?hl\]\]/g, "").toLowerCase();
  const text = title + " " + snip;
  if (DAILY_RE.test(text)) return "daily";
  const host = hostOf(link);
  if (host && SHOP_HOSTS.some((h) => host.includes(h))) return "shopping";
  if (SHOP_RE.test(text)) return "shopping";
  if (host && JOB_HOSTS.some((h) => host.includes(h))) return "job";
  if (JOB_RE.test(text)) return "job";
  if (host && PROP_HOSTS.some((h) => host.includes(h))) return "property";
  if (PROP_RE.test(text)) return "property";
  if (VENDOR_RE.test(text)) return "vendor";
  // โฆษณาที่เขียนให้ดูเหมือนข่าว — ต้องเจอทั้งชื่อสินค้าและภาษาชวนซื้อ ไม่งั้นตัดข่าวจริงพลาด
  if (AD_PRODUCT_RE.test(text) && AD_PITCH_RE.test(text)) return "advertorial";
  return null;
}

// กวาดของที่เป็นประกาศงาน/อสังหา/หน้าขายของ ออกจากคอลัมน์ alert "หลังดึงของเก่าจาก KV กลับมา"
// ⚠️ verifyAlertItems() ทำงานก่อน mergeArchives() — ของเก่าที่เก็บไว้ตอนยังไม่มีตัวกรองนี้
// จะไหลกลับเข้ามาโดยไม่ผ่านด่าน ต้องกวาดอีกรอบตรงนี้ ไม่งั้นต้องรอ 10 วันกว่าจะหายเอง
function dropNoiseAfterArchive(sources, diag) {
  for (const src of ["alert1", "alert2"]) {
    const b = sources[src];
    if (!b || !Array.isArray(b.items)) continue;
    const before = b.items.length;
    b.items = b.items.filter((it) => {
      const why = noiseReason(it, (it.title || "").replace(/\[\[\/?hl\]\]/g, "").toLowerCase());
      // เก็บลิงก์+พาดหัวเต็มไว้ด้วย — หน้า /admin/ เอาไปแสดงว่า "ระบบตัดอะไรทิ้งไปบ้าง"
      if (why) (diag.dropped = diag.dropped || []).push({ src, why, title: stripMarks(it.title), link: it.link || "" });
      return !why;
    });
    diag[src] = before - b.items.length;
  }
}

// ---- ข่าวเก่าที่ถูกดันขึ้นมาใหม่ ----
// Google Alert เจอหน้าเก่าที่เพิ่งมีคนคอมเมนต์/แก้ไข แล้วส่งมาเป็น "ของใหม่"
// (เคยได้กระทู้ Pantip ปี 2557 มาแสดงว่า "6 ชม.ที่แล้ว")
// วิธีจับ: หาวันที่เต็มรูปแบบใน "ช่วงต้น" ของ snippet ซึ่งเป็นตำแหน่งของ byline
// ถ้าเก่ากว่า 1 ปี = ของเก่าถูกดันขึ้นมา ไม่ใช่ข่าวใหม่
const TH_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const TH_DATE_RE = new RegExp("(\\d{1,2})\\s*(" + TH_MONTHS.join("|") + ")\\s*(25\\d{2}|20\\d{2})", "g");
// หน้าต่าง "ความสดตอนรับเข้า" — คนละเรื่องกับอายุที่เก็บใน archive (90 วัน)
// ตัวนี้กันข่าวเก่าที่ถูกดันขึ้นมาใหม่ไม่ให้ไหลเข้าระบบตั้งแต่แรก
// ส่วน archive คือเก็บข่าวที่ผ่านด่านนี้แล้วไว้ให้นานขึ้นเพื่อดูย้อนหลัง — อย่าเอาไปผูกกัน
const OLD_AFTER_MS = 10 * 24 * 3600 * 1000;
const BYLINE_HEAD = 220;                     // ดูเฉพาะช่วงต้น กันไปเจอวันที่ที่บทความอ้างถึงเฉย ๆ

function bylineDate(text) {
  const head = String(text || "").replace(/\[\[\/?hl\]\]/g, "").slice(0, BYLINE_HEAD);
  TH_DATE_RE.lastIndex = 0;
  let m, newest = null;
  while ((m = TH_DATE_RE.exec(head))) {
    let y = parseInt(m[3], 10);
    if (y >= 2400) y -= 543; // พ.ศ. -> ค.ศ.
    const mo = TH_MONTHS.indexOf(m[2]);
    const day = parseInt(m[1], 10);
    if (mo < 0 || !day || day > 31) continue;
    const d = Date.UTC(y, mo, day);
    if (!isNaN(d) && (newest === null || d > newest)) newest = d;
  }
  return newest;
}
function isOldRepost(it) {
  const d = bylineDate(it && it.snippet);
  return d !== null && Date.now() - d > OLD_AFTER_MS;
}

// แก้เวลาให้ตรงความจริงทุกคอลัมน์ — ฟีดส่ง "เวลาที่ Alert เจอหน้านั้น" มา ไม่ใช่เวลา
// ที่เนื้อหาถูกเขียน พอเจอ byline ที่เก่ากว่ามาก ให้ยึด byline เป็นหลัก
// การ์ดจะได้แสดงอายุจริง แทนที่จะบอกว่า "6 ชม.ที่แล้ว" ทั้งที่เป็นข่าวปี 2557
const DATE_TRUST_GAP_MS = 2 * 24 * 3600 * 1000;

function fixContentDates(sources) {
  let fixed = 0;
  for (const s of Object.values(sources || {})) {
    for (const it of (s && s.items) || []) {
      const d = bylineDate(it.snippet);
      if (d === null) continue;
      const feedTime = new Date(it.publishedAt).getTime();
      if (isNaN(feedTime) || feedTime - d > DATE_TRUST_GAP_MS) {
        it.publishedAt = new Date(d).toISOString();
        it.dateFromByline = true;
        fixed++;
      }
    }
  }
  return fixed;
}

// ตระกูลแบรนด์ในเครือ CP — บทความ CP มักเรียกตัวเองด้วยชื่อลูก (CPF/เซเว่น/แม็คโคร) ไม่ใช่คำว่า "ซีพี" ตรง ๆ
// ใช้ตอน verify คอลัมน์ alert1: ถ้า meta มีชื่อในเครือ = ข่าว CP จริง แม้ Google จะไฮไลต์ "ซีพี" จาก related block
const CP_BRANDS = [
  "ซีพี", "cp all", "cpall", "cpf", "ซีพีเอฟ", "ซีพี ออลล์", "ซีพีแรม", "cpram", "cp axtra", "แอ็กซ์ตร้า",
  "cp group", "cp foods", "cp land", "cp brand", "cp fresh", "cp meiji", "cp-meiji", "cp intertrade",
  "เจริญโภคภัณฑ์", "charoen pokphand", "pokphand", "เจียรวนนท์",
  "เซเว่น", "7-eleven", "7 eleven", "seven eleven", "7-11", "7 11", "แม็คโคร", "makro", "โลตัส", "lotus's",
  "cpaxt", "ซีพี แอ็กซ์ตร้า", "ซีพีแอ็กซ์ตร้า", "cppc", "ซีพีพีซี",
  "ศุภชัย เจียรวนนท์", "ธนินท์ เจียรวนนท์", "supachai chearavanont", "true corp", "ทรู คอร์ปอเรชั่น", "ทรู",
];
// คำ match ที่ "อ่อนเกิน" — bare "cp" อังกฤษ โผล่ในใบเซอร์/OCR มั่ว/Canadian Pacific/cpu ฯลฯ → ไม่นับเป็นสัญญาณ ต้องพิสูจน์ด้วยชื่อเต็ม
const WEAK_TERMS = new Set(["cp", "cd", "cpi", "cpu"]);
// ชื่อที่ "มีซีพี/CP อยู่ข้างใน" แต่ไม่ใช่เครือ CP — บีแอลซีพี = BLCP Power (โรงไฟฟ้า), ซีพีเอ็น = Central Pattana
// บีแอลซีพี = BLCP Power (โรงไฟฟ้า) · ซีพีเอ็น = Central Pattana · บีซีพีจี/บีซีพี = กลุ่มบางจาก
const CP_FALSE = ["บีแอลซีพี", "blcp", "ซีพีเอ็น", "cpn ", "บีซีพีจี", "bcpg", "บีซีพี", "bcp "];
// ชื่อที่สะกดได้หลายแบบจนไล่พิมพ์ครบไม่ไหว — เขียนเป็นแพตเทิร์นแทน (เว้นวรรค · ทัล/ตอล · พ/ป)
// ⚠️ True Digital Park = สถานที่จัดงาน/ที่ตั้งออฟฟิศ ข่าวที่พูดถึงมันไม่ใช่ข่าวของเครือ CP
// จับเฉพาะที่มีคำว่า พาร์ค/ปาร์ค/park ต่อท้าย — "ทรูดิจิทัล กรุ๊ป" เป็นบริษัทของทรูจริง ห้ามตัด
// ⚠️ ทรูธโซเชียล (Truth Social) = แอปของทรัมป์ ไม่เกี่ยวกับทรูของ CP เลย
// แต่คำว่า "ทรู" อยู่ต้นคำพอดี ข่าว "Trump Media ขาดทุน 238 ล้าน" จึงหลุดเข้าคอลัมน์ CP
// (บทเรียนเดิมกับ ทรูดิจิทัล พาร์ค เป๊ะๆ — ชื่ออื่นที่ขึ้นต้นด้วย "ทรู")
const CP_FALSE_RX = [
  "ทรู\\s*ดิจิ(?:ทัล|ตอล)\\s*(?:พาร์ค|ปาร์ค|park)",
  "true\\s*digital\\s*park",
  "ทรู\\s*ธ?\\s*โซเชี?ย?ล",
  "truth\\s*social",
  "trump\\s*media",
];
// เรียงยาวก่อนสั้น — ไม่งั้น "บีซีพี" จะกินก่อนแล้ว "บีซีพีจี" ไม่มีวันแมตช์
const CP_FALSE_RE = new RegExp(
  CP_FALSE.slice().sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).concat(CP_FALSE_RX).join("|"),
  "gi"
);
const hasFalseCP = (s) => { CP_FALSE_RE.lastIndex = 0; return CP_FALSE_RE.test(String(s || "")); };
const dropFalseCP = (s) => String(s || "").replace(CP_FALSE_RE, " ");
// จริงหรือไม่: ตัดชื่อลวงออกก่อน แล้วยังเหลือชื่อเครือ CP อยู่ไหม
function realCP(text) {
  const hay = dropFalseCP(String(text || "").replace(/\[\[\/?hl\]\]/g, "")).toLowerCase();
  return CP_BRANDS.some((b) => hay.includes(b));
}
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
// ---------- เติมพาดหัวที่ถูกตัดสั้น ----------
// Bing ส่งพาดหัวมาแบบตัดท้ายด้วย "…" (เช่น "…ผนึก CPF–แม่โจ้ จัดการชั่ว …")
// ตัวเต็มไม่ได้อยู่ในฟีดเลย ต้องไปอ่านจากหน้าข่าวจริง
//
// ⚠️ ยิงทีละน้อยและเฉพาะตอนทำงานเบื้องหลัง (allowFetch) — ผลถูกเก็บลงคลังข่าว
// จึงจ่ายค่ายิงครั้งเดียวต่อข่าว 1 ใบ รอบต่อไปได้ของเต็มมาเลย
const CLIPPED_RE = /(?:…|\.\.\.)\s*$/;
const stripMarks = (s) => String(s || "").replace(/\[\[\/?hl\]\]/g, "").trim();
const TITLE_FETCH_MAX = 20; // ต่อ 1 request — กันชนโควตา subrequest ของ Cloudflare (เพดาน 50)
// ⚠️ บางฟีด "ตัดพาดหัวโดยไม่ใส่ …" ด้วย (เจอจริง: "…ดันกระทรวง อว.เป็นกลไกหลักด้าน" จบห้วนๆ)
// ดูแค่จุดไข่ปลาจึงไม่พอ — พาดหัวที่ยาวใกล้เพดานของฟีดให้ถือว่า "น่าสงสัย" ไว้ก่อน
//
// เดาเกินไปไม่เสียหาย เพราะด่านตอนรับค่ากลับเข้มอยู่แล้ว (ต้องยาวกว่าเดิม + ขึ้นต้นเหมือนกัน)
// ถ้าของเดิมถูกอยู่แล้วก็แค่ไม่มีอะไรเปลี่ยน · เสียแค่การยิง 1 ครั้ง ซึ่งจ่ายครั้งเดียวต่อข่าว
const CLIP_LEN = 80;
function looksClipped(title) {
  const t = stripMarks(title);
  if (!t) return false;
  if (CLIPPED_RE.test(t)) return true;
  return t.length >= CLIP_LEN && !/[.!?"”』】]$/.test(t);
}
// ตัดชื่อเว็บที่ต่อท้ายพาดหัว ("พาดหัว | เดลินิวส์" · "พาดหัว - INN News")
// ไม่งั้นจะเอาชื่อเว็บไปแปะในชีตให้เจ้าของอ่าน
function trimSiteSuffix(full, head) {
  const m = String(full).match(/^([\s\S]+?)\s*[|–—-]\s*([^|–—-]{2,25})$/);
  if (!m) return full;
  return m[1].length >= Math.max(head.length, 20) ? m[1].trim() : full;
}
function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/\s+/g, " ").trim();
}
function headlineFromHtml(html) {
  const pick = (re) => { const m = html.match(re); return m ? decodeEntities(m[1]) : ""; };
  return pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
    || pick(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i)
    || pick(/<h1[^>]*>([\s\S]{4,300}?)<\/h1>/i).replace(/<[^>]+>/g, "")
    || pick(/<title[^>]*>([\s\S]{4,300}?)<\/title>/i);
}
async function fillClippedTitles(cache, sources, archived, diag, allowFetch) {
  const todo = [];
  const seen = new Set();
  // คอลัมน์ alert มาก่อน — เป็นชุดที่ไหลลง Google Sheet · คลังข่าวเต็มมาก่อนของที่โชว์บนหน้า
  // เพราะพาดหัวที่ค้างอยู่ใน KV คือตัวที่ผู้ใช้เห็นว่า "ยังไม่ครบ"
  const pools = [
    ...(archived ? ["alert1", "alert2"].map((s) => archived[s]) : []),
    ...["alert1", "alert2", "news"].map((s) => sources[s]?.items),
  ];
  for (const list of pools) {
    for (const it of (list || [])) {
      if (!it || !it.link || seen.has(it)) continue;
      seen.add(it);
      // it.tfix = เคยไปอ่านพาดหัวจากหน้าข่าวจริงแล้ว (ธงนี้ถูกเก็บลง KV ไปด้วย)
      // ถ้าไม่มีธงนี้ ข่าวที่ "เช็คแล้วว่าพาดหัวถูกอยู่แล้ว" จะถูกหยิบมาเช็คซ้ำทุกรอบ
      // จนกินโควตา 20 ใบต่อรอบไปหมด แล้วข่าวที่ยังขาดจริงๆ จะไม่มีวันได้คิว
      if (!it.tfix && looksClipped(it.title)) todo.push(it);
    }
  }
  diag.clipped = todo.length;
  if (!todo.length) return;
  const pick = todo.slice(0, TITLE_FETCH_MAX);
  diag.tried = pick.length;
  const got = await mapPoolResults(pick, 4, async (it) => {
    const vkey = new Request("https://verify.local/title1?u=" + encodeURIComponent(it.link));
    try { const hit = await cache.match(vkey); if (hit) return (await hit.json()).t || ""; } catch {}
    if (!allowFetch) return "";
    let full = "";
    try {
      const res = await fetchWithTimeout(it.link, 6000);
      if (res.ok && /html/i.test(res.headers.get("content-type") || "")) {
        full = headlineFromHtml((await res.text()).slice(0, 200000)).slice(0, 300);
      }
    } catch { full = ""; }
    try {
      await cache.put(vkey, new Response(JSON.stringify({ t: full }), {
        headers: { "content-type": "application/json", "cache-control": "public, max-age=604800" },
      }));
    } catch {}
    return full;
  });
  let fixed = 0;
  pick.forEach((it, i) => {
    it.tfix = 1; // เช็คแล้ว — ไม่ว่าจะได้ของเต็มหรือไม่ ก็ไม่ต้องมาเช็คซ้ำอีก
    const bare = stripMarks(it.title || "");
    const head = bare.replace(CLIPPED_RE, "").trim().slice(0, 12);
    const full = trimSiteSuffix(String(got[i] || "").trim(), head);
    // ต้องยาวกว่าเดิมจริง และต้องขึ้นต้นเหมือนกัน ไม่งั้นแปลว่าไปเจอชื่อเว็บ ไม่ใช่พาดหัว
    if (!full || CLIPPED_RE.test(full) || full.length <= bare.length) return;
    if (head && !full.includes(head)) return;
    it.title = full;
    fixed++;
  });
  diag.fixed = fixed;
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
      if (isAllowed(it)) return { ok: true }; // เจ้าของสั่งคืนไว้ที่หน้า /admin/ — ผ่านทุกด่าน
      const bare = (it.title || "").replace(/\[\[\/?hl\]\]/g, "");
      const title = bare.toLowerCase();
      const noise = noiseReason(it, title); // ตัดโฆษณา/รายงานประจำวัน/หน้าแกลเลอรี ก่อนเช็ค related-block
      if (noise) return { ok: false, why: noise, terms: [], bare, link: it.link };
      if (ROUNDUP_RE.test(title)) return { ok: false, why: "roundup", terms: [], bare, link: it.link };
      if (isOldRepost(it)) return { ok: false, why: "old-content", terms: [], bare, link: it.link };
      // CP มาจากชื่อลวงล้วน ๆ (บีแอลซีพี/ซีพีเอ็น) → ไม่ใช่ข่าวเครือ CP
      const rawHay = bare + " " + (it.snippet || "");
      if (src === "alert1" && hasFalseCP(rawHay) && !realCP(rawHay)) return { ok: false, why: "false-cp", terms: [], bare, link: it.link };
      if (it.fromNews) return { ok: true }; // ข่าวจาก News ที่ match keyword คอลัมน์แล้ว (ไฮบริด) — ผ่าน noise พอ
      const terms = highlightedTerms(it).filter((t) => !WEAK_TERMS.has(t)); // ตัดคำ match ที่อ่อนเกิน (bare cp) ทิ้ง
      // ⚠️ คอลัมน์ CP: ต้องมี "ชื่อเครือ CP จริง" เท่านั้น ไม่ใช่แค่คำที่ Google ไฮไลต์
      // Google ไฮไลต์ "เศษคำ" ได้ — เจอจริง: F-16s inter[cep]t ... ของ Al Jazeera
      // "cep" ไม่ได้อยู่ใน WEAK_TERMS และมันก็อยู่ในพาดหัวจริงๆ ด่านเดิมจึงปล่อยผ่าน
      // ไล่เติมทีละคำเป็นการวิ่งไล่ไม่จบ — เปลี่ยนเป็นถามว่า "เป็นชื่อเครือ CP ไหม" แทน
      if (src === "alert1") {
        if (realCP(rawHay)) return { ok: true };                 // ชั้น 1
        return { ok: "body", why: "ไม่มีชื่อเครือ CP ในพาดหัว/สรุป", terms, bare, link: it.link }; // ไปเช็คเนื้อข่าว (ชั้น 3)
      }
      // เช็คทั้ง title ดิบ + แบบแปลงเครื่องหมายเป็นช่องว่าง — พาดหัวแบบ 'TU'อัพเป้า ให้คำอย่าง "tu " match ติด
      const ntitle = " " + title.replace(/[^\p{L}\p{N}]+/gu, " ") + " ";
      if (terms.some((t) => title.includes(t) || ntitle.includes(t)) || extra.some((t) => title.includes(t) || ntitle.includes(t))) return { ok: true }; // ชั้น 1
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

/* ---------- จัดหมวดข่าว (แบบเดียวกับหน้า IR) ---------- */
//
// PR เดิมเดาหมวดจากคำล้วนๆ ฝั่งหน้าเว็บ ทำให้ชนคำอื่นบ่อย
// เจอจริง: "'หมู ปากน้ำ' เจองานสุดหินสอยคิว" (นักสนุกเกอร์) และ "ม.เกษตร เตือนนิสิต"
// (มหาวิทยาลัยเกษตรศาสตร์) ไปกองอยู่หมวด "อาหาร/เกษตร"
//
// จึงย้ายมาทำฝั่งเซิร์ฟเวอร์แบบ IR: คำค้นตัดสินเฉพาะตอนมั่นใจ · ที่เหลือให้ AI อ่านพาดหัว
// · จำผลไว้ไม่ต้องถามซ้ำ · และผู้ใช้แก้เองได้ทับทุกอย่าง

const CAT_KW = {
  econ:   ["หุ้น","เศรษฐกิจ","จีดีพี","เงินบาท","ดอกเบี้ย","เงินเฟ้อ","ส่งออก","นำเข้า","ลงทุน","กำไร","ตลาดหุ้น","ปันผล","แบงก์","ธนาคาร","ผลประกอบการ","econom","gdp","inflation","export","import","invest","market","stock","finance","earnings","bank"],
  agri:   ["หมู","ไก่","ไข่","กุ้ง","ปศุสัตว์","อาหารสัตว์","เกษตร","ข้าว","ประมง","เนื้อ","สุกร","ฟาร์ม","อาหาร","livestock","pork","poultry","agri","farm","food","shrimp","crop","harvest"],
  retail: ["ค้าปลีก","ค้าส่ง","ห้าง","ซูเปอร์","สะดวกซื้อ","ร้านสะดวกซื้อ","ค่าครองชีพ","ผู้บริโภค","อีคอมเมิร์ซ","ห้างสรรพสินค้า","โชห่วย","retail","consumer","e-commerce","ecommerce","mall","convenience","supermarket","wholesale"],
  crisis: ["โรคระบาด","ระบาด","อหิวาต์","ไข้หวัดนก","asf","โควิด","แผ่นดินไหว","น้ำท่วม","ภัยแล้ง","พายุ","ไฟไหม้","ไฟป่า","สึนามิ","ดินถล่ม","ภัยพิบัติ","อุบัติเหตุ","ฉุกเฉิน","วิกฤต","ภัยธรรมชาติ","disease","outbreak","pandemic","epidemic","earthquake","quake","flood","drought","storm","typhoon","wildfire","tsunami","disaster","emergency","crisis"],
  pol:    ["รัฐบาล","นายก","สภา","ครม","พรรค","เลือกตั้ง","กฎหมาย","นโยบาย","รัฐมนตรี","ภาษี","การเมือง","กกต","แบงก์ชาติ","มาตรการ","กระทรวง","govern","policy","election","parliament","minister","cabinet","regulation","tax","law"],
};
const CAT_KEYS = Object.keys(CAT_KW);
const AI_BATCH_CAT = 10;   // ก้อนเล็กแม่นกว่า — โมเดล 3B หลุดลำดับง่ายถ้าขอทีละมากๆ
const AI_MAX_CALLS_CAT = 12;
const MAX_AI_ITEMS = 60;   // จัดของใหม่ล่าสุดก่อน ที่เหลือรอรอบหน้า

// คำสั้นที่มักโผล่ในชื่อคน/สถานที่/ทีมกีฬา — เจอคำเดียวห้ามตัดสิน
// ("หมู ปากน้ำ" คือนักสนุกเกอร์ · "ม.เกษตร" คือมหาวิทยาลัย · "วัดไก่เตี้ย" คือวัด)
const AMBIG_KW = new Set(["ไก่", "หมู", "ไข่", "เนื้อ", "ปลา", "ข้าว", "นก", "กุ้ง", "เกษตร", "ห้าง", "ภาษี"]);

const hayOf = (it) => ((it.title || "") + " " + (it.snippet || "")).replace(/\[\[\/?hl\]\]/g, "").toLowerCase();
const keywordHits = (it) => CAT_KEYS.filter((k) => CAT_KW[k].some((w) => hayOf(it).includes(w)));
// มั่นใจ = มีคำของหมวดนั้นที่ "ไม่กำกวม" อย่างน้อย 1 คำ
const confidentHit = (it, cat) => CAT_KW[cat].some((w) => !AMBIG_KW.has(w) && hayOf(it).includes(w));

async function classifyCatBatch(env, titles, examples) {
  const list = titles.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const ex = (examples || []).slice(-8).map((e) => `- "${String(e.t).slice(0, 120)}" => ${e.c}`).join("\n");
  const prompt =
    "Classify each Thai/English news headline into ONE category code:\n" +
    "econ = economy/business/stocks/finance/GDP/investment\n" +
    "agri = agriculture/livestock/farming/food production\n" +
    "retail = retail/wholesale/consumer/e-commerce/shopping\n" +
    "crisis = disease outbreak/earthquake/flood/storm/natural disaster/accident/emergency\n" +
    "pol = domestic politics/government/policy/law\n" +
    "other = none of the above (religion, crime, sport, entertainment, obituary, general)\n" +
    "Judge by the MAIN topic. A word that appears only inside a person's name, a place or an " +
    "organisation does NOT put it in a category — a snooker player nicknamed หมู is sport, " +
    "and มหาวิทยาลัยเกษตรศาสตร์ is a university. Use other.\n" +
    (ex ? "\nThe user corrected these before — follow the same judgement:\n" + ex + "\n" : "") +
    `\nOutput EXACTLY ${titles.length} lines, one code per line, in the SAME order.\n` +
    "Each line must contain ONLY the code word. No numbering, no explanation.\n\n" +
    list;
  const out = await env.AI.run(AI_MODEL_CAT, { messages: [{ role: "user", content: prompt }], max_tokens: 300 });
  const text = String((out && (out.response || out.result)) || "").toLowerCase();
  // รับเฉพาะบรรทัดที่เป็นโค้ดล้วน — บรรทัดอธิบายจะทำให้ลำดับเลื่อนทั้งชุด
  const codes = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^(?:\d+[.)]\s*)?(econ|agri|retail|crisis|pol|other)\b[\s.]*$/);
    if (m) codes.push(m[1]);
  }
  if (codes.length !== titles.length) throw new Error(`count mismatch ${codes.length}/${titles.length}`);
  return codes;
}

// ก้อนไหนพลาดก็ผ่าครึ่งลองใหม่ ไม่ทิ้งทั้งชุด (ทิ้งทั้งชุด = ข่าวตกไปอยู่ "อื่นๆ" ยกแผง)
async function classifyCatInto(env, chunk, diag, st, examples, depth) {
  if (!chunk.length || st.calls >= AI_MAX_CALLS_CAT) return;
  st.calls++;
  try {
    const cats = await classifyCatBatch(env, chunk.map((x) => x.title), examples);
    chunk.forEach((it, j) => {
      const c = cats[j];
      if (!c) return;
      it.cat = CAT_KEYS.includes(c) ? c : "other";
      it.byAI = true;
      diag.ok++;
    });
  } catch (e) {
    diag.aiErr = String((e && e.message) || e).slice(0, 100);
    if (depth >= 2 || chunk.length <= 2) return;
    const mid = Math.ceil(chunk.length / 2);
    diag.splits = (diag.splits || 0) + 1;
    await classifyCatInto(env, chunk.slice(0, mid), diag, st, examples, depth + 1);
    await classifyCatInto(env, chunk.slice(mid), diag, st, examples, depth + 1);
  }
}

// ลำดับความน่าเชื่อ: ผู้ใช้จัดเอง > เคยจัดด้วย AI > คำค้นแบบมั่นใจ > ให้ AI อ่าน
async function enrichCategories(env, sources, prevCat, diag, userCats, examples) {
  userCats = userCats || {};
  const toAI = [];
  let userN = 0;
  for (const s of ["news", "alert1", "alert2"]) {
    for (const it of (sources[s] && sources[s].items) || []) {
      if (userCats[it.link]) { it.cat = userCats[it.link]; it.byUser = true; userN++; continue; }
      const cached = prevCat[it.link];
      if (cached) { it.cat = cached; it.byAI = true; continue; }
      const hits = keywordHits(it);
      if (hits.length === 1 && confidentHit(it, hits[0])) { it.cat = hits[0]; it.byAI = false; continue; }
      it.cat = "other";   // ค่าชั่วคราว — กำกวม/ชนหลายหมวด/ไม่ชนเลย ให้ AI ตัดสิน
      it.byAI = false;
      toAI.push(it);
    }
  }
  diag.bound = !!(env && env.AI);
  diag.userCats = userN;
  diag.candidates = toAI.length;
  diag.ok = 0;
  if (!env || !env.AI || !toAI.length) return;
  const st = { calls: 0 };
  const batch = toAI.slice(0, MAX_AI_ITEMS);
  diag.sent = batch.length;
  for (let i = 0; i < batch.length; i += AI_BATCH_CAT) {
    await classifyCatInto(env, batch.slice(i, i + AI_BATCH_CAT), diag, st, examples, 0);
  }
  diag.aiCalls = st.calls;
}
