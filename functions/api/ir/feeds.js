// Cloudflare Pages Function: GET /api/ir/feeds
// ดึง+แปลง RSS ทุกฟีดของหน้า IR (News · Alert 1 · Alert 2) ฝั่งเซิร์ฟเวอร์ → JSON (แก้ CORS)
// stale-while-revalidate: ส่งของใน cache ทันที แล้วรีเฟรชเบื้องหลัง

import feeds from "../../../ir-feeds.config.js";
import { parseGeneric } from "../trend/_lib/parser.js";

const EDGE_TTL = 3600;
const FRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT = 12000;
const CACHE_VER = "24"; // bump: แตก alert2 เป็น 5 ฟีดตามธีม + ตัวกรองบริบท (ตัด noise หมู/ไก่ลอย)
const POOL = 8; // ดึงทีละ 8 ฟีด (คุม memory/CPU peak)
const MAX_XML = 600000; // ตัด XML ที่ใหญ่เกินก่อน parse (กัน CPU พุ่ง/ReDoS)
const MAX_PER_FEED = 60; // เก็บข่าวต่อฟีดไม่เกินนี้
// เก็บสะสมข่าว/alert ลง KV เพื่อไม่ให้หลุดตามหน้าต่างฟีด — รวมทุกคอลัมน์ใน key เดียว (1 read/write ต่อ build)
const ARCHIVE_KEY = "ir:archive";
// prefix key ตาม environment (ตั้ง APP_ENV=dev ที่ Preview) → dev/prod ใช้คลังแยกกัน ไม่ทับข้อมูลผู้ใช้จริง
const envPrefix = (env) => (env && env.APP_ENV ? String(env.APP_ENV) + ":" : "");
const ARCHIVE_CFG = {
  alert1:   { days: 10, max: 300 }, // CP / ซีพี
  alert2:   { days: 10, max: 400 }, // ปศุสัตว์
  newsth:   { days: 2,  max: 500 }, // ในประเทศ
  newsintl: { days: 2,  max: 500 }, // ต่างประเทศ
};
const SOURCES = ["newsth", "newsintl", "alert1", "alert2"];
const LABELS = { newsth: "🇹🇭 ในประเทศ", newsintl: "🌏 ต่างประเทศ", alert1: "CP / ซีพี", alert2: "ปศุสัตว์ · อาหาร · การค้า" };
// ฟีด source "news" แยกไป newsth/newsintl ตาม region
const targetSource = (f) => (f.source === "news" ? (f.region === "intl" ? "newsintl" : "newsth") : f.source);

// ---------- จัดหมวดข่าว: keyword-first + LLM (Workers AI) สำหรับที่กำกวม ----------
const CAT_KW = {
  econ:   ["หุ้น","เศรษฐกิจ","จีดีพี","เงินบาท","ดอกเบี้ย","เงินเฟ้อ","ส่งออก","นำเข้า","ลงทุน","กำไร","ตลาดหุ้น","ปันผล","แบงก์","ธนาคาร","ผลประกอบการ","econom","gdp","inflation","export","import","invest","market","stock","finance","earnings","bank"],
  agri:   ["หมู","ไก่","ไข่","กุ้ง","ปศุสัตว์","อาหารสัตว์","เกษตร","ข้าว","ประมง","เนื้อ","สุกร","ฟาร์ม","อาหาร","livestock","pork","poultry","agri","farm","food","shrimp","crop","harvest"],
  retail: ["ค้าปลีก","ค้าส่ง","ห้าง","ซูเปอร์","สะดวกซื้อ","ร้านสะดวกซื้อ","ค่าครองชีพ","ผู้บริโภค","อีคอมเมิร์ซ","ห้างสรรพสินค้า","โชห่วย","retail","consumer","e-commerce","ecommerce","mall","convenience","supermarket","wholesale"],
  crisis: ["โรคระบาด","ระบาด","อหิวาต์","ไข้หวัดนก","asf","โควิด","แผ่นดินไหว","น้ำท่วม","ภัยแล้ง","พายุ","ไฟไหม้","ไฟป่า","สึนามิ","ดินถล่ม","ภัยพิบัติ","อุบัติเหตุ","ฉุกเฉิน","วิกฤต","ภัยธรรมชาติ","disease","outbreak","pandemic","epidemic","earthquake","quake","flood","drought","storm","typhoon","wildfire","tsunami","disaster","emergency","crisis"],
  pol:    ["รัฐบาล","นายก","สภา","ครม","พรรค","เลือกตั้ง","กฎหมาย","นโยบาย","รัฐมนตรี","ภาษี","การเมือง","กกต","แบงก์ชาติ","มาตรการ","กระทรวง","govern","policy","election","parliament","minister","cabinet","regulation","tax","law"],
};
const CAT_KEYS = Object.keys(CAT_KW);

