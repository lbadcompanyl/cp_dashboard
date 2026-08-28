// 👥 บัญชีโซเชียลที่ต้องการติดตามยอดผู้ติดตาม — แก้ไฟล์นี้ไฟล์เดียว แล้ว deploy ใหม่
//
// ใช้กับ  GET /api/followers           (เอาทุกบัญชีในลิสต์นี้)
//        GET /api/followers?accounts=yt-cpfnews,tt-cpfnews
//        GET /api/followers?platform=tiktok&handle=xxx   ← ถามบัญชีนอกลิสต์ก็ได้ (ต้องมีกุญแจ)
//
// platform ที่รองรับ: youtube · tiktok · instagram · x · facebook   ("twitter" = "x")
// handle  : ใส่ชื่อผู้ใช้อย่างเดียวพอ ไม่ต้องมี @ (ใส่มาก็ได้ ระบบตัดให้)
//           facebook ใช้ชื่อเพจใน URL (เช่น facebook.com/CPFworldwide → "CPFworldwide")
//
// ⚠️ **ยืนยัน handle ให้ถูกก่อนเปิดใช้จริง** — ยิงผิดบัญชี = เสียเครดิตฟรี
//    ในนี้ใส่เฉพาะตัวที่ยืนยันได้จากในโปรเจกต์แล้ว (`SOCIAL-HANDOFF.md` ระบุ YouTube = @CPFNews)
//    ตัวอื่นเป็นตัวอย่างที่ **ปิดไว้** (`off: true`) — เปิดเมื่อเจ้าของยืนยันชื่อบัญชีแล้ว

export default [
  { id: "yt-cpfnews", platform: "youtube",   handle: "@CPFNews",     label: "CPF News (YouTube)" },

  // ── ตัวอย่าง: แก้ handle ให้ตรงของจริงแล้วลบ off: true ออก ──────────────────
  { id: "tt-cpf",     platform: "tiktok",    handle: "cpfworldwide", label: "CPF (TikTok)",    off: true },
  { id: "ig-cpf",     platform: "instagram", handle: "cpfworldwide", label: "CPF (Instagram)", off: true },
  { id: "x-cpf",      platform: "x",         handle: "CPFworldwide", label: "CPF (X)",         off: true },
  { id: "fb-cpf",     platform: "facebook",  handle: "CPFworldwide", label: "CPF (Facebook)",  off: true },
];
