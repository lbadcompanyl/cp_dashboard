// ตัว parse RSS/Atom แบบเบา ไม่พึ่ง DOMParser (ใช้ได้ใน Cloudflare Workers)
// รองรับ: RSS <item>, Atom <entry> และฟีด Google Trends (namespace ht:)

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(str = "") {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n) => ENTITIES[n])
    .trim();
}

function stripTags(html = "") {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// แปลง <b>..</b> (Google Alert ครอบคำที่ match) เป็น marker \u0001..\u0002 แล้วตัด tag อื่นทิ้ง
// marker ผ่าน JSON/escapeHtml ได้ปลอดภัย ฝั่ง client ค่อยแปลงเป็น <mark> ไฮไลต์
function markBold(html = "") {
  const marked = html.replace(/<b\b[^>]*>/gi, "[[hl]]").replace(/<\/b\s*>/gi, "[[/hl]]");
  return stripTags(marked);
}
const stripMarks = (s = "") => s.replace(/\[\[\/?hl\]\]|[\u0001\u0002]/g, "");

// ตรวจว่า "สรุป" ที่ติดมากับฟีดเป็นสรุปของข่าวใบนี้จริง หรือเป็นรายการข่าวอื่นที่พ่วงมา
//
// ⚠️ เจ้าของแจ้ง 13 ส.ค. 2026: การ์ด "พลิกธุรกิจค้าส่งอาหารสู่ยุคดิจิทัล เปิดตัวสี่มุมเมืองออนไลน์"
// มีสรุปเป็น "2569 | 22:00 น. ซีพี แอ็กซ์ตร้า โชว์ผลงานครึ่งปีแรก ทำรายได้ 2.68 แสนล้านบาท…"
// ซึ่งเป็น **ข่าวคนละใบ** — บางฟีดใส่บล็อก "ข่าวที่เกี่ยวข้อง" หรือเศษหน้ารวมข่าวมาแทนสรุปจริง
// อ่านแล้วสับสน และเคยทำให้ข่าวหลุดเข้าคอลัมน์ผิดเพราะไปเจอชื่อเครือในนั้น
//
// สัญญาณที่ใช้ (ต้องชัดพอ ไม่งั้นตัดสรุปจริงทิ้ง):
//   1. ขึ้นต้นด้วยเศษวันที่/เวลา — สรุปจริงไม่มีทางเริ่มกลางประโยคแบบนั้น
//   2. มีวันที่แบบไทยตั้งแต่ 2 ชุดขึ้นไป = เป็นรายการหลายข่าว ไม่ใช่ย่อหน้าเดียว
// ⚠️ ต้องรู้จักทั้งชื่อย่อ (ส.ค.) และชื่อเต็ม (สิงหาคม) — เจอจริง 13 ส.ค. 2026:
// สรุปของเดลินิวส์เขียนวันที่แบบเต็ม "13 สิงหาคม 2569 18:30 น." ตัวจับที่รู้จักแต่ชื่อย่อ
// เลยปล่อยรายการข่าวอื่นผ่านมา แล้วคำ "ซีพี" ในนั้นดูดข่าวตลาดหุ้นเข้าคอลัมน์ CP
const TH_MONTH = "(?:ม\\.ค\\.|ก\\.พ\\.|มี\\.ค\\.|เม\\.ย\\.|พ\\.ค\\.|มิ\\.ย\\.|ก\\.ค\\.|ส\\.ค\\.|ก\\.ย\\.|ต\\.ค\\.|พ\\.ย\\.|ธ\\.ค\\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)";
const DATE_STAMP_RE = new RegExp("\\d{1,2}\\s*" + TH_MONTH + "\\s*\\d{4}", "g");
// ขึ้นต้นด้วย: ปี พ.ศ. ตามด้วย | · เวลา นาฬิกา · วันที่ไทย · "น." ลอยๆ
const LEAD_JUNK_RE = new RegExp(
  "^\\s*(?:\\d{4}\\s*[|·]|\\d{1,2}:\\d{2}\\s*น\\.|น\\.\\s|\\d{1,2}\\s*" + TH_MONTH + ")"
);
export function looksLikeListing(s = "") {
  const t = stripMarks(String(s || "")).trim();
  if (!t) return false;
  if (LEAD_JUNK_RE.test(t)) return true;
  DATE_STAMP_RE.lastIndex = 0;
  return (t.match(DATE_STAMP_RE) || []).length >= 2;
}

// ตรวจข้อความ "พัง" (mojibake) — เช่น snippet PDF ราชกิจจานุเบกษาที่ Google ดึงมาเพี้ยน
// สัญญาณ: มี  / สัญลักษณ์แปลก (@ % ^ | <> ฯลฯ) เยอะ / อัตราตัวอักษรจริงต่ำ
function symbolNoise(s = "") {
  return (s.match(/[@%^~|<>{}\\№¤§±]/g) || []).length;
}
function isGarbled(s = "") {
  const t = s.trim();
  if (t.length < 6) return false;
  if (/�/.test(t)) return true; //  = ตัวอักษรเสีย
  const noSpace = t.replace(/\s+/g, "");
  if (!noSpace) return false;
  const letters = (t.match(/[A-Za-z฀-๿]/g) || []).length;
  const ratio = letters / noSpace.length;
  if (symbolNoise(t) >= 3) return true; // สัญลักษณ์แปลก ≥3 ตัว
  if (ratio < 0.45 && noSpace.length >= 8) return true; // ตัวอักษรจริงน้อยกว่าครึ่ง
  return false;
}

function blocks(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1]) : "";
}

