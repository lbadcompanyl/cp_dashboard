// หน้าจัดการ (admin) — 🚩 คำแนะนำตัดข่าว ที่ย้ายมาจากปุ่มลอยบนแดชบอร์ด
// ตัวงานจริงอยู่ใน /flags.js ทั้งหมด หน้านี้แค่บอกว่า "กางไว้ตรงไหน" กับ "ของแดชบอร์ดไหน"
//
// ⚠️ กล่อง keyword ที่นี่กับบนแดชบอร์ด "คนละครึ่ง" กันโดยตั้งใจ (flags.js ดูจากโหมด admin)
//   แดชบอร์ด = ช่องพิมพ์เก็บคำ อย่างเดียว
//   ที่นี่    = เอาคำที่เก็บไว้มาประกอบเป็น query + คัดลอก + ลิงก์ไป Google Alerts + ล้างทั้งหมด
//
// ⚠️ ทำไมถึงเป็น /admin/ ไม่ใช่ back.cp-dashboard-680.pages.dev
// Cloudflare Pages ให้ subdomain ของ *.pages.dev ได้ชั้นเดียว และผูกกับ "ชื่อ branch" เท่านั้น
// (dev.cp-dashboard-680.pages.dev = branch ชื่อ dev) — จะตั้ง back.dev.<project>.pages.dev ไม่ได้เลย
// ทั้งชื่อและใบรับรอง https ไม่รองรับ ถ้าอยากได้โดเมนแยกจริงต้องใช้โดเมนของตัวเอง (Custom domain)

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ชื่อคอลัมน์ Alert ของแต่ละแดชบอร์ด — หน้านี้ไม่มี .panel ให้ flags.js อ่านชื่อเอง จึงต้องบอกตรงๆ
// ⚠️ แก้ชื่อคอลัมน์ใน index.html ของแดชบอร์ดไหน ต้องมาแก้ที่นี่ด้วย ไม่งั้นชื่อบนหน้า admin จะค้างของเก่า
const SCOPES = {
  pr: {
    label: "PR",
    alerts: [
      { source: "alert1", label: "🔔 CP" },
      { source: "alert2", label: "🔔 หัวข้อที่จับตามอง" },
    ],
  },
  ir: {
    label: "IR",
    alerts: [
      { source: "alert1", label: "🔔 CP / ซีพี" },
      { source: "alert2", label: "🐷 ปศุสัตว์ · อาหาร · การค้า" },
    ],
  },
  // /issue/ ไม่มี /ir หรือ /trend ใน path → flags.js ให้ scope เป็น "root" (ดู deriveScope)
  root: {
    label: "Issue",
    alerts: [
      { source: "alert1", label: "🔔 CP" },
      { source: "alert2", label: "🔔 หัวข้อที่จับตามอง" },
    ],
  },
};

// ---- ✂️ ข่าวที่ระบบตัดทิ้ง ----
// ตัวเลข/รายการมาจาก response ของ API อยู่แล้ว (alertVerify.dropped + swept.dropped)
// หน้านี้แค่เอามาแสดง — ไม่ได้ยิงอะไรเพิ่ม ไม่แตะ KV
const API = { pr: "/api/trend/feeds", root: "/api/trend/feeds", ir: "/api/ir/feeds" };

