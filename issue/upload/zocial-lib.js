/**
 * zocial-lib.js — แปลงไฟล์ export ของ Zocial Eye ให้เป็นข้อมูลที่บันทึกได้
 * =====================================================================
 * ⚠️ ไฟล์นี้เป็น "ฟังก์ชันล้วน" ไม่แตะ DOM · ไม่แตะ network · ไม่แตะ D1
 *    เพื่อให้ทั้ง 3 ที่ใช้ตัวเดียวกันได้ และเทสต์ด้วย node ได้ตรงๆ
 *      1. หน้า /issue/upload/ (เบราว์เซอร์)  2. Pages Function ตอนบันทึกลง D1  3. tests/zocial.mjs
 *
 * 🚫 ทำไมไม่ import ตัวกรองจาก functions/api/_lib/noise.js
 *    ไฟล์ในโฟลเดอร์ functions/ ไม่ถูกเสิร์ฟเป็นไฟล์ static เบราว์เซอร์จึงโหลดไม่ได้ (404)
 *    และตัวกรองในนั้นคือ "อะไรไม่ใช่ข่าว" ซึ่งเป็นคนละคำถามกับ "อะไรไม่ใช่โพสต์ที่คนพูดถึงเรา"
 *    ⚠️ ตอนทำฝั่งเซิร์ฟเวอร์ ถ้าจะกรอง row ที่ source = news ให้ import จาก noise.js ที่นั่น
 *       ห้ามก๊อปลิสต์ของ noise.js มาไว้ที่นี่เด็ดขาด (กฎถาวรใน CLAUDE.md)
 */

/* ── 1. หัวตาราง ─────────────────────────────────────────────────────────
   ⚠️ ยังไม่เคยเห็นไฟล์ export จริงของ Zocial Eye เลยสักไฟล์
   จึงไม่ฮาร์ดโค้ดชื่อคอลัมน์ตายตัว แต่รับได้หลายชื่อ + ให้ผู้ใช้แก้เองบนหน้า preview
   เจอชื่อคอลัมน์จริงเมื่อไหร่ ให้ "เติม" ลง aliases ห้ามลบของเดิมทิ้ง
   (ไฟล์เก่าที่เคย upload ได้ ต้อง upload ได้เหมือนเดิม)                        */

