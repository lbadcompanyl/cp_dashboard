/**
 * app.js — หน้าอ่าน/ตรวจไฟล์ export ของ Zocial Eye ก่อนบันทึก
 * ----------------------------------------------------------
 * 🔒 ทุกอย่างทำในเบราว์เซอร์ ไม่มีการส่งไฟล์ออกไปไหน (ยังไม่มี endpoint ให้ส่งด้วยซ้ำ)
 * 🚫 ไม่ใส่ /installprompt.js (แถบชวนติดตั้งอยู่ที่หน้าแรกหน้าเดียว) · ไม่มีการ์ดบน landing
 *
 * ทำไมต้องมีหน้า preview: §7.3 ของ ZOCIAL-HANDOFF.md — ตอนนั้นยังไม่รู้ว่าเวลาในไฟล์เป็นเวลาไทยหรือ UTC
 * ✅ ตอบแล้ว 3 ก.ย. 2026 = **เวลาไทย** แต่ยังคงช่องให้เลือกไว้ เผื่อ Zocial เปลี่ยนรูปแบบวันหลัง
 * และเพื่อให้ผู้ใช้ "เห็นเอง" ว่าแถวแรกจะถูกบันทึกเป็นวันไหน ไม่ต้องเชื่อเราลอยๆ
 */
import * as Z from "./zocial-lib.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const TZ_KEY = "zocialTz";

let RAW = null;   // { name, headers, rows }
let OPTS = { tz: readTz(), campaign: "", headerMap: null };

function readTz() { try { return Z.TZ_MODES[localStorage.getItem(TZ_KEY)] ? localStorage.getItem(TZ_KEY) : "th"; } catch { return "th"; } }

/* ── รับไฟล์ ─────────────────────────────────────────────────────────── */
const drop = $("drop"), file = $("file");
drop.addEventListener("click", () => file.click());
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
file.addEventListener("change", () => file.files[0] && load(file.files[0]));
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("on"); }));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("on"); }));
drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) load(f); });

async function load(f) {
  // ⚠️ ต้องขึ้นไอคอนหมุน "ทันที" และล้างผลของไฟล์ก่อนหน้าทิ้ง
  //    ไม่งั้นผู้ใช้อ่านผลของไฟล์เก่าอยู่โดยไม่รู้ตัว (กฎข้อ 5b ของฟีเจอร์มาตรฐาน)
  $("out").hidden = true; $("out").innerHTML = "";
  $("err").hidden = true;
  $("busy").hidden = false;
  try {
    const { headers, rows } = await window.XlsxRead.readTable(f);
    if (!rows.length) throw new Error("ไฟล์นี้ไม่มีข้อมูลสักแถว (หรืออ่านหัวตารางไม่เจอ)");
    RAW = { name: f.name, headers, rows };
    OPTS.campaign = Z.campaignFromFilename(f.name);
    OPTS.headerMap = null;                       // ให้จับคู่ใหม่ตามหัวตารางของไฟล์นี้
    render();
  } catch (e) {
    $("err").hidden = false;
    $("err").innerHTML = "อ่านไฟล์ไม่สำเร็จ — " + esc(e.message || e);
  } finally {
    $("busy").hidden = true;
  }
}

/* ── วาดผล ───────────────────────────────────────────────────────────── */
function render() {
  const p = Z.buildPreview(RAW.rows, RAW.headers, OPTS);
  OPTS.headerMap = p.header.map;
  const out = $("out");
  out.hidden = false;
  out.innerHTML = [
    p.ok ? "" : missingBox(p),
    fileBox(p),
    p.ok ? timeBox(p) : "",
    headerBox(p),
    p.ok ? kindBox(p) : "",
    p.ok ? daysBox(p) : "",
    p.ok ? peopleBox(p) : "",
    p.ok ? droppedBox(p) : "",
    p.ok ? sampleBox(p) : "",
    saveBox(p),
  ].join("");
  wire(p);
}

const missingBox = (p) => `<div class="note bad"><b>ยังอ่านไฟล์นี้ไม่ได้</b> — หาคอลัมน์ที่จำเป็นไม่เจอ:
  ${p.header.missing.map((k) => esc(labelOf(k))).join(" · ")}<br />
  เลือกคอลัมน์ให้ตรงในตาราง "คอลัมน์ที่จับคู่ได้" ข้างล่าง แล้วผลจะขึ้นเอง</div>`;

const labelOf = (k) => (Z.FIELDS.find((f) => f.key === k) || {}).label || k;

