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
const AI_BATCH = 10;            // ก้อนเล็กแม่นกว่า — โมเดล 3B หลุดลำดับง่ายถ้าขอทีละ 25
const AI_MAX_CALLS = 12;        // กันเรียกรัวตอนแบ่งก้อนย่อย (โควตา Workers AI มีจำกัด)
const CAT_TTL = 7 * 24 * 3600;  // หมวดของแท็กไม่ค่อยเปลี่ยน เก็บยาวได้
// ⚠️ บวกเลขนี้เมื่อแก้วิธีจัดหมวด ไม่งั้น response เดิม (ที่ยังติดหมวดผิด) ถูกเสิร์ฟต่อ
const DATA_VER = "5";
const CATS = ["ent", "sport", "pol", "biz", "news", "other"];
// ⚠️ บวกเลขต่อท้ายเมื่อแก้วิธีจัดหมวด — หมวดที่จัดผิดถูก cache ไว้ 7 วัน
// ถ้าไม่เปลี่ยน key ของผิดเดิมจะถูกเสิร์ฟต่อไปทั้งที่แก้โค้ดแล้ว
const CAT_MAP_KEY = "xcatmap3"; // เก็บหมวดของทุกแท็กรวมใน key เดียว

// เดาหมวดจากคำก่อน ประหยัด AI call (ตัวที่เดาไม่ได้ค่อยส่งไปถาม)
//
// ⚠️ ห้ามใช้คำสั้นๆ ที่ไม่มีขอบเขต — เคยใส่ "ep" ไว้ในหมวดบันเทิง (ชนทุกคำที่มี ep)
// และ "x " / "ss" / "fw" ในหมวดแบรนด์ ทำให้แท็กที่ไม่เกี่ยวถูกจัดผิดเป็นประจำ
// ภาษาไทยไม่มี \b ให้ใช้ จึงต้องเลือกคำที่ยาวพอจะไม่ชนคำอื่นเอง
const CAT_RE = [
  ["pol",   /ศาล|รัฐบาล|นายก|สภา|เลือกตั้ง|ม็อบ|พรรค|รัฐมนตรี|กฎหมาย|อภิปราย|ยุบสภา|ครม/i],
  ["news",  /ด่วน|อุบัติเหตุ|ไฟไหม้|แผ่นดินไหว|น้ำท่วม|เสียชีวิต|จับกุม|คดี|ชันสูตร/i],
  ["sport", /\bfc\b|\bcup\b|world ?cup|league|\bmatch\b|\bvs\b|tournament|ฟุตบอล|วอลเลย์|มวย|ทีมชาติ|ลีก|แข่งขัน/i],
  ["biz",   /\bsale\b|promotion|collection|collab|โปรโมชั่น|ลดราคา|เปิดตัว|คอลแลบ/i],
  ["ent",   /concert|world ?tour|fanmeet|fansign|debut|comeback|\bmv\b|\bost\b|selca|\bhbd\b|birthday|spoiler|teaser|trailer|\bep\s?\d|\bตอน\s?\d|คอนเสิร์ต|ซีรีส์|ละคร|หนัง|เพลง|แฟนมีต|แฟนไซน์|เดบิวต์|คัมแบ็ก|ตอนพิเศษ|ปิดกล้อง|บวงสรวง|วันเกิด/i],
];

const CAT_RE_MAP = Object.fromEntries(CAT_RE);

function guessCat(name) {
  for (const [k, re] of CAT_RE) if (re.test(name)) return k;
  return null;
}