// รหัสเหตุผลจาก noiseReason()/verifyAlertItems() → ภาษาคน
const WHY_TH = {
  job: "ประกาศหางาน",
  property: "อสังหา / ให้เช่า",
  vendor: "หน้าขายสินค้า-บริการ",
  shopping: "ร้านค้าออนไลน์",
  "paged-list": "หน้ารวมรายการแบบแบ่งหน้า (Page 6 of 6) ไม่ใช่ข่าว",
  stream: "หน้าดูหนัง/ซีรีส์ ไม่ใช่ข่าว",
  "by-owner": "เจ้าของกด ⚑ สั่งตัดเอง",
  datapage: "หน้าข้อมูลค่าฝุ่น/อากาศ ไม่ใช่ข่าว",
  dustpage: "หน้ารายงานค่าฝุ่นของเทศบาล/อบต. ไม่ใช่ข่าว",
  daily: "รายงานประจำวัน",
  gallery: "แกลเลอรีรูป",
  "archive-page": "หน้ารวมบทความของเว็บ (Archives) ไม่ใช่ข่าว",
  "event-page": "หน้างานอีเวนต์/นิทรรศการของเว็บหน่วยงาน ไม่ใช่ข่าว",
  pr: "ข่าวประชาสัมพันธ์ราชการ",
  roundup: "สรุปข่าวรวมหลายเรื่อง",
  "old-content": "ข่าวเก่าถูกดันขึ้นใหม่",
  "false-cp": "ชื่อคล้ายเครือ CP แต่ไม่ใช่",
  "ai-no-cp": "เปิดอ่านเนื้อข่าวไม่ได้ AI อ่านพาดหัวแล้วบอกว่าไม่ใช่ข่าวของเครือ",
  "ai-weak-cp": "ชื่อเครือโผล่กลางคำอื่น (เช่น เอ็ม-ซีพี-ไอ) AI อ่านแล้วบอกว่าไม่ใช่ข่าวของเครือ",
  "ไม่มีชื่อเครือ CP ในพาดหัว": "อ่านเนื้อข่าวแล้วไม่มีชื่อเครือ CP",
  "ไม่มีชื่อเครือ CP ในพาดหัว/สรุป": "ไม่มีชื่อเครือ CP ในพาดหัว/สรุป", // ของเก่าที่ยังค้างใน KV
  "ไม่อยู่ในพาดหัว/เนื้อ": "คำที่ match ไม่ได้อยู่ในพาดหัวหรือเนื้อข่าว",
  // ⚠️ ไม่ได้มาจาก noiseReason() แต่มาจาก pruneStaleMerged() — ก็ต้องแปลเหมือนกัน
  pruned: "เคยดึงมาจากคอลัมน์ข่าว แต่ตอนนี้ไม่ตรงคำค้นแล้ว",
};
const DROP_DAYS = 3; // โชว์เฉพาะข่าว 3 วันล่าสุดในรายการที่ถูกตัด (เจ้าของสั่ง — ของเก่าทำให้รก)
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function renderDropped(scope, data) {
  const box = $("#admDrop");
  if (!box) return;
  const cols = {};
  for (const a of SCOPES[scope].alerts) cols[a.source] = a.label;

  // ⚠️ ข่าวใบเดียวโผล่ได้ 2 ครั้ง — ด่านตอนตรวจ (alertVerify) กับด่านกวาดของเก่า (swept)
  // ตัดคนละรอบแต่เป็นข่าวใบเดียวกัน ถ้าไม่ยุบจะเห็นบรรทัดซ้ำติดกันแล้วนึกว่าข่าวซ้ำ
  const seen = new Set();
  // ⚠️ เอาแค่ข่าว 3 วันล่าสุด (เจ้าของสั่ง 14 ส.ค. 2026) — ข่าวเก่ายังถูกตัดอยู่เหมือนเดิม
  // แค่ไม่ต้องโชว์ให้รก · ใบที่ไม่มีวันที่ติดมา "เก็บไว้" ไม่ซ่อน (ซ่อนของที่ตัดสินไม่ได้ = หายเงียบ)
  const cutoff = Date.now() - DROP_DAYS * 86400000;
  let hidden = 0;
  const rows = [
    ...((data?.alertVerify?.dropped) || []),
    ...((data?.swept?.dropped) || []),
  ].filter((d) => {
    if (!d || !d.title) return false;
    const k = (d.link || d.title) + "|" + (d.why || "");
    if (seen.has(k)) return false;
    seen.add(k);
    const t = d.at ? new Date(d.at).getTime() : NaN;
    if (!isNaN(t) && t < cutoff) { hidden++; return false; }
    return true;
  });

  if (!rows.length) {
    box.innerHTML = `<p class="lead">ไม่มีข่าวถูกตัดทิ้งใน ${DROP_DAYS} วันล่าสุด` +
      (hidden ? ` <span class="drophid">(เก่ากว่านั้นอีก ${hidden} ข่าว — ถูกตัดไปแล้ว ไม่ได้แสดง)</span>` : "") + `</p>`;
    return;
  }

  // จัดกลุ่มตามเหตุผล เรียงกลุ่มที่ตัดเยอะสุดขึ้นก่อน
  const byWhy = new Map();
  for (const d of rows) {
    const k = d.why || "ไม่ระบุ";
    if (!byWhy.has(k)) byWhy.set(k, []);
    byWhy.get(k).push(d);
  }
  const groups = [...byWhy.entries()].sort((a, b) => b[1].length - a[1].length);

  box.innerHTML =
    `<p class="dropsum">ตัดทิ้ง <b>${rows.length}</b> ข่าว · ${groups.length} เหตุผล <span class="dropage">(${DROP_DAYS} วันล่าสุด${hidden ? ` · เก่ากว่านั้นอีก ${hidden}` : ""})</span></p>` +
    groups.map(([why, list]) => `
      <details class="dropgrp">
        <summary><span class="dropwhy">${esc(WHY_TH[why] || why)}</span><span class="dropn">${list.length}</span></summary>
        <ul class="droplist">${list.map((d) => `
          <li>
            <span class="dropcol">${esc(cols[d.src] || d.src || "")}</span>
            ${d.link ? `<a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.title)}</a>` : `<span>${esc(d.title)}</span>`}
            ${d.link ? `<button type="button" class="dropback" data-link="${esc(d.link)}" data-title="${esc(d.title)}" data-why="${esc(why)}">↩ เอากลับ</button>` : ""}
          </li>`).join("")}</ul>
      </details>`).join("");
}

