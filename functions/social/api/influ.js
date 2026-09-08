// โพสต์ของอินฟลูเอนเซอร์ที่จ้าง — เก็บลิงก์ + ดึงยอดล่าสุด
//
// 🎯 ต่างจาก endpoint อื่นของ /social/ ตรงที่ **อันนี้เก็บของที่ผู้ใช้ใส่เข้ามา**
//    ตัวอื่นดึงจากต้นทางล้วนๆ อันนี้มี "รายการลิงก์" ที่ต้องจำไว้ข้ามวัน
//
// 🔴 กฎ KV ของโปรเจกต์คือหัวใจของไฟล์นี้ (โควตาแผนฟรี 1,000 เขียน/วัน ใช้ร่วมทั้งโปรเจกต์)
//    → เก็บ **ทุกโพสต์รวมใน blob เดียว** (`influ:posts`) ไม่แยก key ต่อโพสต์
//    → 1 การกดของผู้ใช้ = เขียน KV ครั้งเดียวเสมอ ไม่ว่าจะมีกี่โพสต์
//    ⚠️ เคยมีบทเรียนในโปรเจกต์นี้: เขียนแยก key ต่อรายการ = 50 เขียน/รอบ เกือบทำโควตาหมดทั้งโปรเจกต์
//
// 🔴 ScrapeCreators เสียเงินต่อการยิง 1 ครั้ง — **ห้ามยิงอัตโนมัติเด็ดขาด**
//    ยิงเฉพาะตอนผู้ใช้กด "อัปเดตยอด" หรือตอนเพิ่งเพิ่มลิงก์ใหม่เท่านั้น
//    · GET = อ่านของที่เก็บไว้ ไม่ยิงต้นทางเลย ไม่เสียเครดิตสักหน่วย
//
// 🔴 YouTube ไม่ใช้ ScrapeCreators (เจ้าของเลือกเอง) — ใช้ YouTube Data API ที่มีอยู่แล้ว
//    ถูกกว่ามาก: ขอทีเดียวได้ 50 คลิป = 1 หน่วยโควตา (โควตาฟรี 10,000/วัน)
//    ส่วน TikTok/Facebook/Instagram ต้องยิงทีละโพสต์ = 1 เครดิตต่อโพสต์

import { ST, payload, json, missingEnv } from "../_lib/store.js";

// ⭐ บวกเลขนี้ทุกครั้งที่แก้โครงข้อมูลที่เก็บลง KV
const DATA_VER = 1;

const KV_KEY = "influ:posts";
const MAX_POSTS = 300;        // เพดานของ blob เดียว — เกินนี้ควรย้ายไป D1
const MAX_ADD = 50;           // วางทีเดียวได้ไม่เกินนี้ กันวางพลาดทั้งไฟล์
const YT_BATCH = 50;          // YouTube Data API รับได้ 50 id ต่อคำขอ
const FETCH_TIMEOUT = 12000;

const SC = "https://api.scrapecreators.com";
const YT = "https://www.googleapis.com/youtube/v3";

/* ⚠️ Instagram เพิ่งเพิ่มเข้ามา (เจ้าของสั่ง 31 ส.ค. 2026) — ของเดิมรู้จักแค่ 3 เจ้า
   🚫 **ยังไม่เคยยิง endpoint ของ IG จริงสักครั้ง** เครื่องที่รัน session ยิงเน็ตออกไม่ได้
      และการยิงจริงเสียเครดิตที่จ่ายเงิน · path ข้างล่างมาจากรูปแบบของอีก 3 เจ้า
      ถ้าผิดจะได้ 404 กลับมา ซึ่งโค้ดจะรายงานตรงๆ ว่า "ต้นทางไม่รู้จักเส้นทางนี้"
      ไม่ใช่เงียบแล้วโชว์ยอดเป็น 0 — ดู fetchOne() */
const SC_EP = {
  tiktok: `${SC}/v2/tiktok/video`,
  facebook: `${SC}/v1/facebook/post`,
  instagram: `${SC}/v1/instagram/post`,
};

/** ลิงก์นี้เป็นของเจ้าไหน — คืน null ถ้าไม่รู้จัก (ต้องบอกผู้ใช้ ไม่ใช่เก็บเงียบ) */
export function platformOf(u) {
  const s = String(u || "").toLowerCase();
  if (/youtube\.com|youtu\.be/.test(s)) return "youtube";
  if (/tiktok\.com/.test(s)) return "tiktok";
  if (/instagram\.com/.test(s)) return "instagram";
  if (/facebook\.com|fb\.watch|fb\.com/.test(s)) return "facebook";
  return null;
}

