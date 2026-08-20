// คอลัมน์ YouTube ของแดชบอร์ดโซเชียล — สถิติ "ช่องของเราเอง"
//
// ⚠️ อันนี้คนละเรื่องกับ /api/trend/yttrends ซึ่งดึง "คลิปมาแรงของทั้งประเทศ"
//    ตัวนั้นเป็นเทรนด์สาธารณะ ตัวนี้คือช่องของเรา — อย่าเอามารวมกัน
//
// ชั้นข้อมูลที่ใช้ตอนนี้คือ "ชั้นสาธารณะ" (YouTube Data API + API key)
// ได้: ผู้ติดตาม · ยอดวิวรวม · จำนวนคลิป · คลิปล่าสุดพร้อมยอดวิว/ไลก์/คอมเมนต์
// ยังไม่ได้: เวลาที่คนดูรวม · ดูจบกี่ % · ผู้ชมเป็นใคร
//   → พวกนั้นต้องใช้ YouTube Analytics API ซึ่งต้อง OAuth (ดู SOCIAL-HANDOFF.md)

import { ST, payload, cached, missingEnv, fetchJSON } from "../_lib/store.js";

// ⭐ บวกเลขนี้ทุกครั้งที่แก้โครงข้อมูลที่คืนออกไป ไม่งั้นผู้ใช้จะเห็นของเก่าค้างเป็นชั่วโมง
const DATA_VER = "4";

/* ── ชั้นที่ 2: YouTube Analytics (ตัวเลขรายวัน) ─────────────────────────
 * ต้องมี refresh token ที่ได้จาก /social/api/connect?p=google
 * ไม่มีก็ไม่พัง — คืนเฉพาะชั้นสาธารณะเหมือนเดิม แล้วติดธงให้หน้าเว็บรู้
 *
 * ⚠️ refresh token ของแอปที่ยังไม่ได้ publish จะหมดอายุทุก 7 วัน
 *    ตอนหมดต้องคืน AUTH_FAILED ไม่ใช่ NOT_CONFIGURED — คนละวิธีแก้กัน
 */
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";

/* ดึงย้อนหลังกี่วัน — ต้องคลุมช่วงที่ยาวที่สุดที่หน้าเว็บเลือกได้ (12 เดือน + เทียบปีก่อน)
   ⚠️ ขอทีเดียวยาวๆ แล้ว cache ดีกว่าขอทีละช่วงตามที่ผู้ใช้เลือก —
      ผู้ใช้เปลี่ยนช่วงเวลาบ่อยมาก ขอใหม่ทุกครั้งจะยิงต้นทางรัวๆ โดยไม่จำเป็น */
const ANALYTICS_DAYS = 760;

/* 🔴 Impressions / CTR เป็น "ของแถม" ต้องถอยได้ (เจ้าของสั่งเพิ่ม 20 ส.ค. 2026)
 *    2 ตัวนี้ YouTube ไม่ได้ให้ทุกช่องและทุกช่วงเวลา (ช่องใหม่ / ข้อมูลเก่ามาก
 *    / บางชุด dimension ใช้ไม่ได้) พอขอแล้วไม่ผ่าน Google ตอบ 400 ทั้งคำขอ
 * ⚠️ ห้ามให้ 2 ตัวนี้ลากชั้นรายวันทั้งชุดพังตาม — ยอดวิว/engagement คือหัวใจของหน้า
 *    ถ้าขอไม่ผ่าน ให้ถอยไปขอชุดเดิมแล้วปล่อยคอลัมน์ Impressions ว่าง (ขึ้น "—")
 * 🚫 ยืนยันของจริงจากเครื่องที่รัน session ไม่ได้ (ยิงเข้า Google ไม่ได้)
 *    ตัวถอยจึงไม่ใช่ของฟุ่มเฟือย แต่เป็นสิ่งเดียวที่กันไม่ให้เดาผิดแล้วหน้าพังทั้งหน้า */
const IMP = ["impressions", "impressionsClickThroughRate"];

const BASE = [
  "views", "estimatedMinutesWatched", "averageViewDuration", "averageViewPercentage",
  "likes", "comments", "shares",
];

const METRICS = BASE.concat(["subscribersGained", "subscribersLost"], IMP).join(",");
const METRICS_LITE = BASE.concat(["subscribersGained", "subscribersLost"]).join(",");

/* รายคลิปไม่มี subscribersGained/Lost ให้ขอ — ขอไปจะได้ 400 ทั้งคำขอ */
const METRICS_VIDEO = BASE.concat(IMP).join(",");
const METRICS_VIDEO_LITE = BASE.join(",");