// ตัวกรองบริบท alert2: ข่าวปศุสัตว์ต้องมี "คำบริบทอุตสาหกรรม" อย่างน้อย 1 คำ
// ไม่งั้นเป็นข่าวอาหาร/อาชญากรรมที่แค่มีคำว่า หมู/ไก่/ไข่ ลอย ๆ (Google ตัดคำไทยหลุด phrase) → ทิ้ง
const ALERT2_ANCHORS = [
  "ราคา","ต้นทุน","ฟาร์ม","เลี้ยง","ปศุสัตว์","สุกร","สัตว์ปีก","ประมง","เกษตร","เกษตรกร",
  "ส่งออก","นำเข้า","เถื่อน","ลักลอบ","โควตา","ภาษี","อาหารสัตว์","วัตถุดิบ","ข้าวโพด","ถั่วเหลือง",
  "ปลาป่น","ชำแหละ","เขียง","หน้าฟาร์ม","แปรรูป","โรค","ระบาด","อหิวาต์","หวัดนก","asf","h5n1","prrs",
  "วัคซีน","ปนเปื้อน","เรียกคืน","กักกัน","ทำลายซาก","กรม","กระทรวง","รมว","สมาคม","สหกรณ์","สภาเกษตร",
  "ตรึงราคา","ควบคุมราคา","ประกันรายได้","แทรกแซง","เยียวยา","บอร์ด","สวัสดิภาพ","ไร้กรง",
  "ภัยแล้ง","เอลนีโญ","ลานีญา","พื้นที่การเกษตร",
  "เบทาโกร","betagro","ไทยฟู้ดส์","ไทยยูเนี่ยน","thai union","gfpt","tfg","tgm","cargill","brf","jbs",
  "แหลมทอง","ลีพัฒนา","บางกอกแร้นช์","ซันฟีด","new hope","tyson","muyuan","wh group","smithfield",
  "price","export","import","poultry","pork","shrimp","swine","farm","livestock","feed","disease",
  "influenza","swine fever","bird flu","tariff","quota","cage free","iuu","food export",
];
function alert2Relevant(it) {
  const hay = ((it.title || "") + " " + (it.snippet || "")).toLowerCase();
  return ALERT2_ANCHORS.some((w) => hay.includes(w));
}
const AI_MODEL = "@cf/meta/llama-3.2-3b-instruct"; // ตัวที่ยัง active (3.1-8b ถูก deprecated) + parser ยืดหยุ่นรับได้
const MAX_AI_ITEMS = 80; // จำกัดต่อ build (เร่งเคลียร์ backlog — 4 batch/รอบ)
const AI_BATCH = 20; // รวมหัวข้อต่อ 1 call

function keywordHits(it) {
  const hay = ((it.title || "") + " " + (it.snippet || "")).toLowerCase();
  return CAT_KEYS.filter((k) => CAT_KW[k].some((w) => hay.includes(w)));
}

