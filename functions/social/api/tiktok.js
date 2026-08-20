// คอลัมน์ TikTok — สถิติบัญชีของเราเอง (Display API)
//
// ⚠️ ยังไม่เคยยิงของจริงเลยสักครั้ง — เครื่องที่เขียนโค้ดนี้ออกเน็ตไม่ได้
//    โครงสร้างเขียนตามสเปคของ TikTok Display API v2 ต้องลองจริงบน staging ก่อนเชื่อ
//
// 🔑 ต้องใส่ 3 ค่าใน Cloudflare (แบบ Secret ทั้งหมด — repo เป็น public):
//    TIKTOK_CLIENT_KEY · TIKTOK_CLIENT_SECRET · TIKTOK_REFRESH_TOKEN
//    ค่าของ sandbox กับ production เป็นคนละชุด — ย้ายเมื่อไหร่ต้องเปลี่ยนทั้ง 3 ตัว
//    และให้บัญชีกดอนุญาตใหม่ ไม่ใช่แค่สลับ key

import { ST, payload, cached, missingEnv, fetchJSON } from "../_lib/store.js";

// ⭐ บวกเลขนี้ทุกครั้งที่แก้โครงข้อมูลที่คืนออกไป
const DATA_VER = "1";

const OAUTH = "https://open.tiktokapis.com/v2/oauth/token/";
const USER = "https://open.tiktokapis.com/v2/user/info/";
const VIDEOS = "https://open.tiktokapis.com/v2/video/list/";

const USER_FIELDS = "display_name,avatar_url,profile_deep_link,follower_count,following_count,likes_count,video_count";
const VIDEO_FIELDS = "id,title,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count";
const MAX_VIDEOS = 12;

const EDGE_TTL = 900;
const KV_FRESH = 30 * 60 * 1000;

const NEED = ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REFRESH_TOKEN"];

export async function onRequest(context) {
  const env = context.env || {};

  const need = missingEnv(env, NEED);
  if (need.length) {
    return new Response(
      JSON.stringify(payload({
        status: ST.NOT_CONFIGURED,
        need,
        message: "ยังไม่ได้เชื่อมต่อ TikTok — รอสิทธิ์จาก TikTok for Developers",
      })),
      { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }
    );
  }

  return cached(context, {
    key: "tiktok",
    ver: DATA_VER,
    edgeTtl: EDGE_TTL,
    kvFresh: KV_FRESH,
    build: () => buildTikTok(env),
  });
}

/**
 * แลก refresh token เป็น access token
 *
 * ⚠️ access token ของ TikTok อายุสั้น (ระดับชั่วโมง) จึงไม่เก็บลง KV
 *    แลกใหม่ทุกครั้งที่ต้องสร้างข้อมูลจริง ซึ่งเกิดไม่บ่อยเพราะมี cache คั่นอยู่แล้ว
 *
 * ⚠️ TikTok หมุน refresh token ให้ใหม่ในบางกรณี ตัวใหม่จะติดมากับคำตอบ
 *    เราเก็บเองไม่ได้เพราะ env เขียนทับจากโค้ดไม่ได้ — ถ้าวันหนึ่งขึ้นว่าสิทธิ์หมดอายุ
 *    ต้องให้เจ้าของกดอนุญาตใหม่แล้วเอา refresh token ตัวใหม่มาใส่
 */
async function accessToken(env) {
  const body = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    client_secret: env.TIKTOK_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: env.TIKTOK_REFRESH_TOKEN,
  });

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  let r, text;
  try {
    r = await fetch(OAUTH, {
      method: "POST",
      signal: ac.signal,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    text = await r.text();
  } finally {
    clearTimeout(t);
  }

  let j = null;
  try { j = JSON.parse(text); } catch (e) { /* ตอบไม่ใช่ JSON */ }

  if (!r.ok || !j || !j.access_token) {
    const err = (j && (j.error_description || j.error)) || `HTTP ${r.status}`;
    // ⚠️ แยกให้ออกระหว่าง "สิทธิ์หมดอายุ" กับ "ต้นทางล่ม" — เจ้าของต้องทำคนละอย่าง
    const expired = /invalid_grant|expired|revoke/i.test(String(err));
    return { error: expired ? ST.AUTH_FAILED : ST.ERROR, message: expired
      ? "สิทธิ์ TikTok หมดอายุหรือถูกถอน — ต้องให้เจ้าของบัญชีกดอนุญาตใหม่แล้วใส่ TIKTOK_REFRESH_TOKEN ตัวใหม่"
      : "ขอสิทธิ์จาก TikTok ไม่สำเร็จ (" + err + ")" };
  }
  return { token: j.access_token };
}

async function buildTikTok(env) {
  const auth = await accessToken(env);
  if (auth.error) return payload({ status: auth.error, message: auth.message });

  const headers = { authorization: "Bearer " + auth.token };

  // ── ข้อมูลบัญชี ────────────────────────────────────────────────────────
  const ur = await fetchJSON(USER + "?fields=" + encodeURIComponent(USER_FIELDS), { headers });
  if (ur.status === 401 || ur.status === 403) {
    return payload({ status: ST.AUTH_FAILED, message: "TikTok ไม่รับสิทธิ์นี้ — ตรวจว่าขอ scope user.info.stats แล้วหรือยัง" });
  }
  const u = ur.body?.data?.user;
  if (!ur.ok || !u) {
    return payload({ status: ST.ERROR, message: "TikTok ตอบกลับผิดปกติ (" + ur.status + ")" });
  }

  const account = {
    name: u.display_name || "",
    avatar: u.avatar_url || "",
    url: u.profile_deep_link || "",
    followers: u.follower_count ?? null,
    following: u.following_count ?? null,
    likes: u.likes_count ?? null,
    videos: u.video_count ?? null,
  };

  // ── รายการคลิป ────────────────────────────────────────────────────────
  // ⚠️ ต้องเป็น POST และ fields อยู่ใน query ไม่ใช่ใน body (สเปคของ TikTok เป็นแบบนี้)
  //    คลิปดึงไม่ได้ ไม่ควรทำให้ทั้งคอลัมน์พัง — ข้อมูลบัญชียังมีประโยชน์อยู่
  let videos = [];
  try {
    const vr = await fetch(VIDEOS + "?fields=" + encodeURIComponent(VIDEO_FIELDS), {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ max_count: MAX_VIDEOS }),
    });
    const vj = await vr.json().catch(() => null);
    videos = (vj?.data?.videos || []).map((v) => ({
      id: v.id,
      title: v.title || "",
      at: v.create_time ? new Date(v.create_time * 1000).toISOString() : "",
      thumb: v.cover_image_url || "",
      url: v.share_url || "",
      views: v.view_count ?? null,
      likes: v.like_count ?? null,
      comments: v.comment_count ?? null,
      shares: v.share_count ?? null,
    }));
  } catch (e) { videos = []; }

  return payload({ status: ST.OK, data: { account, videos } });
}
