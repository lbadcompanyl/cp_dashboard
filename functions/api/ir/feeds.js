// Cloudflare Pages Function: GET /api/ir/feeds
// ดึง+แปลง RSS ทุกฟีดของหน้า IR (News · Alert 1 · Alert 2) ฝั่งเซิร์ฟเวอร์ → JSON (แก้ CORS)
// stale-while-revalidate: ส่งของใน cache ทันที แล้วรีเฟรชเบื้องหลัง

import feeds from "../../../ir-feeds.config.js";
import { parseGeneric } from "../trend/_lib/parser.js";
import { readDecisions } from "../allow.js";
import {
  noiseReason, dropNoiseAfterArchive, setAllowed, setBlocked, isAllowed, cpExamples, cpEvidence,
  hostOf, outletOf, termPattern, realCP, hasFalseCP, dropFalseCP,
  CP_BRANDS, CP_FALSE_RE, LATIN_TERM,
  stripMarks, normLink, buildMatchers, anyTermIn, highlightedTerms,
  WEAK_TERMS, ROUNDUP_RE, hlWrap,
} from "../_lib/noise.js";

const EDGE_TTL = 3600;
const FRESH_MS = 3 * 60 * 1000; // ของใน cache เก่ากว่า 3 นาที → รีเฟรชเบื้องหลัง
const FETCH_TIMEOUT = 12000;
const CACHE_VER = "71"; // bump: ตัดหน้าอีเวนต์/นิทรรศการ
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
// คำสั้นกำกวมที่มักโผล่ในชื่อ/สถานที่/เมนู (เช่น "วัดไก่เตี้ย") → อย่าเชื่อถ้าเจอคำเดียว
const AMBIG_KW = new Set(["ไก่", "หมู", "ไข่", "เนื้อ", "ปลา", "ข้าว", "นก", "กุ้ง"]);
// มั่นใจว่าเข้าหมวดจริง = มีคำบริบท "ไม่กำกวม" ของหมวดนั้นอย่างน้อย 1 คำ
function confidentHit(it, cat) {
  const hay = ((it.title || "") + " " + (it.snippet || "")).toLowerCase();
  return CAT_KW[cat].some((w) => !AMBIG_KW.has(w) && hay.includes(w));
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
    "other = none of the above (religion, crime, entertainment, obituary, general)\n" +
    "Judge by the MAIN topic. A word appearing only inside a name or place " +
    "(e.g. a temple named วัดไก่เตี้ย) does NOT put it in a category — use other.\n" +
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
      // เชื่อ keyword ทันทีเฉพาะเมื่อ match 1 หมวด "แบบมั่นใจ" (มีคำบริบทไม่กำกวม)
      if (hits.length === 1 && confidentHit(it, hits[0])) { it.cat = hits[0]; it.byAI = false; continue; }
      it.cat = hits[0] || "other"; it.byAI = false; // provisional
      toAI.push(it); // 0 / กำกวม / ≥2 หมวด → ส่ง AI ตัดสิน (อาจตีกลับเป็น other)
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
    if (src.startsWith("alert")) for (const it of merged) if (!it.fromNews) it.sourceLabel = outletOf(it.link) || it.sourceLabel; // refresh label สำนักข่าว (กันของเก่าใน KV ค้าง "ซีพี")
    sources[src].items = merged;
    out[src] = merged;
    diag[src] = merged.length;
  }
  return out; // ยังไม่เขียน KV — รอด่านตรวจรอบสองตัดของเก่าที่ไม่ผ่านออกก่อน แล้วค่อย saveArchives()
}

