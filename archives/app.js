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

// ---------- ตัดหางพาดหัว ----------
// ฟีดหลายเจ้าต่อท้ายชื่อคอลัมน์/สำนักไว้ท้ายพาดหัว
//   "… - เทคโนโลยีชาวบ้าน - ข่าวสด"  ·  "… | RYT9"
// ⚠️ ตัดเฉพาะ "ตอนแสดงผล" — ตัวที่ใช้ค้นหายังเป็นพาดหัวต้นฉบับ
//    ไม่งั้นค้นคำที่อยู่ในหางแล้วจะไม่เจอ ทั้งที่ในชีตมีอยู่จริง
const TAIL_SEP = /\s+[-|–—·]\s+/;
function stripTail(title, outletNames) {
  let t = String(title || "").trim();
  for (let i = 0; i < 3; i++) {           // ตัดได้ไม่เกิน 3 ท่อน กันตัดจนพาดหัวหาย
    const parts = t.split(TAIL_SEP);
    if (parts.length < 2) break;
    const last = parts[parts.length - 1].trim();
    if (!last || last.length > 28) break;  // ท่อนยาว = น่าจะเป็นเนื้อพาดหัวจริง ไม่ใช่ชื่อสำนัก
    if (!outletNames.has(norm(last))) break;
    const rest = parts.slice(0, -1).join(" - ").trim();
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
    out.push({
      t: title,                      // พาดหัวต้นฉบับ (ใช้ค้นหา · ยังมีหางสำนักข่าวอยู่)
      n: title.toLowerCase(),        // ตัวที่ใช้ค้น — ความยาวเท่ากับ t เสมอ
      u: r[1],
      ts: r[2] * 1000,
      o,
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
  const q = norm(state.q);
  const from = state.from ? Date.parse(state.from + "T00:00:00") : null;
  const to = state.to ? Date.parse(state.to + "T23:59:59") : null;
  const cats = state.cats, srcs = state.srcs;

  filtered = rows.filter((r) => {
    if (q && !r.n.includes(q)) return false;          // ← substring ตรงๆ (ดูหมายเหตุบนสุด)
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
function highlight(display, q) {
  if (!q) return esc(display);
  const hay = display.toLowerCase();   // ยาวเท่า display เสมอ (ยุบช่องว่างไปตั้งแต่ expand แล้ว)
  const needle = q;
  let out = "", i = 0;
  for (;;) {
    const at = hay.indexOf(needle, i);
    if (at === -1) break;
    out += esc(display.slice(i, at)) + "<mark>" + esc(display.slice(at, at + needle.length)) + "</mark>";
    i = at + needle.length;
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
  const q = norm(state.q);

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
    const display = stripTail(r.t, OUTLET_NAMES);
    return `<article class="item">
      <div class="top">
        <a class="t" href="${esc(r.u)}" target="_blank" rel="noopener">${highlight(display, q)}</a>
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
