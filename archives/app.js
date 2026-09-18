/* คลังข่าว — ค้นข่าว PR ย้อนหลัง
 *
 * ข้อมูลมาจากไฟล์นิ่ง `data/<ปี>.json` ที่สร้างไว้ล่วงหน้าด้วย tools/build-archives.mjs
 * **ไม่มีการเรียก Google Sheets API ตอนผู้ใช้เปิดหน้า** และไม่มี Pages Function ของตัวเอง
 *
 * 🔍 **การค้นหา — จุดที่พลาดง่ายที่สุดของหน้านี้**
 * ใช้ String.includes() ตรงๆ บนสตริงที่ normalize แล้ว **ห้ามใช้ search library**
 * (Lunr / Fuse / MiniSearch / FlexSearch) เพราะพวกนั้นตัดคำด้วยช่องว่าง
 * ภาษาไทยไม่มีช่องว่างระหว่างคำ → ค้น "กุ้ง" จะไม่เจอ "โรคกุ้ง" หรือ "ผลผลิตกุ้งทะเล"
 * ที่ 20,000 แถว การไล่ทีละแถวเร็วพอโดยไม่ต้องทำ index (วัดแล้ว ~2 มิลลิวินาที)
 */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const PAGE = 50;        // โหลดผลลัพธ์ทีละ 50

/* 🗄️ **คลังของหน้านี้อยู่โฟลเดอร์ไหน** — อ่านจาก `<meta name="data-dir">` · ไม่ใส่ = `data`
 *
 * เจ้าของสั่ง 16 ก.ย. 2026: "ทำแยกหน้า เป็นอีก tab นึงชื่อ ปลาหมอคางดำ และ lock ไว้ด้วย"
 * แล้วสั่งต่อว่า **"ใช้ database เป็นอันนี้แทน"** พร้อมลิงก์ชีตใหม่
 * → `blackchin.html` จึงเป็น **คลังคนละก้อน** ไม่ใช่การกรองหมวดจากคลังเดิม
 *   ใช้ `app.js` / `styles.css` ตัวเดียวกันทั้งหมด ต่างกันแค่ meta บรรทัดเดียว
 *
 * ✅ **ข้อดีของการแยกไฟล์ คือทำให้ "ล็อก" เป็นของจริง** — ถ้าเอาแต่ซ่อนในหน้าเว็บ
 *    ไฟล์ `data/<ปี>.json` เปิดสาธารณะอยู่ ใครเดาที่อยู่ถูกก็โหลดไปทั้งก้อน
 *    พอเป็นคนละโฟลเดอร์ เจ้าของเอา `archives/data-blackchin/*` เข้า Access ได้ด้วย
 *    (คนละเรื่องกับ `/api/*` ที่ห้ามเอาเข้า Access เด็ดขาด — อันนี้เป็นไฟล์นิ่งของหน้านี้หน้าเดียว)
 *
 * ⚠️ **ห้าม commit sheet id ลง repo** (repo เป็น public) — ตัวสร้างไฟล์รับ id ทาง argument
 *    และไฟล์ผลลัพธ์ที่ commit ไม่มี id อยู่ในนั้น
 */
const DATA_DIR = (document.querySelector('meta[name="data-dir"]')?.content || "data").trim().replace(/\/+$/, "");

const state = {
  q: "", from: "", to: "",
  cats: new Set(), srcs: new Set(),
  shown: PAGE,
  srcq: "",             // คำค้นในรายชื่อสำนักข่าว (ไม่เข้า URL — เป็นแค่ตัวช่วยหา)
  // 🤖 ถามเป็นประโยค — เงื่อนไขที่ "ต้องอ่านพาดหัวแล้วตีความ" (เช่น "เป็นข่าวเชิงบวก")
  //    ว่างเปล่า = หน้านี้ทำงานเหมือนเดิมทุกอย่าง
  judge: "",
  ask: "",              // คำถามต้นฉบับ ไว้แสดงให้ผู้ใช้เห็นว่าเขาถามอะไรไป
  // 🔀 โหมดค้นหา (เจ้าของสั่ง 27 ส.ค. 2026: "สลับเป็นหมวด ค้นด้วยคำ ได้ด้วย")
  //   "ai" = ถามเป็นประโยค ให้ AI ตีความก่อน (ค่าตั้งต้น)
  //   "kw" = ค้นด้วยคำตรงๆ **ไม่ยิง AI เลย** — เร็ว ฟรี ตรวจสอบได้ ตรงกับที่พิมพ์เป๊ะ
  // ⚠️ 2 โหมดนี้ต่างกันที่ "ตีความคำที่พิมพ์ยังไง" ไม่ใช่ "กดอะไรถึงจะได้ผล"
  //    ทั้งคู่ต้องกด Enter/ปุ่มเหมือนกัน — **ห้ามให้โหมดคำค้นสดระหว่างพิมพ์**
  //    ไม่งั้นจะกลับไปเป็นปัญหาเดิมที่เจ้าของสั่งให้เลิก (แยกไม่ออกว่าตอนไหนได้อะไร)
  mode: "ai",
  // 🗂 หมวดที่กำลังเปิดอยู่ (เฉพาะหน้าที่โหลดไฟล์หมวดมา) — `""` = ทุกหมวด
  //    เก็บเป็น **id ของหมวด** ไม่ใช่ลำดับ — เจ้าของสลับลำดับใน config เมื่อไหร่
  //    ลิงก์เก่าที่ส่งต่อกันไว้จะได้ไม่ชี้ผิดหมวด
  g: "",
};

const MODE_KEY = "archivesMode";
const MODES = {
  ai: { ph: "ถามเป็นประโยค เช่น หาข่าวด้านดีของปลาหมอคางดำทั้งหมด",
        hint: '<b>🤖 ถาม AI</b> — พิมพ์เป็นประโยคแล้วกด <b>Enter</b> ถามแบบที่คุยกับคนได้เลย<span class="qex"> เช่น <i>ข่าว PM 2.5 เชียงใหม่เดือนที่แล้ว</i> · อยากค้นด้วยคำตรงๆ กดปุ่ม <b>🔤 ค้นคำ</b> ในช่องค้นหา</span>',
        btn: "ถาม", tip: "ถาม (หรือกด Enter)" },
  kw: { ph: "พิมพ์คำค้น เช่น ปลาหมอคางดำ ฝุ่น",
        hint: '<b>🔤 ค้นคำ</b> — พิมพ์คำแล้วกด <b>Enter</b> เว้นวรรค = ต้องมีครบทุกคำ<span class="qex"> · ค้นเจอกลางคำไทยด้วย · ใส่ <code>"…"</code> ถ้าอยากได้วลีติดกัน · อยากถามเป็นประโยค กดปุ่ม <b>🤖 ถาม AI</b></span>',
        btn: "ค้น", tip: "ค้น (หรือกด Enter)" },
};
const isAI = () => state.mode !== "kw";

// ลิงก์ของข่าวที่ผ่านเงื่อนไข judge แล้ว — เก็บเป็น "ลิงก์" ไม่ใช่ลำดับแถว
// ⚠️ ลำดับแถวเปลี่ยนได้ทุกครั้งที่โหลดปีเพิ่ม/เปลี่ยนตัวกรอง เก็บลำดับไว้แล้วจะชี้ผิดใบ
let judgeKeep = null;   // null = ยังไม่ได้คัด · Set = คัดแล้ว
let judgeBusy = false;
let judgeNote = "";     // ข้อความบอกผู้ใช้ว่าเกิดอะไรขึ้น (คัดไม่ได้ / คัดไม่ครบ)
let relaxNote = "";     // บอกว่า "ไม่เจอเลย เลยผ่อนเงื่อนไขให้แล้ว" — ต้องบอกเสมอ ห้ามผ่อนเงียบๆ

let INDEX = null;         // data/index.json
const loaded = new Set(); // ปีที่โหลดแล้ว
let rows = [];            // ทุกแถวที่โหลดมา
let filtered = [];
let busy = false;

// ---------- normalize ----------
// ยุบช่องว่างซ้ำ + ตัดหัวท้าย + lowercase (มีผลกับอังกฤษเท่านั้น ไทยไม่มีตัวพิมพ์)
// ⚠️ ห้ามตัดอักขระไทยหรือวรรณยุกต์ทิ้ง — "กุ้ง" กับ "กุง" คนละคำ
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

/* ✍️ **ผ่อนการสะกด — ใช้เป็น "ทางสำรอง" เท่านั้น ห้ามเอามาเป็นตัวค้นหลัก**
 *
 * เจ้าของแจ้ง 26 ส.ค. 2026: พิมพ์ "เอเลี่ยนสปีชี่" แล้วไม่เจอ ทั้งที่คลังมี "เอเลี่ยนสปีชีส์"
 * ต่างกันแค่วรรณยุกต์กับตัวการันต์ แต่การค้นแบบตัวอักษรตรงเป๊ะมองว่าคนละคำสนิท
 *
 * ตัดวรรณยุกต์ (่ ้ ๊ ๋) กับตัวการันต์ (์) ออกแล้วค่อยเทียบ
 *   "เอเลี่ยนสปีชี่"  → "เอเลียนสปีชี"
 *   "เอเลี่ยนสปีชีส์" → "เอเลียนสปีชีส"   ← อันแรกเป็นส่วนหนึ่งของอันนี้ จึงเจอ
 *
 * 🚫 **ห้ามใช้เป็นตัวค้นหลักเด็ดขาด** — วิธีนี้ทำให้ "กุ้ง" กับ "กุง" กลายเป็นคำเดียวกัน
 *    ซึ่งเป็นข้อห้ามที่เขียนไว้บนสุดของไฟล์นี้ · ใช้ได้เฉพาะตอนค้นแบบเป๊ะแล้วไม่เจอเลย
 *    และต้องบอกผู้ใช้ทุกครั้งว่ากำลังผ่อนการสะกดให้อยู่
 */
const TONE_RE = /[\u0E48-\u0E4C]/g;   // ่ ้ ๊ ๋ ์
const looseNorm = (s) => norm(s).replace(TONE_RE, "");
let looseMode = false;                 // ธงระดับโมดูล — ต้องอยู่ข้ามการ render

// ---------- แยกคำค้น ----------
// **เว้นวรรค = "ต้องมีครบทุกคำ" (AND) แต่ไม่ต้องอยู่ติดกัน** (เจ้าของสั่ง 20 ส.ค. 2026)
//   พิมพ์ "ปลาหมอ ปลากระป๋อง" = เอาข่าวที่มี **ทั้งสองคำ** อยู่ในพาดหัว
//   จะอยู่ห่างกันแค่ไหน หรือสลับลำดับกัน ก็นับ
//
// ⚠️ **ไม่ใช่ "หรือ"** — เอาคำใดคำหนึ่งก็ได้ จะได้ผลกว้างจนไม่ต่างกับไม่ได้กรอง
// ⚠️ **และไม่ใช่การหาสตริงที่มีช่องว่างอยู่ตรงกลาง** — แบบนั้นคำต้องเรียงติดกันเป๊ะ
//    ซึ่งพาดหัวจริงแทบไม่มีทางตรง
//
// อยากได้ **ทั้งวลีติดกันจริงๆ** ให้ใส่เครื่องหมายคำพูด: `"PM 2.5"`
// (จำเป็น เพราะพาดหัวมีช่องว่างอยู่ข้างในด้วย ถ้าไม่มีวิธีบอก คนพิมพ์ `PM 2.5`
//  จะได้ข่าวที่มีคำว่า "pm" กับ "2.5" อยู่คนละที่ในพาดหัวปนมาด้วย)
function parseTerms(q) {
  const s = String(q || "");
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;   // ในเครื่องหมายคำพูด = วลีเดียว · นอกนั้นแยกตามช่องว่าง
  let m;
  while ((m = re.exec(s))) {
    const t = norm(m[1] !== undefined ? m[1] : m[2]);
    if (t) out.push(t);
  }
  return [...new Set(out)];
}