async function classifyBatch(env, titles, examples) {
  const list = titles.map((t, i) => `${i + 1}. ${t}`).join("\n");
  // few-shot จากที่ผู้ใช้แก้หมวดเอง → สอน AI ให้ตรงใจครั้งหน้า
  const ex = (examples || []).slice(-8).map((e) => `- "${String(e.t).slice(0, 120)}" => ${e.c}`).join("\n");
  const prompt =
    "Classify each Thai/English news headline into ONE category code:\n" +
    "econ = economy/business/stocks/finance/GDP/investment\n" +
    "agri = agriculture/livestock/farming/food production\n" +
    "retail = retail/wholesale/consumer/e-commerce/shopping\n" +
    "crisis = disease outbreak/earthquake/flood/storm/natural disaster/accident/emergency\n" +
    "pol = domestic politics/government/policy/law\n" +
    "other = none of the above\n" +
    (ex ? "\nThe user corrected these before — follow the same judgement:\n" + ex + "\n" : "") +
    "\nReply with ONLY the codes, one per line, in the SAME order. No numbers, no other text.\n\n" +
    list;
  const out = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 300 });
  const text = String((out && (out.response || out.result)) || "");
  // parse แบบยืดหยุ่น: ดึงรหัสหมวดตามลำดับที่โผล่ ไม่บังคับ JSON (รับคำเต็มด้วย)
  const norm = (w) =>
    w === "disaster" ? "crisis" : (w === "politics" || w === "political") ? "pol" : (w === "economy" ? "econ" : w);
  const found = (text.toLowerCase().match(/econ(?:omy)?|agri|retail|crisis|disaster|politics|political|pol|other/g) || [])
    .map(norm);
  if (!found.length) throw new Error("no cats: " + text.slice(0, 80));
  return found.map((c) => (CAT_KEYS.includes(c) ? c : "other"));
}

async function enrichCategories(env, sources, prevCat, allowAI, diag, userCats, examples) {
  userCats = userCats || {};
  const toAI = [];
  let userN = 0;
  for (const s of ["newsth", "newsintl"]) {
    for (const it of (sources[s]?.items || [])) {
      if (userCats[it.link]) { it.cat = userCats[it.link]; it.byUser = true; userN++; continue; } // ผู้ใช้จัดเอง = สูงสุด
      const cached = prevCat[it.link];
      if (cached) { it.cat = cached; it.byAI = true; continue; } // เคยจัดด้วย AI แล้ว
      const hits = keywordHits(it);
      if (hits.length === 1) { it.cat = hits[0]; it.byAI = false; continue; } // keyword มั่นใจ
      it.cat = hits[0] || "other"; it.byAI = false; // provisional
      toAI.push(it); // 0 หรือ ≥2 หมวด → ส่ง AI ตัดสิน
    }
  }
  diag.bound = !!(env && env.AI);
  diag.allowAI = !!allowAI;
  diag.userCats = userN;
  diag.candidates = toAI.length;
  diag.sent = 0; diag.ok = 0;
  if (!allowAI || !env || !env.AI || !toAI.length) return;
  const batch = toAI.slice(0, MAX_AI_ITEMS); // ล่าสุดก่อน (feed เรียงเวลาแล้ว)
  for (let i = 0; i < batch.length; i += AI_BATCH) {
    const chunk = batch.slice(i, i + AI_BATCH);
    diag.sent += chunk.length;
    try {
      const cats = await classifyBatch(env, chunk.map((x) => x.title), examples);
      chunk.forEach((it, j) => { if (cats[j]) { it.cat = cats[j]; it.byAI = true; diag.ok++; } });
    } catch (e) { diag.err = String((e && e.message) || e).slice(0, 200); } // คงค่า keyword provisional ไว้
  }
}