function fileBox(p) {
  return `<div class="card">
    <h2>ไฟล์นี้</h2>
    <div class="row">
      <div><div class="muted">แถวในไฟล์</div><div class="big">${p.counts.total.toLocaleString("th-TH")}</div></div>
      <div><div class="muted">จะบันทึก</div><div class="big">${p.counts.kept.toLocaleString("th-TH")}</div></div>
      <div><div class="muted">ตัดทิ้ง</div><div class="big">${p.counts.dropped.toLocaleString("th-TH")}</div></div>
      <div style="flex:1;min-width:220px">
        <label for="camp">ชื่อแคมเปญ (เดาจากชื่อไฟล์ แก้ได้)</label>
        <input id="camp" type="text" value="${esc(OPTS.campaign)}" style="width:100%" />
      </div>
    </div>
    <div class="muted" style="margin-top:8px">🚫 ชื่อไฟล์ไม่ถูกเก็บลงฐานข้อมูล — ชื่อไฟล์ที่ export ออกมามัก มี campaign id ของลูกค้าติดอยู่</div>
  </div>`;
}

function timeBox(p) {
  const f = p.first;
  const opts = Object.values(Z.TZ_MODES).map((t) =>
    `<option value="${t.key}"${OPTS.tz === t.key ? " selected" : ""}>${esc(t.label)}</option>`).join("");
  return `<div class="card">
    <h2>⏰ ตีความเวลาในไฟล์</h2>
    ${f ? `<div class="kv"><span class="muted">เวลาในไฟล์ แถวแรก</span><b>${esc(f.wall)}</b></div>
    <div class="kv"><span class="muted">จะบันทึกเป็นวันที่</span><b>${esc(f.date)}</b></div>
    <div class="kv"><span class="muted">เก็บจริงเป็น</span><span>${esc(f.iso)}</span></div>` : ""}
    <div class="row" style="margin-top:10px">
      <div><label for="tz">ตีความว่าเวลาในไฟล์เป็น</label><select id="tz">${opts}</select></div>
      ${f ? `<div><a class="btn" href="${esc(f.url)}" target="_blank" rel="noopener">เปิดโพสต์แถวแรก ↗</a></div>` : ""}
    </div>
    <div class="note" style="margin-bottom:0">
      ⚠️ <b>ยังไม่มีใครยืนยันว่าไฟล์ส่งเวลามาแบบไหน</b> — กด "เปิดโพสต์แถวแรก" แล้วเทียบเวลาที่เห็นบนเว็บจริง
      กับ "เวลาในไฟล์" ข้างบน · ถ้าตรงกัน = เลือก <b>เวลาไทย</b> ถูกแล้ว · ถ้าเว็บจริงช้ากว่า 7 ชั่วโมง = ต้องเลือก <b>UTC</b>
      <br />เลือกผิดแล้วโพสต์ช่วงหัวค่ำจะตกไปอยู่วันก่อนหน้าทั้งหมด
    </div>
  </div>`;
}

function headerBox(p) {
  const heads = ["<option value=\"\">— ไม่มี —</option>"].concat(
    RAW.headers.filter(Boolean).map((h) => `<option value="${esc(h)}">${esc(h)}</option>`));
  const rows = Z.FIELDS.map((f) => {
    const cur = p.header.map[f.key] || "";
    const sel = heads.join("").replace(`<option value="${esc(cur)}">`, `<option value="${esc(cur)}" selected>`);
    const need = f.required ? ' <span class="tag bad">จำเป็น</span>' : "";
    const guess = (p.header.guessed || []).includes(f.key) ? ' <span class="tag warn">เดามา</span>' : "";
    return `<tr><td>${esc(f.label)}${need}${guess}</td>
      <td><select data-field="${f.key}">${sel}</select></td></tr>`;
  }).join("");
  const unused = (p.header.unused || []).length
    ? `<div class="muted" style="margin-top:8px">คอลัมน์ในไฟล์ที่ไม่ได้ใช้: ${p.header.unused.map(esc).join(" · ")}</div>` : "";
  return `<div class="card"><h2>คอลัมน์ที่จับคู่ได้</h2>
    <div class="muted" style="margin-bottom:8px">จับคู่ให้อัตโนมัติจากชื่อคอลัมน์ — ถ้าจับผิดให้เลือกใหม่เอง ผลจะเปลี่ยนทันที</div>
    <div class="scroll"><table><tr><th style="width:42%">ข้อมูลที่เราต้องการ</th><th>คอลัมน์ในไฟล์</th></tr>${rows}</table></div>
    ${unused}</div>`;
}