// ---------- ตัดหางพาดหัว ----------
// ฟีดหลายเจ้าต่อท้ายชื่อคอลัมน์/สำนักไว้ท้ายพาดหัว
//   "… - เทคโนโลยีชาวบ้าน - ข่าวสด"  ·  "… | RYT9"
// ⚠️ ตัดเฉพาะ "ตอนแสดงผล" — ตัวที่ใช้ค้นหายังเป็นพาดหัวต้นฉบับ
//    ไม่งั้นค้นคำที่อยู่ในหางแล้วจะไม่เจอ ทั้งที่ในชีตมีอยู่จริง
const TAIL_SEP = /\s+[-|–—·]\s+/;

// ⚠️ ท่อนที่โผล่เป็นหางของข่าว "ตั้งแต่ 2 ใบขึ้นไป" = ชื่อคอลัมน์/ชื่อเว็บ ไม่ใช่เนื้อพาดหัว
//    นับจากข้อมูลจริงที่โหลดมา จึงตามข้อมูลใหม่ได้เองโดยไม่ต้องไปเติมในไฟล์ config
//    (ที่ยังต้องมี ARCHIVE_TAILS เพราะท่อนที่โผล่ครั้งเดียวกฎนี้จับไม่ได้)
const TAIL_SEEN = new Map();
const EXTRA_TAILS = new Set((window.ARCHIVE_TAILS || []).map((s) => norm(s)));
function countTails(title) {
  const parts = String(title || "").split(TAIL_SEP);
  for (let k = 1; k < parts.length; k++) {
    const s = norm(parts[k]);
    if (s && s.length <= 28) TAIL_SEEN.set(s, (TAIL_SEEN.get(s) || 0) + 1);
  }
}
// ⚠️ ท่อนท้ายที่เป็น "ชื่อเว็บของข่าวใบนั้นเอง" — เทียบกับสำนักข่าวของแถวนั้นตรงๆ
//    เว็บเขียนชื่อตัวเองไม่เหมือนกับที่อยู่ในคอลัมน์สำนักข่าว ("Pantip" vs "pantip.com")
//    จึงตัดอักขระที่ไม่ใช่ตัวอักษรออกให้หมดแล้วดูว่าอันหนึ่งเป็นต้นของอีกอันไหม
//    ปลอดภัยเพราะจะตัดได้ก็ต่อเมื่อ **พาดหัวลงท้ายด้วยชื่อเว็บของตัวเอง** เท่านั้น
const slug = (s) => norm(s).replace(/[^a-z0-9฀-๿]+/g, "");
function isOwnSite(s, ownSlug) {
  const a = slug(s);
  if (a.length < 4 || !ownSlug || ownSlug.length < 4) return false;
  return a.startsWith(ownSlug) || ownSlug.startsWith(a);
}

const isTail = (s, outletNames, ownSlug) =>
  outletNames.has(s) || EXTRA_TAILS.has(s) || (TAIL_SEEN.get(s) || 0) >= 2 || isOwnSite(s, ownSlug);

// ⚠️ **ตัดด้วยการ "เฉือนท้าย" ไม่ใช่ split แล้ว join กลับ**
//    split/join จะเขียนตัวคั่นในส่วนที่เก็บไว้ใหม่หมด — "A | B - ข่าวสด" จะกลายเป็น "A - B"
//    พาดหัวที่แสดงเลยไม่ตรงกับของจริงทั้งที่ไม่ได้ตั้งใจแก้ (เจอตอนวัดกับข้อมูลจริง 1 ใบ)
const TAIL_SEP_G = new RegExp(TAIL_SEP.source, "g");
function stripTail(title, outletNames, ownSlug) {
  let t = String(title || "").trim();
  for (let i = 0; i < 3; i++) {           // ตัดได้ไม่เกิน 3 ท่อน กันตัดจนพาดหัวหาย
    TAIL_SEP_G.lastIndex = 0;
    const hits = [...t.matchAll(TAIL_SEP_G)];
    if (!hits.length) break;
    const at = hits[hits.length - 1];
    const seg = t.slice(at.index + at[0].length).trim();
    if (!seg || seg.length > 28) break;    // ท่อนยาว = น่าจะเป็นเนื้อพาดหัวจริง ไม่ใช่ชื่อสำนัก
    if (!isTail(norm(seg), outletNames, ownSlug)) break;
    const rest = t.slice(0, at.index).trim();
    if (rest.length < 10) break;           // เหลือสั้นเกินไป = ตัดผิดแน่ๆ
    t = rest;
  }
  return t;
}

// ---------- ยุบชื่อสำนักข่าว ----------
// mapping อยู่ใน outlets.config.js (แก้ได้โดยไม่ต้องแตะโค้ดและไม่ต้องสร้างข้อมูลใหม่)
const OUTLET_MAP = window.ARCHIVE_OUTLETS || {};
const mapOutlet = (raw) => OUTLET_MAP[String(raw || "").trim()] || String(raw || "").trim() || "ไม่ระบุ";

// ชุดชื่อสำนักทั้งหมด (ทั้งค่าดิบและชื่อที่ยุบแล้ว) — ใช้ตัดสินว่าหางพาดหัวเป็นชื่อสำนักไหม
const OUTLET_NAMES = new Set();
for (const k of Object.keys(OUTLET_MAP)) OUTLET_NAMES.add(norm(k));
for (const v of Object.values(OUTLET_MAP)) OUTLET_NAMES.add(norm(v));

// ---------- คลี่ข้อมูลที่เก็บแบบตาราง ----------
// โครงจาก tools/build-archives.mjs — **แก้ที่นั่นต้องแก้ที่นี่ด้วย**
//   { o:[สำนัก], c:[หมวด], r:[[พาดหัว, ลิงก์, วินาที, ลำดับสำนัก, [ลำดับหมวด]], …] }
function expand(pack) {
  const out = [];
  for (const r of pack.r) {
    const rawOutlet = pack.o[r[3]] || "";
    const o = mapOutlet(rawOutlet);
    OUTLET_NAMES.add(norm(rawOutlet));
    OUTLET_NAMES.add(norm(o));
    // ⚠️ ยุบช่องว่างซ้ำ "ตั้งแต่ตอนเก็บ" ไม่ใช่ตอนค้น — ไม่งั้น t กับ n ยาวไม่เท่ากัน
    //    แล้วตำแหน่งที่หาเจอใน n จะเอาไปตัดชิ้นจาก t ไม่ได้ (ไฮไลต์จะเพี้ยนทั้งพาดหัว)
    const title = String(r[0] || "").replace(/\s+/g, " ").trim();
    countTails(title);
    // 🗂 หมวดคิดครั้งเดียวตอนโหลด ไม่ใช่ทุกครั้งที่วาด (365 ใบ × 9 หมวด ทุก render = เปลือง)
    const rawCats = (r[4] || []).map((i) => pack.c[i]).filter(Boolean);
    const g = TOPICS ? topicsOf(rawCats, title.toLowerCase()) : [];
    out.push({
      t: title,                      // พาดหัวต้นฉบับ (ใช้ค้นหา · ยังมีหางสำนักข่าวอยู่)
      n: title.toLowerCase(),        // ตัวที่ใช้ค้น — ความยาวเท่ากับ t เสมอ
      ln: looseNorm(title),          // ตัวสำรองตอนผ่อนการสะกด (ความยาวไม่เท่า t → ไฮไลต์ไม่ได้)
      u: r[1],
      ts: r[2] * 1000,
      o,
      os: slug(rawOutlet),           // ไว้เทียบว่าหางพาดหัวเป็นชื่อเว็บของตัวเองไหม
      // 🏷 ป้ายหมวดบนการ์ด + ชิพในกล่องตัวกรอง
      //    หน้าที่จัดหมวด → ใช้ **ชื่อหมวดของ `g`** เสมอ จะได้ตรงกับเลขบนแท็บเป๊ะ
      //    ไม่ว่าหมวดนั้นมาจากชีตหรือมาจากการเดาจากพาดหัว
      //    หน้าคลังหลัก → ค่าดิบจากชีตเหมือนเดิมทุกอย่าง
      c: TOPICS ? g.map((i) => TOPICS[i].name) : rawCats,
      g,
    });
  }
  return out;
}

/* 🗂 ---------- จัดหมวดข่าว (เฉพาะหน้าที่โหลด topics config มา) ----------
 *
 * เจ้าของสั่ง 17 ก.ย. 2026: **"ข่าวต้องแยกเป็นหมวด … เป็นลักษณะ accordance
 * แยกหมวดคร่าวๆเองไปก่อน อยากดู interface"**
 *
 * 📌 **เปิดใช้เมื่อหน้านั้นโหลด `topics-*.config.js` มาเท่านั้น** — หน้าคลังไม่ได้โหลด
 *    จึงยังเป็นรายการเรียงวันที่เหมือนเดิมทุกอย่าง (กฎ "แก้ที่เดียวได้ทั้ง 2 หน้า" ยังอยู่ครบ)
 *
 * 🥇 **ยึดคอลัมน์ `หมวด` ของชีตก่อนเสมอ** (18 ก.ย. 2026 — ชีตรุ่นใหม่ติ๊กหมวดเอาได้แล้ว)
 *    เลขในชีต 1-9 = ลำดับของหมวดในไฟล์นี้ (`1` = ตัวแรก) · ติ๊กหลายช่อง = ข่าวใบเดียวเข้าหลายหมวด
 * 🔙 **แถวที่ยังไม่ได้ติ๊ก ถึงจะเดาจากพาดหัว** (ของเดิม) — ระหว่างที่เจ้าของทยอยวางข่าว
 *    คลังจะมีทั้ง 2 แบบปนกัน **ห้ามถอดตัวเดาออก** ไม่งั้นแถวที่ยังไม่ติ๊กจะตกไปกอง "อื่น ๆ" หมด
 * 🚫 **ยังไม่ใช้ AI เลย** — ตัวเดาเป็นการนับคำในพาดหัวล้วนๆ ตรวจสอบได้ · ฟรี · ไม่ต้องรอเน็ต
 *
 * ⚠️ **1 ข่าวเข้าได้หลายหมวด → เลขบนแท็บรวมกันเกินจำนวนข่าวได้ และนั่นถูกต้องแล้ว**
 *    (รูปแบบแท็บมี "ทั้งหมด" แยกอยู่ ตัวเลขรวมจึงไม่ได้ต้องบวกกันให้ครบ — ต่างจาก accordion เดิม)
 */
const TOPICS = Array.isArray(window.ARCHIVE_TOPICS) ? window.ARCHIVE_TOPICS : null;
const grouping = () => !!TOPICS;
const ETC = TOPICS ? TOPICS.length - 1 : 0;   // ถังรับของที่ไม่เข้าหมวดไหน = ตัวสุดท้ายเสมอ

/** หมวดของข่าว 1 ใบ → array ของ index (เรียงจากน้อยไปมาก · ไม่ซ้ำ · อย่างน้อย 1 ตัวเสมอ)
 *  @param cats ค่าดิบจากคอลัมน์ `หมวด` ของชีต (เช่น ["3","5"])
 *  @param hay  พาดหัวตัวพิมพ์เล็ก — ใช้เดาเมื่อชีตไม่ได้ติ๊กไว้
 */
function topicsOf(cats, hay) {
  if (!TOPICS) return [];
  const out = [];
  for (const raw of cats) {
    const n = Number(String(raw).trim());
    // ⚠️ รับเฉพาะเลขที่มีหมวดรองรับจริง — เจ้าของพิมพ์เกินมาก็ไม่พัง และไม่เงียบหาย
    //    (เลขที่ไม่รู้จักจะตกไปเข้าตัวเดาข้างล่างแทน ไม่ใช่โยนทิ้ง)
    if (Number.isInteger(n) && n >= 1 && n <= TOPICS.length && !out.includes(n - 1)) out.push(n - 1);
  }
  if (out.length) return out.sort((a, b) => a - b);
  // ⚠️ ส่งตัวพิมพ์เล็กเข้าไป — คำละตินในกฎเขียนเป็นตัวเล็ก (`dna` · `cites` · `invasive`)
  return [topicOf(hay)];
}

