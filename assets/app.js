/* =============================================================
 * Food Rescue Trends — Google Trends embed dashboard
 *
 * แก้คำค้น / พื้นที่ / ช่วงเวลา ได้ที่ CONFIG ด้านล่างนี้ที่เดียว
 * =============================================================*/

const CONFIG = {
  geo: "TH",            // ประเทศ/พื้นที่ (TH = ไทย, "" = ทั่วโลก)
  time: "today 5-y",    // ช่วงเวลา (เช่น "today 5-y", "today 12-m", "2020-01-01 2024-12-31")
  hl: "th",             // ภาษาของ widget
  keywords: ["Food Rescue", "Food Surplus", "อาหารส่วนเกิน"],
};

// ---- helpers ---------------------------------------------------

const el = (id) => document.getElementById(id);

function comparisonItems() {
  return CONFIG.keywords.map((keyword) => ({
    keyword,
    geo: CONFIG.geo,
    time: CONFIG.time,
  }));
}

function exploreQuery(keywords) {
  const q = (keywords || CONFIG.keywords).join(",");
  return `date=${CONFIG.time}&geo=${CONFIG.geo}&q=${q}&hl=${CONFIG.hl}`;
}

const GUEST_PATH = "https://trends.google.com:443/trends/embed/";

function renderWidget(target, type, keywords) {
  if (!target) return;
  try {
    window.trends.embed.renderExploreWidgetTo(
      target,
      type,
      {
        comparisonItem: (keywords || CONFIG.keywords).map((keyword) => ({
          keyword,
          geo: CONFIG.geo,
          time: CONFIG.time,
        })),
        category: 0,
        property: "",
      },
      {
        exploreQuery: exploreQuery(keywords),
        guestPath: GUEST_PATH,
      }
    );
  } catch (err) {
    target.innerHTML =
      '<div class="widget-error">โหลด widget ไม่สำเร็จ — ลองรีเฟรชหน้า หรือดู README.md</div>';
    console.error("renderExploreWidget failed:", err);
  }
}

// ---- meta pills (geo / time / keywords) -----------------------

function buildMeta() {
  const pills = [
    { label: "พื้นที่", value: CONFIG.geo === "TH" ? "🇹🇭 ประเทศไทย" : CONFIG.geo || "ทั่วโลก" },
    { label: "ช่วงเวลา", value: "5 ปีย้อนหลัง" },
    { label: "จำนวนคำค้น", value: `${CONFIG.keywords.length} คำ` },
  ];
  el("meta-pills").innerHTML = pills
    .map(
      (p) =>
        `<span class="pill"><span class="pill-label">${p.label}</span>${p.value}</span>`
    )
    .join("");
}

// ---- related-queries cards (one per keyword) ------------------

function buildRelatedGrid() {
  const grid = el("related-grid");
  grid.innerHTML = CONFIG.keywords
    .map(
      (kw, i) => `
      <div class="card">
        <div class="card-head">
          <h3>${escapeHtml(kw)}</h3>
        </div>
        <div class="widget-frame" id="w-related-${i}">
          <div class="widget-loading">กำลังโหลด…</div>
        </div>
      </div>`
    )
    .join("");
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- boot -----------------------------------------------------

function renderAll() {
  renderWidget(el("w-timeseries"), "TIMESERIES");
  renderWidget(el("w-geo"), "GEO_MAP");
  CONFIG.keywords.forEach((kw, i) => {
    renderWidget(el(`w-related-${i}`), "RELATED_QUERIES", [kw]);
  });
}

function waitForTrends(cb, tries = 0) {
  if (window.trends && window.trends.embed && window.trends.embed.renderExploreWidgetTo) {
    cb();
    return;
  }
  if (tries > 60) {
    // ~15s ยังไม่โหลด loader → แจ้งเตือน
    el("fallback-hint").hidden = false;
    document.querySelectorAll(".widget-loading").forEach((n) => {
      n.textContent = "โหลด Google Trends ไม่สำเร็จ (ตรวจการเชื่อมต่อ/ตัวบล็อกสคริปต์)";
    });
    return;
  }
  setTimeout(() => waitForTrends(cb, tries + 1), 250);
}

buildMeta();
buildRelatedGrid();
waitForTrends(renderAll);
