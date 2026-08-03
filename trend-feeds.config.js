// รายการฟีดทั้งหมดของแดชบอร์ด — แก้ไฟล์นี้เพื่อเพิ่ม/ลบแหล่ง แล้ว deploy ใหม่
// source: "news" | "alert" | "trends"  (กำหนดว่าไปอยู่แผงไหน)

export default [
  // 📰 News — RSS ตรงจากเว็บข่าว (ตัดเจ้าที่ 404 ออกแล้ว: MGR/ThaiPBS/PPTV/Sanook/Ryt9)
  //   Google News (news.google.com) โดน Cloudflare IP บล็อก (HTTP 503) จึงใช้ฟีดตรง
  // ทั่วไป/ยอดนิยม
  { id: "news-matichon",    source: "news", label: "มติชน",           url: "https://www.matichon.co.th/feed" },
  { id: "news-khaosod",     source: "news", label: "ข่าวสด",          url: "https://www.khaosod.co.th/feed" },
  { id: "news-thairath",    source: "news", label: "ไทยรัฐ",          url: "https://www.thairath.co.th/rss/news" },
  // เดลินิวส์: ฟีดตรง /feed/ โดนบล็อกบอต (403) → ดึงผ่าน Bing News site-search แทน (Worker เข้าถึงได้)
  { id: "news-dailynews",   source: "news", label: "เดลินิวส์",        url: "https://www.bing.com/news/search?q=site%3Adailynews.co.th&format=RSS&setmkt=th-TH" },
  { id: "news-thestandard", source: "news", label: "THE STANDARD",    url: "https://thestandard.co/feed/" },
  { id: "news-prachatai",   source: "news", label: "ประชาไท",         url: "https://prachatai.com/rss.xml" },
  { id: "news-blognone",    source: "news", label: "Blognone",        url: "https://www.blognone.com/atom.xml" },
  { id: "news-workpoint",   source: "news", label: "Workpoint Today", url: "https://workpointtoday.com/feed/" },
  { id: "news-thaipbs",  source: "news", label: "Thai PBS",  url: "https://news.thaipbs.or.th/rss/news" },
  // ผู้จัดการ (MGR) — เปิด RSS เฉพาะหมวด store (หมวดข่าวอื่น 404) — เป็นเนื้อหาฝั่ง store/ไลฟ์สไตล์
  { id: "news-mgr", source: "news", label: "ผู้จัดการ", url: "https://mgronline.com/store/rss/index.xml" },
  // PPTV (pptvhd36) ยังไม่พบ RSS
  // ธุรกิจ/การเงิน (สำคัญกับ IR/CP)
  { id: "news-bangkokbiz",  source: "news", label: "กรุงเทพธุรกิจ",    url: "https://www.bangkokbiznews.com/rss" },
  { id: "news-prachachat",  source: "news", label: "ประชาชาติธุรกิจ",  url: "https://www.prachachat.net/feed" },
  { id: "news-thansettakij",source: "news", label: "ฐานเศรษฐกิจ",      url: "https://www.thansettakij.com/feed" },
  { id: "news-posttoday",   source: "news", label: "โพสต์ทูเดย์",      url: "https://www.posttoday.com/rss" },
  { id: "news-kaohoon",     source: "news", label: "ข่าวหุ้น",         url: "https://www.kaohoon.com/feed" },
  // อังกฤษ/ต่างประเทศ
  { id: "news-bangkokpost", source: "news", label: "Bangkok Post",    url: "https://www.bangkokpost.com/rss/data/most-recent.xml" },
  { id: "news-nation",      source: "news", label: "The Nation",      url: "https://www.nationthailand.com/rss" },
  { id: "news-bbc",         source: "news", label: "BBC World",       url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { id: "news-verge",       source: "news", label: "The Verge",       url: "https://www.theverge.com/rss/index.xml" },

  // 🔥 Google Trends — ไม่ต้องตั้งค่าที่นี่ (แผง Trends ดึงจาก /api/trend/trending, /api/trend/related)

  // 🔔 Alert 1 — แบรนด์ CP · วิธีเพิ่ม: google.com/alerts → Deliver to: RSS feed → คัดลอก URL มาวาง
  {
    id: "alert1-cp",
    source: "alert1",
    label: '"cp" -tower',
    url: "https://www.google.com/alerts/feeds/09603683942017157714/11443863203205870260",
  },
  {
    id: "alert1-ซีพี",
    source: "alert1",
    label: '"ซีพี"',
    url: "https://www.google.com/alerts/feeds/09603683942017157714/5523361181985541471",
  },

  // 🔔 Alert 2
  { id: "alert2-a", source: "alert2", label: "หัวข้อที่จับตามอง", url: "https://www.google.com/alerts/feeds/09603683942017157714/4359961479006170518" },
];
