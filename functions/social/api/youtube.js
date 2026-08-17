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
const DATA_VER = "1";

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

  return payload({ status: ST.OK, data: { channel, videos } });
}
