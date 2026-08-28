/* 👥 ตัวดึงยอดผู้ติดตาม — adapter ของผู้ให้บริการ scraper
 * ------------------------------------------------------------------
 * รองรับ 5 แพลตฟอร์ม: youtube · tiktok · instagram · x · facebook
 * ผู้ให้บริการ 2 เจ้า (ลองตามลำดับ ตัวแรกไม่ได้ค่อยตกไปตัวถัดไป):
 *   1. ScrapeCreators — ยิงครั้งเดียวได้คำตอบเลย เร็ว ถูก (1 credit/บัญชี)
 *   2. Apify          — ตัวสำรอง ช้ากว่า (ต้องรัน actor) แต่ครอบคลุมกว่า
 *
 * 🔴 **ยังไม่เคยยิงของจริงจากเครื่องที่เขียนโค้ดนี้เลยสักครั้ง** — sandbox ออกเน็ตไม่ได้ (403)
 *    ที่ทดสอบคือ "โค้ดแกะคำตอบรูปแบบต่างๆ ได้ถูกไหม" ไม่ใช่ "endpoint ของเขาชื่อนี้จริงไหม"
 *    จึงออกแบบให้ **ทนต่อการเดาผิด** 3 ชั้น:
 *      · endpoint มีหลายตัวเลือกต่อแพลตฟอร์ม ลองไล่ทีละตัวจนกว่าจะได้ตัวเลข
 *      · ชื่อ actor ของ Apify ตั้งทับได้จาก env โดยไม่ต้องแก้โค้ด
 *      · การหาตัวเลขไม่ยึด path ตายตัว แต่ **ไล่หาทั้งก้อน JSON** จากชื่อฟิลด์ที่รู้จัก
 *    ถ้าวันหนึ่งต้นทางเปลี่ยนรูปแบบ ให้เติมชื่อฟิลด์ที่ `FOLLOWER_KEYS` เป็นอันดับแรก
 */

export const PLATFORMS = ["youtube", "tiktok", "instagram", "x", "facebook"];

// ชื่อที่คนเรียกกันหลายแบบ → ชื่อมาตรฐานของเรา
const ALIAS = { twitter: "x", ig: "instagram", yt: "youtube", tt: "tiktok", fb: "facebook", meta: "facebook" };
export function normPlatform(p) {
  const k = String(p || "").trim().toLowerCase();
  const n = ALIAS[k] || k;
  return PLATFORMS.includes(n) ? n : "";
}

// handle: ตัด @ · ตัด URL เต็มให้เหลือชื่อ · ตัด query string
export function normHandle(h) {
  let s = String(h || "").trim();
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const seg = u.pathname.split("/").filter(Boolean);
      s = seg.find(x => !/^(c|channel|user|profile|pages?|p)$/i.test(x)) || "";
    } catch { /* ปล่อยเป็นค่าเดิม */ }
  }
  return s.replace(/^@+/, "").split(/[?#]/)[0].replace(/\/+$/, "").trim();
}

export function profileUrl(platform, handle) {
  const h = normHandle(handle);
  switch (platform) {
    case "youtube":   return `https://www.youtube.com/@${h}`;
    case "tiktok":    return `https://www.tiktok.com/@${h}`;
    case "instagram": return `https://www.instagram.com/${h}/`;
    case "x":         return `https://x.com/${h}`;
    case "facebook":  return `https://www.facebook.com/${h}`;
    default:          return "";
  }
}

/* ---------- หาตัวเลขผู้ติดตามจากคำตอบที่ไม่รู้รูปร่างล่วงหน้า ----------
 * ⚠️ **ห้ามยึด path ตายตัว** (เช่น data.user.stats.followerCount) — แต่ละเจ้าคนละรูป
 *    และเปลี่ยนได้โดยไม่บอก · เจอครั้งเดียวแล้วพังเงียบ (ได้ 0 แทนที่จะ error)
 * วิธีที่ใช้: ไล่ทั้งก้อนแบบกว้างก่อนลึก (BFS) แล้วเทียบ "ชื่อฟิลด์ที่ยุบอักขระพิเศษออกแล้ว"
 *    กับลิสต์ข้างล่าง — เจอตัวที่ลำดับดีที่สุดก่อนก็จบ
 */
const norm = k => String(k).toLowerCase().replace(/[^a-z0-9]/g, "");

// เรียงตาม "ความมั่นใจ" — ตัวบนสุดคือผู้ติดตามแน่ๆ ตัวล่างสุดคือเดาแล้ว
const FOLLOWER_KEYS = [
  // ผู้ติดตามตรงตัว
  "followercount", "followerscount", "followers", "follower",
  "subscribercount", "subscriberscount", "subscribers", "subscriber",
  "numberofsubscribers", "subscribercounttext", "fanscount", "fans",
  "edgefollowedby", "followedbycount", "followersamount",
  // ⚠️ ท้ายสุด: facebook เพจเก่าบางหน้ามีแต่ยอดไลก์ — ใช้ได้แต่ต้องบอกผู้ใช้ว่าเป็นคนละตัว
  "likecount", "likescount", "likes",
];
const LIKE_KEYS = new Set(["likecount", "likescount", "likes"]);

// "1.2M" · "1,234" · "12.3K" · "1.2 พัน/หมื่น/แสน/ล้าน" → ตัวเลขจริง
export function parseCount(v) {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/,/g, "").replace(/\s+/g, " ");
  const m = s.match(/^([\d.]+)\s*(k|m|b|พัน|หมื่น|แสน|ล้าน)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || "").toLowerCase();
  const mult = { k: 1e3, m: 1e6, b: 1e9, "พัน": 1e3, "หมื่น": 1e4, "แสน": 1e5, "ล้าน": 1e6 }[unit] || 1;
  return Math.round(n * mult);
}