/** คืน index ของหมวดที่ได้แต้มสูงสุด · เท่ากัน = หมวดที่อยู่บนกว่าชนะ */
function topicOf(hay) {
  if (!TOPICS) return 0;
  let best = ETC, bestScore = 0;
  for (let i = 0; i < TOPICS.length; i++) {
    const t = TOPICS[i];
    let hits = 0;
    for (const w of t.any || []) if (hay.includes(w)) hits++;
    for (const [left, right] of t.pair || []) {
      if (left.some((w) => hay.includes(w)) && right.some((w) => hay.includes(w))) hits++;
    }
    const score = hits * (t.w == null ? 1 : t.w);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/* 🖼 รูปเล็กหน้าข่าว — **เป็นป้ายที่วาดเอง ไม่ใช่รูปจากข่าวจริง**
 *
 * ⚠️ **ในชีตไม่มีคอลัมน์รูปเลย** และคลังเป็นไฟล์นิ่ง จะได้รูปจริงต้องไปอ่าน `og:image`
 *    จากหน้าข่าวทีละใบตอนสร้างไฟล์ — **ยังไม่ได้ทำ** (เครื่องที่รัน session ยิงเข้าเว็บข่าวไม่ได้
 *    ลองแล้วทุกเว็บตอบ 000 = ต่อไม่ติด) · ถ้าเจ้าของอยากได้รูปจริง ต้องสั่งแล้วรันบนเครื่องตัวเอง
 * ✅ ที่ทำได้ตอนนี้: ป้ายสีที่ **อ่านออกว่าใครเป็นคนเขียน** (ตัวย่อสำนักข่าว) + ไอคอนหมวดมุมขวาล่าง
 *    · ไม่ยิงเน็ตเลยสักครั้ง = เปิดไวเสมอ และไม่รั่วว่าใครอ่านข่าวใบไหนไปให้เว็บนอก
 *      (สำคัญ เพราะหน้านี้จะอยู่หลัง Cloudflare Access)
 */
const hueOf = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};
/* 🏷 ป้ายรูปเล็กยึด **เว็บที่ข่าวอยู่** ไม่ใช่คอลัมน์สำนักข่าวในชีต
 * ⚠️ เพราะในคลังนี้ 266 จาก 365 แถว คอลัมน์สำนักข่าวเป็นชื่อ Google Alert ก้อนเดียวกันหมด
 *    ("หัวข้อที่จับตามอง") ถ้ายึดคอลัมน์นั้น ป้ายจะหน้าตาเหมือนกันเกือบทั้งหน้า = ไม่บอกอะไรเลย
 *    ส่วนที่อยู่ของข่าวบอกได้เสมอว่าใครเป็นคนลง · คนละเรื่องกับชื่อที่โชว์ในบรรทัดล่าง */
function siteOf(u) {
  try {
    const h = new URL(u, location.href).hostname.replace(/^www\./, "");
    // ตัดโดเมนระดับบนออกให้เหลือชื่อเว็บ: thairath.co.th → thairath
    return h.split(".")[0] || h;
  } catch { return ""; }
}

/** ตัวย่อบนป้าย — ไทยเอา 2 ตัว · ละตินเอาอักษรแรกของ 2 คำแรก */
function initials(name) {
  const s = String(name || "").trim();
  if (!s) return "?";
  if (/^[\x20-\x7e]+$/.test(s)) {
    const parts = s.split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : s.slice(0, 2)).toUpperCase();
  }
  return s.replace(/^[^฀-๿a-z0-9]+/i, "").slice(0, 2) || s.slice(0, 2);
}

/* 📥 **อ่านไฟล์คลัง — ต้องเช็คชนิดของคำตอบก่อนแกะเสมอ**
 *
 * 🐞 เจ้าของส่งภาพมา 16 ก.ย. 2026: หน้า blackchin ขึ้น
 *    «Unexpected token '<', "<!DOCTYPE "... is not valid JSON»
 *    = **Cloudflare ตอบหน้า HTML กลับมาพร้อมสถานะ 200** (หน้า 404 ของมันเอง)
 *    → `r.ok` เป็น true → `r.json()` พัง → ศัพท์ในโค้ดหลุดไปโผล่หน้าเจ้าของ
 *
 * 📏 **เป็นกับดักเดียวกับที่ `apiGet()` ของ `/social/` จดไว้แล้ว** (เซสชัน Access หมดอายุ
 *    ตอบหน้าล็อกอินเป็น HTML แทน JSON) — ที่นี่ไม่ได้ทำตาม จึงเจอซ้ำ
 *    ⚠️ **สำคัญขึ้นอีกเมื่อเจ้าของเอา `archives/data-blackchin` เข้า Access แล้ว**
 *       เพราะตอนเซสชันหมดอายุจะหน้าตาเหมือน "ไฟล์ไม่มี" เป๊ะ ถ้าไม่แยกให้ออก
 *       เจ้าของจะไปนั่งสร้างไฟล์ใหม่ทั้งที่แค่ต้องล็อกอิน
 *
 * แยก 3 อย่างออกจากกัน แล้วคืนเป็น `code` ให้ผู้เรียกเลือกข้อความเอง:
 *   `signed-out` ถูกพาออกไปโดเมนอื่น (Access) หรือโดน 401/403 → ต้องล็อกอินใหม่
 *   `missing`    404 · หรือ 200 แต่เป็น HTML ของโดเมนเดิม (Pages เสิร์ฟหน้า 404 ของมัน) → ยังไม่ได้สร้างไฟล์
 *   `offline`    ยิงไม่ออกเลย → เน็ตมีปัญหา
 * 🚫 **ห้ามเอา `e.message` ดิบไปโชว์** — เป็นภาษาของโค้ด ไม่ใช่ภาษาที่ใช้คุย
 */
class ArchiveError extends Error {
  constructor(code) { super(code); this.code = code; }
}

async function fetchArchiveJSON(path) {
  let r;
  try {
    r = await fetch(path, { headers: { accept: "application/json" } });
  } catch {
    throw new ArchiveError("offline");
  }
  // Access เด้งไปหน้าล็อกอินด้วย redirect ข้ามโดเมน — fetch ตามไปแล้ว r.url จะเปลี่ยนโฮสต์
  let sameHost = true;
  try { sameHost = new URL(r.url, location.href).host === location.host; } catch {}
  if (r.redirected || !sameHost || r.status === 401 || r.status === 403)
    throw new ArchiveError("signed-out");

  if (r.status === 404) throw new ArchiveError("missing");
  if (!r.ok) throw new ArchiveError("missing");

  // ⭐ ด่านที่ขาดไปรอบที่แล้ว — 200 ไม่ได้แปลว่าได้ JSON
  if (!(r.headers.get("content-type") || "").includes("json"))
    throw new ArchiveError("missing");

  try { return await r.json(); } catch { throw new ArchiveError("missing"); }
}

// ---------- โหลดปี ----------
async function loadYear(y) {
  if (loaded.has(y)) return;
  loaded.add(y);
  const pack = await fetchArchiveJSON(`${DATA_DIR}/${y}.json`);
  rows = rows.concat(expand(pack));
  rows.sort((a, b) => b.ts - a.ts);
}

// ปีที่ยังไม่ได้โหลด เรียงใหม่→เก่า
const pendingYears = () => (INDEX?.years || []).map((x) => x.y).filter((y) => !loaded.has(y)).sort((a, b) => b - a);

// ช่วงวันที่ที่ผู้ใช้เลือก ต้องการปีไหนบ้างที่ยังไม่โหลด
function yearsNeededByDate() {
  if (!state.from) return [];
  const y0 = +state.from.slice(0, 4);
  const y1 = state.to ? +state.to.slice(0, 4) : new Date().getFullYear();
  return pendingYears().filter((y) => y >= Math.min(y0, y1) && y <= Math.max(y0, y1));
}

// ---------- กรอง ----------
/* 🗂 **ค้นแยกรายหมวด** (เจ้าของสั่ง 18 ก.ย. 2026: "การค้นให้ค้นแยกแต่ละหมวด")
 *
 * มี 2 กอง อย่าสลับกัน:
 *   `scoped`   = ผ่านทุกเงื่อนไขแล้ว **ยกเว้นหมวด** → ใช้ทำเลขบนแท็บ
 *   `filtered` = `scoped` ที่เหลือเฉพาะหมวดที่เปิดอยู่ → ใช้วาดรายการ · ใช้ให้ AI อ่าน
 *
 * ⚠️ **เลขบนแท็บต้องมาจาก `scoped` เท่านั้น** — ถ้าเอามาจาก `filtered` แท็บอื่นจะเป็น 0 หมด
 *    ทันทีที่เปิดหมวดใดหมวดหนึ่ง แล้วผู้ใช้จะไม่มีทางรู้ว่าคำที่ค้นไปโผล่ที่หมวดไหนอีก
 *    ซึ่งเป็น**ทางออกเดียว**ของกับดัก "ค้นในหมวดเดียวแล้วเจอ 0 นึกว่าคลังไม่มี"
 */
let scoped = [];                 // ผ่านทุกเงื่อนไข ยกเว้นหมวด
let gCounts = [];                // จำนวนข่าวต่อหมวด (นับจาก scoped)

function applyFilters() {
  // โหมดผ่อนการสะกด: เทียบกับพาดหัวที่ตัดวรรณยุกต์แล้วทั้งสองฝั่ง
  const terms = looseMode ? parseTerms(state.q).map(looseNorm) : parseTerms(state.q);
  const from = state.from ? Date.parse(state.from + "T00:00:00") : null;
  const to = state.to ? Date.parse(state.to + "T23:59:59") : null;
  const cats = state.cats, srcs = state.srcs;

  filtered = rows.filter((r) => {
    // ← substring ตรงๆ (ดูหมายเหตุบนสุด) · หลายคำ = ต้องมีครบทุกคำ อยู่ตรงไหนก็ได้
    if (terms.length && !terms.every((t) => (looseMode ? r.ln : r.n).includes(t))) return false;
    if (from !== null && r.ts < from) return false;
    if (to !== null && r.ts > to) return false;
    if (srcs.size && !srcs.has(r.o)) return false;
    if (cats.size) {                                   // หมวดเป็น "อันใดอันหนึ่ง" (OR)
      let hit = false;
      for (const c of r.c) if (cats.has(c)) { hit = true; break; }
      if (!hit) return false;
    }
    // 🤖 เงื่อนไขที่ต้องอ่านพาดหัว — ใช้ผลที่ AI คัดไว้แล้วเท่านั้น
    // ⚠️ ระหว่างที่ยังคัดไม่เสร็จ (judgeKeep = null) ให้ **แสดงทั้งหมดไปก่อน**
    //    ไม่ใช่ซ่อนทุกใบ — หน้าว่างเปล่าระหว่างรอ อ่านแล้วเหมือน "ไม่มีข่าว"
    if (state.judge && judgeKeep && !judgeKeep.has(r.u)) return false;
    return true;
  });

  if (!TOPICS) { scoped = filtered; gCounts = []; return; }
  scoped = filtered;
  gCounts = TOPICS.map(() => 0);
  for (const r of scoped) for (const i of r.g) gCounts[i]++;
  const gi = TOPICS.findIndex((t) => t.id === state.g);
  if (gi >= 0) filtered = scoped.filter((r) => r.g.includes(gi));
}

