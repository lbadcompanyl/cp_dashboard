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

// ⚠️ บวกเลขนี้ทุกครั้งที่ "โครงของ items เปลี่ยน" (เพิ่ม/แก้ field, เปลี่ยนวิธีเรียง)
// ไม่งั้นของเก่าใน KV/edge cache จะถูกเสิร์ฟต่ออีกเป็นชั่วโมงทั้งที่โค้ดใหม่ขึ้นไปแล้ว
// เคยพลาดมาแล้ว: แก้วิธีเรียง + เพิ่มธง live แต่ผู้ใช้ยังเห็นของเก่าเรียงผิดอยู่ 1 ชม.
const DATA_VER = "6";

const FETCH_TIMEOUT = 7000;
const EDGE_TTL = 1800;          // 30 นาที — คลิปมาแรงขยับช้า
const KV_FRESH = 60 * 60 * 1000; // ของใน KV อายุไม่เกิน 1 ชม. = ยังสด ไม่ต้องยิงใหม่
const KV_TTL = 9 * 24 * 3600;    // ต้องเก็บนานกว่า 7 วัน เพราะใช้เทียบยอดวิวย้อนหลัง
const MAX_ITEMS = 30;

// ช่วงเวลาที่ใช้วัด "วิวเพิ่มขึ้นเท่าไหร่" (ชั่วโมง)
const WINDOWS = [4, 24, 48, 72, 168];
const HIST_KEEP_MS = 175 * 3600 * 1000; // เก็บสถิติย้อนหลังพอสำหรับหน้าต่าง 7 วัน
const HIST_MAX = 200;                   // เก็บชั่วโมงละครั้ง 7 วัน = ~168 ครั้ง เผื่อไว้เล็กน้อย

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

// "ทั่วโลก" ไม่มีอยู่จริงใน YouTube API — chart=mostPopular บังคับให้ระบุประเทศ
// จึงดึงหลายประเทศหลักพร้อมกันแล้วรวมกัน ยุบคลิปซ้ำ เรียงตามยอดวิว
// (ยอดวิวของ YouTube เป็นตัวเลขรวมทั้งโลกอยู่แล้ว ไม่ใช่แยกรายประเทศ จึงเทียบกันได้ตรงๆ)
const WORLD = "WW";
const WORLD_REGIONS = ["US", "GB", "JP", "KR", "IN", "BR", "DE", "MX"];

