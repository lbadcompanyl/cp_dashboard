// Trend Dashboard — frontend logic (vanilla JS)

const state = {
  data: null, // { sources: { news, alert, trends }, errors }
  filters: {}, // per-source { kw, rc }
  trendsGeo: "TH",
  trendsHours: 24, // Past 4/24/48/168 ชม. (แบบ Google Trending Now)
  trendsCat: 0, // หมวดหมู่ (แบบ Google Trends): 0 = ทุกหมวด
  xCat: null,        // หมวดที่เลือกในคอลัมน์ X (null = ทุกหมวด)
  xGeo: "thailand",  // ประเทศของคอลัมน์ X (เป็น slug ของเว็บมิเรอร์ ไม่ใช่รหัส ISO)
  // ข่าว/ทั่วไป — ค่าตั้งต้นต่างกันโดยตั้งใจ ตามธรรมชาติของแต่ละแหล่ง
  // X: ต้นทางให้ท็อป 50 มาชุดเดียว ขอชาร์ตข่าวแยกไม่ได้ และเทรนด์บน X ส่วนใหญ่
  //    เป็นแฟนคลับ/ศิลปิน ถ้าตั้งต้นเป็นข่าวจะเหลือไม่กี่รายการ → ตั้งต้นทั่วไป
  // YouTube: ขอชาร์ตหมวดข่าวจาก API ได้จริง จึงตั้งต้นเป็นข่าวได้เต็มคอลัมน์
  xKind: "all",
  ytKind: "news",
  ytGeo: "TH",       // ประเทศของคอลัมน์ YouTube (รหัส ISO 2 ตัว)
  // ปุ่มที่กดได้: "growth" (มาแรง — ตั้งต้น) · "rank" (อันดับจาก YouTube) · "new" (ใหม่ล่าสุด)
  // "views" ไม่มีปุ่มแล้ว แต่โค้ดยังต้องรองรับ — ใช้เป็นตัวถอยเวลาสถิติยังไม่พอเทียบ "มาแรง"
  ytSort: "growth",
  ytWin: 24,         // ช่วงเวลาที่ใช้วัด "มาแรง" (ชม.) — ใช้เฉพาะตอน ytSort = "growth"
  ytHideLive: true,  // ไลฟ์ไม่มียอดวิวสะสมให้เทียบ ปกติจึงซ่อนไว้
  // คอลัมน์ "เช็ค Trend" — ผลของคำที่เพิ่งเช็ค เก็บใน state เพราะ renderAll() ทุก 3 นาที
  // สร้าง innerHTML ใหม่ทั้งก้อน ถ้าเก็บไว้ใน DOM อย่างเดียวผลจะหายทุกรอบ
  kwq: "", kwGeo: "TH", kwTime: "today 12-m",
  kwShown: null, // { q, geo, time } ของคำที่กำลังแสดงอยู่ · kwRes = ตัวเลขจาก Keyword Planner (ถ้ามี)
  kwRes: null,
  related: {}, // cache related-queries responses keyed by geo|time|query
  trendBreakdown: {}, // title -> [คำที่เกี่ยวข้อง] จาก Trending Now (fallback)
  trendNewsIds: {}, // title -> article id triplets
  trendNews: {}, // title -> resolved news articles (cache)
  trendOpen: {}, // title -> กางอยู่ไหม
  // ⚠️ ต้องจำไว้ใน state ไม่ใช่ปล่อยให้อยู่ใน DOM อย่างเดียว
  // auto-refresh ทุก 3 นาทีสร้าง innerHTML ใหม่ทั้งก้อน ของที่กางอยู่จะยุบหมด
  // ลิสต์สั้นลง → ค่า scroll ที่คืนกลับเกินความสูงใหม่ → หน้าเด้งกลับขึ้นบนกลางที่อ่านอยู่
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
// คอลัมน์ที่ "ไม่ได้" มาจากรอบโหลดนี้ — โหลดเองแยก หรือรอผู้ใช้สั่ง
//   yttrends : โหลดแยกเพราะต้นทางสาธารณะอืด และเขียน skeleton/error ของตัวเองอยู่แล้ว
//   kwcheck  : ไม่มีข้อมูลอัตโนมัติเลย รอผู้ใช้พิมพ์คำ
// ⚠️ ถ้าเหวี่ยง skeleton/error ใส่ทุกคอลัมน์ สองอันนี้จะขึ้น "ดึงข้อมูลไม่สำเร็จ"
// ทั้งที่ตัวเองไม่ได้พังและยังกดใช้ได้ตามปกติ
const SELF_LOADING = new Set(["yttrends", "kwcheck"]);
const feedPanels = () => $$(".panel").filter((p) => !SELF_LOADING.has(p.dataset.source));

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
    const [feeds, trends, xtrends] = await Promise.all([
      fetch("/api/trend/feeds").then((r) => r.json()),
      fetchTrends(state.trendsGeo, state.trendsHours, state.trendsCat),
      fetchXTrends(state.xGeo).catch((e) => ({ label: "X Trends", items: [], error: e.message })),
    ]);
    feeds.sources.trends = trends;
    feeds.sources.xtrends = xtrends;
    // คอลัมน์ YouTube อ่านจาก instance สาธารณะที่ล่มบ่อย จึงโหลดแยก ไม่รวมใน Promise.all
    // ข้างบน — ถ้ารวมแล้วต้นทางอืด ทั้งบอร์ดจะค้างรอตามไปด้วย
    reloadYTTrends({ silent }).catch(() => {}); // ไม่ await และไม่ให้ error หลุดออกมาล้มคอลัมน์อื่น
    state.data = feeds;
    $("#updated").textContent =
      "อัปเดตล่าสุด " + new Date(feeds.generatedAt || Date.now()).toLocaleTimeString("th-TH");
    // จำตำแหน่ง scroll ของแต่ละคอลัมน์ + หน้า แล้วคืนหลัง render (กัน auto-refresh กระโดด)
    const sp = silent ? $$(".panel [data-list]").map((el) => el.scrollTop) : null;
    const wy = silent ? window.scrollY : 0;
    renderAll();
    applyKeywords(); // sync ปุ่ม 🔤 จาก query สดของฟีด (ถ้าครบ)
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
  };
}

// ---------- เทรนด์บน X (Twitter) ----------
// อ่านจากเว็บมิเรอร์ผ่าน /api/trend/xtrends (endpoint ทางการของ X อยู่ tier Pro)
async function fetchXTrends(geo) {
  const res = await fetch(`/api/trend/xtrends?geo=${encodeURIComponent(geo)}`);
  const d = await res.json();
  return {
    label: "X Trends",
    items: d.trends || [],
    error: d.error || null,
    stale: !!d.stale,
    source: d.source || "",
    fetchedAt: d.fetchedAt || null,
    sourceUpdatedAt: d.sourceUpdatedAt || null,
    cats: (d.meta && d.meta.cats) || null,
  };
}

async function reloadXTrends() {
  const panel = $('.panel[data-source="xtrends"]');
  $("[data-list]", panel).innerHTML = `<div class="state waiting"><span class="spin"></span>กำลังดึงเทรนด์…</div>`;
  try {
    state.data.sources.xtrends = await fetchXTrends(state.xGeo);
  } catch (e) {
    state.data.sources.xtrends = { label: "X Trends", items: [], error: e.message };
  }
  renderPanel(panel);
}

