// คอลัมน์ Facebook Page — สถิติเพจของเราเอง (Meta Graph API)
//
// ⚠️ ยังไม่เคยยิงของจริง — เครื่องที่เขียนออกเน็ตไม่ได้ ต้องลองบน staging ก่อนเชื่อ
//
// 🔑 ต้องใส่ 2 ค่าใน Cloudflare:
//    FB_PAGE_ID (ไม่ลับ) · FB_PAGE_TOKEN (⚠️ ลับ ใส่แบบ Secret เท่านั้น)
//    token ต้องมีสิทธิ์ pages_read_engagement และ read_insights
//
// ⚠️ token ของ Meta หมดอายุได้เสมอ แม้แต่แบบ "ยาว" — เอกสาร handoff กำชับว่า
//    ต้องบอกเจ้าของเมื่อ token ตาย ไม่ใช่ปล่อยให้คอลัมน์ว่างเงียบๆ

import { ST, payload, cached, missingEnv, fetchJSON } from "../_lib/store.js";

// ⭐ บวกเลขนี้ทุกครั้งที่แก้โครงข้อมูลที่คืนออกไป
const DATA_VER = "1";

// ⚠️ ล็อกเวอร์ชัน Graph API ไว้ ห้ามใช้ค่าปริยาย — Meta ปลดระวางเวอร์ชันเก่าเป็นรอบๆ
//    ถ้าวันหนึ่งขึ้นว่าเวอร์ชันหมดอายุ ให้ขยับเลขนี้ทีเดียว ไม่ต้องไล่แก้ทุก URL
const GRAPH = "https://graph.facebook.com/v21.0";
const MAX_POSTS = 12;

const EDGE_TTL = 900;
const KV_FRESH = 30 * 60 * 1000;

export async function onRequest(context) {
  const env = context.env || {};

  const need = missingEnv(env, ["FB_PAGE_ID", "FB_PAGE_TOKEN"]);
  if (need.length) {
    return new Response(
      JSON.stringify(payload({
        status: ST.NOT_CONFIGURED,
        need,
        message: "ยังไม่ได้เชื่อมต่อ Facebook — ยังไม่ได้ตั้งค่า " + need.join(" และ "),
      })),
      { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }
    );
  }

  return cached(context, {
    key: "facebook",
    ver: DATA_VER,
    edgeTtl: EDGE_TTL,
    kvFresh: KV_FRESH,
    build: () => buildFacebook(env),
  });
}

/** แปล error ของ Meta เป็นภาษาคน — โค้ด 190 คือกลุ่ม token มีปัญหา */
function metaError(body, status) {
  const e = body?.error || {};
  const code = e.code;
  if (code === 190 || status === 401) {
    return payload({
      status: ST.AUTH_FAILED,
      message: "token ของ Facebook หมดอายุหรือถูกถอน — ต้องขอ Page Access Token ใหม่แล้วใส่ FB_PAGE_TOKEN",
    });
  }
  if (code === 10 || code === 200 || status === 403) {
    return payload({
      status: ST.AUTH_FAILED,
      message: "token ไม่มีสิทธิ์อ่านสถิติเพจ — ต้องขอสิทธิ์ pages_read_engagement และ read_insights",
    });
  }
  if (code === 4 || code === 17 || code === 32) {
    return payload({ status: ST.ERROR, message: "Facebook จำกัดจำนวนครั้งที่เรียกชั่วคราว เดี๋ยวลองใหม่" });
  }
  return payload({ status: ST.ERROR, message: "Facebook ตอบกลับผิดปกติ" + (e.message ? ": " + e.message : " (" + status + ")") });
}

async function buildFacebook(env) {
  const id = encodeURIComponent(String(env.FB_PAGE_ID).trim());
  const tok = String(env.FB_PAGE_TOKEN).trim();

  // ── ข้อมูลเพจ ─────────────────────────────────────────────────────────
  // ⚠️ ส่ง token ทาง header ไม่ใช่ query string — query string ไปโผล่ใน log ของทุกตัวกลางระหว่างทาง
  const headers = { authorization: "Bearer " + tok };
  const pr = await fetchJSON(`${GRAPH}/${id}?fields=name,username,followers_count,fan_count,link`, { headers });
  if (!pr.ok) return metaError(pr.body, pr.status);

  const p = pr.body || {};
  const page = {
    id: p.id || env.FB_PAGE_ID,
    name: p.name || "",
    url: p.link || (p.username ? "https://www.facebook.com/" + p.username : ""),
    // followers_count กับ fan_count คนละตัว (ผู้ติดตาม vs คนถูกใจเพจ) — เก็บทั้งคู่
    followers: p.followers_count ?? null,
    fans: p.fan_count ?? null,
  };

  // ── โพสต์ล่าสุด + สถิติของแต่ละโพสต์ ───────────────────────────────────
  // ⚠️ ขอ insights ติดมากับ posts ในครั้งเดียว (nested field) แทนที่จะยิงทีละโพสต์
  //    ไม่งั้น 12 โพสต์ = 12 subrequest ซึ่งชนเพดาน subrequest ของ Workers ได้
  let posts = [];
  const fields = [
    "id", "message", "created_time", "permalink_url",
    "insights.metric(post_impressions,post_impressions_unique,post_engaged_users)",
  ].join(",");
  const or = await fetchJSON(`${GRAPH}/${id}/published_posts?fields=${encodeURIComponent(fields)}&limit=${MAX_POSTS}`, { headers });

  if (or.ok) {
    posts = (or.body?.data || []).map((o) => {
      const m = {};
      for (const row of o.insights?.data || []) {
        m[row.name] = row.values?.[0]?.value ?? null;
      }
      const text = String(o.message || "").trim();
      return {
        id: o.id,
        title: text ? text.slice(0, 140) : "(โพสต์ไม่มีข้อความ)",
        at: o.created_time || "",
        url: o.permalink_url || "",
        views: m.post_impressions ?? null,
        reach: m.post_impressions_unique ?? null,
        engaged: m.post_engaged_users ?? null,
      };
    });
  }
  // ⚠️ ดึงโพสต์ไม่ได้ ไม่ใช่เหตุให้ทั้งคอลัมน์พัง — ตัวเลขเพจยังมีประโยชน์อยู่
  //    (เจอบ่อย: token อ่านเพจได้ แต่ยังไม่มีสิทธิ์ read_insights)

  return payload({
    status: ST.OK,
    data: { page, posts, postsFailed: !or.ok },
  });
}