/* ─────────── 🤖 ถามเป็นประโยค ───────────
 *
 * เจ้าของสั่ง 26 ส.ค. 2026: "อยากให้ search เป็นแบบ chat ai
 *   เช่น หาข่าวด้านดีของปลาหมอคางดำทั้งหมด"
 *
 * แบ่งงานเป็น 2 ท่อน เพราะมันคนละเรื่องกัน:
 *   "ปลาหมอคางดำ" → เป็นตัวอักษรที่อยู่ในพาดหัว → ค้นในเครื่องเหมือนเดิม (ทันที ฟรี)
 *   "ด้านดี"       → ต้องอ่านแล้วตีความ         → ส่งพาดหัวที่ค้นเจอให้ AI คัด
 *
 * 🚫 **ไม่ได้เปลี่ยนวิธีค้นเดิมเลย** — ยังเป็น includes() ทีละแถวเหมือนเดิม
 *    (กฎข้อห้ามข้อแรกของหน้านี้: ห้ามใช้ตัวค้นที่ตัดคำด้วยช่องว่าง)
 */
const ASK_EP = "/api/archives/ask";
// ⚠️ AI ล่มแล้วค้นแบบคำต่อคำ **ใช้ไม่ได้กับคำถามไทยที่เขียนติดกันไม่มีช่องว่าง**
//    ("หาข่าวด้านดีของปลาหมอคางดำทั้งหมด" จะกลายเป็นคำเดียวยาวๆ ที่ไม่มีในพาดหัวไหนเลย)
//    บอกทางออกให้ผู้ใช้ไปเลย ดีกว่าปล่อยให้เจอ "พบ 0 ข่าว" แล้วเดาเอง
const FALLBACK_NOTE = "ตอนนี้ AI ตอบไม่ได้ — ค้นแบบคำต่อคำให้แทน ถ้าไม่เจอ ลองพิมพ์เฉพาะคำสำคัญ เช่น ปลาหมอคางดำ";
const JUDGE_MAX = 200; // ส่งให้ AI อ่านมากสุดกี่ใบต่อคำถาม (ต้องไม่เกินเพดานฝั่งเซิร์ฟเวอร์)

// คำที่มีช่องว่างอยู่ข้างในต้องครอบเครื่องหมายคำพูด ไม่งั้นช่องค้นหาจะแยกเป็นคนละคำ
const quoteTerm = (t) => (/\s/.test(t) ? `"${t}"` : t);

/** ขอให้เซิร์ฟเวอร์ตีความคำถาม · broad = รอบสอง ขอคำที่กว้างขึ้น */
async function fetchPlan(question, broad) {
  try {
    const r = await fetch(`${ASK_EP}?q=${encodeURIComponent(question)}${broad ? "&broad=1" : ""}`);
    // ⚠️ ต้องเช็คชนิดของคำตอบก่อนแกะ — ถ้าวันหนึ่งมี Cloudflare Access คลุม /api/
    //    มันจะตอบหน้าล็อกอินเป็น HTML แล้ว .json() จะพัง แล้วรายงานผิดเรื่อง
    if (r.ok && (r.headers.get("content-type") || "").includes("json")) return await r.json();
  } catch (e) { /* คืน null ให้ผู้เรียกจัดการ */ }
  return null;
}

async function runAsk() {
  const question = $("#q").value.trim();
  if (!question || judgeBusy) return;

  judgeBusy = true;
  relaxNote = "";
  looseMode = false;
  state.ask = question;
  // ⏳ **วาดสถานะ "กำลังค้น" ทันที ก่อนจะไปรอคำตอบ**
  //    ลืมบรรทัดนี้ = รายการยังเป็นผลของคำถามก่อนหน้าตลอดเวลาที่รอ
  //    ซึ่งอ่านแล้วเข้าใจว่านี่คือคำตอบของคำถามใหม่ (เจ้าของสั่งให้มีไอคอนหมุน 26 ส.ค. 2026)
  renderAskBar();
  renderList();

  // 🔤 โหมดค้นด้วยคำ — ไม่ยิง AI เลย เอาที่พิมพ์ไปค้นตรงๆ
  //    (ยังผ่อนการสะกดให้ตอนไม่เจอ และยังบอกว่าผ่อนอะไร เหมือนโหมด AI)
  if (!isAI()) {
    judgeBusy = false;
    state.ask = "";           // ไม่ได้ถาม จึงไม่มี "ถามว่า …" ให้แสดง
    state.judge = "";
    judgeKeep = null;
    judgeNote = "";
    state.q = question;
    state.shown = PAGE;
    applyFilters();
    relaxNote = relaxIfEmpty();
    // วัดกับทั้งคลัง (`scoped`) ไม่ใช่หมวดที่เปิดอยู่ — ดูเหตุผลที่ relaxIfEmpty
    if (!scoped.length && !relaxNote) relaxNote = `ไม่มีข่าวที่มีคำว่า “${question}” อยู่ในคลังเลย`;
    syncURL(true);
    render();
    return;
  }

  const plan = await fetchPlan(question, false);

  // ⚠️ **ทางถอยห้ามขาด** — ถามไม่ผ่านก็ต้องยังค้นได้ ไม่ใช่หน้าค้าง
  //    เอาคำถามไปค้นตรงๆ = พฤติกรรมเดิมของหน้านี้เป๊ะ
  // 🐞 **"ไม่มีคำค้น" ไม่ได้แปลว่าตีความไม่ออก** (เจ้าของเจอ 27 ส.ค. 2026: ถาม "ข่าวเมื่อวาน")
  //    คำถามเรื่องช่วงเวลาล้วนๆ ไม่มีคำไหนอยู่ในพาดหัวเลย — มีแต่ช่วงวันที่
  //    ของเดิมตกไปค้นคำว่า "ข่าวเมื่อวาน" ในพาดหัว = 0 ใบทุกครั้ง
  //    ถอยก็ต่อเมื่อ **ไม่ได้อะไรมาเลยสักอย่าง** เท่านั้น
  const gotSomething =
    plan && Array.isArray(plan.terms) && (plan.terms.length || plan.from || plan.to || plan.judge);
  if (!gotSomething) {
    judgeBusy = false;
    state.judge = "";
    judgeKeep = null;
    // ⚠️ **ต้องตั้งคำค้นเองด้วย** — โหมดเดียวแล้ว ไม่มีตัวค้นสดคอยตั้งให้เหมือนเมื่อก่อน
    //    ลืมบรรทัดนี้ = ถามแล้วไม่มีอะไรเกิดขึ้นเลยเวลา AI ใช้ไม่ได้
    state.q = question;
    judgeNote = FALLBACK_NOTE;
    state.shown = PAGE;
    syncURL(true);
    render();
    return;
  }

  state.q = plan.terms.map(quoteTerm).join(" ");
  if (plan.from) state.from = plan.from;
  if (plan.to) state.to = plan.to;
  state.judge = String(plan.judge || "");
  judgeKeep = null;
  // AI ล่มแต่ตีความช่วงวันที่ให้เองได้ → อย่าบอกว่า "ค้นแบบคำต่อคำ" ซึ่งไม่ตรงกับที่ทำจริง
  judgeNote = plan.ai
    ? ""
    : (plan.from || plan.to) && !plan.terms.length
    ? `ตอนนี้ AI ตอบไม่ได้ — แต่อ่านช่วงวันที่ในคำถามออกเอง จึงกรองตามวันที่ให้แทน${plan.why ? ` (${plan.why})` : ""}`
    : plan.why ? `${FALLBACK_NOTE} (${plan.why})` : FALLBACK_NOTE;
  state.shown = PAGE;
  fillInputs();

  // ผู้ใช้ถามถึงช่วงเวลาที่ยังไม่ได้โหลดข้อมูลปีนั้น → โหลดให้ก่อน
  const need = yearsNeededByDate();
  if (need.length) await withBusy(() => Promise.all(need.map(loadYear)));

  applyFilters();
  relaxNote = relaxIfEmpty();     // ไม่เจอเลย → ผ่อนให้ก่อนที่ผู้ใช้จะเห็นหน้าว่าง

  // 🧠 ยังไม่เจออีก → **ขอคำที่กว้างขึ้นอีกรอบเดียว**
  // ⚠️ ภาษาไทยไม่มีช่องว่างคั่นคำ ฝั่งหน้าเว็บจึงแยก "เผาข้าวโพด" เป็น "เผา"+"ข้าวโพด" เองไม่ได้
  //    ต้องให้ AI แยกให้ (เจอจริง 26 ส.ค. 2026: ได้คำประสมคำเดียวแล้วเหลือ 0 ข่าว)
  //    ยิงเพิ่มแค่ตอนไม่เจอเท่านั้น และ cache แยก จึงไม่เปลืองในการใช้งานปกติ
  if (!scoped.length && plan.ai && state.q) {
    const wide = await fetchPlan(question, true);
    const wideTerms = wide && Array.isArray(wide.terms) ? wide.terms.filter(Boolean) : [];
    if (wideTerms.length) {
      const before = state.q;
      state.q = wideTerms.map(quoteTerm).join(" ");
      applyFilters();
      if (scoped.length) relaxNote = `ไม่เจอด้วยคำว่า “${before.replace(/"/g, "")}” — ลองคำที่กว้างขึ้นให้แล้ว`;
      else { state.q = before; applyFilters(); }
    }
  }
  // ⚠️ ยังไม่เจอจริงๆ = **บอกตรงๆ ว่าไม่มีในคลัง** ไม่ใช่ปล่อยให้เจอข้อความ "ลองลดตัวกรองลง"
  //    ซึ่งผู้ใช้ไม่ได้ตั้งตัวกรองอะไรไว้เลย อ่านแล้วงงว่าจะให้ลดอะไร
  if (!scoped.length && !relaxNote) {
    // ⚠️ คำถามเรื่องช่วงเวลาล้วนๆ ไม่มีคำค้นเลย — ห้ามขึ้นว่า 'ไม่มีข่าวที่มีคำว่า ""'
    const cov = coverage();
    const span = cov ? ` (คลังมีข่าวตั้งแต่ ${dayOf(cov.lo)} ถึง ${dayOf(cov.hi)})` : "";
    relaxNote = state.q
      ? `ไม่มีข่าวที่มีคำว่า “${state.q.replace(/"/g, "")}” อยู่ในคลังเลย`
      : `ไม่มีข่าวในช่วงวันที่ที่ถามมาเลย${span}`;
  }

  syncURL(true);
  render();                       // วาดผลของคำค้นก่อน ผู้ใช้จะได้เห็นอะไรทันที
  await judgePass();              // แล้วค่อยคัดตามเงื่อนไข
  judgeBusy = false;
  render();
}

// ส่งพาดหัวที่ค้นเจอให้ AI คัดตามเงื่อนไข
async function judgePass() {
  if (!state.judge) { judgeKeep = null; return; }
  const pool = filtered.slice(0, JUDGE_MAX);
  if (!pool.length) { judgeKeep = new Set(); return; }

  renderAskBar(true);
  try {
    const r = await fetch(ASK_EP, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ judge: state.judge, titles: pool.map((x) => x.t) }),
    });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) throw new Error("คัดไม่สำเร็จ");
    const out = await r.json();
    const keep = Array.isArray(out.keep) ? out.keep : [];
    judgeKeep = new Set(keep.map((i) => pool[i] && pool[i].u).filter(Boolean));
    judgeNote = out.ai === false ? (out.why || "ยังไม่ได้คัดตามเงื่อนไข") : (out.partial ? "คัดได้ไม่ครบทุกใบ — ใบที่คัดไม่ได้ยังแสดงอยู่" : "");
  } catch (e) {
    // ⚠️ คัดไม่สำเร็จ = **แสดงทุกใบ** ไม่ใช่ซ่อนทุกใบ · และต้องบอกด้วยว่ายังไม่ได้คัด
    judgeKeep = null;
    judgeNote = "คัดตามเงื่อนไขไม่สำเร็จ — แสดงผลจากคำค้นทั้งหมดไปก่อน";
  }
  if (filtered.length > JUDGE_MAX) {
    judgeNote = (judgeNote ? judgeNote + " · " : "") + `อ่านให้แค่ ${JUDGE_MAX} ใบแรก (เจอ ${filtered.length.toLocaleString("th-TH")} ใบ) — ใส่คำให้แคบลงจะแม่นกว่า`;
  }
}

