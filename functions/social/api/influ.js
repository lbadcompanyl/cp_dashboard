// Earned media — เก็บลิงก์ที่ผู้ใช้วางเข้ามา แล้วดึงยอดล่าสุด
//
// 📦 เก็บของ 2 ชนิดใน blob เดียวกัน แยกด้วยฟิลด์ `kind`
//    · `social` = โพสต์ของอินฟลูเอนเซอร์ที่จ้าง (YouTube/TikTok/FB/IG) → ดึงยอดจริง
//    · `news`   = ข่าวจากสำนักข่าว → **นับชิ้น + แยกสำนักข่าวเท่านั้น** (เจ้าของสั่ง 8 ก.ย. 2026)
//    🚫 ข่าว **ไม่ยิงต้นทางเลยสักครั้ง** ไม่ว่าจะกดอัปเดตกี่ที — ไม่มี API ไหนบอกยอดของหน้าข่าว
//       และการยิงมั่วก็เผาเครดิต ScrapeCreators ที่จ่ายเงินฟรีๆ
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
// v2 = เพิ่ม kind / host / publishedAt (8 ก.ย. 2026)
const DATA_VER = 2;

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

/* ── แกะลิงก์ออกจากข้อความที่ผู้ใช้วางมา ──────────────────────────
 * 🔴 เจ้าของวางมาแบบ "แคปชั่น 1 บรรทัด แล้วลิงก์บรรทัดถัดไป" สลับกันไป (31 ส.ค. 2026)
 *    ของเดิมตัดด้วยช่องว่างแล้วเอาทุกชิ้นมาเป็นลิงก์ → วางจริงได้ 47 ชิ้น
 *    เด้ง 44 อันว่า "ไม่รู้จักแพลตฟอร์ม" ทั้งที่มีลิงก์จริงแค่ 3
 * ✅ หยิบเฉพาะที่ขึ้นต้นด้วย http(s):// · ที่เหลือไม่ใช่ขยะ —
 *    เก็บบรรทัดข้อความก่อนหน้าไว้เป็น **ชื่อโพสต์ตั้งต้น**
 *    มีประโยชน์จริงเพราะลิงก์ย่อ (vt.tiktok.com · facebook.com/share) ไม่มีชื่ออะไรเลย
 *    ระหว่างที่ยังดึงยอดไม่สำเร็จ อย่างน้อยก็ยังรู้ว่าโพสต์ไหน
 * ⚠️ ห้ามเด้งบรรทัดที่เป็นข้อความธรรมดา — มันคือแคปชั่น ไม่ใช่ลิงก์ที่พิมพ์ผิด
 */
