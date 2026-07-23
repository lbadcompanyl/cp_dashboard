// IR News Monitor — frontend logic (vanilla JS)
// 3 คอลัมน์: News · Alert 1 · Alert 2  (ดึงจาก /api/ir/feeds)

const state = {
  data: null,     // { sources: { news, alert1, alert2 }, errors, generatedAt }
  filters: {},    // per-source { kw, rc }
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

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
    return true;
  });

  setCount(panel, source, items.length);
  const list = $("[data-list]", panel);

  if (items.length === 0) {
    list.innerHTML = emptyState(source, bucket, kw || f.rc !== "all");
    return;
  }

  // คอลัมน์ News: 2 ช่องเลื่อนแยกกัน — บน 🇹🇭 ในประเทศ / ล่าง 🌏 ต่างประเทศ
  if (source === "news") {
    const th = items.filter((it) => it.region !== "intl");
    const intl = items.filter((it) => it.region === "intl");
    list.innerHTML =
      `<div class="newsgroup">` +
      newsPane("🇹🇭 ในประเทศ", th, source, "dom") +
      newsPane("🌏 ต่างประเทศ", intl, source, "intl") +
      `</div>`;
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

function newsPane(title, arr, source, cls) {
  return (
    `<div class="subhead"><span>${title}</span><span class="sc">${arr.length}</span></div>` +
    `<div class="subpane ${cls}">` +
    (arr.length ? arr.map((it) => cardHtml(it, source)).join("") : `<div class="state">ไม่มีข่าว</div>`) +
    `</div>`
  );
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
    state.filters[source] = { kw: "", rc: "all" };
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
  });
  $("#refresh").addEventListener("click", load);
}

if (window.Flags) Flags.init({ onChange: renderAll });
wire();
load();
