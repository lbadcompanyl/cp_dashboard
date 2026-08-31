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
  // ร้านเครื่องดนตรี/เสื้อผ้า — รหัสรุ่นขึ้นต้นด้วย CP (เจ้าของส่งภาพมา 29 ส.ค. 2026:
  // Musedo CP-60G ปิ๊กอัพกีตาร์ · Boss CP-1X เอฟเฟค · Cp Company ฮู้ด)
  "marcato.co.th", "ultravthailand",
  // เว็บเกม/เว็บบอร์ดที่มีหน้าค้นหาในตัว — ไม่ใช่ข่าว (เจอจริง: "Card Search — OnPlay Arena")
  "onplay.in.th", "gamingdose", "playpark",
  // ร้านสินค้าสัตว์เลี้ยง — "CP" เป็นชื่อรุ่นแผ่นรองซับ ไม่ใช่ชื่อเครือ (เจอจริง: vif.pet)
  "vif.pet", "petloft", "petsanova", "pet4home",
  // ⚠️ ร้านค้าออนไลน์ "ของเครือ CP เอง" — คอลัมน์นี้ต้องการข่าวของเครือ ไม่ใช่หน้าขายของ
  // (เจอจริง 13 ส.ค. 2026: "อาหารตามเทศกาล | AllOnline" หมูกรอบชาชู 400 กรัม ฿249)
  // หน้าพวกนี้มีชื่อเครืออยู่เต็มไปหมด ด่านชื่อเครือจึงไม่มีทางกรองออก ต้องตัดที่โดเมน
  "allonline.", "shopat24", "makroclick", "mymakro", "lotuss.com", "7eleven.co.th",
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
  /โปรโมชั่น|โปรโมชัน|ลดราคา|ราคาพิเศษ|ราคาถูก|สั่งซื้อ|สั่งเลย|ซื้อเลย|ช้อปเลย|ส่งฟรี|พร้อมส่ง|ของแท้ราคา|สินค้าขายดี|shop now|buy now|order now|for sale|free shipping|best price|add to cart|with our |protect yourself|allonline|฿\s*\d/i;

export const DAILY_RE =
  /ประจำวัน|พยากรณ์อากาศ|รายงานสถานการณ์ฝุ่น|รายงานค่าฝุ่น|รายงานคุณภาพอากาศ|สรุปสภาพอากาศ|ค่าฝุ่นละออง[\s\S]{0,12}วันที่/;

export const IMGPOST_RE = /^\s*S_?\d{4,}\b/i;
export const GALLERY_RE = /viewpic|viewimage|showpic|gallery\.php|\/album\//i;

// หน้ารวมบทความของเว็บ (WordPress tag/category archive) ไม่ใช่ข่าว — เจ้าของสั่งตัดทั้งหมด 14 ส.ค. 2026
// เจอจริง: "สู้ฝุ่น PM 2.5 Archives - ข่าวท้องถิ่น" (สรุปลงท้ายด้วย "Recent Posts.")
// ⚠️ ดูจาก **พาดหัว** เท่านั้น ห้ามดูจาก URL — เว็บ WordPress จำนวนมากใช้ /archives/12345
// เป็น permalink ของข่าวจริง ถ้าจับที่ลิงก์จะตัดข่าวจริงหายไปทั้งเว็บ
// \b ใช้ได้กับพาดหัวไทยด้วย เพราะอักษรไทยไม่ใช่ \w จึงนับเป็นขอบคำอยู่แล้ว
export const ARCHIVE_RE = /\barchives?\b/i;

/* 📄 **พาดหัวที่บอกเลขหน้า = หน้ารวมรายการ ไม่ใช่ข่าว** (เจ้าของส่งภาพมา 29 ส.ค. 2026)
   เจอจริง: "CP AXTRA | Page 6 of 6 - ThaiPR.NET" — เป็นหน้ารวม tag ของเว็บแจกข่าว
   ⚠️ ดูที่ **พาดหัว** เท่านั้น เหมือน ARCHIVE_RE — ลิงก์ที่มี /page/ เป็น permalink ของข่าวจริงได้ */
// ⚠️ ฝั่งไทยห้ามใส่ \b — อักษรไทยไม่ใช่ \w จึงไม่มีขอบคำให้จับ (เทสต์ [6] จับได้)
export const PAGED_RE = /\bpage\s*\d+\s*(?:of|\/)\s*\d+\b|หน้า(?:ที่)?\s*\d+\s*(?:จาก|\/)\s*\d+/i;