function clearAsk() {
  state.judge = ""; state.ask = "";
  judgeKeep = null; judgeNote = ""; relaxNote = "";
  looseMode = false;
}

/* 🧠 **ไม่เจอเลย = ผ่อนเงื่อนไขให้เอง แล้วบอกว่าผ่อนอะไรไป**
 *
 * หน้านี้ใช้กฎ "ต้องมีครบทุกคำ" → มีคำเดียวที่ไม่ตรงก็เหลือ 0 ทันที
 * และ AI เดาช่วงเวลาพลาดก็ทำให้เหลือ 0 ได้เหมือนกัน
 * ปล่อยให้ผู้ใช้เจอ "พบ 0 ข่าว" แล้วไปนั่งเดาเองว่าคำไหนผิด = แย่กว่าไม่มี AI
 *
 * ⚠️ **ห้ามผ่อนเงียบๆ** — ต้องบอกทุกครั้งว่าตัดอะไรออก ไม่งั้นผู้ใช้จะนึกว่าผลที่เห็นตรงกับที่ถาม
 * ⚠️ ผ่อนตามลำดับ "ตัวที่น่าจะรัดเกินไปก่อน": ช่วงวันที่ → คำที่สั้นที่สุด (เจาะจงน้อยสุด)
 */
/* 📅 คลังข่าวมีข่าวถึงแค่วันไหน — คิดจากแถวที่โหลดมาจริง ไม่ใช่เดาจากวันนี้
   ⚠️ ข้อมูลเป็นไฟล์นิ่งที่ commit ไว้ ต้องสร้างใหม่ด้วยมือ (tools/build-archives.mjs)
      ไม่ได้อัปเดตเองทุกวัน → มักเก่ากว่าวันนี้หลายวันเสมอ */
