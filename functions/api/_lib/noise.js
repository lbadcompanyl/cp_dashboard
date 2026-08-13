// ตัวกรอง "อะไรไม่ใช่ข่าว" ของคอลัมน์ Alert — **ใช้ร่วมกันทุกแดชบอร์ด**
//
// 🎯 เจ้าของสั่งเป็นกฎถาวร (13 ส.ค. 2026): **ตัดที่เดียว = ตัดทุกแดชบอร์ด**
// เดิมโค้ดชุดนี้ถูกก๊อปไว้ทั้งใน trend/feeds.js และ ir/feeds.js แล้วแก้ไม่เท่ากันเรื่อยมา
// (ยกตัวอย่างที่เคยหลุด: termPattern แก้ที่ trend อยู่หลายวันกว่า ir จะตาม —
//  ระหว่างนั้นข่าว F-16s inte(rcep)t หลุดเข้าคอลัมน์การค้าของ IR)
//
// ✅ **แดชบอร์ดใหม่ที่จะสร้างต่อจากนี้ ให้ import จากไฟล์นี้ ห้ามก๊อปโค้ดไปวางอีก**
//    import { noiseReason, setAllowed, isAllowed, realCP, ... } from "../_lib/noise.js";
//
// ⚠️ noiseReason() รับ src ("alert1" = คอลัมน์เครือ CP · อย่างอื่น = คอลัมน์ตามหัวข้อ)
//    เพราะบางกฎใช้ได้เฉพาะคอลัมน์ CP — ดูหมายเหตุในตัวฟังก์ชัน
//
// ⚠️ ALLOWED เป็นตัวแปรระดับโมดูล **ต้องเรียก setAllowed() ใหม่ทุกครั้งที่ build**
//    Workers ใช้โมดูลเดิมซ้ำข้าม request ถ้าไม่ตั้งใหม่จะค้างรายชื่อของ request ก่อนหน้า

import { allowKey } from "../allow.js";

// ---- คำตัดสินรายข่าวของเจ้าของ (เก็บที่ /api/allow ใช้ร่วมกันทุกแดชบอร์ด) ----
// ↩ เอากลับ = ต้องรอดทุกด่าน · ⚑ สั่งตัด = ต้องหายทุกแดชบอร์ด
let ALLOWED = {};
let BLOCKED = {};
export function setAllowed(map) { ALLOWED = map || {}; }
export function setBlocked(map) { BLOCKED = map || {}; }
export const isAllowed = (it) => !!(it && it.link && ALLOWED[allowKey(it.link)]);
export const isBlocked = (it) => !!(it && it.link && BLOCKED[allowKey(it.link)]);

export const LATIN_TERM = /^[\x20-\x7e]+$/;

export const SHOP_HOSTS = [
  "thaisuperphone", "shopee.", "lazada.", "kaidee.", "thaisecondhand", "weloveshopping", "priceza",
  "lnwshop", "tarad.com", "aliexpress", "amazon.", "bananastore", "advice.co.th", "jib.co.th",
  "powerbuy", "mercular", "itopplus", "bentoweb", "makewebeasy", "pantipmarket", "chilindo", "nocnoc",
  // ร้านวัสดุ/ของแต่งบ้าน — หน้าสินค้ามีรหัสรุ่นที่ลงท้ายด้วย -CP (เจอจริง: ราวแขวนผ้า
  // KOHLER K-R26691-CP ของโฮมโปร หลุดเข้าคอลัมน์ CP เพราะรหัสสี "CP" = โครเมียม)
  "homepro.co", "thaiwatsadu", "dohome", "globalhouse", "boonthavorn", "index-living",
  // เว็บเกม/เว็บบอร์ดที่มีหน้าค้นหาในตัว — ไม่ใช่ข่าว (เจอจริง: "Card Search — OnPlay Arena")
  "onplay.in.th", "gamingdose", "playpark",
  // ร้านสินค้าสัตว์เลี้ยง — "CP" เป็นชื่อรุ่นแผ่นรองซับ ไม่ใช่ชื่อเครือ (เจอจริง: vif.pet)
  "vif.pet", "petloft", "petsanova", "pet4home",
];

