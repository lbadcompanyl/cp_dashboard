// Trend Dashboard — frontend logic (vanilla JS)

const state = {
  data: null, // { sources: { news, alert, trends }, errors }
  filters: {}, // per-source { kw, rc }
  trendsGeo: "TH",
  trendsHours: 24, // Past 4/24/48/168 ชม. (แบบ Google Trending Now)
  related: {}, // cache related-queries responses keyed by geo|time|query
  trendBreakdown: {}, // title -> [คำที่เกี่ยวข้อง] จาก Trending Now (fallback)
  trendNewsIds: {}, // title -> article id triplets
  trendNews: {}, // title -> resolved news articles (cache)
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
    const [feeds, trends] = await Promise.all([
      fetch("/api/trend/feeds").then((r) => r.json()),
      fetchTrends(state.trendsGeo, state.trendsHours),
    ]);
    feeds.sources.trends = trends;
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

async function fetchTrends(geo, hours) {
  const res = await fetch(`/api/trend/trending?geo=${encodeURIComponent(geo)}&hours=${hours}`);
  const d = await res.json();
  return {
    label: "Google Trends",
    items: d.items || [],
    error: d.error || null,
    sourceType: d.source || "trendingnow",
  };
}

async function reloadTrends() {
  const panel = $('.panel[data-source="trends"]');
  $("[data-list]", panel).innerHTML = `<div class="state skeleton">กำลังดึงเทรนด์…</div>`;
  try {
    state.data.sources.trends = await fetchTrends(state.trendsGeo, state.trendsHours);
  } catch (e) {
    state.data.sources.trends = { label: "Google Trends", items: [], error: e.message };
  }
  renderPanel(panel);
}

// ---------- คำที่เกี่ยวข้อง (breakdown จาก Trending Now — เชื่อถือได้บน edge) ----------
// URL หน้า Google Trends ของคำ พร้อม filter: Thailand · Past day · All categories · Web Search
function trendExploreUrl(q) {
  return (
    "https://trends.google.com/trends/explore?date=" +
    encodeURIComponent("now 1-d") + // Past day
    "&geo=" + encodeURIComponent(state.trendsGeo) + // ตามประเทศที่เลือก
    "&q=" + encodeURIComponent(q)
  );
}

function renderTerms(title, box) {
  const bd = state.trendBreakdown[title] || [];
  const header = `<div class="rel-h">🔎 คำค้นที่เกี่ยวข้อง</div>`;
  if (!bd.length) {
    // ไม่มี breakdown — อย่างน้อยลิงก์ไปดูใน Google Trends
    box.innerHTML =
      header +
      `<a class="bd-chip" href="${trendExploreUrl(title)}" target="_blank" rel="noopener">เปิดใน Google Trends →</a>`;
    return;
  }
  // ทุก chip ลิงก์ไปหน้า Google Trends ของ "เทรนด์แม่" (title) ไม่ใช่คำของ chip เอง
  const trendUrl = trendExploreUrl(title);
  box.innerHTML =
    header +
    `<div class="bd-chips">` +
    bd
      .map(
        (term) =>
          `<a class="bd-chip" href="${trendUrl}" target="_blank" rel="noopener">${escapeHtml(term)}</a>`
      )
      .join("") +
    `</div>`;
}

// ---------- Top / Rising queries (bonus — มักโดน Google จำกัดบน edge) ----------
async function loadRelated(query, box) {
  const geo = state.trendsGeo;
  const time = box.dataset.time || "now 1-d";
  const key = `${geo}|${time}|${query}`;
  let data = state.related[key];
  if (!data) {
    try {
      const res = await fetch(
        `/api/trend/related?q=${encodeURIComponent(query)}&geo=${geo}&time=${encodeURIComponent(time)}`
      );
      data = await res.json();
      state.related[key] = data;
    } catch {
      data = { top: [], rising: [] };
    }
  }
  renderRelated(box, query, data);
}

function renderRelated(box, query, data) {
  // ดึง % ไม่ได้ (มักโดน Google จำกัดบน edge) → คงคำค้นที่เกี่ยวข้องที่แสดงอยู่ไว้ ไม่ล้าง
  if (!data || (data.top.length === 0 && data.rising.length === 0)) {
    return;
  }
  const time = box.dataset.time || "now 1-d";
  const toggle = `<div class="rel-tf">
    <button data-t="now 1-d" class="${time === "now 1-d" ? "on" : ""}">24 ชม.</button>
    <button data-t="now 7-d" class="${time === "now 7-d" ? "on" : ""}">7 วัน</button>
  </div>`;
  const col = (title, arr, rising) => `
    <div class="rel-col">
      <div class="rel-h">${title}</div>
      ${arr
        .map(
          (k) => `<a class="rel-row" href="${escapeHtml(k.link)}" target="_blank" rel="noopener">
            <span class="rel-q">${escapeHtml(k.query)}</span>
            <span class="rel-v ${rising ? "up" : ""}">${escapeHtml(k.label)}</span>
          </a>`
        )
        .join("")}
    </div>`;

  box.innerHTML =
    `<div class="rel-h">🔎 Top / Rising queries</div>` +
    toggle +
    `<div class="rel-grid">
      ${col("Top queries", data.top, false)}
      ${col("Rising queries", data.rising, true)}
    </div>`;
  wireRelTf(box, query);
}

function wireRelTf(box, query) {
  $$(".rel-tf button", box).forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      box.dataset.time = b.dataset.t;
      loadRelated(query, box);
    })
  );
}

