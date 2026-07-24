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
  { key: "econ",   label: "💰 เศรษฐกิจ", kw: ["หุ้น","เศรษฐกิจ","จีดีพี","เงินบาท","ดอกเบี้ย","เงินเฟ้อ","ส่งออก","นำเข้า","ลงทุน","กำไร","ตลาดหุ้น","ปันผล","แบงก์","ธนาคาร","ผลประกอบการ","econom","gdp","inflation","export","import","invest","market","stock","finance","earnings","bank"] },
  { key: "agri",   label: "🍗 อาหาร/เกษตร", kw: ["หมู","ไก่","ไข่","กุ้ง","ปศุสัตว์","อาหารสัตว์","เกษตร","ข้าว","ประมง","เนื้อ","สุกร","ฟาร์ม","อาหาร","livestock","pork","poultry","agri","farm","food","shrimp","crop","harvest"] },
  { key: "retail", label: "🛒 ค้าปลีก/ผู้บริโภค", kw: ["ค้าปลีก","ค้าส่ง","ห้าง","ซูเปอร์","สะดวกซื้อ","ร้านสะดวกซื้อ","ค่าครองชีพ","ผู้บริโภค","อีคอมเมิร์ซ","ห้างสรรพสินค้า","โชห่วย","retail","consumer","e-commerce","ecommerce","mall","convenience","supermarket","wholesale"] },
  { key: "crisis", label: "🚨 วิกฤติ/ภัยพิบัติ", kw: ["โรคระบาด","ระบาด","อหิวาต์","ไข้หวัดนก","asf","โควิด","แผ่นดินไหว","น้ำท่วม","ภัยแล้ง","พายุ","ไฟไหม้","ไฟป่า","สึนามิ","ดินถล่ม","ภัยพิบัติ","อุบัติเหตุ","ฉุกเฉิน","วิกฤต","ภัยธรรมชาติ","disease","outbreak","pandemic","epidemic","earthquake","quake","flood","drought","storm","typhoon","wildfire","tsunami","disaster","emergency","crisis"] },
  { key: "pol",    label: "🏛️ การเมือง", kw: ["รัฐบาล","นายก","สภา","ครม","พรรค","เลือกตั้ง","กฎหมาย","นโยบาย","รัฐมนตรี","ภาษี","การเมือง","กกต","แบงก์ชาติ","มาตรการ","กระทรวง","govern","policy","election","parliament","minister","cabinet","regulation","tax","law"] },
];
const CAT_MAP = Object.fromEntries(CATS.map((c) => [c.key, c.kw.map((k) => k.toLowerCase())]));

// หมวดย่อยของ Alert 2 (ปศุสัตว์/อาหาร/การค้า) — กรอง keyword ฝั่ง client
const ALERT2_CATS = [
  { key: "price",   label: "💰 ราคา/ต้นทุน",    kw: ["ราคาหมู","ราคาสุกร","ราคาไก่","ราคาไข่","ราคากุ้ง","ราคาอาหารสัตว์","ต้นทุน","ราคาข้าวโพด","กากถั่วเหลือง","ปลาป่น","หน้าฟาร์ม","price"] },
  { key: "disease", label: "🦠 โรคระบาด",       kw: ["อหิวาต์","asf","ไข้หวัดนก","h5n1","โรคระบาด","โรคกุ้ง","กุ้งตาย","กักกันโรค","ปิดฟาร์ม","swine fever","avian influenza","bird flu","foot and mouth"] },
  { key: "trade",   label: "🚢 นำเข้า-ส่งออก",   kw: ["เถื่อน","ลักลอบ","นำเข้า","ส่งออก","โควตา","ภาษี","สงครามการค้า","import","export","ban","iuu","ประมงผิดกฎหมาย"] },
  { key: "policy",  label: "🏛️ นโยบาย/ราชการ",  kw: ["กรม","กระทรวง","รมว","มาตรการ","ตรึงราคา","ควบคุมราคา","แทรกแซง","ประกันรายได้","สหกรณ์","สภาเกษตรกร","ช่วยเหลือเกษตรกร"] },
  { key: "company", label: "🏢 บริษัท/สมาคม",    kw: ["เบทาโกร","ไทยยูเนี่ยน","ไทยฟู้ดส์","betagro","thai union","gfpt","cargill","brf","jbs","สมาคม"] },
  { key: "risk",    label: "🌦️ ภัย/ความปลอดภัย", kw: ["น้ำท่วม","ภัยแล้ง","เอลนีโญ","ลานีญา","ภัยพิบัติ","เรียกคืน","ปนเปื้อน","สวัสดิภาพสัตว์","ไก่ไร้กรง","cage free","ยาปฏิชีวนะ","แรงงาน"] },
];
const ALERT2_MAP = Object.fromEntries(ALERT2_CATS.map((c) => [c.key, c.kw.map((k) => k.toLowerCase())]));