function ymd(d) {
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") +
    "-" + String(d.getUTCDate()).padStart(2, "0");
}

const API = "https://www.googleapis.com/youtube/v3";
const MAX_VIDEOS = 12;      // พอสำหรับ "คลิปล่าสุด/ดังสุด" ไม่ต้องดึงทั้งช่อง
const EDGE_TTL = 900;       // 15 นาที
const KV_FRESH = 30 * 60 * 1000; // ของใน KV อายุไม่เกิน 30 นาที = ยังสด

/**
 * ⚠️ ชื่อช่องอยู่ใน env ไม่ได้เขียนไว้ในโค้ด — repo เป็น public และเจ้าของ
 *    ขอไม่ให้ชื่อบริษัทอยู่ในของที่เปิดสาธารณะ (14 ส.ค. 2026)
 *    ใส่อย่างใดอย่างหนึ่ง: YT_CHANNEL_ID (ขึ้นต้น UC...) หรือ YT_CHANNEL_HANDLE (@ชื่อช่อง)
 */
function channelQuery(env) {
  const id = String(env.YT_CHANNEL_ID || "").trim();
  if (/^UC[\w-]{20,}$/.test(id)) return { key: "id", val: id };
  const h = String(env.YT_CHANNEL_HANDLE || "").trim();
  if (h) return { key: "forHandle", val: h.startsWith("@") ? h : "@" + h };
  return null;
}

const num = (v) => (v == null || v === "" ? null : Number(v));

export async function onRequest(context) {
  const env = context.env || {};

  // ── ยังไม่ได้ตั้งค่า → บอกให้ชัดว่าขาดอะไร ห้ามคืนคอลัมน์ว่างเงียบๆ ──
  const need = missingEnv(env, ["YT_API_KEY"]);
  const ch = channelQuery(env);
  if (!ch) need.push("YT_CHANNEL_HANDLE");
  if (need.length) {
    return new Response(
      JSON.stringify(payload({
        status: ST.NOT_CONFIGURED,
        need,
        message: "ยังไม่ได้เชื่อมต่อ YouTube — ยังไม่ได้ตั้งค่า " + need.join(" และ "),
      })),
      { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }
    );
  }

  return cached(context, {
    key: "youtube",
    // ใส่ช่องลงใน version ด้วย เปลี่ยนช่องแล้วต้องไม่เห็นสถิติของช่องเก่าค้าง
    ver: `${DATA_VER}-${ch.val.replace(/[^\w@-]/g, "").slice(0, 32)}`,
    edgeTtl: EDGE_TTL,
    kvFresh: KV_FRESH,
    build: () => buildYouTube(env, ch),
  });
}