// ปุ่ม ข่าว/ทั่วไป อยู่ใน index.html แบบตายตัว — render รอบใหม่ไม่ได้เขียนทับให้
// จึงต้องมาป้ายคลาส on ตาม state เอง ไม่งั้นปุ่มจะค้างที่ค่าตั้งต้นตลอด
function syncKindToggle(panel, sel, cur) {
  const row = $(sel, panel);
  if (!row) return;
  $$("[data-k]", row).forEach((b) => b.classList.toggle("on", b.dataset.k === cur));
}

// โหมด "ข่าว" = ตัดหมวดบันเทิงออก ตามที่ตกลงไว้: เกม เพลง บันเทิง กีฬา หนัง คลิปตลก
// (หนังกับคลิปตลกอยู่ในหมวดบันเทิงของทั้งสองคอลัมน์อยู่แล้ว ไม่ได้แยกออกมา)
const X_NEWS_SKIP = ["ent", "sport"];
const YT_NEWS_SKIP = ["game", "music", "sport", "ent"];

const X_CATS = [
  { k: "ent",   label: "🎬 บันเทิง" },
  { k: "biz",   label: "🛍️ แบรนด์/สินค้า" },
  { k: "pol",   label: "🏛️ การเมือง" },
  { k: "sport", label: "⚽ กีฬา" },
  { k: "news",  label: "📰 ข่าว" },
  { k: "other", label: "❓ อื่นๆ" },
];

// แถวปุ่มหมวด — โชว์เฉพาะหมวดที่มีข้อมูลจริง พร้อมจำนวน
function renderXCats(panel, all) {
  let row = $(".xcats", panel);
  if (!row) {
    row = document.createElement("div");
    row.className = "xcats";
    $(".filters", panel).after(row);
    row.addEventListener("click", (e) => {
      const b = e.target.closest(".cat");
      if (!b) return;
      state.xCat = b.dataset.cat || null;
      renderXTrends(panel);
    });
  }
  const n = {};
  all.forEach((t) => { n[t.cat || "other"] = (n[t.cat || "other"] || 0) + 1; });
  const chips = [`<button class="cat${state.xCat ? "" : " on"}" data-cat="">ทั้งหมด ${all.length}</button>`]
    .concat(X_CATS.filter((c) => n[c.k]).map(
      (c) => `<button class="cat${state.xCat === c.k ? " on" : ""}" data-cat="${c.k}">${c.label} ${n[c.k]}</button>`
    ));
  row.innerHTML = chips.join("");
}

function renderXTrends(panel) {
  const bucket = state.data?.sources?.xtrends || { items: [], error: null };
  const kw = (state.gkw || "").trim().toLowerCase(); // global search ใช้คำเดียวกับคอลัมน์อื่น
  const found = bucket.items.filter((it) => !kw || it.name.toLowerCase().includes(kw));
  // X ไม่มีชาร์ตข่าวแยก จึงกรองจากหมวดที่จัดไว้แล้วฝั่งนี้
  const all = state.xKind === "news"
    ? found.filter((it) => !X_NEWS_SKIP.includes(it.cat || "other"))
    : found;
  const items = state.xCat ? all.filter((it) => (it.cat || "other") === state.xCat) : all;

  const countEl = $("[data-count]", panel);
  if (bucket.error && bucket.items.length === 0) {
    countEl.className = "errbadge";
    countEl.textContent = "⚠ โหลดไม่ได้";
    countEl.title = bucket.error;
  } else {
    countEl.className = "pcount";
    countEl.textContent = items.length + " คำ";
    countEl.title = bucket.source || "";
  }

  // ป้ายบอกความสด — ให้รู้ว่าข้อมูลที่เห็นเก่าแค่ไหน ไม่ต้องเดา
  let fresh = $(".xfresh", panel);
  if (!fresh) {
    fresh = document.createElement("div");
    fresh.className = "xfresh";
  }
  // ไว้ล่างสุดของคอลัมน์ ไม่ใช่ใต้หัวเรื่อง — ข้อความพวกนี้เป็นหมายเหตุ ไม่ใช่ของที่ต้องอ่านก่อน
  // เอาไว้บนจะเบียดพื้นที่อ่านทุกวินาที ทั้งที่อ่านครั้งเดียวก็พอ
  // appendChild ย้ายตัวเดิมได้ด้วย — เครื่องที่ค้าง DOM รุ่นก่อนไว้จะถูกย้ายลงล่างให้เอง
  panel.appendChild(fresh);
  if (bucket.items.length) {
    const src = bucket.sourceUpdatedAt ? `ต้นทางอัปเดต ${timeAgo(bucket.sourceUpdatedAt)}` : "";
    const got = bucket.fetchedAt ? `ดึงเมื่อ ${timeAgo(bucket.fetchedAt)}` : "";
    fresh.innerHTML = bucket.stale
      ? `<span class="warn">⚠ ข้อมูลค้างจากรอบก่อน — ต้นทางดึงไม่ได้ชั่วคราว</span>`
      : `<span>🕒 ${[src, got].filter(Boolean).join(" · ")}</span>`;
  } else fresh.innerHTML = "";

  // บอกให้รู้เมื่อการจัดหมวดใช้ไม่ได้ — ไม่งั้นจะเห็นแค่ "อื่นๆ 45" แล้วนึกว่าระบบเสีย
  const cd = bucket.cats;
  if (cd && bucket.items.length) {
    const note =
      cd.bound === false
        ? "⚠ ยังไม่ได้เปิดใช้ตัวจัดหมวด (Workers AI) — แท็กที่เดาจากคำไม่ได้จะอยู่ใน “อื่นๆ”"
        : cd.toAsk > 0 && cd.asked === 0
        ? "⚠ ตัวจัดหมวดไม่ตอบรอบนี้ — เดี๋ยวรอบหน้าจะลองใหม่ให้เอง"
        : "";
    if (note) fresh.innerHTML = `<span class="warn">${escapeHtml(note)}</span>`;
  }

  syncKindToggle(panel, "[data-xkind]", state.xKind);
  renderXCats(panel, all);

  const list = $("[data-list]", panel);
  if (items.length === 0) {
    // ยังไม่มีข้อมูลเลย ≠ กรองแล้วไม่เจอ — ตอนเพิ่งเปิดหน้ายังไม่มีอะไรมา ให้บอกว่ารอก่อน
    list.innerHTML = bucket.error
      ? `<div class="state">ดึงเทรนด์ไม่ได้</div>`
      : all.length === 0
      ? WAITING
      : `<div class="state">ไม่พบคำที่ตรงกับตัวกรอง</div>`;
    return;
  }
  // กดที่เทรนด์ = เปิดหน้าค้นหาบน X ซึ่งคือโพสต์จริงของเทรนด์นั้น
  list.innerHTML = items
    .map(
      (it, i) => `<a class="xrow" href="${escapeHtml(it.url)}" target="_blank" rel="noopener" title="ดูโพสต์บน X">
        <span class="rank">${i + 1}</span>
        <span class="xname${it.isHashtag ? " xtag" : ""}">${escapeHtml(it.name)}</span>
      </a>`
    )
    .join("");
}

