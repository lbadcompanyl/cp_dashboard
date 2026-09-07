/**
 * app.js — หน้าลองดูคอลัมน์ "คนพูดถึงเรา"
 * ---------------------------------------
 * ยิงเข้า /issue/api/listen ตัวเดียวกับที่คอลัมน์จริงจะใช้ — ไม่มีตรรกะของตัวเอง
 * มีไว้ 2 อย่าง: เห็นว่าข้อมูลที่บันทึกไปหน้าตาเป็นยังไง · ลองเงื่อนไขคัดข่าวก่อนตัดสินใจ
 */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const SENT_TH = { neg: "ลบ", neu: "กลาง", pos: "บวก" };
const WHY_TH = { shop: "หน้าขายของ", job: "ประกาศงาน", property: "อสังหา/ให้เช่า", vendor: "หน้าขายสินค้า/บริการ",
  "archive-page": "หน้ารวมบทความ", "paged-list": "หน้ารวมรายการ", "event-page": "หน้างานอีเวนต์",
  gallery: "แกลเลอรีรูป", imagepost: "โพสต์รูป", daily: "รายงานประจำวัน", "pr-wire": "เว็บแจกข่าว PR",
  datapage: "หน้าข้อมูลค่าฝุ่น/อากาศ", dustpage: "หน้ารายงานค่าฝุ่นของหน่วยงาน", stream: "หน้าดูหนัง/ซีรีส์",
  ad: "โฆษณาแฝง", "by-owner": "เจ้าของสั่งตัด" };

async function load() {
  const out = $("out");
  // กฎข้อ 5b — กดดูแล้วต้องขึ้นไอคอนหมุนทันที ห้ามให้อ่านผลของรอบก่อนอยู่โดยไม่รู้ตัว
  out.innerHTML = `<div class="card"><span class="spin"></span>กำลังดึงข้อมูล…</div>`;

  const p = new URLSearchParams();
  const put = (k, v) => { if (v !== "" && v !== null && v !== undefined) p.set(k, v); };
  put("date", $("date").value);
  put("campaign", $("camp").value.trim());
  put("minEng", Number($("minEng").value) || "");
  put("source", $("src").value);
  put("q", $("q").value.trim());
  put("limit", Number($("limit").value) || 30);
  if ($("noise").value === "0") p.set("noise", "0");

  try {
    const r = await fetch("/issue/api/listen?" + p.toString());
    // 🔒 Access หมดอายุจะตอบหน้าล็อกอินเป็น HTML — เช็คก่อนแกะ ไม่งั้นรายงานผิดเรื่อง
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("json")) return fail("เซสชันหมดอายุ — กดรีเฟรชหน้านี้เพื่อเข้าสู่ระบบใหม่", true);
    const d = await r.json();
    if (d.ok === false) return fail(d.message || "ดึงข้อมูลไม่สำเร็จ");
    render(d);
  } catch (e) {
    fail("ต่อกับเซิร์ฟเวอร์ไม่ได้: " + (e.message || e));
  }
}

const fail = (msg, reload) => {
  $("out").innerHTML = `<div class="note bad">❌ ${esc(msg)}
    ${reload ? '<br /><button class="btn" id="rl" style="margin-top:8px">เข้าสู่ระบบใหม่</button>' : ""}</div>`;
  // ⚠️ ต้องรีโหลดทั้งหน้า ห้ามยิง fetch ซ้ำ — Access พาไปหน้าล็อกอินด้วย redirect ของทั้งหน้าเท่านั้น
  const b = $("rl"); if (b) b.addEventListener("click", () => location.reload());
};

function render(d) {
  const head = `<div class="card">
    <h2>ผลที่ได้</h2>
    <div class="kv"><span class="muted">แคมเปญ</span><b>${esc(d.campaign || "—")}</b></div>
    <div class="kv"><span class="muted">วันที่</span><b>${esc(d.date || "—")}</b></div>
    <div class="kv"><span class="muted">อัปเดตล่าสุด</span><span>${esc(d.updatedAt || "—")}</span></div>
    <div class="kv"><span class="muted">ได้การ์ด</span><b>${(d.cards || []).length}</b></div>
  </div>`;

  // 🔴 "ไม่มีข้อมูล" ต้องบอกว่าไม่มี ห้ามปล่อยหน้าว่างให้เดาเอง
  if (!d.hasData) {
    $("out").innerHTML = head + `<div class="note">
      <b>ไม่มีข้อมูลตามเงื่อนไขนี้</b> — ${esc(d.note || "ลองขยายวันที่ หรือลดเงื่อนไขลง")}
      ${d.filters && d.filters.minEng ? `<br />ตอนนี้กรอง engagement ขั้นต่ำ ${d.filters.minEng} อยู่` : ""}
      ${d.filters && d.filters.q ? `<br />ตอนนี้กรองคำว่า "${esc(d.filters.q)}" อยู่` : ""}
    </div>`;
    return;
  }

  const dropped = (d.dropped || []).length
    ? `<div class="card"><h2>ตัดออกเพราะไม่ใช่ข่าว</h2>
        ${d.dropped.map((x) => `<div class="kv"><span>${esc(WHY_TH[x.why] || x.why)}</span><b>${x.count}</b></div>`).join("")}
        <div class="muted" style="margin-top:6px">เลือก "ไม่ตัด" ในเงื่อนไขแล้วกดดูใหม่ ของจะกลับมาครบทันที — ไม่ได้ลบทิ้ง</div></div>`
    : "";

  const cards = d.cards.map((c) => `<div class="item">
      <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.snippet)}</a>
      <div class="meta">
        <span class="src">${esc(c.source)}</span>
        <span>${esc(c.account || "ไม่มีชื่อบัญชี")}</span>
        <span>${esc(String(c.postedAt || "").slice(0, 16).replace("T", " "))}</span>
        ${c.engagement === null ? "" : `<span>engagement ${Number(c.engagement).toLocaleString("th-TH")}</span>`}
        ${c.comments === null ? "" : `<span>${Number(c.comments).toLocaleString("th-TH")} คอมเมนต์<b>ในไฟล์</b></span>`}
        ${sentTag(c)}
      </div></div>`).join("");

  $("out").innerHTML = head + dropped + `<div class="card"><h2>การ์ด</h2><div class="cards">${cards}</div>
    <div class="muted" style="margin-top:10px">
      ⚠️ ป้ายอารมณ์ที่เห็นเป็น <b>ค่าดิบจาก Zocial</b> ยังไม่ผ่านเกณฑ์ของเรา —
      ในไฟล์จริงค่าดิบเป็น "ลบ" ถึง 60% อย่าเพิ่งเอาไปสรุปอะไร
      <br />⚠️ จำนวนคอมเมนต์นับเฉพาะที่อยู่ในไฟล์ที่ upload ไม่ใช่ยอดจริงบนโพสต์
    </div></div>`;
}

function sentTag(c) {
  if (!c.postSent) return `<span class="sent neu">ยังไม่รู้</span>`;
  const src = c.sentimentChecked ? "เกณฑ์ของเรา" : "ดิบจาก Zocial";
  return `<span class="sent ${esc(c.postSent)}" title="ที่มา: ${esc(src)}">${esc(SENT_TH[c.postSent] || c.postSent)} · ${esc(src)}</span>`;
}

$("go").addEventListener("click", load);
for (const id of ["date", "camp", "minEng", "src", "q", "limit", "noise"]) {
  $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") load(); });
}
load();   // เปิดหน้ามาดึงเลย ไม่ต้องรอกด
