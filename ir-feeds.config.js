// แหล่งฟีดของหน้า IR — 3 คอลัมน์: News · Alert 1 · Alert 2 (ไม่มี Google Trends)
// source: "news" | "alert1" | "alert2"  (กำหนดว่าไปอยู่แผงไหน)
// แก้ไฟล์นี้เพื่อเพิ่ม/ลบแหล่ง แล้ว deploy ใหม่

export default [
  // 📰 News — RSS ตรงจากสำนักข่าว (Google News โดน Cloudflare IP บล็อก จึงใช้ฟีดตรง)
  // ทั่วไป/ยอดนิยม
  { id: "news-matichon",    source: "news", label: "มติชน",           url: "https://www.matichon.co.th/feed" },
  { id: "news-khaosod",     source: "news", label: "ข่าวสด",          url: "https://www.khaosod.co.th/feed" },
  { id: "news-thairath",    source: "news", label: "ไทยรัฐ",          url: "https://www.thairath.co.th/rss/news" },
  { id: "news-dailynews",   source: "news", label: "เดลินิวส์",        url: "https://www.dailynews.co.th/feed/" },
  { id: "news-mgr",         source: "news", label: "ผู้จัดการ",        url: "https://mgronline.com/rss/breakingnews.xml" },
  { id: "news-thestandard", source: "news", label: "THE STANDARD",    url: "https://thestandard.co/feed/" },
  { id: "news-prachatai",   source: "news", label: "ประชาไท",         url: "https://prachatai.com/rss.xml" },
  { id: "news-blognone",    source: "news", label: "Blognone",        url: "https://www.blognone.com/atom.xml" },
  { id: "news-thaipbs",     source: "news", label: "Thai PBS",        url: "https://www.thaipbs.or.th/rss/news.xml" },
  { id: "news-pptv",        source: "news", label: "PPTV HD36",       url: "https://www.pptvhd36.com/rss" },
  { id: "news-workpoint",   source: "news", label: "Workpoint Today", url: "https://workpointtoday.com/feed/" },
  { id: "news-sanook",      source: "news", label: "Sanook",          url: "https://www.sanook.com/news/feed/" },
  // ธุรกิจ/การเงิน (สำคัญกับ IR/CP)
  { id: "news-bangkokbiz",  source: "news", label: "กรุงเทพธุรกิจ",    url: "https://www.bangkokbiznews.com/rss" },
  { id: "news-prachachat",  source: "news", label: "ประชาชาติธุรกิจ",  url: "https://www.prachachat.net/feed" },
  { id: "news-thansettakij",source: "news", label: "ฐานเศรษฐกิจ",      url: "https://www.thansettakij.com/feed" },
  { id: "news-posttoday",   source: "news", label: "โพสต์ทูเดย์",      url: "https://www.posttoday.com/rss" },
  { id: "news-kaohoon",     source: "news", label: "ข่าวหุ้น",         url: "https://www.kaohoon.com/feed" },
  { id: "news-ryt9",        source: "news", label: "Ryt9",            url: "https://www.ryt9.com/rss/all" },
  // อังกฤษ/ต่างประเทศ
  { id: "news-bangkokpost", source: "news", label: "Bangkok Post",    url: "https://www.bangkokpost.com/rss/data/most-recent.xml" },
  { id: "news-nation",      source: "news", label: "The Nation",      url: "https://www.nationthailand.com/rss" },
  { id: "news-bbc",         source: "news", label: "BBC World",       url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { id: "news-verge",       source: "news", label: "The Verge",       url: "https://www.theverge.com/rss/index.xml" },

  // 🔔 Alert 1 — Google Alert หมวดที่ 1
  {
    id: "alert1-cp",
    source: "alert1",
    label: '"cp" -tower',
    url: "https://www.google.com/alerts/feeds/09603683942017157714/11443863203205870260",
  },

  // 🔔 Alert 2 — Google Alert หมวดที่ 2
  {
    id: "alert2-ซีพี",
    source: "alert2",
    label: '"ซีพี"',
    url: "https://www.google.com/alerts/feeds/09603683942017157714/5523361181985541471",
  },

  // เพิ่มฟีดในแต่ละหมวดได้อีก โดยใช้ source เดียวกัน (news / alert1 / alert2)
];