// กดคืนข่าวที่ไม่ควรโดนตัด — บันทึกลิงก์ไว้ที่เซิร์ฟเวอร์ แล้วรอบถัดไปจะไม่ตัดใบนี้อีก
// ⚠️ ต้องรอ cache ของ feed หมดอายุก่อนถึงจะเห็นข่าวกลับมาบนแดชบอร์ด ไม่ใช่ทันที
async function sendBack(btn) {
  const { link, title, why } = btn.dataset;
  btn.disabled = true;
  btn.textContent = "กำลังบันทึก…";
  try {
    const r = await fetch("/api/allow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ link, title, why, on: true }),
      // ⚠️ ฝั่งเซิร์ฟเวอร์จะถอดลิงก์นี้ออกจากรายการ "สั่งตัด" ให้เอง — อยู่สองฝั่งพร้อมกันไม่ได้
    }).then((x) => x.json());
    if (r && r.ok) {
      btn.textContent = "✓ เอากลับแล้ว";
      btn.classList.add("done");
      btn.closest("li")?.classList.add("back");
      loadReturned(); // อัปเดตสรุปทันที จะได้เห็นว่ากฎไหนโดนกดคืนบ่อย
    } else {
      btn.textContent = "↩ ลองใหม่";
      btn.disabled = false;
    }
  } catch {
    btn.textContent = "↩ ลองใหม่";
    btn.disabled = false;
  }
}

// ---- ↩ สรุปว่ากฎไหนถูกกดเอากลับบ่อย ----
// ⚠️ ตัวที่ตัดข่าวเป็น "กฎที่เขียนไว้ตายตัว" ไม่ใช่ AI — กดเอากลับจึงไม่ได้สอนอะไรมันเลย
// สิ่งที่ทำได้จริงคือรวมสถิติว่ากฎไหนตัดพลาดบ่อย แล้วเอาไปแก้กฎที่ต้นเหตุ
// (กดเอากลับ = แก้ทีละใบ · แก้กฎ = แก้ทั้งประเภท)
const OVER_BROAD = 3; // ถูกกดเอากลับกี่ครั้งถึงถือว่ากฎกว้างเกินไป

