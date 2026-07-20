// รายการฟีดทั้งหมดของแดชบอร์ด — แก้ไฟล์นี้เพื่อเพิ่ม/ลบแหล่ง แล้ว deploy ใหม่
// source: "news" | "alert" | "trends"  (กำหนดว่าไปอยู่แผงไหน)

export default [
  // 📰 News — ดึง RSS ตรงจากเว็บข่าว (ใช้บน Cloudflare ได้)
  //   หมายเหตุ: Google News (news.google.com) โดน Cloudflare IP บล็อก (HTTP 503)
  //   จึงใช้ฟีดตรงจากสำนักข่าวแทน — เพิ่ม/ลบได้ตามต้องการ
  { id: "news-matichon", source: "news", label: "มติชน", url: "https://www.matichon.co.th/feed" },
  { id: "news-khaosod", source: "news", label: "ข่าวสด", url: "https://www.khaosod.co.th/feed" },
  { id: "news-thestandard", source: "news", label: "THE STANDARD", url: "https://thestandard.co/feed/" },
  { id: "news-prachatai", source: "news", label: "ประชาไท", url: "https://prachatai.com/rss.xml" },
  { id: "news-blognone", source: "news", label: "Blognone", url: "https://www.blognone.com/atom.xml" },
  { id: "news-bbc", source: "news", label: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { id: "news-verge", source: "news", label: "The Verge", url: "https://www.theverge.com/rss/index.xml" },

  // 🔥 Google Trends — ไม่ต้องตั้งค่าที่นี่
  //   แผง Trends ดึงจาก /api/trends (เลือกประเทศได้จากหน้าเว็บ)
  //   และ /api/related (Top/Rising queries เมื่อคลิกคำ)

  // 🔔 Google Alert — วิธีเพิ่ม:
  //   1) ไปที่ https://www.google.com/alerts  ตั้ง alert คำที่ต้องการ
  //   2) กด ✎ (แก้ไข) alert นั้น → Deliver to: เลือก "RSS feed"
  //   3) กดไอคอน RSS เพื่อคัดลอก URL ฟีด แล้ววางด้านล่างนี้ (ลอกเครื่องหมาย // ออก)
  //
  {
    id: "alert-cp",
    source: "alert",
    label: '"cp" -tower',
    url: "https://www.google.com/alerts/feeds/09603683942017157714/11443863203205870260",
  },
  {
    id: "alert-ซีพี",
    source: "alert",
    label: '"ซีพี"',
    url: "https://www.google.com/alerts/feeds/09603683942017157714/5523361181985541471",
  },

  // เพิ่ม alert อื่น ๆ ได้อีก ตามรูปแบบด้านบน
];