const dayOf = (ts) => fmtDate(ts).slice(0, 10);
function coverage() {
  if (!rows.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (const r of rows) { if (r.ts) { if (r.ts < lo) lo = r.ts; if (r.ts > hi) hi = r.ts; } }
  return hi > 0 ? { lo, hi } : null;
}

/* ⚠️ **ทั้งฟังก์ชันนี้วัดกับ `scoped` (ทั้งคลัง) ห้ามใช้ `filtered`**
 *    ตัวผ่อนเงื่อนไขมีไว้กู้เคส "AI แต่งคำเกิน / เดาเดือนพลาด" — ส่วนหมวดเป็นสิ่งที่
 *    ผู้ใช้เลือกเอง ไม่ใช่การเดา · ถ้าวัดกับหมวดที่เปิดอยู่ จะกลายเป็นว่าเปิดหมวดเล็กไว้
 *    แล้วค้นอะไรก็ "ไม่เจอ" → ระบบไล่ตัดช่วงวันที่และตัดคำทิ้งทั้งที่คลังมีของอยู่เต็ม
 *    แล้วขึ้นว่า "ไม่มีคำนี้ในคลังเลย" ซึ่งโกหก (เจอจริงตอนวัด 18 ก.ย. 2026: อยู่หมวด
 *    🧬 งานวิจัย DNA แล้วค้น "ศาลปกครอง" → ขึ้นว่าไม่มีในคลัง ทั้งที่มี 35 ใบ)
 *    · เคสนั้นตกไปเข้ากล่อง "ไม่เจอในหมวดนี้ · หมวดอื่นมี N ใบ" ของ renderList แทน
 */
function relaxIfEmpty() {
  if (scoped.length) return "";

  // 🐞 **ถามถึงช่วงที่คลังยังไม่มีข่าว — ห้ามตัดวันที่ทิ้งแล้วโยนข่าวทั้งคลังมาให้**
  //    (เจ้าของเจอจริง 28 ส.ค. 2026: ถาม "ข่าวเมื่อวาน" แล้วได้ข่าวของ 13-14 ส.ค. เป็นพรืด)
  //    คำถามเรื่องเวลาล้วนๆ พอตัดวันที่ออกจะไม่เหลือเงื่อนไขอะไรเลย = ได้ทั้งคลัง
  //    ซึ่งไม่เกี่ยวกับที่ถามสักนิด · ตอบว่า "คลังมีถึงแค่วันไหน" ตรงๆ มีประโยชน์กว่ามาก
  //    ⚠️ ใช้ทางนี้ **เฉพาะคำถามที่ไม่มีคำค้น** — ถ้ามีคำค้นอยู่ด้วย การตัดวันที่ทิ้ง
  //       ยังมีประโยชน์ (AI เดาเดือนพลาดบ่อย) และผู้ใช้ยังได้ของที่ถามอยู่
  const cov = coverage();
  const outside =
    cov && !parseTerms(state.q).length &&
    ((state.from && Date.parse(state.from + "T23:59:59") < cov.lo) ||
     (state.to && Date.parse(state.to + "T00:00:00") > cov.hi));
  if (outside) {
    return `คลังข่าวมีข่าวถึงแค่ ${dayOf(cov.hi)} (ตั้งแต่ ${dayOf(cov.lo)}) — ยังไม่มีข่าวของช่วงที่ถามมา`;
  }

  // 1) ช่วงวันที่ — AI เดาเดือนพลาดเจอบ่อยที่สุด และตัดออกแล้วผู้ใช้ยังได้ของที่ถามอยู่
  //    ⚠️ ทำได้เฉพาะตอน **มีคำค้นอยู่ด้วย** — ไม่งั้นตัดแล้วไม่เหลือเงื่อนไขเลย
  if ((state.from || state.to) && parseTerms(state.q).length) {
    const f = state.from, t = state.to;
    state.from = ""; state.to = "";
    applyFilters();
    if (scoped.length) return `ไม่เจอข่าวในช่วง ${f || "…"} ถึง ${t || "…"} เลย — ตัดช่วงวันที่ออกให้แล้ว`;
    state.from = f; state.to = t;   // ไม่ช่วย → คืนค่าเดิม
  }

  // 2) ผ่อนการสะกด — ทำก่อนตัดคำ เพราะยังได้คำที่ผู้ใช้ถามครบทุกคำ (เสียน้อยกว่า)
  looseMode = true;
  applyFilters();
  if (scoped.length) return "สะกดไม่ตรงกับในข่าวเป๊ะ — จับคำที่ใกล้เคียงให้แล้ว (ไม่ได้ไฮไลต์คำในโหมดนี้)";
  looseMode = false;
  applyFilters();

  // 3) ตัดคำออกทีละคำ
  // ⚠️ **ต้องลองตัดทีละคำแล้วดูว่าคำไหนคือตัวที่ทำให้ไม่เจอ** ไม่ใช่ตัดตามความยาว
  //    (เดาว่า "คำสั้น = ไม่สำคัญ" แล้วพลาด — คำที่ผิดมักเป็นคำยาวที่ AI แต่งขึ้นมาเอง)
  //    คำมากสุด 6 คำ การไล่ทุกแบบจึงถูกมาก
  const saveQ = state.q, saveFrom = state.from, saveTo = state.to;
  let keep = parseTerms(state.q);
  if (keep.length < 2) return "";
  const dropped = [];
  while (keep.length > 1) {
    let best = null;
    for (let i = 0; i < keep.length; i++) {
      const trial = keep.filter((_, k) => k !== i);
      state.q = trial.map(quoteTerm).join(" ");
      applyFilters();
      if (scoped.length && (!best || scoped.length > best.n)) best = { i, n: scoped.length, trial };
    }
    if (best) {
      dropped.push(keep[best.i]);
      state.q = best.trial.map(quoteTerm).join(" ");
      applyFilters();
      return `ไม่เจอข่าวที่มีครบทุกคำ — ตัดคำว่า “${dropped.join("”, “")}” ออกให้แล้ว`;
    }
    // ตัดคำเดียวยังไม่พอ → ตัดคำที่สั้นสุดทิ้งแล้ววนหาต่อ
    keep = [...keep].sort((a, b) => b.length - a.length);
    dropped.push(keep.pop());
  }
  // ตัดจนเหลือคำเดียวแล้วยังไม่เจอ = ไม่มีจริงๆ คืนของเดิมไป ไม่ต้องหลอกว่าผ่อนแล้ว
  state.q = saveQ; state.from = saveFrom; state.to = saveTo;
  applyFilters();
  return "";
}

/* 🔀 วาดปุ่มสลับโหมด + ปรับหน้าตาช่องค้นหาให้ตรงกับโหมดที่เลือก
   ⚠️ ต้องเปลี่ยนให้ครบทั้ง ป้าย · placeholder · บรรทัดบอกวิธีใช้ · ป้ายบนปุ่ม
      เปลี่ยนแค่บางอย่าง = ผู้ใช้อ่านแล้วไม่แน่ใจว่าตอนนี้อยู่โหมดไหน */
function applyMode() {
  const m = MODES[state.mode] || MODES.ai;
  // 🔀 ปุ่ม 2 ช่อง — ระบายช่องที่เลือกอยู่ ที่เหลือปล่อยจางไว้ให้เห็นว่ายังกดได้
  $$("#modeseg .mseg").forEach((b) => {
    const on = b.dataset.mode === state.mode;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const q = $("#q");
  if (q) q.placeholder = m.ph;
  const h = $(".qhint");
  if (h) h.innerHTML = m.hint;
  const b = $("#askbtn");
  if (b) { $(".flabel", b).textContent = m.btn; b.title = m.tip; }
}

function setMode(next) {
  if (state.mode === next) return;
  state.mode = next;
  try { localStorage.setItem(MODE_KEY, next); } catch {}
  // สลับโหมด = ทิ้งผลที่ตีความไว้ด้วยโหมดเก่า ไม่งั้นแถบจะบอกคนละเรื่องกับป้าย
  clearAsk();
  applyMode();
  syncURL(true);
  render();
  $("#q").focus();
}

function renderAskBar(judging) {
  // ปุ่มถามต้องบอกสถานะด้วย — ปุ่มที่กดแล้วหน้าตาเหมือนเดิม อ่านแล้วเหมือนกดไม่ติด
  const btn = $("#askbtn");
  if (btn) {
    btn.disabled = judgeBusy;
    btn.classList.toggle("busy", judgeBusy);
    const ic = btn.firstElementChild;
    if (ic) ic.innerHTML = judgeBusy ? '<span class="spin"></span>' : "🔎";
  }
  const bar = $("#askbar");
  if (!bar) return;
  if (!state.ask && !state.judge && !judgeNote && !relaxNote) { bar.hidden = true; bar.innerHTML = ""; return; }
  bar.hidden = false;

  if (judgeBusy) {
    bar.innerHTML = `<span class="loading"><span class="spin"></span>${judging ? "กำลังอ่านพาดหัวเพื่อคัดตามเงื่อนไข…" : "กำลังตีความคำถาม…"}</span>`;
    return;
  }
  // ⚠️ บอกให้ครบว่า "ค้นด้วยอะไร" และ "คัดด้วยอะไร" — ไม่งั้นผู้ใช้ไม่มีทางรู้ว่าทำไมได้ผลแบบนี้
  const bits = [];
  if (state.ask) bits.push(`ถามว่า <b>${esc(state.ask)}</b>`);
  if (state.q) bits.push(`ค้นคำ <b>${esc(state.q)}</b>`);
  if (state.judge) bits.push(`คัดเฉพาะที่ <b>${esc(state.judge)}</b>`);
  bar.innerHTML =
    `<span class="askwhy">${bits.join(" · ")}</span>` +
    (relaxNote ? `<span class="asknote">🔎 ${esc(relaxNote)}</span>` : "") +
    (judgeNote ? `<span class="asknote">⚠️ ${esc(judgeNote)}</span>` : "") +
    `<button type="button" class="btn sm" data-askclear>เลิกคัด</button>`;
}

const hasFilter = () => !!(state.q || state.from || state.to || state.cats.size || state.srcs.size || state.judge);
// 🚫 **"ตัวกรอง" กับ "คำค้น" คนละเรื่องกัน ห้ามเหมารวม** — คนที่พิมพ์คำแล้วไม่เจอ
//    ยังไม่ได้ตั้งตัวกรองอะไรไว้เลย บอกให้ "ลองลดตัวกรองลง" จึงไม่มีอะไรให้ลด
//    (กฎเดิมของหน้านี้ที่เคยเขียนไว้แต่ยังไม่ได้ทำ — เจอจริงตอนลองกับข้อมูลจริง 17 ก.ย. 2026)
const hasBoxFilter = () => !!(state.from || state.to || state.cats.size || state.srcs.size);

// ---------- URL ----------
// เก็บสถานะทั้งหมดไว้ใน query string — ก๊อป URL ส่งต่อแล้วเปิดได้ผลเดิม
function toQuery() {
  const p = new URLSearchParams();
  if (state.q) p.set("q", state.q);
  if (state.from) p.set("from", state.from);
  if (state.to) p.set("to", state.to);
  if (state.cats.size) p.set("cat", [...state.cats].join(","));
  if (state.srcs.size) p.set("src", [...state.srcs].join(","));
  // เงื่อนไขของ 🤖 เข้า URL ด้วย — ก๊อปลิงก์ส่งต่อแล้วต้องได้ผลเดิม ไม่ใช่ได้ผลกว้างกว่า
  if (state.judge) p.set("judge", state.judge);
  if (state.ask) p.set("ask", state.ask);
  // โหมดเข้า URL ด้วย — ก๊อปลิงก์ส่งต่อแล้วต้องได้หน้าตาเดียวกัน (ค่าตั้งต้นคือ ai จึงไม่ต้องใส่)
  if (state.mode === "kw") p.set("mode", "kw");
  if (state.g) p.set("g", state.g);   // หมวดที่เปิดอยู่ — ส่งลิงก์ตรงหมวดให้กันได้
  const s = p.toString();
  return s ? "?" + s : location.pathname;
}
function readQuery() {
  const p = new URLSearchParams(location.search);
  state.q = p.get("q") || "";
  state.from = p.get("from") || "";
  state.to = p.get("to") || "";
  state.cats = new Set((p.get("cat") || "").split(",").filter(Boolean));
  state.srcs = new Set((p.get("src") || "").split(",").filter(Boolean));
  state.judge = p.get("judge") || "";
  state.ask = p.get("ask") || "";
  // URL ชนะ localStorage — ลิงก์ที่ส่งต่อกันต้องเปิดได้หน้าตาเดิมเสมอ
  let saved = "";
  try { saved = localStorage.getItem(MODE_KEY) || ""; } catch {}
  state.mode = p.get("mode") === "kw" ? "kw" : p.has("mode") ? "ai" : saved === "kw" ? "kw" : "ai";
  // หมวดที่ไม่มีอยู่จริง (config เปลี่ยนไปแล้ว / พิมพ์มั่ว) = ตกกลับไปที่ "ทุกหมวด"
  // 🚫 ห้ามปล่อยให้ค้างเป็นหมวดที่ไม่มี — จะได้หน้าว่างโดยไม่มีอะไรบอกว่าทำไม
  const g = p.get("g") || "";
  state.g = TOPICS && TOPICS.some((t) => t.id === g) ? g : "";
  judgeKeep = null;   // เปิดจากลิงก์ = ยังไม่ได้คัด ต้องไปคัดใหม่
  state.shown = PAGE;
}
// พิมพ์ = replace (ไม่งั้นกด back ทีละตัวอักษร) · กดปุ่ม/ชิพ = push (กด back แล้วย้อนได้)
function syncURL(push) {
  const url = toQuery();
  const now = location.search || location.pathname;   // ตอนไม่มีตัวกรอง toQuery() คืน pathname
  if (url === now) return;                             // เหมือนเดิม = ไม่ต้องเพิ่มประวัติซ้ำ
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

// ---------- แสดงผล ----------
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ไฮไลต์ "ทุกตำแหน่ง" ที่ตรง รวมที่อยู่กลางคำ
// ⚠️ ต้องหาตำแหน่งบนสตริงที่ normalize แล้ว แต่ตัดชิ้นจากสตริงจริง
//    ความยาวเท่ากันเพราะ norm() แค่ยุบช่องว่างกับ lowercase — จึงใช้ตำแหน่งร่วมกันได้
//    (ถ้าวันหนึ่งเพิ่มการตัดอักขระใน norm() ต้องเลิกใช้วิธีนี้)
// ⚠️ หลายคำต้องรวมช่วงที่ทับกันก่อนวาด ไม่งั้นจะได้ <mark> ซ้อน <mark>
//    (พิมพ์ "กุ้ง ผลผลิตกุ้ง" — คำหลังคลุมคำแรกอยู่)
function highlight(display, terms) {
  if (!terms || !terms.length) return esc(display);
  const hay = display.toLowerCase();   // ยาวเท่า display เสมอ (ยุบช่องว่างไปตั้งแต่ expand แล้ว)
  const hits = [];
  for (const t of terms) {
    if (!t) continue;
    let i = 0;
    for (;;) {
      const at = hay.indexOf(t, i);
      if (at === -1) break;
      hits.push([at, at + t.length]);
      i = at + 1;                      // +1 ไม่ใช่ +ความยาว — คำที่ซ้อนกันเองต้องเจอครบ
    }
  }
  if (!hits.length) return esc(display);
  hits.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const h of hits) {
    const last = merged[merged.length - 1];
    if (last && h[0] <= last[1]) last[1] = Math.max(last[1], h[1]);
    else merged.push([h[0], h[1]]);
  }
  let out = "", i = 0;
  for (const [a, b] of merged) {
    out += esc(display.slice(i, a)) + "<mark>" + esc(display.slice(a, b)) + "</mark>";
    i = b;
  }
  return out + esc(display.slice(i));
}

const fmtDate = (ts) => {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** การ์ดข่าว 1 ใบ — ใช้ร่วมทั้งรายการเรียงวันที่ และรายการในหมวด */
function itemHTML(r, terms) {
  const display = stripTail(r.t, OUTLET_NAMES, r.os);
  // 🖼 ป้ายรูปเล็ก — วาดเอง ไม่ยิงเน็ต (ดูเหตุผลที่ initials/hueOf)
  // 🖼 รูปเล็กขึ้นเฉพาะหน้าที่จัดหมวด (ตอนนี้คือหน้าปลาหมอคางดำ) — เจ้าของสั่งมาสำหรับหน้านั้น
  //    **หน้าคลังหลักจึงหน้าตาเหมือนเดิมเป๊ะ** ไม่ได้ถูกเปลี่ยนไปด้วยโดยไม่ได้สั่ง
  //    อยากให้หน้าหลักมีด้วยเมื่อไหร่ = ถอดเงื่อนไขบรรทัดล่างนี้ทิ้งบรรทัดเดียว
  //    🚫 ไม่ติดไอคอนหมวดบนการ์ด — หัวข้อของกล่องบอกหมวดอยู่แล้ว ติดซ้ำทุกใบคือของรก
  const site = siteOf(r.u) || r.o;
  const thumb = !TOPICS ? "" : `<span class="thumb" style="--h:${hueOf(site)}" title="${esc(site)}" aria-hidden="true"
      >${esc(initials(site))}</span>`;
  return `<article class="item">
      ${thumb}
      <div class="body">
        <div class="top">
          <a class="t" href="${esc(r.u)}" target="_blank" rel="noopener">${highlight(display, terms)}</a>
          <button class="copy" type="button" data-u="${esc(r.u)}" title="คัดลอกลิงก์">คัดลอก</button>
        </div>
        <div class="meta">
          <span class="o">${esc(r.o)}</span>
          <span class="sep">·</span>
          <span class="dt">${fmtDate(r.ts)}</span>
          ${r.c.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}
        </div>
      </div>
    </article>`;
}

/* 🗂 ---------- แท็บหมวด ----------
 *
 * เจ้าของสั่ง 18 ก.ย. 2026: **"การค้นให้ค้นแยกแต่ละหมวด … เอาเป็น tab แยกในหน้าเดียว"**
 * (ชั่งกับ "แยกเป็นหน้าจริง" แล้ว — แยกหน้าต้องโหลดใหม่ทุกครั้งที่กด เพราะหน้า HTML
 *  ตั้ง `no-cache` ไว้ · และการเพิ่มหมวดจะกลายเป็นงานสร้างไฟล์ใหม่ + แถบแท็บ + เลขเวอร์ชัน
 *  แทนที่จะแก้ `topics-blackchin.config.js` ไฟล์เดียวเหมือนตอนนี้)
 *
 * ของเดิมเป็น accordion กางทีละหมวดในหน้าเดียว — ถอดออกแล้วทั้งชุด
 * (`openG` / `shownG` / ปุ่ม 2 ช่อง เปิด-ปิดทั้งหมด) เพราะแท็บทำหน้าที่เดียวกันแต่ชัดกว่า
 *
 * ⚠️ **เลขบนแท็บต้องมาจาก `gCounts` (= `scoped`) เสมอ** ดูเหตุผลที่ applyFilters
 * 🚫 **ห้ามซ่อนแท็บที่เหลือ 0** — แท็บที่เป็น 0 คือสิ่งเดียวที่บอกว่า "ค้นแล้วหมวดนี้ไม่มี"
 *    ซ่อนเมื่อไหร่ แท็บจะกระโดดสลับตำแหน่งทุกครั้งที่พิมพ์ กดผิดหมวดแน่นอน
 */
function renderTabs() {
  const box = $("#gtabs");
  if (!box) return;
  const total = scoped.length;
  const tab = (id, icon, name, n, on) =>
    `<button class="gtab${on ? " on" : ""}${n ? "" : " zero"}" type="button" role="tab"
             aria-selected="${on ? "true" : "false"}" data-gt="${esc(id)}">
       <span class="gtico" aria-hidden="true">${icon}</span><span class="gtname">${esc(name)}</span><span class="gtn">${n.toLocaleString("th-TH")}</span>
     </button>`;
  box.innerHTML =
    tab("", "🗂", "ทั้งหมด", total, !state.g) +
    TOPICS.map((t, i) => tab(t.id, t.icon, t.name, gCounts[i] || 0, state.g === t.id)).join("");

  // 📱 จอแคบแท็บเลื่อนซ้ายขวา — แท็บที่เลือกอยู่อาจอยู่นอกจอหลังกดจากลิงก์/กด back
  //    ต้องเลื่อนมาให้เห็นเอง ไม่งั้นผู้ใช้ไม่รู้ว่าตัวเองอยู่หมวดไหน
  const on = box.querySelector(".gtab.on");
  if (on) {
    const l = on.offsetLeft, r = l + on.offsetWidth;
    if (l < box.scrollLeft || r > box.scrollLeft + box.clientWidth) {
      box.scrollTo({ left: Math.max(0, l - 16), behavior: "instant" in window ? "instant" : "auto" });
    }
  }
}

/** ชื่อหมวดที่เปิดอยู่ (เอาไว้พูดกับผู้ใช้) — ไม่ได้เปิดหมวดไหน = คืน null */
function currentTopic() {
  if (!TOPICS || !state.g) return null;
  return TOPICS.find((t) => t.id === state.g) || null;
}

function renderList() {
  const box = $("#list");

  // ⏳ **กำลังค้นอยู่ = ต้องขึ้นไอคอนหมุน ไม่ใช่ค้างผลของคำค้นเก่า** (เจ้าของสั่ง 26 ส.ค. 2026)
  //    ของเดิมแถบตีความมีไอคอนหมุนอยู่ก็จริง แต่รายการข้างล่างยังเป็นผลของคำถามก่อนหน้า
  //    ผู้ใช้กดถามคำใหม่แล้วเห็นข่าวชุดเดิม = เข้าใจว่านี่คือคำตอบของคำถามใหม่
  //    (กฎเดียวกับข้อ 5b ของแดชบอร์ด: เปิดหน้ามาต้องขึ้นไอคอนหมุน ไม่ใช่ข่าวเก่า)
  if (judgeBusy) {
    box.innerHTML = `<div class="empty"><span class="loading"><span class="spin"></span>กำลังค้น…</span></div>`;
    $("#more").innerHTML = "";
    return;
  }
  // ⚠️ โหมดผ่อนการสะกด **ห้ามไฮไลต์** — ตัวที่ใช้เทียบสั้นกว่าพาดหัวจริง
  //    ตำแหน่งที่เจอจึงเอามาตัดชิ้นจากพาดหัวไม่ได้ (จะได้พาดหัวเลื่อนตำแหน่งทั้งบรรทัด)
  const terms = looseMode ? [] : parseTerms(state.q);

  if (!filtered.length) {
    /* 🔎 **ค้นแล้วไม่เจอ "ในหมวดที่เปิดอยู่" ต้องบอกด้วยว่าหมวดอื่นมีไหม**
     *
     * เป็นกับดักที่มากับการค้นแยกรายหมวดโดยตรง: ยืนอยู่หมวด 🐠 ปลาสวยงาม (17 ใบ)
     * พิมพ์ "ศาล" แล้วได้ 0 — ถ้าบอกแค่ "ไม่เจอ" ผู้ใช้จะสรุปว่า **ทั้งคลังไม่มี**
     * ทั้งที่จริงมีอยู่ 57 ใบในอีกหมวด
     * 🚫 **ห้ามถอดปุ่ม "ค้นทุกหมวด" ออก** — เป็นทางเดียวที่พาผู้ใช้ไปเจอของที่มีอยู่จริง
     */
    const topic = currentTopic();
    if (topic && (state.q || state.judge) && scoped.length) {
      box.innerHTML = `<div class="empty">
          <b>${topic.icon} ไม่เจอ${state.q ? `คำว่า “${esc(state.q)}” ` : "ข่าวที่ตรงกับที่ค้น "}ใน ${esc(topic.name)}</b>
          หมวดอื่นรวมกันมี <b>${scoped.length.toLocaleString("th-TH")}</b> ใบที่ตรงกับที่ค้น
          <div><button class="btn" type="button" data-gt="">🗂 ค้นทุกหมวด</button></div>
        </div>`;
      $("#more").innerHTML = "";
      return;
    }
    // ⚠️ 3 กรณีนี้ต้องพูดคนละแบบ — บอกผิดกรณี = ผู้ใช้ไปนั่งแก้ของที่ไม่ได้ตั้งไว้
    //    🚫 ห้ามบอกให้ "ลดตัวกรอง" ตอนที่ยังไม่ได้ตั้งตัวกรองอะไรเลย (ข้อห้ามของหน้านี้)
    box.innerHTML = hasBoxFilter()
      ? `<div class="empty"><b>ไม่พบข่าวที่ตรงกับที่กรองไว้</b>ลองลดตัวกรองลง หรือขยายช่วงวันที่
           <div><button class="btn" type="button" data-clear>ล้างตัวกรองทั้งหมด</button></div></div>`
      : state.q || state.judge
        ? `<div class="empty"><b>ไม่มีข่าวที่ตรงกับที่ค้นในคลังนี้</b>${
             state.q ? `ไม่เจอคำว่า “${esc(state.q)}” ในพาดหัวข่าวใบไหนเลย` : "เงื่อนไขที่ใช้คัดไม่เหลือข่าวเลยสักใบ"
           }<div><button class="btn" type="button" data-clearq>ล้างคำค้น</button></div></div>`
        : `<div class="empty"><b>ยังไม่มีข้อมูล</b>ยังไม่ได้สร้างไฟล์คลังข่าว — รัน <code>node tools/build-archives.mjs</code> ก่อน</div>`;
    $("#more").innerHTML = "";
    return;
  }

  const slice = filtered.slice(0, state.shown);
  box.innerHTML = slice.map((r) => itemHTML(r, terms)).join("");

  const left = filtered.length - slice.length;
  const older = pendingYears();
  let more = "";
  if (left > 0) {
    more = `<button class="btn" type="button" data-more>โหลดเพิ่ม (เหลืออีก ${left.toLocaleString("th-TH")})</button>`;
  } else if (older.length) {
    // ไม่มีผลลัพธ์เหลือแล้ว แต่ยังมีปีเก่าที่ยังไม่ได้โหลด — บอกให้รู้ ไม่ใช่เงียบ
    more = `<button class="btn" type="button" data-year="${older[0]}">ค้นในปี ${older[0]} ด้วย</button>`;
  }
  $("#more").innerHTML = more;
}

// ---------- กล่องตัวกรอง (พับได้) ----------
// 🚫 **ไม่จำสถานะเปิด/ปิด — เปิดหน้ามาต้องพับไว้เสมอ** (เจ้าของสั่ง 28 ส.ค. 2026:
//    "ตอนนี้ filter เปิดค้างไว้ ให้ collapse ทุกครั้งที่เปิดใหม่ ไม่ต้องจำตรงนี้")
//    ของเดิมจำไว้ใน localStorage (`archivesFiltersOpen`) กางค้างครั้งเดียวแล้วค้างตลอดไป
// ✅ ที่ไม่เสียอะไรเพราะ **ยังบอกอยู่เสมอว่ากรองอะไรไว้** ทั้งบรรทัดสรุป (#fsum "กรองอยู่: …")
//    และเลขบนปุ่มตัวกรอง — พับแล้วจึงไม่มีทางงงว่าทำไมข่าวน้อยลง (ดู filterSummary)
const FOPEN_KEY = "archivesFiltersOpen"; // เหลือไว้ล้างค่าเก่าที่ค้างในเครื่องผู้ใช้เท่านั้น
function setFiltersOpen(open) {
  $("#filters").hidden = !open;
  $("#ftoggle").setAttribute("aria-expanded", open ? "true" : "false");
  $("#ftoggle .fcaret").textContent = open ? "▾" : "▸";
}

// สรุปว่ากรองอะไรไว้ — ต้องอ่านรู้เรื่องโดยไม่ต้องกางกล่อง
// คืน [จำนวนตัวกรองที่เปิดอยู่, ข้อความสรุป]
function filterSummary() {
  const bits = [];
  if (state.cats.size) bits.push([...state.cats].join(", "));
  if (state.srcs.size) {
    bits.push(state.srcs.size === 1 ? [...state.srcs][0] : `สำนักข่าว ${state.srcs.size} เจ้า`);
  }
  if (state.from || state.to) {
    const th = (d) => d ? d.split("-").reverse().join("/") : "";
    bits.push(state.from && state.to ? `${th(state.from)}–${th(state.to)}`
      : state.from ? `ตั้งแต่ ${th(state.from)}` : `ถึง ${th(state.to)}`);
  }
  return [bits.length, bits.length ? "กรองอยู่: " + bits.join(" · ") : ""];
}

function renderCount() {
  const n = filtered.length;
  const loadedYears = [...loaded].sort((a, b) => b - a);
  const older = pendingYears();
  // 🗂 เปิดหมวดไหนอยู่ต้องเขียนไว้ในบรรทัดนับด้วย — แท็บที่ระบายสีอยู่บอกได้ก็จริง
  //    แต่พอเลื่อนลงไปอ่านข่าว แถบแท็บเลื่อนตามไปแต่บรรทัดนี้อยู่ใกล้รายการกว่า
  const topic = currentTopic();
  $("#count").innerHTML =
    `พบ ${n.toLocaleString("th-TH")} ข่าว` +
    (topic ? `<span class="dim"> ใน ${topic.icon} ${esc(topic.name)}</span>` : "") +
    `<span class="dim"> · ค้นในปี ${loadedYears.join(", ")}${older.length ? ` (ยังไม่รวม ${older.join(", ")})` : ""}</span>`;
  $("#clearall").hidden = !hasFilter();
  $("#qclear").hidden = !state.q;

  // ⚠️ ตัวกรองพับอยู่เป็นปกติ ถ้าไม่บอกว่ากรองอะไรไว้ จะเห็นเลขน้อยลงแล้วไม่รู้ว่าเพราะอะไร
  const [nFilters, sum] = filterSummary();
  $("#fbadge").hidden = !nFilters;
  $("#fbadge").textContent = nFilters || "";
  $("#ftoggle").classList.toggle("on", !!nFilters);
  $("#fsum").hidden = !sum;
  $("#fsum").textContent = sum;
  $("#loadednote").textContent = older.length
    ? `เลือกวันที่ย้อนไปถึงปีไหน ระบบจะโหลดปีนั้นให้เอง (ยังไม่โหลด: ${older.join(", ")})`
    : "โหลดครบทุกปีแล้ว";
}

// ตัวเลือกของตัวกรองสร้างจากข้อมูลจริงที่โหลดมา ไม่ได้เขียนรายการไว้ตายตัว
function renderFacets() {
  // หมวด — นับจากผลลัพธ์ที่ผ่านตัวกรองอื่นแล้ว จะได้รู้ว่ากดแล้วเหลือเท่าไร
  const catCount = new Map();
  for (const r of rows) for (const c of r.c) catCount.set(c, (catCount.get(c) || 0) + 1);
  const cats = [...catCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "th"));
  $("#cats").innerHTML = cats.map(([c, n]) =>
    `<button class="ch${state.cats.has(c) ? " on" : ""}" type="button" data-cat="${esc(c)}">${esc(c)}<span class="n">${n.toLocaleString("th-TH")}</span></button>`
  ).join("") || `<span class="srcempty">ยังไม่มีหมวด</span>`;

  // สำนักข่าว — เรียงข่าวมากไปน้อย + มีเลขกำกับ + พิมพ์ค้นในรายการได้
  const srcCount = new Map();
  for (const r of rows) srcCount.set(r.o, (srcCount.get(r.o) || 0) + 1);
  const term = norm(state.srcq);
  const srcs = [...srcCount.entries()]
    .filter(([s]) => !term || norm(s).includes(term))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "th"));
  $("#srcs").innerHTML = srcs.length
    ? srcs.map(([s, n]) =>
        `<button class="src${state.srcs.has(s) ? " on" : ""}" type="button" data-src="${esc(s)}">
           <span class="box">${state.srcs.has(s) ? "✓" : ""}</span>
           <span class="nm">${esc(s)}</span><span class="n">${n.toLocaleString("th-TH")}</span>
         </button>`).join("")
    : `<span class="srcempty">ไม่พบสำนักข่าวที่ตรงกับ "${esc(state.srcq)}"</span>`;
}

function render() {
  applyFilters();
  renderFacets();
  renderCount();
  renderTabs();
  renderList();
  renderAskBar();
}

// ---------- เหตุการณ์ ----------
// 🤖 **โหมดเดียว: ค้นด้วย AI** (เจ้าของสั่ง 26 ส.ค. 2026 — "ให้มีโหมดเดียวพอ")
//
// ⚠️ **พิมพ์แล้วไม่ค้นสดอีกแล้ว** — ของเดิมพิมพ์ปุ๊บกรองปั๊บ ซึ่งเอามาใช้กับ AI ไม่ได้
//    (จะยิงถามทุกตัวอักษร) ถ้าปล่อยให้พิมพ์แล้วกรองสดต่อไปพร้อมกับมีปุ่มถาม
//    = กลายเป็น 2 โหมดที่ผู้ใช้แยกไม่ออกว่าตอนไหนได้อะไร ซึ่งคือปัญหาที่เจ้าของสั่งให้เลิก
// ตอนนี้: พิมพ์ → กด Enter หรือปุ่มถาม → ค่อยได้ผล
function onSearchInput() {
  $("#qclear").hidden = !$("#q").value;   // อัปเดตแค่ปุ่มล้าง ไม่ได้ค้นอะไร
}

async function onDateChange() {
  state.from = $("#from").value;
  state.to = $("#to").value;
  state.shown = PAGE;
  syncURL(true);
  // ผู้ใช้ขยายช่วงวันที่ย้อนไปถึงปีที่ยังไม่โหลด → โหลดปีนั้นเพิ่มให้เอง
  const need = yearsNeededByDate();
  if (need.length) await withBusy(() => Promise.all(need.map(loadYear)));
  render();
}

async function withBusy(fn) {
  if (busy) return;
  busy = true;
  $("#more").innerHTML = `<span class="loading"><span class="spin"></span>กำลังโหลดข้อมูลปีเก่า…</span>`;
  try { await fn(); } catch (e) { $("#more").innerHTML = `<span class="loading">โหลดไม่สำเร็จ: ${esc(e.message)}</span>`; }
  busy = false;
}

function bind() {
  $("#ftoggle").addEventListener("click", () => setFiltersOpen($("#filters").hidden));
  $("#q").addEventListener("input", onSearchInput);
  $("#qclear").addEventListener("click", () => {
    $("#q").value = ""; state.q = ""; clearAsk(); state.shown = PAGE;
    syncURL(true); render(); $("#q").focus();
  });
  $("#from").addEventListener("change", onDateChange);
  $("#to").addEventListener("change", onDateChange);
  $("#srcq").addEventListener("input", (e) => { state.srcq = e.target.value; renderFacets(); });

  $("#cats").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    const c = b.dataset.cat;
    state.cats.has(c) ? state.cats.delete(c) : state.cats.add(c);
    state.shown = PAGE; syncURL(true); render();
  });
  $("#srcs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-src]");
    if (!b) return;
    const s = b.dataset.src;
    state.srcs.has(s) ? state.srcs.delete(s) : state.srcs.add(s);
    state.shown = PAGE; syncURL(true); render();
  });

  const clearAll = () => {
    state.q = ""; state.from = ""; state.to = "";
    state.cats.clear(); state.srcs.clear(); state.shown = PAGE;
    clearAsk();
    $("#q").value = ""; $("#from").value = ""; $("#to").value = "";
    syncURL(true); render();
  };
  $("#clearall").addEventListener("click", clearAll);

  // 🤖 ถามเป็นประโยค — กดปุ่ม หรือกด Enter ในช่องค้นหา
  // ⭐ Enter = ทางหลักของหน้านี้ (มีโหมดเดียว) · ปุ่มถามทำอย่างเดียวกัน
  //    ⚠️ ยังต้องกดเองอยู่ดี **ห้ามยิงถามระหว่างพิมพ์** — จะกลายเป็นถาม AI ทุกตัวอักษร
  $("#modeseg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (b) setMode(b.dataset.mode);
  });
  $("#askbtn").addEventListener("click", runAsk);
  $("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runAsk(); } });
  // "เลิกคัด" = ทิ้งเงื่อนไข แต่ **เก็บคำค้นไว้** — ผู้ใช้มักอยากเห็นของทั้งหมดในเรื่องเดิม
  $("#askbar").addEventListener("click", (e) => {
    if (!e.target.closest("[data-askclear]")) return;
    clearAsk(); state.shown = PAGE; syncURL(true); render();
  });

  $("#more").addEventListener("click", async (e) => {
    if (e.target.closest("[data-more]")) { state.shown += PAGE; renderList(); return; }
    const y = e.target.closest("[data-year]");
    if (y) { await withBusy(() => loadYear(+y.dataset.year)); render(); }
  });
  /* 🗂 เปลี่ยนหมวด — ใช้ร่วมทั้งแท็บด้านบน และปุ่ม "ค้นทุกหมวด" ในกล่องที่ไม่เจอผล
   *    ⚠️ `push` เพราะเป็นการกดของผู้ใช้ กด back แล้วต้องกลับหมวดเดิมได้ (กฎเดียวกับชิพตัวกรอง)
   *    ⚠️ ต้องรีเซ็ต `state.shown` ด้วย ไม่งั้นสลับไปหมวดเล็กแล้วยังค้างที่ "โหลดมาแล้ว N ใบ" ของหมวดก่อน
   */
  const gotoTopic = (id) => {
    if (state.g === id) return;
    state.g = id;
    state.shown = PAGE;
    syncURL(true);
    render();
  };
  $("#gtabs")?.addEventListener("click", (e) => {
    const t = e.target.closest("[data-gt]");
    if (t) gotoTopic(t.dataset.gt);
  });

  $("#list").addEventListener("click", (e) => {
    const gt = e.target.closest("[data-gt]");
    if (gt) { gotoTopic(gt.dataset.gt); return; }
    if (e.target.closest("[data-clear]")) { clearAll(); return; }
    // ล้างเฉพาะคำค้น — ตัวกรองในกล่องไม่ได้ตั้งไว้อยู่แล้วตอนที่ปุ่มนี้โผล่
    if (e.target.closest("[data-clearq]")) {
      state.q = ""; clearAsk(); $("#q").value = "";
      state.shown = PAGE; syncURL(true); render();
      return;
    }
    const b = e.target.closest("[data-u]");
    if (!b) return;
    navigator.clipboard?.writeText(b.dataset.u).then(() => {
      b.textContent = "คัดลอกแล้ว ✓"; b.classList.add("done");
      setTimeout(() => { b.textContent = "คัดลอก"; b.classList.remove("done"); }, 1400);
    }).catch(() => { b.textContent = "คัดลอกไม่ได้"; setTimeout(() => (b.textContent = "คัดลอก"), 1400); });
  });

  // เลื่อนถึงท้ายรายการ = โหลดเพิ่มเอง (ปุ่มยังอยู่สำหรับคนที่ไม่ได้เลื่อน)
  addEventListener("scroll", () => {
    if (state.shown >= filtered.length) return;
    if (scrollY + innerHeight > document.body.scrollHeight - 400) { state.shown += PAGE; renderList(); }
  }, { passive: true });

  // ปุ่ม back/forward ของเบราว์เซอร์ต้องย้อนสถานะการค้นหาได้จริง
  addEventListener("popstate", async () => {
    readQuery();
    fillInputs();
    const need = yearsNeededByDate();
    if (need.length) await withBusy(() => Promise.all(need.map(loadYear)));
    render();
  });
}