async function loadReturned() {
  const box = $("#admBack");
  if (!box) return;
  try {
    const data = await fetch("/api/allow").then((r) => r.json());
    const items = Object.values(data.items || {});
    if (!items.length) {
      box.innerHTML = `<p class="lead">ยังไม่มีข่าวที่กดเอากลับ</p>`;
      return;
    }
    const byWhy = new Map();
    for (const it of items) {
      const k = it.why || "ไม่ระบุ";
      byWhy.set(k, (byWhy.get(k) || 0) + 1);
    }
    const rows = [...byWhy.entries()].sort((a, b) => b[1] - a[1]);
    const loud = rows.filter(([, n]) => n >= OVER_BROAD);
    box.innerHTML =
      `<p class="dropsum">เอากลับไปแล้ว <b>${items.length}</b> ข่าว</p>` +
      `<ul class="backlist">${rows.map(([why, n]) => `
        <li${n >= OVER_BROAD ? ' class="loud"' : ""}>
          <span class="backwhy">${esc(WHY_TH[why] || why)}</span>
          <span class="dropn">${n}</span>
        </li>`).join("")}</ul>` +
      (loud.length
        ? `<p class="backhint">⚠️ กฎ “${esc(WHY_TH[loud[0][0]] || loud[0][0])}” ถูกกดเอากลับ ${loud[0][1]} ครั้งแล้ว —
             แปลว่ากฎนี้น่าจะกว้างเกินไป <b>บอกให้แก้ตัวกรองที่ต้นเหตุดีกว่ามากดคืนทีละใบ</b></p>`
        : `<p class="backhint">กดเอากลับ = แก้เฉพาะข่าวใบนั้น ถ้ากฎเดิมตัดพลาดซ้ำๆ ให้บอกไปแก้ตัวกรองแทน</p>`);
  } catch {
    box.innerHTML = `<p class="lead">ดึงข้อมูลไม่สำเร็จ</p>`;
  }
}

async function loadDropped(scope) {
  const box = $("#admDrop");
  if (!box) return;
  box.innerHTML = `<p class="lead"><span class="spin"></span>กรุณารอซักครู่</p>`;
  try {
    const data = await fetch(API[scope]).then((r) => r.json());
    if ($("#scopes button.on")?.dataset.scope !== scope) return; // ผู้ใช้สลับแท็บระหว่างรอ — ทิ้งผลเก่า
    renderDropped(scope, data);
    $("#admDrop").onclick = (e) => {
      const b = e.target.closest(".dropback");
      if (b && !b.disabled) sendBack(b);
    };
  } catch {
    box.innerHTML = `<p class="lead">ดึงข้อมูลไม่สำเร็จ — ลองรีเฟรชหน้าอีกครั้ง</p>`;
  }
}

const LS_LAST = "admScope"; // จำว่าดูอันไหนค้างไว้ กลับมาเปิดอันเดิม
const validScope = (s) => (Object.prototype.hasOwnProperty.call(SCOPES, s) ? s : "pr");

function initialScope() {
  const q = new URLSearchParams(location.search).get("scope");
  if (q) return validScope(q);
  try { return validScope(localStorage.getItem(LS_LAST)); } catch { return "pr"; }
}

function paintTabs(scope) {
  $$("#scopes button").forEach((b) => b.classList.toggle("on", b.dataset.scope === scope));
}

function show(scope) {
  scope = validScope(scope);
  paintTabs(scope);
  try { localStorage.setItem(LS_LAST, scope); } catch {}
  Flags.setScope(scope, SCOPES[scope].alerts);
  loadDropped(scope);
}

const start = initialScope();
paintTabs(start);
loadDropped(start);
loadReturned();

Flags.init({
  ui: "admin",
  scope: start,
  alerts: SCOPES[start].alerts,
  mountCut: $("#admCut"),
  mountKw: $("#admKw"),
});

$("#scopes").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-scope]");
  if (b) show(b.dataset.scope);
});