async function buildYouTube(env, ch) {
  const key = env.YT_API_KEY;

  // ── 1) ข้อมูลช่อง (โควตา 1 หน่วย) ────────────────────────────────────
  const cu = `${API}/channels?part=snippet,statistics,contentDetails&${ch.key}=${encodeURIComponent(ch.val)}&key=${key}`;
  const cr = await fetchJSON(cu);

  if (cr.status === 403) {
    // โควตาหมด หรือ key ถูกจำกัดสิทธิ์ — คนละเรื่องกับ "ช่องไม่มีอยู่จริง"
    const reason = cr.body?.error?.errors?.[0]?.reason || "";
    return payload({
      status: ST.AUTH_FAILED,
      message: reason === "quotaExceeded"
        ? "โควตา YouTube วันนี้หมดแล้ว เดี๋ยวพรุ่งนี้กลับมาเอง"
        : "YouTube ไม่รับ API key (" + (reason || "403") + ")",
    });
  }
  if (!cr.ok) {
    return payload({ status: ST.ERROR, message: "YouTube ตอบกลับผิดปกติ (" + cr.status + ")" });
  }

  const item = cr.body?.items?.[0];
  if (!item) {
    // ⚠️ ไม่ใช่ error ของระบบ แต่เป็นการตั้งค่าผิด — บอกให้ตรงจุด
    return payload({
      status: ST.NOT_CONFIGURED,
      need: [ch.key === "id" ? "YT_CHANNEL_ID" : "YT_CHANNEL_HANDLE"],
      message: `หาช่อง "${ch.val}" ไม่เจอ — ตรวจชื่อช่องใน Cloudflare อีกครั้ง`,
    });
  }

  const st = item.statistics || {};
  const channel = {
    id: item.id,
    title: item.snippet?.title || "",
    thumb: item.snippet?.thumbnails?.default?.url || "",
    url: item.snippet?.customUrl ? "https://www.youtube.com/" + item.snippet.customUrl : "https://www.youtube.com/channel/" + item.id,
    // ⚠️ ช่องที่ตั้งค่าซ่อนยอดผู้ติดตาม จะได้ hiddenSubscriberCount = true
    //    ต้องส่ง null ไม่ใช่ 0 ไม่งั้นหน้าเว็บจะโชว์ "0 ผู้ติดตาม" ซึ่งผิด
    subs: st.hiddenSubscriberCount ? null : num(st.subscriberCount),
    subsHidden: !!st.hiddenSubscriberCount,

    // 🔴 YouTube ปัดยอดผู้ติดตามเหลือ "เลขนัยสำคัญ 3 ตัว" ก่อนส่งมาให้เสมอ
    //    52,437 → ได้มาเป็น 52,400 · ไม่ใช่บั๊กของเรา เป็นข้อจำกัดของ Data API
    //
    //    ผลที่ตามมาที่ต้องรู้: **เอาตัวเลขนี้ไปทำ "ผู้ติดตามเพิ่มขึ้นกี่คนวันนี้" ไม่ได้**
    //    ช่องขนาดนี้ต้องเพิ่มเป็นหลักร้อยกว่าตัวเลขจะขยับสักครั้ง วันที่เพิ่ม 30 คนจะเห็นเป็น 0
    //    ถ้าอยากได้ตัวเลขจริงรายวัน ต้องใช้ YouTube Analytics API ซึ่งต้องทำ OAuth (ยังไม่ได้ทำ)
    //
    //    ⚠️ ห้ามเอาธงนี้ออกโดยไม่เปลี่ยนไปใช้ Analytics API จริง —
    //    หน้าเว็บใช้ธงนี้ติดป้าย "โดยประมาณ" ไม่ให้เจ้าของเข้าใจว่าเป็นเลขเป๊ะ
    subsApprox: !st.hiddenSubscriberCount && num(st.subscriberCount) != null,
    views: num(st.viewCount),
    videos: num(st.videoCount),
  };

  // ── 2) รายการคลิปล่าสุด ──────────────────────────────────────────────
  // ใช้ playlist "uploads" (1 หน่วย) ไม่ใช้ search.list ซึ่งกิน 100 หน่วยต่อครั้ง
  const uploads = item.contentDetails?.relatedPlaylists?.uploads;
  let videos = [];
  if (uploads) {
    const pu = `${API}/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=${MAX_VIDEOS}&key=${key}`;
    const pr = await fetchJSON(pu);
    const ids = (pr.body?.items || []).map((x) => x.contentDetails?.videoId).filter(Boolean);

    if (ids.length) {
      // ── 3) สถิติของคลิป (1 หน่วย ต่อให้ขอหลายคลิปพร้อมกัน) ───────────
      const vu = `${API}/videos?part=snippet,statistics&id=${ids.join(",")}&key=${key}`;
      const vr = await fetchJSON(vu);
      videos = (vr.body?.items || []).map((v) => ({
        id: v.id,
        title: v.snippet?.title || "",
        at: v.snippet?.publishedAt || "",
        thumb: v.snippet?.thumbnails?.medium?.url || "",
        url: "https://www.youtube.com/watch?v=" + v.id,
        // ⚠️ ไลก์/คอมเมนต์เป็น null ได้ถ้าเจ้าของปิดไว้ — null กับ 0 คนละความหมาย
        views: num(v.statistics?.viewCount),
        likes: num(v.statistics?.likeCount),
        comments: num(v.statistics?.commentCount),
      }));
    }
  }

  // ── 4) ชั้นรายวันจาก YouTube Analytics (ถ้าเชื่อมไว้) ────────────────
  const an = await buildAnalytics(env, channel, videos);
  if (an && an.authFailed) {
    /* ⚠️ ได้ข้อมูลสาธารณะมาแล้ว แต่สิทธิ์ของชั้นรายวันหมดอายุ
       ห้ามทิ้งของที่ได้มาแล้วทั้งหมด — คืนไปด้วย พร้อมบอกว่าชั้นไหนพัง */
    return payload({
      status: ST.OK,
      data: { channel, videos, analytics: null, analyticsError: an.message },
    });
  }

  return payload({
    status: ST.OK,
    data: { channel, videos, analytics: an ? an.data : null },
  });
}

