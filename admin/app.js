// หน้าจัดการ (admin) — 🚩 คำแนะนำตัดข่าว ที่ย้ายมาจากปุ่มลอยบนแดชบอร์ด
// ตัวงานจริงอยู่ใน /flags.js ทั้งหมด หน้านี้แค่บอกว่า "กางไว้ตรงไหน" กับ "ของแดชบอร์ดไหน"
//
// ⚠️ ➕ เพิ่ม keyword ไม่ได้อยู่หน้านี้ — เจ้าของสั่งให้อยู่บนแดชบอร์ดที่เดียว (ใช้ตอนอ่านข่าว)
// จึงไม่ส่ง mountKw เข้าไป flags.js จะไม่สร้างกล่องนั้นเลย
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
}

const start = initialScope();
paintTabs(start);

Flags.init({
  ui: "admin",
  scope: start,
  alerts: SCOPES[start].alerts,
  mountCut: $("#admCut"),
});

$("#scopes").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-scope]");
  if (b) show(b.dataset.scope);
});