/* ── 📋 บันทึกระบบ ─────────────────────────────────────────────────────
 * อ่านจาก /api/log (อ่านอย่างเดียว) แล้ววาดเป็นรายการ 1 บรรทัดต่อ 1 รอบ build
 *
 * ⚠️ **ไม่ผูกกับแดชบอร์ดที่เลือกในแถบ .scopes** — log ครอบทุกแดชบอร์ด
 *    จึงซ่อนแถบเลือกแดชบอร์ดตอนอยู่แท็บนี้ ไม่งั้นดูเหมือนกรองได้ทั้งที่ไม่ได้กรอง
 * ⚠️ **โหลดตอนกดเข้าแท็บเท่านั้น** ไม่ได้โหลดตอนเปิดหน้า — คนส่วนใหญ่มาที่นี่
 *    เพื่อจัดการข่าว ไม่ได้มาดู log จะได้ไม่เสีย KV read ฟรีๆ ทุกครั้งที่เปิดหน้า
 */
const WAIT_LOG = '<span class="spin"></span>กำลังโหลดบันทึก…';
let logLoaded = false;

// แปลงรหัสเหตุผลเป็นภาษาคน — ใช้ตาราง WHY_TH ชุดเดียวกับรายการข่าวที่ถูกตัด
// ⚠️ เพิ่มเหตุผลใหม่ใน noiseReason() ต้องเติม WHY_TH ไม่งั้นที่นี่ก็ขึ้นเป็นรหัสดิบเหมือนกัน
const logWhy = (w) => (typeof WHY_TH === "object" && WHY_TH[w]) || w;

// ชื่อจุดที่บันทึก — แปลเป็นภาษาคน ไม่ใช่ path ของโค้ด
// ⚠️ **เพิ่ม startLog("...") ที่ endpoint ไหน ต้องมาเติมชื่อไทยที่นี่ด้วย**
//    ไม่งั้นเจ้าของจะเห็นเป็น path ดิบ — เทสต์ `syslog.mjs` มีด่านจับ
const SRC_TH = {
  "trend/feeds": "ข่าว PR",
  "ir/feeds": "ข่าว IR",
  "trend/trending": "Google Trends",
  "trend/xtrends": "เทรนด์ X",
  "trend/yttrends": "คลิป YouTube",
  "trend/kwcheck": "เช็ค Trend",
  "trend/related": "คำที่เกี่ยวข้อง",
  "trend/trendnews": "ข่าวของเทรนด์",
  "trend/archive": "คลังข่าว (ชีตมาดึง)",
  "archives/ask": "คลังข่าว (ถามเป็นประโยค)",
  "sd/news": "ข่าว SD",
  "api/allow": "ปุ่ม ↩/⚑",
  "api/flags": "ปุ่ม ⚑/🗂 บนการ์ด",
  "issue/state": "ค่าที่ตั้งไว้ (Issue)",
  "sd/state": "ค่าที่ตั้งไว้ (SD)",
  "followers": "ยอดผู้ติดตามโซเชียล",
};
const logSrcTH = (s) => SRC_TH[s] || s || "?";

// ลำดับตัวเลข pipeline — **ตายตัวทุกแถว** ต่อให้ค่าเป็น 0 ก็ยังแสดง
// เจ้าของทัก (21 ส.ค. 2026): ถ้าสลับตำแหน่งไปมาตามที่มีค่า จะกวาดตาเทียบระหว่างแถวไม่ได้เลย
const PIPE = [
  ["news", "News"],
  ["alert1", "CP"],
  ["alert2", "จับตามอง"],
  ["items", "รายการ"],
  ["trends", "เทรนด์"],
  ["articles", "บทความ"],
  ["pruned", "ตัดออก"],
];

// ตัดทิ้งเกินกี่ % ของที่ดึงมา ถึงถือว่า "ผิดสังเกต" แม้จะไม่มี error
const DROP_ALERT = 0.4;

