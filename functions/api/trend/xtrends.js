// GET /api/trend/xtrends?geo=thailand
// เทรนด์บน X (Twitter) รายประเทศ — ดึงจากเว็บมิเรอร์เพราะ endpoint ทางการของ X
// อยู่ใน tier Pro (~$5,000/เดือน) ไม่คุ้มกับแดชบอร์ดตัวเดียว
//
// getdaytrends = ตัวหลัก (หน้าเล็ก 71KB สะอาด) · trends24 = ตัวสำรอง (305KB)
// ทั้งคู่ทดสอบแล้วว่าดึงได้จาก Cloudflare edge (5 ส.ค. 2026)
//
// ⚠️ เป็นการอ่านหน้าเว็บ ไม่ใช่ API ทางการ — โครงสร้างเปลี่ยนเมื่อไหร่ก็พังได้
// จึงมี 3 กลยุทธ์การแกะ + สลับไปตัวสำรอง + KV ค้างของเก่าไว้เสิร์ฟแทน

const FETCH_TIMEOUT = 10000;
const EDGE_TTL = 900;         // เทรนด์ขยับทุก ~30 นาที cache ที่ edge 15 นาทีพอ
const KV_TTL = 6 * 3600;      // เก็บของเก่าไว้ 6 ชม. เผื่อทั้งสองแหล่งล่ม
const MAX_TRENDS = 50;

// จัดหมวดด้วย Workers AI (โมเดลเดียวกับที่ /api/ir/feeds ใช้จัดหมวดข่าว)
const AI_MODEL = "@cf/meta/llama-3.2-3b-instruct";
const AI_BATCH = 25;            // รวมหลายคำต่อ 1 call
const CAT_TTL = 7 * 24 * 3600;  // หมวดของแท็กไม่ค่อยเปลี่ยน เก็บยาวได้
export const CATS = ["ent", "sport", "pol", "biz", "news", "other"];

// เดาหมวดจากคำก่อน ประหยัด AI call (ตัวที่เดาไม่ได้ค่อยส่งไปถาม)
const CAT_KW = {
  ent:   ["concert", "mv", "selca", "fanmeet", "ost", "ep", "live", "คอนเสิร์ต", "ซีรีส์", "ละคร", "หนัง", "เพลง", "ตอนพิเศษ", "ปิดกล้อง", "บวงสรวง", "แฟนมีต"],
  sport: ["fc", "cup", "league", "match", "vs", "ฟุตบอล", "วอลเลย์", "มวย", "แข่ง", "ทีมชาติ"],
  pol:   ["ศาล", "รัฐบาล", "นายก", "สภา", "เลือกตั้ง", "ม็อบ", "พรรค", "รัฐมนตรี", "กฎหมาย"],
  biz:   ["sale", "promotion", "collection", "fw", "ss", "x ", "โปร", "ลดราคา", "เปิดตัว", "คอลแลบ"],
  news:  ["ด่วน", "อุบัติเหตุ", "ไฟไหม้", "แผ่นดินไหว", "น้ำท่วม", "เสียชีวิต", "จับกุม"],
};

function guessCat(name) {
  const hay = name.toLowerCase();
  for (const k of Object.keys(CAT_KW)) if (CAT_KW[k].some((w) => hay.includes(w))) return k;
  return null;
}

// ถาม AI เป็นชุด — คืน array หมวดตามลำดับที่ส่งไป
async function classifyBatch(env, names) {
  const list = names.map((n, i) => `${i + 1}. ${n}`).join("\n");
  const prompt =
    "Classify each Thai/English social media trending topic into ONE category code:\n" +
    "ent = entertainment: artists, idols, K-pop, series, drama, movies, music, fandom events\n" +
    "sport = sports, matches, teams, athletes\n" +
    "pol = politics, government, courts, protests, policy\n" +
    "biz = brands, products, sales, promotions, collaborations, business\n" +
    "news = breaking news, accidents, disasters, crime\n" +
    "other = none of the above\n" +
    "Most Thai trending hashtags are fandom/entertainment — prefer ent when it names a person, show or fan event.\n" +
    "Reply with ONLY the codes, one per line, in the SAME order. No numbers, no other text.\n\n" +
    list;
  const out = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 400 });
  const text = String((out && (out.response || out.result)) || "").toLowerCase();
  const found = text.match(/\b(ent|sport|pol|biz|news|other)\b/g) || [];
  if (!found.length) throw new Error("no cats");
  return found;
}