// ---------- คลิปมาแรงบน YouTube ----------
// YouTube ปิดหน้า Trending ในเมนูไปแล้ว /api/trend/yttrends จึงไล่หลายแหล่ง
// (Invidious → Piped → แกะหน้า YouTube เอง) แหล่งไหนได้ก่อนใช้อันนั้น
async function fetchYTTrends(geo, kind = "all") {
  const res = await fetch(`/api/trend/yttrends?geo=${encodeURIComponent(geo)}&kind=${encodeURIComponent(kind)}`);
  const d = await res.json();
  return {
    label: "YouTube",
    items: d.items || [],
    error: d.error || null,
    stale: !!d.stale,
    source: d.source || "",
    mode: d.mode || "",
    kind: d.kind || "all",
    // server กรองหมวดให้แล้วหรือยัง — ถ้ายัง หน้าเว็บต้องกรองเองด้วยคำ
    catFiltered: !!d.catFiltered,
    fetchedAt: d.fetchedAt || null,
    attempts: (d.meta && d.meta.attempts) || [],
  };
}

// หมวดของคลิป — เดาจากชื่อคลิป+ชื่อช่อง (ต้นทางไม่ได้ส่งหมวดมาให้)
// ใช้วิธีเดียวกับหมวดข่าวใน news/alert1 ที่ใช้อยู่แล้ว จะได้ไม่ต้องพึ่ง AI ให้เปลืองโควตา
const YT_CATS = [
  // ลำดับสำคัญ — เจอหมวดไหนก่อนใช้อันนั้น จึงเรียงจาก "เฉพาะเจาะจง" ไป "กว้าง"
  // เกมมาก่อนกีฬา เพราะอีสปอร์ตมีคำกีฬาปนเยอะ (เช่น "PUBG ... แข่งวันนี้", "นักเตะ | FC Mobile")
  { key: "news",   label: "📰 ข่าว",     kw: ["ข่าว","news","ด่วน","รายงานสด","สัมภาษณ์","แถลง","คดี","จับกุม","ศาล","เลือกตั้ง","นายก","รัฐบาล","สภา","ประเด็นร้อน","วิเคราะห์","เศรษฐกิจ","การเมือง","อุบัติเหตุ","ตำรวจ","ชันสูตร"] },
  { key: "game",   label: "🎮 เกม",      kw: ["เกม","game","gaming","gameplay","gta","roblox","minecraft","มายคราฟ","freefire","free fire","rov","valorant","pubg","efootball","fifa","fc mobile","cookierun","cookie run","คุกกี้รัน","เซิฟ","เซิร์ฟ","สปีดรัน","แคสเกม","มือถือเกม","anomaly","สยองขวัญ"] },
  { key: "music",  label: "🎵 เพลง",     kw: ["mv","m/v","music video","official audio","official video","performance video","เพลง","นักร้อง","อัลบั้ม","lyrics","เนื้อเพลง","cover","ost","feat.","ft.","- topic","ลูกทุ่ง","longplay","mp3","แดนซ์","คอนเสิร์ต","concert"] },
  { key: "sport",  label: "⚽ กีฬา",     kw: ["ฟุตบอล","วอลเลย์","มวย","ไฮไลท์","highlight","ทีมชาติ","ลีก","league","ซีเกมส์","โอลิมปิก","แบดมินตัน","นักเตะ","u17","u19","แข่งขัน","ชิงแชมป์"] },
  { key: "food",   label: "🍜 อาหาร",    kw: ["ทำอาหาร","ร้านอาหาร","รีวิวร้าน","เมนู","ก๋วยเตี๋ยว","ขนม","คาเฟ่","บุฟเฟ่","ชาบู","หม่าล่า","สูตรอาหาร","เข้าครัว","อร่อย","กินโชว์","หมูกระทะ","ปิ้งย่าง","สตรีทฟู้ด"] },
  { key: "ent",    label: "🎬 บันเทิง",  kw: ["ละคร","ซีรีส์","หนัง","ตัวอย่าง","trailer","teaser","ตอนที่","นักแสดง","ดารา","รายการ","วาไรตี้","ตลก","vlog","challenge","ชาเลนจ์","reaction","รีแอค"] },
];
const YT_MAP = Object.fromEntries(YT_CATS.map((c) => [c.key, c.kw.map((k) => k.toLowerCase())]));
function ytCatOf(it) {
  const hay = ((it.title || "") + " " + (it.channel || "")).toLowerCase();
  for (const c of YT_CATS) if (YT_MAP[c.key].some((k) => hay.includes(k))) return c.key;
  return "other";
}

// คอลัมน์ YouTube ไม่มีแถวปุ่มหมวดแล้ว — ปุ่ม ข่าว/ทั่วไป ทำหน้าที่นั้นแทน
// แถวนั้นกินความสูงไปเปล่าๆ ราว 45px บนมือถือ ซึ่งเป็นพื้นที่อ่านที่หายไป
//
// เหลือไว้อย่างเดียวคือปุ่มไลฟ์ ย้ายไปต่อท้ายแถวปุ่มเรียงลำดับ (ที่เลื่อนซ้าย-ขวาได้อยู่แล้ว)
// จะได้ไม่เสียความสามารถไปและไม่เพิ่มแถวใหม่ — ไลฟ์นับวิวคนละแบบกับคลิปปกติ ปกติจึงซ่อนไว้
function renderYTLive(panel, all) {
  const row = $("[data-ysort]", panel);
  if (!row) return;
  const nLive = all.filter((it) => it.live).length;
  let btn = $("[data-live]", row);
  if (!nLive) { if (btn) btn.remove(); return; }
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.live = "1";
    row.appendChild(btn);
  }
  btn.className = "cat" + (state.ytHideLive ? "" : " on");
  btn.textContent = `${state.ytHideLive ? "🔴 โชว์ไลฟ์" : "🔴 ซ่อนไลฟ์"} ${nLive}`;
}

async function reloadYTTrends(opts = {}) {
  const panel = $('.panel[data-source="yttrends"]');
  if (!panel) return;
  const list = $("[data-list]", panel);
  const keepScroll = opts.silent ? list.scrollTop : null; // auto-refresh ห้ามดีดตำแหน่ง scroll
  if (!opts.silent) list.innerHTML = `<div class="state waiting"><span class="spin"></span>กำลังดึงคลิปมาแรง…</div>`;
  let bucket;
  try {
    bucket = await fetchYTTrends(state.ytGeo, state.ytKind);
  } catch (e) {
    bucket = { label: "YouTube", items: [], error: e.message };
  }
  if (!state.data) state.data = { sources: {} };
  if (!state.data.sources) state.data.sources = {};
  state.data.sources.yttrends = bucket;
  renderPanel(panel);
  if (keepScroll != null) list.scrollTop = keepScroll;
}

// 1,234,567 → 1.2 ล้าน (ตัวเลขยาวๆ ในคอลัมน์แคบอ่านไม่ออก)
function viewsTh(n) {
  if (!n) return "";
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + " ล้านวิว";
  if (n >= 1e3) return Math.round(n / 1e3) + "K วิว";
  return n + " วิว";
}