/** ไล่หายอดผู้ติดตามในก้อน JSON — คืน { value, field, path, isLikes } หรือ null */
export function findFollowers(root) {
  const best = { rank: Infinity, value: null, field: "", path: "" };
  const seen = new Set();
  const queue = [[root, ""]];
  let guard = 0;

  while (queue.length && guard < 20000) {
    guard++;
    const [node, path] = queue.shift();
    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);

    for (const [k, v] of Object.entries(node)) {
      const p = path ? `${path}.${k}` : k;
      const rank = FOLLOWER_KEYS.indexOf(norm(k));
      if (rank >= 0) {
        // บางเจ้าห่อไว้อีกชั้น: edge_followed_by: { count: 123 }
        const val = (v && typeof v === "object" && !Array.isArray(v))
          ? parseCount(v.count ?? v.value ?? v.total ?? v.simpleText)
          : parseCount(v);
        if (val != null && val >= 0 && rank < best.rank) {
          best.rank = rank; best.value = val; best.field = k; best.path = p;
        }
      }
      if (v && typeof v === "object") queue.push([v, p]);
    }
  }
  if (best.value == null) return null;
  return { value: best.value, field: best.field, path: best.path, isLikes: LIKE_KEYS.has(norm(best.field)) };
}

/* ---------- ScrapeCreators ----------
 * ยิง GET ตรง ได้คำตอบทันที · header: x-api-key
 * endpoint ของแต่ละแพลตฟอร์มใส่ไว้เป็น "ตัวเลือก" ไล่ลองจนกว่าจะเจอตัวเลข
 * (เผื่อชื่อ path ที่จำมาไม่ตรงของจริง — ยืนยันจาก sandbox ไม่ได้)
 */
const SC_BASE = "https://api.scrapecreators.com";
const SC_ROUTES = {
  youtube:   [["/v1/youtube/channel", "handle", h => "@" + h], ["/v1/youtube/channel", "channelId", h => h]],
  tiktok:    [["/v1/tiktok/profile", "handle", h => h]],
  instagram: [["/v1/instagram/profile", "handle", h => h]],
  x:         [["/v1/twitter/profile", "handle", h => h]],
  facebook:  [["/v1/facebook/profile", "url", (h, p) => profileUrl(p, h)]],
};

export async function scrapeCreators(platform, handle, env, fetchImpl = fetch) {
  const key = env && env.SCRAPECREATORS_API_KEY;
  if (!key) return { ok: false, error: "ยังไม่ได้ตั้ง SCRAPECREATORS_API_KEY" };
  const routes = SC_ROUTES[platform];
  if (!routes) return { ok: false, error: "ScrapeCreators ยังไม่รองรับ " + platform };

  const tried = [];
  for (const [path, param, build] of routes) {
    const api = new URL(SC_BASE + path);
    api.searchParams.set(param, build(normHandle(handle), platform));
    let data;
    try {
      const r = await fetchImpl(api.toString(), { headers: { "x-api-key": key } });
      data = await r.json().catch(() => null);
      if (!r.ok) { tried.push(`${path} → HTTP ${r.status}`); continue; }
    } catch (e) {
      tried.push(`${path} → ${String(e && e.message || e)}`);
      continue;
    }
    const hit = findFollowers(data);
    if (hit) {
      return {
        ok: true, provider: "scrapecreators", followers: hit.value,
        field: hit.field, path: hit.path, isLikes: hit.isLikes,
        credits: creditsIn(data),
      };
    }
    tried.push(`${path} → ตอบมาแต่ไม่มีตัวเลขผู้ติดตาม`);
  }
  return { ok: false, error: "ScrapeCreators: " + tried.join(" · ") };
}

function creditsIn(d) {
  if (!d || typeof d !== "object") return null;
  const v = d.credits_remaining ?? d.creditsRemaining ?? d.credits ?? null;
  return typeof v === "number" ? v : null;
}