export function parseInput(text) {
  var out = [], note = "";
  String(text || "").split(/\r?\n/).forEach(function (line) {
    var t = line.trim();
    if (!t) return;
    var m = t.match(/https?:\/\/[^\s<>"']+/g);
    if (!m) { note = t.slice(0, 200); return; }   // บรรทัดข้อความ = แคปชั่นของลิงก์ถัดไป
    m.forEach(function (u) { out.push({ url: u, note: note }); });
    note = "";                                    // ใช้แล้วทิ้ง ไม่ให้ติดไปใบถัดไป
  });
  return out;
}

/** ลิงก์นี้เป็นของเจ้าไหน — คืน null ถ้าไม่รู้จัก (ต้องบอกผู้ใช้ ไม่ใช่เก็บเงียบ) */
export function platformOf(u) {
  const s = String(u || "").toLowerCase();
  if (/youtube\.com|youtu\.be/.test(s)) return "youtube";
  if (/tiktok\.com/.test(s)) return "tiktok";
  if (/instagram\.com/.test(s)) return "instagram";
  if (/facebook\.com|fb\.watch|fb\.com/.test(s)) return "facebook";
  return null;
}

/* ── ลิงก์ข่าว ────────────────────────────────────────────────────
 * 🔴 เจ้าของสั่ง (8 ก.ย. 2026): ข่าว **นับชิ้น + แยกสำนักข่าวพอ** ไม่ต้องดึงยอด
 *    ลิงก์ที่ไม่ใช่ 4 แพลตฟอร์มที่รู้จัก = ข่าว ไม่ใช่ "ลิงก์ผิด"
 *    (ของเดิมเด้งทิ้งว่า "ไม่รู้จักแพลตฟอร์ม" — วางลิสต์ข่าวมาจะไม่เหลือสักใบ)
 */

/** ชื่อโดเมนที่ใช้เป็น "สำนักข่าว" — ตัด www. ออก · ชื่อไทยแปลที่หน้าเว็บ */
export function hostOf(url) {
  try { return new URL(String(url)).hostname.replace(/^www\./i, "").toLowerCase(); }
  catch (e) { return ""; }
}

/* ⚠️ ลิงก์ที่ก๊อปมาไม่ครบต้องเด้งตั้งแต่ตอนเพิ่ม ไม่ใช่ปล่อยให้ไปยิงแล้วค่อยพัง
   เจ้าของวางมาจริงว่า `https://www.facebook.com/share/p/19...` (โดนตัดตอนก๊อป)
   ถ้าปล่อยผ่าน = เสียเครดิต ScrapeCreators ฟรี 1 หน่วยเพื่อได้ 404 กลับมา */
export function looksTruncated(u) {
  return /(\.{2,}|…)\s*$/.test(String(u || ""));
}

/* วันที่ในเส้นทางของลิงก์ — สำนักข่าวไทยหลายเจ้าใส่ /2026/09/05/ ไว้ใน URL
   ⚠️ ได้บ้างไม่ได้บ้าง เอาไว้ทำกราฟรายเดือนให้แม่นขึ้นเท่านั้น
      ไม่เจอ = ใช้วันที่เพิ่มเข้ารายการแทน แล้ว **ติดป้ายบอกว่าเป็นวันที่เพิ่ม** */
export function dateFromUrl(url) {
  const m = String(url || "").match(/\/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})(?:\/|$|\?)/);
  if (!m) return "";
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  return y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
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
  /* ⚠️ ต้องตัดตัวติดตามให้ครบ ไม่งั้นลิงก์เดียวกันที่ก๊อปมาคนละที่จะกลายเป็นคนละใบ
     mibextid/rdid มาจากการแชร์ของ Facebook · _t/_r/is_from_webapp มาจาก TikTok */
  s = s.replace(/^http:\/\//i, "https://")
    .replace(/[?&](utm_[^=]*|fbclid|igsh|igshid|mibextid|rdid|share_url|_t|_r|is_from_webapp|sender_device|web_id|si)=[^&#]*/gi, "");
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

/* วันที่โพสต์จากคำตอบของ ScrapeCreators — ใช้ทำกราฟรายเดือน
   ⚠️ บางเจ้าส่งเป็นวินาที (unix) บางเจ้าส่งเป็นข้อความ ISO · รับทั้งคู่
   🚫 หาไม่เจอต้องคืน "" ไม่ใช่เดาว่าเป็นวันนี้ — เดาแล้วกราฟรายเดือนจะโกหก */
export function pickWhen(body) {
  const t = deepNum(body, ["create_time", "createtime", "taken_at_timestamp", "taken_at", "timestamp", "created_time"]);
  if (t != null && t > 1e8) {
    const ms = t > 1e12 ? t : t * 1000;      // วินาที vs มิลลิวินาที
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = deepStr(body, ["create_time", "created_time", "taken_at", "published_at", "publishedat", "date"]);
  if (s) { const d = new Date(s); if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10); }
  return "";
}

/* ── ชื่อฟิลด์ตัวเลขที่ต้นทางส่งมาจริง ────────────────────────────────
 * 🔴 เจ้าของถาม 8 ก.ย. 2026: "ทำไม tiktok ไม่มี view ?" แล้ว **ตอบไม่ได้**
 *    เพราะของเดิมรายงานชื่อฟิลด์ให้ดูเฉพาะตอนที่ **ไม่เจอตัวเลขเลยสักตัว**
 *    ถ้าเจอบ้างไม่เจอบ้าง (เช่นได้ likes แต่ไม่ได้ views) จะขึ้น "—" เฉยๆ ไม่มีเหตุผลติดมา
 *    → แยกไม่ออกว่า "ไม่มีคนดู" กับ "ชื่อฟิลด์ไม่ตรงกับที่เดาไว้"
 * ✅ เก็บชื่อ **คีย์ที่มีค่าเป็นตัวเลข** ทั้งหมดที่เจอ แล้วเอาไปโชว์ในแถวนั้น
 *    รอบหน้ากด 🔄 ครั้งเดียวก็รู้เลยว่าต้องเติมชื่อไหนลง F
 * ⚠️ เก็บแค่ "ชื่อคีย์" ไม่เก็บค่า — ไม่ให้ blob ใน KV บวมและไม่มีข้อมูลส่วนตัวติดไป */
export function numKeys(obj, depth = 0, out = []) {
  if (obj == null || depth > 5 || typeof obj !== "object" || out.length >= 16) return out;
  for (const [k, v] of Object.entries(obj)) {
    if (out.length >= 16) break;
    if (typeof v === "number" && out.indexOf(k) < 0) out.push(k);
    else if (v && typeof v === "object") numKeys(v, depth + 1, out);
  }
  return out;
}

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
      ...post, stats: st, at: Date.now(), warn: null,
      err: "ต้นทางตอบมาแต่ไม่เจอตัวเลขที่รู้จัก — ชื่อฟิลด์อาจไม่ตรงกับที่เดาไว้ (ดู keys: " +
        Object.keys(r.body || {}).slice(0, 8).join(", ") + ")",
    };
  }

  /* ⚠️ ได้บางตัวไม่ได้บางตัว = ต้องบอกว่าขาดตัวไหน + ต้นทางส่งชื่อฟิลด์อะไรมาแทน
     ไม่ใช่ error (ข้อมูลที่ได้ยังใช้ได้) จึงเก็บแยกเป็น warn ไม่ใช่ err */
  const miss = Object.keys(st).filter((k) => st[k] == null);

  return {
    ...post,
    warn: miss.length ? { miss, keys: numKeys(r.body) } : null,
    title: deepStr(r.body, ["desc", "message", "title", "caption", "text", "content", "description"]).slice(0, 300) || post.title,
    account: post.account || deepStr(r.body, ["unique_id", "uniqueid", "username", "nickname", "author_name"]),
    thumb: deepStr(r.body, ["cover", "origin_cover", "dynamic_cover", "thumbnail", "full_picture", "display_url", "thumbnail_url"]) || post.thumb,
    publishedAt: pickWhen(r.body) || post.publishedAt,
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
        // 🚫 YouTube ไม่ต้องมี warn — shares เป็น null เพราะ API ไม่เปิดเผย ไม่ใช่ชื่อฟิลด์ไม่ตรง
        warn: null, at: Date.now(), err: "",
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

    body.add.slice(0, MAX_ADD).forEach((item) => {
      // รับได้ทั้งสตริงเปล่าๆ และ {url, note} — ฝั่งหน้าเว็บส่งแบบหลัง
      const raw = typeof item === "string" ? item : (item && item.url) || "";
      const note = typeof item === "string" ? "" : (item && item.note) || "";
      // ⚠️ ก๊อปมาไม่ครบต้องเด้งก่อนถึงจะไม่เสียเครดิตฟรี
      if (looksTruncated(raw)) { bad.push({ url: raw, why: "ลิงก์ถูกตัดตอนก๊อป (ลงท้ายด้วย …) — ก๊อปใหม่ให้ครบ" }); return; }
      const url = normLink(raw);
      if (!url) return;
      const platform = platformOf(url);
      const host = hostOf(url);
      /* 🔴 ลิงก์ที่ไม่ใช่ 4 แพลตฟอร์ม = **ข่าว** ไม่ใช่ลิงก์ผิด (เจ้าของสั่ง 8 ก.ย. 2026)
         เด้งเฉพาะที่ไม่มีชื่อโดเมนจริงๆ = พิมพ์ผิดแน่ๆ */
      const kind = platform ? "social" : "news";
      if (!platform && !host) { bad.push({ url: raw, why: "อ่านลิงก์นี้ไม่ออก" }); return; }
      if (seen.has(url)) { bad.push({ url: raw, why: "มีอยู่ในรายการแล้ว" }); return; }
      seen.add(url);
      fresh.push({
        id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        url, kind, host,
        platform: platform || "",
        vid: platform === "youtube" ? youtubeId(url) : "",
        account: accountOf(url, platform),
        /* แคปชั่นที่วางมาเป็นชื่อตั้งต้น — ถ้าดึงชื่อจริงจากต้นทางได้ค่อยทับทีหลัง
           ⚠️ ลิงก์ย่ออย่าง vt.tiktok.com / facebook.com/share ไม่มีชื่ออะไรในตัวเลย
              ไม่เก็บแคปชั่นไว้ = ตารางจะมีแต่ URL ยาวๆ อ่านไม่รู้เรื่อง */
        note: note,
        title: "", thumb: "",
        // วันที่ในเส้นทางลิงก์ (ถ้ามี) ใช้ทำกราฟรายเดือน — ไม่มีก็ใช้วันที่เพิ่มแทน
        publishedAt: dateFromUrl(url),
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
  /* 🔴 ข่าวไม่ยิงต้นทางเด็ดขาด — กันไว้ที่นี่ชั้นเดียวพอ ทั้ง add และ refresh ผ่านทางนี้ทั้งคู่
     ⚠️ เช็คด้วย platform ด้วย เผื่อ record เก่า (v1) ที่ยังไม่มีฟิลด์ kind */
  const feed = posts.filter((p) => p.kind !== "news" && p.platform);
  const yt = feed.filter((p) => p.platform === "youtube");
  const rest = feed.filter((p) => p.platform !== "youtube");

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