function catsForSource(source) {
  if (source === "alert2") return ALERT2_CATS;
  if (source === "newsth" || source === "newsintl") return CATS;
  return null;
}
// หมวดของ item: news ใช้ it.cat (AI/keyword จาก server) ถ้ามี; alert2 ใช้ keyword ฝั่ง client
function catOf(it, source) {
  // ผู้ใช้จัดหมวดเอง (override) มาก่อนเสมอ — เฉพาะคอลัมน์ข่าว
  if (window.Flags && source.indexOf("news") === 0) {
    const o = Flags.getCat(it.link);
    if (o) return o;
  }
  const map = source === "alert2" ? ALERT2_MAP : CAT_MAP;
  if (source !== "alert2" && it.cat) return it.cat;
  const hay = ((it.title || "") + " " + (it.snippet || "")).toLowerCase();
  for (const key of Object.keys(map)) if (map[key].some((k) => hay.includes(k))) return key;
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
  return s.replace(/\[\[hl\]\]([\s\S]*?)\[\[\/hl\]\]/g, '<mark class="hl">$1</mark>').replace(/\[\[\/?hl\]\]/g, "").replace(/[\u0001\u0002]/g, "");
}
function withinRecency(iso, hours) {
  if (hours === "all") return true;
  return new Date(iso).getTime() >= Date.now() - Number(hours) * 3600000;
}

// ---------- data ----------
const MAX_RENDER = 100; // การ์ดสูงสุดต่อคอลัมน์ (กรองบนข้อมูลเต็ม แต่เรนเดอร์เท่านี้ = ลื่นขึ้น)
const SNAP_KEY = "ir_feeds_snapshot"; // แคชล่าสุดใน localStorage → เปิดมาเห็นทันที

