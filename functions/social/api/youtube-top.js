// คอนเทนต์ที่ทำยอดในช่วงเวลาที่เลือก — ไม่สนว่าลงเมื่อไหร่
//
// 🔴 ทำไมต้องแยกเป็น endpoint ของตัวเอง (เจ้าของเลือกแบบ A · 19 ส.ค. 2026)
//    /social/api/youtube ตอบ "ข้อมูลของช่อง" ซึ่งไม่ขึ้นกับช่วงเวลาที่ผู้ใช้เลือก
//    จึง cache ก้อนเดียวได้ยาวๆ · ส่วนอันนี้ผลลัพธ์เปลี่ยนตามช่วงที่เลือก
//    ถ้าเอาไปยัดรวมกัน cache ของข้อมูลช่องจะแตกเป็นก้อนละช่วงเวลาโดยไม่จำเป็น
//
// 🔴 ต่างจาก "คลิปล่าสุด" ยังไง
//    คลิปล่าสุด = เรียงตามวันที่ลง (คลิปเก่าที่ดังขึ้นมาใหม่จะไม่ติด)
//    อันนี้     = เรียงตามยอดที่ "เกิดขึ้นจริงในช่วงที่เลือก"
//                คลิปที่ลงเมื่อ 8 เดือนก่อนแต่เดือนนี้มีคนแชร์ต่อ ก็ขึ้นอันดับ 1 ได้

import { ST, payload, cached, missingEnv } from "../_lib/store.js";

// ⭐ บวกเลขนี้ทุกครั้งที่แก้โครงข้อมูลที่คืนออกไป
const DATA_VER = "1";

const API = "https://www.googleapis.com/youtube/v3";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";

const TOP_N = 10;
const EDGE_TTL = 1800;            // 30 นาที — อันดับไม่ได้เปลี่ยนรายนาที
const KV_FRESH = 60 * 60 * 1000;  // ของใน KV อายุไม่เกิน 1 ชม. = ยังสด

const METRICS = [
  "views", "estimatedMinutesWatched", "averageViewDuration", "averageViewPercentage",
  "likes", "comments", "shares",
].join(",");

const num = (v) => (v == null || v === "" ? null : Number(v));
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

export async function onRequest(context) {
  const env = context.env || {};
  const url = new URL(context.request.url);

  /* ⚠️ ช่วงวันที่มาจากหน้าเว็บ — ต้องตรวจรูปแบบก่อนเอาไปต่อ URL ของ Google
     ปล่อยผ่านคือเปิดช่องให้ยัดพารามิเตอร์อื่นเข้าไปในคำขอ */
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!isDate(from) || !isDate(to) || from > to) {
    return new Response(
      JSON.stringify(payload({ status: ST.ERROR, message: "ช่วงวันที่ไม่ถูกต้อง" })),
      { status: 400, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }
    );
  }

  const need = missingEnv(env, ["YT_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "YT_REFRESH_TOKEN"]);
  if (need.length) {
    return new Response(
      JSON.stringify(payload({
        status: ST.NOT_CONFIGURED,
        need,
        message: "อันดับคอนเทนต์ตามช่วงเวลา ต้องต่อ YouTube Analytics ก่อน",
      })),
      { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }
    );
  }

  return cached(context, {
    key: "youtube-top",
    // ⚠️ ช่วงเวลาต้องอยู่ใน cache key ไม่งั้นเลือกช่วงใหม่แล้วได้อันดับของช่วงเก่า
    ver: `${DATA_VER}-${from}-${to}`,
    edgeTtl: EDGE_TTL,
    kvFresh: KV_FRESH,
    build: () => buildTop(env, from, to),
  });
}

/** แลก refresh token เป็น access token — อายุ 1 ชม. ใช้แล้วทิ้ง */
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
    const why = (j && (j.error_description || j.error)) || `HTTP ${r.status}`;
    return { error: /invalid_grant/i.test(String(j && j.error)) ? "expired" : "failed", message: why };
  }
  return { token: j.access_token };
}

async function buildTop(env, from, to) {
  const tk = await accessToken(env);
  if (tk.error) {
    return payload({
      status: ST.AUTH_FAILED,
      message: tk.error === "expired"
        ? "สิทธิ์ของ YouTube Analytics หมดอายุหรือถูกถอน — ต้องกดขออนุญาตใหม่"
        : "ขอสิทธิ์ YouTube Analytics ไม่สำเร็จ: " + tk.message,
    });
  }

  /* 🎯 หัวใจของแบบ A: ให้ Google เรียงให้เลยว่าในช่วงนี้คลิปไหนทำยอดสูงสุด
     ไม่ได้กรองด้วยวันที่ลงคลิป — คลิปเก่าที่ดังขึ้นมาใหม่จึงติดอันดับได้ */
  const u = ANALYTICS + "?" + new URLSearchParams({
    ids: "channel==MINE",
    startDate: from,
    endDate: to,
    dimensions: "video",
    metrics: METRICS,
    sort: "-views",
    maxResults: String(TOP_N),
  }).toString();

  const r = await fetch(u, { headers: { authorization: "Bearer " + tk.token } });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !Array.isArray(j.rows)) {
    const why = (j && j.error && j.error.message) || `HTTP ${r.status}`;
    return payload({ status: r.status === 401 || r.status === 403 ? ST.AUTH_FAILED : ST.ERROR, message: why });
  }

  const col = {};
  (j.columnHeaders || []).forEach((h, i) => { col[h.name] = i; });
  const at = (row, name) => (col[name] == null ? null : row[col[name]]);

  const rows = j.rows
    .map((row) => ({
      id: at(row, "video"),
      views: num(at(row, "views")) || 0,
      likes: num(at(row, "likes")) || 0,
      comments: num(at(row, "comments")) || 0,
      shares: num(at(row, "shares")) || 0,
      watchTime: Math.round((num(at(row, "estimatedMinutesWatched")) || 0) / 60),
      avgViewDuration: num(at(row, "averageViewDuration")),
      completionRate: (num(at(row, "averageViewPercentage")) || 0) / 100,
    }))
    .filter((x) => x.id);

  if (!rows.length) return payload({ status: ST.OK, data: { from, to, videos: [] } });

  /* ── ชื่อ/รูป/ลิงก์ ต้องขอจาก Data API อีกที ────────────────────────
     ⚠️ Analytics ให้มาแค่รหัสคลิป ไม่มีชื่อ — โชว์รหัสให้เจ้าของอ่านไม่ได้
     ⚠️ คลิปที่ถูกลบไปแล้วจะไม่มีข้อมูลกลับมา ต้องคัดออก ไม่ใช่โชว์การ์ดเปล่า */
  const ids = rows.map((x) => x.id).slice(0, TOP_N);
  const vu = `${API}/videos?part=snippet&id=${ids.join(",")}&key=${env.YT_API_KEY}`;
  const vr = await fetch(vu);
  const vj = await vr.json().catch(() => null);

  const meta = {};
  (vj && vj.items ? vj.items : []).forEach((v) => {
    meta[v.id] = {
      title: v.snippet?.title || "",
      at: v.snippet?.publishedAt || "",
      thumb: v.snippet?.thumbnails?.medium?.url || "",
    };
  });

  const videos = rows
    .filter((x) => meta[x.id])
    .map((x) => ({ ...x, ...meta[x.id], url: "https://www.youtube.com/watch?v=" + x.id }));

  return payload({ status: ST.OK, data: { from, to, videos } });
}