export function youtubeId(url) {
  const s = String(url || "");
  const m =
    s.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
    s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ||
    s.match(/\/shorts\/([a-zA-Z0-9_-]{11})/) ||
    s.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : "";
}

/* ⚠️ ลิงก์เดียวกันมาได้หลายหน้าตา (มี ?utm_… ต่อท้าย · มี / ปิดท้าย · http vs https)
   ถ้าไม่ยุบให้เหมือนกันก่อน ผู้ใช้จะวางซ้ำแล้วได้โพสต์เดียวกัน 2 แถว
   บทเรียนเดิมของโปรเจกต์: คลังข่าวเคยมีข่าวใบเดียวซ้ำ 27 แถวเพราะไม่ได้ยุบลิงก์ */
export function normLink(u) {
  let s = String(u || "").trim();
  if (!s) return "";
  s = s.replace(/^http:\/\//i, "https://").replace(/[?&](utm_[^=]+|fbclid|igsh|is_from_webapp|sender_device|web_id)=[^&#]*/gi, "");
  s = s.replace(/[?&]+$/, "").replace(/#.*$/, "").replace(/\/+$/, "");
  return s.toLowerCase().startsWith("https://") ? s : "https://" + s.replace(/^\/+/, "");
}

/** ชื่อช่อง/บัญชีที่โพสต์ — เจ้าของสั่งจัดกลุ่มตามช่องก่อน (31 ส.ค. 2026) */
export function accountOf(url, platform) {
  const s = String(url || "");
  if (platform === "tiktok") { const m = s.match(/tiktok\.com\/@([^/?#]+)/i); return m ? "@" + m[1] : ""; }
  if (platform === "instagram") { const m = s.match(/instagram\.com\/(?!p\/|reel\/|tv\/)([^/?#]+)/i); return m ? "@" + m[1] : ""; }
  if (platform === "facebook") { const m = s.match(/facebook\.com\/([^/?#]+)/i); return m && !/^(watch|share|permalink\.php|story\.php)$/i.test(m[1]) ? m[1] : ""; }
  return "";   // YouTube ได้ชื่อช่องจริงจาก API ตอนดึงยอด ไม่ต้องเดาจาก URL
}

const num = (v) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));

/* ── หา field ในคำตอบที่ไม่รู้โครงสร้างแน่ชัด ────────────────────────
 * ⚠️ ScrapeCreators คืนโครงไม่เหมือนกันในแต่ละเจ้า และเปลี่ยนได้โดยไม่บอก
 *    โค้ดเดิมของ worker ก็ใช้วิธีนี้ · ไล่ลึกได้ไม่เกิน 6 ชั้นกัน object วนซ้ำ
 * ⚠️ ต้องรับเฉพาะ "ตัวเลข" — บางเจ้าส่ง "1.2M" มาเป็นข้อความ ซึ่งเอาไปบวกไม่ได้
 *    เจอแบบนั้นให้เป็น null (ไม่รู้) ดีกว่าแปลงมั่วแล้วได้ตัวเลขที่ผิด */
export function deepNum(obj, names, depth = 0) {
  if (obj == null || depth > 6 || typeof obj !== "object") return null;
  const want = names.map((n) => n.toLowerCase());
  for (const [k, v] of Object.entries(obj)) {
    if (want.includes(k.toLowerCase())) {
      const n = num(v);
      if (n != null) return n;
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") { const r = deepNum(v, names, depth + 1); if (r != null) return r; }
  }
  return null;
}

export function deepStr(obj, names, depth = 0) {
  if (obj == null || depth > 6 || typeof obj !== "object") return "";
  const want = names.map((n) => n.toLowerCase());
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v.trim().length > 1 && want.includes(k.toLowerCase())) return v.trim();
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") { const r = deepStr(v, names, depth + 1); if (r) return r; }
  }
  return "";
}

/* ชื่อ field ที่แต่ละเจ้าน่าจะใช้ — รวมทุกแบบที่เคยเห็น
   ⚠️ ยังไม่ได้ยืนยันกับคำตอบจริงของ ScrapeCreators สักเจ้า (ยิงจากที่นี่ไม่ได้)
      ตัวไหนหาไม่เจอจะเป็น null แล้วหน้าเว็บขึ้น "—" พร้อมบอกว่าต้นทางไม่ได้ส่งมา
   🚫 ห้ามเปลี่ยน null เป็น 0 — 0 แปลว่า "ไม่มีใครดู" คนละเรื่องกับ "ไม่รู้" */
const F = {
  views: ["play_count", "playcount", "view_count", "viewcount", "views", "video_view_count", "impressions"],
  likes: ["digg_count", "diggcount", "like_count", "likecount", "likes", "reaction_count", "favorite_count"],
  comments: ["comment_count", "commentcount", "comments", "comment_num"],
  shares: ["share_count", "sharecount", "shares", "repost_count", "forward_count"],
};

function statsFrom(body) {
  return {
    views: deepNum(body, F.views),
    likes: deepNum(body, F.likes),
    comments: deepNum(body, F.comments),
    shares: deepNum(body, F.shares),
  };
}

async function getJSON(url, headers) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT);
  try {
    const r = await fetch(url, { headers: headers || {}, signal: ac.signal });
    const body = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: null, err: String((e && e.message) || e) };
  } finally { clearTimeout(t); }
}

/* ── ดึงยอดของโพสต์ 1 ใบ (TikTok / Facebook / Instagram) ────────────
 * ⚠️ ทุกทางที่ล้มต้องบอกเหตุผลเป็นภาษาคน ไม่ใช่คืนยอดเปล่า —
 *    ยอดเปล่ากับ "ยอดเป็น 0 จริงๆ" หน้าตาเหมือนกันบนตาราง แยกไม่ออก */
async function fetchOne(post, env) {
  const ep = SC_EP[post.platform];
  if (!ep) return { ...post, err: "ยังไม่รองรับแพลตฟอร์มนี้" };

  const u = new URL(ep);
  u.searchParams.set("url", post.url);
  const r = await getJSON(u.toString(), { "x-api-key": env.SCRAPECREATORS_API_KEY });

  if (r.status === 404) {
    return { ...post, err: "ต้นทางไม่รู้จักเส้นทางนี้ (404) — เส้นทางของ " + post.platform + " อาจไม่ใช่แบบที่เดาไว้" };
  }
  if (r.status === 401 || r.status === 403) return { ...post, err: "ScrapeCreators ไม่รับกุญแจ (" + r.status + ")" };
  if (!r.ok) return { ...post, err: r.err ? "ยิงไม่ถึงต้นทาง (" + r.err + ")" : "ต้นทางตอบผิดปกติ (" + r.status + ")" };

  const st = statsFrom(r.body);
  const got = Object.keys(st).filter((k) => st[k] != null);

  /* ⚠️ ตอบ 200 แต่ไม่มีตัวเลขสักตัว = ชื่อ field ไม่ตรงกับที่เดาไว้
     ต้องบอกให้รู้ ไม่ใช่โชว์ "—" เฉยๆ แล้วปล่อยให้ไปเดาเองว่าทำไม
     (บทเรียนวันนี้: ข้อความตอนพังต้องบอกสาเหตุ ไม่งั้นต้องเดาซ้ำอีกรอบ) */
  if (!got.length) {
    return {
      ...post, stats: st, at: Date.now(),
      err: "ต้นทางตอบมาแต่ไม่เจอตัวเลขที่รู้จัก — ชื่อฟิลด์อาจไม่ตรงกับที่เดาไว้ (ดู keys: " +
        Object.keys(r.body || {}).slice(0, 8).join(", ") + ")",
    };
  }

  return {
    ...post,
    title: deepStr(r.body, ["desc", "message", "title", "caption", "text", "content", "description"]).slice(0, 300) || post.title,
    account: post.account || deepStr(r.body, ["unique_id", "uniqueid", "username", "nickname", "author_name"]),
    thumb: deepStr(r.body, ["cover", "origin_cover", "dynamic_cover", "thumbnail", "full_picture", "display_url", "thumbnail_url"]) || post.thumb,
    stats: st, at: Date.now(), err: "",
  };
}

/* ── YouTube: ขอทีเดียวได้ 50 คลิป ────────────────────────────────
 * 🔴 เจ้าของเลือกใช้ YouTube API ไม่ใช่ ScrapeCreators (31 ส.ค. 2026)
 *    ถูกกว่ามาก — 50 คลิป = 1 หน่วยโควตา จากโควตาฟรี 10,000/วัน
 * ⚠️ YouTube ไม่เปิดเผยจำนวนแชร์ผ่าน API เลย → shares เป็น null เสมอ
 *    ห้ามใส่ 0 · กฎเดียวกับที่หน้า /social/ ใช้กับคอลัมน์ Shares อยู่แล้ว */
async function fetchYouTube(posts, env) {
  const out = [];
  for (let i = 0; i < posts.length; i += YT_BATCH) {
    const chunk = posts.slice(i, i + YT_BATCH);
    const ids = chunk.map((p) => p.vid).filter(Boolean);
    if (!ids.length) { chunk.forEach((p) => out.push({ ...p, err: "อ่านรหัสคลิปจากลิงก์ไม่ได้" })); continue; }

    const url = `${YT}/videos?part=snippet,statistics&id=${ids.join(",")}&key=${env.YT_API_KEY}`;
    const r = await getJSON(url);
    if (!r.ok) {
      const why = r.status === 403 ? "โควตา YouTube หมด หรือกุญแจถูกจำกัดสิทธิ์" : "YouTube ตอบผิดปกติ (" + r.status + ")";
      chunk.forEach((p) => out.push({ ...p, err: why }));
      continue;
    }
    const by = {};
    (r.body && r.body.items ? r.body.items : []).forEach((it) => { by[it.id] = it; });

    chunk.forEach((p) => {
      const it = by[p.vid];
      // ⚠️ คลิปถูกลบ/ตั้งเป็นส่วนตัว = API ไม่ส่งกลับมาเลย ไม่ใช่ส่งยอด 0
      if (!it) { out.push({ ...p, err: "ไม่เจอคลิปนี้ (อาจถูกลบ หรือตั้งเป็นส่วนตัว)" }); return; }
      const s = it.statistics || {};
      out.push({
        ...p,
        title: (it.snippet && it.snippet.title) || p.title,
        account: (it.snippet && it.snippet.channelTitle) || p.account,
        thumb: (it.snippet && it.snippet.thumbnails && it.snippet.thumbnails.medium && it.snippet.thumbnails.medium.url) || p.thumb,
        publishedAt: (it.snippet && it.snippet.publishedAt) || p.publishedAt,
        stats: {
          views: num(s.viewCount),
          likes: num(s.likeCount),
          comments: num(s.commentCount),
          shares: null,   // 🚫 YouTube ไม่เปิดเผย — null ไม่ใช่ 0
        },
        at: Date.now(), err: "",
      });
    });
  }
  return out;
}

/* ── อ่าน/เขียน blob เดียว ────────────────────────────────────────── */
async function readAll(env) {
  try {
    const raw = await env.FLAGS_KV.get(KV_KEY);
    const j = raw ? JSON.parse(raw) : null;
    if (j && Array.isArray(j.posts)) return j;
  } catch (e) { /* blob เสีย = เริ่มใหม่ ดีกว่าพังทั้ง endpoint */ }
  return { v: DATA_VER, posts: [], at: 0 };
}

async function writeAll(env, blob) {
  blob.v = DATA_VER;
  blob.at = Date.now();
  await env.FLAGS_KV.put(KV_KEY, JSON.stringify(blob));
  return blob;
}

/* ── เส้นทาง ───────────────────────────────────────────────────────
 * GET                       → รายการที่เก็บไว้ (ไม่ยิงต้นทาง ไม่เสียเครดิต)
 * POST {add:[url,…]}        → เพิ่มลิงก์ แล้วดึงยอดของ "เฉพาะใบใหม่"
 * POST {remove:[id,…]}      → เอาออก
 * POST {refresh:true}       → ดึงยอดใหม่ทุกใบ (อันนี้แหละที่เสียเครดิต)
 */
export async function onRequest(context) {
  const { request, env } = context;

  if (!env.FLAGS_KV) {
    return json(payload({ status: ST.NOT_CONFIGURED, need: ["FLAGS_KV"], message: "ยังไม่ได้ผูกที่เก็บข้อมูล" }));
  }

  if (request.method === "GET") {
    const blob = await readAll(env);
    return json(payload({ status: ST.OK, at: blob.at, data: shape(blob, env) }));
  }

  if (request.method !== "POST") {
    return json(payload({ status: ST.ERROR, message: "รับเฉพาะ GET กับ POST" }));
  }

  const body = await request.json().catch(() => null);
  if (!body) return json(payload({ status: ST.ERROR, message: "อ่านคำขอไม่ได้" }));

  const blob = await readAll(env);

  /* ── เอาออก — ไม่ยิงต้นทางเลย ── */
  if (Array.isArray(body.remove) && body.remove.length) {
    const gone = new Set(body.remove.map(String));
    blob.posts = blob.posts.filter((p) => !gone.has(p.id));
    await writeAll(env, blob);
    return json(payload({ status: ST.OK, at: blob.at, data: shape(blob, env) }));
  }

  /* ── เพิ่มลิงก์ ── */
  if (Array.isArray(body.add) && body.add.length) {
    const need = missingEnv(env, ["YT_API_KEY"]);
    const seen = new Set(blob.posts.map((p) => p.url));
    const fresh = [];
    const bad = [];

    body.add.slice(0, MAX_ADD).forEach((raw) => {
      const url = normLink(raw);
      if (!url) return;
      const platform = platformOf(url);
      // ⚠️ ลิงก์ที่ไม่รู้จักต้องบอกกลับไป ไม่ใช่กลืนหายเงียบๆ ผู้ใช้จะนึกว่าเพิ่มสำเร็จ
      if (!platform) { bad.push({ url: raw, why: "ไม่รู้จักแพลตฟอร์มของลิงก์นี้" }); return; }
      if (seen.has(url)) { bad.push({ url: raw, why: "มีอยู่ในรายการแล้ว" }); return; }
      seen.add(url);
      fresh.push({
        id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        url, platform,
        vid: platform === "youtube" ? youtubeId(url) : "",
        account: accountOf(url, platform),
        title: "", thumb: "", publishedAt: "",
        stats: { views: null, likes: null, comments: null, shares: null },
        addedAt: Date.now(), at: 0, err: "",
      });
    });

    // ⚠️ ดึงยอดของ "เฉพาะใบใหม่" ไม่ใช่ทั้งรายการ — ใบเก่ายิงซ้ำ = เสียเครดิตฟรี
    const filled = await fetchMany(fresh, env);
    blob.posts = filled.concat(blob.posts).slice(0, MAX_POSTS);
    await writeAll(env, blob);
    return json(payload({
      status: ST.OK, at: blob.at,
      need, message: bad.length ? bad.length + " ลิงก์เพิ่มไม่ได้" : "",
      data: { ...shape(blob, env), rejected: bad },
    }));
  }

  /* ── อัปเดตยอดทุกใบ — จุดเดียวที่เสียเครดิตเยอะ ── */
  if (body.refresh) {
    blob.posts = await fetchMany(blob.posts, env);
    await writeAll(env, blob);
    return json(payload({ status: ST.OK, at: blob.at, data: shape(blob, env) }));
  }

  return json(payload({ status: ST.ERROR, message: "ไม่รู้ว่าจะให้ทำอะไร (add / remove / refresh)" }));
}

/** แยก YouTube ออกไปยิงเป็นชุด ที่เหลือยิงทีละใบ */
async function fetchMany(posts, env) {
  const yt = posts.filter((p) => p.platform === "youtube");
  const rest = posts.filter((p) => p.platform !== "youtube");

  const scKey = String(env.SCRAPECREATORS_API_KEY || "").trim();
  const ytKey = String(env.YT_API_KEY || "").trim();

  const doneYt = ytKey && yt.length
    ? await fetchYouTube(yt, env)
    : yt.map((p) => ({ ...p, err: ytKey ? p.err : "ยังไม่ได้ตั้งค่า YT_API_KEY" }));

  /* ⚠️ ยิงทีละใบตามลำดับ ไม่ยิงพร้อมกัน — ต้นทางเป็นบริการที่จ่ายเงินและมีลิมิต
     ยิงรัวๆ เสี่ยงโดนปฏิเสธทั้งชุด แล้วเสียเครดิตไปโดยไม่ได้อะไร */
  const doneRest = [];
  for (const p of rest) {
    doneRest.push(scKey ? await fetchOne(p, env) : { ...p, err: "ยังไม่ได้ตั้งค่า SCRAPECREATORS_API_KEY" });
  }

  // เรียงกลับตามลำดับเดิม ไม่ให้แถวกระโดดหลังกดอัปเดต
  const by = {};
  doneYt.concat(doneRest).forEach((p) => { by[p.id] = p; });
  return posts.map((p) => by[p.id] || p);
}

/** โครงที่ส่งให้หน้าเว็บ — บอกด้วยว่า env ไหนยังขาด จะได้ขึ้นการ์ดบอกให้ตั้งค่า */
function shape(blob, env) {
  return {
    posts: blob.posts,
    at: blob.at,
    // ⚠️ ไม่ได้แปลว่าใช้ไม่ได้ทั้งหน้า — ขาด SC ยังดู YouTube ได้ และกลับกัน
    missing: missingEnv(env, ["YT_API_KEY", "SCRAPECREATORS_API_KEY"]),
    max: MAX_POSTS,
  };
}