export async function onRequest(context) {
  const url = new URL(context.request.url);
  // รหัสประเทศ 2 ตัวเท่านั้น — ค่านี้ต่อเข้า URL ปลายทาง อย่าปล่อยให้ใส่อะไรก็ได้
  const geo = (url.searchParams.get("geo") || "TH").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || "TH";

  const env = context.env || {};
  const hasApiKey = !!env.YT_API_KEY;

  // ⚠️ ใส่สถานะ "มี key หรือยัง" ลงใน cache key ด้วย
  // ไม่งั้นพอเพิ่ง YT_API_KEY เข้า Cloudflare ผู้ใช้จะยังเห็นผลลัพธ์เดิม (ที่ยังไม่ใช้ key)
  // ไปอีกเป็นชั่วโมง แล้วนึกว่าใส่ key ไม่สำเร็จ — เกิดขึ้นจริงมาแล้ว
  const cache = caches.default;
  const key = new Request(
    url.origin + `/api/trend/yttrends?geo=${geo}&_v=${DATA_VER}&_k=${hasApiKey ? 1 : 0}`,
    { method: "GET" }
  );
  const hit = await cache.match(key);
  if (hit) return browserCopy(hit);

  const kv = env.FLAGS_KV;
  const kvKey = (env.APP_ENV ? String(env.APP_ENV) + ":" : "") + `yttrends:${DATA_VER}:${geo}`;

  // ของใน KV ยังสดอยู่ไหม — ถ้าสด ใช้เลย ไม่ต้องยิงเน็ตและไม่ต้องเขียน KV
  let saved = null;
  if (kv) {
    try {
      const raw = await kv.get(kvKey);
      if (raw) {
        saved = JSON.parse(raw);
        const age = Date.now() - Date.parse((saved.body && saved.body.fetchedAt) || 0);
        // เพิ่งได้ key มาแต่ของที่เก็บไว้ยังไม่ได้ใช้ key → ต้องดึงใหม่ทันที ไม่ต้องรอหมดอายุ
        const staleKey = hasApiKey && saved.body && saved.body.source !== "youtube:api";
        if (!staleKey && Number.isFinite(age) && age >= 0 && age < KV_FRESH && (saved.body.items || []).length) {
          const edge = json({ ...saved.body, fromKv: true }, 200, EDGE_TTL);
          context.waitUntil(cache.put(key, edge.clone()));
          return browserCopy(edge);
        }
      }
    } catch {}
  }
  const hist = (saved && Array.isArray(saved.hist) ? saved.hist : []).filter(
    (s) => s && Number.isFinite(s.t) && Date.now() - s.t < HIST_KEEP_MS
  );

  const attempts = [];
  const won = await race(geo, attempts, env);
  if (won) {
    const now = Date.now();
    // เก็บภาพยอดวิว ณ ตอนนี้ไว้เทียบรอบหน้า แล้วคำนวณ "วิวเพิ่ม" จากภาพเก่า
    const snap = { t: now, v: {} };
    won.items.forEach((it) => { if (it.views > 0) snap.v[it.id] = it.views; });
    const hist2 = hist.concat([snap]).slice(-HIST_MAX);
    const items = withDeltas(won.items, hist, now);

    const body = {
      geo,
      source: won.id,
      mode: modeOf(won.id, won.items),
      fetchedAt: new Date(now).toISOString(),
      count: items.length,
      items,
      // อายุของสถิติที่มี — หน้าเว็บใช้บอกผู้ใช้ว่าหน้าต่าง 48 ชม. ใช้ได้หรือยัง
      histHours: hist.length ? Math.round((now - hist[0].t) / 3600000) : 0,
      meta: { attempts },
    };
    // เขียน KV ครั้งเดียว โดยเก็บทั้งผลลัพธ์และสถิติไว้ใน key เดียวกัน
    // (แยก key = เขียน 2 ครั้ง/รอบ ซึ่งกินโควตาเป็นเท่าตัวโดยไม่จำเป็น)
    if (kv) {
      context.waitUntil(
        kv.put(kvKey, JSON.stringify({ body, hist: hist2 }), { expirationTtl: KV_TTL }).catch(() => {})
      );
    }
    const edge = json(body, 200, EDGE_TTL);
    context.waitUntil(cache.put(key, edge.clone()));
    return browserCopy(edge);
  }

  // ดึงไม่ได้เลย → เสิร์ฟของเก่าดีกว่าโชว์หน้าว่าง
  if (saved && saved.body && (saved.body.items || []).length) {
    return browserCopy(json({ ...saved.body, stale: true, meta: { ...(saved.body.meta || {}), attempts } }, 200, 300));
  }
  return browserCopy(json({ geo, count: 0, items: [], error: "no source available", meta: { attempts } }, 200, 120));
}

/* ---------- วิวเพิ่มขึ้นเท่าไหร่ในช่วง N ชั่วโมง ---------- */

// YouTube ไม่บอกยอดวิวย้อนหลัง จึงต้องเก็บภาพยอดวิวเองทุกรอบแล้วเอามาลบกัน
// คลิปที่เพิ่งลงหลังจุดเทียบ = วิวทั้งหมดคือวิวที่เพิ่มในช่วงนั้น
// คลิปที่ไม่มีข้อมูลเทียบเลย = คืน null ไม่ใช่ 0 (0 แปลว่า "ไม่เพิ่ม" ซึ่งคนละเรื่องกับ "ไม่รู้")
function withDeltas(items, hist, now) {
  return items.map((it) => {
    const d = {};
    for (const w of WINDOWS) {
      const target = now - w * 3600000;
      // ยอมให้ภาพที่ใช้เทียบเหลื่อมได้ 15% ของช่วง (อย่างน้อย 1.5 ชม.)
      // เดิมใช้ 40% ซึ่งหน้าต่าง 7 วันจะเหลื่อมได้ถึง ±67 ชม. = ตัวเลขเพี้ยนโดยไม่รู้ตัว
      const tol = Math.max(1.5 * 3600000, w * 3600000 * 0.15);
      const snap = nearestSnap(hist, target, tol);
      if (snap && Number.isFinite(snap.v[it.id])) {
        d["d" + w] = Math.max(0, it.views - snap.v[it.id]);
      } else if (it.published && it.published >= target) {
        d["d" + w] = it.views; // เพิ่งลงในช่วงนี้ → วิวทั้งหมดเกิดในช่วงนี้
      } else {
        d["d" + w] = null; // ยังไม่รู้ ต้องรอสถิติสะสม
      }
    }
    return { ...it, ...d };
  });
}