function attr(block, tag, name) {
  const m = block.match(new RegExp(`<${tag}[^>]*\\b${name}="([^"]*)"`));
  return m ? decode(m[1]) : "";
}

function toISO(str) {
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return "i" + (h >>> 0).toString(36);
}

// RSS <item> หรือ Atom <entry> (ใช้กับ news + alert)
// ลิงก์ตัวเปลี่ยนทางของ Google/Bing → ลิงก์ข่าวจริงที่อยู่ในพารามิเตอร์ `url=`
//
// ทำเฉพาะโดเมนของ Google/Bing เท่านั้น — เว็บข่าวบางเว็บก็มีพารามิเตอร์ชื่อ `url=`
// ของตัวเอง ถ้าแกะมั่วจะได้ลิงก์ผิดไปเลย
const REDIRECT_HOST_RE = /(^|\.)(bing\.com|google\.[a-z.]+)$/i;
export function unwrapRedirect(link) {
  const s = String(link || "");
  if (!s) return s;
  let host = "";
  try { host = new URL(s).hostname; } catch { return s; }
  if (!REDIRECT_HOST_RE.test(host)) return s;
  const m = s.match(/[?&]url=([^&]+)/);
  if (!m) return s;
  try {
    const real = decodeURIComponent(m[1]);
    return /^https?:\/\//i.test(real) ? real : s;
  } catch {
    return s;
  }
}

export function parseGeneric(xml, source) {
  const items = [];
  let list = blocks(xml, "item").map((b) => ({ b, atom: false }));
  if (list.length === 0) list = blocks(xml, "entry").map((b) => ({ b, atom: true }));

  for (const { b, atom } of list) {
    let title = tagText(b, "title");
    if (!title) continue;
    let link = atom ? attr(b, "link", "href") || tagText(b, "id") : tagText(b, "link");
    const date =
      tagText(b, "pubDate") ||
      tagText(b, "published") ||
      tagText(b, "updated") ||
      tagText(b, "dc:date");
    const isAlert = source.startsWith("alert");
    const rawDesc = tagText(b, "description") || tagText(b, "summary") || tagText(b, "content");
    // alert: เก็บ <b> เป็น marker เพื่อไฮไลต์ · news: ตัด tag ตามปกติ
    let snippet = isAlert ? markBold(rawDesc) : stripTags(rawDesc);
    let sourceLabel = "";

    if (isAlert) {
      // Google Alert (alert / alert1 / alert2): title มี <b> ครอบคำที่ match → เก็บเป็น marker
      title = markBold(title);
    }
    // ลิงก์ของ Google/Bing เป็นตัวเปลี่ยนทาง: ...?url=<ลิงก์จริง> — แกะออกให้ตรง
    //
    // ⚠️ ต้องทำกับคอลัมน์ข่าวด้วย ไม่ใช่เฉพาะ alert — Bing ใส่ `tid=` ที่เปลี่ยนทุกรอบ
    // ที่ดึง ข่าวใบเดียวจึงได้ลิงก์ใหม่ทุกชั่วโมง แล้วคลังข่าวที่ dedupe ด้วยลิงก์
    // มองเป็นข่าวคนละใบทุกครั้ง → ข่าวเดียวซ้ำนับสิบแถวในชีต (เกิดขึ้นจริง 27 แถว)
    link = unwrapRedirect(link);

    if (isGarbled(stripMarks(title))) continue; // ทิ้งข่าวที่หัวข้อพัง (mojibake)
    if (isGarbled(stripMarks(snippet))) snippet = ""; // หัวข้อดีแต่ snippet พัง → ตัด snippet ทิ้ง
    // สรุปที่จริงๆ เป็นรายการข่าวอื่น → ไม่เอาดีกว่าเอามาแสดงให้สับสน (ดู looksLikeListing)
    if (looksLikeListing(snippet)) snippet = "";

    items.push({
      id: hash(link || title),
      source,
      sourceLabel,
      title,
      link,
      publishedAt: toISO(date),
      snippet: snippet.slice(0, 240),
    });
  }
  return items;
}

// ฟีด Google Trends (มี ht:approx_traffic, ht:news_item)
export function parseTrends(xml, source = "trends") {
  const items = [];
  for (const b of blocks(xml, "item")) {
    const title = tagText(b, "title");
    if (!title) continue;
    const traffic = tagText(b, "ht:approx_traffic");
    const date = tagText(b, "pubDate");
    const newsUrl = tagText(b, "ht:news_item_url");
    const newsTitle = tagText(b, "ht:news_item_title");
    items.push({
      id: hash(title),
      source,
      sourceLabel: traffic ? `${traffic} การค้นหา` : "",
      title,
      link: newsUrl || "https://trends.google.com/trending?geo=TH",
      publishedAt: toISO(date),
      snippet: newsTitle || "",
    });
  }
  return items;
}
