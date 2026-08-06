// GET /api/trend/yttrends?geo=TH
// คลิปมาแรงบน YouTube รายประเทศ
//
// ⚠️ YouTube ปิดหน้า Trending ในเมนูเมื่อ ก.ค. 2025 และ API ทางการ
// (videos.list chart=mostPopular) ต้องมี API key + โควตา จึงไม่ใช้
//
// อ่านจากหลายแหล่งเรียงกัน แหล่งไหนได้ก่อนใช้อันนั้น:
//   1. Invidious  — JSON สะอาด แต่เป็น instance อาสาสมัคร ล่มได้
//   2. Piped      — JSON เหมือนกัน คนละเครือข่าย
//   3. YouTube ตรง — แกะ ytInitialData จากหน้า /feed/trending (ทางสุดท้าย)
// ทั้งหมดฟรี ไม่ต้องมี key
//
// ⚠️ ทุกแหล่งเป็นทางอ้อม โครงสร้างเปลี่ยนเมื่อไหร่ก็พังได้
// จึงมี KV ค้างของเก่าไว้เสิร์ฟแทนหน้าว่าง เหมือน xtrends.js
//
// 💧 งบ KV: edge cache 30 นาที + ถือว่าของใน KV ที่อายุไม่เกิน 60 นาทียังสด
// → เขียน KV อย่างมาก 24 ครั้ง/วัน/ประเทศ ไม่ว่าจะมี colo กี่ที่ก็ตาม

const FETCH_TIMEOUT = 7000;
const EDGE_TTL = 1800;          // 30 นาที — คลิปมาแรงขยับช้า
const KV_FRESH = 60 * 60 * 1000; // ของใน KV อายุไม่เกิน 1 ชม. = ยังสด ไม่ต้องยิงใหม่
const KV_TTL = 12 * 3600;
const MAX_ITEMS = 30;

// instance สาธารณะ — ล่มได้เป็นเรื่องปกติ จึงใส่ไว้หลายตัวและมี YouTube ตรงปิดท้าย
//
// ⚠️ instance พวกนี้ "เกิดใหม่/ตายไป" ตลอด ลิสต์ที่ hardcode ไว้จะตกยุคเสมอ
// จึงมีขั้นที่ 2 คือถามรายชื่อสดจากไดเรกทอรีทางการ (ดู discoverInvidious/discoverPiped)
const INVIDIOUS = [
  "inv.nadeko.net", "invidious.nerdvpn.de", "yewtu.be",
  "invidious.jing.rocks", "invidious.privacyredirect.com", "iv.melmac.space",
];
const PIPED = [
  "pipedapi.kavin.rocks", "pipedapi.adminforge.de",
  "api.piped.private.coffee", "pipedapi.drgns.space",
];
const MAX_DISCOVERED = 6; // ยิงพร้อมกันได้ แต่ไม่ต้องยิงทั้งโลก