// หน้า "งานอีเวนต์/นิทรรศการ" ของเว็บองค์กร-หน่วยงาน ไม่ใช่ข่าว — เจ้าของแจ้ง 14 ส.ค. 2026
// เจอจริง: นิทรรศการศิลปะ "Shared Sensibilities" บน greener.bangkok.go.th หลุดเข้าคอลัมน์
// หัวข้อที่จับตามอง เพราะเมนูบนสุดของเว็บมีคำว่า "PM 2.5 dust" อยู่ทุกหน้า
// (Google Alert เห็นคำในเมนู ไม่ใช่ในเนื้อหน้า)
//
// ⚠️ ดูจาก **path ของลิงก์** ไม่ใช่พาดหัว — คำว่า "นิทรรศการ" โผล่ในข่าวจริงได้บ่อย
// (เช่นข่าวเครือ CP ออกบูทในนิทรรศการ) ถ้าจับที่พาดหัวจะตัดข่าวจริงไปด้วย
export const EVENT_PATH_RE = /\/(?:events?|exhibitions?|นิทรรศการ)\//i;

export const PR_RE = /^\s*ข่าวประชาสัมพันธ์/;

/* 🌫️ **หน้ารายงานค่าฝุ่นรายพื้นที่ของหน่วยงานท้องถิ่น — ไม่ใช่ข่าว**
 *
 * เจ้าของเจอจริง 27 ส.ค. 2026: "รายงานสถานการณ์ PM 2.5 - เทศบาล เมือง ปู่เจ้าสมิงพราย"
 * หลุดเข้าคอลัมน์หัวข้อที่จับตามอง · เป็นหน้าตัวเลขที่อัปเดตเองทุกวัน
 * (สรุปที่ติดมาคือ "ค่ามาตรฐานคุณภาพอากาศ (PM2.5) 0.0 - 15.0 คุณภาพอากาศดีมาก…")
 * ตระกูลเดียวกับ iqair/aqicn ที่อยู่ใน DATAPAGE_HOSTS แต่เว็บของเทศบาลมีเป็นร้อยแห่ง
 * จึงดักที่ "รูปพาดหัว" แทนการไล่ใส่โดเมนทีละแห่ง
 *
 * ⚠️ **ต้องมีครบ 2 อย่าง** — ขึ้นต้นว่า "รายงานสถานการณ์ฝุ่น/PM" **และ** มีชื่อหน่วยงานท้องถิ่น
 *    เอาอย่างใดอย่างหนึ่งไม่ได้ — ข่าวจริงพาดหัวว่า "รายงานสถานการณ์ PM 2.5 เชียงใหม่วิกฤต"
 *    หรือ "เทศบาลเร่งแก้ฝุ่น" ต้องไม่โดนตัด
 */
export const DUSTPAGE_RE =
  /^\s*รายงานสถานการณ์\s*(?:ค่า)?\s*(?:ฝุ่น|pm)[\s.]*2?\.?5?\b[\s\S]*?(?:เทศบาล|อบต\.?|อบจ\.?|องค์การบริหารส่วน|อำเภอ)/i;

// ⚠️ ryt9.com เพิ่ม 14 ส.ค. 2026 — เป็นเว็บแจกข่าว PR เหมือนกัน และสรุปที่ติดมากับฟีด
// เป็น "ข่าวอื่นที่พ่วงมา" (เจอจริง: การ์ด "อิน-องศา" มีสรุปเป็นข่าว ซีพี แอ็กซ์ตร้า คนละใบ)
export const PR_HOSTS = ["newswit.com", "thaipr.net", "prnewswire.com", "businesswire.com", "ryt9.com"];

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
  "cp group", "cp foods", "cp land", "cp brand", "cp fresh", "cpfresh", "cp meiji", "cp-meiji", "cp intertrade",
  "เจริญโภคภัณฑ์", "charoen pokphand", "pokphand", "เจียรวนนท์",
  "เซเว่น", "7-eleven", "7 eleven", "seven eleven", "7-11", "7 11", "แม็คโคร", "makro", "โลตัส", "lotus's",
  "cpaxt", "ซีพี แอ็กซ์ตร้า", "ซีพีแอ็กซ์ตร้า", "cppc", "ซีพีพีซี",
  "ศุภชัย เจียรวนนท์", "ธนินท์ เจียรวนนท์", "supachai chearavanont", "true corp", "ทรู คอร์ปอเรชั่น", "ทรู",
];

export const CP_FALSE = ["บีแอลซีพี", "blcp", "ซีพีเอ็น", "cpn ", "บีซีพีจี", "bcpg", "บีซีพี", "bcp "];