// ⚠️ 3 ระดับ ไม่ใช่ 2 — จุดเขียวทุกแถวแปลว่าไม่มีทางรู้ว่ารอบไหนพัง (เจ้าของทัก 21 ส.ค. 2026)
//   fail = ล้มเหลว · warn = ทำงานจบแต่ผิดสังเกต · ok = ปกติ
function logLevel(r) {
  if (!r.ok) return { k: "fail", label: "ล้มเหลว" };
  const why = [];
  if ((r.upstream || []).length) why.push("ต้นทางล่ม " + r.upstream.length);
  const got = Object.entries(r.counts || {}).filter(([k]) => k !== "pruned");
  const total = got.reduce((a, [, n]) => a + n, 0);
  if (got.length && total === 0) why.push("ดึงมาได้ 0 รายการ");
  const cut = Object.values(r.drops || {}).reduce((a, n) => a + n, 0);
  if (total > 0 && cut / (total + cut) > DROP_ALERT) why.push(`ตัดทิ้ง ${Math.round((cut / (total + cut)) * 100)}%`);
  if (r.note && !r.upstream?.length) why.push(r.note);
  return why.length ? { k: "warn", label: "ผิดสังเกต", why } : { k: "ok", label: "ปกติ" };
}

const fmtWhen = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return iso || "-";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// ⚠️ 0 ms ไม่มีทางเป็นเวลาจริงของงาน build — แสดง "–" แทน อย่าโกหกว่าเร็ว
// (เวลาที่วัดได้จริงคือเครื่องมือจับ "รอบไหนช้าผิดปกติ = มีอะไรค้าง")
const fmtMs = (ms) => (!Number.isFinite(ms) || ms <= 0 ? "–" : ms >= 1000 ? (ms / 1000).toFixed(1) + " วิ" : ms + " ms");

// ส่วนต่างจากรอบก่อนของ "ช่องเดียวกัน" — ยอดสะสมล้วนๆ ต้องนั่งลบเลขเองถึงจะเห็นความผิดปกติ
function withDelta(list) {
  const prev = new Map();
  // ไล่จากเก่าไปใหม่ เพื่อให้แต่ละแถวรู้ค่าของรอบก่อนหน้าตัวเอง
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i];
    const before = prev.get(r.src);
    r._d = {};
    for (const [k, n] of Object.entries(r.counts || {})) {
      if (before && Number.isFinite(before[k])) r._d[k] = n - before[k];
    }
    prev.set(r.src, { ...(r.counts || {}) });
  }
  return list;
}

// ⚠️ ใส่วงเล็บเสมอ — "309-1" อ่านเป็นเลขเดียวได้ ต้องเป็น "309 (-1)"
const dTag = (d) => (d == null ? "" : d === 0
  ? `<i class="dz">(±0)</i>`
  : `<i class="${d > 0 ? "dup" : "ddn"}">(${d > 0 ? "+" : ""}${d})</i>`);