// ตรวจคำตอบของ AI อีกชั้น
//
// ⚠️ โมเดลเล็กชอบโยนแฮชแท็กแฟนด้อมไทยไปเป็น "การเมือง/ข่าว" เพราะไม่รู้จักชื่อคน
// เจอจริง: #JoongArchen · #จีบเอสเสรี · #NuNewClue02 ถูกจัดเป็นการเมือง/ข่าว
// สองหมวดนี้ต่างจากหมวดอื่นตรงที่ "มีคำเฉพาะของมันชัดเจน" (ศาล/รัฐบาล/ด่วน/จับกุม)
// ถ้าไม่มีคำพวกนั้นอยู่เลย = ไม่มีหลักฐาน อย่าเชื่อโมเดล ให้ตกไปเป็นบันเทิงซึ่ง
// เป็นค่าที่ถูกที่สุดสำหรับเทรนด์ X ไทยโดยธรรมชาติ
function vetoCat(name, cat) {
  if ((cat === "pol" || cat === "news") && !CAT_RE_MAP[cat].test(name)) return "ent";
  return cat;
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
    "MOST Thai trending hashtags are fandom: artist names, ship names, fan events. Prefer ent by default.\n" +
    "Use pol ONLY for actual government/court/protest topics, and news ONLY for actual breaking events.\n" +
    "A Thai personal name you do not recognise is almost never politics — it is an artist. Use ent.\n" +
    "Examples: \"#JoongArchen\" = ent (actor pair) · \"#LinglingxKwongPastry\" = biz (artist x brand) · " +
    "\"#NuNewClue02\" = ent (fan event) · \"ยุบสภา\" = pol · \"แผ่นดินไหวเชียงราย\" = news\n" +
    `Output EXACTLY ${names.length} lines, one code per line, in the SAME order as the input.\n` +
    "Each line must contain ONLY the code word and nothing else. No numbering, no explanation, no blank lines.\n\n" +
    list;
  const out = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 400 });
  const text = String((out && (out.response || out.result)) || "").toLowerCase();

  // ⚠️ อ่านทีละบรรทัด ไม่ใช่กวาดทั้งก้อน
  // เดิมใช้ text.match() กวาดทั้งข้อความ ถ้า AI แถมคำนำหน้าหรือตอบไม่ครบ
  // ลำดับจะเลื่อนทั้งชุด แล้วทุกแท็กหลังจากนั้นได้หมวดของตัวอื่นไปแทน
  // (เจอจริง: #ออฟโรด · ENGFA · #รักษ์ ถูกจัดเป็น "การเมือง" ทั้งหมด)
  // รับเฉพาะบรรทัดที่เป็น "โค้ดล้วนๆ" (เผื่อเลขลำดับนำหน้า) — บรรทัดอธิบายอย่าง
  // "Here are the news categories:" จะถูกทิ้ง ไม่ถูกนับเป็นคำตอบจนลำดับเลื่อน
  const codes = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^(?:\d+[.)]\s*)?(ent|sport|pol|biz|news|other)\b[\s.]*$/);
    if (m) codes.push(m[1]);
  }
  // จำนวนไม่ตรง = จับคู่ไม่ได้อย่างมั่นใจ → ทิ้งทั้งชุดดีกว่าเดาผิดแล้ว cache ไว้ 7 วัน
  if (codes.length !== names.length) {
    throw new Error(`count mismatch ${codes.length}/${names.length}`);
  }
  return codes;
}

// เติมหมวดให้ทุกเทรนด์: KV -> เดาจากคำ -> ถาม AI
//
// ⚠️ เก็บหมวดของทุกแท็กรวมใน key เดียว ไม่แยก key ต่อแท็ก
// KV แผนฟรีเขียนได้ 1,000 ครั้ง/วัน และ FLAGS_KV ตัวนี้ใช้ร่วมกับ flag/archive/
// related ทั้งโปรเจกต์ — ถ้าเขียนทีละแท็ก (50 ครั้ง/รอบ) จะกินโควตาหมดใน
// ไม่กี่ชั่วโมงแล้วพังทั้งระบบ แบบรวม key = อ่าน 1 เขียน 1 เท่ากับ endpoint อื่น
async function addCategories(trends, env, ctx, diag) {
  const kv = env && env.FLAGS_KV;
  const mapKey = (env.APP_ENV ? String(env.APP_ENV) + ":" : "") + CAT_MAP_KEY;

  let map = {};
  if (kv) {
    try { map = JSON.parse((await kv.get(mapKey)) || "{}") || {}; } catch { map = {}; }
  }

  const ask = [];
  let dirty = false;
  for (const t of trends) {
    const cached = map[t.name];
    if (cached && CATS.includes(cached)) { t.cat = cached; continue; }
    const g = guessCat(t.name);
    if (g) { t.cat = g; map[t.name] = g; dirty = true; continue; }
    t.cat = "other"; // ค่าเริ่มต้นระหว่างรอ AI
    ask.push(t);
  }
  diag.cached = trends.length - ask.length;
  diag.asked = 0;
  // ผูก Workers AI ไว้หรือยัง — ถ้าไม่ได้ผูก แท็กจะตกเป็น "อื่นๆ" ทั้งหมดแบบเงียบๆ
  // จนดูเหมือนโค้ดจัดหมวดพัง ทั้งที่มันไม่เคยถูกเรียกเลย (IR ก็มีธงนี้ด้วยเหตุผลเดียวกัน)
  diag.bound = !!(env && env.AI);
  diag.toAsk = ask.length;

  const st = { dirty, calls: 0 };
  if (env.AI && ask.length) {
    for (let i = 0; i < ask.length; i += AI_BATCH) {
      await classifyInto(env, ask.slice(i, i + AI_BATCH), map, diag, st, 0);
    }
  }
  dirty = st.dirty;
  diag.aiCalls = st.calls;

  // ตัดของเก่าทิ้งไม่ให้ blob โตไม่รู้จบ (KV จำกัด 25MB/ค่า แต่ยิ่งเล็กยิ่งเร็ว)
  const keys = Object.keys(map);
  if (keys.length > 600) {
    const trimmed = {};
    for (const k of keys.slice(-400)) trimmed[k] = map[k];
    map = trimmed;
    dirty = true;
  }
  diag.mapSize = Object.keys(map).length;

  if (kv && dirty) {
    ctx.waitUntil(kv.put(mapKey, JSON.stringify(map), { expirationTtl: CAT_TTL }).catch(() => {}));
  }
}