export async function onRequest(context) {
  const url = new URL(context.request.url);
  // รหัสประเทศ 2 ตัวเท่านั้น — ค่านี้ต่อเข้า URL ปลายทาง อย่าปล่อยให้ใส่อะไรก็ได้
  const geo = (url.searchParams.get("geo") || "TH").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || "TH";

  const cache = caches.default;
  const key = new Request(url.origin + `/api/trend/yttrends?geo=${geo}`, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return browserCopy(hit);

  const env = context.env || {};
  const kv = env.FLAGS_KV;
  const kvKey = (env.APP_ENV ? String(env.APP_ENV) + ":" : "") + `yttrends:${geo}`;

  // ของใน KV ยังสดอยู่ไหม — ถ้าสด ใช้เลย ไม่ต้องยิงเน็ตและไม่ต้องเขียน KV
  let stale = null;
  if (kv) {
    try {
      const raw = await kv.get(kvKey);
      if (raw) {
        stale = JSON.parse(raw);
        const age = Date.now() - Date.parse(stale.fetchedAt || 0);
        if (Number.isFinite(age) && age >= 0 && age < KV_FRESH && (stale.items || []).length) {
          const edge = json({ ...stale, fromKv: true }, 200, EDGE_TTL);
          context.waitUntil(cache.put(key, edge.clone()));
          return browserCopy(edge);
        }
      }
    } catch {}
  }

  const attempts = [];
  const won = await race(geo, attempts);
  if (won) {
    const body = {
      geo,
      source: won.id,
      fetchedAt: new Date().toISOString(),
      count: won.items.length,
      items: won.items,
      meta: { attempts },
    };
    if (kv) context.waitUntil(kv.put(kvKey, JSON.stringify(body), { expirationTtl: KV_TTL }).catch(() => {}));
    const edge = json(body, 200, EDGE_TTL);
    context.waitUntil(cache.put(key, edge.clone()));
    return browserCopy(edge);
  }

  // ดึงไม่ได้เลย → เสิร์ฟของเก่าดีกว่าโชว์หน้าว่าง
  if (stale && (stale.items || []).length) {
    return browserCopy(json({ ...stale, stale: true, meta: { ...(stale.meta || {}), attempts } }, 200, 300));
  }
  return browserCopy(json({ geo, count: 0, items: [], error: "no source available", meta: { attempts } }, 200, 120));
}

// ยิงทุก instance "พร้อมกัน" แล้วเอาอันที่ตอบมาก่อน
//
// ⚠️ ห้ามไล่ยิงทีละอันเด็ดขาด — instance อาสาสมัครล่มบ่อยและมักล่มแบบ "ค้าง" ไม่ใช่ตอบ error
// ไล่ทีละอัน 5 แหล่ง × timeout 7 วิ = ผู้ใช้รอ 35 วินาทีก่อนเห็นอะไร
// ยิงพร้อมกันแล้วเอาอันแรกที่ได้ = ช้าสุดเท่ากับ timeout เดียว
async function race(geo, attempts) {
  // รอบ 1 — instance ที่รู้จัก ไม่ต้องเสียเวลาถามไดเรกทอรีก่อน
  const seed = [];
  for (const h of INVIDIOUS) seed.push({ id: `invidious:${h}`, run: () => fromInvidious(h, geo) });
  for (const h of PIPED) seed.push({ id: `piped:${h}`, run: () => fromPiped(h, geo) });
  let won = await firstOk(seed, attempts);
  if (won) return won;

  // รอบ 2 — ลิสต์ที่ hardcode ตายหมด ขอรายชื่อสดจากไดเรกทอรีทางการแล้วลองใหม่
  // (นี่คือตัวกันไม่ให้คอลัมน์ตายถาวรเวลา instance ย้ายบ้านกันทั้งวงการ)
  const known = new Set([...INVIDIOUS, ...PIPED]);
  const fresh = [];
  const [inv, pip] = await Promise.all([
    discoverInvidious(attempts).catch(() => []),
    discoverPiped(attempts).catch(() => []),
  ]);
  for (const h of inv) if (!known.has(h)) fresh.push({ id: `invidious*:${h}`, run: () => fromInvidious(h, geo) });
  for (const h of pip) if (!known.has(h)) fresh.push({ id: `piped*:${h}`, run: () => fromPiped(h, geo) });
  if (fresh.length) {
    won = await firstOk(fresh.slice(0, MAX_DISCOVERED * 2), attempts);
    if (won) return won;
  }

  // รอบ 3 — JSON ล่มหมดจริง แกะหน้า YouTube เอง
  // /feed/trending ถูกถอดออกตั้งแต่ ก.ค. 2025 จึงลองหน้าแรกรายประเทศด้วย
  return await firstOk(
    [
      { id: "youtube:trending", run: () => fromYouTubeHtml(geo, "/feed/trending") },
      { id: "youtube:home", run: () => fromYouTubeHtml(geo, "/") },
    ],
    attempts
  );
}

// ไดเรกทอรีทางการของ Invidious — คืนเฉพาะตัวที่เปิด API และเป็น https
async function discoverInvidious(attempts) {
  try {
    const arr = await fetchJson("https://api.invidious.io/instances.json?sort_by=health");
    const hosts = (Array.isArray(arr) ? arr : [])
      .filter((e) => e && e[1] && e[1].type === "https" && e[1].api === true)
      .map((e) => String(e[0]))
      .slice(0, MAX_DISCOVERED);
    attempts.push({ source: "discover:invidious", got: hosts.length });
    return hosts;
  } catch (e) {
    attempts.push({ source: "discover:invidious", err: String((e && e.message) || e).slice(0, 120) });
    return [];
  }
}

// ไดเรกทอรีของ Piped — api_url เป็น URL เต็ม ตัดเหลือ host
async function discoverPiped(attempts) {
  try {
    const arr = await fetchJson("https://piped-instances.kavin.rocks/");
    const hosts = (Array.isArray(arr) ? arr : [])
      .map((e) => {
        try { return new URL(e && e.api_url).host; } catch { return ""; }
      })
      .filter(Boolean)
      .slice(0, MAX_DISCOVERED);
    attempts.push({ source: "discover:piped", got: hosts.length });
    return hosts;
  } catch (e) {
    attempts.push({ source: "discover:piped", err: String((e && e.message) || e).slice(0, 120) });
    return [];
  }
}

// คืนตัวแรกที่สำเร็จ · ถ้าไม่มีเลยคืน null (ไม่ throw) และบันทึกสาเหตุลง attempts ทุกตัว
async function firstOk(runners, attempts) {
  if (!runners.length) return null;
  const tasks = runners.map((r) =>
    r.run().then(
      (items) => {
        if (!items || items.length < 3) {
          attempts.push({ source: r.id, got: (items || []).length, err: "too few" });
          throw new Error("too few");
        }
        attempts.push({ source: r.id, got: items.length });
        return { id: r.id, items };
      },
      (e) => {
        attempts.push({ source: r.id, err: String((e && e.message) || e).slice(0, 120) });
        throw e;
      }
    )
  );
  try {
    return await Promise.any(tasks);
  } catch {
    return null; // ล่มหมด — AggregateError ไม่ต้องโยนต่อ เพราะบันทึกไว้ใน attempts แล้ว
  }
}

/* ---------- แหล่งข้อมูล ---------- */

async function fromInvidious(host, geo) {
  const arr = await fetchJson(`https://${host}/api/v1/trending?region=${geo}&type=Default`);
  if (!Array.isArray(arr)) throw new Error("not an array");
  return normalize(arr.map((v) => ({
    id: v && v.videoId,
    title: v && v.title,
    channel: (v && v.author) || "",
    views: num(v && v.viewCount),
    published: num(v && v.published) ? num(v.published) * 1000 : 0,
  })));
}

async function fromPiped(host, geo) {
  const arr = await fetchJson(`https://${host}/trending?region=${geo}`);
  if (!Array.isArray(arr)) throw new Error("not an array");
  return normalize(arr.map((v) => ({
    // Piped ส่ง url มาเป็น "/watch?v=<id>"
    id: idFromUrl(v && v.url),
    title: v && v.title,
    channel: (v && v.uploaderName) || "",
    views: num(v && v.views),
    published: num(v && v.uploaded),
  })));
}

async function fromYouTubeHtml(geo, path = "/feed/trending") {
  const sep = path.includes("?") ? "&" : "?";
  const html = await fetchText(
    `https://www.youtube.com${path}${sep}gl=${geo}&hl=th&persist_gl=1&persist_hl=1`
  );
  const out = [];
  const seen = new Set();
  // แกะ ytInitialData แบบไม่ต้อง parse ทั้งก้อน — ตัดเป็นช่วงๆ ตาม videoRenderer
  const chunks = html.split('"videoRenderer":{');
  for (let i = 1; i < chunks.length && out.length < 200; i++) {
    const c = chunks[i].slice(0, 4000);
    const idm = c.match(/"videoId":"([\w-]{8,20})"/);
    if (!idm || seen.has(idm[1])) continue;
    // ชื่อคลิปอยู่ใน "title":{"runs":[{"text":"…"}]} หรือ "title":{"simpleText":"…"}
    const tm = c.match(/"title":\{(?:"runs":\[\{)?"(?:text|simpleText)":"((?:[^"\\]|\\.)*)"/);
    if (!tm) continue;
    const cm = c.match(/"ownerText":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/);
    const vm = c.match(/"viewCountText":\{"simpleText":"((?:[^"\\]|\\.)*)"/);
    seen.add(idm[1]);
    out.push({
      id: idm[1],
      title: unesc(tm[1]),
      channel: cm ? unesc(cm[1]) : "",
      views: vm ? num(unesc(vm[1]).replace(/[^\d]/g, "")) : 0,
      published: 0,
    });
  }
  return normalize(out);
}

/* ---------- ทำให้เป็นรูปเดียวกัน ---------- */

function normalize(raw) {
  const seen = new Set();
  const out = [];
  for (const r of raw || []) {
    const id = String((r && r.id) || "");
    const title = collapse(r && r.title);
    if (!/^[\w-]{8,20}$/.test(id) || !title || title.length > 200) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      rank: out.length + 1,
      id,
      title,
      channel: collapse(r.channel).slice(0, 80),
      views: Number.isFinite(r.views) && r.views > 0 ? r.views : 0,
      published: Number.isFinite(r.published) && r.published > 0 ? r.published : 0,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

function idFromUrl(u) {
  const m = String(u || "").match(/[?&]v=([\w-]{8,20})/) || String(u || "").match(/youtu\.be\/([\w-]{8,20})/);
  return m ? m[1] : "";
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function collapse(s) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
}
// ถอด escape ของสตริงใน JSON (ก, \", \\ ฯลฯ) โดยไม่ให้พังถ้ารูปแบบเพี้ยน
function unesc(s) {
  try {
    return JSON.parse('"' + String(s).replace(/\n/g, "") + '"');
  } catch {
    return String(s).replace(/\\(.)/g, "$1");
  }
}

/* ---------- ดึงข้อมูล ---------- */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchRes(target, accept) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(target, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "th,en;q=0.9" },
    });
    if (!res.ok) throw new Error("http " + res.status);
    return res;
  } finally {
    clearTimeout(timer);
  }
}
async function fetchJson(target) {
  return await (await fetchRes(target, "application/json")).json();
}
async function fetchText(target) {
  return await (await fetchRes(target, "text/html,application/xhtml+xml")).text();
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