export const FIELDS = [
  { key: "postedAt", label: "เวลาโพสต์", required: true,
    aliases: ["post time", "posted time", "posted at", "date", "datetime", "created time", "created at", "time", "วันเวลา", "เวลาโพสต์", "วันที่"] },
  { key: "source", label: "ช่องทาง", required: true,
    aliases: ["source", "channel", "platform", "social network", "site", "ช่องทาง", "แหล่ง", "แพลตฟอร์ม"] },
  { key: "message", label: "ข้อความ", required: true,
    aliases: ["message", "text", "content", "post message", "post", "caption", "title", "ข้อความ", "เนื้อหา", "โพสต์"] },
  { key: "url", label: "ลิงก์", required: true,
    aliases: ["direct url", "url", "link", "permalink", "post url", "post link", "ลิงก์", "ลิ้งค์"] },
  { key: "account", label: "ชื่อบัญชี/เพจ", required: false,
    aliases: ["account name", "account", "author", "author name", "username", "user name", "page name", "channel name", "ชื่อบัญชี", "ผู้โพสต์", "เพจ"] },
  { key: "accountType", label: "ประเภทบัญชี", required: false,
    aliases: ["account label type", "account type", "author type", "type", "ประเภทบัญชี", "ประเภท"] },
  { key: "engagement", label: "Engagement", required: false,
    aliases: ["engagement", "engagements", "total engagement", "interaction", "interactions", "การมีส่วนร่วม"] },
  { key: "comments", label: "คอมเมนต์", required: false,
    aliases: ["comment count", "comments", "comment", "จำนวนคอมเมนต์", "คอมเมนต์"] },
  { key: "likes", label: "Likes", required: false,
    aliases: ["like count", "likes", "like", "reaction", "reactions", "ถูกใจ"] },
  { key: "shares", label: "Shares", required: false,
    aliases: ["share count", "shares", "share", "แชร์"] },
  { key: "sentimentRaw", label: "Sentiment (ค่าดิบจาก Zocial)", required: false,
    aliases: ["sentiment", "sentiment score", "polarity", "อารมณ์", "ความรู้สึก"] },
  { key: "category", label: "หมวด", required: false,
    aliases: ["category", "categories", "tag", "tags", "หมวด", "หมวดหมู่"] },
  { key: "campaign", label: "แคมเปญ", required: false,
    // 🚫 ห้ามใส่ "keyword" — ไฟล์จริงมีคอลัมน์ Main keyword / Sub keyword ซึ่งเป็น "คำที่ตรง"
    //    ไม่ใช่ชื่อแคมเปญ · ชื่อแคมเปญมาจากชื่อไฟล์/ที่ผู้ใช้พิมพ์เท่านั้น
    aliases: ["campaign", "campaign id", "campaign name", "แคมเปญ"] },

  // ── 3 ช่องนี้คือตัวบอกว่า "แถวนี้เป็นโพสต์ หรือคอมเมนต์ หรือคำตอบกลับ" ──
  // ⚠️ สำคัญมาก: ไฟล์ export ของจริงเอาทั้ง 3 อย่างมาปนกันในชีตเดียว
  //    (วัดจากไฟล์จริง 12,004 แถว = โพสต์ 3,548 · คอมเมนต์ 7,062 · ตอบกลับ 1,394)
  //    ถ้านับทุกแถวเป็น "โพสต์" ตัวเลขบนแดชบอร์ดจะเกินจริงเกือบ 3 เท่า
  { key: "postUrl", label: "ลิงก์โพสต์ต้นทาง", required: false,
    aliases: ["post url", "post link"] },
  { key: "commentUrl", label: "ลิงก์คอมเมนต์", required: false,
    aliases: ["comment url", "comment link"] },
  { key: "replyUrl", label: "ลิงก์คำตอบกลับ", required: false,
    aliases: ["reply comment url", "reply url"] },
  // id ของ Zocial เอง — ไฟล์จริงมีครบทุกแถวและไม่ซ้ำเลย (12,004/12,004)
  // 🔴 จำเป็นจริงๆ: ลิงก์อย่างเดียวใช้แทนไม่ได้ ไฟล์จริงมี Direct URL ซ้ำกันเหลือ 6,349 ค่า
  { key: "zid", label: "id ของ Zocial", required: false,
    aliases: ["_id", "message id", "post id"] },
];