/* 🎸 **`CP` ที่เป็นรหัสรุ่นสินค้า ไม่ใช่ชื่อเครือ** (เจ้าของส่งภาพมา 29 ส.ค. 2026)
   เจอจริงในคอลัมน์ CP: `Musedo CP-60G` ปิ๊กอัพกีตาร์ · `Boss CP-1X` เอฟเฟคกีตาร์
   ⚠️ ต้องมี "ตัวเลข" ต่อท้ายเสมอ — `CP-` เฉยๆ ไม่นับ ไม่งั้นไปโดน "CP-Meiji" ที่เป็นบริษัทจริง
   (กฎตระกูลเดียวกับรหัสสี `-CP` ของโฮมโปรที่เคยเจอ แต่คนละฝั่งของขีด) */
export const CP_MODEL_RE = /\bcp\s*[-–]\s*\d|\bcp\d{2,}\b/i;
const CP_MODEL_RE_G = new RegExp(CP_MODEL_RE.source, "gi");

export const CP_FALSE_RX = [
  // 👕 CP Company = แบรนด์เสื้อผ้าอิตาลี (เจอจริง: หน้าขายฮู้ดของ ultravthailand)
  "cp\\s*company",
  // 🎮 ค่าพลังโปเกม่อน — "Snorlax Pokemon Go CP Explained" หลุดเข้าคอลัมน์ CP
  "pok[eé]mon[\\s\\S]{0,40}\\bcp\\b|\\bcp\\b[\\s\\S]{0,40}pok[eé]mon",
  "ทรู\\s*ดิจิ(?:ทัล|ตอล)\\s*(?:พาร์ค|ปาร์ค|park)",
  "true\\s*digital\\s*park",
  "ทรู\\s*ธ?\\s*โซเชี?ย?ล",
  "truth\\s*social",
  "trump\\s*media",
  // ⚠️ ซีพีพี = Central precocious puberty (ภาวะเป็นหนุ่มสาวก่อนวัย) — ศัพท์การแพทย์ ไม่ใช่เครือ
  // (เจอจริง: บทความ BBC News ไทย หลุดเข้าคอลัมน์ CP เพราะในเนื้อมีคำว่า "ซีพีพี")
  // ⚠️ ต้องกัน "ซีพีพีซี" (CPPC เป็นบริษัทในเครือจริง) ไม่งั้นจะตัดชื่อจริงพังไปด้วย
  "ซีพีพี(?!ซี)",
  "central\\s*precocious\\s*puberty",
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
  if (ARCHIVE_RE.test(title)) return "archive-page"; // หน้ารวมบทความ ไม่ใช่ข่าว
  if (PAGED_RE.test(title)) return "paged-list";     // "Page 6 of 6" = หน้ารวมรายการ ไม่ใช่ข่าว
  if (EVENT_PATH_RE.test(link)) return "event-page";  // หน้างานอีเวนต์/นิทรรศการ ไม่ใช่ข่าว
  if (PR_RE.test(title)) return "pr";
  if (DUSTPAGE_RE.test(title)) return "dustpage"; // หน้ารายงานค่าฝุ่นของท้องถิ่น ไม่ใช่ข่าว
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
  if (src === "alert1" && hostOf(it.link || "") && PR_HOSTS.some((h) => hostOf(it.link || "").includes(h)) && cpEvidence(title) !== "strong") return "pr";
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
  // ⚠️ ชื่อลวงเครือ CP ต้องเช็คที่นี่ด้วย ไม่ใช่เช็คแต่ตอน verify
  // ด่าน verify ทำงาน "ก่อน" ดึงของเก่าจาก KV กลับมา ของเก่าที่เก็บไว้ตั้งแต่ยังไม่มีกฎนี้
  // จึงไหลกลับเข้าคอลัมน์โดยไม่ผ่านด่านแล้วอยู่ยาว — ตัวนี้เป็นด่านที่กวาดของเก่าด้วย
  // (เจอจริง 13 ส.ค. 2026: ข่าวทรัมป์/ทรูธโซเชียล ยังอยู่ในคอลัมน์ CP ของ IR หลัง release)
  //
  // 📌 อยู่ท้ายสุดโดยตั้งใจ — ให้กฎที่เจาะจงกว่า (ร้านค้า/ประกาศงาน/เว็บแจกข่าว) ตอบก่อน
  // ไม่งั้นหน้าสินค้าโฮมโปรที่มีรหัสรุ่น -CP จะรายงานเหตุผลว่า "ชื่อลวง" แทนที่จะเป็น "ร้านค้า"
  // ตัดเหมือนกันทั้งคู่ แต่เจ้าของอ่านรายการบนหน้า admin แล้วต้องเข้าใจว่าตัดเพราะอะไรจริงๆ
  //
  // ดูจาก "พาดหัว" อย่างเดียว — สรุปที่ติดมากับฟีดเป็นข่าวที่เกี่ยวข้อง ไม่ใช่เนื้อข่าวใบนี้
  if (src === "alert1" && hasFalseCP(title) && !realCP(title)) return "false-cp";
  return null;
}

