// เสิร์ฟรูปปกของแท็บ Earned media ผ่านเซิร์ฟเวอร์เรา แทนที่จะให้เบราว์เซอร์ไปโหลดตรง
//
// 🔴 เจ้าของถาม 8 ก.ย. 2026: "ทำไมรูป thumbnail ไม่ขึ้น" · รีวิวข้อ 8 ชี้ต้นเหตุถูก —
//    เราเก็บแต่ **ลิงก์** ของ TikTok/Facebook/Instagram ซึ่งเป็น **ลิงก์เซ็นชื่อที่หมดอายุ**
//    (มี `?x-expires=` ติดมา) พอหมดอายุก็ 403 ทุกใบ · และ CDN พวกนี้ยัง
//    **บล็อกตาม Referer** ด้วย ต่อให้ลิงก์ยังไม่หมดอายุก็โดนปฏิเสธ
//
// ✅ ทางแก้ 2 ชั้นในไฟล์เดียว
//    ① เซิร์ฟเวอร์ไปโหลดแทน — ไม่มี Referer ของโดเมนเราติดไป จึงไม่โดนกฎ hotlink
//    ② เก็บลง **edge cache 30 วัน** — พอลิงก์ต้นทางหมดอายุ รูปที่ cache ไว้ยังเสิร์ฟได้ต่อ
//
// ⚠️ **ไม่ใช่การเก็บรูปถาวร** — edge cache ถูกล้างได้ทุกเมื่อ และแยกตามศูนย์ข้อมูล
//    ถ้าล้างหลังลิงก์หมดอายุแล้ว รูปใบนั้นก็หายจริง (หน้าเว็บขึ้นกล่อง ⚠️ พร้อมบอกให้กด 🔄)
//    เก็บถาวรต้องใช้ R2 ซึ่งเป็นบริการที่ต้องเปิดเพิ่ม — ยังไม่ได้ทำ
//
// 🚫 **ไม่ใช่ image proxy แบบเปิด** — ต่างจาก `/api/sd/img` ที่รับ URL อะไรก็ได้
//    อันนี้รับเฉพาะ CDN ของ 4 แพลตฟอร์มที่แท็บนี้ใช้ (ดู `OK_HOST`)
//    ปิดช่องตั้งแต่แรก ไม่ต้องรอมาไล่ปิดทีหลัง
// 🚫 **ไม่แตะ KV เลย** — ไม่มีการเขียน ไม่กินโควตา 1,000 เขียน/วันของทั้งโปรเจกต์

const TIMEOUT = 8000;
const MAX_BYTES = 3 * 1024 * 1024;      // 3MB — รูปปกไม่มีทางใหญ่กว่านี้
const TTL = 30 * 24 * 3600;             // 30 วัน

/* โดเมนที่ยอมให้ดึง — ต้องตรงทั้งโดเมนหรือเป็นโดเมนย่อยของรายการนี้เท่านั้น
   ⚠️ เทียบแบบ "ลงท้ายด้วย .<โดเมน>" ไม่ใช่ `includes` —
      `includes("fbcdn.net")` ยอมให้ `fbcdn.net.evil.com` ผ่านได้ */
const OK_HOST = [
  "tiktokcdn.com", "tiktokcdn-us.com", "ibyteimg.com", "byteoversea.com",
  "fbcdn.net", "cdninstagram.com",
  "ytimg.com", "ggpht.com",
];

export function hostAllowed(u) {
  let h;
  try {
    const url = new URL(String(u));
    if (url.protocol !== "https:") return false;   // http เปล่าๆ ไม่รับ
    h = url.hostname.toLowerCase();
  } catch (e) { return false; }
  return OK_HOST.some((d) => h === d || h.endsWith("." + d));
}

function plain(status, msg) {
  return new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const src = url.searchParams.get("u") || "";

  if (!src) return plain(400, "ไม่ได้บอกว่าจะเอารูปไหน");
  if (!hostAllowed(src)) return plain(403, "รับเฉพาะรูปจาก CDN ของแพลตฟอร์มที่แท็บนี้ใช้");

  const cache = caches.default;
  const ck = new Request(url.origin + "/social/api/img?u=" + encodeURIComponent(src), { method: "GET" });
  const hit = await cache.match(ck);
  if (hit) return hit;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT);
  let r;
  try {
    /* ⚠️ ห้ามส่ง Referer ของโดเมนเราไป — นั่นคือสิ่งที่ทำให้โดนบล็อกตั้งแต่แรก
       ส่ง User-Agent ธรรมดาไปด้วย บาง CDN ปฏิเสธคำขอที่ไม่มี UA */
    r = await fetch(src, {
      signal: ac.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; cp-dashboard/1.0)", accept: "image/*" },
    });
  } catch (e) {
    return plain(502, "ดึงรูปจากต้นทางไม่ได้");
  } finally { clearTimeout(t); }

  if (!r.ok) return plain(502, "ต้นทางไม่ให้รูป (" + r.status + ")");

  const ct = r.headers.get("content-type") || "";
  // ⚠️ ต้องเป็นรูปจริง — ต้นทางที่หมดอายุมักตอบหน้า HTML แจ้งข้อผิดพลาดพร้อมสถานะ 200
  if (!/^image\//i.test(ct)) return plain(502, "ต้นทางไม่ได้ส่งรูปกลับมา");

  const len = Number(r.headers.get("content-length") || 0);
  if (len && len > MAX_BYTES) return plain(413, "รูปใหญ่เกินไป");

  const buf = await r.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return plain(413, "รูปใหญ่เกินไป");

  const out = new Response(buf, {
    headers: {
      "content-type": ct,
      "cache-control": `public, max-age=${TTL}, immutable`,
      "x-content-type-options": "nosniff",
    },
  });
  context.waitUntil(cache.put(ck, out.clone()));
  return out;
}
