// Issue Dashboard หน้า 1 — โคลนจาก Trend Dashboard ทั้งชุด (ข้อมูลชุดเดียวกัน /api/trend/feeds)

const state = {
  data: null, // { sources: { news, alert, trends }, errors }
  filters: {}, // per-source { kw, rc }
  trendsGeo: "TH",
  trendsHours: 24, // Past 4/24/48/168 ชม. (แบบ Google Trending Now)
  trendsCat: 0, // หมวดหมู่ (แบบ Google Trends): 0 = ทุกหมวด
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
// แปลง marker [[hl]]..[[/hl]] (จาก <b> ของ Google Alert) → <mark> ไฮไลต์ (ใช้หลัง escapeHtml แล้ว)
function hl(s = "") {
  return s.replace(/\[\[hl\]\]([\s\S]*?)\[\[\/hl\]\]/g, '<mark class="hl">$1</mark>').replace(/\[\[\/?hl\]\]/g, "").replace(/[\u0001\u0002]/g, "");
}

// ข่าวเดียวกันจากสำนักอื่น (ยุบซ้ำจาก server) — ใช้ span+data-href เพราะซ้อน <a> ในการ์ดไม่ได้
function alsoHtml(it) {
  if (!it.also || !it.also.length) return "";
  const links = it.also
    .map((a) => `<span class="alink" data-href="${escapeHtml(a.link)}">${escapeHtml(a.label || "สำนักอื่น")}</span>`)
    .join(" · ");
  return `<div class="also">ข่าวเดียวกัน: ${links}</div>`;
}
document.addEventListener("click", (e) => {
  const a = e.target.closest(".alink");
  if (!a) return;
  e.preventDefault();
  e.stopPropagation();
  window.open(a.dataset.href, "_blank", "noopener");
});

// ข้อความ "ยังโหลดอยู่" + ไอคอนหมุน — ใช้ร่วมกันทุกคอลัมน์ แก้ที่เดียวจบ
// ต่างจาก .skeleton ตรงที่อันนี้ใช้ตอน "ได้ข้อมูลมาแล้วแต่ยังว่าง" ไม่ใช่ตอนยังไม่ยิง
const WAITING = `<div class="state waiting"><span class="spin"></span>กรุณารอซักครู่</div>`;

function withinRecency(iso, hours) {
  if (hours === "all") return true;
  return new Date(iso).getTime() >= Date.now() - Number(hours) * 3600000;
}

// ---------- data ----------
// คอลัมน์ที่มี endpoint ของตัวเอง — โหลดตอนเลื่อนถึงคอลัมน์นั้น ไม่ได้ดึงมาพร้อมข่าว
// ⚠️ เพิ่มคอลัมน์แบบนี้เมื่อไหร่ ต้องมาใส่ตรงนี้ด้วย ไม่งั้นมันจะไม่ถูกโหลดเลย
let firstLoad = true;   // รอบแรกไม่ต้องรีเฟรชคอลัมน์ lazy ซ้ำ (ตัว lazy ดึงเองแล้ว)
const LAZY_COLS = { trends: (o) => reloadTrends(o) };
// คอลัมน์ที่โหลดเอง — load() ห้ามเหวี่ยง skeleton/error ใส่ ไม่งั้นขึ้น "ดึงข้อมูลไม่สำเร็จ"
// ทั้งที่ตัวเองยังไม่ได้เริ่มโหลดด้วยซ้ำ
const feedPanels = () => $$(".panel").filter((p) => !LAZY_COLS[p.dataset.source]);

async function load(opts = {}) {
  const silent = !!opts.silent; // auto-refresh: ไม่ล้างเป็น skeleton / ไม่กระโดด scroll
  const btn = $("#refresh");
  btn.disabled = true;
  if (!silent) {
    $("#updated").textContent = "กำลังโหลด…";
    feedPanels().forEach((p) => {
      $("[data-list]", p).innerHTML = `<div class="state waiting"><span class="spin"></span>กำลังดึงข้อมูล…</div>`;
    });
  }

  try {
    // ⚡ ยิงแค่คำขอเดียว — คอลัมน์ Google Trends โหลดตอนเลื่อนถึง (ดู setupLazyColumns)
    const feeds = await fetch("/api/trend/feeds").then((r) => r.json());
    // ⚠️ **ห้ามเขียนทับ state.data ทั้งก้อน** — คอลัมน์ที่โหลดแยกเขียนผลของตัวเอง
    // ลงใน state.data.sources ตอนไหนก็ได้ ถ้าแทนที่ทั้งก้อนจะลบของที่มันเพิ่งเขียนทิ้ง
    // (เจอจริงตอนวัด: เดสก์ท็อปยิง /trending สำเร็จแล้ว แต่คอลัมน์ยังขึ้นไอคอนหมุน
    //  เพราะ load() เสร็จทีหลังแล้วทับ — ผลต่างกันทุกครั้งตามว่าใครเสร็จก่อน)
    // อ่าน state.data.sources **ตรงนี้** ไม่ใช่จำค่าไว้ก่อน await ไม่งั้นยังชนอยู่ดี
    // ⚠️ **ห้ามสร้าง sources ก้อนใหม่** — เขียนทับทีละคีย์แทน
    //    คอลัมน์ที่โหลดแยกอาจกำลังรอผลอยู่และถือ reference ของก้อนนี้ค้างไว้
    //    ถ้าสลับก้อน ผลที่มันได้มาจะไปตกในก้อนเก่าที่ไม่มีใครอ่านแล้ว
    if (!state.data) state.data = { sources: {} };
    if (!state.data.sources) state.data.sources = {};
    const src = state.data.sources;
    for (const k of Object.keys(feeds.sources || {})) src[k] = feeds.sources[k];
    Object.assign(state.data, feeds, { sources: src });
    $("#updated").textContent =
      "อัปเดตล่าสุด " + new Date(feeds.generatedAt || Date.now()).toLocaleTimeString("th-TH");
    // จำตำแหน่ง scroll ของแต่ละคอลัมน์ + หน้า แล้วคืนหลัง render (กัน auto-refresh กระโดด)
    const sp = silent ? $$(".panel [data-list]").map((el) => el.scrollTop) : null;
    const wy = silent ? window.scrollY : 0;
    renderAll();
    applyKeywords(); // sync ปุ่ม 🔤 จาก query สดของฟีด (ถ้าครบ)
    // รีเฟรชซ้ำเฉพาะคอลัมน์ที่ผู้ใช้เคยเปิดดูแล้ว · ข้ามรอบแรก (ตัว lazy ดึงไปแล้ว)
    if (!firstLoad) {
      for (const k of Object.keys(LAZY_COLS)) {
        if (window.LazyCol && LazyCol.seen(k)) LAZY_COLS[k]({ silent }).catch(() => {});
      }
    }
    firstLoad = false;
    if (silent) {
      $$(".panel [data-list]").forEach((el, i) => { if (sp[i] != null) el.scrollTop = sp[i]; });
      window.scrollTo(0, wy);
    }
  } catch (e) {
    if (!silent) {
      $("#updated").textContent = "โหลดไม่สำเร็จ";
      feedPanels().forEach((p) => {
        $("[data-list]", p).innerHTML = `<div class="state error">ดึงข้อมูลไม่สำเร็จ: ${escapeHtml(e.message)}</div>`;
      });
    }
  } finally {
    btn.disabled = false;
  }
}

async function fetchTrends(geo, hours, cat = 0) {
  const res = await fetch(`/api/trend/trending?geo=${encodeURIComponent(geo)}&hours=${hours}&cat=${cat}`);
  const d = await res.json();
  return {
    label: "Google Trends",
    items: d.items || [],
    error: d.error || null,
    sourceType: d.source || "trendingnow",
    // ⚠️ ต้องมีธงนี้ — "ยังโหลดไม่เสร็จ" กับ "โหลดเสร็จแล้วแต่หมวดนี้ไม่มีเทรนด์"
    // ได้ items ว่างเหมือนกันทั้งคู่ ถ้าไม่แยกจะขึ้น "กรุณารอซักครู่" ค้างตลอด
    loaded: true,
  };
}

async function reloadTrends(opts = {}) {
  const panel = $('.panel[data-source="trends"]');
  if (!panel) return;
  const list = $("[data-list]", panel);
  const keepScroll = opts.silent ? list.scrollTop : null; // auto-refresh ห้ามดีดตำแหน่ง scroll
  if (!opts.silent) list.innerHTML = `<div class="state waiting"><span class="spin"></span>กำลังดึงเทรนด์…</div>`;
  // 🐞 **ต้องรับค่าใส่ตัวแปรก่อน แล้วค่อยเขียนลง state** — ห้ามเขียน
  //    `state.data.sources.X = await ...` ตรงๆ เพราะ JS หา object ปลายทาง
  //    (`state.data.sources`) **ก่อน** await ถ้าระหว่างรอ load() สร้าง sources ก้อนใหม่
  //    ค่าที่ได้จะไปตกในก้อนเก่าที่ไม่มีใครใช้แล้ว → คอลัมน์ค้างเป็นไอคอนหมุนทั้งที่ยิงสำเร็จ
  //    (วัดเจอจริงตอนทำ lazy loading · reloadYTTrends เขียนถูกอยู่แล้วจึงไม่เคยพัง)
  let bucket;
  try {
    bucket = await fetchTrends(state.trendsGeo, state.trendsHours, state.trendsCat);
  } catch (e) {
    bucket = { label: "Google Trends", items: [], error: e.message, loaded: true };
  }
  if (!state.data) state.data = { sources: {} };
  if (!state.data.sources) state.data.sources = {};
  state.data.sources.trends = bucket;
  renderPanel(panel);
  if (keepScroll != null) list.scrollTop = keepScroll;
}

// ---------- โหลดทีละคอลัมน์ (lazy) ----------
// มือถือเป็น carousel เห็นทีละคอลัมน์ — คอลัมน์ที่ยังปัดไปไม่ถึงไม่ต้องแย่งเน็ต
// ⚠️ คอลัมน์ที่โหลดเองต้องวาดสถานะรอเองตั้งแต่แรก ไม่งั้นเห็นเป็นช่องว่างเปล่า
function setupLazyColumns() {
  for (const k of Object.keys(LAZY_COLS)) {
    const panel = $(`.panel[data-source="${k}"]`);
    const list = panel && $("[data-list]", panel);
    if (list && !list.innerHTML.trim()) list.innerHTML = WAITING;
  }
  if (!window.LazyCol) {
    for (const k of Object.keys(LAZY_COLS)) LAZY_COLS[k]({}).catch(() => {});
    return;
  }
  LazyCol.init({
    panels: $$(".panel"),
    onReveal: (source, panel) => {
      const fn = LAZY_COLS[source];
      if (fn) { fn({}).catch(() => {}); return; }
      // วาดได้ต่อเมื่อข้อมูลมาถึงแล้ว (ดูเหตุผลใน trend/app.js)
      if (panel && state.data) renderPanel(panel);
    },
  });
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
      // จำเฉพาะผลที่มีข้อมูล — ผลว่าง (โดน Google จำกัดชั่วคราว) ให้กดครั้งหน้าลองใหม่ได้
      if ((data.top || []).length || (data.rising || []).length) state.related[key] = data;
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
// ⚠️ **วาดเฉพาะคอลัมน์ที่ผู้ใช้เปิดดูแล้ว** — บนมือถือเห็นทีละคอลัมน์
// การสร้าง HTML ของข่าวหลายร้อยใบให้คอลัมน์ที่ยังปัดไปไม่ถึง เป็นงานที่เสียเปล่า
// และหนักที่สุดบนเครื่องช้า · คอลัมน์ที่ยังไม่เปิดจะถูกวาดตอนเลื่อนไปถึงแทน
// (ไม่มี LazyCol = วาดหมดเหมือนเดิม)
const shouldRender = (p) => !window.LazyCol || LazyCol.seen(p.dataset.source);

function renderAll() {
  $$(".panel").forEach((p) => { if (shouldRender(p)) renderPanel(p); });
  if (window.Flags) Flags.refresh();
}

// หมวดย่อยคอลัมน์ CP (alert1): แยก CPF ออกจากเครือ CP (กรอง keyword ฝั่ง client)
// ⚠️ เจ้าของสั่ง (13 ส.ค. 2026): **เอาแค่ "ซีพีเอฟ" กับ "cpf" เท่านั้น**
// และ cpf ต้องตรงทั้งคำ ไม่งั้นไปจับ "CPFresh" (ทุเรียนแห่งชาติ CPFresh = คนละบริษัท)
// บทเรียนเดียวกับ SLAPP → slapped และ rcep → intercept — คำละตินต้องมีขอบคำเสมอ
const CPF_RE = /(?:(?<![a-z0-9])cpf(?![a-z0-9]))|ซีพีเอฟ/i;
const isCPF = (it) => CPF_RE.test((it.title || "") + " " + (it.snippet || ""));
// หมวดข่าว Google News (แบบหน้า IR) — กรอง keyword ฝั่ง client
const NEWS_CATS = [
  { key: "econ",   label: "💰 เศรษฐกิจ", kw: ["หุ้น","เศรษฐกิจ","จีดีพี","เงินบาท","ดอกเบี้ย","เงินเฟ้อ","ส่งออก","นำเข้า","ลงทุน","กำไร","ตลาดหุ้น","ปันผล","แบงก์","ธนาคาร","ผลประกอบการ","econom","gdp","inflation","export","import","invest","market","stock","finance","earnings","bank"] },
  { key: "agri",   label: "🍗 อาหาร/เกษตร", kw: ["หมู","ไก่","ไข่","กุ้ง","ปศุสัตว์","อาหารสัตว์","เกษตร","ข้าว","ประมง","เนื้อ","สุกร","ฟาร์ม","อาหาร","livestock","pork","poultry","agri","farm","food","shrimp","crop","harvest"] },
  { key: "retail", label: "🛒 ค้าปลีก/ผู้บริโภค", kw: ["ค้าปลีก","ค้าส่ง","ห้าง","ซูเปอร์","สะดวกซื้อ","ร้านสะดวกซื้อ","ค่าครองชีพ","ผู้บริโภค","อีคอมเมิร์ซ","ห้างสรรพสินค้า","โชห่วย","retail","consumer","e-commerce","ecommerce","mall","convenience","supermarket","wholesale"] },
  { key: "crisis", label: "🚨 วิกฤติ/ภัยพิบัติ", kw: ["โรคระบาด","ระบาด","อหิวาต์","ไข้หวัดนก","asf","โควิด","แผ่นดินไหว","น้ำท่วม","ภัยแล้ง","พายุ","ไฟไหม้","ไฟป่า","สึนามิ","ดินถล่ม","ภัยพิบัติ","อุบัติเหตุ","ฉุกเฉิน","วิกฤต","ภัยธรรมชาติ","disease","outbreak","pandemic","epidemic","earthquake","quake","flood","drought","storm","typhoon","wildfire","tsunami","disaster","emergency","crisis"] },
  { key: "pol",    label: "🏛️ การเมือง", kw: ["รัฐบาล","นายก","สภา","ครม","พรรค","เลือกตั้ง","กฎหมาย","นโยบาย","รัฐมนตรี","ภาษี","การเมือง","กกต","แบงก์ชาติ","มาตรการ","กระทรวง","govern","policy","election","parliament","minister","cabinet","regulation","tax","law"] },
];
const NEWS_MAP = Object.fromEntries(NEWS_CATS.map((c) => [c.key, c.kw.map((k) => k.toLowerCase())]));
function newsCatOf(it) {
  const hay = ((it.title || "") + " " + (it.snippet || "")).toLowerCase();
  for (const key of Object.keys(NEWS_MAP)) if (NEWS_MAP[key].some((k) => hay.includes(k))) return key;
  return "other";
}
// สร้างแถบชิปหมวด — ใช้ร่วมทั้ง CP group/CPF (alert1) และหมวดข่าว (news)
function injectCatChips(panel, cats, allLabel) {
  const source = panel.dataset.source;
  const row = document.createElement("div");
  row.className = "cats";
  row.innerHTML =
    `<button type="button" class="cat on" data-cat="">${allLabel}</button>` +
    cats.map((c) => `<button type="button" class="cat" data-cat="${c.key}">${c.label}</button>`).join("");
  $(".filters", panel).after(row);
  row.addEventListener("click", (e) => {
    const b = e.target.closest(".cat");
    if (!b) return;
    state.filters[source].cat = b.dataset.cat || null;
    $$(".cat", row).forEach((x) => x.classList.toggle("on", x === b));
    renderPanel(panel);
  });
}

function renderPanel(panel) {
  const source = panel.dataset.source;
  if (source === "trends") return renderTrends(panel);

  const bucket = state.data?.sources?.[source] || { items: [] };
  const f = state.filters[source] || { kw: "", rc: "all" };
  const kw = (state.gkw || "").trim().toLowerCase(); // global search (ทุกคอลัมน์ใช้คำเดียวกัน)

  const items = bucket.items.filter((it) => {
    if (window.Flags && Flags.isHidden(it.link)) return false;
    if (!withinRecency(it.publishedAt, f.rc)) return false;
    if (source === "alert1" && f.cat === "cpf" && !isCPF(it)) return false; // chip CPF
    if (source === "news" && f.cat && newsCatOf(it) !== f.cat) return false; // chip หมวดข่าว (แบบ IR)
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
        <div class="ttl">${hl(escapeHtml(it.title))}</div>
        ${it.snippet ? `<div class="snip">${hl(escapeHtml(it.snippet))}</div>` : ""}
        <div class="meta">${timeAgo(it.publishedAt)}</div>
        ${alsoHtml(it)}
      </a>`
    )
    .join("");
}


// ---- ดันเทรนด์ที่เกี่ยวกับเครือ CP / อาหาร ขึ้นบนสุด + ไฮไลต์ ----
// เช็คจากชื่อเทรนด์ + คำที่เกี่ยวข้อง + breakdown · ตัดชื่อลวงทิ้งก่อน (บีซีพีจี/ซีพีเอ็น
// มี "ซีพี" ซ่อนอยู่ข้างใน — บทเรียนเดียวกับคอลัมน์ CP)
// ⚠️ ทรูดิจิทัล พาร์ค = สถานที่ ไม่ใช่ข่าวของเครือ CP — ต้องตัดก่อนเช็คคำว่า "ทรู"
// จับเฉพาะที่มี พาร์ค/ปาร์ค/park ต่อท้าย ("ทรูดิจิทัล กรุ๊ป" เป็นบริษัทของทรูจริง ห้ามตัด)
const PIN_FALSE_RE = /บีแอลซีพี|blcp|ซีพีเอ็นจ?|cpn |บีซีพีจี|bcpg|บีซีพี|bcp |ทรู\s*ดิจิ(?:ทัล|ตอล)\s*(?:พาร์ค|ปาร์ค|park)|true\s*digital\s*park|ทรู\s*ธ?\s*โซเชี?ย?ล|truth\s*social|trump\s*media/gi;
// เพิ่ม เจียรวนนท์/chearavanont ให้ตรงกับ CP_BRANDS ฝั่ง server —
// เดิมข่าวที่มีแต่ชื่อผู้บริหารติดบนได้เพราะบังเอิญมีคำว่า 'ทรู' อยู่ในชื่อสถานที่ พอตัดสถานที่ออกก็หลุด
const PIN_CP_RE = /ซีพี|\bcpf\b|cp ?all|ซีพีเอฟ|เซเว่น|7-?eleven|แม็คโคร|makro|โลตัส|lotus|เจียไต๋|แอ็กซ์ตร้า|cpaxt|ทรู|true ?money|true ?corp|เจียรวนนท์|chearavanont/i;
// ⚠️ **คำอาหารที่กำกวม ห้ามตัดสินคนเดียว** (เจ้าของแจ้ง 14 ส.ค. 2026)
// "ดูสนุกเกอร์สด" ถูกไฮไลต์เป็นอาหาร เพราะคำอาหารคำเดียวไปโผล่ในคำค้นที่เกี่ยวข้อง
// (ชื่อเล่นนักกีฬา/ชื่อรายการ) — ภาษาไทยไม่มีช่องว่างคั่นคำ คำสั้นๆ จึงชนง่ายมาก
// วิธีเดียวกับ AMBIG_KW ที่ใช้ตอนจัดหมวดข่าวอยู่แล้ว: คำกำกวมต้องมีคำบริบทหนุนอย่างน้อย 1 คำ
//
// หมู(?!่) กัน "หมู่บ้าน" · เนื้อ(?!หา) กัน "เนื้อหา"
// STRONG = เจอคำเดียวก็เชื่อได้เลย (เป็นคำของอาหารจริงๆ ไม่ไปโผล่ที่อื่น)
const PIN_FOOD_STRONG_RE = /อาหาร|ปศุสัตว์|สุกร|บุฟเฟ่?ต์|ร้านอาหาร|ขนม|กาแฟ|ชานม|ราคาหมู|ผลไม้|เครื่องดื่ม|เบเกอ(?:รี่|อรี่)|ทุเรียน|ส้มตำ|ชาบู|หม่าล่า|ปิ้งย่าง|ไอศกรีม|ไอติม|คาเฟ่|\bfood\b|buffet|restaurant|cafe/i;
// AMBIG = เป็นคำอาหารก็จริง แต่ไปโผล่ในชื่อคน/สถานที่/เรื่องอื่นได้บ่อย → ต้องมีบริบทหนุน
const PIN_FOOD_AMBIG_RE = /หมู(?!่)|ไก่|ไข่|กุ้ง|เนื้อ(?!หา)|ฟาร์ม|เมนู|วัตถุดิบ|ผัก(?!ผ่อน)|\bนม\b|ข้าว(?!ของ)|ปลา(?!ย)|ทะเล|มะม่วง|กล้วย|แตงโม/i;
// บริบทที่ยืนยันว่าพูดถึงของกินจริง — ต้องเจอคู่กับคำกำกวมถึงจะนับ
// ⚠️ **ห้ามใส่คำสั้นที่ไปซ่อนอยู่ในคำอื่น** ภาษาไทยไม่มีช่องว่างคั่นคำ เคยพลาดมาแล้ว:
//   "ทอด" ซ่อนใน **ถ่ายทอด**สด · "นึ่ง" ซ่อนใน **หนึ่ง** · "ย่าง" ซ่อนใน **อย่าง**
//   "ผัด" ซ่อนใน **ผัด**วันประกันพรุ่ง · "สด" ซ่อนใน ถ่ายทอด**สด** · "ตลาด" ไปชนตลาดหุ้น
// เอาเฉพาะคำที่ยาวพอและไม่ไปโผล่ที่อื่น
const PIN_FOOD_CTX_RE = /อาหาร|อร่อย|ราคา|ครัว|ปรุง|แช่แข็ง|โภชนาการ|ปศุสัตว์|เกษตร|ส่งออก|เลี้ยง|ร้าน|สูตรอาหาร|เมนูอาหาร|recipe|menu|eat|cook/i;
// แบรนด์อาหารที่ในชื่อไม่มีคำว่าอาหารเลย — เดิมพึ่งหมวดของ Google จับให้ แต่เลขหมวดเชื่อไม่ได้
// (ดูหมายเหตุที่ pinScore) จึงต้องไล่ชื่อเอง · เพิ่มได้เรื่อยๆ แต่ **ห้ามใส่ชื่อที่ชนชื่อคน**
// เช่น "เบียร์" กับ "สุกี้" เป็นชื่อเล่นคนดังไทย ใส่แล้วจะดันข่าวคนขึ้นมาแทน
const PIN_FOOD_BRAND_RE = /starbucks|สตาร์บัคส์|mcdonald|แมค\s?โดนัลด์|\bkfc\b|เคเอฟซี|pizza|พิซซ่า|burger|เบอร์เกอร์|mixue|มิกซู|บิงซู|oishi|โออิชิ|เอ็มเค\s?สุกี้|ชาตรามือ|อินทนิล|amazon\s?cafe|ยำแซ่บ|สเวนเซ่น|swensen|dairy\s?queen|แดรี่ควีน|ชาบูชิ|sukishi|ซูกิชิ|bonchon|บอนชอน/i;

// หมวดที่ Google ติดมากับเทรนด์เอง — เลขและป้ายชุดเดียวกับ dropdown เลือกหมวดด้านบนคอลัมน์
// ไม่ต้องเดาจากคำ ไม่ต้องใช้ AI: Google บอกมาแล้วว่าเทรนด์ไหนอยู่หมวดไหน
//
// ⚠️ **เลขชุดนี้เคยผิดมาแล้ว และผิดแบบเงียบสนิท** (แก้ 12 ส.ค. 2026)
// ของเดิมข้าม "สิ่งแวดล้อม" (4) ไป เลข 4-11 เลยเลื่อนไปหมด — 5 ที่เขียนว่า "อาหาร"
// จริงๆ คือ "บันเทิง" ทำให้ดาราติดเทรนด์ถูกไฮไลต์เป็นเรื่องอาหารทุกวัน
// (เจอจาก "พัชราภา ไชยเชื้อ" ขึ้นไฮไลต์ทั้งที่ไม่ใช่ทั้งอาหารและเครือ CP)
// ของจริงคือ **เรียงตามตัวอักษรอังกฤษ 1-19** — All(0) · Autos · Beauty · Business ·
// Climate · Entertainment · Food · Games · Health · Hobbies · Jobs · Law · Other ·
// Pets · Politics · Science · Shopping · Sports · Technology · Travel
// ห้ามแทรก/ตัดหมวดกลางลิสต์เอง ต้องยึดลำดับตัวอักษรของ Google เท่านั้น
//
// ⚠️ ไม่ได้เอาไปโชว์บนการ์ดแล้ว (เจ้าของสั่งเอาป้ายหมวดออก) แต่ห้ามลบตารางนี้ทิ้ง —
// เป็นตัวยืนยันว่าเลขหมวดที่ FOOD_CAT อ้างถึงตรงกับ dropbox จริง (เทสต์ pintest เทียบให้)
// ลบทิ้งเมื่อไหร่ = FOOD_CAT กลายเป็นเลข 5 ลอยๆ ที่ไม่มีอะไรการันตีว่าคืออาหาร
const TREND_CATS = {
  1: "🚗 ยานยนต์", 2: "💄 ความงาม/แฟชั่น", 3: "💼 ธุรกิจ/การเงิน", 4: "🌍 สิ่งแวดล้อม",
  5: "🎬 บันเทิง", 6: "🍔 อาหาร/เครื่องดื่ม", 7: "🎮 เกม", 8: "🩺 สุขภาพ",
  9: "🎨 งานอดิเรก", 10: "🎓 งาน/การศึกษา", 11: "⚖️ กฎหมาย/ราชการ", 12: "📦 อื่นๆ",
  13: "🐾 สัตว์เลี้ยง", 14: "🏛️ การเมือง", 15: "🔬 วิทยาศาสตร์", 16: "🛍️ ช้อปปิ้ง",
  17: "⚽ กีฬา", 18: "💻 เทคโนโลยี", 19: "✈️ ท่องเที่ยว",
};
const FOOD_CAT = 6;
// ⚠️ **ห้ามเอา it.topics มาตัดสินว่าเป็นอาหารอีก** (12 ส.ค. 2026)
// เคยเชื่อเลขหมวดที่ Google ติดมากับเทรนด์ ผลคือไฮไลต์มั่วทุกวันและไล่แก้ไม่จบ:
//   เลข 5 → ดันดารา "พัชราภา ไชยเชื้อ" ขึ้นเป็นอาหาร
//   เลข 6 → ดันบอล "ปาแลร์โม่ พบ ยูเวนตุส" กับ "หวยลาว" ขึ้นเป็นอาหาร
// ไม่มีชุดเลขไหนอธิบายทั้งสามอันได้ = ตัวเลขที่ index 10 ของ payload **ไม่ใช่เลขหมวดที่เชื่อได้**
// (ยืนยันจากของจริงไม่ได้ด้วย — เครื่องที่รัน session ยิงเข้า Google และเข้าเว็บเราเองไม่ได้)
// ตอนนี้จึงตัดสินจาก "คำในชื่อเทรนด์" อย่างเดียว: ตรวจสอบได้ อธิบายได้ เขียนเทสต์ได้
function pinScore(it) {
  const hay = (it.title + " " + (it.snippet || "") + " " + ((it.related || []).map((r) => r.term || r).join(" ")))
    .toLowerCase().replace(PIN_FALSE_RE, " ");
  if (PIN_CP_RE.test(hay)) return 2; // เครือ CP มาก่อน
  if (PIN_FOOD_STRONG_RE.test(hay) || PIN_FOOD_BRAND_RE.test(hay)) return 1;
  // คำกำกวมต้องมีคำบริบทหนุน ไม่งั้น "ดูสนุกเกอร์สด" จะกลายเป็นข่าวอาหาร
  return PIN_FOOD_AMBIG_RE.test(hay) && PIN_FOOD_CTX_RE.test(hay) ? 1 : 0;
}

function renderTrends(panel) {
  const bucket = state.data?.sources?.trends || { items: [], error: null };
  const f = state.filters.trends || { kw: "" };
  const kw = (state.gkw || "").trim().toLowerCase(); // global search (ทุกคอลัมน์ใช้คำเดียวกัน)
  const items = bucket.items.filter(
    (it) => !kw || (it.title + " " + it.snippet).toLowerCase().includes(kw)
  );
  // เรื่องเครือ CP / อาหาร เด้งขึ้นบนสุด (sort เสถียร — ลำดับเดิมของ Google คงอยู่ในแต่ละกลุ่ม)
  // เปิดหมวด "อาหาร/เครื่องดื่ม" (cat 5) อยู่ = ทุกเทรนด์เป็นอาหารตามการจัดหมวด
  // ของ Google เอง — เชื่อ Google ดีกว่าเดาจากคำ (ลิสต์คำมีวันตกหล่น เช่น "ผลไม้")
  const foodCat = Number(state.trendsCat) === FOOD_CAT;
  items.forEach((it) => {
    const s = pinScore(it);
    it._pin = s || (foodCat ? 1 : 0);
    // ⚠️ ไฮไลต์ต้องบอกได้เสมอว่า "เพราะอะไร" — ไฮไลต์ลอยๆ คือที่มาของคำถาม
    // "ทำไมอันนี้ถึงเด่น ทั้งที่ไม่ใช่อาหารและไม่เกี่ยว CP" (12 ส.ค. 2026)
    // เปิดหมวดอาหารอยู่แล้วทุกแถวเป็นอาหาร ไม่ต้องติดป้ายให้รก จึงดูจาก s ไม่ใช่ _pin
    it._pinWhy = s === 2 ? "เครือ CP" : s === 1 ? "🍔 อาหาร" : "";
  });
  items.sort((a, b) => b._pin - a._pin);

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
    list.innerHTML = bucket.error
      ? `<div class="state">ดึงเทรนด์ไม่ได้</div>`
      : kw
      ? `<div class="state">ไม่พบคำที่ตรงกับตัวกรอง</div>`
      : bucket.loaded
      ? `<div class="state">ไม่มีเทรนด์ในหมวดนี้<br><span style="font-size:11px">Google ไม่ได้จัดอันดับหมวดนี้ในช่วงเวลาที่เลือก — ลองเปลี่ยนหมวดหรือขยายช่วงเวลา</span></div>`
      : WAITING;
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
      // ป้าย "เครือ CP" ต้องบอกเอง (Google ไม่มีหมวดนี้) ส่วนหมวดอื่นโชว์ตามที่ Google จัดมา
      const pin = it._pinWhy || "";
      return `<div class="trend${it._pin ? " pin" : ""}">
        <div class="trend-head" data-q="${escapeHtml(it.title)}">
          <span class="rank">${i + 1}</span>
          <div class="trend-main">
            <div class="trend-term">${escapeHtml(it.title)}${pin ? ` <span class="pinbadge">${pin}</span>` : ""}</div>
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
  box.innerHTML = `<div class="rel-h">📰 ข่าวที่เกี่ยวข้อง</div><div class="state waiting" style="padding:8px"><span class="spin"></span>กำลังโหลดข่าว…</div>`;

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
  if (source.startsWith("alert")) {
    if (bucket.feedCount > 0) {
      // มีฟีดแล้วแต่ยังไม่มีข่าวเข้าเงื่อนไข
      return `<div class="state">
        ✓ เพิ่มฟีด Alert แล้ว (${bucket.feedCount})<br><br>
        ยังไม่มีข่าวใหม่เข้าเงื่อนไขตอนนี้<br>
        <span style="font-size:11px">Google Alert จะมีรายการเมื่อพบเนื้อหาใหม่ที่ตรงคำ</span>
      </div>`;
    }
    // ฟีดตั้งไว้ใน trend-feeds.config.js อยู่แล้ว — ที่นับได้ 0 แปลว่ายังดึงไม่เสร็จ ไม่ใช่ยังไม่ได้ตั้ง
    return WAITING;
  }
  return WAITING;
}

// ---------- wire ----------
function wire() {
  $$(".panel").forEach((panel) => {
    const source = panel.dataset.source;
    state.filters[source] = { kw: "", rc: "all", trc: "all", cat: null };
    if (source === "alert1") injectCatChips(panel, [{ key: "cpf", label: "CPF" }], "CP group"); // CP group / CPF
    if (source === "news") injectCatChips(panel, NEWS_CATS, "ทั้งหมด"); // หมวดข่าว (แบบ IR)
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
    const catEl = $("[data-cat]", panel);
    if (catEl)
      catEl.addEventListener("change", (e) => {
        state.trendsCat = Number(e.target.value);
        reloadTrends();
      });
    const hoursEl = $("[data-hours]", panel);
    if (hoursEl)
      hoursEl.addEventListener("change", (e) => {
        state.trendsHours = Number(e.target.value);
        reloadTrends();
      });
  });
  const gs = $("#gsearch");
  if (gs) gs.addEventListener("input", (e) => { state.gkw = e.target.value; renderAll(); });
  $("#refresh").addEventListener("click", load);
  setupSwipeDots();
  setupLazyColumns();
}

// จุดบอกตำแหน่ง carousel มือถือ — คลิกเลื่อนไปคอลัมน์นั้น + ไฮไลต์ตามที่ปัด
function setupSwipeDots() {
  const dotsEl = $("#swipeDots");
  const board = $("#board");
  const panels = $$(".panel");
  if (!dotsEl || !board || !panels.length) return;
  dotsEl.innerHTML = panels.map((_, i) => `<span class="dot${i === 0 ? " on" : ""}" data-i="${i}"></span>`).join("");
  const dots = $$(".dot", dotsEl);
  dots.forEach((d, i) =>
    d.addEventListener("click", () => panels[i].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }))
  );
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio >= 0.5) {
          const i = panels.indexOf(e.target);
          dots.forEach((d, j) => d.classList.toggle("on", j === i));
        }
      }
    },
    { root: board, threshold: 0.5 }
  );
  panels.forEach((p) => io.observe(p));

  // ลูกศร ‹ › บอกให้ปัด (มือถือ) — กดเลื่อนได้ + ซ่อนเมื่อสุดทาง
  let arrows = $("#swipeArrows");
  if (!arrows) {
    arrows = document.createElement("div");
    arrows.id = "swipeArrows";
    arrows.innerHTML =
      '<button type="button" class="swipe-arrow left" aria-label="ก่อนหน้า">«</button>' +
      '<button type="button" class="swipe-arrow right" aria-label="ถัดไป">»</button>';
    document.body.appendChild(arrows);
  }
  const la = $(".left", arrows), ra = $(".right", arrows);
  const step = (d) => board.scrollBy({ left: d * (panels[0].getBoundingClientRect().width + 10), behavior: "smooth" });
  la.onclick = () => step(-1);
  ra.onclick = () => step(1);
  const upd = () => {
    la.classList.toggle("hide", board.scrollLeft <= 4);
    ra.classList.toggle("hide", board.scrollLeft + board.clientWidth >= board.scrollWidth - 4);
  };
  board.addEventListener("scroll", upd, { passive: true });
  upd();
}