// ---------- render ----------
function renderAll() {
  $$(".panel").forEach(renderPanel);
  if (window.Flags) Flags.refresh();
}

function renderPanel(panel) {
  const source = panel.dataset.source;
  if (source === "trends") return renderTrends(panel);

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

  list.innerHTML = items
    .map(
      (it) => `<a class="card" href="${escapeHtml(it.link)}" target="_blank" rel="noopener">
        ${window.Flags ? Flags.button(it, source) : ""}
        ${it.sourceLabel ? `<div class="src">${escapeHtml(it.sourceLabel)}</div>` : ""}
        <div class="ttl">${escapeHtml(it.title)}</div>
        ${it.snippet ? `<div class="snip">${escapeHtml(it.snippet)}</div>` : ""}
        <div class="meta">${timeAgo(it.publishedAt)}</div>
      </a>`
    )
    .join("");
}

function renderTrends(panel) {
  const bucket = state.data?.sources?.trends || { items: [], error: null };
  const f = state.filters.trends || { kw: "" };
  const kw = f.kw.trim().toLowerCase();
  const items = bucket.items.filter(
    (it) => !kw || (it.title + " " + it.snippet).toLowerCase().includes(kw)
  );

  const countEl = $("[data-count]", panel);
  if (bucket.error && bucket.items.length === 0) {
    countEl.className = "errbadge";
    countEl.textContent = "⚠ โหลดไม่ได้";
    countEl.title = bucket.error;
  } else {
    countEl.className = "pcount";
    countEl.textContent = items.length + " คำ";
    countEl.title = bucket.sourceType === "rss-fallback" ? "ใช้ข้อมูลสำรอง (RSS)" : "";
  }

  const list = $("[data-list]", panel);
  if (items.length === 0) {
    list.innerHTML = `<div class="state">${bucket.error ? "ดึงเทรนด์ไม่ได้" : kw ? "ไม่พบคำที่ตรงกับตัวกรอง" : "ยังไม่มีข้อมูล"}</div>`;
    return;
  }

  items.forEach((it) => {
    if (it.related && it.related.length) state.trendBreakdown[it.title] = it.related;
    if (it.newsIds && it.newsIds.length) state.trendNewsIds[it.title] = it.newsIds;
  });

  list.innerHTML = items
    .map((it, i) => {
      const vol = it.volumeLabel || it.sourceLabel || "";
      const sub = [
        vol ? `<b class="vol">${escapeHtml(vol)}</b>` : "",
        it.pctLabel ? `<span class="pct">${escapeHtml(it.pctLabel)}</span>` : "",
        `<span class="ago">เริ่ม ${timeAgo(it.publishedAt)}</span>`,
      ]
        .filter(Boolean)
        .join(" ");
      return `<div class="trend">
        <div class="trend-head" data-q="${escapeHtml(it.title)}">
          <span class="rank">${i + 1}</span>
          <div class="trend-main">
            <div class="trend-term">${escapeHtml(it.title)}</div>
            <div class="trend-sub">${sub}</div>
            ${it.snippet ? `<div class="trend-bd">${escapeHtml(it.snippet)}</div>` : ""}
          </div>
          <span class="trend-caret">🔍 query</span>
        </div>
        <div class="rel-box" hidden></div>
      </div>`;
    })
    .join("");

  // wire expand
  $$(".trend-head", list).forEach((head) =>
    head.addEventListener("click", () => {
      const box = head.nextElementSibling;
      const open = !box.hidden;
      if (open) {
        box.hidden = true;
        head.classList.remove("open");
        return;
      }
      box.hidden = false;
      head.classList.add("open");
      if (!box.dataset.loaded) {
        box.dataset.loaded = "1";
        box.innerHTML = `<div class="tn-news"></div><div class="tn-rel"></div>`;
        loadNews(head.dataset.q, $(".tn-news", box));
        renderTerms(head.dataset.q, $(".tn-rel", box)); // แสดงคำค้นที่เกี่ยวข้องทันที (เชื่อถือได้)
        loadRelated(head.dataset.q, $(".tn-rel", box)); // ถ้าดึง % ได้ จะอัปเกรดเป็นตาราง Top/Rising
      }
    })
  );
}

