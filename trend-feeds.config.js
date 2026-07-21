// รายการฟีดทั้งหมดของแดชบอร์ด — แก้ไฟล์นี้เพื่อเพิ่ม/ลบแหล่ง แล้ว deploy ใหม่
// source: "news" | "alert" | "trends"  (กำหนดว่าไปอยู่แผงไหน)

export default [
  // 📰 News — RSS ตรงจากเว็บข่าว (ตัดเจ้าที่ 404 ออกแล้ว: MGR/ThaiPBS/PPTV/Sanook/Ryt9)
  //   Google News (news.google.com) โดน Cloudflare IP บล็อก (HTTP 503) จึงใช้ฟีดตรง
  // ทั่วไป/ยอดนิยม
  { id: "news-matichon",    source: "news", label: "มติชน",           url: "https://www.matichon.co.th/feed" },
  { id: "news-khaosod",     source: "news", label: "ข่าวสด",          url: "https://www.khaosod.co.th/feed" },
  { id: "news-thairath",    source: "news", label: "ไทยรัฐ",          url: "https://www.thairath.co.th/rss/news" },
  { id: "news-dailynews",   source: "news", label: "เดลินิวส์",        url: "https://www.dailynews.co.th/feed/" },
  { id: "news-thestandard", source: "news", label: "THE STANDARD",    url: "https://thestandard.co/feed/" },
  { id: "news-prachatai",   source: "news", label: "ประชาไท",         url: "https://prachatai.com/rss.xml" },
  { id: "news-blognone",    source: "news", label: "Blognone",        url: "https://www.blognone.com/atom.xml" },
  { id: "news-workpoint",   source: "news", label: "Workpoint Today", url: "https://workpointtoday.com/feed/" },
  // 🔎 PROBE: ลอง URL หลายแบบของ ผู้จัดการ/Thai PBS/PPTV — เก็บตัวที่ไม่ 404 แล้วลบที่เหลือ
  { id: "news-mgr1",     source: "news", label: "ผู้จัดการ", url: "https://mgronline.com/rss/onlinesection/breakingnews.xml" },
  { id: "news-mgr2",     source: "news", label: "ผู้จัดการ", url: "https://mgronline.com/rss/onlinesection/all.xml" },
  { id: "news-mgr3",     source: "news", label: "ผู้จัดการ", url: "https://mgronline.com/rss.xml" },
  { id: "news-thaipbs1", source: "news", label: "Thai PBS",  url: "https://news.thaipbs.or.th/rss/news" },
  { id: "news-thaipbs2", source: "news", label: "Thai PBS",  url: "https://news.thaipbs.or.th/rss" },
  { id: "news-thaipbs3", source: "news", label: "Thai PBS",  url: "https://www.thaipbs.or.th/news/rss" },
  { id: "news-pptv1",    source: "news", label: "PPTV HD36", url: "https://www.pptvhd36.com/rss/news" },
  { id: "news-pptv2",    source: "news", label: "PPTV HD36", url: "https://www.pptvhd36.com/feed" },
  { id: "news-pptv3",    source: "news", label: "PPTV HD36", url: "https://www.pptvhd36.com/rss.xml" },
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

  // 🔔 Google Alert — วิธีเพิ่ม: google.com/alerts → แก้ alert → Deliver to: RSS feed → คัดลอก URL มาวาง
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
];
