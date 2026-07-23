// Cloudflare Pages Function: GET /api/ir/feeds
// ดึง+แปลง RSS ทุกฟีดของหน้า IR (News · Alert 1 · Alert 2) ฝั่งเซิร์ฟเวอร์ → JSON (แก้ CORS)
// stale-while-revalidate: ส่งของใน cache ทันที แล้วรีเฟรชเบื้องหลัง

import feeds from "../../../ir-feeds.config.js";
import { parseGeneric } from "../trend/_lib/parser.js";

const EDGE_TTL = 3600;
const FRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT = 12000;
const CACHE_VER = "20"; // bump: ลดฟีดเหลือ ~24 + harden กัน worker crash (1101)
const POOL = 8; // ดึงทีละ 8 ฟีด (คุม memory/CPU peak)
const MAX_XML = 600000; // ตัด XML ที่ใหญ่เกินก่อน parse (กัน CPU พุ่ง/ReDoS)
const MAX_PER_FEED = 60; // เก็บข่าวต่อฟีดไม่เกินนี้
const SOURCES = ["newsth", "newsintl", "alert1", "alert2"];
const LABELS = { newsth: "🇹🇭 ในประเทศ", newsintl: "🌏 ต่างประเทศ", alert1: "CP / ซีพี", alert2: "ปศุสัตว์ · อาหาร · การค้า" };
// ฟีด source "news" แยกไป newsth/newsintl ตาม region
const targetSource = (f) => (f.source === "news" ? (f.region === "intl" ? "newsintl" : "newsth") : f.source);

// ---------- จัดหมวดข่าว: keyword-first + LLM (Workers AI) สำหรับที่กำกวม ----------
const CAT_KW = {
  econ:   ["หุ้น","เศรษฐกิจ","ธุรกิจ","ลงทุน","เงินบาท","ส่งออก","นำเข้า","กำไร","ตลาดหุ้น","ดอกเบี้ย","เงินเฟ้อ","จีดีพี","ปันผล","แบงก์","ธนาคาร","stock","econom","market","invest","trade","inflation","finance","earnings","bank"],
  agri:   ["หมู","ไก่","ไข่","กุ้ง","ปศุสัตว์","เกษตร","อาหารสัตว์","ข้าว","ประมง","เนื้อ","สุกร","ฟาร์ม","livestock","agri","farm","pork","poultry","crop","harvest","food"],
  pol:    ["รัฐบาล","นายก","สภา","ครม","พรรค","เลือกตั้ง","กฎหมาย","นโยบาย","รัฐมนตรี","ภาษี","การเมือง","govern","policy","election","parliament","minister","tariff","cabinet"],
  energy: ["น้ำมัน","ก๊าซ","ไฟฟ้า","พลังงาน","โซลาร์","ถ่านหิน","ค่าไฟ","oil","gas","energy","power","fuel","electric","solar"],
};
const CAT_KEYS = Object.keys(CAT_KW);
const AI_MODEL = "@cf/meta/llama-3.2-3b-instruct"; // โมเดลเล็ก จัดหมวดพอ ใช้ neuron น้อย
const MAX_AI_ITEMS = 40; // จำกัดต่อ build (กันเกินโควตา/CPU)
const AI_BATCH = 20; // รวมหัวข้อต่อ 1 call

function keywordHits(it) {
  const hay = ((it.title || "") + " " + (it.snippet || "")).toLowerCase();
  return CAT_KEYS.filter((k) => CAT_KW[k].some((w) => hay.includes(w)));
}

async function classifyBatch(env, titles) {
  const list = titles.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const prompt =
    "จัดหมวดข่าวแต่ละหัวข้อเป็นรหัสเดียว: econ (เศรษฐกิจ/ธุรกิจ/หุ้น), agri (เกษตร/ปศุสัตว์/อาหาร), pol (การเมือง/นโยบาย), energy (พลังงาน), other (อื่นๆ). " +
    'ตอบเป็น JSON array ของรหัสเรียงตามลำดับเท่านั้น ห้ามมีข้อความอื่น เช่น ["econ","agri"]\n\nหัวข้อ:\n' + list;
  const out = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 220 });
  const text = String((out && (out.response || out.result)) || "");
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error("no json");
  return JSON.parse(m[0]).map((c) => (CAT_KEYS.includes(c) ? c : "other"));
}