// เติมหมวดให้ทุกเทรนด์: KV -> เดาจากคำ -> ถาม AI (แล้วเก็บ KV ไว้ใช้ซ้ำ)
async function addCategories(trends, env, ctx, diag) {
  const kv = env && env.FLAGS_KV;
  const pre = env.APP_ENV ? String(env.APP_ENV) + ":" : "";
  const ask = [];

  for (const t of trends) {
    const cached = kv ? await kv.get(pre + "xcat:" + t.name).catch(() => null) : null;
    if (cached && CATS.includes(cached)) { t.cat = cached; continue; }
    const g = guessCat(t.name);
    if (g) { t.cat = g; if (kv) ctx.waitUntil(kv.put(pre + "xcat:" + t.name, g, { expirationTtl: CAT_TTL }).catch(() => {})); continue; }
    t.cat = "other"; // ค่าเริ่มต้นระหว่างรอ AI
    ask.push(t);
  }
  diag.cached = trends.length - ask.length;
  diag.asked = 0;

  if (!env.AI || !ask.length) return;
  for (let i = 0; i < ask.length; i += AI_BATCH) {
    const chunk = ask.slice(i, i + AI_BATCH);
    try {
      const cats = await classifyBatch(env, chunk.map((x) => x.name));
      chunk.forEach((t, j) => {
        const c = cats[j];
        if (!c || !CATS.includes(c)) return;
        t.cat = c;
        diag.asked++;
        if (kv) ctx.waitUntil(kv.put(pre + "xcat:" + t.name, c, { expirationTtl: CAT_TTL }).catch(() => {}));
      });
    } catch (e) { diag.aiErr = String((e && e.message) || e).slice(0, 100); }
  }
}

// เวลาที่ "ต้นทาง" อัปเดตเทรนด์ล่าสุด — เอาไว้ยืนยันว่าข้อมูลสดจริง ไม่ใช่หน้าค้าง
function extractSourceTime(html) {
  const iso = html.match(/<time[^>]*datetime=["']([^"']+)["']/i);
  if (iso) { const d = new Date(iso[1]); if (!isNaN(d)) return d.toISOString(); }
  const mins = html.match(/(\d+)\s*(?:minute|min)s?\s*ago/i);
  if (mins) return new Date(Date.now() - parseInt(mins[1], 10) * 60000).toISOString();
  const hrs = html.match(/(\d+)\s*hours?\s*ago/i);
  if (hrs) return new Date(Date.now() - parseInt(hrs[1], 10) * 3600000).toISOString();
  return null;
}

const SOURCES = [
  { id: "getdaytrends", url: (g) => `https://getdaytrends.com/${g}/` },
  { id: "trends24",     url: (g) => `https://trends24.in/${g}/` },
];

