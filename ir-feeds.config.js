// แหล่งฟีดของหน้า IR — 3 คอลัมน์: News · Alert 1 · Alert 2 (ไม่มี Google Trends)
// source: "news" | "alert1" | "alert2"  (กำหนดว่าไปอยู่แผงไหน)
// แก้ไฟล์นี้เพื่อเพิ่ม/ลบแหล่ง แล้ว deploy ใหม่

export default [
  // 📰 News — RSS ตรงจากสำนักข่าว · group: "biz" (เศรษฐกิจ/หุ้น) | "intl" (ต่างประเทศ) | "gen" (ทั่วไป)
  // ── ทั่วไป/ยอดนิยม (gen) ──
  { id: "news-matichon",    source: "news", group: "gen", label: "มติชน",           url: "https://www.matichon.co.th/feed" },
  { id: "news-khaosod",     source: "news", group: "gen", label: "ข่าวสด",          url: "https://www.khaosod.co.th/feed" },
  { id: "news-thairath",    source: "news", group: "gen", label: "ไทยรัฐ",          url: "https://www.thairath.co.th/rss/news" },
  { id: "news-dailynews",   source: "news", group: "gen", label: "เดลินิวส์",        url: "https://www.dailynews.co.th/feed/" },
  { id: "news-thestandard", source: "news", group: "gen", label: "THE STANDARD",    url: "https://thestandard.co/feed/" },
  { id: "news-prachatai",   source: "news", group: "gen", label: "ประชาไท",         url: "https://prachatai.com/rss.xml" },
  { id: "news-blognone",    source: "news", group: "gen", label: "Blognone",        url: "https://www.blognone.com/atom.xml" },
  { id: "news-workpoint",   source: "news", group: "gen", label: "Workpoint Today", url: "https://workpointtoday.com/feed/" },
  { id: "news-thaipbs",     source: "news", group: "gen", label: "Thai PBS",        url: "https://news.thaipbs.or.th/rss/news" },
  { id: "news-mgr",         source: "news", group: "gen", label: "ผู้จัดการ",       url: "https://mgronline.com/store/rss/index.xml" },
  // PPTV (pptvhd36) ยังไม่พบ RSS
  // ── ธุรกิจ/การเงิน/หุ้น ไทย (biz) ──
  { id: "news-bangkokbiz",  source: "news", group: "biz", label: "กรุงเทพธุรกิจ",    url: "https://www.bangkokbiznews.com/rss" },
  { id: "news-prachachat",  source: "news", group: "biz", label: "ประชาชาติธุรกิจ",  url: "https://www.prachachat.net/feed" },
  { id: "news-thansettakij",source: "news", group: "biz", label: "ฐานเศรษฐกิจ",      url: "https://www.thansettakij.com/feed" },
  { id: "news-posttoday",   source: "news", group: "biz", label: "โพสต์ทูเดย์",      url: "https://www.posttoday.com/rss" },
  { id: "news-kaohoon",     source: "news", group: "biz", label: "ข่าวหุ้น",         url: "https://www.kaohoon.com/feed" },
  { id: "news-longtunman",  source: "news", group: "biz", label: "ลงทุนแมน",        url: "https://www.longtunman.com/feed" },
  { id: "news-moneybuffalo",source: "news", group: "biz", label: "Money Buffalo",   url: "https://www.moneybuffalo.in.th/feed" },
  { id: "news-thunhoon",    source: "news", group: "biz", label: "ทันหุ้น",         url: "https://www.thunhoon.com/feed" },
  { id: "news-mitihoon",    source: "news", group: "biz", label: "มิติหุ้น",        url: "https://mitihoon.com/feed" },
  { id: "news-efin",        source: "news", group: "biz", label: "efinanceThai",    url: "https://www.efinancethai.com/rss/rss.aspx" },
  { id: "news-moneybank",   source: "news", group: "biz", label: "การเงินธนาคาร",   url: "https://moneyandbanking.co.th/feed" },
  // ── เศรษฐกิจ/การเงิน ต่างประเทศ (biz) ──
  { id: "news-cnbc",        source: "news", group: "biz", label: "CNBC",            url: "https://www.cnbc.com/id/10001147/device/rss/rss.html" },
  { id: "news-marketwatch", source: "news", group: "biz", label: "MarketWatch",     url: "https://feeds.marketwatch.com/marketwatch/topstories/" },
  { id: "news-bbcbiz",      source: "news", group: "biz", label: "BBC Business",    url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { id: "news-guardianbiz", source: "news", group: "biz", label: "Guardian Business", url: "https://www.theguardian.com/business/rss" },
  { id: "news-yahoofin",    source: "news", group: "biz", label: "Yahoo Finance",   url: "https://finance.yahoo.com/news/rssindex" },
  { id: "news-cnabiz",      source: "news", group: "biz", label: "CNA Business",    url: "https://www.channelnewsasia.com/rssfeeds/8395986" },
  { id: "news-investing",   source: "news", group: "biz", label: "Investing.com",   url: "https://www.investing.com/rss/news.rss" },
  // ── ต่างประเทศ ทั่วไป (intl) ──
  { id: "news-bbc",         source: "news", group: "intl", label: "BBC World",      url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { id: "news-aljazeera",   source: "news", group: "intl", label: "Al Jazeera",     url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { id: "news-cna",         source: "news", group: "intl", label: "CNA",            url: "https://www.channelnewsasia.com/rssfeeds/8395744" },
  { id: "news-guardian",    source: "news", group: "intl", label: "Guardian World", url: "https://www.theguardian.com/world/rss" },
  { id: "news-nyt",         source: "news", group: "intl", label: "NYT World",      url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { id: "news-dw",          source: "news", group: "intl", label: "DW",             url: "https://rss.dw.com/rdf/rss-en-world" },
  { id: "news-france24",    source: "news", group: "intl", label: "France 24",      url: "https://www.france24.com/en/rss" },
  { id: "news-npr",         source: "news", group: "intl", label: "NPR World",      url: "https://feeds.npr.org/1004/rss.xml" },
  { id: "news-cnn",         source: "news", group: "intl", label: "CNN World",      url: "http://rss.cnn.com/rss/edition_world.rss" },
  { id: "news-nbc",         source: "news", group: "intl", label: "NBC News",       url: "https://feeds.nbcnews.com/nbcnews/public/world" },
  { id: "news-fox",         source: "news", group: "intl", label: "Fox News",       url: "https://moxie.foxnews.com/google-publisher/world.xml" },
  { id: "news-nyttop",      source: "news", group: "intl", label: "NYT Top",        url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml" },
  { id: "news-sky",         source: "news", group: "intl", label: "Sky News",       url: "https://feeds.skynews.com/feeds/rss/world.xml" },
  { id: "news-independent", source: "news", group: "intl", label: "The Independent", url: "https://www.independent.co.uk/news/world/rss" },
  { id: "news-abc",         source: "news", group: "intl", label: "ABC News",       url: "https://feeds.abcnews.com/abcnews/internationalheadlines" },
  { id: "news-cbs",         source: "news", group: "intl", label: "CBS News",       url: "https://www.cbsnews.com/latest/rss/world" },
  { id: "news-scmp",        source: "news", group: "intl", label: "SCMP",           url: "https://www.scmp.com/rss/91/feed" },
  { id: "news-bangkokpost", source: "news", group: "gen",  label: "Bangkok Post",   url: "https://www.bangkokpost.com/rss/data/most-recent.xml" },
  { id: "news-nation",      source: "news", group: "gen",  label: "The Nation",     url: "https://www.nationthailand.com/rss" },
  { id: "news-verge",       source: "news", group: "gen",  label: "The Verge",      url: "https://www.theverge.com/rss/index.xml" },

  // 🔔 Alert 1 — แบรนด์ CP (รวม 2 ฟีด: "cp" + "ซีพี" ไว้คอลัมน์เดียว)
  { id: "alert1-cp",   source: "alert1", label: '"cp" -tower', url: "https://www.google.com/alerts/feeds/09603683942017157714/11443863203205870260" },
  { id: "alert1-ซีพี", source: "alert1", label: '"ซีพี"',      url: "https://www.google.com/alerts/feeds/09603683942017157714/5523361181985541471" },

  // 🔔 Alert 2 — อุตสาหกรรมปศุสัตว์/อาหาร/การค้า/คู่แข่ง (query รวม ไทย+อังกฤษ)
  // ราคาหมู/ไก่/ไข่/กุ้ง · ปศุสัตว์ · หมูเถื่อน · อาหารสัตว์ · โรคระบาด (ASF/หวัดนก) · ภาษี/ส่งออก · เบทาโกร/Cargill
  { id: "alert2-agri", source: "alert2", label: "ปศุสัตว์ · อาหาร · การค้า", url: "https://www.google.com/alerts/feeds/09603683942017157714/7091931631874504592" },
];
