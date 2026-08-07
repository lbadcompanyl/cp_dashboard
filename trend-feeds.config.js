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
  // เพิ่มกลับผ่าน Bing (ฟีดตรงเดิม 404/บล็อก)
  { id: "news-longtunman",  source: "news", label: "ลงทุนแมน",       url: "https://www.bing.com/news/search?q=site%3Alongtunman.com&format=RSS&setmkt=th-TH" },
  { id: "news-pptv",        source: "news", label: "PPTV HD36",     url: "https://www.bing.com/news/search?q=site%3Apptvhd36.com&format=RSS&setmkt=th-TH" },
  { id: "news-sanook",      source: "news", label: "Sanook",        url: "https://www.bing.com/news/search?q=site%3Anews.sanook.com&format=RSS&setmkt=th-TH" },
  { id: "news-cnn",         source: "news", label: "CNN World",     url: "https://www.bing.com/news/search?q=site%3Aedition.cnn.com&format=RSS&setmkt=en-US" },
  { id: "news-thestandard", source: "news", label: "THE STANDARD",    url: "https://thestandard.co/feed/" },
  { id: "news-prachatai",   source: "news", label: "ประชาไท",         url: "https://prachatai.com/rss.xml" },
  { id: "news-blognone",    source: "news", label: "Blognone",        url: "https://www.blognone.com/atom.xml" },
  { id: "news-workpoint",   source: "news", label: "Workpoint Today", url: "https://workpointtoday.com/feed/" },
  { id: "news-thaipbs",  source: "news", label: "Thai PBS",  url: "https://news.thaipbs.or.th/rss/news" },
  // ผู้จัดการ (MGR) — ฟีดตรงมีแค่หมวด store → ดึงข่าวจริงผ่าน Bing แทน
  { id: "news-mgr", source: "news", label: "ผู้จัดการ", url: "https://www.bing.com/news/search?q=site%3Amgronline.com&format=RSS&setmkt=th-TH" },
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
  //
  // ⚠️ `query` = query ตัวเต็มที่ตั้งไว้ใน Google Alerts — ต้องอัปเดตที่นี่ทุกครั้งที่แก้ alert
  //
  // ปกติ feeds.js แกะ keyword จาก <title> ของฟีดเอง แต่ Google ตัด title ให้สั้น
  // เมื่อ query ยาว → keyword ท้ายๆ หายไปเงียบๆ ผลคือ (1) ข่าวจากคอลัมน์ News
  // ที่ตรงคำท้ายๆ ไม่ถูกดึงเข้ามา และ (2) pruneStaleMerged มองว่าไม่ match แล้ว
  // จึง "ลบ" ข่าวที่เคยดึงเข้ามาทิ้ง — เขียนไว้ตรงนี้จึงเป็นตัวยืนที่เชื่อได้
  //
  // เขียนตามที่วางใน Google Alerts ได้เลย รวมทั้งคำที่ขึ้นต้นด้วย `-` (ไม่เอา)
  {
    id: "alert2-a",
    source: "alert2",
    label: "หัวข้อที่จับตามอง",
    url: "https://www.google.com/alerts/feeds/09603683942017157714/4359961479006170518",
    query: `("หมอคางดำ" OR "ปลาหมอคางดำ" OR "ปลาหมอสีคางดำ" OR "เอเลี่ยนสปีชีส์" OR "ชนิดพันธุ์ต่างถิ่น" OR "PM2.5" OR "PM 2.5" OR "ฝุ่นพิษ" OR "ฝุ่นละอองขนาดเล็ก" OR "หมอกควัน" OR "เผาตอซัง" OR "เผาไร่ข้าวโพด" OR "ข้าวโพดรุกป่า" OR "ข้าวโพดเลี้ยงสัตว์" OR "ทารุณสัตว์" OR "ทรมานสัตว์" OR "ทารุณกรรมสัตว์" OR "สวัสดิภาพสัตว์" OR "อาหารปนเปื้อน" OR "สารปนเปื้อน" OR "สารตกค้าง" OR "อาหารเป็นพิษ" OR "เนื้อสัตว์ปนเปื้อน" OR "ยาปฏิชีวนะตกค้าง" OR "เรียกคืนสินค้า" OR "ปล่อยน้ำเสีย" OR "น้ำเสียโรงงาน" OR "มลพิษทางน้ำ" OR "น้ำเน่าเสีย" OR "ปลาตายเกลื่อน" OR "กลิ่นเหม็นโรงงาน" OR "ชาวบ้านร้องเรียนโรงงาน" OR "กรมควบคุมมลพิษ" OR "มูลนิธิเพื่อผู้บริโภค" OR "สภาผู้บริโภค" OR "ไข่แพง" OR "ราคาไข่" OR "หมูแพง" OR "ราคาหมู" OR "ไก่แพง" OR "ราคาไก่" OR "คอนแทร็คฟาร์มมิ่ง" OR "คอนแทรกต์ฟาร์มมิ่ง" OR "คอนแทรคฟาร์มมิ่ง" OR "contract farming" OR "เกษตรพันธสัญญา" OR "สัญญาทาส" OR "อาหารแปรรูปก่อมะเร็ง" OR "อาหารแปรรูปเสี่ยงมะเร็ง" OR "เนื้อแปรรูปก่อมะเร็ง" OR "เนื้อแปรรูปเสี่ยงมะเร็ง" OR "ไนเตรดในไส้กรอก" OR "ไนไตรท์ในไส้กรอก" OR "สารไนเตรดในไส้กรอก" OR "สารไนไตรท์ในไส้กรอก" OR "ไส้กรอกก่อมะเร็ง" OR "อาหารไมโครเวฟ" OR "บรรจุภัณฑ์พลาสติก" OR "พลาสติกสัมผัสอาหาร" OR "สารเคมีจากบรรจุภัณฑ์" OR "เชื้อดื้อยา" OR "การดื้อยาปฏิชีวนะ" OR "ดื้อยาต้านจุลชีพ" OR "บริษัทยักษ์ใหญ่" OR "กลุ่มทุนยักษ์ใหญ่" OR "ทุนผูกขาด" OR "SLAPP" OR "คดี SLAPP" OR "ฟ้องปิดปาก" OR "ดำเนินคดีปิดปาก" OR "blackchin tilapia" OR "invasive species Thailand" OR "animal cruelty Thailand" OR "wastewater discharge") -linkedin -jobdb -career -Jooble -shopee -หวย -เลขเด็ด -"ทำนายฝัน" -เมนู -recipe -livescore -sport -เอสเอไอซี -saic`,
  },
];