function nearestSnap(hist, target, tolerance) {
  let best = null;
  let bestGap = Infinity;
  for (const s of hist) {
    const gap = Math.abs(s.t - target);
    if (gap < bestGap) { bestGap = gap; best = s; }
  }
  return best && bestGap <= tolerance ? best : null;
}

// ยิงทุก instance "พร้อมกัน" แล้วเอาอันที่ตอบมาก่อน
//
// ⚠️ ห้ามไล่ยิงทีละอันเด็ดขาด — instance อาสาสมัครล่มบ่อยและมักล่มแบบ "ค้าง" ไม่ใช่ตอบ error
// ไล่ทีละอัน 5 แหล่ง × timeout 7 วิ = ผู้ใช้รอ 35 วินาทีก่อนเห็นอะไร
// ยิงพร้อมกันแล้วเอาอันแรกที่ได้ = ช้าสุดเท่ากับ timeout เดียว
async function race(geo, attempts, env = {}) {
  // รอบ 0 — API ทางการ ถ้ามี key (ตั้งใน Cloudflare env ชื่อ YT_API_KEY)
  // อันนี้คือของจริง: อันดับมาแรงทางการ · ยอดวิวจริง · เวลาอัปโหลดจริง
  // ฟรี โควตา 10,000 หน่วย/วัน ส่วนนี้ใช้ราวๆ 24 หน่วย/วัน/ประเทศ
  if (env.YT_API_KEY) {
    const run =
      geo === WORLD
        ? () => fromDataApiWorld(env.YT_API_KEY)
        : () => fromDataApi(env.YT_API_KEY, geo);
    const won = await firstOk([{ id: "youtube:api", run }], attempts);
    if (won) return won;
  }

  // รอบ 1 — instance ที่รู้จัก ไม่ต้องเสียเวลาถามไดเรกทอรีก่อน
  const geoFb = geo === WORLD ? "US" : geo; // ต้นทางสำรองรับแต่รหัสประเทศจริง
  const seed = [];
  for (const h of INVIDIOUS) seed.push({ id: `invidious:${h}`, run: () => fromInvidious(h, geoFb) });
  for (const h of PIPED) seed.push({ id: `piped:${h}`, run: () => fromPiped(h, geoFb) });
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
  for (const h of inv) if (!known.has(h)) fresh.push({ id: `invidious*:${h}`, run: () => fromInvidious(h, geoFb) });
  for (const h of pip) if (!known.has(h)) fresh.push({ id: `piped*:${h}`, run: () => fromPiped(h, geoFb) });
  if (fresh.length) {
    won = await firstOk(fresh.slice(0, MAX_DISCOVERED * 2), attempts);
    if (won) return won;
  }

  // รอบ 3 — JSON ล่มหมดจริง แกะหน้า YouTube เอง
  // /feed/trending ถูกถอดออกตั้งแต่ ก.ค. 2025 จึงลองหน้าแรกรายประเทศด้วย
  return await firstOk(
    [
      { id: "youtube:trending", run: () => fromYouTubeHtml(geoFb, "/feed/trending") },
      { id: "youtube:home", run: () => fromYouTubeHtml(geoFb, "/") },
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

// API ทางการ — chart=mostPopular ยังใช้ได้อยู่แม้ YouTube จะถอดหน้า Trending ออกไปแล้ว
async function fromDataApi(keyRaw, geo) {
  const key = String(keyRaw || "").trim();
  if (!key) throw new Error("no api key");
  const u =
    "https://www.googleapis.com/youtube/v3/videos" +
    "?part=snippet,statistics&chart=mostPopular" +
    `&regionCode=${geo}&maxResults=${MAX_ITEMS}&key=${encodeURIComponent(key)}`;
  // ⚠️ อย่าใช้ fetchJson ตรงนี้ — มันโยน error ทันทีที่เห็น 403 ทำให้คำอธิบายจาก Google หายไป
  // Google บอกสาเหตุจริงมาในตัว body เสมอ (ยังไม่ได้ Enable API · key ถูกจำกัด · โควตาหมด)
  // ต้องอ่าน body ให้ได้ ไม่งั้นผู้ใช้เห็นแค่ "http 403" แล้วไล่ต่อไม่ถูก
  const d = await fetchJsonAnyStatus(u);
  if (d && d.error) {
    const reason = (d.error.errors && d.error.errors[0] && d.error.errors[0].reason) || "";
    throw new Error(`api ${d.error.code || "?"} ${reason} ${(d.error.message || "").slice(0, 120)}`.trim());
  }
  const arr = (d && d.items) || [];
  if (!Array.isArray(arr)) throw new Error("not an array");
  return normalize(
    arr.map((v) => ({
      id: v && v.id,
      title: v && v.snippet && v.snippet.title,
      channel: (v && v.snippet && v.snippet.channelTitle) || "",
      views: num(v && v.statistics && v.statistics.viewCount),
      published: v && v.snippet && v.snippet.publishedAt ? Date.parse(v.snippet.publishedAt) : 0,
      live: !!(v && v.snippet && v.snippet.liveBroadcastContent === "live"),
    })),
    { keepOrder: true } // API ส่งมาเป็นอันดับทางการอยู่แล้ว ไม่ต้องเรียงเอง
  );
}

// ทั่วโลก = รวมหลายประเทศหลัก ยิงพร้อมกันแล้วยุบคลิปซ้ำ
async function fromDataApiWorld(key) {
  const lists = await Promise.all(
    WORLD_REGIONS.map((r) => fromDataApi(key, r).catch(() => []))
  );
  const best = new Map();
  for (const list of lists) {
    for (const it of list) {
      const prev = best.get(it.id);
      // คลิปเดียวกันโผล่ได้หลายประเทศ — เก็บอันที่ยอดวิวสูงสุดไว้ (ข้อมูลสดที่สุด)
      if (!prev || it.views > prev.views) best.set(it.id, it);
    }
  }
  const merged = [...best.values()].sort((a, b) => (a.live !== b.live ? (a.live ? 1 : -1) : b.views - a.views));
  return merged.slice(0, MAX_ITEMS).map((it, i) => ({ ...it, rank: i + 1 }));
}

async function fromInvidious(host, geo) {
  const arr = await fetchJson(`https://${host}/api/v1/trending?region=${geo}&type=Default`);
  if (!Array.isArray(arr)) throw new Error("not an array");
  return normalize(arr.map((v) => ({
    id: v && v.videoId,
    title: v && v.title,
    channel: (v && v.author) || "",
    views: num(v && v.viewCount),
    published: num(v && v.published) ? num(v.published) * 1000 : 0,
    live: !!(v && v.liveNow),
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
    live: num(v && v.duration) < 0, // Piped ส่ง duration = -1 เมื่อเป็นไลฟ์
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
    // ⚠️ ไลฟ์ส่งยอดคนดูมาเป็น "runs" ไม่ใช่ "simpleText" — จับแค่ simpleText จะได้ 0 เสมอ
    const vm =
      c.match(/"viewCountText":\{"simpleText":"((?:[^"\\]|\\.)*)"/) ||
      c.match(/"viewCountText":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/);
    const pm = c.match(/"publishedTimeText":\{"simpleText":"((?:[^"\\]|\\.)*)"/);
    // ไลฟ์สด: ยอด "วิว" คือคนดูอยู่ตอนนี้ เทียบกับคลิปปกติไม่ได้ ต้องแยกออกมา
    //
    // ⚠️ ห้ามเดาจากข้อความในชื่อคลิป เคยใช้วิธีสแกนหาคำว่า "ถ่ายทอดสด/watching"
    // ในข้อความดิบ 1500 ตัวอักษร ผลคือจับผิด 13 จาก 15 คลิป (คำพวกนี้อยู่ในชื่อคลิป
    // ธรรมดาเต็มไปหมด และช่วงที่สแกนยังกินข้อมูลของคลิปตัวถัดไปเข้ามาด้วย)
    // ใช้เฉพาะสัญญาณที่เป็นโครงสร้างจริงเท่านั้น:
    //   1. badge LIVE NOW ของตัวคลิปเอง (จำกัดขอบเขตไม่ให้ล้ำไปคลิปอื่น)
    //   2. ป้ายยอดคนดูที่เขียนว่า "กำลังดู/watching" ซึ่งมีเฉพาะไลฟ์
    const own = c.slice(0, 2200); // ข้อมูลของคลิปตัวเองอยู่ต้นก้อน
    const vcAt = c.indexOf('"viewCountText"');
    const vcRaw = vcAt >= 0 ? c.slice(vcAt, vcAt + 220) : "";
    const live =
      /BADGE_STYLE_TYPE_LIVE_NOW/.test(own) ||
      /"isLiveNow":true/.test(own) ||
      /watching now|กำลังดู/i.test(vcRaw);
    seen.add(idm[1]);
    out.push({
      id: idm[1],
      title: unesc(tm[1]),
      channel: cm ? unesc(cm[1]) : "",
      views: vm ? num(unesc(vm[1]).replace(/[^\d]/g, "")) : 0,
      published: pm ? relativeToMs(unesc(pm[1])) : 0,
      live,
    });
  }
  return normalize(out);
}

// "3 ชั่วโมงที่ผ่านมา" / "2 days ago" → เวลาโดยประมาณเป็น ms
// หน้า YouTube ไม่ให้วันที่จริง ให้มาเป็นข้อความสัมพัทธ์เท่านั้น จึงได้แค่ประมาณ
const REL_UNITS = [
  [/วินาที|second/i, 1000],
  [/นาที|minute/i, 60000],
  [/ชั่วโมง|hour/i, 3600000],
  [/วัน|day/i, 86400000],
  [/สัปดาห์|week/i, 7 * 86400000],
  [/เดือน|month/i, 30 * 86400000],
  [/ปี|year/i, 365 * 86400000],
];
function relativeToMs(text) {
  const s = String(text || "");
  const n = num((s.match(/\d+/) || [])[0]);
  if (!n) return 0;
  for (const [re, ms] of REL_UNITS) if (re.test(s)) return Date.now() - n * ms;
  return 0;
}

/* ---------- ทำให้เป็นรูปเดียวกัน ---------- */

function normalize(raw, opts = {}) {
  const seen = new Set();
  const out = [];
  for (const r of raw || []) {
    const id = String((r && r.id) || "");
    const title = collapse(r && r.title);
    if (!/^[\w-]{8,20}$/.test(id) || !title || title.length > 200) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title,
      channel: collapse(r.channel).slice(0, 80),
      views: Number.isFinite(r.views) && r.views > 0 ? r.views : 0,
      published: Number.isFinite(r.published) && r.published > 0 ? r.published : 0,
      live: !!r.live,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    });
  }

  // ⚠️ ลำดับที่ต้นทางส่งมา "ไม่ใช่" อันดับคนดูเสมอไป — หน้า YouTube รายประเทศ
  // ส่งมาตามลำดับที่จัดหน้าเว็บ ทำให้คลิป 900 วิวมาอยู่อันดับ 1 ได้ (เจอจริง)
  // จึงเรียงตามยอดวิวเองทุกครั้ง และดันไลฟ์ไปท้าย เพราะ "วิว" ของไลฟ์คือคนดูสดตอนนั้น
  // เอามาเทียบกับยอดวิวสะสมของคลิปปกติไม่ได้
  if (!opts.keepOrder) {
    out.sort((a, b) => (a.live !== b.live ? (a.live ? 1 : -1) : b.views - a.views));
  }
  const top = out.slice(0, MAX_ITEMS);
  top.forEach((it, i) => { it.rank = i + 1; });
  return top;
}

// แหล่งไหนเป็น "อันดับมาแรงจริง" แหล่งไหนแค่ "คลิปจากหน้าเว็บ" — ผู้ใช้ต้องรู้ว่ากำลังดูอะไร
//
// ⚠️ instance สาธารณะบางตัว "อ้างว่า" เป็น trending แต่คืนคลิปเล็กๆ ของตัวเอง
// เจอจริง: api.piped.private.coffee คืน 15 คลิป มัธยฐาน 740 วิว แล้วติดป้ายว่า trending
// เทรนด์ระดับประเทศจริงต้องหลักแสนขึ้นไป — ตัวเลขไม่สมเหตุสมผล = อย่าไปเชื่อป้ายมัน
const TRENDING_MIN_MEDIAN = 20000;

function modeOf(sourceId, items) {
  if (sourceId === "youtube:api") return "official";
  const claimed = /^(invidious|piped)/.test(sourceId) ? "trending" : "browse";
  if (claimed === "trending" && medianViews(items) < TRENDING_MIN_MEDIAN) return "browse";
  return claimed;
}

function medianViews(items) {
  const v = (items || []).map((i) => i.views || 0).filter((n) => n > 0).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
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
// อ่าน JSON ให้ได้แม้สถานะไม่ใช่ 2xx — ใช้กับ API ที่อธิบายสาเหตุมาใน body
async function fetchJsonAnyStatus(target) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(target, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json", "Accept-Language": "th,en;q=0.9" },
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("http " + res.status + " " + text.slice(0, 80));
    }
  } finally {
    clearTimeout(timer);
  }
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
