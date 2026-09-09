/* แท็บ "Earned media" — สื่อที่ไม่ใช่ช่องของเราเอง
 *
 * 🎯 ต่างจากแท็บอื่นของหน้านี้: แท็บอื่นดูช่องของเราเอง อันนี้ดู **ของคนอื่น**
 *    ผู้ใช้วางลิงก์เข้ามาเอง แล้วระบบไปดึงยอดมาให้
 *
 * 🔴 มี 2 section แยกกันชัดเจน (เจ้าของสั่ง 8 ก.ย. 2026)
 *    ① โพสต์อินฟลูเอนเซอร์ — ดึงยอดจริง (view/like/comment/share)
 *    ② ข่าว — **นับชิ้น + แยกสำนักข่าวพอ** ไม่ดึงยอด ไม่ยิงต้นทางสักครั้ง
 *    ⚠️ 2 อย่างนี้วัดกันคนละหน่วย **ห้ามเอาตัวเลขมารวมกันเป็นก้อนเดียว**
 *       ข่าว 1 ชิ้นกับโพสต์ 1 ใบไม่ได้แปลว่ามีค่าเท่ากัน
 *
 * 🔴 ยิงต้นทางเฉพาะตอนผู้ใช้กดเท่านั้น (เจ้าของสั่ง — ScrapeCreators เสียเงินต่อครั้ง)
 *    เปิดแท็บ = อ่านของที่เก็บไว้ ไม่เสียเครดิตสักหน่วย
 *    ⚠️ ห้ามใส่ auto-refresh ในไฟล์นี้เด็ดขาด ไม่ว่ากรณีใด
 *
 * ⚠️ เขียนแยกไฟล์เพราะ app.js ยาว 2,000 บรรทัดแล้ว — แท็บนี้จึงดูแลตัวเองทั้งหมด
 *    (วาดเอง · รับคลิกเอง · จำ state ของตัวเอง) app.js แค่เรียก render()
 */
