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
  stream: "หน้าดูหนัง/ซีรีส์ ไม่ใช่ข่าว",
  "by-owner": "เจ้าของกด ⚑ สั่งตัดเอง",
  datapage: "หน้าข้อมูลค่าฝุ่น/อากาศ ไม่ใช่ข่าว",
  daily: "รายงานประจำวัน",
  gallery: "แกลเลอรีรูป",
  pr: "ข่าวประชาสัมพันธ์ราชการ",
  roundup: "สรุปข่าวรวมหลายเรื่อง",
  "old-content": "ข่าวเก่าถูกดันขึ้นใหม่",
  "false-cp": "ชื่อคล้ายเครือ CP แต่ไม่ใช่",
  "ai-no-cp": "เปิดอ่านเนื้อข่าวไม่ได้ AI อ่านพาดหัวแล้วบอกว่าไม่ใช่ข่าวของเครือ",
  "ไม่มีชื่อเครือ CP ในพาดหัว": "อ่านเนื้อข่าวแล้วไม่มีชื่อเครือ CP",
  "ไม่มีชื่อเครือ CP ในพาดหัว/สรุป": "ไม่มีชื่อเครือ CP ในพาดหัว/สรุป", // ของเก่าที่ยังค้างใน KV
  "ไม่อยู่ในพาดหัว/เนื้อ": "คำที่ match ไม่ได้อยู่ในพาดหัวหรือเนื้อข่าว",
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