// ⚠️ ช่องพิมพ์เก็บ **คำถามของผู้ใช้** ไม่ใช่คำค้นที่ AI แยกออกมา
//    เขียนทับด้วยคำค้น (เช่นถาม "หาข่าวด้านดีของปลาหมอคางดำ" แล้วช่องกลายเป็น "ปลาหมอคางดำ")
//    ผู้ใช้จะงงว่าคำถามหายไปไหน · คำค้นที่แยกได้ไปแสดงในแถบตีความแทน
function fillInputs() {
  $("#q").value = state.ask || state.q;
  $("#from").value = state.from;
  $("#to").value = state.to;
}

/* 🗂 สร้างแถบแท็บหมวดด้วย JS ไม่ได้เขียนไว้ใน HTML
 *
 * 🚫 **จงใจไม่เขียนลง `blackchin.html`** — แถบแท็บ "ทั้งหมด / ปลาหมอคางดำ" เขียนซ้ำอยู่
 *    2 ไฟล์แล้ว และเป็นกับดักที่โปรเจกต์นี้เจอซ้ำที่สุด (แก้ที่หนึ่งลืมอีกที่)
 *    แถบนี้เนื้อในมาจาก `topics-blackchin.config.js` ล้วนๆ จึงไม่มีเหตุผลให้ไปเขียนใน HTML อีก
 *    · ผลพลอยได้: **หน้าคลังหลักไม่ต้องแก้อะไรเลย** (ไม่มี TOPICS = ไม่มีแถบ)
 *
 * 🧲 วางไว้ **ใน `.sticky`** ท้ายสุด (ใต้กล่องตัวกรอง ติดกับรายการ) — หมวดกลายเป็นตัวนำทางหลัก
 *    ของหน้านี้แล้ว ถ้าปล่อยให้เลื่อนหายไปกับรายการ จะสลับหมวดทีต้องเลื่อนขึ้นบนสุดก่อนทุกครั้ง
 *    (เหตุผลเดียวกับที่เจ้าของสั่งย้ายกล่องตัวกรองเข้ามาใน `.sticky` เมื่อ 28 ส.ค. 2026)
 */