// หน้า "ข้อมูล" ที่ไม่ใช่ข่าว — ตารางค่าฝุ่น/อากาศรายเมือง อัปเดตทุกชั่วโมงและมีทุกเมืองบนโลก
// (เจอจริง 13 ส.ค. 2026: iqair.com หน้าเมือง "Bieber" ในแคลิฟอร์เนีย หลุดเข้าคอลัมน์ PM2.5)
export const DATAPAGE_HOSTS = [
  "iqair.com", "aqicn.org", "waqi.info", "air4thai.com", "accuweather.com", "weatherbug.com",
  "tmd.go.th/weather", "windy.com", "numbeo.com",
];

export const STREAM_HOSTS = [
  "netflix.", "disneyplus.", "primevideo.", "viu.com", "wetv.vip", "iq.com",
  "hbomax.", "hulu.com", "tv.apple.com", "bilibili.tv", "monomax.", "oneD.net",
];

export const SHOP_RE =
  /โปรโมชั่น|โปรโมชัน|ลดราคา|ราคาพิเศษ|ราคาถูก|สั่งซื้อ|สั่งเลย|ซื้อเลย|ช้อปเลย|ส่งฟรี|พร้อมส่ง|ของแท้ราคา|สินค้าขายดี|shop now|buy now|order now|for sale|free shipping|best price|add to cart|with our |protect yourself/i;

export const DAILY_RE =
  /ประจำวัน|พยากรณ์อากาศ|รายงานสถานการณ์ฝุ่น|รายงานค่าฝุ่น|รายงานคุณภาพอากาศ|สรุปสภาพอากาศ|ค่าฝุ่นละออง[\s\S]{0,12}วันที่/;

export const IMGPOST_RE = /^\s*S_?\d{4,}\b/i;
export const GALLERY_RE = /viewpic|viewimage|showpic|gallery\.php|\/album\//i;

export const PR_RE = /^\s*ข่าวประชาสัมพันธ์/;

export const PR_HOSTS = ["newswit.com", "thaipr.net", "prnewswire.com", "businesswire.com"];

export const JOB_HOSTS = [
  "jobsdb", "jooble", "jobbkk", "jobthai", "indeed.", "glassdoor", "linkedin.", "jobtopgun",
  "careerjet", "talent.com", "workventure", "jobnisit", "trabajo.", "th.joblum", "joboko",
  "monster.co", "monster.com", "jobstreet", "prosple", "hiring.cafe", "jobsbkk", "th.jora.com",
  "seek.com", "seek.co", "jobseek", "jobdb",
];

export const JOB_RE = /รับสมัครงาน|สมัครงาน|หางาน|ตำแหน่งงาน|งานเต็มเวลา|งานพาร์ทไทม์|งานพาร์ท-?ไทม์|jobs in |job vacanc|job opening|now hiring|apply now|years of experience|job purpose|job description|full[- ]time|responsibilities:|qualifications:|we are (?:looking for|hiring)|join our team/i;

export const PROP_HOSTS = [
  "dotproperty", "ddproperty", "livinginsider", "baania", "hipflat", "thinkofliving",
  "propertyhub", "prakard", "realist.co.th", "bahtsold", "propfit", "homenayoo",
];

export const PROP_RE = /ให้เช่า|ห้องเช่า|หอพัก|ขายบ้าน|ขายคอนโด|ขายทาวน์|ขายที่ดิน|ขายดาวน์|for rent|ห้องนอน[\s\S]{0,20}ห้องน้ำ/i;

export const VENDOR_RE = /ตัวแทนจำหน่าย|ผลิตและจำหน่าย|รับติดตั้ง|บริการติดตั้ง|สอบถามราคา|ใบเสนอราคา|ราคาโรงงาน|สินค้าและบริการ|เครื่องกรองน้ำ|เครื่องกรองอากาศ|water purifier|air purifier|air quality sensor|เซนเซอร์วัดคุณภาพอากาศ|แผ่นรองซับ|แผ่นรองฉี่|training pad|pee pad/i;

