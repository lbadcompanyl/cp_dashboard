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
  };

  /* ── ของ 2 ชนิดในรายการเดียว ────────────────────────────────────
     ⚠️ record รุ่นเก่า (ก่อน 8 ก.ย. 2026) ไม่มีฟิลด์ kind — ตัวไหนมี platform ถือเป็นโพสต์ */
  function isNews(p) { return p.kind === "news" || (!p.kind && !p.platform); }
  function socialPosts() { return state.posts.filter(function (p) { return !isNews(p); }); }
  function newsPosts() { return state.posts.filter(isNews); }

  /* ชื่อสำนักข่าว — ยืมตารางกลางของ /archives/ มาใช้ (`archives/outlets.config.js`)
     🚫 ห้ามก๊อปรายชื่อมาไว้ที่นี่ — แก้ที่เดียวต้องมีผลทุกหน้า (กฎเดียวกับ noise.js)
     ⚠️ ไม่มีในตาราง = แสดงโดเมนตามเดิม ไม่ซ่อน ไม่ยุบมั่ว */
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
      return h + '<div class="loading"><span class="spin"></span> กำลังโหลดรายการ…</div>' + addBox();
    }

    /* 🔴 กล่องวางลิงก์อยู่ **ล่างสุด** (เจ้าของสั่ง 8 ก.ย. 2026)
       ของที่ดูบ่อยควรอยู่บน · กล่องวางลิงก์ใช้ตอนเพิ่มของใหม่ซึ่งนานๆ ที */
    return h + socialSection() + newsSection() + addBox();
  }

  /* ── กล่องวางลิงก์ (ใช้ร่วมทั้ง 2 section — ระบบแยกให้เองว่าอันไหนเป็นข่าว) ── */
  function addBox() {
    var h = '<h2 class="sec">วางลิงก์ ' +
      '<button type="button" class="tipi" data-tip="วางได้ทีละหลายลิงก์ บรรทัดละ 1 อัน · ลิงก์ YouTube/TikTok/Facebook/Instagram เข้า section โพสต์ · ลิงก์สำนักข่าวเข้า section ข่าวโดยอัตโนมัติ · ลิงก์ที่ซ้ำกับที่มีอยู่แล้วจะถูกข้าม" title="วางได้ทีละหลายลิงก์ บรรทัดละ 1 อัน">ⓘ</button></h2>' +
      '<div class="panel"><div class="addbox">' +
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

  function monthChart(items, opt) {
    opt = opt || {};
    var keys = last3Months();
    var by = {}, approx = 0, outside = 0;
    keys.forEach(function (k) { by[k] = { n: 0, eng: null, hasEng: false }; });

    items.forEach(function (p) {
      var m = monthOf(p);
      if (!m) { outside++; return; }
      if (!by[m.m]) { outside++; return; }          // เก่ากว่า 3 เดือน (หรืออนาคต)
      if (!m.exact) approx++;
      by[m.m].n++;
      if (opt.eng) {
        var e = engOf(p);
        if (e != null) { by[m.m].eng = (by[m.m].eng || 0) + e; by[m.m].hasEng = true; }
      }
    });

    var max = 0;
    keys.forEach(function (k) { max = Math.max(max, by[k].n); });

    var h = '<div class="panel"><div class="mchart' + (opt.eng ? "" : " noeng") + '">' +
      '<div class="mrow mhead"><div class="mlab">เดือน</div><div class="mtrack"></div>' +
      '<div class="mcnt">' + esc(opt.unit || "ชิ้น") + "</div>" +
      (opt.eng ? '<div class="meng">Engagement</div>' : "") + "</div>";

    keys.forEach(function (k) {
      var b = by[k];
      h += '<div class="mrow"><div class="mlab">' + esc(monthLabel(k)) + "</div>" +
        '<div class="mtrack" title="' + esc(monthLabel(k) + " · " + b.n + " " + (opt.unit || "ชิ้น")) + '">' +
        (b.n ? '<span class="mbar" style="width:' + ((b.n / max) * 100).toFixed(1) +
          "%;background:" + esc(opt.color) + '"></span>' : "") +
        "</div>" +
        '<div class="mcnt"><b>' + b.n + "</b></div>" +
        /* 🚫 เดือนที่ยังไม่รู้ยอดต้องเป็น "—" ไม่ใช่ 0 — 0 แปลว่าไม่มีใครมีปฏิสัมพันธ์ */
        (opt.eng ? '<div class="meng">' + (b.hasEng ? esc(num(b.eng)) : "—") + "</div>" : "") +
        "</div>";
    });

    h += "</div>";
    var notes = [];
    if (approx) notes.push(approx + " ชิ้นไม่รู้วันที่เผยแพร่ จึงจัดตาม<b>วันที่เพิ่มเข้ารายการ</b>");
    if (outside) notes.push("อีก " + outside + " ชิ้นเก่ากว่า 3 เดือน <b>ไม่ได้นับในกราฟนี้</b> (ยังอยู่ในตารางข้างล่าง)");
    if (notes.length) h += '<p class="addnote sub">' + notes.join(" · ") + "</p>";
    return h + "</div>";
  }

  /* ── ① โพสต์อินฟลูเอนเซอร์ ──────────────────────────────────────── */
  function socialSection() {
    var list = shown();
    var h = "";

    // ── สรุปรวม ──
    var tv = 0, te = 0, hasV = false, hasE = false;
    list.forEach(function (p) {
      if ((p.stats || {}).views != null) { tv += p.stats.views; hasV = true; }
      var e = engOf(p); if (e != null) { te += e; hasE = true; }
    });

    h += '<h2 class="sec">① โพสต์อินฟลูเอนเซอร์ ' +
      '<span class="sub">อัปเดตยอดล่าสุด ' + esc(whenTxt(state.at)) + "</span></h2>";
    h += '<div class="scgrid" style="--n:4">' +
      card("โพสต์", String(list.length)) +
      card("Views รวม", hasV ? num(tv) : "—") +
      card("Engagement รวม", hasE ? num(te) : "—") +
      card("ER เฉลี่ย", hasV && hasE && tv ? pct(te / tv) : "—") +
      "</div>";

    // 🔴 กราฟของ section นี้เอง — นับ **โพสต์** อย่างเดียว (เจ้าของสั่ง 8 ก.ย. 2026)
    if (socialPosts().length) h += monthChart(socialPosts(), { eng: true, unit: "โพสต์", color: "#2563eb" });

    // ── แถบตัวกรอง ──
    h += '<div class="panel"><div class="influbar">' +
      sel("fPlatform", "แพลตฟอร์ม", ["all"].concat(Object.keys(P_LABEL)), function (k) { return k === "all" ? "ทั้งหมด" : P_LABEL[k]; }) +
      sel("fAccount", "ช่อง", ["all"].concat(accounts()), function (k) { return k === "all" ? "ทั้งหมด" : k; }) +
      '<input type="search" id="influ-q" class="pp-dt influq" data-influ="q" placeholder="ค้นหาหัวข้อ/ช่อง" value="' + esc(state.q) + '">' +
      '<button type="button" class="btn" data-influ="refresh"' + (state.busy ? " disabled" : "") + ' ' +
      'title="ยิงไปดึงยอดใหม่ทุกโพสต์ — ใช้เครดิตของ ScrapeCreators (ข่าวไม่ถูกยิง)">' +
      (state.busy === "refresh" ? '<span class="spin"></span> กำลังอัปเดต…' : "🔄 อัปเดตยอด") + "</button>" +
      "</div>";

    if (!socialPosts().length) {
      return h + '<div class="empty"><div class="empty-i">🔗</div><div><b>ยังไม่มีโพสต์ในรายการ</b>' +
        "<div>วางลิงก์ YouTube / TikTok / Facebook / Instagram ในกล่องด้านบน</div></div></div></div>";
    }
    if (!list.length) {
      return h + '<div class="empty"><div class="empty-i">🔍</div><div><b>ไม่มีโพสต์ที่ตรงกับตัวกรอง</b>' +
        "<div>ลองล้างตัวกรองหรือคำค้น</div></div></div></div>";
    }

    // ── ตาราง ──
    h += '<div class="tblwrap"><table class="tbl perf"><thead><tr><th>โพสต์</th>' +
      COLS.map(function (c) {
        var on = state.sort === c.key;
        return '<th class="num srt' + (on ? " on" : "") + '"><button type="button" class="srtb" data-influsort="' +
          c.key + '">' + esc(c.label) + '<span class="srta">' + (on ? (state.dir < 0 ? "▼" : "▲") : "↕") + "</span></button></th>";
      }).join("") + "<th></th></tr></thead><tbody>";

    list.forEach(function (p) {
      var s = p.stats || {};
      h += '<tr><th scope="row"><div class="rowhead influrow">' +
        (p.thumb ? '<img class="influ-th" src="' + esc(p.thumb) + '" alt="" loading="lazy">' : '<span class="influ-th ph"></span>') +
        '<div class="influ-m"><a href="' + esc(p.url) + '" target="_blank" rel="noopener" title="' +
        esc(p.title || p.note || p.url) + '">' +
        /* ⚠️ ลำดับสำคัญ: ชื่อจริงจากต้นทาง > แคปชั่นที่วางมา > URL ดิบ
           ลิงก์ย่อที่ดึงชื่อไม่ได้ ถ้าไม่มีแคปชั่นรอง ตารางจะมีแต่ URL ยาวๆ อ่านไม่รู้เรื่อง */
        esc(p.title || p.note || p.url) + ' <span class="ext">↗</span></a>' +
        '<div class="influ-s"><span class="pdot" style="background:' + P_COLOR[p.platform] + '"></span>' +
        esc(P_LABEL[p.platform] || p.platform) + (p.account ? " · " + esc(p.account) : "") + "</div>" +
        /* ⚠️ ใบที่ดึงยอดไม่สำเร็จต้องบอกเหตุผลตรงแถวนั้น ไม่ใช่ขึ้น "—" เฉยๆ
           ไม่งั้นแยกไม่ออกว่า "ต้นทางไม่ให้ตัวเลข" กับ "ยอดเป็น 0 จริงๆ" */
        (p.err ? '<div class="influ-e">⚠️ ' + esc(p.err) + "</div>" : "") +
        /* 🔴 ได้ยอดบางตัวไม่ได้บางตัว = ต้องบอกว่าขาดตัวไหน + ต้นทางส่งชื่อฟิลด์อะไรมาแทน
           (เจ้าของถาม 8 ก.ย. 2026: "ทำไม tiktok ไม่มี view ?" แล้วหน้าเว็บตอบไม่ได้เลย)
           ⚠️ ไม่ใช่ error — ข้อมูลที่ได้ยังใช้ได้ จึงใช้สีจาง ไม่ใช่สีแดง */
        (!p.err && p.warn && p.warn.miss && p.warn.miss.length
          ? '<div class="influ-w">ต้นทางไม่ได้ส่ง <b>' +
            esc(p.warn.miss.map(function (k) { return M_LABEL[k] || k; }).join(" · ")) + "</b> มา" +
            (p.warn.keys && p.warn.keys.length
              ? " · ฟิลด์ตัวเลขที่ได้: " + p.warn.keys.map(function (k) { return "<code>" + esc(k) + "</code>"; }).join(" ")
              : "") + "</div>"
          : "") +
        "</div></div></th>";

      COLS.forEach(function (c) {
        var v = valOf(p, c.key);
        var w = c.key === "date" ? whenOf(p) : null;
        var txt = v == null ? "—"
          : c.fmt === "date" ? (w.exact ? "" : "~") + dayLabel(v)
          : c.fmt === "pct" ? pct(v) : num(v);
        // ~ = ไม่รู้วันที่โพสต์จริง ใช้วันที่เพิ่มลิงก์เข้ารายการแทน — ต้องบอก ไม่ใช่แสดงเหมือนของจริง
        var why = v == null ? c.na : (w && !w.exact ? "ต้นทางไม่บอกวันที่โพสต์ — นี่คือวันที่เพิ่มลิงก์เข้ารายการ" : "");
        h += '<td class="num' + (c.strong ? " strong" : "") + (v == null || (w && !w.exact) ? " na" : "") + '"' +
          (why ? ' title="' + esc(why) + '"' : "") + ">" + esc(txt) + "</td>";
      });

      h += '<td class="num"><button type="button" class="btn xbtn" data-infludel="' + esc(p.id) + '" title="เอาออกจากรายการ">✕</button></td></tr>';
    });

    /* 🔴 แถวรวมท้ายตาราง (เจ้าของสั่ง 8 ก.ย. 2026: "และมีค่ารวม")
       ⚠️ รวมเฉพาะค่าที่ต้นทางส่งมาจริง — ใบที่เป็น null ต้องข้าม ไม่ใช่บวกเป็น 0
          และถ้าทั้งคอลัมน์ไม่มีค่าเลยต้องขึ้น "—" ไม่ใช่ 0
       ⚠️ ER ของแถวรวมต้องคิดจาก Engagement รวม ÷ Views รวม
          **ห้ามเฉลี่ย ER ของแต่ละแถว** — คลิปยอดน้อยจะมีน้ำหนักเท่าคลิปล้านวิว */
    h += "</tbody><tfoot><tr><th scope=\"row\">รวม " + list.length + " โพสต์</th>";
    var sum = {};
    COLS.forEach(function (c) { sum[c.key] = null; });
    list.forEach(function (p) {
      COLS.forEach(function (c) {
        if (c.key === "date" || c.key === "er") return;
        var v = valOf(p, c.key);
        if (v != null) sum[c.key] = (sum[c.key] || 0) + v;
      });
    });
    var totalEr = sum.views && sum.eng != null ? sum.eng / sum.views : null;
    COLS.forEach(function (c) {
      var v = c.key === "er" ? totalEr : c.key === "date" ? null : sum[c.key];
      var txt = c.key === "date" ? "" : v == null ? "—" : c.fmt === "pct" ? pct(v) : num(v);
      h += '<td class="num' + (c.strong ? " strong" : "") + (v == null && c.key !== "date" ? " na" : "") + '">' + esc(txt) + "</td>";
    });
    h += "<td></td></tr></tfoot>";

    return h + "</table></div></div>";
  }

  /* ── ② ข่าว — นับชิ้น + แยกสำนักข่าวเท่านั้น ────────────────────────
   * 🔴 เจ้าของสั่ง (8 ก.ย. 2026): "อันนี้แค่นับชิ้น และ แยกสำนักข่าวพอ"
   * 🚫 ห้ามใส่คอลัมน์ Views/Engagement ใน section นี้ — เราไม่ได้ดึงยอดข่าวเลย
   *    ใส่คอลัมน์ว่างไว้ = อ่านแล้วเข้าใจว่า "ข่าวไม่มีคนอ่าน" ซึ่งไม่จริง
   */
  function newsSection() {
    var all = newsPosts();
    var list = newsShown();

    var h = '<h2 class="sec">② ข่าว ' +
      '<span class="sub">นับชิ้น + แยกสำนักข่าว (ไม่ได้ดึงยอด)</span></h2>';

    var byOut = {};
    all.forEach(function (p) { var o = outletOf(p); byOut[o] = (byOut[o] || 0) + 1; });
    var outs = Object.keys(byOut).sort(function (a, b) { return byOut[b] - byOut[a]; });

    h += '<div class="scgrid" style="--n:2">' +
      card("ข่าวทั้งหมด", String(all.length)) +
      card("สำนักข่าว", String(outs.length)) +
      "</div>";

    if (!all.length) {
      return h + '<div class="panel"><div class="empty"><div class="empty-i">📰</div><div><b>ยังไม่มีข่าวในรายการ</b>' +
        "<div>วางลิงก์ข่าวในกล่องด้านบน — ระบบแยกให้เองว่าอันไหนเป็นข่าว</div></div></div></div>";
    }

    // 🔴 กราฟของ section นี้เอง — ข่าวไม่มี Engagement จึงไม่มีคอลัมน์นั้น
    h += monthChart(all, { eng: false, unit: "ชิ้น", color: "#c2410c" });

    // ── แยกตามสำนักข่าว ──
    var top = outs.slice(0, 12);
    h += '<div class="panel"><h3 class="sub" style="margin:0 0 8px">จำนวนชิ้นตามสำนักข่าว</h3>' +
      (window.SOCIAL_CHARTS ? window.SOCIAL_CHARTS.hbars(top.map(function (o) {
        return { label: o, value: byOut[o], color: "#c2410c", text: byOut[o] + " ชิ้น" };
      }), { aria: "จำนวนข่าวตามสำนักข่าว" }) : "") +
      (outs.length > top.length ? '<p class="addnote sub">แสดง ' + top.length + " จาก " + outs.length + " สำนัก</p>" : "") +
      "</div>";

    // ── รายการข่าว ──
    h += '<div class="panel"><div class="influbar">' +
      sel("fOutlet", "สำนักข่าว", ["all"].concat(outlets()), function (k) { return k === "all" ? "ทั้งหมด" : k; }) +
      '<input type="search" id="influ-nq" class="pp-dt influq" data-influ="nq" placeholder="ค้นหาหัวข้อ/สำนักข่าว" value="' + esc(state.nq) + '">' +
      "</div>";

    if (!list.length) {
      return h + '<div class="empty"><div class="empty-i">🔍</div><div><b>ไม่มีข่าวที่ตรงกับตัวกรอง</b>' +
        "<div>ลองล้างตัวกรองหรือคำค้น</div></div></div></div>";
    }

    h += '<div class="tblwrap"><table class="tbl perf"><thead><tr><th>ข่าว</th>' +
      '<th>สำนักข่าว</th><th class="num">เดือน</th><th></th></tr></thead><tbody>';
    list.forEach(function (p) {
      var m = monthOf(p);
      h += '<tr><th scope="row"><div class="influ-m"><a href="' + esc(p.url) + '" target="_blank" rel="noopener" title="' +
        esc(p.title || p.note || p.url) + '">' +
        esc(p.title || p.note || p.url) + ' <span class="ext">↗</span></a></div></th>' +
        "<td>" + esc(outletOf(p)) + "</td>" +
        /* ~ = ไม่รู้วันที่เผยแพร่ ใช้วันที่เพิ่มเข้ารายการแทน — ต้องบอก ไม่ใช่แสดงเหมือนของจริง */
        '<td class="num' + (m && !m.exact ? " na" : "") + '"' +
        (m && !m.exact ? ' title="ต้นทางไม่บอกวันที่เผยแพร่ — นี่คือเดือนที่เพิ่มลิงก์เข้ารายการ"' : "") + ">" +
        (m ? (m.exact ? "" : "~") + esc(monthLabel(m.m)) : "—") + "</td>" +
        '<td class="num"><button type="button" class="btn xbtn" data-infludel="' + esc(p.id) + '" title="เอาออกจากรายการ">✕</button></td></tr>';
    });

    return h + "</tbody></table></div></div>";
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
    var t = e.target.closest("[data-influ],[data-influsort],[data-infludel]");
    if (!t) return;

    if (t.dataset.infludel) {
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

  var wired = false;
  function render() {
    if (!wired) {
      document.addEventListener("click", onClick);
      document.addEventListener("change", onChange);
      document.addEventListener("input", onInput);
      wired = true;
    }
    // ⚠️ โหลดครั้งเดียวตอนเปิดแท็บครั้งแรก · สลับแท็บไปกลับไม่ยิงซ้ำ
    if (!state.loaded && !state.busy) load();
    return html();
  }

  window.SOCIAL_INFLU = { render: render, _state: state };
})();