export async function onRequest(context) {
  const url = new URL(context.request.url);
  // จำกัดเป็น slug ปลอดภัย — ค่านี้ถูกต่อเข้า URL ปลายทาง อย่าปล่อยให้ใส่อะไรก็ได้
  const geo = (url.searchParams.get("geo") || "thailand").toLowerCase().replace(/[^a-z-]/g, "").slice(0, 40) || "thailand";

  const cache = caches.default;
  const key = new Request(url.origin + `/api/trend/xtrends?geo=${geo}`, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return browserCopy(hit);

  const env = context.env || {};
  const kv = env.FLAGS_KV;
  const kvKey = (env.APP_ENV ? String(env.APP_ENV) + ":" : "") + `xtrends:${geo}`;

  const attempts = [];
  for (const src of SOURCES) {
    try {
      const html = await fetchText(src.url(geo));
      const { trends, strategy } = parseTrends(html, src.id);
      attempts.push({ source: src.id, bytes: html.length, got: trends.length, strategy });
      if (trends.length >= 5) {
        const catDiag = {};
        try { await addCategories(trends, env, context, catDiag); }
        catch (e) { catDiag.err = String((e && e.message) || e).slice(0, 100); }
        const body = {
          geo,
          source: src.id,
          fetchedAt: new Date().toISOString(),
          sourceUpdatedAt: extractSourceTime(html), // null ถ้าหน้านั้นไม่ได้บอกเวลาไว้
          count: trends.length,
          trends,
          meta: { strategy, attempts, cats: catDiag },
        };
        if (kv) context.waitUntil(kv.put(kvKey, JSON.stringify(body), { expirationTtl: KV_TTL }).catch(() => {}));
        const edge = json(body, 200, EDGE_TTL);
        context.waitUntil(cache.put(key, edge.clone()));
        return browserCopy(edge);
      }
    } catch (e) {
      attempts.push({ source: src.id, err: String((e && e.message) || e).slice(0, 120) });
    }
  }

  // ทั้งสองแหล่งพัง → เสิร์ฟของเก่าจาก KV ดีกว่าโชว์หน้าว่าง
  try {
    const stale = kv ? await kv.get(kvKey) : null;
    if (stale) {
      const old = JSON.parse(stale);
      return browserCopy(json({ ...old, stale: true, meta: { ...(old.meta || {}), attempts } }, 200, 300));
    }
  } catch {}

  return browserCopy(json({ geo, count: 0, trends: [], error: "all sources failed", meta: { attempts } }, 200, 120));
}

/* ---------- ดึงหน้าเว็บ ---------- */

async function fetchText(target) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(target, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "th,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error("http " + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- แกะเทรนด์ ----------
   เทรนด์ไม่ได้เป็น # เสมอไป หลายอันเป็นวลีธรรมดา ("สเปน พบ อาร์เจนตินา")
   จึงห้ามกรองด้วย # และต้องอาศัยโครงสร้างลิงก์แทน                        */

function parseTrends(html, sourceId) {
  const strategies = [
    ["search-link", bySearchLink],   // ลิงก์ไปหน้าค้นหาของ X — สัญญาณชัดที่สุด
    ["trend-path", byTrendPath],     // ลิงก์ภายในแบบ /trend/<slug>
    ["list-item", byListItem],       // รายการใน <ol>/<ul> เป็นทางสุดท้าย
  ];
  for (const [name, fn] of strategies) {
    const out = clean(fn(html));
    if (out.length >= 5) return { trends: out, strategy: `${sourceId}:${name}` };
  }
  return { trends: [], strategy: `${sourceId}:none` };
}

// <a href="https://twitter.com/search?q=..."> หรือ x.com/search
function bySearchLink(html) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']*(?:twitter|x)\.com\/search[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 200) {
    out.push({ label: stripTags(m[2]), href: decodeEntities(m[1]) });
  }
  return out;
}

// <a href="/trend/xxx"> หรือ /thailand/trend/xxx
function byTrendPath(html) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']*\/trend\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 200) {
    out.push({ label: stripTags(m[2]), href: decodeEntities(m[1]) });
  }
  return out;
}

// <ol>/<ul> ที่มี <a> ข้างใน — หยาบสุด ใช้เมื่อสองอันบนไม่เข้าเป้า
function byListItem(html) {
  const out = [];
  const lists = html.match(/<(?:ol|ul)\b[\s\S]{0,20000}?<\/(?:ol|ul)>/gi) || [];
  for (const list of lists) {
    const items = list.match(/<li\b[\s\S]*?<\/li>/gi) || [];
    if (items.length < 5) continue;                       // เมนู/nav มักสั้น ข้ามไป
    for (const li of items) {
      const a = li.match(/<a\b[^>]*(?:href=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/a>/i);
      if (a) out.push({ label: stripTags(a[2]), href: decodeEntities(a[1] || "") });
    }
    if (out.length >= 10) break;
  }
  return out;
}

/* ---------- ทำความสะอาด ---------- */

// คำที่เป็นเมนู/ปุ่ม ไม่ใช่เทรนด์ — เจอจริงในผลทดสอบ
const NOT_A_TREND = /^(home|about|contact|privacy|terms|login|sign\s?up|menu|search|more|next|prev|top|all|settings|thailand|worldwide|ไทย|หน้าแรก)$/i;
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function clean(raw) {
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    const label = collapse(r.label);
    if (!label || label.length < 2 || label.length > 80) continue;
    if (NOT_A_TREND.test(label) || HEX_COLOR.test(label)) continue;
    if (/^\d+$/.test(label)) continue;                    // เลขอันดับหลุดมา
    const k = label.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      rank: out.length + 1,
      name: label,
      isHashtag: label.startsWith("#"),
      url: `https://x.com/search?q=${encodeURIComponent(label)}&src=trend_click`,
    });
    if (out.length >= MAX_TRENDS) break;
  }
  return out;
}

function stripTags(s) {
  return decodeEntities(String(s || "").replace(/<[^>]*>/g, " "));
}
function collapse(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}
function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
function safeChar(code) {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

/* ---------- response ---------- */

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