// keyword ที่ตั้งไว้ (fallback ถ้า title ฟีดโดนตัดสั้น) — feed สดจาก Google จะ override เมื่อครบ
const HARD_KW = {
    alert2: `("หมอคางดำ" OR "ปลาหมอคางดำ" OR "ปลาหมอสีคางดำ" OR "เอเลี่ยนสปีชีส์" OR "ชนิดพันธุ์ต่างถิ่น" OR "PM2.5" OR "PM 2.5" OR "ฝุ่นพิษ" OR "ฝุ่นละอองขนาดเล็ก" OR "หมอกควัน" OR "เผาตอซัง" OR "เผาไร่ข้าวโพด" OR "ข้าวโพดรุกป่า" OR "ข้าวโพดเลี้ยงสัตว์" OR "ทารุณสัตว์" OR "ทรมานสัตว์" OR "ทารุณกรรมสัตว์" OR "สวัสดิภาพสัตว์" OR "อาหารปนเปื้อน" OR "สารปนเปื้อน" OR "สารตกค้าง" OR "อาหารเป็นพิษ" OR "เนื้อสัตว์ปนเปื้อน" OR "ยาปฏิชีวนะตกค้าง" OR "เรียกคืนสินค้า" OR "ปล่อยน้ำเสีย" OR "น้ำเสียโรงงาน" OR "มลพิษทางน้ำ" OR "น้ำเน่าเสีย" OR "ปลาตายเกลื่อน" OR "กลิ่นเหม็นโรงงาน" OR "ชาวบ้านร้องเรียนโรงงาน" OR "กรมควบคุมมลพิษ" OR "มูลนิธิเพื่อผู้บริโภค" OR "สภาผู้บริโภค" OR "ไข่แพง" OR "ราคาไข่" OR "หมูแพง" OR "ราคาหมู" OR "ไก่แพง" OR "ราคาไก่" OR "คอนแทร็คฟาร์มมิ่ง" OR "คอนแทรกต์ฟาร์มมิ่ง" OR "คอนแทรคฟาร์มมิ่ง" OR "contract farming" OR "เกษตรพันธสัญญา" OR "สัญญาทาส" OR "อาหารแปรรูปก่อมะเร็ง" OR "อาหารแปรรูปเสี่ยงมะเร็ง" OR "เนื้อแปรรูปก่อมะเร็ง" OR "เนื้อแปรรูปเสี่ยงมะเร็ง" OR "ไนเตรดในไส้กรอก" OR "ไนไตรท์ในไส้กรอก" OR "สารไนเตรดในไส้กรอก" OR "สารไนไตรท์ในไส้กรอก" OR "ไส้กรอกก่อมะเร็ง" OR "อาหารไมโครเวฟ" OR "บรรจุภัณฑ์พลาสติก" OR "พลาสติกสัมผัสอาหาร" OR "สารเคมีจากบรรจุภัณฑ์" OR "เชื้อดื้อยา" OR "การดื้อยาปฏิชีวนะ" OR "ดื้อยาต้านจุลชีพ" OR "บริษัทยักษ์ใหญ่" OR "กลุ่มทุนยักษ์ใหญ่" OR "ทุนผูกขาด" OR "SLAPP" OR "คดี SLAPP" OR "ฟ้องปิดปาก" OR "ดำเนินคดีปิดปาก" OR "blackchin tilapia" OR "invasive species Thailand" OR "animal cruelty Thailand" OR "wastewater discharge"OR "สัตว์ต่างถิ่น" OR "เอเลียนสปีชีส์" OR "เอเลี่ยน สปีชีส์" OR "alien species" OR "invasive species") -linkedin -jobdb -career -Jooble -shopee -หวย -เลขเด็ด -"ทำนายฝัน" -เมนู -recipe -livescore -sport -เอสเอไอซี -saic`,
};
function applyKeywords() {
  if (!window.Flags) return;
  const map = {};
  // ทุกคอลัมน์ Alert ต้องมีรายการ keyword ให้ดู ไม่ใช่เฉพาะที่เขียน HARD_KW ไว้
  // (ปุ่ม 🔤 ดู keyword ขึ้นทุกคอลัมน์ Alert แล้ว — ถ้าไม่ใส่ตรงนี้จะกดแล้วว่างเปล่า)
  const srcs = new Set([
    ...Object.keys(HARD_KW),
    ...$$(".panel[data-source]").map((p) => p.dataset.source).filter((s) => s.startsWith("alert")),
  ]);
  for (const src of srcs) {
    const feedQ = state.data?.sources?.[src]?.queries || [];
    const hard = HARD_KW[src];
    // ยึดอันที่ได้คำมากกว่า — Google ตัด title ให้สั้นเมื่อ query ยาว คำท้ายๆ จะหายไปเงียบๆ
    if (!hard) map[src] = feedQ;
    else map[src] = Flags.parseKw(feedQ).length >= Flags.parseKw(hard).length ? feedQ : hard;
  }
  Flags.setKeywords(map);
}
if (window.Flags) {
  Flags.init({ onChange: renderAll, ui: "kw" }); // เหลือแต่ปุ่ม ➕ เพิ่ม keyword · 🚩 คำแนะนำตัดข่าว ย้ายไป /admin/
  Flags.setKeywords(HARD_KW); // แสดงทันทีก่อนโหลด
}
wire();
load();
// ---- auto-update: เช็คว่ามีโค้ดใหม่ deploy หรือยัง แล้วอัปเดตเองแม้ไม่ปิดแท็บ ----
// แยกจาก auto-refresh: ข้อมูลรีเฟรชทุก 3 นาที · โค้ดเช็ควันละครั้ง (deploy นานๆ ที ไม่ต้องถี่)
// ⚠️ อ่านเลขเวอร์ชันจาก <script src="./app.js?v=NNN"> ตรงๆ ห้ามฮาร์ดโค้ดซ้ำ
// ของเดิมเขียนเลขไว้ที่นี่อีกที่หนึ่ง แล้ว "ลืม bump คู่กัน" — พอเลขในโค้ดต่ำกว่าใน index.html
// ทุกครั้งที่เช็คจะเจอว่า "มีเวอร์ชันใหม่" แล้วเด้งแถบ/รีโหลด ทั้งที่รีโหลดมาก็ได้เลขเดิม วนไม่จบ
// (เกิดจริง: /trend/ ค้างที่ 102 ทั้งที่หน้าเป็น 104 · /issue/ 52 vs 53)
const APP_VER = (() => {
  const s = document.querySelector('script[src*="app.js"]');
  const m = s && (s.getAttribute("src") || "").match(/v=(\d+)/);
  return m ? parseInt(m[1], 10) : Infinity; // อ่านไม่ได้ = ไม่เดา ไม่กวนผู้ใช้
})();
const CODE_CHECK_MS = 24 * 60 * 60 * 1000; // เช็คโค้ดใหม่วันละครั้ง (เจ้าของเลือกเอง — 10 นาทีถี่ไป)
let updateReady = false;
let lastCodeCheck = Date.now(); // เพิ่งโหลดโค้ดล่าสุด → เริ่มนับใหม่
function showUpdateBanner() {
  if (document.getElementById("updbar")) return;
  const b = document.createElement("button");
  b.id = "updbar";
  b.textContent = "🔄 มีเวอร์ชันใหม่ — แตะเพื่ออัปเดต";
  b.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;border:0;border-radius:999px;padding:11px 20px;background:#2563eb;color:#fff;font:600 14px/1 system-ui,-apple-system,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer";
  b.onclick = () => location.reload();
  document.body.appendChild(b);
}
// reload เงียบได้ไม่เกิน 1 ครั้ง/ชม. (กัน loop ช่วง CDN กระจายไฟล์ไม่ครบ) — เกินนั้นโชว์แถบแทน
function canAutoReload() {
  try {
    const t = +sessionStorage.getItem("lastAutoReload") || 0;
    if (Date.now() - t < 60 * 60 * 1000) return false;
    sessionStorage.setItem("lastAutoReload", String(Date.now()));
  } catch {}
  return true;
}
function onUpdateFound() {
  if (updateReady) return;
  updateReady = true;
  if (document.hidden && canAutoReload()) location.reload(); // ผู้ใช้ไม่ได้ดูอยู่ → รีโหลดเงียบ
  else showUpdateBanner();
}
async function checkForUpdate() {
  lastCodeCheck = Date.now();
  try {
    const html = await fetch("./?_ct=" + Date.now(), { cache: "no-store" }).then((r) => r.text());
    const m = html.match(/app\.js\?v=(\d+)/);
    if (m && parseInt(m[1], 10) > APP_VER) onUpdateFound();
  } catch {}
}
function maybeCheckForUpdate() { if (Date.now() - lastCodeCheck >= CODE_CHECK_MS) checkForUpdate(); }
// กลับเข้าแอปก็ยังยึดรอบวันละครั้ง (เจ้าของสั่ง 11 ส.ค. 2026 — เดิมเว้นแค่ 60 วิ
// เท่ากับเช็คแทบทุกครั้งที่สลับกลับมา ถี่เกินจำเป็นเพราะ deploy ไม่ได้บ่อยขนาดนั้น)
function checkOnResume() { maybeCheckForUpdate(); }
// ข้อมูล: รีเฟรชเงียบทุก 3 นาที
setInterval(() => { if (!document.hidden) load({ silent: true }); }, 3 * 60 * 1000);
// โค้ด: เช็คชั่วโมงละครั้ง แต่ยิงจริงเมื่อครบ 24 ชม.
setInterval(() => { if (!document.hidden) maybeCheckForUpdate(); }, 60 * 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (updateReady) { location.reload(); return; } // เจอเวอร์ชันใหม่ตอนแท็บซ่อน → รีโหลดตอนกลับมา
  if (state.data && Date.now() - (new Date(state.data.generatedAt || 0)).getTime() > 3 * 60 * 1000) load({ silent: true });
  checkOnResume();
});