(function () {
  "use strict";

  var EP = "/social/api/influ";

  var state = {
    loaded: false,
    busy: "",              // "" | "load" | "add" | "refresh"
    posts: [],
    missing: [],
    at: 0,
    err: "",
    note: "",              // ข้อความบอกผลของการกดครั้งล่าสุด
    draft: "",             // ข้อความในกล่องวางลิงก์ (ต้องอยู่ใน state ไม่ใช่ DOM)
    fPlatform: "all",
    fAccount: "all",
    q: "",
    sort: "views",
    dir: -1,
    fOutlet: "all",        // ตัวกรองของ section ข่าว (แยกจาก section โพสต์)
    nq: "",
    delId: "",             // 🔴 ปุ่มลบต้องกดยืนยัน — จำว่ากำลังถามยืนยันของใบไหนอยู่
    credits: null,         // ยอดเครดิต ScrapeCreators คงเหลือ { left, at }
    /* 🔴 โหมดแก้ไข — ปิดเป็นค่าตั้งต้น (รีวิว 8 ก.ย. 2026 ข้อ 1)
       "หน้าดูต้องสะอาด — ไม่มีปุ่มลบ ไม่มีช่องกรอก จนกว่าจะเปิดโหมดแก้ไข"
       ทีมเปิดดูยอดร่วมกัน ปุ่มลบที่โผล่ตลอดเวลาคือความเสี่ยงที่ไม่ได้แลกกับอะไรเลย */
    edit: false,
    moChart: false,        // จอแคบ: กราฟรายเดือนซ่อนไว้หลังปุ่ม "ดูรายเดือน"
    openRow: "",           // จอแคบ: แถวที่กางดูตัวเลขที่เหลืออยู่ (ทีละแถว)
  };

  /* ── ของ 2 ชนิดในรายการเดียว ────────────────────────────────────
     ⚠️ record รุ่นเก่า (ก่อน 8 ก.ย. 2026) ไม่มีฟิลด์ kind — ตัวไหนมี platform ถือเป็นโพสต์ */
  function isNews(p) { return p.kind === "news" || (!p.kind && !p.platform); }
  function socialPosts() { return state.posts.filter(function (p) { return !isNews(p); }); }
  function newsPosts() { return state.posts.filter(isNews); }

  /* ชื่อสำนักข่าว — ยืมตารางกลางของ /archives/ มาใช้ (`archives/outlets.config.js`)
     🚫 ห้ามก๊อปรายชื่อมาไว้ที่นี่ — แก้ที่เดียวต้องมีผลทุกหน้า (กฎเดียวกับ noise.js)
     ⚠️ ไม่มีในตาราง = แสดงโดเมนตามเดิม ไม่ซ่อน ไม่ยุบมั่ว */
  /* 🔴 รูปปกเสิร์ฟผ่านเซิร์ฟเวอร์เรา ไม่ให้เบราว์เซอร์ไปโหลดตรง (รีวิว 8 ก.ย. 2026 ข้อ 8)
     · CDN ของ TikTok/FB/IG บล็อกตาม Referer — เซิร์ฟเวอร์ไปโหลดแทนจึงไม่โดน
     · และ cache ไว้ 30 วัน พอลิงก์เซ็นชื่อของต้นทางหมดอายุ รูปยังเสิร์ฟได้ต่ออีกพักใหญ่
     ⚠️ YouTube ไม่ต้องผ่าน — ลิงก์ไม่หมดอายุและไม่บล็อก hotlink ผ่านไปก็เพิ่มงานเปล่าๆ
     ⚠️ ลิงก์ที่ไม่ใช่ https ปล่อยไว้ตามเดิม ฝั่งเซิร์ฟเวอร์ปฏิเสธเองอยู่แล้ว */
  function imgSrc(p) {
    var u = p.thumb || "";
    if (!u) return "";
    if (/^https:\/\/[^/]*(ytimg|ggpht)\.com\//i.test(u)) return u;
    if (!/^https:\/\//i.test(u)) return u;
    return "/social/api/img?u=" + encodeURIComponent(u);
  }

  function outletOf(p) {
    var h = p.host || "";
    if (!h) { try { h = new URL(p.url).hostname.replace(/^www\./i, "").toLowerCase(); } catch (e) { h = ""; } }
    var map = window.ARCHIVE_OUTLETS || {};
    return map[h] || h || "ไม่ทราบสำนัก";
  }

  /* เดือนที่ใช้จัดกลุ่มในกราฟ — วันที่โพสต์ก่อน ถ้าไม่รู้ค่อยใช้วันที่เพิ่มเข้ารายการ
     ⚠️ ต้องบอกผู้ใช้ว่าใบไหนใช้วันที่เพิ่ม (ป้าย ~) ไม่งั้นกราฟจะดูเหมือนเป็นวันที่จริงทั้งหมด
        ต้นทางหลายเจ้าไม่บอกวันที่โพสต์เลย — เดาแล้วไม่บอก = ตัวเลขโกหกแบบเงียบๆ */
  function monthOf(p) {
    var s = p.publishedAt || "";
    if (s && s.length >= 7) return { m: s.slice(0, 7), exact: true };
    var d = new Date(p.addedAt || 0);
    if (!p.addedAt || isNaN(d.getTime())) return null;
    return { m: d.toISOString().slice(0, 7), exact: false };
  }
  var TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  function monthLabel(m) {
    var a = m.split("-");
    return TH_MON[+a[1] - 1] + " " + (+a[0] + 543 - 2000 > 0 ? String(+a[0] + 543).slice(2) : a[0]);
  }

  /* ── ตัวช่วยเล็กๆ ─────────────────────────────────────────────────
     ⚠️ ไฟล์นี้ไม่ยืมของ app.js เพราะ app.js ไม่ได้ export อะไรออกมา
        ก๊อปมาเฉพาะที่จำเป็นจริงๆ 3 ตัว ไม่ลากมาทั้งชุด */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(v) {
    if (v == null || isNaN(v)) return "—";
    var n = Number(v);
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
    return n.toLocaleString("th-TH");
  }
  function pct(v) { return v == null || isNaN(v) ? "—" : (v * 100).toFixed(2) + "%"; }
  function whenTxt(ms) {
    if (!ms) return "ยังไม่เคยดึง";
    var s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return "เมื่อครู่";
    if (s < 3600) return Math.round(s / 60) + " นาทีที่แล้ว";
    if (s < 86400) return Math.round(s / 3600) + " ชม.ที่แล้ว";
    return Math.round(s / 86400) + " วันที่แล้ว";
  }

  var P_LABEL = { youtube: "YouTube", tiktok: "TikTok", facebook: "Facebook", instagram: "Instagram" };
  var M_LABEL = { views: "Views", likes: "Likes", comments: "Comments", shares: "Shares" };

  /* 🔴 แยกเป็น 3 ตารางตามแพลตฟอร์ม (เจ้าของสั่ง 8 ก.ย. 2026)
     เหตุผลที่แยกแล้วดีกว่ารวม: **แต่ละเจ้าให้ตัวเลขคนละชุด**
     เอามาเรียงในตารางเดียวกันจะเต็มไปด้วย "—" จนอ่านไม่ออกว่าคอลัมน์ไหนใช้ได้กับใคร
     · `hide` = คอลัมน์ที่เจ้านั้น **ไม่มีทางมี** → ตัดทิ้งเลย ไม่ปล่อยให้เป็นช่องว่าง
       (กฎเดียวกับ section ข่าวที่ไม่มีคอลัมน์ Views/Engagement) */
  var GROUPS = [
    { key: "youtube", label: "YouTube", plats: ["youtube"], hide: ["shares"],
      note: "YouTube ไม่เปิดเผยจำนวนแชร์ผ่าน API จึงไม่มีคอลัมน์ Shares" },
    { key: "tiktok", label: "TikTok", plats: ["tiktok"] },
    { key: "meta", label: "Facebook / Instagram", plats: ["facebook", "instagram"],
      note: "โพสต์ที่ไม่ใช่วิดีโอไม่มียอดวิว — ต้นทางส่งมาแต่ยอดปฏิสัมพันธ์ (Likes/Shares/Comments)" },
  ];

  /* 🔴 "Views 0 ทั้งที่มี Likes 287" เป็นไปไม่ได้ — ต้นทางส่ง 0 มาแทนที่จะบอกว่าไม่รู้
     (เจอจริงกับ TikTok 8 ก.ย. 2026) · ต้องติดป้ายเตือน **ห้ามแก้ตัวเลขเงียบๆ**
     แก้ให้เป็น null เอง = เราเดาแทนต้นทาง ซึ่งผิดกฎ "ไม่รู้ ห้ามกลืนเป็นค่าใดค่าหนึ่ง" เหมือนกัน */
  /* ข้อความอธิบายใต้ชื่อโพสต์ — มี 2 กรณี ต้องแยกให้ออก
     ① ต้นทางไม่ส่งบางตัวมา (เช่น FB ที่ไม่ใช่วิดีโอ ไม่มียอดวิว) = เรื่องปกติของแพลตฟอร์มนั้น
     ② ส่งมาเป็น 0 ทั้งที่เป็นไปไม่ได้ (Views 0 แต่มีไลก์ 287) = ค่าที่เชื่อไม่ได้
     ทั้ง 2 กรณีต้องบอกชื่อฟิลด์ที่ต้นทางส่งมาจริง ไม่งั้นไล่ปัญหาต่อไม่ได้ */
  function rowNote(p) {
    if (p.err) return "";
    var w = p.warn || {}, miss = w.miss || [], bad = zeroSuspect(p);
    if (!miss.length && !bad) return "";
    var msg = bad
      ? "ต้นทางส่ง <b>Views = 0</b> มาทั้งที่มี Engagement " + num(engOf(p)) + " — <b>ยอดนี้เชื่อไม่ได้</b>"
      : "ต้นทางไม่ได้ส่ง <b>" + esc(miss.map(function (k) { return M_LABEL[k] || k; }).join(" · ")) + "</b> มา";
    return '<div class="influ-w">' + msg +
      (w.keys && w.keys.length
        ? " · ฟิลด์ตัวเลขที่ได้: " + w.keys.map(function (k) { return "<code>" + esc(k) + "</code>"; }).join(" ")
        : "") + "</div>";
  }

  function zeroSuspect(p) {
    var v = (p.stats || {}).views, e = engOf(p);
    return v === 0 && e != null && e > 0;
  }
  var P_COLOR = { youtube: "#dc2626", tiktok: "#0d9488", facebook: "#2563eb", instagram: "#c2410c" };

  /* engagement = ยอดที่นับได้จริงเท่านั้น
     ⚠️ ตัวที่ต้นทางไม่ส่งมา (null) ต้องข้าม ไม่ใช่บวกเป็น 0 —
        ไม่งั้น YouTube ที่ไม่มีแชร์จะดูเหมือน "แชร์ 0" ทั้งที่แปลว่า "ไม่รู้"
     ⚠️ และถ้าไม่มีสักตัวเลย ต้องคืน null ไม่ใช่ 0 */
  function engOf(p) {
    var s = p.stats || {}, sum = null;
    ["likes", "comments", "shares"].forEach(function (k) {
      if (s[k] != null) sum = (sum || 0) + s[k];
    });
    return sum;
  }
  function erOf(p) {
    var e = engOf(p), v = (p.stats || {}).views;
    return e != null && v ? e / v : null;
  }

  /* ── แกะลิงก์ออกจากข้อความที่วางมา ────────────────────────────────
   * 🔴 เจ้าของวางแบบ "แคปชั่น 1 บรรทัด แล้วลิงก์บรรทัดถัดไป" (31 ส.ค. 2026)
   *    ตัดด้วยช่องว่างแล้วเอาทุกชิ้นมาเป็นลิงก์ไม่ได้ — วางจริงได้ 47 ชิ้น
   *    เด้ง 44 อันว่า "ไม่รู้จักแพลตฟอร์ม" ทั้งที่มีลิงก์จริงแค่ 3
   * ✅ เก็บบรรทัดข้อความก่อนหน้าเป็นชื่อตั้งต้นของลิงก์นั้น
   *    จำเป็นจริง เพราะลิงก์ย่อ (vt.tiktok.com · facebook.com/share) ไม่มีชื่อในตัวเลย
   * ⚠️ ตรรกะเดียวกับ parseInput() ฝั่งเซิร์ฟเวอร์ — แก้ที่หนึ่งต้องแก้อีกที่
   *    (ฝั่งนี้ต้องมีด้วยเพื่อบอกจำนวนก่อนส่ง · ฝั่งโน้นต้องมีกันคนยิง API ตรงๆ) */
  function parseInput(text) {
    var out = [], note = "";
    String(text || "").split(/\r?\n/).forEach(function (line) {
      var t = line.trim();
      if (!t) return;
      var m = t.match(/https?:\/\/[^\s<>"']+/g);
      if (!m) { note = t.slice(0, 200); return; }
      m.forEach(function (u) { out.push({ url: u, note: note }); });
      note = "";
    });
    return out;
  }

  /* ── ยิง API ──────────────────────────────────────────────────── */
  function call(opt) {
    var o = opt
      ? { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(opt) }
      : { headers: { accept: "application/json" } };
    return fetch(EP, o).then(function (r) {
      /* 🔒 เซสชัน Cloudflare Access หมด = ได้หน้าเข้าสู่ระบบเป็น HTML กลับมาแทน JSON
         เอาไป r.json() จะพังแล้วรายงานผิดเรื่อง (กฎเดียวกับ social/data.js) */
      var ct = r.headers.get("content-type") || "";
      if (ct.indexOf("json") < 0) return { ok: false, status: "signed-out", message: "เซสชันหมดอายุ ต้องเข้าสู่ระบบใหม่" };
      return r.json();
    }).catch(function (e) {
      return { ok: false, status: "error", message: "ต่อกับเซิร์ฟเวอร์ไม่ได้ หรือเซสชันหมดอายุ (" + (e.message || e) + ")" };
    });
  }

  function take(res) {
    state.busy = "";
    if (!res || !res.ok) {
      state.err = (res && res.message) || "ดึงข้อมูลไม่สำเร็จ";
      if (res && res.status === "signed-out") state.err = "เซสชันหมดอายุ — โหลดหน้าใหม่เพื่อเข้าสู่ระบบอีกครั้ง";
      draw();
      return;
    }
    var d = res.data || {};
    state.loaded = true;
    state.err = "";
    state.posts = d.posts || [];
    state.missing = d.missing || [];
    state.at = d.at || 0;
    state.credits = d.credits || null;
    state.delId = "";       // ข้อมูลเปลี่ยนแล้ว การยืนยันเดิมไม่มีความหมาย

    /* ⚠️ ลิงก์ที่เพิ่มไม่ได้ต้องบอกทีละอันว่าทำไม ไม่ใช่บอกแค่จำนวน
       ผู้ใช้วางมา 10 ลิงก์แล้วขึ้นว่า "เพิ่มไม่ได้ 3" จะไม่รู้ว่าอันไหน */
    if (d.rejected && d.rejected.length) {
      state.note = d.rejected.map(function (x) { return x.url + " — " + x.why; }).join("\n");
    }
    draw();
  }

  function load() {
    if (state.busy) return;
    state.busy = "load"; draw();
    call(null).then(take);
  }

  /* ── ตัวกรอง ─────────────────────────────────────────────────── */
  function accounts() {
    var seen = {};
    socialPosts().forEach(function (p) { if (p.account) seen[p.account] = 1; });
    return Object.keys(seen).sort();
  }

  function outlets() {
    var seen = {};
    newsPosts().forEach(function (p) { seen[outletOf(p)] = 1; });
    return Object.keys(seen).sort();
  }

  /** ข่าวที่ผ่านตัวกรองของ section ② (คนละชุดกับตัวกรองของ section ①) */
  function newsShown() {
    var q = state.nq.trim().toLowerCase();
    return newsPosts().filter(function (p) {
      if (state.fOutlet !== "all" && outletOf(p) !== state.fOutlet) return false;
      if (q && ((p.title || "") + " " + (p.note || "") + " " + outletOf(p) + " " + p.url).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return (b.addedAt || 0) - (a.addedAt || 0); });
  }

  function shown() {
    var q = state.q.trim().toLowerCase();
    return socialPosts().filter(function (p) {
      if (state.fPlatform !== "all" && p.platform !== state.fPlatform) return false;
      if (state.fAccount !== "all" && p.account !== state.fAccount) return false;
      // ค้นให้ครอบแคปชั่นด้วย — หลายใบยังไม่มีชื่อจริงจากต้นทาง มีแต่แคปชั่น
      if (q && ((p.title || "") + " " + (p.note || "") + " " + (p.account || "")).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      var av = sortVal(a), bv = sortVal(b);
      /* ⚠️ ค่าที่ไม่มี (—) ไปท้ายเสมอ ไม่ว่าเรียงทางไหน
         ปล่อยให้เป็น 0 แล้วเรียงขึ้น "ไม่รู้ค่า" จะดูเหมือน "น้อยที่สุด" ซึ่งคนละเรื่อง */
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * state.dir;
    });
  }

  /* ⚠️ ต้องคิดจาก valOf() ตัวเดียวกับที่ตารางวาด ไม่งั้นเรียงแล้วลำดับไม่ตรงกับที่เห็น */
  function sortVal(p) {
    if (state.sort === "added") return p.addedAt || 0;
    return valOf(p, state.sort);
  }

  /* ── วาด ─────────────────────────────────────────────────────── */
  /* 🔴 ลำดับคอลัมน์ตามที่เจ้าของสั่งเป๊ะ (8 ก.ย. 2026):
        "วันที่โพส, View, Engagement, like, share, comment"
     · ER ต่อท้ายเป็นของเดิมที่มีอยู่แล้ว (คิดมาจาก 2 คอลัมน์ในตารางนี้ ไม่ใช่ข้อมูลใหม่) */
  var COLS = [
    { key: "date", label: "วันที่โพสต์", fmt: "date" },
    { key: "views", label: "Views" },
    { key: "eng", label: "Engagement", strong: true },
    { key: "likes", label: "Likes" },
    { key: "shares", label: "Shares", na: "YouTube ไม่เปิดเผยจำนวนแชร์ผ่าน API" },
    { key: "comments", label: "Comments" },
    { key: "er", label: "ER", fmt: "pct" },
  ];

  /** ค่าดิบของคอลัมน์หนึ่งในแถวหนึ่ง — ใช้ทั้งตอนวาด ตอนเรียง และตอนรวม (จุดเดียวกัน) */
  function valOf(p, key) {
    if (key === "eng") return engOf(p);
    if (key === "er") return erOf(p);
    if (key === "date") { var w = whenOf(p); return w ? w.t : null; }
    var v = (p.stats || {})[key];
    return v == null ? null : v;
  }

  /* วันที่ที่จะแสดงในคอลัมน์ "วันที่โพสต์"
     ⚠️ ต้นทางบางเจ้าไม่บอกวันที่โพสต์เลย → ใช้วันที่เพิ่มเข้ารายการแทน **พร้อมป้าย ~**
        ห้ามแสดงเหมือนเป็นวันที่โพสต์จริง — กฎเดียวกับกราฟรายเดือน */
  function whenOf(p) {
    var s = p.publishedAt || "";
    if (s.length >= 10) { var d = new Date(s); if (!isNaN(d.getTime())) return { t: d.getTime(), exact: true }; }
    if (p.addedAt) return { t: p.addedAt, exact: false };
    return null;
  }
  function dayLabel(ms) {
    var d = new Date(ms);
    return d.getDate() + " " + TH_MON[d.getMonth()] + " " + String(d.getFullYear() + 543).slice(2);
  }

  function html() {
    var h = "";

    if (state.err) {
      h += '<div class="lagbar" style="background:#fef2f2;border-color:#fecaca;color:#7f1d1d">' +
        '<span class="lag-i">⚠️</span><div><b>' + esc(state.err) + "</b></div></div>";
    }

    /* ⚠️ ขาด env ไม่ได้แปลว่าใช้ไม่ได้ทั้งแท็บ — ขาด ScrapeCreators ยังดู YouTube ได้
       ต้องเขียนให้ชัด ไม่งั้นเจ้าของจะนึกว่าต้องตั้งค่าครบก่อนถึงจะใช้ได้เลย */
    if (state.missing.length) {
      h += '<div class="lagbar"><span class="lag-i">🔑</span><div><b>ยังตั้งค่าไม่ครบ — ใช้ได้บางส่วน</b>' +
        "<div>ยังไม่ได้ใส่ " + state.missing.map(function (k) { return "<code>" + esc(k) + "</code>"; }).join(" · ") +
        " ใน Cloudflare (ใส่เป็น Secret ทั้ง Production และ Preview แล้วสั่ง Retry deployment)" +
        (state.missing.indexOf("SCRAPECREATORS_API_KEY") >= 0
          ? " · ระหว่างนี้ <b>ลิงก์ YouTube ยังใช้ได้ปกติ</b> ส่วน TikTok/Facebook/Instagram จะยังไม่มียอด" : "") +
        "</div></div></div>";
    }

    if (!state.loaded && state.busy === "load") {
      return h + '<div class="emtab"><div class="loading"><span class="spin"></span> กำลังโหลดรายการ…</div>' +
        addBox() + "</div>";
    }

    /* ลำดับตามรีวิว 8 ก.ย. 2026: ตอบ "สดแค่ไหน" กับ "อะไรเด่น" ให้ได้ใน 3 วินาที
       → แถบอัปเดต + KPI อยู่บนสุด · กล่องวางลิงก์อยู่ล่างสุดและเฉพาะโหมดแก้ไข */
    /* 🔴 ห่อทั้งแท็บด้วย `.emtab` — ระบบภาพของรีวิว (สี/ฟอนต์/กรอบ) ผูกไว้กับคลาสนี้เท่านั้น
       ⚠️ ห้ามไปแก้ `.sec` `.panel` `.tbl` ที่ระดับไฟล์ — 4 แท็บแรกใช้ร่วมกันอยู่
          แก้ตรงนั้นเมื่อไหร่ หน้าตาของแท็บที่รีวิวไม่ได้ดูจะเปลี่ยนตามไปด้วยทั้งหมด */
    return h + '<div class="emtab">' +
      headerBar() + kpiCards() + monthPanel() + socialSection() + newsSection() + addBox() +
      "</div>";
  }

  /* ── กล่องวางลิงก์ (ใช้ร่วมทั้ง 2 section — ระบบแยกให้เองว่าอันไหนเป็นข่าว) ── */
  function addBox() {
    // 🔴 ซ่อนทั้งกล่องเมื่อไม่ได้เปิดโหมดแก้ไข (รีวิวข้อ 1) · จอแคบซ่อนด้วย CSS อีกชั้น
    if (!state.edit) return "";
    var h = '<h2 class="sec editonly">วางลิงก์ ' +
      '<button type="button" class="tipi" data-tip="วางได้ทีละหลายลิงก์ บรรทัดละ 1 อัน · ลิงก์ YouTube/TikTok/Facebook/Instagram เข้า section โพสต์ · ลิงก์สำนักข่าวเข้า section ข่าวโดยอัตโนมัติ · ลิงก์ที่ซ้ำกับที่มีอยู่แล้วจะถูกข้าม" title="วางได้ทีละหลายลิงก์ บรรทัดละ 1 อัน">ⓘ</button></h2>' +
      '<div class="panel editonly"><div class="addbox">' +
      '<textarea id="influ-in" class="addta" rows="3" placeholder="https://www.tiktok.com/@ชื่อ/video/…&#10;https://www.thansettakij.com/news/…" ' +
      (state.busy ? "disabled" : "") + ">" + esc(state.draft) + "</textarea>" +
      '<button type="button" class="btn primary" data-influ="add"' + (state.busy ? " disabled" : "") + ">" +
      (state.busy === "add" ? '<span class="spin"></span> กำลังเพิ่ม…' : "+ เพิ่ม") + "</button>" +
      "</div>" +
      /* ⚠️ ต้องบอกตั้งแต่ก่อนกดว่าระบบจะแยกให้เอง ไม่งั้นวางลิงก์ข่าวลงไปแล้วไม่เห็นในตารางโพสต์
         จะนึกว่าเพิ่มไม่สำเร็จ ทั้งที่มันไปอยู่อีก section ข้างบน */
      '<p class="addnote sub">วางปนกันได้ — ลิงก์โซเชียลเข้า <b>① โพสต์อินฟลูเอนเซอร์</b> ' +
      "ลิงก์สำนักข่าวเข้า <b>② ข่าว</b> ให้เอง</p>";
    if (state.note) h += '<p class="addnote">' + esc(state.note).replace(/\n/g, "<br>") + "</p>";
    return h + "</div>";
  }

  /* ── กราฟรายเดือน — **section ละกราฟ** (เจ้าของสั่ง 8 ก.ย. 2026) ─────────
   * ของเดิมเป็นกราฟรวมกราฟเดียวแล้วแยกสีในแท่งเดียวกัน
   * 🔴 "แยกเป็น section social กับ ข่าว แต่ละอันมีกราฟของตัวเอง"
   * 🔴 "ไล่ 3 เดือนย้อนหลัง" — ไล่จาก **เดือนนี้ย้อนไป 3 เดือน** ทุกเดือนต้องมีแถว
   *    ⚠️ เดือนที่ไม่มีของต้องขึ้นเป็น 0 ไม่ใช่หายไปจากกราฟ
   *       หายไป = อ่านไม่ออกว่า "เดือนนั้นไม่มีงาน" หรือ "กราฟไม่ได้นับเดือนนั้น"
   *    ⚠️ ของที่เก่ากว่า 3 เดือนต้องบอกว่ามีกี่ชิ้น ไม่ใช่ตัดทิ้งเงียบๆ
   */
  function last3Months() {
    var out = [], d = new Date();
    for (var i = 2; i >= 0; i--) {
      var x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      out.push(x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0"));
    }
    return out;
  }

  /* ── กราฟรายเดือน — **กราฟเดียว รวมโพสต์ + ข่าว แยก 2 สี** (รีวิว 8 ก.ย. 2026 ข้อ 4)
   * ของเดิมเป็นกราฟแยก section ละอัน · ตอนนี้รวมเป็นอันเดียวอยู่บนสุด
   * ⚠️ เดือนที่เป็น 0 ทั้งคู่ = โชว์แค่ชื่อเดือนสีจาง ไม่วาดแท่ง (ยังต้องมีแถว ไม่ใช่หายไป)
   * ⚠️ Engagement มาจาก **โพสต์อย่างเดียว** เพราะข่าวไม่ได้ดึงยอด — เขียนกำกับไว้เสมอ
   */
  function monthPanel() {
    if (!state.posts.length) return "";
    var keys = last3Months();
    var by = {}, approx = 0, outside = 0;
    keys.forEach(function (k) { by[k] = { s: 0, n: 0, eng: null, hasEng: false }; });

    state.posts.forEach(function (p) {
      var m = monthOf(p);
      if (!m || !by[m.m]) { outside++; return; }
      if (!m.exact) approx++;
      var b = by[m.m];
      if (isNews(p)) b.n++;
      else {
        b.s++;
        var e = engOf(p);
        if (e != null) { b.eng = (b.eng || 0) + e; b.hasEng = true; }
      }
    });

    var max = 0;
    keys.forEach(function (k) { max = Math.max(max, by[k].s + by[k].n); });

    var h = '<div class="panel mpanel' + (state.moChart ? " mo-open" : "") + '">' +
      '<div class="mhead"><span class="mlg"><i class="sw sw-p"></i>โพสต์ <i class="sw sw-n"></i>ข่าว' +
      ' · <span class="sub">เลขใต้แท่ง = Engagement (จากโพสต์อย่างเดียว)</span>' +
      /* ⚠️ หมายเหตุยาวๆ ย้ายมาอยู่ใน tooltip ของ ⓘ ไม่ให้กินบรรทัด (รีวิวข้อ 4) */
      (approx || outside
        ? ' <button type="button" class="tipi" title="' +
          esc([approx ? approx + " ชิ้นไม่รู้วันที่เผยแพร่ จึงจัดตามวันที่เพิ่มเข้ารายการ" : "",
               outside ? "อีก " + outside + " ชิ้นเก่ากว่า 3 เดือน ไม่ได้นับในกราฟนี้ (ยังอยู่ในตารางข้างล่าง)" : ""]
            .filter(Boolean).join(" · ")) + '">ⓘ</button>'
        : "") +
      "</span></div>" +
      '<div class="bchart" role="img" aria-label="จำนวนชิ้นงานรายเดือน 3 เดือนล่าสุด">';

    keys.forEach(function (k) {
      var b = by[k], tot = b.s + b.n;
      h += '<div class="bcol' + (tot ? "" : " zero") + '" title="' +
        esc(monthLabel(k) + " · โพสต์ " + b.s + " · ข่าว " + b.n +
          " · Engagement " + (b.hasEng ? num(b.eng) : "—")) + '">' +
        '<div class="bcnt">' + (tot || "") + "</div>" +
        '<div class="btrk">' +
        (b.n ? '<span class="bbar bnews" style="height:' + ((b.n / max) * 100).toFixed(1) + '%"></span>' : "") +
        (b.s ? '<span class="bbar bpost" style="height:' + ((b.s / max) * 100).toFixed(1) + '%"></span>' : "") +
        "</div>" +
        '<div class="blab">' + esc(monthLabel(k)) + "</div>" +
        /* 🚫 เดือนที่ยังไม่รู้ยอดต้องเป็น "—" ไม่ใช่ 0 — 0 แปลว่าไม่มีใครมีปฏิสัมพันธ์ */
        '<div class="beng">' + (b.hasEng ? esc(num(b.eng)) : "—") + "</div>" +
        "</div>";
    });

    /* จอแคบ: กราฟซ่อนไว้หลังปุ่ม — บนมือถือของที่ต้องเลื่อนผ่านทุกครั้งคือของที่กีดขวาง
       ⚠️ ปุ่มนี้ต้องไม่โผล่บนเดสก์ท็อป (CSS คุมไว้) ไม่งั้นกลายเป็นปุ่มที่กดแล้วไม่มีอะไรเปลี่ยน */
    return h + "</div></div>" +
      '<button type="button" class="btn mochart" data-influ="mchart">' +
      (state.moChart ? "▲ ซ่อนรายเดือน" : "▼ ดูรายเดือน") + "</button>";
  }

  /* ── ① โพสต์อินฟลูเอนเซอร์ ──────────────────────────────────────── */
  function socialSection() {
    var list = shown();
    var h = "";

    /* 🔴 เอากล่องสรุป 4 ใบออก (เจ้าของสั่ง 8 ก.ย. 2026: "summary box ไม่ต้อง")
       ตัวเลขรวมมีอยู่ใน **แถวรวมท้ายตารางของแต่ละแพลตฟอร์ม** อยู่แล้ว
       ⚠️ และรวมข้ามแพลตฟอร์มเป็นก้อนเดียวก็อ่านผิดง่าย — Views ของ YouTube
          กับของ TikTok นับกันคนละแบบ เอามาบวกกันแล้วไม่ได้แปลว่าอะไร */
    h += '<h2 class="sec">① โพสต์อินฟลูเอนเซอร์ ' +
      '<span class="sub">อัปเดตยอดล่าสุด ' + esc(whenTxt(state.at)) + "</span></h2>";

    // ── แถบตัวกรอง ──
    /* 🔴 filter เป็น chip แถวเดียวพร้อมจำนวน + ช่องค้นหาขวาสุด (รีวิวข้อ 5)
       · ตัด dropdown "ช่อง" ออก — ช่องค้นหาค้นได้ทั้งหัวข้อและชื่อช่องอยู่แล้ว
       · ปุ่ม "อัปเดตยอด" ย้ายไปแถบหัว มันไม่ใช่ตัวกรอง */
    var cnt = { all: socialPosts().length };
    Object.keys(P_LABEL).forEach(function (k) { cnt[k] = 0; });
    socialPosts().forEach(function (p) { if (cnt[p.platform] != null) cnt[p.platform]++; });
    h += '<div class="panel"><div class="influbar">' +
      '<div class="fchips">' + ["all"].concat(Object.keys(P_LABEL)).map(function (k) {
        if (k !== "all" && !cnt[k]) return "";      // ไม่โชว์ chip ของแพลตฟอร์มที่ไม่มีโพสต์เลย
        return '<button type="button" class="fchip' + (state.fPlatform === k ? " on" : "") +
          '" data-influchip="' + k + '">' + (k === "all" ? "ทั้งหมด" : esc(P_LABEL[k])) +
          ' <span class="fchip-n">' + cnt[k] + "</span></button>";
      }).join("") + "</div>" +
      '<input type="search" id="influ-q" class="pp-dt influq" data-influ="q" placeholder="ค้นหาหัวข้อหรือชื่อช่อง" value="' + esc(state.q) + '">' +
      "</div>";

    if (!socialPosts().length) {
      return h + '<div class="empty"><div class="empty-i">🔗</div><div><b>ยังไม่มีโพสต์ในรายการ</b>' +
        "<div>วางลิงก์ YouTube / TikTok / Facebook / Instagram ในกล่องด้านบน</div></div></div></div>";
    }
    if (!list.length) {
      return h + '<div class="empty"><div class="empty-i">🔍</div><div><b>ไม่มีโพสต์ที่ตรงกับตัวกรอง</b>' +
        "<div>ลองล้างตัวกรองหรือคำค้น</div></div></div></div>";
    }

    /* 🔴 แยกเป็น 3 ตารางตามแพลตฟอร์ม (เจ้าของสั่ง 8 ก.ย. 2026)
       กลุ่มที่ไม่มีโพสต์เลย **ไม่ต้องขึ้นตารางเปล่า** — ขึ้นแล้วรกโดยไม่ได้บอกอะไรเพิ่ม */
    GROUPS.forEach(function (g) {
      var part = list.filter(function (p) { return g.plats.indexOf(p.platform) >= 0; });
      if (part.length) h += postTable(part, g);
    });
    return h + "</div>";
  }

  /* ตารางโพสต์ 1 กลุ่ม — คอลัมน์ที่กลุ่มนั้นไม่มีทางมี (`hide`) ถูกตัดทิ้งไปเลย
     ⚠️ ไม่ปล่อยให้เป็นช่องว่าง — กฎเดียวกับ section ข่าวที่ไม่มีคอลัมน์ Views/Engagement */
  function postTable(list, g) {
    var cols = COLS.filter(function (c) { return (g.hide || []).indexOf(c.key) < 0; });

    var h = '<h3 class="gsec"><span class="pdot" style="background:' + P_COLOR[g.plats[0]] + '"></span>' +
      esc(g.label) + ' <span class="sub">' + list.length + " โพสต์</span></h3>" +
      (g.note ? '<p class="gnote">' + esc(g.note) + "</p>" : "") +
      /* ⚠️ `influtbl` เป็นคลาสเฉพาะแท็บนี้ — กฎมือถือ (ตาราง→การ์ด) ต้องไม่หลุดไปโดน
         ตารางของแท็บ YouTube/TikTok/Facebook ที่ใช้ `.tbl.perf` ร่วมกันอยู่ */
      '<div class="tblwrap"><table class="tbl perf influtbl"><thead><tr><th>โพสต์</th>' +
      cols.map(function (c) {
        var on = state.sort === c.key;
        return '<th class="num srt' + (on ? " on" : "") + '"><button type="button" class="srtb" data-influsort="' +
          c.key + '">' + esc(c.label) + '<span class="srta">' + (on ? (state.dir < 0 ? "▼" : "▲") : "↕") + "</span></button></th>";
      }).join("") + "<th></th></tr></thead><tbody>";

    list.forEach(function (p) {
      h += '<tr data-rowid="' + esc(p.id) + '"' + (state.openRow === p.id ? ' class="open"' : "") +
        '><th scope="row"><div class="rowhead influrow">' +
        /* 🔴 รูปไม่ขึ้นมีได้ 2 สาเหตุ ซึ่ง **ต้องแยกให้ออก** (เจ้าของถาม 8 ก.ย. 2026)
             ① ต้นทางไม่ได้ส่งลิงก์รูปมาเลย  ② ส่งมาแต่โหลดไม่ขึ้น (ลิงก์หมดอายุ/ถูกบล็อก)
           ของเดิมทั้ง 2 กรณีขึ้นเป็นกล่องเปล่าเหมือนกันเป๊ะ = ไล่ต่อไม่ได้ ต้องเดาเอา
           ⚠️ referrerpolicy="no-referrer" จำเป็น — CDN ของ TikTok/Facebook/Instagram
              บล็อกรูปตาม Referer (hotlink) ถ้าส่งชื่อโดเมนเราไป มันตอบ 403 ทันที */
        (p.thumb
          ? '<img class="influ-th" src="' + esc(imgSrc(p)) + '" alt="" referrerpolicy="no-referrer">'
          : '<span class="influ-th ph" title="ต้นทางไม่ได้ส่งลิงก์รูปปกมา — กด 🔄 อัปเดตยอดเพื่อลองดึงใหม่"></span>') +
        '<div class="influ-m"><a href="' + esc(p.url) + '" target="_blank" rel="noopener" title="' +
        esc(p.title || p.note || p.url) + '">' +
        /* ⚠️ ลำดับสำคัญ: ชื่อจริงจากต้นทาง > แคปชั่นที่วางมา > URL ดิบ
           ลิงก์ย่อที่ดึงชื่อไม่ได้ ถ้าไม่มีแคปชั่นรอง ตารางจะมีแต่ URL ยาวๆ อ่านไม่รู้เรื่อง */
        esc(p.title || p.note || p.url) + ' <span class="ext">↗</span></a>' +
        /* 🔴 ชื่อโปรไฟล์ต่อท้ายชื่อโพสต์ (เจ้าของสั่ง 8 ก.ย. 2026)
           ⚠️ ชื่อแพลตฟอร์มไม่ต้องเขียนซ้ำแล้ว — หัวตารางบอกอยู่ (แยก 3 ตารางตามแพลตฟอร์ม)
           ⚠️ ต้นทางบางเจ้าไม่บอกชื่อโปรไฟล์ ต้องเขียนว่า "ไม่ทราบชื่อโปรไฟล์"
              ไม่ใช่ปล่อยว่าง — ว่างแล้วแยกไม่ออกว่าลืมแสดงหรือไม่มีข้อมูล */
        '<div class="influ-s">' +
        (p.account ? "👤 " + esc(p.account) : '<span class="na">ไม่ทราบชื่อโปรไฟล์</span>') + "</div>" +
        /* ⚠️ ใบที่ดึงยอดไม่สำเร็จต้องบอกเหตุผลตรงแถวนั้น ไม่ใช่ขึ้น "—" เฉยๆ
           ไม่งั้นแยกไม่ออกว่า "ต้นทางไม่ให้ตัวเลข" กับ "ยอดเป็น 0 จริงๆ" */
        (p.err ? '<div class="influ-e">⚠️ ' + esc(p.err) + "</div>" : "") +
        rowNote(p) +
        "</div></div></th>";

      cols.forEach(function (c) {
        var v = valOf(p, c.key);
        var w = c.key === "date" ? whenOf(p) : null;
        var txt = v == null ? "—"
          : c.fmt === "date" ? (w.exact ? "" : "~") + dayLabel(v)
          : c.fmt === "pct" ? pct(v) : num(v);
        var fishy = c.key === "views" && zeroSuspect(p);
        // ~ = ไม่รู้วันที่โพสต์จริง ใช้วันที่เพิ่มลิงก์เข้ารายการแทน — ต้องบอก ไม่ใช่แสดงเหมือนของจริง
        var why = fishy ? "ต้นทางส่ง 0 มาทั้งที่โพสต์นี้มีคนกดไลก์/คอมเมนต์ — ยอดนี้เชื่อไม่ได้"
          : v == null ? c.na
          : (w && !w.exact ? "ต้นทางไม่บอกวันที่โพสต์ — นี่คือวันที่เพิ่มลิงก์เข้ารายการ" : "");
        /* 🔴 มือถือไม่มีหัวตาราง (รีวิว 8 ก.ย. 2026 ข้อ 7: "มือถือไม่ใช้ตาราง")
           เซลล์จึงต้องพกชื่อคอลัมน์ไปเอง ไม่งั้นเห็นเลขลอยๆ แล้วไม่รู้ว่าเลขอะไร
           · `mo` = 3 ตัวที่โชว์ตลอดบนมือถือ · ที่เหลือซ่อนไว้ใต้ปุ่มขยาย */
        var moCol = c.key === "views" || c.key === "eng" || c.key === "er";
        h += '<td class="num' + (c.strong ? " strong" : "") + (moCol ? " mo" : "") +
          (v == null || fishy || (w && !w.exact) ? " na" : "") + '" data-l="' + esc(c.label) + '"' +
          (why ? ' title="' + esc(why) + '"' : "") + ">" + esc(txt) + (fishy ? " ⚠️" : "") + "</td>";
      });

      /* ปุ่มขยายมีเฉพาะจอแคบ (CSS คุม) — เดสก์ท็อปเห็นทุกคอลัมน์อยู่แล้ว
         ⚠️ ห้ามโผล่บนเดสก์ท็อป ไม่งั้นเป็นปุ่มที่กดแล้วไม่มีอะไรเปลี่ยน */
      h += '<td class="num">' + delBtn(p.id) +
        '<button type="button" class="btn moex" data-influex="' + esc(p.id) + '" ' +
        'aria-expanded="' + (state.openRow === p.id ? "true" : "false") + '" ' +
        'aria-label="ดูตัวเลขที่เหลือ">' + (state.openRow === p.id ? "▲" : "▼") + "</button></td></tr>";
    });

    /* 🔴 แถวรวมท้ายตาราง (เจ้าของสั่ง 8 ก.ย. 2026: "และมีค่ารวม")
       ⚠️ รวมเฉพาะค่าที่ต้นทางส่งมาจริง — ใบที่เป็น null ต้องข้าม ไม่ใช่บวกเป็น 0
          และถ้าทั้งคอลัมน์ไม่มีค่าเลยต้องขึ้น "—" ไม่ใช่ 0
       ⚠️ ER ของแถวรวมต้องคิดจาก Engagement รวม ÷ Views รวม
          **ห้ามเฉลี่ย ER ของแต่ละแถว** — คลิปยอดน้อยจะมีน้ำหนักเท่าคลิปล้านวิว */
    h += "</tbody><tfoot><tr><th scope=\"row\">รวม " + list.length + " โพสต์</th>";
    var sum = {};
    cols.forEach(function (c) { sum[c.key] = null; });
    list.forEach(function (p) {
      cols.forEach(function (c) {
        if (c.key === "date" || c.key === "er") return;
        var v = valOf(p, c.key);
        if (v != null) sum[c.key] = (sum[c.key] || 0) + v;
      });
    });
    var totalEr = sum.views && sum.eng != null ? sum.eng / sum.views : null;
    cols.forEach(function (c) {
      var v = c.key === "er" ? totalEr : c.key === "date" ? null : sum[c.key];
      var txt = c.key === "date" ? "" : v == null ? "—" : c.fmt === "pct" ? pct(v) : num(v);
      var moCol = c.key === "views" || c.key === "eng" || c.key === "er";
      h += '<td class="num' + (c.strong ? " strong" : "") + (moCol ? " mo" : "") +
        (v == null && c.key !== "date" ? " na" : "") + '" data-l="' + esc(c.label) + '">' + esc(txt) + "</td>";
    });
    return h + "<td></td></tr></tfoot></table></div>";
  }

  /* ── ② ข่าว — นับชิ้น + แยกสำนักข่าวเท่านั้น ────────────────────────
   * 🔴 เจ้าของสั่ง (8 ก.ย. 2026): "อันนี้แค่นับชิ้น และ แยกสำนักข่าวพอ"
   * 🚫 ห้ามใส่คอลัมน์ Views/Engagement ใน section นี้ — เราไม่ได้ดึงยอดข่าวเลย
   *    ใส่คอลัมน์ว่างไว้ = อ่านแล้วเข้าใจว่า "ข่าวไม่มีคนอ่าน" ซึ่งไม่จริง
   */
  function newsSection() {
    var all = newsPosts();
    var list = newsShown();

    var byOut = {};
    all.forEach(function (p) { var o = outletOf(p); byOut[o] = (byOut[o] || 0) + 1; });
    var outs = Object.keys(byOut).sort(function (a, b) { return byOut[b] - byOut[a]; });

    /* 🔴 หัวส่วนบรรทัดเดียว แทนกล่องสรุป 2 ใบ (รีวิว 8 ก.ย. 2026 ข้อ 8)
       ตัวเลข 2 ตัวนี้ไม่ต้องใช้กล่องใหญ่ — อ่านจบในบรรทัดเดียวได้ */
    var h = '<h2 class="sec">② ข่าว <span class="sub">' + all.length + " ข่าว จาก " +
      outs.length + " สำนัก · นับชิ้น ไม่ดึงยอด</span></h2>";

    if (!all.length) {
      return h + '<div class="panel"><div class="empty"><div class="empty-i">📰</div><div><b>ยังไม่มีข่าวในรายการ</b>' +
        "<div>วางลิงก์ข่าวในกล่องด้านล่าง — ระบบแยกให้เองว่าอันไหนเป็นข่าว</div></div></div></div>";
    }

    /* 🔴 กราฟสำนักข่าวถูกตัดออก (รีวิวข้อ 8) — ทุกสำนักมีชิ้นเดียวเท่ากันหมด
       กราฟที่แท่งเท่ากันทุกแท่งไม่ได้บอกอะไรเลย นอกจากกินที่
       ✅ **เปิดกลับเองเมื่อมีสำนักไหนเกิน 2 ชิ้น** — ตอนนั้นกราฟถึงจะเริ่มมีความหมาย */
    var top = outs.slice(0, 12);
    if (byOut[outs[0]] > 2) {
      h += '<div class="panel"><h3 class="sub" style="margin:0 0 8px">จำนวนชิ้นตามสำนักข่าว</h3>' +
        (window.SOCIAL_CHARTS ? window.SOCIAL_CHARTS.hbars(top.map(function (o) {
          // ⚠️ สีเทาเดียวกับส่วนโพสต์ ไม่ใช่แดงอิฐ — ทั้งหน้าใช้สีเน้นสีเดียว
          return { label: o, value: byOut[o], color: "#94a3b8", text: byOut[o] + " ชิ้น" };
        }), { aria: "จำนวนข่าวตามสำนักข่าว" }) : "") +
        (outs.length > top.length ? '<p class="addnote sub">แสดง ' + top.length + " จาก " + outs.length + " สำนัก</p>" : "") +
        "</div>";
    }

    // ── รายการข่าว ──
    h += '<div class="panel"><div class="influbar">' +
      sel("fOutlet", "สำนักข่าว", ["all"].concat(outlets()), function (k) { return k === "all" ? "ทั้งหมด" : k; }) +
      '<input type="search" id="influ-nq" class="pp-dt influq" data-influ="nq" placeholder="ค้นหาหัวข้อ/สำนักข่าว" value="' + esc(state.nq) + '">' +
      "</div>";

    if (!list.length) {
      return h + '<div class="empty"><div class="empty-i">🔍</div><div><b>ไม่มีข่าวที่ตรงกับตัวกรอง</b>' +
        "<div>ลองล้างตัวกรองหรือคำค้น</div></div></div></div>";
    }

    h += '<div class="tblwrap"><table class="tbl perf influtbl newstbl"><thead><tr><th>ข่าว</th>' +
      '<th>สำนักข่าว</th><th class="num">เดือน</th><th></th></tr></thead><tbody>';
    list.forEach(function (p) {
      var m = monthOf(p);
      /* 🔴 ดึงหัวข้อไม่ได้ ห้ามโชว์ URL ดิบ (รีวิวข้อ 8)
         URL ยาวๆ อ่านไม่รู้เรื่องและกินความกว้าง — บอกไปตรงๆ ว่าดึงหัวข้อไม่ได้ */
      var nm = p.title || p.note || "";
      var raw = !nm;
      if (raw) nm = "ข่าวจาก " + outletOf(p) + " (ดึงหัวข้อไม่ได้)";
      h += '<tr><th scope="row"><div class="influ-m"><a class="' + (raw ? "nolabel" : "") +
        '" href="' + esc(p.url) + '" target="_blank" rel="noopener" title="' + esc(raw ? p.url : nm) + '">' +
        esc(nm) + ' <span class="ext">↗</span></a></div></th>' +
        '<td data-l="สำนักข่าว">' + esc(outletOf(p)) + "</td>" +
        /* ~ = ไม่รู้วันที่เผยแพร่ ใช้วันที่เพิ่มเข้ารายการแทน — ต้องบอก ไม่ใช่แสดงเหมือนของจริง */
        '<td class="num' + (m && !m.exact ? " na" : "") + '"' +
        (m && !m.exact ? ' title="ต้นทางไม่บอกวันที่เผยแพร่ — นี่คือเดือนที่เพิ่มลิงก์เข้ารายการ"' : "") + ' data-l="เดือน">' +
        (m ? (m.exact ? "" : "~") + esc(monthLabel(m.m)) : "—") + "</td>" +
        '<td class="num">' + delBtn(p.id) + "</td></tr>";
    });

    return h + "</tbody></table></div></div>";
  }

  /* 🔴 ปุ่มลบต้องกดยืนยัน (เจ้าของสั่ง 8 ก.ย. 2026)
     ⚠️ ใช้การยืนยันในแถวนั้นเลย ไม่ใช้ confirm() ของเบราว์เซอร์ —
        confirm() ถูกบล็อกได้ในบางบริบท และบนมือถือกล่องเด้งเต็มจอจนไม่รู้ว่ากำลังลบใบไหน
     ⚠️ ลบแล้ว **เอากลับไม่ได้** ต้องวางลิงก์ใหม่ + เสียเครดิตดึงยอดใหม่ จึงต้องถามก่อน */
  function delBtn(id) {
    if (!state.edit) return "";
    if (state.delId === id) {
      return '<span class="delc"><button type="button" class="btn delyes" data-infludel="' + esc(id) +
        '">ลบเลย</button><button type="button" class="btn delno" data-influ="delcancel">ยกเลิก</button></span>';
    }
    return '<button type="button" class="btn xbtn" data-influask="' + esc(id) + '" title="เอาออกจากรายการ">✕</button>';
  }

  /* ── แถบหัว: ตอบ "ข้อมูลสดแค่ไหน" ให้ได้ทันที (รีวิว 8 ก.ย. 2026 ข้อ 2) ──
   * ⚠️ ต้องเป็น **วัน-เวลาจริง** ไม่ใช่ "2 นาทีที่แล้ว" อย่างเดียว —
   *    ทีมเปิดดูคนละเวลา "2 นาทีที่แล้ว" ของแต่ละคนคนละจุดเวลากัน เอาไปคุยกันต่อไม่ได้
   * 🔴 ปุ่ม "อัปเดตยอด" ย้ายมาอยู่ตรงนี้ ออกจากแถบ filter (ข้อ 2 ของรีวิว)
   *    มันไม่ใช่ตัวกรอง และเป็นปุ่มเดียวในหน้าที่ **เสียเงินทุกครั้งที่กด**
   */
  function stamp(ms) {
    if (!ms) return "ยังไม่เคยดึง";
    var d = new Date(ms);
    return d.getDate() + " " + TH_MON[d.getMonth()] + " " + String(d.getFullYear() + 543).slice(2) +
      " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function headerBar() {
    var c = state.credits;
    return '<div class="ebar">' +
      '<div class="ebar-l"><span class="ebar-t">อัปเดตล่าสุด</span> <b>' + esc(stamp(state.at)) + "</b>" +
      (state.at ? ' <span class="sub">(' + esc(whenTxt(state.at)) + ")</span>" : "") + "</div>" +
      '<div class="ebar-r">' +
      /* 🚫 ยอดเครดิตห้ามย่อเป็น "4.8K" — ต้องเห็นเลขเต็ม
         ย่อแล้วแยกไม่ออกว่าเหลือ 4,820 หรือ 4,849 ซึ่งเป็นตัวเลขที่ใช้ตัดสินใจว่าจะกด 🔄 ไหม */
      '<span class="credbar">🎟️ เครดิต <b>' +
      (c && c.left != null ? esc(Number(c.left).toLocaleString("th-TH")) : "—") + "</b>" +
      (c && c.at ? ' <span class="sub">(ณ ' + esc(whenTxt(c.at)) + ")</span>" : "") +
      '<button type="button" class="btn xsbtn" data-influ="credits"' + (state.busy ? " disabled" : "") + ">" +
      (state.busy === "credits" ? '<span class="spin"></span>' : "เช็คยอด") + "</button></span>" +
      '<button type="button" class="btn" data-influ="refresh"' + (state.busy ? " disabled" : "") + ' ' +
      'title="ยิงไปดึงยอดใหม่ทุกโพสต์ — ใช้เครดิตของ ScrapeCreators (ข่าวไม่ถูกยิง)">' +
      (state.busy === "refresh" ? '<span class="spin"></span> กำลังอัปเดต…' : "🔄 อัปเดตยอด") + "</button>" +
      /* 🔴 สวิตช์โหมดแก้ไข — จอแคบซ่อนทั้งอันด้วย CSS (รีวิวข้อ 1: "บนมือถือไม่มีโหมดนี้เลย") */
      '<button type="button" class="btn eswitch editsw' + (state.edit ? " on" : "") +
      '" data-influ="edit" aria-pressed="' + (state.edit ? "true" : "false") +
      '" title="เปิดแล้วจะมีปุ่มลบและกล่องวางลิงก์">' +
      '<span class="esw-k"></span>โหมดแก้ไข</button>' +
      "</div></div>";
  }

  /* ── KPI 4 ช่อง (รีวิวข้อ 3) ────────────────────────────────────────
   * ⚠️ ER รวมต้อง **ตัดโพสต์ที่ไม่มียอดวิวออกทั้งใบ** ไม่ใช่แค่ข้ามตอนบวก views
   *    Facebook ที่ไม่ใช่วิดีโอมี Engagement แต่ไม่มี Views — เอา engagement ของมัน
   *    ไปหารด้วย views ของคนอื่น = ER พองขึ้นโดยไม่มีใครรู้ · ต้องเขียนกำกับด้วยว่าไม่รวมใคร
   * ⚠️ โพสต์เด่นใช้ **Views** เป็นเกณฑ์ ไม่ใช่ ER — ER ของโพสต์เล็กเด้งง่ายมาก
   *    (ไลก์ 20 จากวิว 100 = 20% ซึ่งไม่ได้แปลว่าดังกว่าคลิปล้านวิว)
   */
  function kpiCards() {
    var list = socialPosts();
    var tv = 0, te = 0, hasV = false, hasE = false;
    var erV = 0, erE = 0, skipped = [];
    list.forEach(function (p) {
      var v = (p.stats || {}).views, e = engOf(p);
      if (v != null) { tv += v; hasV = true; }
      if (e != null) { te += e; hasE = true; }
      if (v != null && v > 0) { erV += v; erE += e == null ? 0 : e; }
      else skipped.push(p);
    });

    /* ⚠️ บอกชื่อแพลตฟอร์มได้เฉพาะตอนที่ **ทั้งแพลตฟอร์มนั้นถูกตัดออกหมด**
       ตัดไปใบเดียวแล้วเขียนว่า "ไม่รวม TikTok" = โกหก (TikTok ใบอื่นยังนับอยู่)
       เจอตอนเขียนเทสต์ — คำอธิบายที่ผิดแย่กว่าไม่มีคำอธิบาย */
    var byPlat = {}, skipPlat = {};
    list.forEach(function (p) { byPlat[p.platform] = (byPlat[p.platform] || 0) + 1; });
    skipped.forEach(function (p) { skipPlat[p.platform] = (skipPlat[p.platform] || 0) + 1; });
    var whole = Object.keys(skipPlat).filter(function (k) { return skipPlat[k] === byPlat[k]; });
    var erSub = !skipped.length ? "ทุกโพสต์"
      : whole.length && skipped.length === whole.reduce(function (a, k) { return a + skipPlat[k]; }, 0)
        ? "ไม่รวม " + whole.map(function (k) { return P_LABEL[k] || k; }).join(" · ") + " (ไม่มียอดวิว)"
        : "ไม่รวม " + skipped.length + " โพสต์ที่ไม่มียอดวิว";

    var top = null;
    list.forEach(function (p) {
      var v = (p.stats || {}).views;
      if (v == null) return;
      if (!top || v > top.stats.views) top = p;
    });

    var h = '<div class="kgrid">' +
      kcard("Views รวม", hasV ? num(tv) : "—", list.length + " โพสต์") +
      kcard("Engagement รวม", hasE ? num(te) : "—", "Likes + Shares + Comments") +
      kcard("ER เฉลี่ย", erV ? pct(erE / erV) : "—", erSub);

    /* กดแล้วเลื่อนไปที่แถวนั้นในตาราง — ไม่งั้นเห็นชื่อแล้วต้องไปไล่หาเอง */
    h += top
      ? '<button type="button" class="kc kc-top" data-influtop="' + esc(top.id) + '">' +
        '<div class="kc-l">โพสต์เด่น <span class="kc-sub">(ยอดวิวสูงสุด)</span></div>' +
        '<div class="kc-top-t">' + esc(top.title || top.note || top.url) + "</div>" +
        '<div class="kc-sub">' + esc(P_LABEL[top.platform] || top.platform) +
        " · " + esc(num(top.stats.views)) + " views" +
        (erOf(top) != null ? " · ER " + esc(pct(erOf(top))) : "") + "</div></button>"
      : kcard("โพสต์เด่น", "—", "ยังไม่มีโพสต์ที่รู้ยอดวิว");
    return h + "</div>";
  }

  function kcard(label, value, sub) {
    return '<div class="kc"><div class="kc-l">' + esc(label) + '</div><div class="kc-v">' + esc(value) +
      '</div><div class="kc-sub">' + esc(sub) + "</div></div>";
  }

  function card(label, value) {
    return '<div class="sc"><div class="sc-l">' + esc(label) + '</div><div class="sc-v">' + esc(value) + "</div></div>";
  }
  function sel(key, label, opts, fmt) {
    return '<label class="influsel"><span>' + esc(label) + "</span><select data-influsel=\"" + key + '">' +
      opts.map(function (o) {
        return '<option value="' + esc(o) + '"' + (state[key] === o ? " selected" : "") + ">" + esc(fmt(o)) + "</option>";
      }).join("") + "</select></label>";
  }

  function draw() {
    var el = document.getElementById("view");
    if (!el) return;
    el.innerHTML = html();
  }

  /* ── รับคลิก/พิมพ์ ────────────────────────────────────────────────
     ⚠️ ผูกที่ document ครั้งเดียว ไม่ผูกใหม่ทุกครั้งที่วาด —
        draw() สร้าง innerHTML ใหม่ทั้งก้อน ตัวที่ผูกกับ element เดิมจะหลุดหมด */
  function onClick(e) {
    var t = e.target.closest("[data-influ],[data-influsort],[data-infludel],[data-influask],[data-influchip],[data-influtop],[data-influex]");
    /* กดที่อื่นบนหน้า = เลิกถามยืนยันการลบ (เหมือนเมนูที่ปิดตัวเองเมื่อกดข้างนอก) */
    if (!t) { if (state.delId) { state.delId = ""; draw(); } return; }

    if (t.dataset.influchip) { state.fPlatform = t.dataset.influchip; draw(); return; }
    // กางทีละแถว — กางค้างหลายแถวบนมือถือแล้วเลื่อนหาของยากกว่าเดิม
    if (t.dataset.influex) {
      state.openRow = state.openRow === t.dataset.influex ? "" : t.dataset.influex;
      draw(); return;
    }
    /* กด "โพสต์เด่น" แล้วเลื่อนไปที่แถวนั้นเลย ไม่ต้องไปไล่หาเองในตาราง (รีวิวข้อ 3) */
    if (t.dataset.influtop) {
      if (state.fPlatform !== "all" || state.q) { state.fPlatform = "all"; state.q = ""; draw(); }
      var row = document.querySelector('[data-rowid="' + t.dataset.influtop + '"]');
      if (row) {
        row.scrollIntoView({ block: "center", behavior: "smooth" });
        row.classList.add("flash");
        setTimeout(function () { row.classList.remove("flash"); }, 1600);
      }
      return;
    }
    if (t.dataset.influask) { state.delId = t.dataset.influask; draw(); return; }
    if (t.dataset.infludel) {
      state.delId = "";
      state.busy = "load"; draw();
      call({ remove: [t.dataset.infludel] }).then(take);
      return;
    }
    if (t.dataset.influsort) {
      var k = t.dataset.influsort;
      if (state.sort === k) state.dir = state.dir === 1 ? -1 : 1;
      else { state.sort = k; state.dir = -1; }
      draw();
      return;
    }
    var a = t.dataset.influ;
    if (a === "add") {
      var box = document.getElementById("influ-in");
      var urls = parseInput(box ? box.value : "");
      if (!urls.length) { state.note = "ไม่เจอลิงก์ในข้อความที่วางมา"; draw(); return; }
      state.draft = ""; state.note = ""; state.busy = "add"; draw();
      call({ add: urls }).then(take);
    } else if (a === "refresh") {
      state.note = ""; state.busy = "refresh"; draw();
      call({ refresh: true }).then(take);
    } else if (a === "credits") {
      state.note = ""; state.busy = "credits"; draw();
      call({ credits: true }).then(function (res) {
        // ⚠️ เช็คไม่สำเร็จต้องบอกเหตุผล ไม่ใช่ปล่อยให้เลขค้างเป็น "—" เฉยๆ
        if (res && res.ok && res.message) state.note = res.message;
        take(res);
      });
    } else if (a === "delcancel") {
      state.delId = ""; draw();
    } else if (a === "edit") {
      state.edit = !state.edit;
      state.delId = "";        // ปิดโหมดแก้ไขแล้วการยืนยันลบที่ค้างอยู่ต้องหายไปด้วย
      draw();
    } else if (a === "mchart") {
      state.moChart = !state.moChart; draw();
    }
  }

  function onChange(e) {
    var t = e.target;
    if (t.dataset && t.dataset.influsel) { state[t.dataset.influsel] = t.value; draw(); }
  }
  function onInput(e) {
    var t = e.target;
    /* ⚠️ มีช่องค้นหา 2 ช่อง (โพสต์ / ข่าว) — ต้องคืนโฟกัสด้วย **id** ไม่ใช่ class
       ใช้ class จะไปคว้าช่องแรกเสมอ = พิมพ์ในช่องข่าวแล้วเคอร์เซอร์กระโดดขึ้นไปช่องโพสต์ */
    if (t.dataset && t.dataset.influ === "q") { state.q = t.value; draw(); restoreFocus("influ-q", t.selectionStart); }
    if (t.dataset && t.dataset.influ === "nq") { state.nq = t.value; draw(); restoreFocus("influ-nq", t.selectionStart); }
    if (t.id === "influ-in") state.draft = t.value;   // จำไว้ใน state ไม่งั้นวาดใหม่แล้วหาย
  }
  function restoreFocus(id, pos) {
    var el = document.getElementById(id);
    if (!el) return;
    el.focus();
    try { el.setSelectionRange(pos, pos); } catch (x) {}
  }

  /* 🔴 ลิงก์รูปของ TikTok/Facebook/Instagram เป็น **ลิงก์เซ็นชื่อที่หมดอายุ**
     เก็บไว้ใน KV แล้วอีกไม่กี่ชั่วโมงก็โหลดไม่ขึ้น (403/404)
     ⚠️ ปล่อยไว้จะได้ไอคอนรูปแตกเรียงเป็นแถว ดูเหมือนหน้าพัง — สลับเป็นกล่องเปล่าแทน
     ⚠️ event `error` ไม่ bubble ต้องดักด้วย capture ถึงจะรับที่ document ได้ */
  function onImgErr(e) {
    var t = e.target;
    if (!t || t.tagName !== "IMG" || String(t.className).indexOf("influ-th") < 0) return;
    /* ⚠️ เปลี่ยนเป็น span ไม่ใช่แค่เปลี่ยน class ของ img —
       img ที่ไม่มี src จะขึ้นไอคอนรูปแตกของเบราว์เซอร์ทับกล่องเปล่า */
    var ph = document.createElement("span");
    ph.className = "influ-th ph fail";
    ph.title = "ต้นทางส่งลิงก์รูปมา แต่โหลดไม่ขึ้น — ลิงก์รูปของ TikTok/Facebook/Instagram " +
      "เป็นลิงก์เซ็นชื่อที่หมดอายุ · กด 🔄 อัปเดตยอดเพื่อขอลิงก์ใหม่";
    t.replaceWith(ph);
  }

  var wired = false;
  function render() {
    if (!wired) {
      document.addEventListener("click", onClick);
      document.addEventListener("change", onChange);
      document.addEventListener("input", onInput);
      document.addEventListener("error", onImgErr, true);
      wired = true;
    }
    // ⚠️ โหลดครั้งเดียวตอนเปิดแท็บครั้งแรก · สลับแท็บไปกลับไม่ยิงซ้ำ
    if (!state.loaded && !state.busy) load();
    return html();
  }

  window.SOCIAL_INFLU = { render: render, _state: state };
})();