async function enrichCategories(env, sources, prevCat, allowAI) {
  const toAI = [];
  for (const s of ["newsth", "newsintl"]) {
    for (const it of (sources[s]?.items || [])) {
      const cached = prevCat[it.link];
      if (cached) { it.cat = cached; it.byAI = true; continue; } // เคยจัดด้วย AI แล้ว
      const hits = keywordHits(it);
      if (hits.length === 1) { it.cat = hits[0]; it.byAI = false; continue; } // keyword มั่นใจ
      it.cat = hits[0] || "other"; it.byAI = false; // provisional
      toAI.push(it); // 0 หรือ ≥2 หมวด → ส่ง AI ตัดสิน
    }
  }
  if (!allowAI || !env || !env.AI || !toAI.length) return;
  const batch = toAI.slice(0, MAX_AI_ITEMS); // ล่าสุดก่อน (feed เรียงเวลาแล้ว)
  for (let i = 0; i < batch.length; i += AI_BATCH) {
    const chunk = batch.slice(i, i + AI_BATCH);
    try {
      const cats = await classifyBatch(env, chunk.map((x) => x.title));
      chunk.forEach((it, j) => { if (cats[j]) { it.cat = cats[j]; it.byAI = true; } });
    } catch { /* คงค่า keyword provisional ไว้ */ }
  }
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const cache = caches.default;
  const cacheKey = new Request(url.origin + "/api/ir/feeds?v=" + CACHE_VER, { method: "GET" });

  let resp = await cache.match(cacheKey);
  if (resp) {
    const age = Date.now() - Number(resp.headers.get("x-cached-at") || 0);
    // รีเฟรชเบื้องหลัง + เปิด AI จัดหมวด (ไม่บล็อกผู้ใช้)
    if (age > FRESH_MS) context.waitUntil(buildAndStore(cache, cacheKey, context.env, true));
  } else {
    // cold cache — build สด (ไม่เรียก AI เพื่อให้เร็ว) + กัน exception ไม่ให้ worker crash (1101)
    try {
      resp = await buildAndStore(cache, cacheKey, context.env, false);
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
        `จำนวนข่าว: ในประเทศ=${(s.newsth?.items || []).length}  ต่างประเทศ=${(s.newsintl?.items || []).length}  CP=${(s.alert1?.items || []).length}  ปศุสัตว์=${(s.alert2?.items || []).length}\n` +
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

async function buildAndStore(cache, cacheKey, env, allowAI) {
  const sources = {};
  for (const s of SOURCES) sources[s] = { label: LABELS[s], items: [], feedCount: 0 };
  for (const f of feeds) { const t = targetSource(f); if (sources[t]) sources[t].feedCount++; }
  const errors = [];

  await mapPool(feeds, POOL, async (f) => {
    const target = targetSource(f);
    if (!sources[target]) return;
    try {
      const res = await fetchWithTimeout(f.url, FETCH_TIMEOUT);
      if (!res.ok) throw new Error("HTTP " + res.status);
      let xml = await res.text();
      if (xml.length > MAX_XML) xml = xml.slice(0, MAX_XML); // กัน CPU พุ่งจากฟีดยักษ์
      const items = parseGeneric(xml, f.source).slice(0, MAX_PER_FEED);
      for (const it of items) {
        if (!it.sourceLabel) it.sourceLabel = f.label;
        it.group = f.group || "gen"; // biz | intl | gen
        it.region = f.region || "th"; // th | intl
        // some feeds (e.g. Workpoint) give relative links — resolve against the feed URL
        if (it.link && it.link.startsWith("/")) { try { it.link = new URL(it.link, f.url).href; } catch {} }
      }
      sources[target].items.push(...items);
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

  // อ่าน cache เก่า 1 ครั้ง — ใช้ทั้ง reuse หมวดจาก AI + คงของเดิมถ้า source ว่าง
  let pj = null;
  try {
    const prev = await cache.match(cacheKey);
    if (prev) pj = JSON.parse(await prev.clone().text());
  } catch {}

  // reuse หมวดที่ AI เคยจัดไว้ (byAI) — ข่าวเดิมไม่ต้องเรียก AI ซ้ำ
  const prevCat = {};
  if (pj) {
    for (const s of ["newsth", "newsintl"]) {
      for (const it of (pj.sources?.[s]?.items || [])) {
        if (it.byAI && it.link && it.cat) prevCat[it.link] = it.cat;
      }
    }
  }
  try { await enrichCategories(env, sources, prevCat, allowAI); } catch {}

  // ถ้ารอบนี้บาง source ดึงได้ 0 (Google Alert ส่งว่างชั่วคราว) → คงของเดิมไว้
  if (pj) {
    for (const key of SOURCES) {
      if (sources[key].items.length === 0 && pj.sources?.[key]?.items?.length) {
        sources[key].items = pj.sources[key].items;
        sources[key].stale = true;
      }
    }
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
