/* แท็บ "อินฟลูฯ" — ติดตามโพสต์ของอินฟลูเอนเซอร์ที่จ้าง
 *
 * 🎯 ต่างจากแท็บอื่นของหน้านี้: แท็บอื่นดูช่องของเราเอง อันนี้ดู **โพสต์ของคนอื่น**
 *    ที่เราจ้างให้ลง · ผู้ใช้วางลิงก์เข้ามาเอง แล้วระบบไปดึงยอดมาให้
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
  };

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
    state.posts.forEach(function (p) { if (p.account) seen[p.account] = 1; });
    return Object.keys(seen).sort();
  }

  function shown() {
    var q = state.q.trim().toLowerCase();
    return state.posts.filter(function (p) {
      if (state.fPlatform !== "all" && p.platform !== state.fPlatform) return false;
      if (state.fAccount !== "all" && p.account !== state.fAccount) return false;
      if (q && (p.title || "").toLowerCase().indexOf(q) < 0 && (p.account || "").toLowerCase().indexOf(q) < 0) return false;
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

  function sortVal(p) {
    var s = p.stats || {};
    if (state.sort === "eng") return engOf(p);
    if (state.sort === "er") return erOf(p);
    if (state.sort === "added") return p.addedAt || 0;
    return s[state.sort] == null ? null : s[state.sort];
  }

  /* ── วาด ─────────────────────────────────────────────────────── */
  var COLS = [
    { key: "views", label: "Views" },
    { key: "likes", label: "Likes" },
    { key: "comments", label: "Comments" },
    { key: "shares", label: "Shares", na: "YouTube ไม่เปิดเผยจำนวนแชร์ผ่าน API" },
    { key: "eng", label: "Engagement", strong: true },
    { key: "er", label: "ER", fmt: "pct" },
  ];

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

    // ── กล่องวางลิงก์ ──
    h += '<h2 class="sec">วางลิงก์โพสต์ ' +
      '<button type="button" class="tipi" data-tip="วางได้ทีละหลายลิงก์ บรรทัดละ 1 อัน · รองรับ YouTube · TikTok · Facebook · Instagram · ลิงก์ที่ซ้ำกับที่มีอยู่แล้วจะถูกข้าม" title="วางได้ทีละหลายลิงก์ บรรทัดละ 1 อัน">ⓘ</button></h2>' +
      '<div class="panel"><div class="addbox">' +
      '<textarea id="influ-in" class="addta" rows="3" placeholder="https://www.tiktok.com/@ชื่อ/video/…&#10;https://www.instagram.com/p/…" ' +
      (state.busy ? "disabled" : "") + ">" + esc(state.draft) + "</textarea>" +
      '<button type="button" class="btn primary" data-influ="add"' + (state.busy ? " disabled" : "") + ">" +
      (state.busy === "add" ? '<span class="spin"></span> กำลังเพิ่ม…' : "+ เพิ่ม") + "</button>" +
      "</div>";
    if (state.note) h += '<p class="addnote">' + esc(state.note).replace(/\n/g, "<br>") + "</p>";
    h += "</div>";

    if (!state.loaded && state.busy === "load") {
      return h + '<div class="loading"><span class="spin"></span> กำลังโหลดรายการ…</div>';
    }

    var list = shown();

    // ── สรุปรวม ──
    var tv = 0, te = 0, hasV = false, hasE = false;
    list.forEach(function (p) {
      if ((p.stats || {}).views != null) { tv += p.stats.views; hasV = true; }
      var e = engOf(p); if (e != null) { te += e; hasE = true; }
    });
    h += '<div class="scgrid" style="--n:4">' +
      card("โพสต์", String(list.length)) +
      card("Views รวม", hasV ? num(tv) : "—") +
      card("Engagement รวม", hasE ? num(te) : "—") +
      card("ER เฉลี่ย", hasV && hasE && tv ? pct(te / tv) : "—") +
      "</div>";

    // ── แถบตัวกรอง ──
    h += '<h2 class="sec">โพสต์ที่ติดตาม ' +
      '<span class="sub">อัปเดตล่าสุด ' + esc(whenTxt(state.at)) + "</span></h2>";
    h += '<div class="panel"><div class="influbar">' +
      sel("fPlatform", "แพลตฟอร์ม", ["all"].concat(Object.keys(P_LABEL)), function (k) { return k === "all" ? "ทั้งหมด" : P_LABEL[k]; }) +
      sel("fAccount", "ช่อง", ["all"].concat(accounts()), function (k) { return k === "all" ? "ทั้งหมด" : k; }) +
      '<input type="search" class="pp-dt influq" data-influ="q" placeholder="ค้นหาหัวข้อ/ช่อง" value="' + esc(state.q) + '">' +
      '<button type="button" class="btn" data-influ="refresh"' + (state.busy ? " disabled" : "") + ' ' +
      'title="ยิงไปดึงยอดใหม่ทุกโพสต์ — ใช้เครดิตของ ScrapeCreators">' +
      (state.busy === "refresh" ? '<span class="spin"></span> กำลังอัปเดต…' : "🔄 อัปเดตยอด") + "</button>" +
      "</div>";

    if (!state.posts.length) {
      h += '<div class="empty"><div class="empty-i">🔗</div><div><b>ยังไม่มีโพสต์ในรายการ</b>' +
        "<div>วางลิงก์ในกล่องด้านบนแล้วกด “เพิ่ม”</div></div></div></div>";
      return h;
    }
    if (!list.length) {
      h += '<div class="empty"><div class="empty-i">🔍</div><div><b>ไม่มีโพสต์ที่ตรงกับตัวกรอง</b>' +
        "<div>ลองล้างตัวกรองหรือคำค้น</div></div></div></div>";
      return h;
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
        '<div class="influ-m"><a href="' + esc(p.url) + '" target="_blank" rel="noopener">' +
        esc(p.title || p.url) + ' <span class="ext">↗</span></a>' +
        '<div class="influ-s"><span class="pdot" style="background:' + P_COLOR[p.platform] + '"></span>' +
        esc(P_LABEL[p.platform] || p.platform) + (p.account ? " · " + esc(p.account) : "") + "</div>" +
        /* ⚠️ ใบที่ดึงยอดไม่สำเร็จต้องบอกเหตุผลตรงแถวนั้น ไม่ใช่ขึ้น "—" เฉยๆ
           ไม่งั้นแยกไม่ออกว่า "ต้นทางไม่ให้ตัวเลข" กับ "ยอดเป็น 0 จริงๆ" */
        (p.err ? '<div class="influ-e">⚠️ ' + esc(p.err) + "</div>" : "") +
        "</div></div></th>";

      COLS.forEach(function (c) {
        var v = c.key === "eng" ? engOf(p) : c.key === "er" ? erOf(p) : s[c.key];
        var txt = v == null ? "—" : c.fmt === "pct" ? pct(v) : num(v);
        h += '<td class="num' + (c.strong ? " strong" : "") + (v == null ? " na" : "") + '"' +
          (v == null && c.na ? ' title="' + esc(c.na) + '"' : "") + ">" + esc(txt) + "</td>";
      });

      h += '<td class="num"><button type="button" class="btn xbtn" data-infludel="' + esc(p.id) + '" title="เอาออกจากรายการ">✕</button></td></tr>';
    });

    h += "</tbody></table></div></div>";
    return h;
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
      var urls = (box ? box.value : "").split(/[\s,]+/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (!urls.length) { state.note = "ยังไม่ได้วางลิงก์"; draw(); return; }
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
    if (t.dataset && t.dataset.influ === "q") { state.q = t.value; draw(); restoreFocus("influq", t.selectionStart); }
    if (t.id === "influ-in") state.draft = t.value;   // จำไว้ใน state ไม่งั้นวาดใหม่แล้วหาย
  }
  function restoreFocus(cls, pos) {
    var el = document.querySelector("." + cls);
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
