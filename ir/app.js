// IR News Monitor — frontend logic (vanilla JS)
// 3 คอลัมน์: News · Alert 1 · Alert 2  (ดึงจาก /api/ir/feeds)

const state = {
  data: null,     // { sources: { news, alert1, alert2 }, errors, generatedAt }
  filters: {},    // per-source { kw, rc }
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// หมวดข่าว (กรองด้วยคีย์เวิร์ดในหัวข้อ/สรุป — ไทย+อังกฤษ) สำหรับคอลัมน์ข่าว
const CATS = [
  { key: "econ",   label: "💰 เศรษฐกิจ", kw: ["หุ้น","เศรษฐกิจ","ธุรกิจ","ลงทุน","เงินบาท","ส่งออก","นำเข้า","กำไร","ตลาดหุ้น","ดอกเบี้ย","เงินเฟ้อ","จีดีพี","ปันผล","แบงก์","ธนาคาร","stock","econom","market","invest","trade","inflation","finance","earnings","bank"] },
  { key: "agri",   label: "🐷 เกษตร/อาหาร", kw: ["หมู","ไก่","ไข่","กุ้ง","ปศุสัตว์","เกษตร","อาหารสัตว์","ข้าว","ประมง","เนื้อ","สุกร","ฟาร์ม","livestock","agri","farm","pork","poultry","crop","harvest","food"] },
  { key: "pol",    label: "🏛️ การเมือง", kw: ["รัฐบาล","นายก","สภา","ครม","พรรค","เลือกตั้ง","กฎหมาย","นโยบาย","รัฐมนตรี","ภาษี","การเมือง","govern","policy","election","parliament","minister","tariff","cabinet"] },
  { key: "energy", label: "⚡ พลังงาน", kw: ["น้ำมัน","ก๊าซ","ไฟฟ้า","พลังงาน","โซลาร์","ถ่านหิน","ค่าไฟ","oil","gas","energy","power","fuel","electric","solar"] },
];
const CAT_MAP = Object.fromEntries(CATS.map((c) => [c.key, c.kw.map((k) => k.toLowerCase())]));
// หมวดของข่าว: ใช้ค่าจาก server (it.cat — keyword/AI) ถ้ามี, ไม่งั้นคำนวณ keyword ฝั่ง client
function catOf(it) {
  if (it.cat) return it.cat;
  const hay = ((it.title || "") + " " + (it.snippet || "")).toLowerCase();
  for (const key of Object.keys(CAT_MAP)) if (CAT_MAP[key].some((k) => hay.includes(k))) return key;
  return "other";
}

// ---------- utils ----------
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "เมื่อสักครู่";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
}
function escapeHtml(s = "") {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
// แปลง marker \u0001..\u0002 (จาก <b> ของ Google Alert) → <mark> ไฮไลต์ (ใช้หลัง escapeHtml แล้ว)
function hl(s = "") {
  return s.replace(/\u0001([\s\S]*?)\u0002/g, '<mark class="hl">$1</mark>').replace(/[\u0001\u0002]/g, "");
}
function withinRecency(iso, hours) {
  if (hours === "all") return true;
  return new Date(iso).getTime() >= Date.now() - Number(hours) * 3600000;
}

// ---------- data ----------
async function load() {
  const btn = $("#refresh");
  btn.disabled = true;
  $("#updated").textContent = "กำลังโหลด…";
  $$(".panel").forEach((p) => {
    $("[data-list]", p).innerHTML = `<div class="state skeleton">กำลังดึงข้อมูล…</div>`;
  });

  try {
    const feeds = await fetch("/api/ir/feeds").then((r) => r.json());
    state.data = feeds;
    $("#updated").textContent =
      "อัปเดตล่าสุด " + new Date(feeds.generatedAt || Date.now()).toLocaleTimeString("th-TH");
    renderAll();
  } catch (e) {
    $("#updated").textContent = "โหลดไม่สำเร็จ";
    $$(".panel").forEach((p) => {
      $("[data-list]", p).innerHTML = `<div class="state error">ดึงข้อมูลไม่สำเร็จ: ${escapeHtml(e.message)}</div>`;
    });
  } finally {
    btn.disabled = false;
  }
}

// ---------- render ----------
function renderAll() {
  $$(".panel").forEach(renderPanel);
  if (window.Flags) Flags.refresh();
}

function renderPanel(panel) {
  const source = panel.dataset.source;
  const bucket = state.data?.sources?.[source] || { items: [] };
  const f = state.filters[source] || { kw: "", rc: "all" };
  const kw = f.kw.trim().toLowerCase();

  const items = bucket.items.filter((it) => {
    if (window.Flags && Flags.isHidden(it.link)) return false;
    if (!withinRecency(it.publishedAt, f.rc)) return false;
    if (kw) {
      const hay = (it.title + " " + it.snippet + " " + it.sourceLabel).toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    if (f.cat && catOf(it) !== f.cat) return false;
    return true;
  });

  setCount(panel, source, items.length);
  const list = $("[data-list]", panel);

  if (items.length === 0) {
    list.innerHTML = emptyState(source, bucket, kw || f.rc !== "all");
    return;
  }

  list.innerHTML = items.map((it) => cardHtml(it, source)).join("");
}

function cardHtml(it, source) {
  return `<a class="card" href="${escapeHtml(it.link)}" target="_blank" rel="noopener">
    ${window.Flags ? Flags.button(it, source) : ""}
    ${it.sourceLabel ? `<div class="src">${escapeHtml(it.sourceLabel)}</div>` : ""}
    <div class="ttl">${hl(escapeHtml(it.title))}</div>
    ${it.snippet ? `<div class="snip">${hl(escapeHtml(it.snippet))}</div>` : ""}
    <div class="meta">${timeAgo(it.publishedAt)}</div>
  </a>`;
}


function setCount(panel, source, n) {
  const errs = (state.data?.errors || []).filter((e) => e.source === source);
  const countEl = $("[data-count]", panel);
  if (errs.length) {
    countEl.className = "errbadge";
    countEl.textContent = "⚠ บางฟีดโหลดไม่ได้";
    countEl.title = errs.map((e) => `${e.label}: ${e.message}`).join("\n");
  } else {
    countEl.className = "pcount";
    countEl.textContent = n + " รายการ";
  }
}

function emptyState(source, bucket, filtered) {
  if (filtered && bucket.items.length > 0)
    return `<div class="state">ไม่พบรายการที่ตรงกับตัวกรอง</div>`;
  if (source.startsWith("alert")) {
    if (bucket.feedCount > 0) {
      return `<div class="state">
        ✓ เพิ่มฟีด Alert แล้ว (${bucket.feedCount})<br><br>
        ยังไม่มีข่าวใหม่เข้าเงื่อนไขตอนนี้<br>
        <span style="font-size:11px">Google Alert จะมีรายการเมื่อพบเนื้อหาใหม่ที่ตรงคำ</span>
      </div>`;
    }
    return `<div class="state">
      ยังไม่ได้เพิ่มฟีด Google Alert หมวดนี้<br><br>
      ตั้ง alert แล้วเลือก <b>Deliver to: RSS feed</b><br>
      คัดลอก URL มาวางใน <code>ir-feeds.config.js</code><br><br>
      <a href="https://www.google.com/alerts" target="_blank" rel="noopener">เปิด Google Alerts →</a>
    </div>`;
  }
  return `<div class="state">ยังไม่มีรายการ</div>`;
}

// ---------- wire ----------
function wire() {
  $$(".panel").forEach((panel) => {
    const source = panel.dataset.source;
    state.filters[source] = { kw: "", rc: "all", cat: null };
    const kwEl = $("[data-kw]", panel);
    if (kwEl)
      kwEl.addEventListener("input", (e) => {
        state.filters[source].kw = e.target.value;
        renderPanel(panel);
      });
    const rcEl = $("[data-rc]", panel);
    if (rcEl)
      rcEl.addEventListener("change", (e) => {
        state.filters[source].rc = e.target.value;
        renderPanel(panel);
      });
    injectCats(panel);
  });
  $("#refresh").addEventListener("click", load);
}

// ชิพหมวดข่าว — ใส่เฉพาะคอลัมน์ข่าว (ในประเทศ/ต่างประเทศ)
function injectCats(panel) {
  const source = panel.dataset.source;
  if (source !== "newsth" && source !== "newsintl") return;
  const row = document.createElement("div");
  row.className = "cats";
  row.innerHTML =
    `<button type="button" class="cat on" data-cat="">ทั้งหมด</button>` +
    CATS.map((c) => `<button type="button" class="cat" data-cat="${c.key}">${c.label}</button>`).join("");
  $(".filters", panel).after(row);
  row.addEventListener("click", (e) => {
    const b = e.target.closest(".cat");
    if (!b) return;
    state.filters[source].cat = b.dataset.cat || null;
    $$(".cat", row).forEach((x) => x.classList.toggle("on", x === b));
    renderPanel(panel);
  });
}

if (window.Flags) Flags.init({ onChange: renderAll });
wire();
load();