function renderLog(items) {
  const box = $("#admLog");
  if (!items.length) {
    // ⚠️ ว่างมีได้ 2 ความหมาย ต้องบอกให้ชัดว่าอันไหน ไม่งั้นเข้าใจว่าระบบพัง
    box.innerHTML = `<p class="logempty"><b>ไม่มีรายการที่ตรงกับตัวกรอง</b><br>
      ถ้ายังไม่เคยมีบันทึกเลย: ที่นี่บันทึก <b>ตอนดึงข่าวรอบใหม่</b> (ชั่วโมงละครั้งต่อแดชบอร์ด)
      กับ <b>ตอนมีอะไรผิดปกติ</b> เท่านั้น — ช่องที่ทำงานราบรื่นจะเงียบ
      เพราะโควตาการเขียนมีจำกัดและใช้ร่วมกันทั้งเว็บ<br>
      อยากเห็นเดี๋ยวนี้ ให้กด <code>?rebuild</code> ที่ท้าย URL ของ API เพื่อสั่งดึงรอบใหม่</p>`;
    return;
  }
  box.innerHTML = `<ul class="loglist">` + items.map((r, i) => {
    const lv = logLevel(r);
    const cuts = Object.entries(r.drops || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);

    // ── บรรทัดบน: ตัวเลข pipeline (ตายตัว เทียบระหว่างแถวได้) ──
    const nums = PIPE.filter(([k]) => r.counts && r.counts[k] != null)
      .map(([k, label]) => `<span class="logchip num"><b>${esc(label)}</b> ${r.counts[k]}${dTag(r._d && r._d[k])}</span>`).join("");
    const extra = [
      r.ai ? `<span class="logchip num">🤖 AI ${r.ai}</span>` : "",
      r.kvWrites ? `<span class="logchip num">💾 เขียน ${r.kvWrites}</span>` : "",
    ].filter(Boolean).join("");

    // ── บรรทัดล่าง: เหตุผลการคัด (เฉพาะที่ > 0) + ต้นทางที่ล่ม ──
    const cutChips = cuts.map(([w, n]) =>
      `<button type="button" class="logchip cut" data-drill="${i}" data-why="${esc(w)}">✂ ${esc(logWhy(w))} ${n}</button>`).join("");
    const upChips = (r.upstream || []).map((u) =>
      `<span class="logchip err" title="${esc(u.err || "")}">⚠ ${esc(u.host)}</span>`).join("");

    // ── รายชิ้น (กดแล้วกาง) ──
    const list = r.items || [];
    let drill = "";
    if (list.length) {
      const more = (r.dropped || list.length) - list.length;
      drill = `<div class="logdrill" id="drill${i}" hidden>
        <ul>${list.map((it) => `<li data-why="${esc(it.why)}">
          <span class="dwhy">${esc(logWhy(it.why))}</span>
          ${it.c ? `<span class="dcol">${esc(it.c === "alert1" ? "CP" : it.c === "alert2" ? "จับตามอง" : it.c)}</span>` : ""}
          ${it.u ? `<a href="${esc(it.u)}" target="_blank" rel="noopener">${esc(it.t || it.u)}</a>` : `<span>${esc(it.t)}</span>`}
        </li>`).join("")}</ul>
        ${more > 0 ? `<p class="dmore">แสดง ${list.length} จาก ${r.dropped} — ที่เหลือไม่ได้เก็บรายละเอียดไว้ (กันไม่ให้บันทึกโตเกินไป)</p>` : ""}
      </div>`;
    } else if (r.trimmed) {
      drill = `<div class="logdrill trimmed" id="drill${i}" hidden><p class="dmore">รอบนี้เก่าเกิน 30 วัน — เก็บไว้แต่ตัวเลขสรุป ไม่มีรายการข่าวให้กดดูแล้ว</p></div>`;
    }

    return `<li class="lv-${lv.k}">
      <div class="logtop">
        <span class="logdot" title="${esc(lv.label)}"></span>
        <span class="logsrc" title="${esc(r.src || "")}">${esc(logSrcTH(r.src))}</span>
        <span class="loglv ${lv.k}">${esc(lv.label)}</span>
        <span class="logtime">${esc(fmtWhen(r.at))}</span>
        <span class="logms">${esc(fmtMs(r.ms))}${r.cache ? " · " + esc(r.cache) : ""}${r.env && r.env !== "prod" ? " · " + esc(r.env) : ""}</span>
        ${(list.length || r.trimmed) ? `<button type="button" class="logmore" data-drill="${i}">ดูรายการ</button>` : ""}
      </div>
      ${nums || extra ? `<div class="logbody nums">${nums}${extra}</div>` : ""}
      ${cutChips || upChips ? `<div class="logbody whys">${cutChips}${upChips}</div>` : ""}
      ${lv.k !== "ok" && (r.note || lv.why) ? `<div class="lognote">${esc(r.note || (lv.why || []).join(" · "))}</div>` : ""}
      ${drill}
    </li>`;
  }).join("") + `</ul>`;
}

// ---- ตัวกรอง ----
// ⚠️ ดึงมาทั้งก้อนครั้งเดียวแล้วกรองในเบราว์เซอร์ ไม่ได้ยิง API ใหม่ทุกครั้งที่เปลี่ยนตัวกรอง
//    (ถ้ากรองที่เซิร์ฟเวอร์ การคำนวณ "ส่วนต่างจากรอบก่อน" จะผิด เพราะรอบก่อนถูกกรองทิ้งไป)
let LOG_ALL = [];