function renderYTTrends(panel) {
  // คอลัมน์นี้มาทีหลังคอลัมน์อื่น — ยังไม่มีข้อมูลก็อย่าเพิ่งไปทับ skeleton
  // ด้วยคำว่า "ไม่พบคลิป" ไม่งั้นจะกะพริบเป็นข้อความผิดทุกครั้งที่รีเฟรช
  const bucket = state.data?.sources?.yttrends;
  if (!bucket) return;
  const kw = (state.gkw || "").trim().toLowerCase(); // global search ใช้คำเดียวกับคอลัมน์อื่น
  const found = bucket.items.filter(
    (it) => !kw || ((it.title || "") + " " + (it.channel || "")).toLowerCase().includes(kw)
  );
  // โหมดข่าว: ปกติ server ส่งชาร์ตหมวดข่าวมาให้แล้ว (catFiltered) ไม่ต้องกรองซ้ำ
  // แต่ถ้าตกไปใช้ต้นทางสำรองที่ไม่มีหมวด ต้องกรองเองด้วยคำ ไม่งั้นจะได้ชาร์ตรวมมาทั้งดุ้น
  const all = state.ytKind === "news" && !bucket.catFiltered
    ? found.filter((it) => !YT_NEWS_SKIP.includes(ytCatOf(it)))
    : found;
  // ซ่อนไลฟ์ไว้เพื่อให้เห็นคลิปจริง แต่ถ้าซ่อนแล้วแทบไม่เหลืออะไร แปลว่าตัวตรวจไลฟ์เพี้ยน
  // โชว์ทั้งหมดดีกว่าโชว์ 2 จาก 15 (เคยเกิดจริงตอนตัวตรวจจับผิด 13 ตัว)
  const noLive = all.filter((it) => !it.live);
  const filterBroken = state.ytHideLive && all.length >= 6 && noLive.length < 3;
  const shown = state.ytHideLive && !filterBroken ? noLive : all;
  syncKindToggle(panel, "[data-ytkind]", state.ytKind);
  const items = shown.slice();

  // "มาแรง" = วิวที่เพิ่มในช่วงที่เลือก · ช่วงเวลามาจากช่องแยกต่างหาก (state.ytWin)
  const isGrowth = state.ytSort === "growth";
  const winH = isGrowth ? Number(state.ytWin) || 24 : 0;
  const dkey = isGrowth ? "d" + winH : null;
  // ถ้ายังไม่มีสถิติย้อนหลังพอ การเรียงตาม "วิวเพิ่ม" จะไม่มีความหมาย → ถอยไปใช้ยอดรวม
  const hasDelta = isGrowth && shown.some((it) => it[dkey] != null);
  const sortBy = isGrowth && !hasDelta ? "views" : state.ytSort; // ไม่มีสถิติพอ → เรียงยอดรวมไปก่อน

  if (sortBy === "rank") {
    // API ส่งลำดับมาเป็นอันดับมาแรงทางการอยู่แล้ว — เรียงคืนตามนั้น
    items.sort((a, b) => (a.rank || 999) - (b.rank || 999));
  } else if (sortBy === "new") {
    // ตัวที่ต้นทางไม่บอกเวลาให้ไปอยู่ท้าย ไม่ใช่ปนอยู่กลางๆ
    items.sort((a, b) => (b.published || 0) - (a.published || 0));
  } else if (sortBy === "views") {
    items.sort((a, b) => (b.views || 0) - (a.views || 0));
  } else {
    // null = "ยังไม่รู้" คนละเรื่องกับ 0 = "ไม่เพิ่มเลย" จึงดัน null ไปท้ายเสมอ
    items.sort((a, b) => {
      const x = a[dkey], y = b[dkey];
      if (x == null && y == null) return (b.views || 0) - (a.views || 0);
      if (x == null) return 1;
      if (y == null) return -1;
      return y - x;
    });
  }

  const countEl = $("[data-count]", panel);
  if (bucket.error && bucket.items.length === 0) {
    countEl.className = "errbadge";
    countEl.textContent = "⚠ โหลดไม่ได้";
    countEl.title = bucket.error;
  } else {
    countEl.className = "pcount";
    countEl.textContent = items.length + " คลิป";
    countEl.title = bucket.source || "";
  }

  // ป้ายบอกความสด — โครงเดียวกับคอลัมน์ X ให้รู้ว่าของที่เห็นเก่าแค่ไหน
  let fresh = $(".xfresh", panel);
  if (!fresh) {
    fresh = document.createElement("div");
    fresh.className = "xfresh";
  }
  // ไว้ล่างสุดของคอลัมน์ ไม่ใช่ใต้หัวเรื่อง — ข้อความพวกนี้เป็นหมายเหตุ ไม่ใช่ของที่ต้องอ่านก่อน
  // เอาไว้บนจะเบียดพื้นที่อ่านทุกวินาที ทั้งที่อ่านครั้งเดียวก็พอ
  // appendChild ย้ายตัวเดิมได้ด้วย — เครื่องที่ค้าง DOM รุ่นก่อนไว้จะถูกย้ายลงล่างให้เอง
  panel.appendChild(fresh);
  // ต้นทางสำรอง (หน้า YouTube รายประเทศ) ไม่ใช่อันดับมาแรงทางการ — ต้องบอกให้รู้
  // ไม่งั้นผู้ใช้จะอ่านคลิป 900 วิวเป็น "คลิปมาแรงอันดับ 1 ของประเทศ"
  const needMore = isGrowth && !hasDelta;
  const liveWarn = filterBroken
    ? `<span class="warn">⚠ แยกไลฟ์ออกไม่ได้ในรอบนี้ (ต้นทางสำรองไม่ได้บอกชัด) — โชว์ทั้งหมดไปก่อน</span>`
    : "";
  const nUnknown = isGrowth ? items.filter((it) => it[dkey] == null).length : 0;
  // สถิติยังสะสมไม่ครบช่วงที่เลือก → คลิปเก่ายังเทียบไม่ได้ ต้องบอก ไม่ใช่ปล่อยให้งง
  const partial =
    isGrowth && hasDelta && (bucket.histHours || 0) < winH && nUnknown
      ? `<span class="warn">📊 คำนวณวิวเพิ่มได้ ${items.length - nUnknown} จาก ${items.length} คลิป — ที่เหลือลงเกิน ${winH} ชม.แล้ว และเราเพิ่งเริ่มเก็บสถิติ (${bucket.histHours || 0} ชม.) จึงยังไม่มียอดเดิมไว้ลบ · คลิปพวกนั้นอยู่ท้ายลิสต์ · พรุ่งนี้จะครบทุกคลิปเอง</span>`
      : "";
  const notReady = needMore
    ? `<span class="warn">⏳ เพิ่งเริ่มเก็บสถิติยอดวิว (มี ${bucket.histHours || 0} ชม.) — ยังเทียบ "วิวเพิ่มใน ${winH} ชม." ไม่ได้ ตอนนี้เรียงตามยอดรวมไปก่อน</span>`
    : "";
  const modeNote =
    bucket.mode === "browse"
      ? `<span class="warn">⚠ ต้นทางอันดับทางการล่ม — นี่คือคลิปจากหน้า YouTube ของประเทศนี้ เรียงตามยอดวิว ไม่ใช่อันดับมาแรงทางการ</span>`
      : "";
  fresh.innerHTML = !bucket.items.length
    ? ""
    : bucket.stale
    ? `<span class="warn">⚠ ข้อมูลค้างจากรอบก่อน — ต้นทางดึงไม่ได้ชั่วคราว</span>`
    : liveWarn || notReady || partial || modeNote || `<span>🕒 ${bucket.fetchedAt ? "ดึงเมื่อ " + timeAgo(bucket.fetchedAt) : ""}</span>`;

  // ไฮไลต์ปุ่มที่เลือกอยู่ · ช่องเวลาโผล่เฉพาะโหมด "มาแรง" เท่านั้น
  $$("[data-ysort] [data-sort]", panel).forEach((b) =>
    b.classList.toggle("on", b.dataset.sort === state.ytSort)
  );

  renderYTLive(panel, all);
  // เผื่อเครื่องที่เคยเปิดรุ่นก่อนแล้วมีแถวหมวดค้างอยู่ใน DOM
  const oldCats = $(".xcats", panel);
  if (oldCats) oldCats.remove();

  const list = $("[data-list]", panel);
  if (items.length === 0) {
    if (!bucket.error) {
      list.innerHTML = all.length === 0 ? WAITING : `<div class="state">ไม่พบคลิปที่ตรงกับตัวกรอง</div>`;
      return;
    }
    // ดึงไม่ได้ = บอกไปเลยว่าแหล่งไหนพังเพราะอะไร ไม่ต้องให้ผู้ใช้ไปเปิด API เอง
    // (คอลัมน์นี้พึ่ง instance ของอาสาสมัครที่ล่มบ่อย — รู้สาเหตุแล้วแก้ได้ตรงจุด)
    const rows = (bucket.attempts || [])
      .map((a) => `<li><b>${escapeHtml(a.source || "?")}</b> — ${escapeHtml(a.err || (a.got != null ? "ได้ " + a.got + " รายการ" : "ไม่ทราบ"))}</li>`)
      .join("");
    list.innerHTML =
      `<div class="state">ดึงคลิปมาแรงไม่ได้ — ต้นทางสาธารณะไม่ตอบทั้งหมด</div>` +
      (rows ? `<details class="ydiag"><summary>ดูสาเหตุ (${(bucket.attempts || []).length} แหล่ง)</summary><ul>${rows}</ul></details>` : "");
    return;
  }
  list.innerHTML = items
    .map((it, i) => {
      // ไลฟ์: ยอดที่เห็นคือคนดูอยู่ตอนนี้ ไม่ใช่ยอดวิวสะสม จึงเขียนให้ต่างกัน
      const d = isGrowth ? it[dkey] : null;
      const sub = [
        it.channel,
        it.live ? (it.views ? viewsTh(it.views).replace(" วิว", " คนดูอยู่") : "") : viewsTh(it.views),
        it.published ? timeAgo(new Date(it.published).toISOString()) : "",
      ].filter(Boolean);
      // ตัวเลขที่ผู้ใช้ขอ — วิวที่เพิ่มขึ้นในช่วงเวลาที่เลือก ให้เด่นกว่ายอดรวม
      const delta = d != null ? `<span class="ydelta">+${escapeHtml(viewsTh(d))} ใน ${winH} ชม.</span>` : "";
      return `<a class="yrow" href="${escapeHtml(it.url)}" target="_blank" rel="noopener" title="เปิดคลิปบน YouTube">
        <span class="rank">${i + 1}</span>
        <span class="ythumbwrap">
          <img class="ythumb" src="${escapeHtml(it.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
          ${it.live ? '<span class="ylive">LIVE</span>' : ""}
        </span>
        <span class="ymeta">
          <span class="ytitle">${escapeHtml(it.title)}</span>
          ${delta}
          <span class="ysub"><span class="ych">${escapeHtml(sub[0] || "")}</span>${
            sub.length > 1 ? " · " + escapeHtml(sub.slice(1).join(" · ")) : ""
          }</span>
        </span>
      </a>`;
    })
    .join("");
}

