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
const DEBOUNCE = 200;   // หน่วงการพิมพ์

const state = {
  q: "", from: "", to: "",
  cats: new Set(), srcs: new Set(),
  shown: PAGE,
  srcq: "",             // คำค้นในรายชื่อสำนักข่าว (ไม่เข้า URL — เป็นแค่ตัวช่วยหา)
};

let INDEX = null;         // data/index.json
const loaded = new Set(); // ปีที่โหลดแล้ว
let rows = [];            // ทุกแถวที่โหลดมา
let filtered = [];
let busy = false;

// ---------- normalize ----------
// ยุบช่องว่างซ้ำ + ตัดหัวท้าย + lowercase (มีผลกับอังกฤษเท่านั้น ไทยไม่มีตัวพิมพ์)
// ⚠️ ห้ามตัดอักขระไทยหรือวรรณยุกต์ทิ้ง — "กุ้ง" กับ "กุง" คนละคำ
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

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
  const terms = parseTerms(state.q);
  const from = state.from ? Date.parse(state.from + "T00:00:00") : null;
  const to = state.to ? Date.parse(state.to + "T23:59:59") : null;
  const cats = state.cats, srcs = state.srcs;

  filtered = rows.filter((r) => {
    // ← substring ตรงๆ (ดูหมายเหตุบนสุด) · หลายคำ = ต้องมีครบทุกคำ อยู่ตรงไหนก็ได้
    if (terms.length && !terms.every((t) => r.n.includes(t))) return false;
    if (from !== null && r.ts < from) return false;
    if (to !== null && r.ts > to) return false;
    if (srcs.size && !srcs.has(r.o)) return false;
    if (cats.size) {                                   // หมวดเป็น "อันใดอันหนึ่ง" (OR)
      let hit = false;
      for (const c of r.c) if (cats.has(c)) { hit = true; break; }
      if (!hit) return false;
    }
    return true;
  });
}

const hasFilter = () => !!(state.q || state.from || state.to || state.cats.size || state.srcs.size);

// ---------- URL ----------
// เก็บสถานะทั้งหมดไว้ใน query string — ก๊อป URL ส่งต่อแล้วเปิดได้ผลเดิม
function toQuery() {
  const p = new URLSearchParams();
  if (state.q) p.set("q", state.q);
  if (state.from) p.set("from", state.from);
  if (state.to) p.set("to", state.to);
  if (state.cats.size) p.set("cat", [...state.cats].join(","));
  if (state.srcs.size) p.set("src", [...state.srcs].join(","));
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
  const terms = parseTerms(state.q);

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

function renderCount() {
  const n = filtered.length;
  const loadedYears = [...loaded].sort((a, b) => b - a);
  const older = pendingYears();
  $("#count").innerHTML =
    `พบ ${n.toLocaleString("th-TH")} ข่าว` +
    `<span class="dim"> · ค้นในปี ${loadedYears.join(", ")}${older.length ? ` (ยังไม่รวม ${older.join(", ")})` : ""}</span>`;
  $("#clearall").hidden = !hasFilter();
  $("#qclear").hidden = !state.q;
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
}

// ---------- เหตุการณ์ ----------
let tmr = 0;
function onSearchInput() {
  clearTimeout(tmr);
  tmr = setTimeout(() => {
    state.q = $("#q").value;
    state.shown = PAGE;
    syncURL(false);   // พิมพ์ = replace ไม่ให้ back เดินทีละตัวอักษร
    render();
  }, DEBOUNCE);
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
  $("#q").addEventListener("input", onSearchInput);
  $("#qclear").addEventListener("click", () => {
    $("#q").value = ""; state.q = ""; state.shown = PAGE; syncURL(true); render(); $("#q").focus();
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
    $("#q").value = ""; $("#from").value = ""; $("#to").value = "";
    syncURL(true); render();
  };
  $("#clearall").addEventListener("click", clearAll);

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

function fillInputs() {
  $("#q").value = state.q;
  $("#from").value = state.from;
  $("#to").value = state.to;
}

// ---------- เริ่มทำงาน ----------
(async function init() {
  bind();
  readQuery();
  fillInputs();
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