// ---------- สรุปที่เป็น "บล็อกประจำเว็บ" ไม่ใช่สรุปของข่าวใบนั้น ----------
//
// 🎯 เจ้าของแจ้ง 21 ส.ค. 2026: การ์ด 2 ใบในคอลัมน์ "หัวข้อที่จับตามอง" คนละข่าวกันสนิท
//    ("พี่ชายยืนยันน้องชายโดน ฮ.บินไล่ยิงจริง" กับ "ปิดทางรถไฟนราธิวาส!") แต่มี**สรุปเหมือนกันเป๊ะ**
//    คือ "ทช. สำรวจปลาหมอคางดำ 4 จังหวัด พบ 5 ตัว…" ซึ่งเป็นบล็อก "ข่าวที่เกี่ยวข้อง" ของเว็บต้นทาง
//
// ผลเสีย 2 ชั้น:
//   1. อ่านแล้วสับสน — สรุปใต้พาดหัวเป็นของข่าวคนละใบ
//   2. **ดูดข่าวผิดเข้าคอลัมน์** — `mergeNewsIntoAlert` ของ `alert2` เทียบคำที่ "พาดหัว + สรุป"
//      คำ `ปลาหมอคางดำ` ที่อยู่ในบล็อกนั้นเลยทำให้ข่าว ฮ.บินไล่ยิง / รถไฟนราธิวาส ถูกดึงเข้ามา
//
// `looksLikeListing()` จับไม่ได้เพราะมันดูสัญญาณ "วันที่" ซึ่งบล็อกนี้ไม่มีเลย
//
// ✅ สัญญาณที่ใช้แทน: **สรุปก้อนเดียวกันโผล่ในข่าวตั้งแต่ 2 ใบขึ้นไป**
//    สรุปจริงของข่าวคนละใบไม่มีทางเหมือนกันทั้งย่อหน้า — ถ้าเหมือน แปลว่าเป็นของประจำเว็บ
//    · ตรวจได้ในรอบเดียวจากข้อมูลที่มีอยู่แล้ว ไม่ต้องยิงเน็ตเพิ่ม
//    · ตามเว็บใหม่ๆ ได้เอง ไม่ต้องไล่เติมคำ/โดเมนเหมือนตัวกรองอื่น
//
// ⚠️ **ต้องทำก่อน `mergeNewsIntoAlert` และก่อน `pruneStaleMerged`** ไม่งั้นเกณฑ์ 2 ตัวนั้น
//    ยังเห็นสรุปปลอมอยู่ แล้วดึงเข้า-ลบทิ้งสลับกันทุกรอบ
const SHARED_SNIP_MIN = 30; // สั้นกว่านี้อาจซ้ำกันโดยบังเอิญได้ (เช่น "อ่านต่อ…")
const snipKey = (s) => stripMarks(String(s || "")).replace(/\s+/g, " ").trim().toLowerCase();

export function dropSharedSnippets(sources, diag) {
  const byText = new Map();  // สรุป -> Set ของลิงก์ที่ใช้สรุปก้อนนี้
  const each = (fn) => {
    for (const b of Object.values(sources || {})) {
      for (const it of (b && b.items) || []) {
        const k = snipKey(it.snippet);
        if (k.length >= SHARED_SNIP_MIN) fn(k, it);
      }
    }
  };
  // ⚠️ นับด้วย "ลิงก์" ไม่ใช่จำนวนใบ — ข่าวใบเดียวโผล่ได้หลายคอลัมน์ (News + alert)
  //    ถ้านับใบ ข่าวปกติที่อยู่ 2 คอลัมน์จะถูกมองว่าสรุปซ้ำแล้วโดนตัดทิ้งฟรีๆ
  each((k, it) => {
    if (!byText.has(k)) byText.set(k, new Set());
    byText.get(k).add(normLink(it.link || "") || it.id || "");
  });
  let n = 0;
  each((k, it) => {
    if ((byText.get(k) || new Set()).size < 2) return;
    it.snippet = "";
    it.sharedSnip = true;   // ติดธงไว้ให้ไล่ปัญหาได้ ว่าสรุปหายเพราะอะไร
    n++;
  });
  if (diag) diag.sharedSnippets = n;
  return n;
}