function mountTabs() {
  if (!TOPICS || $("#gtabs")) return;
  const el = document.createElement("div");
  el.id = "gtabs";
  el.className = "gtabs";
  el.setAttribute("role", "tablist");
  el.setAttribute("aria-label", "หมวดข่าว");
  (document.querySelector(".sticky") || document.body).append(el);
}

// ---------- เริ่มทำงาน ----------
(async function init() {
  mountTabs();
  bind();
  readQuery();
  applyMode();
  fillInputs();
  // 🚫 เปิดหน้ามา **พับไว้เสมอ** ไม่ว่าจะเคยกางไว้ หรือมีตัวกรองติดมากับ URL ก็ตาม
  //    (เจ้าของสั่ง 28 ส.ค. 2026) · ที่กรองอยู่ยังอ่านได้จากบรรทัดสรุปกับเลขบนปุ่ม
  setFiltersOpen(false);
  try { localStorage.removeItem(FOPEN_KEY); } catch {}   // ล้างค่าเก่าที่ค้างอยู่ในเครื่อง
  $("#list").innerHTML = `<div class="loading"><span class="spin"></span>กำลังโหลดคลังข่าว…</div>`;
  try {
    INDEX = await fetchArchiveJSON(`${DATA_DIR}/index.json`);
    const years = (INDEX.years || []).map((x) => x.y).sort((a, b) => b - a);
    if (years.length) await loadYear(years[0]);        // ปีล่าสุดก่อน
    const need = yearsNeededByDate();                  // ถ้า URL มีช่วงวันที่ย้อนไปถึงปีเก่า โหลดตาม
    if (need.length) await Promise.all(need.map(loadYear));
  } catch (e) {
    /* ⚠️ 3 เรื่องนี้ต้องพูดคนละแบบ — บอกผิดเรื่องคือพาไปแก้ผิดที่
       🚫 ห้ามเอาข้อความ error ดิบมาโชว์ (ศัพท์ในโค้ด ไม่ใช่ภาษาที่ใช้คุย) */
    const code = e instanceof ArchiveError ? e.code : "missing";
    const box =
      code === "signed-out"
        ? `<b>ต้องเข้าสู่ระบบก่อนถึงจะดูหน้านี้ได้</b>เซสชันหมดอายุแล้ว กดปุ่มข้างล่างเพื่อเข้าสู่ระบบใหม่
             <div><button class="btn" type="button" data-relogin>เข้าสู่ระบบใหม่</button></div>`
        : code === "offline"
          ? `<b>โหลดข้อมูลไม่ได้</b>ต่อกับเซิร์ฟเวอร์ไม่ได้ — ลองเช็คอินเทอร์เน็ตแล้วโหลดหน้าใหม่
               <div><button class="btn" type="button" data-relogin>โหลดหน้าใหม่</button></div>`
          // ⚠️ บอกโฟลเดอร์ของหน้านี้ด้วย — blackchin อ่านคนละโฟลเดอร์กับหน้าหลัก
          //    ถ้าบอกคำสั่งกลางๆ คนอ่านจะไปสร้างผิดที่แล้วงงว่าทำไมยังไม่ขึ้น
          : `<b>ยังไม่มีข้อมูลในคลังนี้</b>ยังไม่ได้สร้างไฟล์ใน <code>archives/${esc(DATA_DIR)}/</code>
               <br />สร้างด้วย <code>node tools/build-archives.mjs --csv &lt;ไฟล์.csv&gt; --out ${esc(DATA_DIR)}</code>`;
    $("#list").innerHTML = `<div class="empty">${box}</div>`;
    // Access พาไปหน้าล็อกอินด้วย redirect ของทั้งหน้าเท่านั้น — ต้อง reload ห้ามยิง fetch ซ้ำ
    $("#list").querySelector("[data-relogin]")?.addEventListener("click", () => location.reload());
    $("#count").textContent = "";
    return;
  }
  render();
})();