function applyLogFilters() {
  const src = $("#logSrc").value;
  const days = +$("#logDays").value || 0;
  const why = $("#logWhy").value;
  const q = $("#logQ").value.trim().toLowerCase();
  const cutoff = days ? Date.now() - days * 86400000 : 0;

  const out = LOG_ALL.filter((r) => {
    if (src && r.src !== src) return false;
    if (cutoff) { const t = Date.parse(r.at || ""); if (Number.isFinite(t) && t < cutoff) return false; }
    if (why && !(r.drops && r.drops[why] > 0)) return false;
    if (q) {
      const hay = [logSrcTH(r.src), r.src, r.note, ...(r.upstream || []).map((u) => u.host),
                   ...Object.keys(r.drops || {}).map(logWhy),
                   ...(r.items || []).map((it) => it.t)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const bad = out.filter((r) => logLevel(r).k === "fail").length;
  const warn = out.filter((r) => logLevel(r).k === "warn").length;
  $("#logMeta").innerHTML = `${out.length} รอบ` +
    (bad ? ` · <b class="mbad">ล้มเหลว ${bad}</b>` : "") +
    (warn ? ` · <b class="mwarn">ผิดสังเกต ${warn}</b>` : "") +
    (!bad && !warn ? " · ปกติทั้งหมด" : "");
  renderLog(out);
}

async function loadLog() {
  const box = $("#admLog");
  box.innerHTML = `<p class="logempty">${WAIT_LOG}</p>`;
  try {
    const j = await fetch("/api/log?limit=300").then((r) => r.json());
    LOG_ALL = withDelta(j.items || []);

    // ตัวเลือกในกล่องกรองสร้างจากของที่มีอยู่จริง ไม่ได้เขียนรายการไว้ตายตัว
    const fill = (sel, values, all, label) => {
      const keep = sel.value;
      sel.innerHTML = `<option value="">${all}</option>` +
        values.map((v) => `<option value="${esc(v)}">${esc(label(v))}</option>`).join("");
      sel.value = values.includes(keep) ? keep : "";
    };
    fill($("#logSrc"), [...new Set(LOG_ALL.map((x) => x.src).filter(Boolean))].sort(), "ทุกช่อง", logSrcTH);
    const whys = [...new Set(LOG_ALL.flatMap((x) => Object.keys(x.drops || {})))].sort();
    fill($("#logWhy"), whys, "ทุกเหตุผล", logWhy);

    applyLogFilters();
  } catch (e) {
    box.innerHTML = `<p class="logempty">โหลดบันทึกไม่สำเร็จ: ${esc(String(e.message || e))}</p>`;
  }
}

// กด "ดูรายการ" หรือกดที่ป้ายเหตุผล → กางรายชิ้น (กดที่ป้ายจะไฮไลต์เฉพาะเหตุผลนั้น)
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-drill]");
  if (!btn) return;
  const d = $("#drill" + btn.dataset.drill);
  if (!d) return;
  const why = btn.dataset.why || "";
  const open = d.hidden || d.dataset.why !== why;
  d.hidden = !open;
  d.dataset.why = open ? why : "";
  $$("li", d).forEach((li) => { li.hidden = open && why ? li.dataset.why !== why : false; });
});

function showPage(page) {
  const isLog = page === "log";
  $("#pgManage").hidden = isLog;
  $("#pgLog").hidden = !isLog;
  $("#scopes").hidden = isLog;   // log ครอบทุกแดชบอร์ด ไม่ใช่ของอันใดอันหนึ่ง
  $$("#ptabs button").forEach((b) => b.classList.toggle("on", b.dataset.page === page));
  if (isLog && !logLoaded) { logLoaded = true; loadLog(); }
}

$("#ptabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-page]");
  if (b) showPage(b.dataset.page);
});
$("#logReload").addEventListener("click", loadLog);
// ⚠️ เปลี่ยนตัวกรอง = กรองของที่โหลดมาแล้ว ไม่ยิง API ใหม่ (กดโหลดใหม่ถึงจะยิง)
for (const id of ["#logSrc", "#logDays", "#logWhy"]) $(id).addEventListener("change", applyLogFilters);
$("#logQ").addEventListener("input", applyLogFilters);