export const AD_PRODUCT_RE = /ครีม|เซรั่ม|เซรัม|serum|รีมูฟเวอร์|คลีนซิ่ง|สกินแคร์|skincare|มาส์ก|โลชั่น|แป้งพัฟ|ลิปสติก|บำรุงผิว|บำรุงหน้า|ผิวกระจ่างใส/i;

export const AD_PITCH_RE = /หาซื้อได้ที่|วางจำหน่ายแล้ว|พร้อมจำหน่าย|ราคาเพียง|ราคาพิเศษ|โปรโมชั่?น|ลดราคา|สั่งซื้อ|ตัวช่วย|ปัง|ตัวท็อป|ห้ามพลาด|บอกเลยว่า|ต้องมีติดบ้าน|ติดกระเป๋า/i;

export const CP_BRANDS = [
  "ซีพี", "cp all", "cpall", "cpf", "ซีพีเอฟ", "ซีพี ออลล์", "ซีพีแรม", "cpram", "cp axtra", "แอ็กซ์ตร้า",
  "cp group", "cp foods", "cp land", "cp brand", "cp fresh", "cp meiji", "cp-meiji", "cp intertrade",
  "เจริญโภคภัณฑ์", "charoen pokphand", "pokphand", "เจียรวนนท์",
  "เซเว่น", "7-eleven", "7 eleven", "seven eleven", "7-11", "7 11", "แม็คโคร", "makro", "โลตัส", "lotus's",
  "cpaxt", "ซีพี แอ็กซ์ตร้า", "ซีพีแอ็กซ์ตร้า", "cppc", "ซีพีพีซี",
  "ศุภชัย เจียรวนนท์", "ธนินท์ เจียรวนนท์", "supachai chearavanont", "true corp", "ทรู คอร์ปอเรชั่น", "ทรู",
];

export const CP_FALSE = ["บีแอลซีพี", "blcp", "ซีพีเอ็น", "cpn ", "บีซีพีจี", "bcpg", "บีซีพี", "bcp "];

export const CP_FALSE_RX = [
  "ทรู\\s*ดิจิ(?:ทัล|ตอล)\\s*(?:พาร์ค|ปาร์ค|park)",
  "true\\s*digital\\s*park",
  "ทรู\\s*ธ?\\s*โซเชี?ย?ล",
  "truth\\s*social",
  "trump\\s*media",
  // ⚠️ C.P.HOLIDAYS = บริษัททัวร์คนละเจ้า ไม่เกี่ยวกับเครือ (เจอจริง: cpholidays.com
  // หน้า "บริการจองตั๋วเครื่องบิน" หลุดเข้าคอลัมน์ CP)
  "c\\.?\\s*p\\.?\\s*holidays",
  "ซี\\s*\\.?\\s*พี\\s*\\.?\\s*ฮอลิเดย์",
  // รหัสรุ่นสินค้าที่ลงท้าย -CP (สีโครเมียม) — ไม่ใช่ชื่อเครือ
  // ตัวอย่าง: K-R26691-CP · ต้องมีตัวเลข/ขีดนำหน้าเสมอ ไม่งั้นจะกิน "ซีพี" ปกติ
  "[a-z0-9]+-[a-z0-9]*\\d[a-z0-9]*-cp\\b",
];

export const CP_FALSE_RE = new RegExp(
  CP_FALSE.slice().sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).concat(CP_FALSE_RX).join("|"),
  "gi"
);

export const dropFalseCP = (s) => String(s || "").replace(CP_FALSE_RE, " ");

export const hasFalseCP = (s) => { CP_FALSE_RE.lastIndex = 0; return CP_FALSE_RE.test(String(s || "")); };


