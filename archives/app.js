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
    out.push({
      t: title,                      // พาดหัวต้นฉบับ (ใช้ค้นหา · ยังมีหางสำนักข่าวอยู่)
      n: title.toLowerCase(),        // ตัวที่ใช้ค้น — ความยาวเท่ากับ t เสมอ
      ln: looseNorm(title),          // ตัวสำรองตอนผ่อนการสะกด (ความยาวไม่เท่า t → ไฮไลต์ไม่ได้)
      u: r[1],
      ts: r[2] * 1000,
      o,
      os: slug(rawOutlet),           // ไว้เทียบว่าหางพาดหัวเป็นชื่อเว็บของตัวเองไหม
      c: (r[4] || []).map((i) => pack.c[i]).filter(Boolean),
    });
  }
  return out;
}

// ---------- โหลดปี ----------
async function loadYear(y) {
  if (loaded.has(y)) return;
  loaded.add(y);
  const res = await fetch(`data/${y}.json`);
  if (!res.ok) throw new Error(`โหลดข้อมูลปี ${y} ไม่สำเร็จ`);
  const pack = await res.json();
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
    if (!filtered.length && !relaxNote) relaxNote = `ไม่มีข่าวที่มีคำว่า “${question}” อยู่ในคลังเลย`;
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
  if (!filtered.length && plan.ai && state.q) {
    const wide = await fetchPlan(question, true);
    const wideTerms = wide && Array.isArray(wide.terms) ? wide.terms.filter(Boolean) : [];
    if (wideTerms.length) {
      const before = state.q;
      state.q = wideTerms.map(quoteTerm).join(" ");
      applyFilters();
      if (filtered.length) relaxNote = `ไม่เจอด้วยคำว่า “${before.replace(/"/g, "")}” — ลองคำที่กว้างขึ้นให้แล้ว`;
      else { state.q = before; applyFilters(); }
    }
  }
  // ⚠️ ยังไม่เจอจริงๆ = **บอกตรงๆ ว่าไม่มีในคลัง** ไม่ใช่ปล่อยให้เจอข้อความ "ลองลดตัวกรองลง"
  //    ซึ่งผู้ใช้ไม่ได้ตั้งตัวกรองอะไรไว้เลย อ่านแล้วงงว่าจะให้ลดอะไร
  if (!filtered.length && !relaxNote) {
    // ⚠️ คำถามเรื่องช่วงเวลาล้วนๆ ไม่มีคำค้นเลย — ห้ามขึ้นว่า 'ไม่มีข่าวที่มีคำว่า ""'
    relaxNote = state.q
      ? `ไม่มีข่าวที่มีคำว่า “${state.q.replace(/"/g, "")}” อยู่ในคลังเลย`
      : `ไม่มีข่าวในช่วงวันที่ที่ถามมาเลย`;
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
function relaxIfEmpty() {
  if (filtered.length) return "";

  // 1) ช่วงวันที่ — AI เดาเดือนพลาดเจอบ่อยที่สุด และตัดออกแล้วผู้ใช้ยังได้ของที่ถามอยู่
  if (state.from || state.to) {
    const f = state.from, t = state.to;
    state.from = ""; state.to = "";
    applyFilters();
    if (filtered.length) return `ไม่เจอข่าวในช่วง ${f || "…"} ถึง ${t || "…"} เลย — ตัดช่วงวันที่ออกให้แล้ว`;
    state.from = f; state.to = t;   // ไม่ช่วย → คืนค่าเดิม
  }

  // 2) ผ่อนการสะกด — ทำก่อนตัดคำ เพราะยังได้คำที่ผู้ใช้ถามครบทุกคำ (เสียน้อยกว่า)
  looseMode = true;
  applyFilters();
  if (filtered.length) return "สะกดไม่ตรงกับในข่าวเป๊ะ — จับคำที่ใกล้เคียงให้แล้ว (ไม่ได้ไฮไลต์คำในโหมดนี้)";
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
      if (filtered.length && (!best || filtered.length > best.n)) best = { i, n: filtered.length, trial };
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
    // ⚠️ 2 กรณีนี้ต้องพูดคนละแบบ — "ยังไม่ได้กรอง" กับ "กรองแล้วไม่พบ"
    box.innerHTML = hasFilter()
      ? `<div class="empty"><b>ไม่พบข่าวที่ตรงกับที่กรองไว้</b>ลองลดตัวกรองลง หรือขยายช่วงวันที่
           <div><button class="btn" type="button" data-clear>ล้างตัวกรองทั้งหมด</button></div></div>`
      : `<div class="empty"><b>ยังไม่มีข้อมูล</b>ยังไม่ได้สร้างไฟล์คลังข่าว — รัน <code>node tools/build-archives.mjs</code> ก่อน</div>`;
    $("#more").innerHTML = "";
    return;
  }

  const slice = filtered.slice(0, state.shown);
  box.innerHTML = slice.map((r) => {
    const display = stripTail(r.t, OUTLET_NAMES, r.os);
    return `<article class="item">
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
    </article>`;
  }).join("");

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
// ⚠️ จำสถานะไว้ใน localStorage ไม่ใช่ใน DOM อย่างเดียว — ไม่งั้นกดกางไว้แล้ว
//    พอเปลี่ยนหน้า/รีเฟรช ต้องมากางใหม่ทุกครั้ง
const FOPEN_KEY = "archivesFiltersOpen";
function setFiltersOpen(open) {
  $("#filters").hidden = !open;
  $("#ftoggle").setAttribute("aria-expanded", open ? "true" : "false");
  $("#ftoggle .fcaret").textContent = open ? "▾" : "▸";
  try { localStorage.setItem(FOPEN_KEY, open ? "1" : "0"); } catch {}
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
  $("#count").innerHTML =
    `พบ ${n.toLocaleString("th-TH")} ข่าว` +
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
  $("#list").addEventListener("click", (e) => {
    if (e.target.closest("[data-clear]")) { clearAll(); return; }
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

// ---------- เริ่มทำงาน ----------
(async function init() {
  bind();
  readQuery();
  applyMode();
  fillInputs();
  // เปิด URL ที่มีตัวกรองติดมาแล้ว ให้กางกล่องให้เลย — ไม่งั้นเห็นผลถูกกรองอยู่แต่ไม่รู้ว่ากรองด้วยอะไร
  const preset = !!(state.from || state.to || state.cats.size || state.srcs.size);
  let saved = false;
  try { saved = localStorage.getItem(FOPEN_KEY) === "1"; } catch {}
  setFiltersOpen(preset || saved);
  $("#list").innerHTML = `<div class="loading"><span class="spin"></span>กำลังโหลดคลังข่าว…</div>`;
  try {
    INDEX = await fetch("data/index.json").then((r) => {
      if (!r.ok) throw new Error("ยังไม่มีไฟล์คลังข่าว");
      return r.json();
    });
    const years = (INDEX.years || []).map((x) => x.y).sort((a, b) => b - a);
    if (years.length) await loadYear(years[0]);        // ปีล่าสุดก่อน
    const need = yearsNeededByDate();                  // ถ้า URL มีช่วงวันที่ย้อนไปถึงปีเก่า โหลดตาม
    if (need.length) await Promise.all(need.map(loadYear));
  } catch (e) {
    $("#list").innerHTML = `<div class="empty"><b>ยังไม่มีข้อมูลคลังข่าว</b>${esc(e.message)} — รัน <code>node tools/build-archives.mjs --mock</code> เพื่อสร้างข้อมูลจำลอง</div>`;
    $("#count").textContent = "";
    return;
  }
  render();
})();