const KIND_TH = { post: "โพสต์", comment: "คอมเมนต์ใต้โพสต์", reply: "ตอบกลับคอมเมนต์" };

function kindBox(p) {
  const kinds = ["post", "comment", "reply"].filter((k) => p.kinds[k])
    .map((k) => `<div class="kv"><span>${KIND_TH[k]}</span><b>${p.kinds[k].toLocaleString("th-TH")}</b></div>`).join("");
  const srcs = Object.entries(p.sources).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<div class="kv"><span>${esc(k)}</span><b>${n.toLocaleString("th-TH")}</b></div>`).join("");
  return `<div class="card"><h2>ในไฟล์มีอะไรบ้าง</h2>
    <div class="row" style="align-items:flex-start">
      <div style="flex:1;min-width:230px"><div class="muted" style="margin-bottom:4px">ชนิดของแถว</div>${kinds}
        <div class="muted" style="margin-top:6px">⚠️ ไฟล์ export เอาโพสต์ คอมเมนต์ และคำตอบกลับ <b>มาปนกันในชีตเดียว</b>
        — นับทุกแถวเป็น "โพสต์" ไม่ได้</div></div>
      <div style="flex:1;min-width:200px"><div class="muted" style="margin-bottom:4px">ช่องทาง</div>${srcs}
        <div class="muted" style="margin-top:6px">💡 ไฟล์มีหลายชีต (all + แยกรายช่อง) — ถ้าตรงนี้ขึ้นช่องเดียว
        แปลว่าอ่านชีตแยกมา ไม่ใช่ชีตรวม</div></div>
    </div></div>`;
}

function daysBox(p) {
  if (!p.days.length) return "";
  const max = Math.max(...p.days.map((d) => d.count));
  const rows = p.days.map((d) => `<tr><td>${esc(d.date)}</td>
    <td style="width:60%"><div style="background:#dbeafe;height:14px;border-radius:4px;width:${Math.round(d.count / max * 100)}%"></div></td>
    <td style="text-align:right">${d.count.toLocaleString("th-TH")}</td></tr>`).join("");
  return `<div class="card"><h2>วันที่ที่พบในไฟล์ (${p.days.length} วัน)</h2>
    <div class="scroll"><table>${rows}</table></div>
    <div class="muted" style="margin-top:8px">ไฟล์ที่ export วันจันทร์มักครอบ ศุกร์-เสาร์-อาทิตย์มาด้วย — ระบบแตกให้เป็นรายวันตามนี้</div></div>`;
}

function peopleBox(p) {
  const a = p.accounts;
  const keep = a.page, gone = a.person + a.unknown;
  return `<div class="card"><h2>เพจ / บุคคล — ตัวนี้ตัดสินว่าข้อมูลจะถูกลบเมื่อไหร่</h2>
    <div class="kv"><span>เพจ / สื่อ / องค์กร <span class="tag">เก็บถาวร</span></span><b>${a.page.toLocaleString("th-TH")}</b></div>
    <div class="kv"><span>บุคคลธรรมดา <span class="tag warn">ลบตามกำหนด</span></span><b>${a.person.toLocaleString("th-TH")}</b></div>
    <div class="kv"><span>บอกไม่ได้ว่าเป็นใคร <span class="tag warn">ลบตามกำหนด</span></span><b>${a.unknown.toLocaleString("th-TH")}</b></div>
    <div class="muted" style="margin-top:8px">
      🔴 <b>"บอกไม่ได้" ถูกนับเป็นบุคคลโดยตั้งใจ</b> — ลบเกินยังเอาไฟล์ต้นทางมาใส่ใหม่ได้
      แต่เก็บข้อมูลบุคคลเกินกำหนดคือความเสี่ยงทางกฎหมาย
      <br />สรุป: เก็บถาวร ${keep.toLocaleString("th-TH")} ใบ · ลบตามกำหนด ${gone.toLocaleString("th-TH")} ใบ
      ${a.unknown && !p.header.map.accountType ? '<br />💡 ถ้าไฟล์มีคอลัมน์บอกประเภทบัญชี ให้เลือกในตารางข้างบน จำนวน "บอกไม่ได้" จะลดลง' : ""}
      ${a.unknown && p.header.map.accountType ? '<br />❓ ไฟล์ของ Zocial ใช้ป้าย <b>Public Figure</b> ซึ่งบอกไม่ได้ว่าเป็นเพจหรือคนจริง — ตอนนี้นับเป็น "บอกไม่ได้" ไว้ก่อน <b>รอเจ้าของเคาะ</b>' : ""}
    </div></div>`;
}

function droppedBox(p) {
  if (!p.dropped.length) return `<div class="card"><h2>แถวที่ตัดทิ้ง</h2><div class="muted">ไม่มีแถวไหนถูกตัดเลย</div></div>`;
  const groups = p.dropped.map((g) => `<details><summary><b>${esc(g.label)}</b> — ${g.count.toLocaleString("th-TH")} แถว</summary>
    <table>${g.samples.map((s) => `<tr><td class="muted" style="width:70px">แถว ${s.rowNo}</td>
      <td>${esc(s.note || s.sample || "—")}</td></tr>`).join("")}</table>
    ${g.count > g.samples.length ? `<div class="muted">…และอีก ${(g.count - g.samples.length).toLocaleString("th-TH")} แถว</div>` : ""}
    </details>`).join("");
  return `<div class="card"><h2>แถวที่ตัดทิ้ง (${p.counts.dropped.toLocaleString("th-TH")})</h2>
    <div class="muted" style="margin-bottom:6px">กดดูได้ว่าตัดใบไหนเพราะอะไร — ตัดเงียบโดยไม่บอกคือสิ่งที่ห้ามทำ</div>
    ${groups}</div>`;
}

function sampleBox(p) {
  const rows = p.records.slice(0, 5).map((r) => `<tr>
    <td>${esc(r.date)}<div class="muted">${esc(r.source)}</div></td>
    <td>${esc(r.snippet.slice(0, 90))}<div class="muted">${esc(r.account || "ไม่มีชื่อบัญชี")} · ${esc(r.accountType)}</div></td>
    <td style="text-align:right">${r.comments === null ? '<span class="muted">—</span>' : esc(r.comments) + " ในไฟล์"}</td>
  </tr>`).join("");
  return `<div class="card"><h2>ตัวอย่าง 5 แถวแรกที่จะบันทึก</h2>
    <div class="scroll"><table><tr><th>วันที่</th><th>ข้อความ</th><th style="text-align:right">คอมเมนต์</th></tr>${rows}</table></div>
    <div class="muted" style="margin-top:8px">⚠️ ตัวเลขคอมเมนต์ <b>นับเฉพาะที่อยู่ในไฟล์</b> ไม่ใช่ยอดจริงบนโพสต์ — จึงเปลี่ยนได้ทุกครั้งที่ export ใหม่</div>
    <div class="muted">⚠️ ยังไม่มีค่า sentiment ของเราเอง — ค่าดิบจาก Zocial ถูกเก็บไว้เฉยๆ <b>ยังไม่เอาขึ้นการ์ด</b></div></div>`;
}

function saveBox(p) {
  return `<div class="card">
    <button class="btn primary" disabled>บันทึกลงฐานข้อมูล</button>
    <div class="muted" style="margin-top:8px">
      ปุ่มนี้ยังกดไม่ได้เพราะ <b>ยังไม่ได้เปิด D1</b> — ต้องให้เจ้าของสร้าง database + binding ที่ Cloudflare ก่อน
      (ทั้ง Production และ Preview แล้ว Retry deployment)
      ${p.ok ? "" : "<br />และไฟล์นี้ยังจับคู่คอลัมน์ไม่ครบด้วย"}
    </div></div>`;
}

/* ── ผูกปุ่ม — เปลี่ยนค่าแล้ววาดใหม่ทันที ไม่ต้องเลือกไฟล์ซ้ำ ──────────── */
function wire(p) {
  const tz = $("tz");
  if (tz) tz.addEventListener("change", () => {
    OPTS.tz = tz.value;
    try { localStorage.setItem(TZ_KEY, OPTS.tz); } catch { /* โหมดส่วนตัวเขียนไม่ได้ ไม่ใช่เรื่องคอขาดบาดตาย */ }
    render();
  });

  const camp = $("camp");
  if (camp) camp.addEventListener("change", () => { OPTS.campaign = camp.value.trim(); render(); });

  for (const sel of document.querySelectorAll("select[data-field]")) {
    sel.addEventListener("change", () => {
      const map = { ...OPTS.headerMap };
      map[sel.dataset.field] = sel.value || null;
      OPTS.headerMap = map;
      render();
    });
  }
}