/** แลก refresh token เป็น access token — อายุ 1 ชม. ไม่ต้องเก็บ ใช้แล้วทิ้ง */
async function accessToken(env) {
  const r = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.YT_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }).toString(),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.access_token) {
    /* 🔴 invalid_grant = refresh token หมดอายุหรือถูกถอนสิทธิ์
       เกิดแน่ๆ กับแอปที่ยังไม่ได้ publish (Google ให้ token อายุ 7 วัน) */
    const why = (j && (j.error_description || j.error)) || `HTTP ${r.status}`;
    return { error: /invalid_grant/i.test(String(j && j.error)) ? "expired" : "failed", message: why };
  }
  return { token: j.access_token };
}

/**
 * รายงานรายวันของช่องตัวเอง
 * ⚠️ Analytics ให้ "ผู้ติดตามเข้า/ออกรายวัน" ไม่ได้ให้ "ยอดสะสมรายวัน"
 *    ยอดสะสมย้อนหลังจึงต้องเดินถอยจากยอดปัจจุบัน — ดูหมายเหตุตรงจุดที่คำนวณ
 */
async function buildAnalytics(env, channel, videos) {
  const miss = missingEnv(env, ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "YT_REFRESH_TOKEN"]);
  if (miss.length) return null;          // ยังไม่ได้ต่อชั้นนี้ — ไม่ใช่ข้อผิดพลาด

  const tk = await accessToken(env);
  if (tk.error) {
    return { authFailed: true, message: tk.error === "expired"
      ? "สิทธิ์ของ YouTube Analytics หมดอายุหรือถูกถอน — ต้องกดขออนุญาตใหม่"
      : "ขอสิทธิ์ YouTube Analytics ไม่สำเร็จ: " + tk.message };
  }

  const end = new Date();
  const start = new Date(end.getTime() - ANALYTICS_DAYS * 864e5);

  // ช่องนี้ขอ Impressions/CTR ได้ไหม — รู้ได้ตอนถามจริงเท่านั้น
  let impOK = true;

  const raw = async (ids, metrics) => {
    const u = ANALYTICS + "?" + new URLSearchParams({
      ids, startDate: ymd(start), endDate: ymd(end),
      dimensions: "day", metrics, sort: "day",
    }).toString();
    const r = await fetch(u, { headers: { authorization: "Bearer " + tk.token } });
    const j = await r.json().catch(() => null);
    return { r, j };
  };

  const ask = async (ids) => {
    if (!impOK) return raw(ids, METRICS_LITE);
    const out = await raw(ids, METRICS);
    if (out.r.ok) return out;
    /* ⚠️ ถอยเฉพาะตอน 400 (คำขอไม่ถูกใจ) เท่านั้น
       401/403 คือเรื่องสิทธิ์ ถอย metric ไปก็ไม่ช่วย และจะกลบสาเหตุจริง */
    if (out.r.status !== 400) return out;
    const lite = await raw(ids, METRICS_LITE);
    if (!lite.r.ok) return out;      // พังด้วยเหตุอื่น — คืน error ตัวจริง
    impOK = false;
    return lite;
  };

  /* 🔴 ถามด้วย "รหัสช่องตรงๆ" ก่อน แล้วค่อยตกไปที่ channel==MINE
   *    เหตุผล: ถ้าบัญชีที่กดอนุญาตไม่ได้เป็นเจ้าของช่องนี้
   *    - ถามด้วยรหัสช่อง → ตอบ 403 บอกชัดว่าไม่มีสิทธิ์ ← เราอยากได้แบบนี้
   *    - ถาม channel==MINE → ตอบ 200 พร้อมข้อมูลของ "ช่องของบัญชีนั้น" ซึ่งอาจว่างเปล่า
   *      = ได้ตัวเลข 0 ทั้งกระดานโดยไม่มีอะไรบอกว่าผิดช่อง (เจอจริง 19 ส.ค. 2026)
   *    ⚠️ ห้ามสลับลำดับ — ตกไป MINE ก่อนแล้วเจอศูนย์ จะไล่หาสาเหตุไม่เจอเลย
   */
  let { r, j } = channel.id ? await ask("channel==" + channel.id) : { r: null, j: null };
  let usedMine = false;
  if (!r || !r.ok) {
    const first = r;
    ({ r, j } = await ask("channel==MINE"));
    usedMine = true;
    if (!r.ok && first && (first.status === 401 || first.status === 403)) {
      return { authFailed: true,
        message: "บัญชี Google ที่กดอนุญาตไม่มีสิทธิ์อ่านสถิติของช่องนี้ — " +
          "ต้องกดอนุญาตด้วยบัญชีที่เป็นเจ้าของหรือผู้จัดการของช่อง" };
    }
  }

  if (!r.ok || !j || !Array.isArray(j.rows)) {
    const why = (j && j.error && j.error.message) || `HTTP ${r.status}`;
    return { authFailed: r.status === 401 || r.status === 403, message: why };
  }

  const col = {};
  (j.columnHeaders || []).forEach((h, i) => { col[h.name] = i; });
  const at = (row, name) => {
    const i = col[name];
    return i == null ? null : row[i];
  };

  /* Impressions / CTR → เก็บเป็น "ถูกโชว์กี่ครั้ง" กับ "กลายเป็นการกดกี่ครั้ง"
     ⚠️ ห้ามส่ง CTR เป็น % ออกไปตรงๆ — หน้าเว็บต้องรวมหลายวันแล้วหาร
        ถ้าได้มาเป็น % รายวัน การเฉลี่ยจะถ่วงน้ำหนักผิด (วันที่ถูกโชว์ 10 ครั้ง
        จะมีน้ำหนักเท่าวันที่ถูกโชว์แสนครั้ง)
     ⚠️ ไม่มีตัวเลข = null ไม่ใช่ 0 — 0 แปลว่า "ไม่เคยถูกโชว์เลย" ซึ่งคนละเรื่อง */
  const clicksOf = (row) => {
    const imp = at(row, "impressions");
    if (imp == null) return { impressions: null, viewClicks: null };
    const ctr = at(row, "impressionsClickThroughRate");   // Google ให้มาเป็น 0-100
    return { impressions: imp, viewClicks: Math.round((imp * (ctr || 0)) / 100) };
  };

  const daily = j.rows.map((row) => ({
    date: at(row, "day"),
    ...clicksOf(row),
    views: at(row, "views") || 0,
    likes: at(row, "likes") || 0,
    comments: at(row, "comments") || 0,
    shares: at(row, "shares") || 0,
    watchTime: Math.round((at(row, "estimatedMinutesWatched") || 0) / 60),   // ชั่วโมง
    avgViewDuration: at(row, "averageViewDuration") || 0,                    // วินาที
    completionRate: (at(row, "averageViewPercentage") || 0) / 100,           // 0–1
    gained: at(row, "subscribersGained") || 0,
    lost: at(row, "subscribersLost") || 0,
  }));

  /* ── ยอดผู้ติดตามสะสมรายวัน ─────────────────────────────────────────
   * 🔴 Analytics ไม่ให้ยอดสะสม ให้แต่เข้า/ออกรายวัน — ต้องเดินถอยจากยอดปัจจุบัน
   * ⚠️ ยอดปัจจุบันที่ใช้เป็นจุดตั้งต้นมาจาก Data API ซึ่ง **ถูกปัดเป็นเลขนัยสำคัญ 3 ตัว**
   *    (52,437 → 52,400) ดังนั้น "ระดับ" ของเส้นคลาดได้ถึงหลักร้อย
   *    แต่ "รูปทรง" กับ "ยอดเข้า/ออกรายวัน" เป็นตัวเลขจริงเป๊ะ
   *    → หน้าเว็บต้องติดป้ายว่าระดับเป็นค่าประมาณ ห้ามเอาไปอ้างเป็นเลขเป๊ะ
   * ⚠️ เดินถอยจากวันล่าสุดไปหลัง ไม่ใช่เดินหน้าจากวันแรก — จุดที่เรารู้ค่าจริงคือวันนี้
   */
  const followers = [];
  if (channel.subs != null && daily.length) {
    let running = channel.subs;
    for (let i = daily.length - 1; i >= 0; i--) {
      followers[i] = {
        date: daily[i].date,
        value: running,
        gained: daily[i].gained,
        lost: daily[i].lost,
      };
      running -= (daily[i].gained - daily[i].lost);
    }
  }

  /* ── รายคลิป ────────────────────────────────────────────────────────
   * 🔴 Data API ให้แค่ ยอดวิว/ไลก์/คอมเมนต์ ต่อคลิป — ไม่มีเวลาที่คนดู ดูจนจบ แชร์
   *    เจ้าของถามว่า "ทำไมขาดข้อมูลตรงนี้" (19 ส.ค. 2026) เพราะแถวย่อยของตาราง
   *    ขึ้น "—" ทั้งที่แถวรวมของช่องมีตัวเลข — Analytics ให้ต่อคลิปได้ ก็ขอมาเลย
   * ⚠️ ล้มตรงนี้ห้ามทำให้ทั้งชั้นรายวันพัง — ถือเป็นของแถม ไม่มีก็ยังใช้งานได้
   */
  const byVideo = {};
  const ids = (videos || []).map((v) => v.id).filter(Boolean);
  if (ids.length) {
    try {
      const vask = async (metrics) => {
        const vu = ANALYTICS + "?" + new URLSearchParams({
          ids: usedMine ? "channel==MINE" : "channel==" + channel.id,
          startDate: ymd(start), endDate: ymd(end),
          dimensions: "video",
          filters: "video==" + ids.join(","),
          metrics,
          sort: "-views",
          maxResults: String(ids.length),
        }).toString();
        const rr = await fetch(vu, { headers: { authorization: "Bearer " + tk.token } });
        return { rr, jj: await rr.json().catch(() => null) };
      };
      /* ⚠️ ถอย metric แยกจากชั้นรายวัน — ชุด dimension คนละแบบ
         ผ่านที่ dimensions=day ไม่ได้แปลว่าจะผ่านที่ dimensions=video ด้วย */
      let { rr: vr, jj: vj } = await vask(impOK ? METRICS_VIDEO : METRICS_VIDEO_LITE);
      if (!vr.ok && vr.status === 400 && impOK) ({ rr: vr, jj: vj } = await vask(METRICS_VIDEO_LITE));
      if (vr.ok && vj && Array.isArray(vj.rows)) {
        const vc = {};
        (vj.columnHeaders || []).forEach((h, i) => { vc[h.name] = i; });
        const va = (row, name) => (vc[name] == null ? null : row[vc[name]]);
        vj.rows.forEach((row) => {
          const id = va(row, "video");
          if (!id) return;
          const vimp = va(row, "impressions");
          byVideo[id] = {
            impressions: vimp == null ? null : vimp,
            viewClicks: vimp == null
              ? null
              : Math.round((vimp * (va(row, "impressionsClickThroughRate") || 0)) / 100),
            views: va(row, "views"),
            likes: va(row, "likes"),
            comments: va(row, "comments"),
            shares: va(row, "shares"),
            watchTime: Math.round((va(row, "estimatedMinutesWatched") || 0) / 60),
            avgViewDuration: va(row, "averageViewDuration"),
            completionRate: (va(row, "averageViewPercentage") || 0) / 100,
          };
        });
      }
    } catch (e) { /* ของแถม ล้มได้ ไม่ต้องพาชั้นรายวันล้มตาม */ }
  }

  /* 🔴 ด่านกันเคส "ได้ 200 แต่เป็นศูนย์ทั้งกระดาน" (เจอจริง 19 ส.ค. 2026)
   * เกิดตอนบัญชีที่กดอนุญาตไม่ใช่เจ้าของช่องนี้ แล้ว channel==MINE ไปหยิบ
   * ช่องเปล่าของบัญชีนั้นมาแทน — API ตอบสำเร็จ ไม่มี error อะไรเลย
   * ⚠️ ปล่อยผ่านคือหน้าเว็บจะโชว์ 0 ทุกช่องเหมือนช่องไม่มีคนดู ซึ่งผิดและหาสาเหตุยากมาก
   *    เทียบกับยอดวิวสะสมจาก Data API ซึ่งเป็นของช่องที่ถูกแน่ๆ (ระบุด้วยชื่อช่อง)
   */
  const sumViews = daily.reduce((t, x) => t + (x.views || 0), 0);
  if (!sumViews && channel.views > 0) {
    return { authFailed: true,
      message: usedMine
        ? "ดึงสถิติมาได้แต่เป็นศูนย์ทั้งหมด — แปลว่าบัญชี Google ที่กดอนุญาต " +
          "ไม่ใช่เจ้าของช่องนี้ (ไปหยิบสถิติของอีกช่องมาแทน) ต้องกดอนุญาตใหม่ด้วยบัญชีที่เป็นเจ้าของช่อง"
        : "ดึงสถิติมาได้แต่เป็นศูนย์ทั้งหมด — ตรวจว่าช่องที่ตั้งไว้กับบัญชีที่กดอนุญาตเป็นช่องเดียวกันหรือไม่" };
  }

  return { data: { daily, followers, byVideo, approxLevel: true } };
}