/** ยุบชื่อหัวตารางให้เทียบกันได้ — ตัดวรรค เครื่องหมาย และตัวพิมพ์ */
export function normHeader(h) {
  return String(h ?? "").toLowerCase().replace(/[\s_\-./()[\]#:]+/g, "").trim();
}

/**
 * จับคู่หัวตารางในไฟล์กับ field ที่เรารู้จัก
 * → { map:{field:header|null}, missing:[field], unused:[header], guessed:[field] }
 * ⚠️ ไม่เดาแบบ "คำไหนคล้ายก็เอา" — ตรงเป๊ะก่อน แล้วค่อยลองแบบมีคำนั้นอยู่ข้างใน
 *    และ field ที่ได้จากการเดา ต้องบอกผู้ใช้ว่าเดามา (guessed)
 */
export function mapHeaders(headers) {
  const list = (headers || []).map((h) => String(h ?? "").trim()).filter(Boolean);
  const norm = list.map(normHeader);
  const map = {}, guessed = [], taken = new Set();

  for (const f of FIELDS) {
    let hit = -1;
    for (const a of f.aliases) {                       // รอบแรก: ตรงทั้งชื่อ
      const i = norm.indexOf(normHeader(a));
      if (i >= 0 && !taken.has(i)) { hit = i; break; }
    }
    if (hit < 0) {                                     // รอบสอง: ชื่อในไฟล์มีคำนั้นอยู่ข้างใน
      for (const a of f.aliases) {
        const na = normHeader(a);
        // 🚫 คำสั้นห้ามใช้แบบ "มีอยู่ข้างใน" — เจอจริง 2 เคส:
        //    "type" ไปคว้า "Content Type" · "comment" ไปคว้า "Comment URL" มาเป็นจำนวนคอมเมนต์
        //    คำสั้นจึงจับได้เฉพาะตอนชื่อตรงทั้งช่องเท่านั้น (เกณฑ์ 8 ตัวอักษรมาจากไฟล์ export จริง)
        if (na.length < 8) continue;
        const i = norm.findIndex((n, j) => !taken.has(j) && n.includes(na));
        if (i >= 0) { hit = i; guessed.push(f.key); break; }
      }
    }
    map[f.key] = hit >= 0 ? list[hit] : null;
    if (hit >= 0) taken.add(hit);
  }

  return {
    map,
    missing: FIELDS.filter((f) => f.required && !map[f.key]).map((f) => f.key),
    unused: list.filter((_, i) => !taken.has(i)),
    guessed,
  };
}

/* ── 2. เวลา ────────────────────────────────────────────────────────────
   ✅ §7.3 ของ ZOCIAL-HANDOFF.md ตอบแล้ว (3 ก.ย. 2026) — ไฟล์ส่งมาเป็น **เวลาไทย**
   เขียนเป็นข้อความตรงๆ "2026-06-15 00:00:00" ไม่ใช่ตัวเลข serial และไม่มี offset ติดมา
   ⚠️ ยังไม่ปักตายโดยตั้งใจ — ผู้ใช้เลือกได้บนหน้า preview แล้วเห็นผลทันทีว่าจะบันทึกเป็นวันไหน
      (Zocial เปลี่ยนรูปแบบวันหลัง จะได้สลับได้เองโดยไม่ต้องแก้โค้ด)                       */

export const TZ_MODES = {
  th:  { key: "th",  label: "เวลาไทย (UTC+7)", offsetMin: 420 },
  utc: { key: "utc", label: "UTC (+0)",        offsetMin: 0 },
};
export const TH_OFFSET_MIN = 420;

const pad = (n) => String(n).padStart(2, "0");

/** ตัวเลขวันที่ของ Excel (serial) → เวลา wall-clock เป็น ms · ไม่ใช่ serial คืน null */
export function excelSerialToWallMs(v) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  // 20000 ≈ ปี 1954 · 80000 ≈ ปี 2119 — นอกช่วงนี้ไม่ใช่วันที่แน่ๆ (กันเลข engagement หลุดมา)
  if (n < 20000 || n > 80000) return null;
  return Math.round((n - 25569) * 86400000);           // 25569 = จำนวนวันจาก 1899-12-30 ถึง 1970-01-01
}

/**
 * อ่านเวลาจากช่องในไฟล์ → wall-clock เป็น ms (ยังไม่รู้ว่า timezone อะไร)
 * 🚫 อ่านไม่ออกคืน null ห้ามเดาเป็นวันนี้ — "ไม่รู้" ห้ามกลืนให้กลายเป็นค่าใดค่าหนึ่ง
 *    (บทเรียนแพงที่สุดของโปรเจกต์ — ดู CLAUDE.md หัวข้อ 🔢)
 */
export function parseWallMs(raw) {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return Number.isNaN(+raw) ? null : +raw;

  const s = String(raw).trim();
  if (!s) return null;

  // ตัวเลขล้วน = serial ของ Excel
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToWallMs(s);

  // ปี-เดือน-วัน (ISO และแบบมีช่องว่างคั่น) · รับ offset ที่ติดมากับข้อความด้วย
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (m) {
    const wall = ymdhmsToMs(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0));
    if (wall === null) return null;
    const off = tzOffsetOf(m[7]);
    // มี offset ติดมา = ไฟล์บอกเองแล้วว่าเวลาอะไร → แปลงกลับเป็น wall ของ "ไทย" ให้เลย
    return off === null ? wall : wall - off * 60000 + TH_OFFSET_MIN * 60000;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return ymdhmsToMs(+m[1], +m[2], +m[3], 0, 0, 0);

  // วัน/เดือน/ปี — รูปแบบที่ Excel ไทยชอบพ่นออกมา
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/);
  if (m) {
    let h = +(m[4] || 0);
    const ap = (m[7] || "").toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return ymdhmsToMs(+m[3], +m[2], +m[1], h, +(m[5] || 0), +(m[6] || 0));
  }
  return null;
}

function tzOffsetOf(tag) {
  if (!tag) return null;
  if (tag === "Z") return 0;
  const m = tag.match(/^([+-])(\d{2}):?(\d{2})$/);
  return m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]) : null;
}