function saveSnapshot(data) {
  try {
    const trimmed = { generatedAt: data.generatedAt, sources: {}, errors: data.errors || [] };
    for (const k of Object.keys(data.sources || {})) {
      trimmed.sources[k] = { ...data.sources[k], items: (data.sources[k].items || []).slice(0, MAX_RENDER) };
    }
    localStorage.setItem(SNAP_KEY, JSON.stringify(trimmed));
  } catch {}
}
function loadSnapshot() {
  try { const s = localStorage.getItem(SNAP_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}

async function load() {
  const btn = $("#refresh");
  btn.disabled = true;

  // เปิดมาเห็นข่าวเดิมทันที (จาก localStorage) แทนหน้าจอโหลดเปล่า ๆ
  const snap = loadSnapshot();
  if (snap && !state.data) {
    state.data = snap;
    renderAll();
    $("#updated").textContent = "กำลังอัปเดต…";
  } else if (!state.data) {
    $("#updated").textContent = "กำลังโหลด…";
    $$(".panel").forEach((p) => {
      $("[data-list]", p).innerHTML = `<div class="state skeleton">กำลังดึงข้อมูล…</div>`;
    });
  } else {
    $("#updated").textContent = "กำลังอัปเดต…";
  }

  try {
    const feeds = await fetch("/api/ir/feeds").then((r) => r.json());
    state.data = feeds;
    saveSnapshot(feeds);
    $("#updated").textContent =
      "อัปเดตล่าสุด " + new Date(feeds.generatedAt || Date.now()).toLocaleTimeString("th-TH");
    renderAll();
  } catch (e) {
    if (state.data) {
      $("#updated").textContent = "อัปเดตไม่สำเร็จ (ใช้ข้อมูลล่าสุด)";
    } else {
      $("#updated").textContent = "โหลดไม่สำเร็จ";
      $$(".panel").forEach((p) => {
        $("[data-list]", p).innerHTML = `<div class="state error">ดึงข้อมูลไม่สำเร็จ: ${escapeHtml(e.message)}</div>`;
      });
    }
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
    if (f.cat && catOf(it, source) !== f.cat) return false;
    return true;
  });

  setCount(panel, source, items.length);
  const list = $("[data-list]", panel);

  if (items.length === 0) {
    list.innerHTML = emptyState(source, bucket, kw || f.rc !== "all");
    return;
  }

  list.innerHTML = items.slice(0, MAX_RENDER).map((it) => cardHtml(it, source)).join("");
  if (items.length > MAX_RENDER) {
    list.insertAdjacentHTML("beforeend",
      `<div class="state" style="padding:14px">แสดง ${MAX_RENDER} จาก ${items.length} — พิมพ์ค้นหา/เลือกหมวดเพื่อกรองให้แคบลง</div>`);
  }
}

function cardHtml(it, source) {
  return `<a class="card" href="${escapeHtml(it.link)}" target="_blank" rel="noopener">
    ${window.Flags ? Flags.button(it, source) : ""}
    ${window.Flags ? Flags.catButton(it, source) : ""}
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
  setupSwipeDots();
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

// ชิพหมวดข่าว — ใส่เฉพาะคอลัมน์ข่าว (ในประเทศ/ต่างประเทศ)
function injectCats(panel) {
  const source = panel.dataset.source;
  const cats = catsForSource(source);
  if (!cats) return;
  const row = document.createElement("div");
  row.className = "cats";
  row.innerHTML =
    `<button type="button" class="cat on" data-cat="">ทั้งหมด</button>` +
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

if (window.Flags) {
  Flags.init({ onChange: renderAll, cats: CATS });
  // รายการ keyword ที่ตั้งไว้ใน Alert 2 (ปศุสัตว์) — รวม 5 ธีม → โชว์ในปุ่ม 🔤 ดู keyword
  Flags.setKeywords({
    alert2: [
      `"ราคาหมู" OR "ราคาสุกร" OR "หมูหน้าฟาร์ม" OR "ราคาไก่" OR "ไก่หน้าฟาร์ม" OR "ราคาไข่ไก่" OR "ราคากุ้ง" OR "ราคาอาหารสัตว์" OR "ต้นทุนอาหารสัตว์" OR "ราคาข้าวโพด" OR "กากถั่วเหลือง" OR "ปลาป่น" OR "หมูเป็น" OR "ราคาลูกสุกร" OR "ข้าวโพดเลี้ยงสัตว์" OR "ถั่วเหลือง" OR "ต้นทุนการเลี้ยง" OR "ราคาตกต่ำ" OR "หมูแพง" OR "ไข่แพง"`,
      `"อหิวาต์แอฟริกา" OR "อหิวาต์สุกร" OR "African swine fever" OR ASF OR "ไข้หวัดนก" OR "avian influenza" OR "bird flu" OR H5N1 OR PRRS OR "โรคระบาดสัตว์" OR "โรคปากและเท้าเปื่อย" OR "foot and mouth disease" OR "โรคกุ้ง" OR "โรคตัวแดงดวงขาว" OR "กุ้งตาย" OR "หมูตาย" OR "ไก่ตายยกฟาร์ม" OR "ทำลายซาก" OR "อาหารปนเปื้อน" OR "ซาลโมเนลลา" OR "เชื้อดื้อยา" OR "เรียกคืนสินค้า" OR "ปิดฟาร์ม" OR "ภัยแล้ง" OR "เอลนีโญ" OR "ลานีญา" OR "พื้นที่การเกษตรเสียหาย"`,
      `"หมูเถื่อน" OR "เนื้อเถื่อน" OR "ไก่เถื่อน" OR "กุ้งเถื่อน" OR "ลักลอบนำเข้า" OR "ห้ามนำเข้า" OR "ระงับนำเข้า" OR "ภาษีนำเข้า" OR "โควตานำเข้า" OR "กำแพงภาษี" OR "ภาษีทรัมป์" OR "ภาษีตอบโต้" OR "ทุ่มตลาด" OR "ศุลกากร" OR "ด่านกักกัน" OR "ส่งออกไก่" OR "ส่งออกกุ้ง" OR "ส่งออกหมู" OR "ส่งออกอาหาร" OR "ส่งออกเนื้อสัตว์" OR "ยอดส่งออก" OR "ตลาดส่งออก" OR FTA OR "สงครามการค้า"`,
      `"กรมปศุสัตว์" OR "กรมประมง" OR "กรมการค้าภายใน" OR "กระทรวงเกษตรและสหกรณ์" OR "กระทรวงพาณิชย์" OR "เศรษฐกิจการเกษตร" OR "สศก." OR "มกอช." OR "รมว.เกษตร" OR "รมว.พาณิชย์" OR "ปศุสัตว์จังหวัด" OR "ตรึงราคา" OR "ควบคุมราคา" OR "ประกันรายได้" OR "ช่วยเหลือเกษตรกร" OR "เยียวยาเกษตรกร" OR "พิกบอร์ด" OR "เอ้กบอร์ด" OR "สมาคมผู้เลี้ยงสุกร" OR "สมาคมผู้เลี้ยงไก่ไข่" OR "สมาคมผู้ผลิตอาหารสัตว์" OR "สภาเกษตรกร" OR "สวัสดิภาพสัตว์" OR "ไก่ไร้กรง"`,
      `เบทาโกร OR Betagro OR "ไทยฟู้ดส์" OR "ไทยยูเนี่ยน" OR "Thai Union" OR GFPT OR TFG OR TGM OR "แหลมทอง" OR "ลีพัฒนา" OR "บางกอกแร้นช์" OR "ซันฟีด" OR Cargill OR BRF OR JBS OR "New Hope Group" OR Tyson OR Muyuan OR "WH Group" OR Smithfield OR "Thailand poultry" OR "Thailand shrimp" OR "Thai pork" OR "Thailand food export" OR "cage free" OR IUU OR "Brazil chicken" OR "China pork import"`,
    ],
  });
}
wire();
load();