export function dropNoiseAfterArchive(sources, diag) {
  for (const src of ["alert1", "alert2"]) {
    const b = sources[src];
    if (!b || !Array.isArray(b.items)) continue;
    const before = b.items.length;
    b.items = b.items.filter((it) => {
      const why = noiseReason(it, (it.title || "").replace(/\[\[\/?hl\]\]/g, "").toLowerCase(), src);
      // เก็บลิงก์+พาดหัวเต็มไว้ด้วย — หน้า /admin/ เอาไปแสดงว่า "ระบบตัดอะไรทิ้งไปบ้าง"
      if (why) (diag.dropped = diag.dropped || []).push({ src, why, title: stripMarks(it.title), link: it.link || "", at: it.publishedAt || "" });
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
const ROUNDUP_RE = /สรุปข่าวประจำวัน|สรุปข่าวเด่น|รวมข่าวเด่นประจำ|ข่าวเด่นประจำวัน|มาร์เก็ตนิวส์|market\s*news/;

/* ✂️ **ตัดบล็อก "ข่าวที่เกี่ยวข้อง" ออกจากเนื้อข่าวก่อนไปหา keyword**
 *
 * เจ้าของแจ้ง 29 ส.ค. 2026: "บางข่าว keyword อยู่หลังคำว่า ข่าวที่เกี่ยวข้อง ชัดเจนเลยนะ"
 * Google Alert เห็นคำที่ไหนก็ได้ในหน้า — รวมถึงลิสต์ข่าวแนะนำท้ายบทความ ซึ่ง **ไม่ใช่เนื้อข่าวใบนี้**
 * ข่าวคนละเรื่องจึงไหลเข้าคอลัมน์ CP ทั้งที่ในบทความจริงไม่มีชื่อเครือเลยสักคำ
 *
 * ⚠️ **ตัดเฉพาะ marker ที่อยู่ "ท้ายบทความ" เท่านั้น** — เว็บข่าวไทยชอบแทรกกล่อง
 *    "ข่าวที่เกี่ยวข้อง" ไว้ **กลางบทความ** แล้วเขียนเนื้อข่าวจริงต่อ
 *    ถ้าเจอ marker ตรงไหนก็ตัดยาวถึงท้าย = กินเนื้อข่าวจริงไปด้วย
 * 🚫 **และห้ามตัดเป็นช่วงความยาวตายตัว** (เคยลอง 700 ตัวอักษร) — บล็อกแนะนำยาวไม่เท่ากัน
 *    เดาสั้นไปก็ตัดไม่หมด เดายาวไปก็กินเนื้อข่าว · เทสต์ related.mjs [2] จับได้ตอนลองจริง
 * ✅ ยึดหลัก "ตัดพลาดแล้วข่าวหายเงียบ แย่กว่าปล่อยขยะผ่าน" — marker กลางบทความจึงไม่แตะเลย
 */
const RELATED_RE =
  /(?:ข่าว|เรื่อง|บทความ|คลิป)?\s*(?:ที่|อื่น)?\s*(?:เกี่ยวข้อง|แนะนำ|น่าสนใจ)|อ่านข่าวต้นฉบับ|อ่านเพิ่มเติมได้ที่|ข่าวยอดนิยม|ข่าวฮิต|related\s*(?:news|articles?|posts?|stories)|you\s*may\s*also\s*like|read\s*(?:also|more|next)|more\s*(?:from|stories)/gi;
const RELATED_TAIL_AT = 0.6;  // marker ที่อยู่หลังจุดนี้ = บล็อกท้ายหน้า ตัดถึงจบ · ก่อนหน้านี้ไม่แตะ

export function cutRelated(text) {
  const s = String(text || "");
  if (!s) return "";
  RELATED_RE.lastIndex = 0;
  const cuts = [];
  let m;
  while ((m = RELATED_RE.exec(s))) {
    if (!m[0].trim()) { RELATED_RE.lastIndex++; continue; }  // กันแมตช์ว่างวนไม่จบ
    if (m.index / s.length < RELATED_TAIL_AT) continue;      // กลางบทความ = ไม่แตะ
    cuts.push([m.index, s.length]);
  }
  if (!cuts.length) return s;
  // รวมช่วงที่ทับกันก่อนเฉือน ไม่งั้นตัดซ้อนแล้วตำแหน่งเพี้ยน
  cuts.sort((a, b) => a[0] - b[0]);
  const keep = [];
  let at = 0;
  for (const [a, b] of cuts) {
    if (a > at) keep.push(s.slice(at, a));
    at = Math.max(at, b);
  }
  if (at < s.length) keep.push(s.slice(at));
  return keep.join(" ");
}

export // ครอบคำที่ match ด้วย marker [[hl]] ให้ frontend ไฮไลต์ (เหมือน <b> ของ Google Alert)
function hlWrap(text, term) {
  if (!text || !term) return text || "";
  // termPattern: คำอังกฤษต้องตรงทั้งคำ ไม่งั้นจะไปไฮไลต์ "slapp" กลางคำ "slapped"
  const re = new RegExp(termPattern(term), "gi");
  return text.replace(re, (m) => `[[hl]]${m}[[/hl]]`);
}

// ---------- ตัวอย่างสอน AI จากคำตัดสินของเจ้าของ (ใช้ร่วมทุกแดชบอร์ด) ----------
// เจ้าของสั่ง 13 ส.ค. 2026: "ตัดอันไหนก็ให้ไปเรียนรู้" — ยกวิธีเดียวกับที่ใช้สอนการจัดหมวดข่าว
// (few-shot จากที่ผู้ใช้แก้เอง) มาใช้กับด่านตัดสินคอลัมน์ CP
//
// ⚠️ ไม่ใช่การ "เทรน" โมเดล — เป็นการยกตัวอย่างให้ดูใหม่ทุกครั้งที่ถาม
//    ผลจึงมาทันที และถอนได้ทันทีเมื่อเจ้าของเปลี่ยนใจ (กดปุ่มตรงข้าม)
// ⚠️ อ่านจาก blob `noise:allow` ที่ feeds.js อ่านอยู่แล้วทุก build — **ไม่มี KV read เพิ่ม**
const CP_DROP_WHY = new Set([
  "ai-no-cp", "false-cp",
  "ไม่มีชื่อเครือ CP ในพาดหัว",
  "ไม่มีชื่อเครือ CP ในพาดหัว/สรุป", // ของเก่าที่ยังค้างใน KV
]);
/**
 * เลือกตัวอย่าง y/n จากที่เจ้าของกด ↩ เอากลับ / ⚑ สั่งตัด
 * @returns [{ t: พาดหัว, y: true = เป็นข่าวของเครือ }] ใหม่สุดก่อน
 */
export function cpExamples(decisions, max = 8) {
  const d = decisions || {};
  // ⚠️ เอาเฉพาะพาดหัวที่ "ไม่มีชื่อเครืออยู่ในตัวมันเอง" — ใบที่มีชื่อเครือในพาดหัวผ่านตั้งแต่
  // ด่านแรก ไม่มีวันมาถึงชั้น AI · ใส่เป็นตัวอย่างก็ไม่ตรงกับของจริงที่ AI ต้องตัดสิน
  const pick = (map, y, keep) =>
    Object.values(map || {})
      .filter((r) => r && r.title && !realCP(r.title) && keep(r))
      .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
      .slice(0, Math.ceil(max / 2))
      .map((r) => ({ t: String(r.title).replace(/\[\[\/?hl\]\]/g, "").slice(0, 120), y, at: r.at || "" }));
  // ↩ เอากลับ = "ใบนี้เป็นข่าวของเครือ ตัดผิดแล้ว" — นับเฉพาะใบที่ถูกตัดด้วยเหตุผลของคอลัมน์ CP
  // (เอากลับหน้าประกาศงาน/หน้าขายของ ไม่ได้แปลว่ามันเป็นข่าวของเครือ)
  const yes = pick(d.allowed, true, (r) => CP_DROP_WHY.has(r.why));
  // ⚑ สั่งตัด = "ใบนี้ไม่ใช่ข่าวที่อยากเห็น" · พาดหัวไม่มีชื่อเครือด้วย จึงใช้เป็นตัวอย่าง n ได้
  const no = pick(d.blocked, false, () => true);
  // คละสองฝั่งเสมอ ไม่ให้ AI เห็นแต่ n แล้วตอบ n รัว
  return [...yes, ...no].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, max);
}

// ---------- ชื่อเครืออยู่ "เป็นคำของตัวเอง" หรือ "ไปเจอกลางคำอื่น" ----------
// ภาษาไทยไม่มีช่องว่างคั่นคำ การเทียบแบบ includes จึงไปเจอชื่อเครือกลางคำอื่นได้
// เจอจริง 14 ส.ค. 2026: "คาราจีแนน ฟู้ดเจล อควา **เอ็มซีพีไอ**" ของ halal.co.th
// — คำว่า `ซีพี` ซ่อนอยู่ใน `เอ็ม-ซีพี-ไอ` (สารเคมี MCP) แต่ระบบนับว่าเป็นข่าวของเครือ
// แล้วปล่อยผ่านตั้งแต่ด่านแรก **ไม่มีวันไปถึงชั้น AI**
//
// weak = ชื่อเครือถูกขนาบด้วยตัวอักษรไทย "ทั้งสองข้าง" = อยู่กลางคำอื่นแน่ๆ
// จงใจตั้งเกณฑ์ให้แคบ: "เครือซีพี" / "ซีพีเอฟ" มีขอบด้านหนึ่งเป็นช่องว่าง/ขอบข้อความ = strong
// (weak ไม่ได้แปลว่าตัดทิ้ง แค่ส่งให้ AI อ่านพาดหัวตัดสินอีกที)
const THAI_LETTER = /[ก-ฮะ-๎]/;

// ⚠️ **`CP` เดี่ยวๆ ไม่นับเป็นหลักฐานชี้ขาด แต่ก็ห้ามมองข้าม** (แก้ 20 ส.ค. 2026)
// ของเดิมไม่มี `cp` เดี่ยวในลิสต์เลย ข่าวที่เขียนชื่อเครือเป็นอังกฤษล้วนจึง "ไม่เจอชื่อเครือ"
// แล้วตกไปด่านอ่านเนื้อข่าว → ถูกตัดทิ้งด้วยเหตุผล "ไม่มีชื่อเครือ CP ในพาดหัว"
// เจอจริง: "เปิดแผน รฟฟท.บริหาร 'แอร์พอร์ตเรลลิงก์' รับมือเลิกสัญญา**ไฮสปีด CP**" ของกรุงเทพธุรกิจ
// — ข่าวเลิกสัญญารถไฟความเร็วสูงของเครือ ซึ่งเป็นข่าวที่ควรอยู่ในคอลัมน์ที่สุด
//
// 🚫 **ห้ามใส่ลง `CP_BRANDS` ตรงๆ** — `CP` เป็นตัวย่อของอย่างอื่นเยอะมาก
// (cerebral palsy · ภาควิชาวิศวกรรมคอมพิวเตอร์ จุฬาฯ · รหัสรุ่นสินค้า)
// ปล่อยผ่านฟรีเมื่อไหร่ = ของไม่เกี่ยวไหลเข้าคอลัมน์ CP ทันที
// ✅ ให้เป็น **weak** = ส่งให้ AI อ่านพาดหัวตัดสิน — วิธีเดียวกับ `เอ็มซีพีไอ`
const CP_WEAK_BRANDS = ["cp"];

const BRAND_RE = new Map();
const brandRe = (b) => {
  let re = BRAND_RE.get(b);
  if (!re) { re = new RegExp(termPattern(b), "gi"); BRAND_RE.set(b, re); }
  re.lastIndex = 0;
  return re;
};

/** @returns "strong" | "weak" | "" (ไม่เจอชื่อเครือเลย) */
/* ✂️ **ตัดจุดในชื่อย่อออกก่อนเทียบ** — `C.P. Group` / `ซี.พี. ออลล์` เขียนแบบมีจุดก็เจอบ่อย
 *
 * 🐞 เจ้าของเจอจริง 27 ส.ค. 2026: ข่าว "เจาะเบื้องหลังความร่วมมือ C.P. Group x Arise Venture
 *    x True x Amazon" **ถูกตัดทิ้งด้วยเหตุผล "ไม่มีชื่อเครือ CP"** ทั้งที่ชื่อเครืออยู่ในพาดหัวเต็มๆ
 *    เพราะลิสต์เก็บไว้เป็น `cp group` แต่ในพาดหัวเขียน `c.p. group` — จุดคั่นทำให้ไม่ตรง
 *
 * ตัดเฉพาะจุดที่ **ขนาบด้วยตัวอักษรทั้งสองข้าง** เท่านั้น (`c.p.` → `cp` · `ซี.พี.` → `ซีพี`)
 * ⚠️ ไม่กระทบชื่อโดเมนหรือเลขทศนิยม เพราะเราเอาไปเทียบกับ "ชื่อแบรนด์" อย่างเดียว
 *    และ `termPattern` ยังบังคับขอบคำอยู่ (`m.c.p.i` → `mcpi` ซึ่ง `cp` ยังไม่ match)
 */
// ⚠️ **ห้ามบังคับว่าต้องมีตัวอักษรตามหลังจุด** — `C.P. Group` จุดที่สองตามด้วยช่องว่าง
//    เขียนแบบนั้นแล้วได้ `cp. group` ซึ่งยังไม่ตรงกับ `cp group` ในลิสต์ (เจอตอนวัดจริง)
//    เงื่อนไขที่ถูกคือ "จุดที่ตามหลังตัวอักษร และไม่ได้ตามด้วยตัวเลข"
//    (กันเลขทศนิยมอย่าง `PM 2.5` ไว้ — จุดนั้นตามหลังตัวเลข ไม่ใช่ตัวอักษร อยู่แล้ว)
// ⚠️ **ต้องรับ `\p{M}` (สระ/วรรณยุกต์) ด้วย ไม่ใช่แค่ `\p{L}`**
//    "ซี" ลงท้ายด้วยสระ ี ซึ่งไม่ใช่ "ตัวอักษร" ในสายตา Unicode
//    เขียนแค่ \p{L} แล้ว "ซี.พี." จะไม่ถูกตัดจุดเลย (เจอตอนวัดจริง)
const DOTTED_ABBR = /(?<=[\p{L}\p{M}])\.(?!\d)/gu;
const undot = (s) => String(s || "").replace(DOTTED_ABBR, "");

/* 🚂 **บริบทที่ยืนยันว่า "CP" เดี่ยวๆ คือเครือจริง**
 *
 * 🐞 เจ้าของเจอจริง 27 ส.ค. 2026: "รฟท.นัดถก CP พรุ่งนี้ ชี้ขาด 'ไฮสปีดเทรน 3 สนามบิน'
 *    หยุดเดินรถแอร์พอร์ตลิงก์" **ถูก AI ตัดสินว่าไม่ใช่ข่าวของเครือ** แล้วตัดทิ้ง
 *    ทั้งที่โครงการนี้เป็นของกลุ่ม CP ชัดเจน
 *
 * ⚠️ **ใช้ได้ก็ต่อเมื่อเจอ "CP" อยู่แล้วเท่านั้น** — คำพวกนี้ลอยๆ ไม่นับเป็นข่าวเครือ
 *    (ข่าว "สุวรรณภูมิ แนะใช้แอร์พอร์ตลิงก์" ไม่มี CP จึงยังถูกตัดตามเดิม ถูกต้องแล้ว)
 */
const CP_STRONG_CTX =
  /ไฮสปีด|ไฮ-?สปีด|high\s*speed|แอร์พอร์ต\s*(?:เรล)?\s*ลิงก์|airport\s*rail|รฟท|สามสนามบิน|3\s*สนามบิน|เครือ|กลุ่มซีพี/i;

export function cpEvidence(text) {
  // ⚠️ ตัดจุดก่อน **แล้วค่อย** ตัดชื่อลวง — ไม่งั้น "ซี.พี.เอ็น" จะรอดด่านชื่อลวงไปได้
  const raw = undot(String(text || "").replace(/\[\[\/?hl\]\]/g, ""));
  // 🎸 รหัสรุ่นสินค้า (CP-60G · CP-1X) ต้องหายไปก่อนนับหลักฐาน ไม่งั้นถูกนับเป็น "CP เดี่ยว"
  //    แล้วส่งไปให้ AI ตัดสิน ซึ่ง AI ตอบว่าใช่บ่อย → ปิ๊กอัพกีตาร์หลุดเข้าคอลัมน์ CP
  const hay = dropFalseCP(raw).replace(CP_MODEL_RE_G, " ").toLowerCase();
  let found = "";
  const scan = (list, level) => {
    for (const b of list) {
      // ⚠️ ใช้ `termPattern` ไม่ใช่ `indexOf` — คำละตินต้องตรงทั้งคำ
      // ของเดิมใช้ indexOf ทำให้ `cpf` ไปเจอกลาง `cpfresh` และ `cp all` เจอใน `cp allocation`
      const re = brandRe(b);
      let m;
      while ((m = re.exec(hay))) {
        const before = m.index > 0 ? hay[m.index - 1] : "";
        const after = hay[m.index + m[0].length] || "";
        if (!(THAI_LETTER.test(before) && THAI_LETTER.test(after))) return level;
        found = "weak";
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    }
    return "";
  };
  const strong = scan(CP_BRANDS, "strong");
  if (strong) return strong;
  // ชื่อเต็มไม่มี — ลองคำย่อที่กำกวม ถ้าเจอให้ AI ตัดสิน (ไม่ปล่อยผ่าน ไม่ตัดทิ้ง)
  if (scan(CP_WEAK_BRANDS, "weak")) {
    // มีบริบทที่เป็นของเครือชัดเจนอยู่ในพาดหัวด้วย = เชื่อได้เลย ไม่ต้องให้ AI เดา
    return CP_STRONG_CTX.test(hay) ? "strong" : "weak";
  }
  return found;
}