// ---------- In the news (ข่าวที่เกี่ยวข้อง พร้อมรูป) ----------
async function loadNews(title, box) {
  const ids = state.trendNewsIds[title] || [];
  if (!ids.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `<div class="rel-h">📰 ข่าวที่เกี่ยวข้อง</div><div class="state skeleton" style="padding:8px">กำลังโหลดข่าว…</div>`;

  let arts = state.trendNews[title];
  if (!arts) {
    try {
      const res = await fetch("/api/trend/trendnews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      arts = (await res.json()).articles || [];
      state.trendNews[title] = arts;
    } catch {
      arts = [];
    }
  }

  if (!arts.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML =
    `<div class="rel-h">📰 ข่าวที่เกี่ยวข้อง</div>` +
    arts
      .slice(0, 6)
      .map(
        (a) => `<a class="news-item" href="${escapeHtml(a.url)}" target="_blank" rel="noopener">
          ${a.image ? `<img class="news-img" src="${escapeHtml(a.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="news-img ph"></div>`}
          <div class="news-body">
            <div class="news-ttl">${escapeHtml(a.title)}</div>
            <div class="news-meta">${escapeHtml(a.source || "")}${a.time ? " · " + timeAgo(a.time) : ""}</div>
          </div>
        </a>`
      )
      .join("");
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
  if (source === "alert") {
    if (bucket.feedCount > 0) {
      // มีฟีดแล้วแต่ยังไม่มีข่าวเข้าเงื่อนไข
      return `<div class="state">
        ✓ เพิ่มฟีด Alert แล้ว (${bucket.feedCount})<br><br>
        ยังไม่มีข่าวใหม่เข้าเงื่อนไขตอนนี้<br>
        <span style="font-size:11px">Google Alert จะมีรายการเมื่อพบเนื้อหาใหม่ที่ตรงคำ</span>
      </div>`;
    }
    return `<div class="state">
      ยังไม่ได้เพิ่มฟีด Google Alert<br><br>
      ตั้ง alert แล้วเลือก <b>Deliver to: RSS feed</b><br>
      คัดลอก URL มาวางใน <code>feeds.config.js</code><br><br>
      <a href="https://www.google.com/alerts" target="_blank" rel="noopener">เปิด Google Alerts →</a>
    </div>`;
  }
  return `<div class="state">ยังไม่มีรายการ</div>`;
}

// ---------- wire ----------
function wire() {
  $$(".panel").forEach((panel) => {
    const source = panel.dataset.source;
    state.filters[source] = { kw: "", rc: "all", trc: "all" };
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
    const geoEl = $("[data-geo]", panel);
    if (geoEl)
      geoEl.addEventListener("change", (e) => {
        state.trendsGeo = e.target.value;
        reloadTrends();
      });
    const hoursEl = $("[data-hours]", panel);
    if (hoursEl)
      hoursEl.addEventListener("change", (e) => {
        state.trendsHours = Number(e.target.value);
        reloadTrends();
      });
  });
  $("#refresh").addEventListener("click", load);
}

if (window.Flags) Flags.init({ onChange: renderAll });
wire();
load();