async function reloadTrends() {
  const panel = $('.panel[data-source="trends"]');
  $("[data-list]", panel).innerHTML = `<div class="state waiting"><span class="spin"></span>กำลังดึงเทรนด์…</div>`;
  try {
    state.data.sources.trends = await fetchTrends(state.trendsGeo, state.trendsHours, state.trendsCat);
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
function renderAll() {
  $$(".panel").forEach(renderPanel);
  if (window.Flags) Flags.refresh();
}

// หมวดย่อยคอลัมน์ CP (alert1): แยก CPF ออกจากเครือ CP (กรอง keyword ฝั่ง client)
const CPF_KW = ["cpf", "ซีพีเอฟ", "cp foods", "เจริญโภคภัณฑ์อาหาร", "charoen pokphand foods"];
const isCPF = (it) => {
  const h = ((it.title || "") + " " + (it.snippet || "")).toLowerCase();
  return CPF_KW.some((k) => h.includes(k));
};
// หมวดข่าว Google News (แบบหน้า IR) — กรอง keyword ฝั่ง client
const NEWS_CATS = [
  { key: "econ",   label: "💰 เศรษฐกิจ", kw: ["หุ้น","เศรษฐกิจ","จีดีพี","เงินบาท","ดอกเบี้ย","เงินเฟ้อ","ส่งออก","นำเข้า","ลงทุน","กำไร","ตลาดหุ้น","ปันผล","แบงก์","ธนาคาร","ผลประกอบการ","econom","gdp","inflation","export","import","invest","market","stock","finance","earnings","bank"] },
  { key: "agri",   label: "🍗 อาหาร/เกษตร", kw: ["หมู","ไก่","ไข่","กุ้ง","ปศุสัตว์","อาหารสัตว์","เกษตร","ข้าว","ประมง","เนื้อ","สุกร","ฟาร์ม","อาหาร","livestock","pork","poultry","agri","farm","food","shrimp","crop","harvest"] },
  { key: "retail", label: "🛒 ค้าปลีก/ผู้บริโภค", kw: ["ค้าปลีก","ค้าส่ง","ห้าง","ซูเปอร์","สะดวกซื้อ","ร้านสะดวกซื้อ","ค่าครองชีพ","ผู้บริโภค","อีคอมเมิร์ซ","ห้างสรรพสินค้า","โชห่วย","retail","consumer","e-commerce","ecommerce","mall","convenience","supermarket","wholesale"] },
  { key: "crisis", label: "🚨 วิกฤติ/ภัยพิบัติ", kw: ["โรคระบาด","ระบาด","อหิวาต์","ไข้หวัดนก","asf","โควิด","แผ่นดินไหว","น้ำท่วม","ภัยแล้ง","พายุ","ไฟไหม้","ไฟป่า","สึนามิ","ดินถล่ม","ภัยพิบัติ","อุบัติเหตุ","ฉุกเฉิน","วิกฤต","ภัยธรรมชาติ","disease","outbreak","pandemic","epidemic","earthquake","quake","flood","drought","storm","typhoon","wildfire","tsunami","disaster","emergency","crisis"] },
  { key: "pol",    label: "🏛️ การเมือง", kw: ["รัฐบาล","นายก","สภา","ครม","พรรค","เลือกตั้ง","กฎหมาย","นโยบาย","รัฐมนตรี","ภาษี","การเมือง","กกต","แบงก์ชาติ","มาตรการ","กระทรวง","govern","policy","election","parliament","minister","cabinet","regulation","tax","law"] },
];
const NEWS_MAP = Object.fromEntries(NEWS_CATS.map((c) => [c.key, c.kw.map((k) => k.toLowerCase())]));
// ลำดับความน่าเชื่อ (เหมือนหน้า IR): ผู้ใช้จัดเอง > ที่ server จัดมา > เดาจากคำฝั่งนี้
//
// ⚠️ การเดาจากคำฝั่ง client เป็นทางสำรองเท่านั้น มันชนคำอื่นบ่อย
// ("หมู ปากน้ำ" นักสนุกเกอร์ · "ม.เกษตร" มหาวิทยาลัย) — ของจริงตัดสินที่ server
// ซึ่งมีตัวกันคำกำกวมและให้ AI อ่านพาดหัวเมื่อไม่มั่นใจ
function newsCatOf(it, source) {
  if (window.Flags && Flags.getCat) {
    const o = Flags.getCat(it.link);
    if (o) return o;
  }
  if (it.cat) return it.cat;
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

// ---------- เช็ค Trend: คนสนใจแค่ไหน ก่อนเอาเข้า Alert ----------
// ---------- Google Trends embed ----------
// ⚠️ ทำไมต้องใช้ embed แทนการยิงจาก Worker
// Cloudflare Worker ออกเน็ตจาก IP ที่ใช้ร่วมกับคนทั้งโลก Google Trends จึงตอบ 429 แทบทุกครั้ง
// ลองซ้ำก็ไม่ช่วยเพราะไม่ใช่การชนกันชั่วขณะ — วัดจากการใช้จริงแล้วว่าพิมพ์กี่คำก็ไม่ผ่าน
// embed ทำงานในเบราว์เซอร์ของผู้ใช้เอง = ใช้โควตาของเครื่องผู้ใช้ ซึ่งไม่มีปัญหานี้
const TRENDS_EMBED = "https://ssl.gstatic.com/trends_nrtr/3603_RC01/embed_loader.js";
const TRENDS_GUEST = "https://trends.google.com:443/trends/embed/";
let trendsEmbedP = null;
function loadTrendsEmbed() {
  if (window.trends?.embed?.renderExploreWidgetTo) return Promise.resolve(true);
  if (trendsEmbedP) return trendsEmbedP;
  trendsEmbedP = new Promise((resolve) => {
    const sc = document.createElement("script");
    sc.src = TRENDS_EMBED;
    sc.async = true;
    // สคริปต์เซ็ต window.trends ทีหลัง onload เล็กน้อย จึงต้องรอเป็นรอบๆ
    sc.onload = () => {
      let tries = 0;
      const tick = () => {
        if (window.trends?.embed?.renderExploreWidgetTo) return resolve(true);
        if (++tries > 40) return resolve(false);
        setTimeout(tick, 100);
      };
      tick();
    };
    sc.onerror = () => resolve(false); // ตัวบล็อกโฆษณา/เน็ตองค์กรบล็อก gstatic ได้
    document.head.appendChild(sc);
  });
  return trendsEmbedP;
}


async function runKwCheck() {
  const panel = $('.panel[data-source="kwcheck"]');
  if (!panel) return;
  const q = (state.kwq || "").trim();
  if (!q) return;
  state.kwShown = { q, geo: state.kwGeo, time: state.kwTime };
  state.kwRes = null;
  renderKwCheck(panel);           // วาดกรอบ + สั่ง embed ทำงานทันที ไม่ต้องรอ server
  fetchKwVolume(q, panel);        // ตัวเลขยอดค้นหาจริงเป็นของแถม มาทีหลังได้
}

// ยิง server เพื่อเอา "ยอดค้นหาต่อเดือน" จาก Keyword Planner เท่านั้น
// (ส่วน Google Trends ไม่พึ่ง server แล้ว — embed ทำเองในเบราว์เซอร์)
// ตอนนี้ยังไม่มี token จึงยังไม่ได้อะไรกลับมา แต่พอ token มาถึงตัวเลขจะขึ้นเอง
async function fetchKwVolume(q, panel) {
  try {
    const res = await fetch(
      `/api/trend/kwcheck?q=${encodeURIComponent(q)}&geo=${encodeURIComponent(state.kwGeo)}&time=${encodeURIComponent(state.kwTime)}`
    );
    const d = await res.json();
    // ถ้าผู้ใช้เปลี่ยนคำไปแล้วระหว่างรอ อย่าเอาผลเก่ามาทับ
    if (state.kwShown?.q !== q) return;
    state.kwRes = d;
    renderKwCheck(panel);
  } catch {}
}


function renderKwCheck(panel) {
  const list = $("[data-list]", panel);
  const countEl = $("[data-count]", panel);
  const shown = state.kwShown;

  if (!shown) {
    countEl.className = "pcount"; countEl.textContent = "—";
    list.innerHTML = `<div class="state">พิมพ์คำแล้วกด "เช็ค" — จะได้กราฟความสนใจย้อนหลังและคำที่คนค้นคู่กัน จาก Google Trends โดยตรง<br><br>ใช้เทียบว่าคำใหม่น่าเอาเข้า Alert ไหม โดยลองเช็คคำที่มีอยู่แล้วเทียบดู</div>`;
    return;
  }

  countEl.className = "pcount";
  countEl.textContent = shown.q.length > 14 ? shown.q.slice(0, 14) + "…" : shown.q;

  const v = (state.kwRes || {}).volume || {};
  const volBox = v.available && v.avgMonthly
    ? `<div class="kwbox">
        <div class="kwrow"><span class="kwbig">${v.avgMonthly.toLocaleString("th-TH")}</span><span class="kwunit">ครั้ง/เดือน (เฉลี่ย)</span></div>
        <div class="kwmeta">การแข่งขันโฆษณา: ${escapeHtml(v.competition || "-")}${v.competitionIndex != null ? ` (${v.competitionIndex}/100)` : ""}</div>
      </div>`
    : "";

  const exploreUrl =
    `https://trends.google.com/trends/explore?date=${encodeURIComponent(shown.time)}` +
    `&geo=${encodeURIComponent(shown.geo)}&q=${encodeURIComponent(shown.q)}&hl=th`;

  list.innerHTML =
    `<div class="kwterm">${escapeHtml(shown.q)}</div>` +
    volBox +
    `<div class="kwsec"><div class="kwsectitle">📈 ความสนใจตามช่วงเวลา</div>
       <div class="kwembed" data-kwts><div class="kwmeta">กำลังโหลดจาก Google Trends…</div></div></div>
     <div class="kwsec"><div class="kwsectitle">🔁 คำที่คนค้นคู่กัน</div>
       <div class="kwembed kwembed-tall" data-kwrq><div class="kwmeta">กำลังโหลด…</div></div></div>
     <a class="kwchip" href="${escapeHtml(exploreUrl)}" target="_blank" rel="noopener">↗ เปิดใน Google Trends</a>`;

  renderKwEmbeds(panel, shown);
}

// วาด widget ของ Google ลงในกล่องที่เตรียมไว้
// ⚠️ ต้องเรียกใหม่ทุกครั้งที่ renderKwCheck สร้าง innerHTML ใหม่ — iframe เดิมหายไปกับ DOM
function renderKwEmbeds(panel, shown) {
  const jobs = [["[data-kwts]", "TIMESERIES"], ["[data-kwrq]", "RELATED_QUERIES"]];
  loadTrendsEmbed().then((okLoaded) => {
    // ผู้ใช้เปลี่ยนคำระหว่างรอสคริปต์โหลด → อย่าวาดของเก่าทับ
    if (state.kwShown?.q !== shown.q) return;
    if (!okLoaded) {
      jobs.forEach(([sel]) => {
        const box = $(sel, panel);
        if (box) box.innerHTML = `<div class="kwmeta">โหลด Google Trends ไม่ได้ — อาจโดนตัวบล็อกโฆษณาหรือเน็ตองค์กรบล็อกไว้ · กด "เปิดใน Google Trends" ด้านล่างแทนได้</div>`;
      });
      return;
    }
    const common = { comparisonItem: [{ keyword: shown.q, geo: shown.geo, time: shown.time }], category: 0, property: "" };
    const opts = {
      exploreQuery: `date=${shown.time}&geo=${shown.geo}&q=${encodeURIComponent(shown.q)}&hl=th`,
      guestPath: TRENDS_GUEST,
    };
    jobs.forEach(([sel, type]) => {
      const box = $(sel, panel);
      if (!box) return;
      box.innerHTML = "";
      try { window.trends.embed.renderExploreWidgetTo(box, type, common, opts); }
      catch { box.innerHTML = `<div class="kwmeta">วาดกราฟไม่สำเร็จ</div>`; }
    });
  });
}

function renderPanel(panel) {
  const source = panel.dataset.source;
  if (source === "trends") return renderTrends(panel);
  if (source === "xtrends") return renderXTrends(panel);
  if (source === "yttrends") return renderYTTrends(panel);
  if (source === "kwcheck") return renderKwCheck(panel);

  const bucket = state.data?.sources?.[source] || { items: [] };
  const f = state.filters[source] || { kw: "", rc: "all" };
  const kw = (state.gkw || "").trim().toLowerCase(); // global search (ทุกคอลัมน์ใช้คำเดียวกัน)

  const items = bucket.items.filter((it) => {
    if (window.Flags && Flags.isHidden(it.link)) return false;
    if (!withinRecency(it.publishedAt, f.rc)) return false;
    if (source === "alert1" && f.cat === "cpf" && !isCPF(it)) return false; // chip CPF
    if (source === "news" && f.cat && newsCatOf(it, source) !== f.cat) return false; // chip หมวดข่าว (แบบ IR)
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
        ${window.Flags ? Flags.catButton(it, source) : ""}
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
// หมู(?!่) กัน "หมู่บ้าน" · เนื้อ(?!หา) กัน "เนื้อหา"
const PIN_FOOD_RE = /อาหาร|หมู(?!่)|ไก่|ไข่|กุ้ง|เนื้อ(?!หา)|ปศุสัตว์|ฟาร์ม|สุกร|บุฟเฟ่?ต์|ร้านอาหาร|เมนู|ขนม|กาแฟ|ชานม|ราคาหมู|วัตถุดิบ|ผลไม้|ผัก(?!ผ่อน)|เครื่องดื่ม|\bนม\b|เบเกอ(?:รี่|อรี่)|ข้าว(?!ของ)|ปลา(?!ย)|ทะเล|ทุเรียน|มะม่วง|กล้วย|แตงโม|ส้มตำ|ชาบู|หม่าล่า|ปิ้งย่าง|\bfood\b|buffet|restaurant|cafe/i;

// หมวดที่ Google ติดมากับเทรนด์เอง — เลขและป้ายชุดเดียวกับ dropdown เลือกหมวดด้านบนคอลัมน์
// ไม่ต้องเดาจากคำ ไม่ต้องใช้ AI: Google บอกมาแล้วว่าเทรนด์ไหนอยู่หมวดไหน
//
// ⚠️ ไม่ได้เอาไปโชว์บนการ์ดแล้ว (เจ้าของสั่งเอาป้ายหมวดออก) แต่ห้ามลบตารางนี้ทิ้ง —
// เป็นตัวยืนยันว่าเลขหมวดที่ FOOD_CAT อ้างถึงตรงกับ dropbox จริง (เทสต์ pintest เทียบให้)
// ลบทิ้งเมื่อไหร่ = FOOD_CAT กลายเป็นเลข 5 ลอยๆ ที่ไม่มีอะไรการันตีว่าคืออาหาร
const TREND_CATS = {
  3: "💼 ธุรกิจ/การเงิน", 4: "🎬 บันเทิง", 5: "🍔 อาหาร/เครื่องดื่ม", 6: "🎮 เกม",
  7: "🩺 สุขภาพ", 10: "⚖️ กฎหมาย/ราชการ", 14: "🏛️ การเมือง", 15: "🔬 วิทยาศาสตร์",
  16: "🛍️ ช้อปปิ้ง", 17: "⚽ กีฬา", 18: "💻 เทคโนโลยี", 19: "✈️ ท่องเที่ยว",
};
const FOOD_CAT = 5;
function pinScore(it) {
  const hay = (it.title + " " + (it.snippet || "") + " " + ((it.related || []).map((r) => r.term || r).join(" ")))
    .toLowerCase().replace(PIN_FALSE_RE, " ");
  if (PIN_CP_RE.test(hay)) return 2; // เครือ CP มาก่อน (Google ไม่มีหมวดนี้ ต้องดูจากชื่อเอง)
  // ถ้า Google ติดหมวดมาให้แล้ว เชื่อ Google ล้วน — ลิสต์คำที่เขียนเองไม่มีวันครบชื่อแบรนด์
  // (starbucks ไม่มีคำว่ากาแฟหรืออาหารในชื่อเลย และไม่มีคำที่เกี่ยวข้องมาด้วย)
  const topics = Array.isArray(it.topics) ? it.topics : [];
  if (topics.length) return topics.includes(FOOD_CAT) ? 1 : 0;
  // ไม่มีหมวดมาด้วย = ตอนที่ Google Trends ล่มแล้วตกไปใช้ RSS สำรอง ค่อยเดาจากคำ
  return PIN_FOOD_RE.test(hay) ? 1 : 0;
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
  const foodCat = Number(state.trendsCat) === 5;
  items.forEach((it) => { it._pin = pinScore(it) || (foodCat ? 1 : 0); });
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
      const pin = it._pin === 2 ? "เครือ CP" : "";
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
      if (!head.nextElementSibling.hidden) {
        head.nextElementSibling.hidden = true;
        head.classList.remove("open");
        delete state.trendOpen[head.dataset.q];
        return;
      }
      state.trendOpen[head.dataset.q] = 1;
      openTrend(head);
    })
  );

  // กางของที่ผู้ใช้เปิดค้างไว้กลับคืน — ข้อมูลถูก cache ใน state แล้ว จึงเติมได้ทันที
  // ไม่ต้องยิงเน็ตซ้ำ และความสูงลิสต์กลับมาเท่าเดิมก่อนที่ load() จะคืนตำแหน่ง scroll
  $$(".trend-head", list).forEach((head) => {
    if (state.trendOpen[head.dataset.q]) openTrend(head);
  });
}

function openTrend(head) {
  const box = head.nextElementSibling;
  box.hidden = false;
  head.classList.add("open");
  if (box.dataset.loaded) return;
  box.dataset.loaded = "1";
  box.innerHTML = `<div class="tn-news"></div><div class="tn-rel"></div>`;
  loadNews(head.dataset.q, $(".tn-news", box));
  renderTerms(head.dataset.q, $(".tn-rel", box)); // แสดงคำค้นที่เกี่ยวข้องทันที (เชื่อถือได้)
  loadRelated(head.dataset.q, $(".tn-rel", box)); // ถ้าดึง % ได้ จะอัปเกรดเป็นตาราง Top/Rising
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
    // (เดิมเขียนวิธีตั้ง alert ไว้ตรงนี้ อ่านแล้วเข้าใจผิดว่าระบบยังไม่ได้ตั้งค่า)
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
    const xgeoEl = $("[data-xgeo]", panel);
    if (xgeoEl)
      xgeoEl.addEventListener("change", (e) => {
        state.xGeo = e.target.value;
        reloadXTrends();
      });
    const ytgeoEl = $("[data-ytgeo]", panel);
    if (ytgeoEl)
      ytgeoEl.addEventListener("change", (e) => {
        state.ytGeo = e.target.value;
        reloadYTTrends();
      });
    // ข่าว/ทั่วไป — X กรองฝั่งหน้าเว็บ (ไม่ต้องยิงใหม่) · YouTube เป็นคนละชาร์ต ต้องยิงใหม่
    const xkindEl = $("[data-xkind]", panel);
    if (xkindEl)
      xkindEl.addEventListener("click", (e) => {
        const b = e.target.closest("[data-k]");
        if (!b || state.xKind === b.dataset.k) return;
        state.xKind = b.dataset.k;
        state.xCat = null; // หมวดที่เลือกไว้อาจไม่มีอยู่ในโหมดใหม่ ล้างทิ้งกันคอลัมน์ว่างเปล่า
        renderPanel(panel);
      });
    // ---- คอลัมน์เช็ค Trend ----
    const kwqEl = $("[data-kwq]", panel);
    if (kwqEl) {
      kwqEl.addEventListener("input", (e) => { state.kwq = e.target.value; });
      kwqEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runKwCheck(); } });
    }
    const kwgoEl = $("[data-kwgo]", panel);
    if (kwgoEl) kwgoEl.addEventListener("click", () => runKwCheck());
    const kwgeoEl = $("[data-kwgeo]", panel);
    // เปลี่ยนประเทศ/ช่วงเวลาแล้วเช็คซ้ำให้เลย ถ้าเคยเช็คไว้แล้ว — ไม่ต้องกดซ้ำเอง
    // เงื่อนไขต้องดูว่า "มีคำที่กำลังแสดงอยู่ไหม" (kwShown) ไม่ใช่ดูผลจาก server (kwRes)
    // เพราะ kwRes จะมีก็ต่อเมื่อ Keyword Planner พร้อมแล้วเท่านั้น ซึ่งตอนนี้ยังไม่มี
    if (kwgeoEl) kwgeoEl.addEventListener("change", (e) => { state.kwGeo = e.target.value; if (state.kwShown) runKwCheck(); });
    const kwtimeEl = $("[data-kwtime]", panel);
    if (kwtimeEl) kwtimeEl.addEventListener("change", (e) => { state.kwTime = e.target.value; if (state.kwShown) runKwCheck(); });

    const ytkindEl = $("[data-ytkind]", panel);
    if (ytkindEl)
      ytkindEl.addEventListener("click", (e) => {
        const b = e.target.closest("[data-k]");
        if (!b || state.ytKind === b.dataset.k) return;
        state.ytKind = b.dataset.k;
        syncKindToggle(panel, "[data-ytkind]", state.ytKind); // ให้ปุ่มเปลี่ยนทันที ไม่ต้องรอโหลดเสร็จ
        reloadYTTrends();
      });
    const ysortEl = $("[data-ysort]", panel);
    if (ysortEl)
      ysortEl.addEventListener("click", (e) => {
        // ปุ่มไลฟ์อยู่แถวเดียวกันแล้ว ต้องแยกให้ออกก่อน
        const live = e.target.closest("[data-live]");
        if (live) { state.ytHideLive = !state.ytHideLive; renderPanel(panel); return; }
        const b = e.target.closest("[data-sort]");
        if (!b) return;
        state.ytSort = b.dataset.sort;
        renderPanel(panel); // เรียงใหม่ฝั่งหน้าเว็บ ไม่ต้องยิงต้นทางซ้ำ
      });
    const ytwinEl = $("[data-ytwin]", panel);
    if (ytwinEl)
      ytwinEl.addEventListener("change", (e) => {
        state.ytWin = Number(e.target.value) || 24;
        state.ytSort = "growth"; // เลือกช่วงเวลา = ตั้งใจดูแบบมาแรงอยู่แล้ว
        renderPanel(panel);      // เรียงใหม่ฝั่งหน้าเว็บ ไม่ต้องยิงต้นทางซ้ำ
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
  setupScrollCue();
}

// ปุ่มชี้ทางไปแถวล่าง (Google Trends / X / YouTube)
// โผล่เฉพาะตอนที่แถวล่างยังไม่อยู่ในจอ และหน้าเลื่อนลงได้จริง
function setupScrollCue() {
  const cue = $("#scrollcue");
  const target = $('.panel[data-source="trends"]');
  if (!cue || !target) return;
  cue.addEventListener("click", () => target.scrollIntoView({ behavior: "smooth", block: "start" }));
  const update = () => {
    const top = target.getBoundingClientRect().top;
    const visible = top < window.innerHeight - 80;              // แถวล่างโผล่มาแล้ว
    const scrollable = document.documentElement.scrollHeight > window.innerHeight + 40; // จอใหญ่จนพอดีอยู่แล้ว
    cue.hidden = visible || !scrollable;
  };
  update();
  addEventListener("scroll", update, { passive: true });
  addEventListener("resize", update);
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
  Flags.init({ onChange: renderAll, cats: NEWS_CATS, ui: "kw" }); // ui:"kw" = เหลือแต่ปุ่ม ➕ เพิ่ม keyword · 🚩 คำแนะนำตัดข่าว ย้ายไป /admin/
  Flags.setKeywords(HARD_KW); // แสดงทันทีก่อนโหลด
}
wire();
// คอลัมน์เช็ค Trendไม่ได้ผูกกับ load() — ต้องวาดครั้งแรกเอง
// ไม่งั้นถ้า load() ล้ม renderAll() จะไม่ถูกเรียก แล้วคอลัมน์นี้จะว่างเปล่าโดยไม่บอกอะไรเลย
{
  const kwPanel = $('.panel[data-source="kwcheck"]');
  if (kwPanel) renderKwCheck(kwPanel);
}
load();
// ---- auto-update: เช็คว่ามีโค้ดใหม่ deploy หรือยัง แล้วอัปเดตเองแม้ไม่ปิดแท็บ ----
// แยกจาก auto-refresh: ข้อมูลรีเฟรชทุก 3 นาที · โค้ดเช็ควันละครั้ง (deploy นานๆ ที ไม่ต้องถี่)
const APP_VER = 102; // = app.js?v= ใน index.html (bump คู่กันเสมอ)
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
// กลับเข้าแอป = จังหวะที่ควรเช็คที่สุด ไม่ต้องรอครบรอบ (กันกดสลับไปมารัวๆ ด้วย 60 วิ)
const RESUME_MIN_GAP = 60 * 1000;
function checkOnResume() { if (Date.now() - lastCodeCheck >= RESUME_MIN_GAP) checkForUpdate(); }
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