// สะสมข่าว/alert ลง KV: merge ของสด+ของเก่า, ตัดซ้ำด้วย link, คงเฉพาะ N วันต่อคอลัมน์ (blob เดียว)
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
    for (const it of (store[src] || [])) if (it && it.link) byLink.set(it.link, it);
    for (const it of sources[src].items) if (it && it.link) byLink.set(it.link, it); // ของสดทับของเก่า
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

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const cache = caches.default;
  const cacheKey = new Request(url.origin + "/api/ir/feeds?v=" + CACHE_VER, { method: "GET" });

  // ?probe = ยิงฟีดสด ๆ (alert + CNN candidates) แล้วโชว์ status + หัวข้อตัวอย่าง (debug)
  if (url.searchParams.has("probe")) {
    const cnn = [
      { label: "CNN topstories", source: "test", url: "http://rss.cnn.com/rss/cnn_topstories.rss" },
      { label: "CNN world",      source: "test", url: "http://rss.cnn.com/rss/cnn_world.rss" },
      { label: "CNN edition",    source: "test", url: "http://rss.cnn.com/rss/edition.rss" },
    ];
    const targets = [...feeds.filter((f) => f.source === "alert1" || f.source === "alert2"), ...cnn];
    const lines = [];
    for (const f of targets) {
      try {
        const r = await fetchWithTimeout(f.url, FETCH_TIMEOUT);
        const t = await r.text();
        const nItem = (t.match(/<(item|entry)\b/g) || []).length;
        const titles = (t.match(/<title[^>]*>([\s\S]*?)<\/title>/g) || [])
          .map((x) => x.replace(/<[^>]+>/g, "").replace(/<!\[CDATA\[|\]\]>/g, "").trim())
          .filter(Boolean);
        lines.push(`● ${f.label} [${f.source}]  HTTP ${r.status} · ${t.length}b · items=${nItem}`);
        lines.push("   ตัวอย่างหัวข้อ: " + (titles.slice(1, 4).join("  |  ").slice(0, 200) || "(ไม่มี)"));
      } catch (e) {
        lines.push(`● ${f.label} [${f.source}]  ERROR: ${String((e && e.message) || e)}`);
      }
    }
    return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }

  // ?rebuild = บังคับ build สดพร้อมเรียก AI ทันที (สำหรับทดสอบ/เร่งจัดหมวด)
  const wantRebuild = url.searchParams.has("rebuild");
  let resp = wantRebuild ? null : await cache.match(cacheKey);
  if (resp) {
    const age = Date.now() - Number(resp.headers.get("x-cached-at") || 0);
    // รีเฟรชเบื้องหลัง + เปิด AI จัดหมวด (ไม่บล็อกผู้ใช้)
    if (age > FRESH_MS) context.waitUntil(buildAndStore(cache, cacheKey, context.env, true));
  } else {
    // cold: build สด (AI เฉพาะเมื่อ ?rebuild) + กัน exception ไม่ให้ worker crash (1101)
    try {
      resp = await buildAndStore(cache, cacheKey, context.env, wantRebuild);
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
      const byAI = ["newsth", "newsintl"].reduce((n, k) => n + (s[k]?.items || []).filter((x) => x.byAI).length, 0);
      txt =
        `feeds ที่โหลดไม่ได้: ${(j.errors || []).length}\n` +
        `จำนวนข่าว: ในประเทศ=${(s.newsth?.items || []).length}  ต่างประเทศ=${(s.newsintl?.items || []).length}  CP=${(s.alert1?.items || []).length}  ปศุสัตว์=${(s.alert2?.items || []).length}\n` +
        `จัดหมวดด้วย AI: ${byAI} ข่าว (ที่เหลือใช้ keyword)\n` +
        `คลังเก็บสะสม (KV — ในปท./ตปท. 2วัน, CP/ปศุสัตว์ 10วัน): ${JSON.stringify(j.archive || {})}\n` +
        `ฟีด Alert รอบ build ล่าสุด (สดจาก Google): ${JSON.stringify(j.alerts || [])}\n` +
        `ตัด noise ปศุสัตว์ (ไม่มีบริบทอุตสาหกรรม): ${j.alert2Cut ?? "-"} ข่าว\n` +
        `AI debug: ${JSON.stringify(j.ai || {})}\n` +
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
  const alertMeta = []; // สถานะสดของฟีด alert รอบนี้ (แยก "Google ส่งว่าง/รีเซ็ต" ออกจาก "cache เราค้าง")

  await mapPool(feeds, POOL, async (f) => {
    const target = targetSource(f);
    if (!sources[target]) return;
    try {
      const res = await fetchWithTimeout(f.url, FETCH_TIMEOUT);
      if (!res.ok) throw new Error("HTTP " + res.status);
      let xml = await res.text();
      if (xml.length > MAX_XML) xml = xml.slice(0, MAX_XML); // กัน CPU พุ่งจากฟีดยักษ์
      const items = parseGeneric(xml, f.source).slice(0, MAX_PER_FEED);
      if (f.source.startsWith("alert")) {
        const newest = items.reduce((m, x) => (x.publishedAt > m ? x.publishedAt : m), "");
        alertMeta.push({ id: f.id, http: res.status, items: items.length, newest: newest || null });
      }
      for (const it of items) {
        if (!it.sourceLabel) it.sourceLabel = f.label;
        it.group = f.group || "gen"; // biz | intl | gen
        it.region = f.region || "th"; // th | intl
        // some feeds (e.g. Workpoint) give relative links — resolve against the feed URL
        if (it.link && it.link.startsWith("/")) { try { it.link = new URL(it.link, f.url).href; } catch {} }
      }
      sources[target].items.push(...items);
    } catch (e) {
      if (f.source.startsWith("alert")) alertMeta.push({ id: f.id, err: String((e && e.message) || e).slice(0, 80) });
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

  // ตัด noise คอลัมน์ปศุสัตว์: ต้องมีบริบทอุตสาหกรรม ≥1 คำ (กันข่าวอาหาร/อาชญากรรมที่แค่มี หมู/ไก่)
  let alert2Cut = 0;
  if (sources.alert2) {
    const before = sources.alert2.items.length;
    sources.alert2.items = sources.alert2.items.filter(alert2Relevant);
    alert2Cut = before - sources.alert2.items.length;
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
  // อ่านหมวดที่ผู้ใช้จัดเอง (override) + ตัวอย่างล่าสุด (few-shot) จาก flags KV ของหน้า IR
  let userCats = {}, catExamples = [];
  try {
    if (env && env.FLAGS_KV) {
      const fraw = await env.FLAGS_KV.get(envPrefix(env) + "flags:ir");
      if (fraw) { const fs = JSON.parse(fraw); userCats = fs.cats || {}; catExamples = fs.catlog || []; }
    }
  } catch {}

  const aiDiag = {};
  try { await enrichCategories(env, sources, prevCat, allowAI, aiDiag, userCats, catExamples); } catch (e) { aiDiag.fatal = String((e && e.message) || e).slice(0, 200); }

  // สะสมข่าว/alert ลง KV (ในประเทศ/ต่างประเทศ 2 วัน · ปศุสัตว์ 10 วัน) แม้หลุดจากฟีดแล้ว
  const arDiag = {};
  try { await mergeArchives(env, sources, arDiag); } catch (e) { arDiag.fatal = String((e && e.message) || e).slice(0, 200); }

  // ถ้ารอบนี้บาง source ดึงได้ 0 (Google Alert ส่งว่างชั่วคราว) → คงของเดิมไว้
  if (pj) {
    for (const key of SOURCES) {
      if (sources[key].items.length === 0 && pj.sources?.[key]?.items?.length) {
        sources[key].items = pj.sources[key].items;
        sources[key].stale = true;
      }
    }
  }

  const body = JSON.stringify({ generatedAt: new Date().toISOString(), sources, errors, ai: aiDiag, archive: arDiag, alerts: alertMeta, alert2Cut });
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