function ymdhmsToMs(y, mo, d, h, mi, se) {
  if (y > 2400) y -= 543;                              // ปี พ.ศ. (Excel ไทยพ่นออกมาแบบนี้ได้)
  if (y < 1990 || y > 2100) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, se);
  const back = new Date(ms);
  // กันวันที่ไม่มีอยู่จริง (31 ก.พ.) ที่ Date.UTC เลื่อนให้เงียบๆ
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return ms;
}

/** wall-clock ms + timezone ของไฟล์ → เวลาจริง (instant) เป็น ms */
export function wallToInstant(wallMs, tzKey) {
  const tz = TZ_MODES[tzKey] || TZ_MODES.th;
  return wallMs - tz.offsetMin * 60000;
}

/** instant ms → "YYYY-MM-DD" ตามปฏิทินไทย = วันที่ที่จะเอาไปเก็บ/แสดงบนแดชบอร์ด */
export function thaiDateKey(instantMs) {
  const d = new Date(instantMs + TH_OFFSET_MIN * 60000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** instant ms → ISO 8601 พร้อม offset ไทย (ห้ามคืนเป็นข้อความไทย — กติกา API contract) */
export function thaiIso(instantMs) {
  const d = new Date(instantMs + TH_OFFSET_MIN * 60000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+07:00`;
}

/** โชว์ wall-clock ตรงๆ อย่างที่เขียนอยู่ในไฟล์ (ไว้ให้ผู้ใช้เทียบกับเว็บจริง) */
export function wallText(wallMs) {
  const d = new Date(wallMs);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/* ── 3. ช่องทาง ─────────────────────────────────────────────────────────── */

// ⚠️ "other" มีจริงในไฟล์ export (ชีตชื่อ other) — ไม่ใช่ค่าที่เราคิดเอง
export const SOURCES = ["facebook", "x", "instagram", "tiktok", "youtube", "forum", "news", "other"];

const SOURCE_ALIAS = [
  [/facebook|\bfb\b|เฟส|เฟซ/i,                    "facebook"],
  [/twitter|\bx\b|ทวิต|ทวิ?ตเตอร์/i,               "x"],
  [/instagram|\big\b|อินสตา/i,                     "instagram"],
  [/tiktok|ติ๊?กต็?อก/i,                            "tiktok"],
  [/youtube|\byt\b|ยูทู?บ/i,                        "youtube"],
  [/pantip|forum|webboard|blog|reddit|กระทู้|เว็บบอร์ด|บล็อก/i, "forum"],
  [/news|website|online|ข่าว|เว็บไซต์|สื่อ/i,       "news"],
  [/^other$|^อื่น/i,                                "other"],
];

const HOST_SOURCE = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.(com|watch)$/, "facebook"],
  [/(^|\.)(twitter|x)\.com$/,                     "x"],
  [/(^|\.)instagram\.com$/,                       "instagram"],
  [/(^|\.)tiktok\.com$/,                          "tiktok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/,             "youtube"],
  [/(^|\.)pantip\.com$|(^|\.)reddit\.com$/,       "forum"],
];

/** ค่าในช่อง "ช่องทาง" + ลิงก์ → ชื่อช่องมาตรฐาน · แยกไม่ออกคืน "" (ห้ามเดาเป็น news) */
export function normSource(raw, url) {
  const s = String(raw ?? "").trim();
  for (const [re, out] of SOURCE_ALIAS) if (re.test(s)) return out;
  const h = hostOfUrl(url);
  if (h) for (const [re, out] of HOST_SOURCE) if (re.test(h)) return out;
  return "";
}

export function hostOfUrl(u) {
  const m = String(u ?? "").trim().match(/^https?:\/\/([^/?#]+)/i);
  return m ? m[1].toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "") : "";
}

/**
 * ตัดพารามิเตอร์ติดตามออกจากลิงก์ ให้ลิงก์เดียวกันหน้าตาเหมือนกัน (ใช้กันข้อมูลซ้ำ)
 * ⚠️ เล็กและจำกัดขอบเขตโดยตั้งใจ — ไม่ใช่ normLink() ของ noise.js ที่ทำเรื่องข่าว
 */
export function cleanUrl(u) {
  const s = String(u ?? "").trim();
  if (!/^https?:\/\//i.test(s)) return "";
  try {
    const url = new URL(s);
    for (const k of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|igshid|mc_|ref_?src|si$|share_)/i.test(k)) url.searchParams.delete(k);
    }
    url.hash = "";
    let out = url.toString();
    if (url.search === "") out = out.replace(/\?$/, "");
    return out.replace(/\/$/, "");
  } catch { return s.replace(/[?#].*$/, "").replace(/\/$/, ""); }
}

/* ── 4. เพจ หรือ บุคคล — ตัวนี้ตัดสินว่าข้อมูลจะถูกลบเมื่อไหร่ (§5 ของ handoff) ── */

// ⚠️ ค่าที่พบจริงในไฟล์ export คือ "Brand" · "Public Figure" · ว่าง — ไม่มีคำว่า page/person เลย
const TYPE_PAGE   = /^(page|brand|official|media|news|publisher|organization|organisation|company|business|channel|เพจ|สื่อ|องค์กร|บริษัท|ทางการ)$/i;
const TYPE_PERSON = /^(person|people|user|profile|individual|บุคคล|ผู้ใช้|ส่วนตัว)$/i;
// 🔴 "Public Figure" ตัดสินไม่ได้ และห้ามเดา — เป็นคนจริง (= ข้อมูลส่วนบุคคล) แต่บนเฟซบุ๊ก
//    มักเป็น "เพจ" · จึงคืน unknown ซึ่งแปลว่า "ลบตามกำหนด" ไว้ก่อน แล้วรอเจ้าของเคาะ
//    (ไฟล์จริงมี 8,308 แถวเป็นค่านี้ — ไม่ใช่จำนวนที่มองข้ามได้)
const TYPE_UNSURE = /^(public figure|celebrity|influencer|kol)$/i;

/**
 * → "page" | "person" | "unknown"
 * 🔴 unknown ไม่ได้แปลว่า "เก็บถาวรไว้ก่อน" — ตัวลบต้องถือว่า unknown = person
 *    (ดู shouldExpire) ลบเกินยังกู้จากไฟล์ต้นทางได้ แต่เก็บข้อมูลบุคคลเกินกำหนดคือความเสี่ยงทางกฎหมาย
 */
export function accountTypeOf({ accountType, source, url } = {}) {
  const t = String(accountType ?? "").trim();
  if (TYPE_UNSURE.test(t)) return "unknown";           // ต้องอยู่ก่อน 2 บรรทัดล่าง ห้ามสลับ
  if (TYPE_PAGE.test(t)) return "page";
  if (TYPE_PERSON.test(t)) return "person";

  const src = source || "";
  if (src === "news") return "page";                   // สำนักข่าว = นิติบุคคล
  if (src === "forum") return "person";                // กระทู้/บล็อก = คนทั่วไป

  const h = hostOfUrl(url);
  if (/(^|\.)facebook\.com$/.test(h) && /\/(profile\.php|people)\//i.test(String(url))) return "person";
  return "unknown";
}

/** ข้อมูลแถวนี้ต้องถูกลบตาม retention ไหม — เพจเก็บถาวร นอกนั้นลบหมด */
export function shouldExpire(accountTypeValue) {
  return accountTypeValue !== "page";
}

/* ── 4b. แถวนี้เป็นโพสต์ หรือคอมเมนต์ ────────────────────────────────────
   วัดจากไฟล์จริงแล้วแม่น 100%: แถวคอมเมนต์มี Direct URL ตรงกับ Comment URL ทุกใบ
   และแถวโพสต์มี Direct URL ตรงกับ Post URL ทุกใบ                                */

/** → "post" | "comment" | "reply" · ไม่มี 3 คอลัมน์นั้นเลยก็ถือว่าเป็นโพสต์ */
export function rowKind({ postUrl, commentUrl, replyUrl } = {}) {
  if (String(replyUrl ?? "").trim()) return "reply";
  if (String(commentUrl ?? "").trim()) return "comment";
  return "post";
}

/* ── 5. แถวที่ไม่เอา ───────────────────────────────────────────────────── */

export const DROP_WHY_TH = {
  "no-time":    "อ่านเวลาโพสต์ไม่ได้",
  "no-url":     "ไม่มีลิงก์ หรือลิงก์ไม่ใช่ http/https",
  "no-text":    "ไม่มีข้อความเลย",
  "no-source":  "บอกไม่ได้ว่ามาจากช่องไหน",
  "dup":        "ซ้ำกับแถวก่อนหน้าในไฟล์เดียวกัน",
};

/** ตัดข้อความยาวๆ ให้เหลือเท่าที่เก็บจริง (API contract: ≤200 ตัวอักษร) */
export function snippetOf(text, max = 200) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

/** เลขจากช่องที่อาจมีจุลภาค/ช่องว่างปน · ว่างหรืออ่านไม่ออกคืน null (ไม่ใช่ 0) */
export function numOf(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** id คงที่ต่อโพสต์ 1 ใบ — ลิงก์ + เวลา · ใช้กันแถวซ้ำตอน upload ไฟล์เดิมซ้ำ */
export function rowId(cleanedUrl, instantMs) {
  let h = 0x811c9dc5;
  for (const ch of `${cleanedUrl}|${instantMs}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, "0")}${String(cleanedUrl.length).padStart(4, "0")}`;
}

/* ── 6. แปลงทั้งไฟล์ ───────────────────────────────────────────────────── */

/**
 * rows (object ต่อแถว จาก XlsxRead) → { records, dropped, counts }
 * opts: { headerMap, tz:"th"|"utc", campaign }
 * 🚫 ไม่เขียนอะไรลงที่ไหนทั้งนั้น — ตัดสินใจบันทึกเป็นหน้าที่ของคนเรียก
 */
export function normalizeRows(rows, opts = {}) {
  const map = opts.headerMap || mapHeaders(Object.keys(rows[0] || {})).map;
  const tz = TZ_MODES[opts.tz] ? opts.tz : "th";
  const get = (r, f) => (map[f] ? r[map[f]] : undefined);

  const records = [], dropped = [], seen = new Set();

  rows.forEach((r, i) => {
    const rowNo = i + 2;                               // +2 = แถวแรกเป็นหัวตาราง และคนนับจาก 1
    const drop = (why, note) => dropped.push({ rowNo, why, note: note || "", sample: snippetOf(get(r, "message"), 60) });

    const wall = parseWallMs(get(r, "postedAt"));
    if (wall === null) return drop("no-time", String(get(r, "postedAt") ?? "").slice(0, 40));

    const url = cleanUrl(get(r, "url"));
    if (!url) return drop("no-url", String(get(r, "url") ?? "").slice(0, 60));

    const text = String(get(r, "message") ?? "").trim();
    if (!text) return drop("no-text");

    const source = normSource(get(r, "source"), url);
    if (!source) return drop("no-source", String(get(r, "source") ?? "").slice(0, 40));

    const instant = wallToInstant(wall, tz);
    // 🔴 ใช้ id ของ Zocial ก่อนเสมอถ้ามี — ไฟล์จริงมี Direct URL ซ้ำกันเยอะมาก
    //    (12,004 แถว เหลือลิงก์ไม่ซ้ำแค่ 6,349) ถ้าใช้ลิงก์เป็นตัวกันซ้ำ คอมเมนต์จะหายเป็นพัน
    const zid = String(get(r, "zid") ?? "").trim();
    const id = zid || rowId(url, instant);
    if (seen.has(id)) return drop("dup", zid || url.slice(0, 60));
    seen.add(id);

    const postUrl = cleanUrl(get(r, "postUrl"));
    const kind = rowKind({ postUrl: get(r, "postUrl"), commentUrl: get(r, "commentUrl"), replyUrl: get(r, "replyUrl") });

    const account = String(get(r, "account") ?? "").trim();
    const type = accountTypeOf({ accountType: get(r, "accountType"), source, url });

    records.push({
      id, source, url, kind,
      // ลิงก์โพสต์ต้นทาง = ตัวจับกลุ่มว่าคอมเมนต์ใบนี้อยู่ใต้โพสต์ไหน (ใช้ตอนทำการ์ดในเฟสถัดไป)
      postUrl: postUrl || (kind === "post" ? url : null),
      account: account || null,
      accountType: type,
      expires: shouldExpire(type),
      snippet: snippetOf(text),
      postedAt: thaiIso(instant),
      date: thaiDateKey(instant),
      wallText: wallText(wall),
      engagement: numOf(get(r, "engagement")),
      comments: numOf(get(r, "comments")),
      likes: numOf(get(r, "likes")),
      shares: numOf(get(r, "shares")),
      // ⚠️ ค่าดิบจาก Zocial เท่านั้น · ห้ามเอาขึ้นการ์ดโดยไม่บอกว่าเป็นค่าดิบ (§8 ของ handoff)
      sentimentRaw: String(get(r, "sentimentRaw") ?? "").trim() || null,
      // 🔴 ยังไม่มีตัวตัดสินของเรา — ต้องเป็น null ห้ามเติม "neu" ให้เงียบๆ
      sentimentFinal: null,
      campaign: opts.campaign || String(get(r, "campaign") ?? "").trim() || null,
    });
  });

  const counts = { total: rows.length, kept: records.length, dropped: dropped.length };
  return { records, dropped, counts };
}

/** สรุปทุกอย่างที่ต้องโชว์บนหน้า preview ก่อนกดบันทึก */
export function buildPreview(rows, headers, opts = {}) {
  const hm = opts.headerMap ? { map: opts.headerMap, missing: [], unused: [], guessed: [] } : mapHeaders(headers);
  if (hm.missing.length) {
    return { ok: false, header: hm, counts: { total: rows.length, kept: 0, dropped: 0 }, records: [], dropped: [], days: [], accounts: {}, first: null };
  }

  const { records, dropped, counts } = normalizeRows(rows, { ...opts, headerMap: hm.map });

  const byDay = new Map();
  for (const r of records) byDay.set(r.date, (byDay.get(r.date) || 0) + 1);

  const accounts = { page: 0, person: 0, unknown: 0 };
  for (const r of records) accounts[r.accountType]++;

  // ⚠️ 2 ตัวนี้มีไว้ให้ "มองเห็นทันทีว่าอ่านชีตผิด" — ไฟล์ export มี 9 ชีต
  //    ชีตแรกชื่อ all (ของครบ) ที่เหลือเป็นชีตแยกรายช่อง ถ้าเผลออ่านชีต facebook
  //    จะเห็นช่องเดียวโด่ขึ้นมาทันที แทนที่จะเงียบแล้วได้ข้อมูลไม่ครบ
  const kinds = { post: 0, comment: 0, reply: 0 };
  for (const r of records) kinds[r.kind]++;
  const sources = {};
  for (const r of records) sources[r.source] = (sources[r.source] || 0) + 1;

  const byWhy = new Map();
  for (const d of dropped) {
    if (!byWhy.has(d.why)) byWhy.set(d.why, { why: d.why, label: DROP_WHY_TH[d.why] || d.why, count: 0, samples: [] });
    const g = byWhy.get(d.why);
    g.count++;
    if (g.samples.length < 3) g.samples.push(d);
  }

  return {
    ok: true,
    header: hm,
    counts,
    records,
    dropped: [...byWhy.values()].sort((a, b) => b.count - a.count),
    kinds, sources,
    days: [...byDay.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date < b.date ? -1 : 1),
    accounts,
    // แถวแรกที่อ่านเวลาได้ — ไว้ให้เจ้าของเทียบกับเว็บจริงว่าตีความ timezone ถูกไหม
    first: records[0] ? { wall: records[0].wallText, date: records[0].date, iso: records[0].postedAt, url: records[0].url } : null,
  };
}

/**
 * เดาชื่อแคมเปญจากชื่อไฟล์ — เป็นแค่ค่าตั้งต้น ผู้ใช้แก้ได้บนหน้า preview
 * 🚫 campaign id ห้าม commit ลง repo (repo เป็น public) — ฟังก์ชันนี้แค่ "อ่าน" ชื่อไฟล์
 */
export function campaignFromFilename(name) {
  let s = String(name ?? "").replace(/\.(xlsx|xlsm|csv)$/i, "");
  // ชื่อไฟล์จริงที่ Zocial Eye ตั้งให้: ZE_all_message_on_<campaign><ช่วงวันที่>_<เลขรัน>
  // 🚫 ห้ามเขียน campaign id ตัวจริงไว้ในโค้ดหรือในเทสต์ — repo เป็น public
  const ze = s.match(/^ZE_.*?_on_(\d+?)(\d{8}T\d{2}_\d{2}_\d{2})_to_/i);
  if (ze) return ze[1];
  s = s.replace(/[_\s]*\d{4}[-_]?\d{2}[-_]?\d{2}([-_ ]+(to|ถึง)?[-_ ]*\d{4}[-_]?\d{2}[-_]?\d{2})?[_\s]*$/i, "");
  s = s.replace(/[_\s]*\(?\d+\)?$/,"").replace(/[_\-\s]+$/,"").trim();
  return s || "";
}
