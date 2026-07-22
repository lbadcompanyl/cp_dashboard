// แหล่งฟีดของหน้า IR — 3 คอลัมน์: News · Alert 1 · Alert 2 (ไม่มี Google Trends)
// source: "news" | "alert1" | "alert2"  ·  group (news): "biz" | "intl" | "gen"
// ⚠️ Cloudflare ฟรีจำกัด ~50 fetch/CPU ต่อ request → คุมจำนวน news feed ให้ ~25 (เกินแล้ว worker crash 1101)
// แก้ไฟล์นี้เพื่อเพิ่ม/ลบแหล่ง แล้ว deploy ใหม่

export default [
  // ── 📰 ทั่วไป (gen) ──
  { id: "news-matichon",    source: "news", group: "gen", label: "มติชน",           url: "https://www.matichon.co.th/feed" },
  { id: "news-khaosod",     source: "news", group: "gen", label: "ข่าวสด",          url: "https://www.khaosod.co.th/feed" },
  { id: "news-thairath",    source: "news", group: "gen", label: "ไทยรัฐ",          url: "https://www.thairath.co.th/rss/news" },
  { id: "news-dailynews",   source: "news", group: "gen", label: "เดลินิวส์",        url: "https://www.dailynews.co.th/feed/" },
  { id: "news-thestandard", source: "news", group: "gen", label: "THE STANDARD",    url: "https://thestandard.co/feed/" },
  { id: "news-workpoint",   source: "news", group: "gen", label: "Workpoint Today", url: "https://workpointtoday.com/feed/" },
  { id: "news-thaipbs",     source: "news", group: "gen", label: "Thai PBS",        url: "https://news.thaipbs.or.th/rss/news" },
  { id: "news-bangkokpost", source: "news", group: "gen", label: "Bangkok Post",    url: "https://www.bangkokpost.com/rss/data/most-recent.xml" },
  { id: "news-nation",      source: "news", group: "gen", label: "The Nation",      url: "https://www.nationthailand.com/rss" },

  // ── 💰 เศรษฐกิจ/หุ้น/ลงทุน (biz) ──
  { id: "news-bangkokbiz",  source: "news", group: "biz", label: "กรุงเทพธุรกิจ",    url: "https://www.bangkokbiznews.com/rss" },
  { id: "news-prachachat",  source: "news", group: "biz", label: "ประชาชาติธุรกิจ",  url: "https://www.prachachat.net/feed" },
  { id: "news-thansettakij",source: "news", group: "biz", label: "ฐานเศรษฐกิจ",      url: "https://www.thansettakij.com/feed" },
  { id: "news-posttoday",   source: "news", group: "biz", label: "โพสต์ทูเดย์",      url: "https://www.posttoday.com/rss" },
  { id: "news-kaohoon",     source: "news", group: "biz", label: "ข่าวหุ้น",         url: "https://www.kaohoon.com/feed" },
  { id: "news-longtunman",  source: "news", group: "biz", label: "ลงทุนแมน",        url: "https://www.longtunman.com/feed" },
  { id: "news-moneybuffalo",source: "news", group: "biz", label: "Money Buffalo",   url: "https://www.moneybuffalo.in.th/feed" },
  { id: "news-cnbc",        source: "news", group: "biz", label: "CNBC",            url: "https://www.cnbc.com/id/10001147/device/rss/rss.html" },
  { id: "news-bbcbiz",      source: "news", group: "biz", label: "BBC Business",    url: "https://feeds.bbci.co.uk/news/business/rss.xml" },

  // ── 🌏 ต่างประเทศ (intl) ──
  { id: "news-bbc",         source: "news", group: "intl", label: "BBC World",      url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { id: "news-cnn",         source: "news", group: "intl", label: "CNN World",      url: "http://rss.cnn.com/rss/edition_world.rss" },
  { id: "news-guardian",    source: "news", group: "intl", label: "Guardian World", url: "https://www.theguardian.com/world/rss" },
  { id: "news-nyt",         source: "news", group: "intl", label: "NYT World",      url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { id: "news-aljazeera",   source: "news", group: "intl", label: "Al Jazeera",     url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { id: "news-dw",          source: "news", group: "intl", label: "DW",             url: "https://rss.dw.com/rdf/rss-en-world" },

  // 🔔 Alert 1 — แบรนด์ CP (รวม 2 ฟีด: "cp" + "ซีพี")
  { id: "alert1-cp",   source: "alert1", label: '"cp" -tower', url: "https://www.google.com/alerts/feeds/09603683942017157714/11443863203205870260" },
  { id: "alert1-ซีพี", source: "alert1", label: '"ซีพี"',      url: "https://www.google.com/alerts/feeds/09603683942017157714/5523361181985541471" },

  // 🔔 Alert 2 — ปศุสัตว์/อาหาร/การค้า/คู่แข่ง (ไทย+อังกฤษ)
  { id: "alert2-agri", source: "alert2", label: "ปศุสัตว์ · อาหาร · การค้า", url: "https://www.google.com/alerts/feeds/09603683942017157714/7091931631874504592" },
];