export function hostOf(link) {
  try { return new URL(link).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

export function realCP(text) {
  const hay = dropFalseCP(String(text || "").replace(/\[\[\/?hl\]\]/g, "")).toLowerCase();
  return CP_BRANDS.some((b) => hay.includes(b));
}

export function termPattern(t) {
  const esc = String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return LATIN_TERM.test(t) ? "(?<![a-z0-9])" + esc + "(?![a-z0-9])" : esc;
}

export function outletOf(link) {
  try { const h = new URL(link).hostname.replace(/^www\./, ""); return h.includes("google.") ? "" : (OUTLET_BY_HOST[h] || h); } catch { return ""; }
}

export function noiseReason(it, title, src) {
  if (isAllowed(it)) return null;      // เจ้าของสั่งคืนไว้ — ไม่ต้องตัดอีก
  if (isBlocked(it)) return "by-owner"; // เจ้าของกด ⚑ สั่งตัด — ตัดทุกแดชบอร์ด
  const link = it.link || "";
  if (GALLERY_RE.test(link)) return "gallery";
  if (IMGPOST_RE.test(title)) return "imagepost"; // เดิมมีแค่ฝั่ง IR — รวมมาแล้ว ใช้ทุกแดชบอร์ด
  if (PR_RE.test(title)) return "pr";
  // เว็บรับแจกข่าวประชาสัมพันธ์ — ใช้กับ **คอลัมน์ CP (alert1) เท่านั้น**
  //
  // ⚠️ เคยตัดทั้งเว็บ แล้วข่าวจริงของเครือหายไปด้วย (ซีพี แอ็กซ์ตร้า แจ้งผลประกอบการ ·
  // Makro ครบรอบ 37 ปี) — บริษัทใหญ่ส่งข่าวของตัวเองผ่านเว็บพวกนี้เป็นปกติ
  // ที่ไม่เอาคือใบที่ชื่อเครือโผล่แค่ในเนื้อ เช่น รายชื่อผู้รับรางวัลท้ายข่าว
  // (เจอจริง: newswit "นาคราชอวอร์ด" พาดหัวเป็นชื่อดารา ซีพี ออลล์ อยู่ท้ายข่าว)
  //
  // 🚫 **ห้ามเอาไปใช้กับ alert2** (13 ส.ค. 2026) — คอลัมน์นั้นตามอุตสาหกรรม ไม่ได้ตามเครือ
  // เงื่อนไข "ต้องมีชื่อเครือ CP ในพาดหัว" จึงตัดข่าวที่ถูกต้องทิ้งหมด
  // (เจอจริง: TFG แจ้งผลประกอบการ Q2/69 · กรมประมงยืนยันมาตรฐานเชื้อดื้อยาในสัตว์น้ำ)
  // ข่าวใน alert2 ผ่านด่าน keyword ของคอลัมน์มาแล้ว การมาจากเว็บแจกข่าวไม่ใช่เหตุผลให้ตัด
  if (src === "alert1" && hostOf(it.link || "") && PR_HOSTS.some((h) => hostOf(it.link || "").includes(h)) && !realCP(title)) return "pr";
  const snip = (it.snippet || "").replace(/\[\[\/?hl\]\]/g, "").toLowerCase();
  const text = title + " " + snip;
  if (DAILY_RE.test(text)) return "daily";
  const host = hostOf(link);
  if (host && SHOP_HOSTS.some((h) => host.includes(h))) return "shopping";
  if (host && STREAM_HOSTS.some((h) => host.includes(h))) return "stream";
  if (host && DATAPAGE_HOSTS.some((h) => host.includes(h))) return "datapage";
  if (SHOP_RE.test(text)) return "shopping";
  if (host && JOB_HOSTS.some((h) => host.includes(h))) return "job";
  if (JOB_RE.test(text)) return "job";
  if (host && PROP_HOSTS.some((h) => host.includes(h))) return "property";
  if (PROP_RE.test(text)) return "property";
  if (VENDOR_RE.test(text)) return "vendor";
  // โฆษณาที่เขียนให้ดูเหมือนข่าว — ต้องเจอทั้งชื่อสินค้าและภาษาชวนซื้อ ไม่งั้นตัดข่าวจริงพลาด
  if (AD_PRODUCT_RE.test(text) && AD_PITCH_RE.test(text)) return "advertorial";
  return null;
}

export function dropNoiseAfterArchive(sources, diag) {
  for (const src of ["alert1", "alert2"]) {
    const b = sources[src];
    if (!b || !Array.isArray(b.items)) continue;
    const before = b.items.length;
    b.items = b.items.filter((it) => {
      const why = noiseReason(it, (it.title || "").replace(/\[\[\/?hl\]\]/g, "").toLowerCase(), src);
      // เก็บลิงก์+พาดหัวเต็มไว้ด้วย — หน้า /admin/ เอาไปแสดงว่า "ระบบตัดอะไรทิ้งไปบ้าง"
      if (why) (diag.dropped = diag.dropped || []).push({ src, why, title: stripMarks(it.title), link: it.link || "" });
      return !why;
    });
    diag[src] = before - b.items.length;
  }
}

// ---- ตัวช่วยจับคำ (ย้ายมาจาก feeds.js ทั้งสองไฟล์ เพราะเหมือนกันเป๊ะ) ----
export const stripMarks = (s) => String(s || "").replace(/\[\[\/?hl\]\]/g, "").trim();
export function normLink(url) {
  try { const u = new URL(url); return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, ""); }
  catch { return url || ""; }
}
export function buildMatchers(terms) {
  return (terms || []).filter(Boolean).map((t) => {
    const re = new RegExp(termPattern(t), "i");
    return { term: String(t).toLowerCase(), test: (hay) => re.test(hay) };
  });
}
export function anyTermIn(hay, matchers) {
  for (const m of matchers) if (m.test(hay)) return m.term;
  return null;
}
export function highlightedTerms(it) {
  const s = (it.title || "") + " " + (it.snippet || "");
  const out = new Set(); let m;
  const re = /\[\[hl\]\]([\s\S]*?)\[\[\/hl\]\]/g;
  while ((m = re.exec(s))) { const w = m[1].replace(/\[\[\/?hl\]\]/g, "").trim().toLowerCase(); if (w.length >= 2) out.add(w); }
  return [...out];
}

// ---- คำ/แพตเทิร์นที่ใช้ตอนตรวจคอลัมน์ Alert (เหมือนกันทุกแดชบอร์ด) ----
export // คำ match ที่ "อ่อนเกิน" — bare "cp" อังกฤษ โผล่ในใบเซอร์/OCR มั่ว/Canadian Pacific/cpu ฯลฯ → ไม่นับเป็นสัญญาณ ต้องพิสูจน์ด้วยชื่อเต็ม
const WEAK_TERMS = new Set(["cp", "cd", "cpi", "cpu"]);
export // ---------- Hybrid alert filter: keyword ต้องอยู่ในเนื้อ/meta ของบทความจริง (ไม่ใช่ related block) ----------
// ต้นเหตุ false positive: Google Alert จับ keyword จากบล็อก "ข่าวที่เกี่ยวข้อง/แนะนำ/roundup" ท้ายหน้า
const ROUNDUP_RE = /สรุปข่าวประจำวัน|สรุปข่าวเด่น|รวมข่าวเด่นประจำ|ข่าวเด่นประจำวัน/;

export // ครอบคำที่ match ด้วย marker [[hl]] ให้ frontend ไฮไลต์ (เหมือน <b> ของ Google Alert)
function hlWrap(text, term) {
  if (!text || !term) return text || "";
  // termPattern: คำอังกฤษต้องตรงทั้งคำ ไม่งั้นจะไปไฮไลต์ "slapp" กลางคำ "slapped"
  const re = new RegExp(termPattern(term), "gi");
  return text.replace(re, (m) => `[[hl]]${m}[[/hl]]`);
}