// จัดหมวดก้อนหนึ่ง — ถ้าคำตอบไม่ตรงจำนวน ให้ผ่าครึ่งแล้วลองใหม่แทนที่จะทิ้งทั้งชุด
//
// ⚠️ เคยทิ้งทั้งชุดเมื่อจำนวนไม่ตรง ผลคือแท็ก 48 จาก 50 ตกไปอยู่ "อื่นๆ" หมด
// การทิ้งกันหมวดผิดได้จริง แต่ถ้าไม่มีทางกู้เลยก็เท่ากับไม่มีหมวด — ต้องมีทั้งสองอย่าง
async function classifyInto(env, chunk, map, diag, st, depth) {
  if (!chunk.length || st.calls >= AI_MAX_CALLS) return;
  st.calls++;
  try {
    const cats = await classifyBatch(env, chunk.map((x) => x.name));
    chunk.forEach((t, j) => {
      const c = vetoCat(t.name, cats[j]);
      if (!c || !CATS.includes(c)) return;
      t.cat = c;
      map[t.name] = c;
      st.dirty = true;
      diag.asked++;
    });
  } catch (e) {
    diag.aiErr = String((e && e.message) || e).slice(0, 100);
    if (depth >= 2 || chunk.length <= 2) return; // ก้อนเล็กมากแล้วยังไม่ได้ ก็ปล่อยเป็น "อื่นๆ"
    const mid = Math.ceil(chunk.length / 2);
    diag.splits = (diag.splits || 0) + 1;
    await classifyInto(env, chunk.slice(0, mid), map, diag, st, depth + 1);
    await classifyInto(env, chunk.slice(mid), map, diag, st, depth + 1);
  }
}

// เวลาที่ "ต้นทาง" อัปเดตเทรนด์ล่าสุด — เอาไว้ยืนยันว่าข้อมูลสดจริง ไม่ใช่หน้าค้าง
//
// ⚠️ เราเดาจาก <time> ตัวแรกในหน้า ซึ่งอาจเป็นเวลาของอย่างอื่นก็ได้ (เช่นวันที่บทความ)
// การโชว์เวลาผิดแย่กว่าไม่โชว์เลย เพราะฟีเจอร์นี้มีไว้ให้คนเชื่อถือ — จึงรับเฉพาะ
// เวลาที่ "อยู่ในอดีต และไม่เกิน 24 ชม." เท่านั้น นอกนั้นคืน null ไปเลย
const MAX_SOURCE_AGE = 24 * 3600 * 1000;

function sane(ms) {
  const age = Date.now() - ms;
  return age >= -60000 && age <= MAX_SOURCE_AGE ? new Date(ms).toISOString() : null;
}

function extractSourceTime(html) {
  const iso = html.match(/<time[^>]*datetime=["']([^"']+)["']/i);
  if (iso) { const d = Date.parse(iso[1]); if (!isNaN(d)) return sane(d); }
  const mins = html.match(/(\d+)\s*(?:minute|min)s?\s*ago/i);
  if (mins) return sane(Date.now() - parseInt(mins[1], 10) * 60000);
  const hrs = html.match(/(\d+)\s*hours?\s*ago/i);
  if (hrs) return sane(Date.now() - parseInt(hrs[1], 10) * 3600000);
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

  const env = context.env || {};

  // ⚠️ ใส่สถานะ "ผูก Workers AI แล้วหรือยัง" ลงใน cache key ด้วย
  // ไม่งั้นพอเพิ่งผูก binding เข้าไป ผลลัพธ์เดิม (ที่ยังไม่มีหมวด) จะถูกเสิร์ฟต่ออีก 15 นาที
  // แล้วดูเหมือนผูกไม่สำเร็จ — เคยเจอกับ YT_API_KEY มาแล้วครั้งหนึ่ง
  const cache = caches.default;
  const key = new Request(
    url.origin + `/api/trend/xtrends?geo=${geo}&_v=${DATA_VER}&_ai=${env.AI ? 1 : 0}`,
    { method: "GET" }
  );
  const hit = await cache.match(key);
  if (hit) return browserCopy(hit);

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