export async function scrapeCreatorsCredits(env, fetchImpl = fetch) {
  const key = env && env.SCRAPECREATORS_API_KEY;
  if (!key) return null;
  try {
    const r = await fetchImpl(SC_BASE + "/v1/account/credit-balance", { headers: { "x-api-key": key } });
    const d = await r.json().catch(() => null);
    if (!r.ok) return null;
    return creditsIn(d) ?? (findNumber(d, ["credit", "balance"]) ?? null);
  } catch { return null; }
}

function findNumber(root, words) {
  if (!root || typeof root !== "object") return null;
  for (const [k, v] of Object.entries(root)) {
    const n = norm(k);
    if (words.some(w => n.includes(w)) && typeof v === "number") return v;
    if (v && typeof v === "object") { const got = findNumber(v, words); if (got != null) return got; }
  }
  return null;
}

/* ---------- Apify (ตัวสำรอง) ----------
 * รัน actor แบบรอผล: POST /v2/acts/<actor>/run-sync-get-dataset-items?token=...
 * ⚠️ **ชื่อ actor เปลี่ยนได้ และอาจไม่ตรงกับที่จำมา** จึงตั้งทับได้จาก env
 *    ตัวอย่าง: APIFY_ACTOR_TIKTOK=clockworks~tiktok-profile-scraper
 *    (ใน URL ของ Apify ใช้ `~` แทน `/` ระหว่างชื่อเจ้าของกับชื่อ actor)
 */
const APIFY_DEFAULT = {
  youtube:   "streamers~youtube-scraper",
  tiktok:    "clockworks~tiktok-profile-scraper",
  instagram: "apify~instagram-profile-scraper",
  x:         "apidojo~twitter-user-scraper",
  facebook:  "apify~facebook-pages-scraper",
};

export function apifyActor(platform, env) {
  const k = "APIFY_ACTOR_" + platform.toUpperCase();
  return (env && env[k]) || APIFY_DEFAULT[platform] || "";
}

// input ของแต่ละ actor ไม่เหมือนกันเลย — ส่งหลายคีย์ที่เป็นไปได้พร้อมกัน
// actor จะเมินคีย์ที่มันไม่รู้จักเอง (ปลอดภัยกว่าเดาผิดแล้วได้ผลลัพธ์ว่าง)
export function apifyInput(platform, handle) {
  const h = normHandle(handle);
  const url = profileUrl(platform, h);
  const base = { maxItems: 1, resultsLimit: 1, maxResults: 1, resultsPerPage: 1 };
  switch (platform) {
    case "instagram": return { ...base, usernames: [h], directUrls: [url] };
    case "tiktok":    return { ...base, profiles: [h], startUrls: [{ url }] };
    case "x":         return { ...base, twitterHandles: [h], startUrls: [url], getFollowers: false };
    case "facebook":  return { ...base, startUrls: [{ url }] };
    default:          return { ...base, startUrls: [{ url }] };
  }
}

export async function apify(platform, handle, env, fetchImpl = fetch) {
  const token = env && env.APIFY_TOKEN;
  if (!token) return { ok: false, error: "ยังไม่ได้ตั้ง APIFY_TOKEN" };
  const actor = apifyActor(platform, env);
  if (!actor) return { ok: false, error: "Apify ยังไม่รองรับ " + platform };

  const api = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items` +
              `?token=${encodeURIComponent(token)}&clean=true&limit=3`;
  let items;
  try {
    const r = await fetchImpl(api, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(apifyInput(platform, handle)),
    });
    items = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, error: `Apify (${actor}): HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: `Apify (${actor}): ` + String(e && e.message || e) };
  }
  const hit = findFollowers(items);
  if (!hit) return { ok: false, error: `Apify (${actor}): ตอบมาแต่ไม่มีตัวเลขผู้ติดตาม` };
  return {
    ok: true, provider: "apify", actor, followers: hit.value,
    field: hit.field, path: hit.path, isLikes: hit.isLikes, credits: null,
  };
}

/* ---------- ตัวเลือกผู้ให้บริการ ----------
 * ค่าตั้งต้น: ScrapeCreators ก่อน (เร็ว/ถูก) ไม่ได้ค่อยตกไป Apify
 * บังคับเจ้าใดเจ้าหนึ่งได้ด้วย ?provider=apify
 */
export async function fetchFollowers(platform, handle, env, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const want = opts.provider || "auto";
  const order = want === "apify" ? ["apify"]
              : want === "scrapecreators" ? ["scrapecreators"]
              : ["scrapecreators", "apify"];

  const errors = [];
  for (const p of order) {
    const r = p === "apify" ? await apify(platform, handle, env, fetchImpl)
                            : await scrapeCreators(platform, handle, env, fetchImpl);
    if (r.ok) return r;
    errors.push(r.error);
  }
  return { ok: false, error: errors.join(" | ") };
}
