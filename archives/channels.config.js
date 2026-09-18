/* 💬 ---------- ช่องทางของข่าว: "ข่าว" กับ "Social" ----------
 *
 * เจ้าของสั่ง 18 ก.ย. 2026: **"ในคลังข่าวปลาหมอ เพิ่ม filter แยก ข่าว กับ social"**
 *
 * 🥇 **ยึดคอลัมน์ `Channel` ของชีตก่อนเสมอ ห้ามสลับลำดับ**
 *    เจอจริงในชีต: แถวที่ติ๊ก `TikTok` ไว้ **แต่ลิงก์เป็น `thairath.co.th/video/shorts/…`**
 *    ถ้าเดาจากโดเมนก่อน แถวนั้นจะกลายเป็น "ข่าว" ทั้งที่เจ้าของกรอกว่าเป็นคลิป TikTok
 *    · เทสต์ `archivechannel.mjs` มีด่านระดับโค้ดกันไม่ให้ใครสลับลำดับ
 *
 * 🔙 **แถวที่ยังไม่ได้กรอก → เดาจากลิงก์ → ไม่เข้าก็นับเป็น "ข่าว"** (เจ้าของเลือกเอง 18 ก.ย. 2026)
 *    จึง **ไม่มีชิพ "❓ ไม่ระบุ"** — ทุกใบต้องอยู่ฝั่งใดฝั่งหนึ่งเสมอ
 *
 * ✏️ **แก้ไฟล์นี้ได้เลย ไม่ต้องแตะโค้ดและไม่ต้องสร้างข้อมูลใหม่** — `app.js` อ่านตอนเปิดหน้า
 */
window.ARCHIVE_CHANNELS = {
  /* ถังที่จะกลายเป็นชิพบนแถบหมวด · ตัวแรกคือค่าตั้งต้นของแถวที่เดาไม่ออก */
  buckets: [
    { id: "news", icon: "📰", name: "ข่าว" },
    { id: "social", icon: "💬", name: "Social" },
  ],

  /* ค่าที่เจ้าของพิมพ์ในคอลัมน์ `Channel` → ถังไหน
     · เทียบแบบตัดช่องว่าง/ขีด/จุด และไม่สนตัวพิมพ์ใหญ่เล็ก ("Tik-Tok" = "tiktok")
     · ค่าที่ไม่มีในตารางนี้ → ตกไปเดาจากลิงก์ **ไม่ได้ทิ้ง** */
  map: {
    website: "news", web: "news", เว็บไซต์: "news", ข่าว: "news", news: "news",
    facebook: "social", fb: "social", เฟซบุ๊ก: "social", เฟสบุ๊ค: "social",
    tiktok: "social", ติ๊กต่อก: "social",
    x: "social", twitter: "social", ทวิตเตอร์: "social",
    youtube: "social", yt: "social", ยูทูบ: "social",
    instagram: "social", ig: "social", ไอจี: "social",
    line: "social", ไลน์: "social",
    pantip: "social", พันทิป: "social",
    threads: "social", tiktokshop: "social",
  },

  /* 🔙 ทางถอยเมื่อคอลัมน์ `Channel` เว้นว่าง — โดเมนพวกนี้ = Social
     🚫 **ห้ามใส่โดเมนของเว็บข่าว** (thairath · matichon · dailynews …)
        เว็บข่าวมีหน้าคลิปสั้นของตัวเอง แต่นั่นยังเป็นสำนักข่าว ไม่ใช่ social
        แถวแบบนั้นให้เจ้าของติ๊กคอลัมน์ `Channel` เอา ซึ่งชนะการเดาอยู่แล้ว */
  socialHosts: [
    "facebook.com", "fb.com", "fb.watch", "m.facebook.com",
    "tiktok.com", "vt.tiktok.com",
    "twitter.com", "x.com",
    "youtube.com", "youtu.be",
    "instagram.com",
    "line.me", "page.line.me",
    "pantip.com",
    "threads.net", "threads.com",
  ],
};