// เขียนคลังข่าวลง KV — แยกจาก mergeArchives เพื่อให้ด่านตรวจรอบสองตัดของออกจากคลังได้ก่อนเขียน
// (ยังเขียน KV ครั้งเดียวต่อ build เท่าเดิม)
async function saveArchives(env, out, diag) {
  const kv = env && env.FLAGS_KV;
  if (!kv || !out) return;
  try { await kv.put(envPrefix(env) + ARCHIVE_KEY, JSON.stringify(out)); diag.saved = true; diag.env = env.APP_ENV || "prod"; } catch (e) { diag.err = String((e && e.message) || e).slice(0, 120); }
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
        ((j.alert2CutList || []).length
          ? (j.alert2CutList || []).map((d) => `   ✂ [alert2/no-context] ${d.title}\n      ${d.link}`).join("\n") + "\n"
          : "") +
        `ตัด related-block (keyword ไม่อยู่ในเนื้อจริง): alert1=${j.alertVerify?.alert1 ?? "-"}  alert2=${j.alertVerify?.alert2 ?? "-"}\n` +
        ((j.alertVerify?.dropped || []).length
          ? (j.alertVerify.dropped || []).map((d) => `   ✂ [${d.src}${d.why ? "/" + d.why : ""}]${d.terms?.length ? " (" + d.terms.join(",") + ")" : ""} ${d.title}\n      ${d.link}`).join("\n") + "\n"
          : "") +
        `ตัดข่าว merge ที่ไม่ match keyword ปัจจุบัน (prune): alert1=${(j.pruned?.alert1 || []).length}  alert2=${(j.pruned?.alert2 || []).length}\n` +
        (["alert1", "alert2"].flatMap((s2) => (j.pruned?.[s2] || []).map((d) => `   ✂ [${s2}/prune] ${d.title}\n      ${d.link}`)).join("\n") + "\n").replace(/^\n$/, "") +
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

// แกะ query จาก title ของฟีด Google Alert: "<title>Google Alert - QUERY</title>" → "QUERY"
function alertQueryFromXml(xml) {
  const m = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  const t = m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
  const i = t.indexOf(" - "); // ตัด prefix "Google Alert - " / "การแจ้งเตือนของ Google - "
  return i >= 0 ? t.slice(i + 3).trim() : "";
}

// map โดเมน → ชื่อสำนักข่าว (จาก feed config); ไม่รู้จัก → ใช้โดเมน
const OUTLET_BY_HOST = {};
for (const _f of feeds) { try { const _h = new URL(_f.url).hostname.replace(/^www\./, ""); if (!_h.includes("bing.com") && !OUTLET_BY_HOST[_h]) OUTLET_BY_HOST[_h] = _f.label; } catch {} }
// ไฮไลต์ทุก term ที่ตามอยู่ในข้อความเดียว: ลบ marker เดิมแล้วครอบใหม่ทีเดียว (longest-first กันครอบซ้อน)
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
// ตัดข่าว merge (fromNews) ที่ไม่ match term ปัจจุบันแล้ว — self-heal เมื่อแก้ brand list · native ไม่แตะ
function pruneStaleMerged(sources, alertSrc, terms) {
  const s = sources[alertSrc];
  const cut = []; // รายการที่ตัด (โชว์ใน ?errors)
  if (!s || !terms || !terms.length) return cut;
  const matchers = buildMatchers(terms);
  s.items = s.items.filter((it) => {
    if (!it.fromNews) return true;
    // alert1 ยึดพาดหัวอย่างเดียว — เกณฑ์เดียวกับ mergeNewsIntoAlert (ดูหมายเหตุที่นั่น)
    const hay = (alertSrc === "alert1" ? (it.title || "") : (it.title || "") + " " + (it.snippet || "")).toLowerCase().replace(/\[\[\/?hl\]\]/g, "");
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
// ไฮไลต์ทุก item ใน alert (native + merge + ค้าง KV) ให้สม่ำเสมอ ไม่พึ่ง <b> ของ Google
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
function mergeNewsIntoAlert(sources, alertSrc, newsKeys, terms) {
  if (!sources[alertSrc] || !terms.length) return 0;
  const matchers = buildMatchers(terms);
  const have = new Set(sources[alertSrc].items.map((it) => normLink(it.link)));
  let added = 0;
  for (const nk of newsKeys) for (const it of (sources[nk]?.items || [])) {
    // ⚠️ คอลัมน์ CP (alert1) ตัดสินจาก "พาดหัว" เท่านั้น — สรุปของฟีดเป็น "ข่าวที่เกี่ยวข้อง" ของใบอื่น
    // เกณฑ์นี้ต้องตรงกับ pruneStaleMerged เป๊ะ ไม่งั้นดึงเข้า-ลบทิ้งสลับกันทุกรอบ
    const hay = (alertSrc === "alert1" ? (it.title || "") : (it.title || "") + " " + (it.snippet || "")).toLowerCase();
    const matched = anyTermIn(hay, matchers);
    if (!matched) continue;
    const nl = normLink(it.link);
    if (have.has(nl)) continue;
    have.add(nl);
    sources[alertSrc].items.push({ ...it, fromNews: true, title: hlWrap(it.title, matched), snippet: hlWrap(it.snippet, matched) });
    added++;
  }
  return added;
}

async function buildAndStore(cache, cacheKey, env, allowAI) {
  // ⚠️ ต้องตั้งใหม่ทุกครั้งที่ build — Workers ใช้โมดูลเดิมซ้ำข้าม request
  // cpEx = ตัวอย่างสอน AI จากที่เจ้าของกด ↩/⚑ — ได้จาก blob เดียวกัน ไม่มี KV read เพิ่ม
  let cpEx = [];
  try { const d = await readDecisions(env); setAllowed(d.allowed); setBlocked(d.blocked); cpEx = cpExamples(d); }
  catch { setAllowed({}); setBlocked({}); }
  const sources = {};
  for (const s of SOURCES) sources[s] = { label: LABELS[s], items: [], feedCount: 0 };
  for (const f of feeds) { const t = targetSource(f); if (sources[t]) sources[t].feedCount++; }
  const errors = [];
  const alertMeta = []; // สถานะสดของฟีด alert รอบนี้ (แยก "Google ส่งว่าง/รีเซ็ต" ออกจาก "cache เราค้าง")
  const queriesBySource = {}; // เก็บ query ที่แกะจาก title ของฟีด Alert (auto-sync ปุ่ม 🔤)

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
        const q = alertQueryFromXml(xml); // แกะ query จาก "<title>Google Alert - ...</title>"
        if (q) (queriesBySource[target] = queriesBySource[target] || []).push(q);
      }
      for (const it of items) {
        it.group = f.group || "gen"; // biz | intl | gen
        it.region = f.region || "th"; // th | intl
        // some feeds (e.g. Workpoint) give relative links — resolve against the feed URL
        if (it.link && it.link.startsWith("/")) { try { it.link = new URL(it.link, f.url).href; } catch {} }
        // Alert: โชว์สำนักข่าวจริงจากโดเมน (ไม่ใช่ label ของ query เช่น "ซีพี") · News: ใช้ label ฟีด
        it.sourceLabel = f.source.startsWith("alert") ? (outletOf(it.link) || f.label) : (it.sourceLabel || f.label);
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
  // แนบ query ที่แกะจาก title ฟีด Alert → client เอาไป sync ปุ่ม 🔤
  for (const s of SOURCES) if (queriesBySource[s]) sources[s].queries = queriesBySource[s];

  // ตัด noise คอลัมน์ปศุสัตว์: ต้องมีบริบทอุตสาหกรรม ≥1 คำ (กันข่าวอาหาร/อาชญากรรมที่แค่มี หมู/ไก่)
  let alert2Cut = 0;
  const alert2CutList = []; // รายการที่ตัด (โชว์ใน ?errors)
  if (sources.alert2) {
    const before = sources.alert2.items.length;
    sources.alert2.items = sources.alert2.items.filter((it) => {
      const ok = alert2Relevant(it);
      if (!ok && alert2CutList.length < 40) alert2CutList.push({ title: (it.title || "").replace(/\[\[\/?hl\]\]/g, ""), link: it.link });
      return ok;
    });
    alert2Cut = before - sources.alert2.items.length;
  }

  // ไฮบริด: บวกข่าวจาก News (ในปท.+ตปท.) ที่ match keyword ของคอลัมน์ (เสถียรขึ้น ไม่พึ่ง Google Alert อย่างเดียว)
  mergeNewsIntoAlert(sources, "alert1", ["newsth", "newsintl"], CP_BRANDS);
  mergeNewsIntoAlert(sources, "alert2", ["newsth", "newsintl"], ALERT2_KEEP);

  // ตัด related-block: พาดหัว (ฟรี) + เนื้อข่าวจริง articleBody เฉพาะ background (allowAI) · ก่อน archive เพื่อไม่สะสม noise
  const alertVerify = {};
  try { await verifyAlertItems(cache, sources, alertVerify, allowAI, env, cpEx); } catch (e) { alertVerify.err = String((e && e.message) || e).slice(0, 120); }

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
  let archiveOut = null;
  try { archiveOut = await mergeArchives(env, sources, arDiag); } catch (e) { arDiag.fatal = String((e && e.message) || e).slice(0, 200); }

  // ด่านตรวจรอบสอง — verify รอบแรกทำงาน "ก่อน" archive ของเก่าใน KV ที่เก็บไว้ตอนด่านยังไม่มี
  // (หรือคนละรุ่น) จึงไหลกลับเข้าคอลัมน์โดยไม่ผ่านด่านเลย (เจอจริง: ข่าวหุ้น/ข่าวแกร็บ 14 ส.ค. 2026
  // — 'ซีพี' อยู่แค่ในบล็อกข่าวแนะนำของหน้า ไม่ได้อยู่ในเนื้อ) · ตรวจเฉพาะใบที่ยังไม่มีธง vfy
  // แล้วตัดออกจาก "คลัง" ด้วย ไม่ใช่แค่หน้าจอ — จะได้ไม่วนกลับมาให้ตัดใหม่ทุกรอบ
  try {
    const pending = {};
    for (const s2 of ["alert1", "alert2"]) {
      const un = (sources[s2]?.items || []).filter((it) => it.vfy !== VFY_VER);
      if (un.length) pending[s2] = { items: un };
    }
    if (Object.keys(pending).length) {
      const v2 = {};
      await verifyAlertItems(cache, pending, v2, allowAI, env, cpEx);
      const cut = new Set((v2.dropped || []).map((d) => normLink(d.link || "")));
      if (cut.size) for (const s2 of ["alert1", "alert2"]) {
        if (sources[s2]) sources[s2].items = sources[s2].items.filter((it) => !cut.has(normLink(it.link)));
        if (archiveOut && archiveOut[s2]) archiveOut[s2] = archiveOut[s2].filter((it) => !cut.has(normLink(it.link)));
      }
      if ((v2.dropped || []).length) alertVerify.dropped = [...(alertVerify.dropped || []), ...v2.dropped];
      alertVerify.pass2 = { alert1: v2.alert1 || 0, alert2: v2.alert2 || 0 };
    }
  } catch (e) { alertVerify.err2 = String((e && e.message) || e).slice(0, 120); }
  try { await saveArchives(env, archiveOut, arDiag); } catch (e) { arDiag.err = String((e && e.message) || e).slice(0, 120); }

  // กวาดประกาศงาน/อสังหา/หน้าขายของที่ค้างอยู่ใน KV ออกด้วย (verify ทำงานก่อน archive)
  const swept = {};
  try { dropNoiseAfterArchive(sources, swept); } catch (e) { swept.err = String((e && e.message) || e).slice(0, 120); }

  // ตัดข่าว merge ที่ไม่ match แล้ว (กัน brand เก่าค้าง) + ไฮไลต์ keyword ให้สม่ำเสมอ — หลัง merge+archive
  const pruned = {};
  try {
    pruned.alert1 = pruneStaleMerged(sources, "alert1", CP_BRANDS);
    pruned.alert2 = pruneStaleMerged(sources, "alert2", ALERT2_KEEP);
    highlightAlertItems(sources, "alert1", CP_BRANDS);
    highlightAlertItems(sources, "alert2", ALERT2_KEEP);
  } catch {}

  // ยุบข่าวซ้ำหลายสำนัก (พาดหัวคล้าย+เวลาใกล้กัน) เหลือใบเดียว แนบลิงก์สำนักอื่นใน it.also — เฉพาะผลแสดงผล ไม่แตะ KV
  try { for (const s of ["newsth", "newsintl", "alert1", "alert2"]) collapseDupes(sources, s); } catch {}

  // ถ้ารอบนี้บาง source ดึงได้ 0 (Google Alert ส่งว่างชั่วคราว) → คงของเดิมไว้
  if (pj) {
    for (const key of SOURCES) {
      if (sources[key].items.length === 0 && pj.sources?.[key]?.items?.length) {
        sources[key].items = pj.sources[key].items;
        sources[key].stale = true;
      }
    }
  }

  const body = JSON.stringify({ generatedAt: new Date().toISOString(), sources, errors, ai: aiDiag, archive: arDiag, alerts: alertMeta, alert2Cut, alert2CutList, alertVerify, swept, pruned });
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





// คืนเหตุผลถ้าเป็น noise (gallery/pr/daily/shopping) มิฉะนั้น null
// ข่าวที่เจ้าของกด "↩ เอากลับ" ไว้ที่หน้า /admin/ — ต้องรอดทุกด่าน


// คอลัมน์ alert2 (ปศุสัตว์/การค้า) พาดหัวมักใช้คำแปร (เลี้ยงหมู/เขียงหมู) หรือชื่อย่อ (TU) ไม่ตรงคำที่ Google match
// เก็บไว้ถ้าพาดหัวมีคำ "เฉพาะโดเมน" เหล่านี้ (เลี่ยงคำโดด หมู/ไก่/ไข่ ที่โผล่ในข่าวอาชญากรรม) · alert2 ผ่านตัวกรอง anchor มาแล้ว
const ALERT2_KEEP = [
  // คู่แข่ง (ชื่อย่อ/อังกฤษ ↔ ไทย)
  "เบทาโกร", "betagro", "ไทยฟู้ดส์", "thai foods", "tfg", "ไทยยูเนี่ยน", "thai union", "tu ",
  "gfpt", "บางกอกแร้นช์", "br group", "แหลมทอง", "ลีพัฒนา", "ซันฟีด",
  // ภาษี/การค้า (คำพ้อง + คำแปรที่เจอในพาดหัว)
  "ภาษีนำเข้า", "ภาษีสหรัฐ", "ภาษีทรัมป์", "กำแพงภาษี", "ภาษีตอบโต้", "มาตรา 301", "section 301", "ทุ่มตลาด", "tariff",
  "ขึ้นภาษี", "เว้นภาษี", "ลดภาษี", "ภาษีสินค้า", "สินค้าเกษตร", "ภาคเกษตร", "ส่งออกเกษตร",
  // ความตกลง/นโยบายการค้า + คำที่เป็น "หัวข้อข่าวจริง" (ไม่ใช่ชื่อกระทรวง — กันดึง related-block กลับ)
  "เอฟทีเอ", "fta", "acfta", "rcep", "เปิดตลาดให้", "เปิดเสรี", "เจาะตลาด", "ทูตพาณิชย์", "ผลไม้แปรรูป",
  "ผลิตล้นเกิน", "overcapacity", "สินค้า gi", "สิ่งบ่งชี้ทางภูมิศาสตร์", // เก็บข่าวเทรดมหภาค (จีน overcapacity) + สินค้า GI/การค้าท้องถิ่น
  // สมาคมผู้ประกอบการ (ปศุสัตว์/อาหาร) — พาดหัวข่าวจริงมักอ้างถึง
  "สมาคมผู้เลี้ยง", "สมาคมไก่", "สมาคมผู้เลี้ยงไก่", "สมาคมผู้เลี้ยงสุกร", "สมาคมกุ้ง", "สมาคมผู้ผลิตอาหารสัตว์", "one health",
  // ปศุสัตว์/ราคา/เลี้ยง (คำประสม + คำแปรในพาดหัว — ไม่ใช่คำโดด หมู/ไก่/ไข่)
  "ราคาหมู", "ราคาสุกร", "หมูหน้าฟาร์ม", "หมูเป็น", "เลี้ยงหมู", "เลี้ยงสุกร", "เขียงหมู", "ต้นทุนเลี้ยง", "ต้นทุนการเลี้ยง",
  "ราคาไก่", "เลี้ยงไก่", "เขียงไก่", "ไก่เนื้อ", "ไก่ไข่", "ราคาไข่", "ราคากุ้ง", "เลี้ยงกุ้ง",
  // วัตถุดิบอาหารสัตว์/ธัญพืช (feed) — ในโดเมน alert2 ปลอดภัย
  "อาหารสัตว์", "ข้าวโพด", "ถั่วเหลือง", "กากถั่วเหลือง", "ปลาป่น", "ปศุสัตว์", "สัตว์ปีก",
  // เนื้อสัตว์เถื่อน/ลักลอบ (คำประสมแคบ — ไม่ใช้ "เถื่อน" โดดกันดูดบุหรี่/สินค้าเถื่อน)
  "หมูเถื่อน", "ไก่เถื่อน", "เนื้อเถื่อน", "ซากสัตว์", "เครื่องในไก่", "เครื่องในหมู", "ตีนไก่",
  // โรค
  "หมอคางดำ", "ไข้หวัดนก", "อหิวาต์", "asf", "h5n1", "prrs",
];
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
      else if (n && typeof n.description === "string" && n.description.length > 20) out.push(n.description); // เผื่อไม่มี articleBody แต่มี description ของบทความเอง
    }
  }
  return out.join("  ").replace(/<[^>]+>/g, " ").toLowerCase();
}
// เช็คว่า "เนื้อข่าวจริง" มีคำเฉพาะโดเมน (keep) ไหม — cache เนื้อที่ดึงได้ต่อลิงก์ 24 ชม. (ไม่ fetch ซ้ำ)
async function bodyHasKeep(cache, link, keep) {
  if (!keep || !keep.length) return false;
  const vkey = new Request("https://verify.local/ir5?u=" + encodeURIComponent(link), { method: "GET" });
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
  // ⚠️ แยก "อ่านเนื้อข่าวแล้วไม่เจอคำ" ออกจาก "อ่านเนื้อข่าวไม่ได้เลย"
  // ของเดิมคืน false เหมือนกันทั้งคู่ → ข่าวที่เว็บโหลดไม่ขึ้น/มี paywall/หมดเวลา
  // ถูกตัดทิ้งทั้งที่เราไม่เคยอ่านมันเลย · null = ตัดสินไม่ได้ → ให้ผ่านไว้ก่อน
  if (!body) return null;
  // ⚠️ ตัดชื่อลวงออกจากเนื้อข่าวก่อนเสมอ — ข่าวทรัมป์เอ่ยถึง "ทรูธโซเชียล" ทั้งบทความ
  // ถ้าไม่ตัด body.includes("ทรู") จะจริงตลอด แล้วข่าวคนละเรื่องหลุดเข้าคอลัมน์ CP
  const hay = dropFalseCP(body);
  return keep.some((t) => hay.includes(t));
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
// ชั้น 3 fetch เฉพาะ background (allowFetch) → cold ใช้พาดหัวอย่างเดียว (ตัด) แล้ว background ค่อยกู้คืนถ้าเนื้อจริงมีคำโดเมน
const BODY_FETCH_MAX = 12; // เพดานยิงอ่านเนื้อข่าวต่อ 1 build — กันชนโควตา subrequest 50 ของ Cloudflare
const VFY_VER = 2; // รุ่นของด่านตรวจ — ใบที่ผ่านแล้วติดธง it.vfy ไม่ต้องตรวจซ้ำทุกรอบ (บวกเลขนี้ = สั่งตรวจของเก่าใหม่ทั้งคลัง)
const AI_CP_MAX = 12; // เพดานใบที่ถาม AI ต่อ 1 build — คำตอบถูกจำไว้ ใบเดิมจึงถามครั้งเดียวตลอด

// ถาม AI แล้ว "จำคำตอบไว้ 7 วัน" ต่อข่าว 1 ใบ — ไม่งั้นทุก build จะถามซ้ำทั้งคอลัมน์
// (คอลัมน์ละ ~50 ใบ × ทุกชั่วโมง × ทุกแดชบอร์ด = เรียก AI หลายพันครั้ง/วัน)
// ⚠️ ใช้ edge cache ไม่ใช่ KV — โควตาเขียน KV มีแค่ 1,000 ครั้ง/วันใช้ร่วมทั้งโปรเจกต์
async function cachedHeadlineIsCP(cache, env, titles, links, examples) {
  const out = new Array(titles.length).fill(null);
  const keyOf = (l) => new Request("https://verify.local/cpai1?u=" + encodeURIComponent(l || ""), { method: "GET" });
  const ask = [];
  await Promise.all(titles.map(async (_, k) => {
    try { const hit = await cache.match(keyOf(links[k])); if (hit) { const j = await hit.json(); if (typeof j.y === "boolean") out[k] = j.y; return; } } catch {}
    ask.push(k);
  }));
  if (ask.length) {
    const ans = await aiHeadlineIsCP(env, ask.map((k) => titles[k]), examples);
    if (ans) await Promise.all(ask.map(async (k, j) => {
      out[k] = ans[j];
      try {
        await cache.put(keyOf(links[k]), new Response(JSON.stringify({ y: ans[j] }),
          { headers: { "content-type": "application/json", "cache-control": "public, max-age=604800" } }));
      } catch {}
    }));
  }
  return out; // null = ตัดสินไม่ได้ (ผู้เรียกต้องเก็บใบนั้นไว้)
}

// ชั้น 4 ของคอลัมน์ CP — เปิดอ่านเนื้อข่าวไม่ได้ (เว็บบล็อกบอต/ช้า/paywall) เดิม "ปล่อยผ่านตาบอด"
// ให้ AI (โมเดลเดียวกับที่จัดหมวดข่าว) อ่านพาดหัวตัดสินแทน — ดูหมายเหตุเต็มที่ trend/feeds.js
// · AI ตอบไม่ครบ/ล้ม/ไม่มี binding → ปล่อยผ่านเหมือนเดิม (พลาดฝั่งเก็บ ดีกว่าทำข่าวจริงหาย)
async function aiHeadlineIsCP(env, titles, examples) {
  if (!env || !env.AI || !titles.length) return null;
  // few-shot จากที่เจ้าของกด ↩/⚑ มาแล้ว — ดู cpExamples ใน _lib/noise.js
  const ex = (examples || []).map((e) => `- "${e.t}" => ${e.y ? "y" : "n"}`).join("\n");
  const prompt =
    "ต่อไปนี้คือพาดหัวข่าว จงตอบว่าแต่ละพาดหัวเป็นข่าวเกี่ยวกับบริษัทในเครือเจริญโภคภัณฑ์ (ซีพี) หรือไม่\n" +
    "บริษัทในเครือ เช่น CP, CPF, CP ALL, เซเว่น อีเลฟเว่น, CP Axtra, แม็คโคร, โลตัส, ทรู, เจียไต๋\n" +
    "ข่าวที่แค่เอ่ยชื่อหุ้นผ่านๆ ในภาพรวมตลาด ไม่นับว่าเป็นข่าวของเครือ\n" +
    (ex ? "\nเจ้าของเคยตัดสินแบบนี้มาแล้ว ให้ยึดแนวเดียวกัน:\n" + ex + "\n" : "") +
    "\nตอบบรรทัดละข้อ เป็น y (ใช่) หรือ n (ไม่ใช่) เท่านั้น\n\n" +
    titles.map((t, i) => `${i + 1}. ${t}`).join("\n");
  try {
    const out = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 20 + titles.length * 8 });
    const ans = String((out && out.response) || "").split("\n").map((l) => {
      const m = l.trim().toLowerCase().match(/^(?:\d+[.)]?\s*)?([yn])\b/);
      return m ? m[1] === "y" : null;
    }).filter((v) => v !== null);
    return ans.length === titles.length ? ans : null; // นับไม่ครบ = อย่าเดา
  } catch { return null; }
}
async function verifyAlertItems(cache, sources, diag, allowFetch, env, cpEx) {
  diag.dropped = []; // รายการข่าวที่ถูกตัด (ไว้ debug ผ่าน ?errors)
  for (const src of ["alert1", "alert2"]) {
    if (!sources[src]) continue;
    const items = sources[src].items;
    const extra = src === "alert1" ? CP_BRANDS : src === "alert2" ? ALERT2_KEEP : []; // คำเฉพาะโดเมน (เครือ CP / คู่แข่ง-ภาษี-ปศุสัตว์)
    const verdict = items.map((it) => {
      if (isAllowed(it)) return { ok: true, mark: true }; // เจ้าของสั่งคืนไว้ที่หน้า /admin/ — ผ่านทุกด่าน
      const bare = (it.title || "").replace(/\[\[\/?hl\]\]/g, "");
      const title = bare.toLowerCase();
      const noise = noiseReason(it, title, src); // ตัดโฆษณา/รายงานประจำวัน/แกลเลอรี/PR ก่อนเช็ค related-block
      if (noise) return { ok: false, why: noise, terms: [], bare, link: it.link };
      if (ROUNDUP_RE.test(title)) return { ok: false, why: "roundup", terms: [], bare, link: it.link };
      // CP มาจากชื่อลวงล้วน ๆ (บีแอลซีพี/ซีพีเอ็น) → ไม่ใช่ข่าวเครือ CP
      const rawHay = bare + " " + (it.snippet || "");
      // ยึดพาดหัวอย่างเดียวเหมือน noiseReason — สรุปของฟีดเป็น "ข่าวที่เกี่ยวข้อง" เชื่อไม่ได้
      if (src === "alert1" && hasFalseCP(bare) && !realCP(bare)) return { ok: false, why: "false-cp", terms: [], bare, link: it.link };
      // ⚠️ คอลัมน์ CP ไม่เข้าข่ายทางลัดนี้ — ของที่ดึงมาจากคอลัมน์ข่าว match ได้จาก "สรุป"
      // ด้วย ถ้าปล่อยผ่านตรงนี้ กฎ "ชื่อเครือต้องอยู่ในพาดหัว" ข้างล่างจะไม่มีโอกาสทำงานเลย
      if (it.fromNews && src !== "alert1") return { ok: true, mark: true }; // ข่าวจาก News ที่ match keyword คอลัมน์แล้ว (ไฮบริด) — ผ่าน noise พอ
      const terms = highlightedTerms(it).filter((t) => !WEAK_TERMS.has(t)); // ตัดคำ match ที่อ่อนเกิน (bare cp) ทิ้ง
      // ⚠️ คอลัมน์ CP: ต้องมี "ชื่อเครือ CP จริง" เท่านั้น ไม่ใช่แค่คำที่ Google ไฮไลต์
      // Google ไฮไลต์ "เศษคำ" ได้ — เจอจริง: F-16s inter[cep]t ... ของ Al Jazeera
      // "cep" ไม่ได้อยู่ใน WEAK_TERMS และมันก็อยู่ในพาดหัวจริงๆ ด่านเดิมจึงปล่อยผ่าน
      // ไล่เติมทีละคำเป็นการวิ่งไล่ไม่จบ — เปลี่ยนเป็นถามว่า "เป็นชื่อเครือ CP ไหม" แทน
      if (src === "alert1") {
        // ชั้น 1 — ชื่อเครืออยู่ใน "พาดหัว" **และยืนเป็นคำของตัวเอง**
        // ถ้าไปเจอกลางคำอื่น (เอ็ม-ซีพี-ไอ) ไม่ให้ผ่านฟรี ส่งไปให้ AI อ่านตัดสิน (ชั้น 4)
        const ev = cpEvidence(bare);
        if (ev === "strong") return { ok: true, mark: true };
        if (ev === "weak") return { ok: "ai", why: "ai-weak-cp", terms, bare, link: it.link };
        // ⚠️ **ห้ามตัดสินจาก it.snippet** (เจ้าของสั่ง 13 ส.ค. 2026)
        // สรุปที่ติดมากับฟีดเป็น "ข่าวที่เกี่ยวข้อง" ไม่ใช่เนื้อข่าวใบนี้ — ชื่อเครือที่โผล่ตรงนั้น
        // จึงไม่ได้แปลว่าข่าวใบนี้เป็นข่าวของเครือ (เจอจริง: "7 ยักษ์ผูกเหลาฟาม์าห์ เขย่าธุรกิจร้านยา"
        // กับข่าวมรณกรรม "จูหรงจี้ อดีตนายกฯ จีน" หลุดเข้าคอลัมน์ CP เพราะชื่อเครืออยู่ในสรุป)
        // ตกลงกันว่า **ให้ไปอ่านเนื้อข่าวจริงแทน** (ชั้น 3 — bodyHasKeep ยิงเปิดหน้าข่าวเอง)
        return { ok: "body", why: "ไม่มีชื่อเครือ CP ในพาดหัว", terms, bare, link: it.link };
      }
      // เช็คทั้ง title ดิบ + แบบแปลงเครื่องหมายเป็นช่องว่าง — พาดหัวแบบ 'TU'อัพเป้า ให้คำอย่าง "tu " match ติด
      const ntitle = " " + title.replace(/[^\p{L}\p{N}]+/gu, " ") + " ";
      if (terms.some((t) => title.includes(t) || ntitle.includes(t)) || extra.some((t) => title.includes(t) || ntitle.includes(t))) return { ok: true, mark: true }; // ชั้น 1
      return { ok: "body", why: "ไม่อยู่ในพาดหัว/เนื้อ", terms, bare, link: it.link }; // ค้างไว้เช็คเนื้อ (ชั้น 3)
    });
    const needBody = [];
    const needAI = []; // ชื่อเครือโผล่กลางคำอื่น — ข้ามการอ่านเนื้อ ให้ AI ดูพาดหัวพอ
    verdict.forEach((v, i) => { if (v.ok === "body") needBody.push(i); else if (v.ok === "ai") needAI.push(i); });
    if (allowFetch && needBody.length) {
      // เพดานต่อ build — ด่านนี้ตรวจของเก่าจากคลังด้วย (รอบสอง) รอบแรกหลัง release มี backlog
      // เยอะ ยิงหมดทีเดียวจะชนโควตา subrequest ของ Cloudflare · เกินเพดาน = เก็บไว้ก่อน
      // "โดยไม่ติดธง" รอบถัดไปค่อยตรวจต่อ จนกว่าจะหมด
      const toFetch = needBody.slice(0, BODY_FETCH_MAX);
      needBody.slice(BODY_FETCH_MAX).forEach((i) => { verdict[i].ok = true; });
      const hits = await mapPoolResults(toFetch, 6, (i) => bodyHasKeep(cache, items[i].link, extra));
      // อ่านไม่ได้ (null) = ไม่รู้ → เก็บไว้โดยไม่ติดธง · เจอคำ = เก็บ+ติดธง · อ่านแล้วไม่เจอ = ตัด
      toFetch.forEach((i, k) => { verdict[i].ok = hits[k] !== false; if (hits[k] === true) verdict[i].mark = true; });
      // ชั้น 4 — เฉพาะคอลัมน์ CP: ใบที่เปิดอ่านเนื้อไม่ได้ ให้ AI อ่านพาดหัวตัดสินแทนการปล่อยผ่าน
      if (src === "alert1") {
        const blind = toFetch.filter((_, k) => hits[k] === null);
        const ans = blind.length ? await aiHeadlineIsCP(env, blind.map((i) => verdict[i].bare), cpEx) : null;
        if (ans) blind.forEach((i, k) => { if (!ans[k]) { verdict[i].ok = false; verdict[i].why = "ai-no-cp"; } else { verdict[i].mark = true; } });
      }
    } else {
      // รอบนี้ยังไม่มีสิทธิ์ยิงอ่านเนื้อข่าว — เก็บไว้ก่อน รอบเบื้องหลังจะมาตัดสินให้เอง
      needBody.forEach((i) => { verdict[i].ok = true; });
    }
    // ใบที่ชื่อเครืออยู่กลางคำอื่น — ถาม AI (จำคำตอบไว้ ถามครั้งเดียวต่อข่าว 1 ใบ)
    if (needAI.length) {
      if (allowFetch) {
        const pick = needAI.slice(0, AI_CP_MAX);
        needAI.slice(AI_CP_MAX).forEach((i) => { verdict[i].ok = true; }); // เกินเพดาน = รอรอบหน้า
        const ans = await cachedHeadlineIsCP(cache, env, pick.map((i) => verdict[i].bare),
                                             pick.map((i) => items[i].link), cpEx);
        pick.forEach((i, k) => {
          if (ans[k] === null) { verdict[i].ok = true; return; }  // AI ตอบไม่ได้ → เก็บไว้ ไม่ติดธง
          verdict[i].ok = ans[k];
          if (ans[k]) verdict[i].mark = true;
        });
      } else {
        needAI.forEach((i) => { verdict[i].ok = true; }); // ยังยิงไม่ได้ รอบเบื้องหลังตัดสินเอง
      }
    }
    const kept = [];
    verdict.forEach((v, i) => {
      if (v.ok === true) { if (v.mark) items[i].vfy = VFY_VER; kept.push(items[i]); }
      else diag.dropped.push({ src, why: v.why, terms: v.terms || [], title: v.bare, link: v.link, at: (items[i] && items[i].publishedAt) || "" });
    });
    diag[src] = items.length - kept.length;
    sources[src].items = kept;
  }
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
