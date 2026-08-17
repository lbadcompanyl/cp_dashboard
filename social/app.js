/* Social Dashboard — 4 แท็บ (ภาพรวม / YouTube / TikTok / Facebook)
 *
 * 🔴 รอบนี้ทำเฉพาะหน้าตา ยังใช้ข้อมูลจำลองจาก mock.js
 *    ตัวคำนวณทุกตัวในไฟล์นี้อ่านจากโครง { daily, followers, posts } เท่านั้น
 *    ตอนต่อ API จริง เปลี่ยนแค่ที่มาของ `DATA` — ไม่ต้องแตะตัวคำนวณหรือตัววาดเลย
 *
 * ⚠️ ช่วงเวลา + โหมดเทียบ เก็บไว้ที่ `state` ตัวเดียว ทุกแท็บอ่านจากตัวนี้
 *    ห้ามให้แท็บไหนเก็บช่วงเวลาของตัวเอง — สลับแท็บแล้วเลขต้องเป็นชุดเดียวกันเสมอ
 *
 * ⚠️ สถานะที่ผู้ใช้เลือกไว้ห้ามอยู่ใน DOM อย่างเดียว — render() สร้าง innerHTML ใหม่ทั้งก้อน
 *    อะไรที่กดแล้วเปลี่ยนสภาพ (แท็บ / การเรียงตาราง) ต้องจำใน state ไม่งั้นหายทุกรอบ
 */
(function () {
  "use strict";

  var C = window.SOCIAL_CONFIG;
  var CH = window.SOCIAL_CHARTS;
  var DATA = window.SOCIAL_MOCK;          // ← จุดเดียวที่ต้องเปลี่ยนตอนต่อของจริง

  var PRESETS = [
    { days: 7, label: "7 วัน" },
    { days: 30, label: "30 วัน" },
    { days: 90, label: "90 วัน" },
  ];

  var state = {
    tab: "summary",
    preset: 30,          // 7 | 30 | 90 | "custom"
    start: null,
    end: null,
    compare: "prev",     // prev | yoy | none
    sort: { key: "date", dir: -1 },   // การเรียงของตารางในแท็บช่อง
  };

  /* ── วันที่ ──────────────────────────────────────────────────────── */

  function midnight(d) { var x = new Date(d.getTime()); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function key(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function parseKey(s) { var p = String(s).split("-"); return midnight(new Date(+p[0], +p[1] - 1, +p[2])); }
  function thaiShort(k) {
    var M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    var d = parseKey(k);
    return d.getDate() + " " + M[d.getMonth()];
  }

  /** ช่วงที่เลือกอยู่ — คืนเป็น key ของวัน */
  function range() {
    if (state.preset === "custom" && state.start && state.end) {
      var a = parseKey(state.start), b = parseKey(state.end);
      if (a > b) { var t = a; a = b; b = t; }
      return { from: key(a), to: key(b), days: Math.round((b - a) / 864e5) + 1 };
    }
    var end = midnight(new Date());
    var start = addDays(end, -(state.preset - 1));
    return { from: key(start), to: key(end), days: state.preset };
  }

  /** ช่วงที่เอาไว้เทียบ — null = ผู้ใช้เลือกไม่เทียบ */
  function compareRange() {
    if (state.compare === "none") return null;
    var r = range(), a = parseKey(r.from), b = parseKey(r.to);
    if (state.compare === "yoy") {
      var a2 = new Date(a.getTime()); a2.setFullYear(a2.getFullYear() - 1);
      var b2 = new Date(b.getTime()); b2.setFullYear(b2.getFullYear() - 1);
      return { from: key(a2), to: key(b2), days: r.days };
    }
    // ช่วงก่อนหน้า — ยาวเท่ากัน ต่อกันพอดี ไม่ทับกันสักวัน
    var pb = addDays(a, -1), pa = addDays(pb, -(r.days - 1));
    return { from: key(pa), to: key(pb), days: r.days };
  }

  /* ── รวมตัวเลข ───────────────────────────────────────────────────── */

  function dailyIn(pk, r) {
    var rows = DATA.platforms[pk].daily, out = [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].date >= r.from && rows[i].date <= r.to) out.push(rows[i]);
    }
    return out;
  }

  function postsIn(pk, r) {
    // ⚠️ Top/Bottom/Newest/ตาราง ต้องดูเฉพาะที่เผยแพร่ "ในช่วงที่เลือก" เท่านั้น
    //    ไม่ใช่ทุกโพสต์ที่มี ไม่งั้นเลือก 7 วันแล้วยังเห็นคลิปเมื่อ 3 เดือนก่อนติดอันดับ
    return DATA.platforms[pk].posts.filter(function (p) {
      return p.publishedAt >= r.from && p.publishedAt <= r.to;
    });
  }

  /** รวม daily เป็นก้อนเดียว — คืน null เมื่อไม่มีข้อมูลเลยในช่วงนั้น */
  function agg(pk, r) {
    var rows = dailyIn(pk, r);
    if (!rows.length) return null;
    var P = C.PLATFORMS[pk], rk = P.reachKey;
    var a = { likes: 0, comments: 0, shares: 0, days: rows.length };
    a[rk] = 0;
    var wt = 0, avd = 0, cr = 0;
    rows.forEach(function (x) {
      a[rk] += x[rk] || 0;
      a.likes += x.likes || 0;
      a.comments += x.comments || 0;
      a.shares += x.shares || 0;
      wt += x.watchTime || 0;
      avd += x.avgViewDuration || 0;
      cr += x.completionRate || 0;
    });
    a.watchTime = wt;
    a.avgViewDuration = rows.length ? avd / rows.length : 0;
    a.completionRate = rows.length ? cr / rows.length : 0;
    a.engagement = C.engagementOf(pk, a);
    a.reach = C.reachOf(pk, a);
    a.er = P.er(a);
    a.posts = postsIn(pk, r).length;
    a.avgPerPost = a.posts ? a.reach / a.posts : null;
    return a;
  }

  function followersIn(pk, r) {
    return DATA.platforms[pk].followers.filter(function (f) {
      return f.date >= r.from && f.date <= r.to;
    });
  }

  function growth(pk, r) {
    var f = followersIn(pk, r);
    if (!f.length) return null;
    var g = 0, l = 0;
    f.forEach(function (x) { g += x.gained || 0; l += x.lost || 0; });
    return { gained: g, lost: l, net: g - l, end: f[f.length - 1].value, start: f[0].value };
  }

  /* ── รูปแบบตัวเลข ────────────────────────────────────────────────── */

  function num(v) {
    if (v == null || isNaN(v)) return null;
    v = Number(v);
    var s = v < 0 ? "−" : "";
    v = Math.abs(v);
    if (v >= 1e6) return s + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (v >= 1e4) return s + Math.round(v / 1e3) + "K";
    if (v >= 1e3) return s + (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return s + Math.round(v).toLocaleString("th-TH");
  }
  function pct(v) { return v == null || isNaN(v) ? null : (v * 100).toFixed(2).replace(/\.?0+$/, "") + "%"; }
  function dur(sec) {
    if (sec == null) return null;
    var m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m + ":" + String(s).padStart(2, "0");
  }
  function hours(h) { return h == null ? null : num(h) + " ชม."; }

  function fmt(kind, v) {
    if (kind === "pct") return pct(v);
    if (kind === "duration") return dur(v);
    if (kind === "hours") return hours(v);
    return num(v);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ── delta ───────────────────────────────────────────────────────── */

  /**
   * ป้ายเปรียบเทียบกับช่วงก่อน
   * ⚠️ เลือก "ไม่เทียบ" = ไม่ต้องมีป้ายเลย ไม่ใช่ป้ายที่เขียนว่า 0%
   * ⚠️ ช่วงเทียบไม่มีข้อมูล = บอกว่าไม่มีให้เทียบ ห้ามคิดเป็น +100%
   */
  function delta(cur, prev, opt) {
    if (state.compare === "none") return "";
    if (cur == null || prev == null) return '<span class="dlt none">ไม่มีข้อมูลเทียบ</span>';
    opt = opt || {};
    if (opt.pp) {
      var d = (cur - prev) * 100;
      var dir0 = Math.abs(d) < 0.05 ? "flat" : d > 0 ? "up" : "down";
      return '<span class="dlt ' + dir0 + '">' + arrow(dir0) + " " + Math.abs(d).toFixed(1) + " pt</span>";
    }
    if (!prev) return '<span class="dlt none">ไม่มีข้อมูลเทียบ</span>';
    var r = (cur - prev) / Math.abs(prev);
    var dir = Math.abs(r) < 0.001 ? "flat" : r > 0 ? "up" : "down";
    return '<span class="dlt ' + dir + '">' + arrow(dir) + " " + Math.abs(r * 100).toFixed(1) + "%</span>";
  }
  function arrow(d) { return d === "up" ? "▲" : d === "down" ? "▼" : "▬"; }

  /* ── ชิ้นส่วนหน้าจอ ──────────────────────────────────────────────── */

  function card(o) {
    var val = o.value == null ? "—" : o.value;
    return '<div class="sc' + (o.value == null ? " na" : "") + '">' +
      '<div class="sc-l">' + esc(o.label) + (o.hint ? ' <span class="hint" title="' + esc(o.hint) + '">ⓘ</span>' : "") + "</div>" +
      '<div class="sc-v">' + esc(val) + "</div>" +
      '<div class="sc-d">' + (o.delta || "") + "</div></div>";
  }

  function empty(msg, sub) {
    return '<div class="empty"><div class="empty-i">◔</div><div><b>' + esc(msg) + "</b>" +
      (sub ? "<div>" + esc(sub) + "</div>" : "") + "</div></div>";
  }

  function postRow(p, pk, opts) {
    opts = opts || {};
    var P = C.PLATFORMS[pk];
    var reach = p[P.reachKey] || 0;
    var er = P.er(p);
    var age = Math.round((midnight(new Date()) - parseKey(p.publishedAt)) / 864e5);
    var badge = opts.newBadge && age < 7 ? '<span class="badge new">ยังใหม่</span>' : "";
    return '<a class="post" href="' + esc(p.url) + '" target="_blank" rel="noopener">' +
      '<img src="' + esc(p.thumb) + '" alt="" loading="lazy">' +
      '<div class="post-b"><div class="post-t">' + esc(p.title) + badge + "</div>" +
      '<div class="post-m">' +
      (opts.showPlatform ? '<span class="chip" style="border-color:' + P.rawColor + '">' + esc(P.label) + "</span>" : "") +
      "<span>" + esc(P.reachLabel) + " " + esc(num(reach)) + "</span>" +
      "<span>ER " + esc(pct(er) || "—") + "</span>" +
      "<span>" + esc(thaiShort(p.publishedAt)) + "</span>" +
      "</div></div></a>";
  }

  /* ── แท็บภาพรวม ──────────────────────────────────────────────────── */

  function renderSummary() {
    var r = range(), cr = compareRange();
    var cur = {}, prev = {}, any = false;
    C.ORDER.forEach(function (pk) {
      cur[pk] = agg(pk, r);
      prev[pk] = cr ? agg(pk, cr) : null;
      if (cur[pk]) any = true;
    });

    if (!any) {
      return empty("ไม่มีข้อมูลในช่วงที่เลือก", "ลองขยายช่วงเวลา หรือเลือกวันที่ใหม่");
    }

    var h = "";

    // ① สรุปรวม 4 ใบ
    var tf = 0, tv = 0, te = 0, pf = 0, pv = 0, pe = 0;
    C.ORDER.forEach(function (pk) {
      var g = growth(pk, r);
      if (g) tf += g.end;
      if (cur[pk]) { tv += cur[pk].reach; te += cur[pk].engagement; }
      if (prev[pk]) { pv += prev[pk].reach; pe += prev[pk].engagement; }
      var pg = cr ? growth(pk, cr) : null;
      if (pg) pf += pg.end;
    });
    var erNow = tv ? te / tv : null, erPrev = pv ? pe / pv : null;

    h += '<div class="grid4">' +
      card({ label: "ผู้ติดตามรวม", value: num(tf), delta: delta(tf, cr ? pf : null) }) +
      card({ label: "การมองเห็นรวม", value: num(tv), hint: "YouTube/TikTok นับยอดวิว · Facebook นับการเข้าถึง", delta: delta(tv, cr ? pv : null) }) +
      card({ label: "การมีส่วนร่วมรวม", value: num(te), delta: delta(te, cr ? pe : null) }) +
      card({ label: "Engagement rate รวม", value: pct(erNow), hint: "การมีส่วนร่วมรวม ÷ การมองเห็นรวม", delta: delta(erNow, cr ? erPrev : null, { pp: true }) }) +
      "</div>";

    // ② การ์ดรายช่อง
    h += '<h2 class="sec">ผลงานรายช่อง</h2><div class="grid3">';
    C.ORDER.forEach(function (pk) {
      var P = C.PLATFORMS[pk], a = cur[pk], b = prev[pk];
      h += '<div class="pcard" style="--pc:' + P.rawColor + '">' +
        '<div class="pcard-h"><span class="pdot"></span>' + esc(P.label) + "</div>";
      if (!a) {
        h += '<div class="pcard-b">' + empty("ไม่มีข้อมูลในช่วงนี้") + "</div></div>";
        return;
      }
      h += '<div class="pcard-b"><div class="mini">' +
        miniRow(P.reachLabel, num(a.reach), delta(a.reach, b ? b.reach : null)) +
        miniRow("Engagement rate", pct(a.er), delta(a.er, b ? b.er : null, { pp: true })) +
        miniRow(P.contentWord + "ที่ลงในช่วงนี้", num(a.posts), delta(a.posts, b ? b.posts : null)) +
        miniRow("เฉลี่ยต่อ" + P.contentWord, num(a.avgPerPost), delta(a.avgPerPost, b ? b.avgPerPost : null)) +
        "</div></div></div>";
    });
    h += "</div>";

    // ③ โดนัทสัดส่วนการมองเห็น
    var slices = [], totalV = 0;
    C.ORDER.forEach(function (pk) { if (cur[pk]) totalV += cur[pk].reach; });
    C.ORDER.forEach(function (pk) {
      if (!cur[pk]) return;
      slices.push({ label: C.PLATFORMS[pk].label, value: cur[pk].reach, color: C.PLATFORMS[pk].rawColor, pk: pk });
    });
    h += '<h2 class="sec">สัดส่วนการมองเห็นแยกช่อง</h2><div class="panel donutwrap">' +
      CH.donut({ slices: slices, center: num(totalV), centerSub: "รวมทุกช่อง", aria: "สัดส่วนการมองเห็น" }) +
      '<div class="legend">';
    slices.forEach(function (s) {
      var share = totalV ? s.value / totalV : null;
      var pTot = 0;
      if (cr) C.ORDER.forEach(function (pk) { if (prev[pk]) pTot += prev[pk].reach; });
      var pShare = cr && pTot && prev[s.pk] ? prev[s.pk].reach / pTot : null;
      h += '<div class="lg"><span class="lg-d" style="background:' + s.color + '"></span>' +
        '<span class="lg-n">' + esc(s.label) + "</span>" +
        '<span class="lg-v">' + esc(pct(share)) + "</span>" +
        (cr ? delta(share, pShare, { pp: true }) : "") + "</div>";
    });
    h += "</div></div>";

    // ④ กราฟผู้ติดตาม — ฐาน 100
    h += '<h2 class="sec">แนวโน้มผู้ติดตาม <span class="sub">ปรับให้เริ่มที่ 100 เท่ากันทุกช่อง</span></h2>';
    var labels = null, series = [];
    C.ORDER.forEach(function (pk) {
      var f = followersIn(pk, r);
      if (!f.length) return;
      if (!labels) labels = f.map(function (x) { return thaiShort(x.date); });
      var base = f[0].value || 1;
      series.push({
        label: C.PLATFORMS[pk].label, color: C.PLATFORMS[pk].rawColor,
        points: f.map(function (x) { return { y: (x.value / base) * 100 }; }),
      });
    });
    h += '<div class="panel">' +
      (series.length
        ? CH.line({ labels: labels, series: series, height: 210, aria: "แนวโน้มผู้ติดตาม", fmtY: function (v) { return v.toFixed(0); } }) +
          legendOf(series) +
          '<p class="foot">ฐานแต่ละช่องต่างกันมาก (หลักหมื่นถึงแสน) ถ้าวาดด้วยตัวเลขดิบ เส้นของช่องเล็กจะแบนติดพื้นจนดูไม่ออก จึงปรับให้ทุกเส้นเริ่มที่ 100</p>'
        : empty("ไม่มีข้อมูลผู้ติดตามในช่วงนี้")) +
      "</div>";

    // ⑤ ผู้ติดตามเพิ่ม/ลด
    h += '<h2 class="sec">ผู้ติดตามที่เพิ่มและที่หายไป</h2>';
    var rows = [];
    C.ORDER.forEach(function (pk) {
      var g = growth(pk, r);
      if (!g) return;
      rows.push({
        label: C.PLATFORMS[pk].label, gained: g.gained, lost: g.lost, net: g.net,
        gainedText: num(g.gained), lostText: num(g.lost), netText: num(Math.abs(g.net)),
      });
    });
    h += '<div class="panel">' + (rows.length
      ? CH.gainLoss(rows) + '<p class="foot">ยอดสุทธิเท่ากันไม่ได้แปลว่าเหมือนกัน — ได้ 500 เสีย 480 คนละเรื่องกับ ได้ 30 เสีย 10</p>'
      : empty("ไม่มีข้อมูลผู้ติดตามในช่วงนี้")) + "</div>";

    // ⑥ คอนเทนต์เด่นข้ามช่อง
    var all = [];
    C.ORDER.forEach(function (pk) {
      postsIn(pk, r).forEach(function (p) {
        var er = C.PLATFORMS[pk].er(p);
        if (er != null) all.push({ p: p, pk: pk, er: er });
      });
    });
    all.sort(function (a, b) { return b.er - a.er; });
    h += '<h2 class="sec">คอนเทนต์ที่คนมีส่วนร่วมมากที่สุด <span class="sub">ทุกช่องรวมกัน</span></h2><div class="panel">';
    h += all.length
      ? '<div class="posts">' + all.slice(0, 3).map(function (x) { return postRow(x.p, x.pk, { showPlatform: true }); }).join("") + "</div>" +
        '<p class="foot">เรียงตาม engagement rate ซึ่งแต่ละช่องคิดคนละสูตร (ดูเชิงอรรถในแท็บของช่องนั้น) — ใช้ดูว่าใบไหนคนตอบสนองดี ไม่ใช่ใช้เทียบข้ามช่องแบบตรงๆ</p>'
      : empty("ไม่มีคอนเทนต์ที่เผยแพร่ในช่วงนี้", "ลองขยายช่วงเวลา");
    h += "</div>";

    return h;
  }

  function miniRow(label, value, d) {
    return '<div class="mr"><span class="mr-l">' + esc(label) + '</span><span class="mr-v">' +
      esc(value == null ? "—" : value) + "</span>" + (d || "") + "</div>";
  }

  function legendOf(series) {
    return '<div class="legend row">' + series.map(function (s) {
      return '<div class="lg"><span class="lg-d" style="background:' + s.color + '"></span><span class="lg-n">' + esc(s.label) + "</span></div>";
    }).join("") + "</div>";
  }

  /* ── แท็บรายช่อง ─────────────────────────────────────────────────── */

  function renderPlatform(pk) {
    var P = C.PLATFORMS[pk], r = range(), cr = compareRange();
    var a = agg(pk, r), b = cr ? agg(pk, cr) : null;
    var g = growth(pk, r), pg = cr ? growth(pk, cr) : null;

    if (!a) return empty("ไม่มีข้อมูลของ " + P.label + " ในช่วงที่เลือก", "ลองขยายช่วงเวลา หรือเลือกวันที่ใหม่");

    var h = "";

    // ① สรุปของช่อง
    h += '<div class="grid4">' +
      card({ label: "ผู้ติดตาม", value: g ? num(g.end) : null, delta: delta(g ? g.end : null, pg ? pg.end : null) }) +
      card({ label: "เพิ่มสุทธิในช่วงนี้", value: g ? num(g.net) : null, delta: delta(g ? g.net : null, pg ? pg.net : null) }) +
      card({ label: P.reachLabel, value: num(a.reach), delta: delta(a.reach, b ? b.reach : null) }) +
      card({ label: P.erLabel, value: pct(a.er), hint: P.erFormula, delta: delta(a.er, b ? b.er : null, { pp: true }) }) +
      "</div>";

    // metric เฉพาะแพลตฟอร์ม
    var ex = P.extras.filter(function (e) { return e.key !== P.reachKey; });
    if (ex.length) {
      h += '<div class="grid4 tight">' + ex.map(function (e) {
        return card({ label: e.label, value: fmt(e.fmt, a[e.key]), delta: delta(a[e.key], b ? b[e.key] : null, { pp: e.fmt === "pct" }) });
      }).join("") + "</div>";
    }

    // ② กราฟรายวัน
    var rows = dailyIn(pk, r);
    var labels = rows.map(function (x) { return thaiShort(x.date); });
    h += '<h2 class="sec">' + esc(P.reachLabel) + "และการมีส่วนร่วมรายวัน</h2><div class=\"panel\">";
    h += rows.length
      ? CH.line({
          labels: labels, height: 220, zeroFloor: true, aria: "รายวัน",
          series: [
            { label: P.reachLabel, color: P.rawColor, points: rows.map(function (x) { return { y: x[P.reachKey] }; }) },
            { label: "การมีส่วนร่วม", color: "#c3c2b7", points: rows.map(function (x) { return { y: C.engagementOf(pk, x) }; }) },
          ],
          fmtY: function (v) { return num(v); },
        }) + legendOf([{ label: P.reachLabel, color: P.rawColor }, { label: "การมีส่วนร่วม", color: "#c3c2b7" }])
      : empty("ไม่มีข้อมูลรายวันในช่วงนี้");
    h += "</div>";

    // ③ แยกประเภทการมีส่วนร่วม
    var parts = P.parts.map(function (p) { return { label: p.label, value: a[p.key] || 0, color: p.color }; });
    var totalPart = parts.reduce(function (s, p) { return s + p.value; }, 0);
    h += '<h2 class="sec">การมีส่วนร่วมแยกประเภท</h2><div class="panel">';
    if (totalPart) {
      h += CH.stack(parts) + '<div class="legend row">';
      parts.forEach(function (p) {
        var bPrev = b ? b[P.parts.filter(function (x) { return x.label === p.label; })[0].key] : null;
        h += '<div class="lg"><span class="lg-d" style="background:' + p.color + '"></span>' +
          '<span class="lg-n">' + esc(p.label) + "</span>" +
          '<span class="lg-v">' + esc(num(p.value)) + "</span>" +
          '<span class="lg-s">' + esc(pct(p.value / totalPart)) + "</span>" +
          delta(p.value, bPrev) + "</div>";
      });
      h += "</div>";
      if (pk === "youtube") h += '<p class="foot">' + esc(P.erNote) + "</p>";
    } else {
      h += empty("ไม่มีการมีส่วนร่วมในช่วงนี้");
    }
    h += "</div>";

    // ④⑤⑥ คอนเทนต์
    var posts = postsIn(pk, r);
    var withEr = posts.map(function (p) { return { p: p, er: P.er(p) }; }).filter(function (x) { return x.er != null; });
    var now = midnight(new Date());
    var ageOf = function (p) { return Math.round((now - parseKey(p.publishedAt)) / 864e5); };

    h += '<h2 class="sec">' + esc(P.contentWord) + "ที่คนมีส่วนร่วมมากที่สุด</h2><div class=\"panel\">" +
      (withEr.length
        ? '<div class="posts">' + withEr.slice().sort(function (x, y) { return y.er - x.er; }).slice(0, 3)
            .map(function (x) { return postRow(x.p, pk); }).join("") + "</div>"
        : empty("ไม่มี" + P.contentWord + "ที่เผยแพร่ในช่วงนี้")) + "</div>";

    var newest = posts.slice().sort(function (x, y) { return x.publishedAt < y.publishedAt ? 1 : -1; }).slice(0, 5);
    h += '<h2 class="sec">' + esc(P.contentWord) + "ล่าสุด</h2><div class=\"panel\">" +
      (newest.length
        ? '<div class="posts">' + newest.map(function (p) { return postRow(p, pk, { newBadge: true }); }).join("") + "</div>"
        : empty("ไม่มี" + P.contentWord + "ที่เผยแพร่ในช่วงนี้")) + "</div>";

    // ⚠️ ใบที่เพิ่งลงยังไม่ทันมีคนเห็น เอามาจัดอันดับท้ายไม่ได้ — ตัดใบอายุน้อยกว่า 7 วันออก
    var mature = withEr.filter(function (x) { return ageOf(x.p) >= 7; });
    h += '<h2 class="sec">' + esc(P.contentWord) + 'ที่ผลตอบรับน้อยที่สุด <span class="sub">เฉพาะที่ลงมาแล้วเกิน 7 วัน</span></h2><div class="panel">' +
      (mature.length
        ? '<div class="posts">' + mature.sort(function (x, y) { return x.er - y.er; }).slice(0, 3)
            .map(function (x) { return postRow(x.p, pk); }).join("") +
          '</div><p class="foot">ไม่นับใบที่เพิ่งลงไม่ถึง 7 วัน เพราะยังไม่ทันมีคนเห็น จะติดอันดับท้ายทุกใบโดยไม่ได้แปลว่าไม่ดี</p>'
        : empty("ยังไม่มี" + P.contentWord + "ที่ลงเกิน 7 วันในช่วงนี้", "ลองขยายช่วงเวลา")) + "</div>";

    // ⑦ ตารางทั้งหมด
    h += '<h2 class="sec">' + esc(P.contentWord) + "ทั้งหมดในช่วงที่เลือก <span class=\"sub\">" + posts.length + " รายการ</span></h2>";
    h += '<div class="panel">' + (posts.length ? table(posts, pk) : empty("ไม่มี" + P.contentWord + "ที่เผยแพร่ในช่วงนี้")) + "</div>";

    h += '<p class="formula">สูตร ' + esc(P.erLabel) + " ของ " + esc(P.label) + ": <b>" + esc(P.erFormula) + "</b><br>" + esc(P.erNote) + "</p>";
    return h;
  }

  function table(posts, pk) {
    var P = C.PLATFORMS[pk];
    var rows = posts.map(function (p) { return { p: p, er: P.er(p), reach: p[P.reachKey] || 0 }; });
    var s = state.sort;
    rows.sort(function (a, b) {
      var v;
      if (s.key === "views") v = a.reach - b.reach;
      else if (s.key === "er") v = (a.er || 0) - (b.er || 0);
      else v = a.p.publishedAt < b.p.publishedAt ? -1 : a.p.publishedAt > b.p.publishedAt ? 1 : 0;
      return v * s.dir;
    });
    var caret = function (k) { return s.key === k ? (s.dir === 1 ? " ▲" : " ▼") : ""; };
    var h = '<div class="tblwrap"><table class="tbl"><thead><tr>' +
      '<th>' + esc(P.contentWord) + "</th>" +
      '<th class="sortable" data-sort="date">วันที่' + caret("date") + "</th>" +
      '<th class="sortable num" data-sort="views">' + esc(P.reachLabel) + caret("views") + "</th>" +
      '<th class="sortable num" data-sort="er">ER' + caret("er") + "</th>" +
      "</tr></thead><tbody>";
    rows.forEach(function (x) {
      h += "<tr><td>" + esc(x.p.title) + "</td><td>" + esc(thaiShort(x.p.publishedAt)) + "</td>" +
        '<td class="num">' + esc(num(x.reach)) + '</td><td class="num">' + esc(pct(x.er) || "—") + "</td></tr>";
    });
    return h + "</tbody></table></div>";
  }

  /* ── แถบควบคุม + แท็บ ────────────────────────────────────────────── */

  function renderControls() {
    var r = range(), cr = compareRange();
    var h = '<div class="ctrl-row"><div class="seg" id="presets">';
    PRESETS.forEach(function (p) {
      h += '<button type="button" class="' + (state.preset === p.days ? "on" : "") + '" data-days="' + p.days + '">' + esc(p.label) + "</button>";
    });
    h += '<button type="button" class="' + (state.preset === "custom" ? "on" : "") + '" data-days="custom">กำหนดเอง</button></div>';

    h += '<div class="seg" id="cmp">' +
      ['prev|ช่วงก่อนหน้า', 'yoy|ปีก่อน', 'none|ไม่เทียบ'].map(function (x) {
        var p = x.split("|");
        return '<button type="button" class="' + (state.compare === p[0] ? "on" : "") + '" data-cmp="' + p[0] + '">' + esc(p[1]) + "</button>";
      }).join("") + "</div></div>";

    if (state.preset === "custom") {
      h += '<div class="ctrl-row dates"><label>ตั้งแต่ <input type="date" id="d1" value="' + esc(state.start || r.from) + '"></label>' +
        '<label>ถึง <input type="date" id="d2" value="' + esc(state.end || r.to) + '"></label></div>';
    }

    h += '<div class="ctrl-note">' + esc(thaiShort(r.from)) + " – " + esc(thaiShort(r.to)) + " (" + r.days + " วัน)" +
      (cr ? ' <span class="vs">เทียบกับ ' + esc(thaiShort(cr.from)) + " – " + esc(thaiShort(cr.to)) + "</span>" : ' <span class="vs">ไม่ได้เทียบกับช่วงไหน</span>') +
      "</div>";
    return h;
  }

  function renderTabs() {
    return C.TABS.map(function (t) {
      return '<button type="button" class="tab' + (state.tab === t.key ? " on" : "") + '" data-tab="' + t.key + '">' +
        '<span class="ti">' + esc(t.icon) + "</span>" + esc(t.label) + "</button>";
    }).join("");
  }

  /* ── วาดใหม่ทั้งหน้า ─────────────────────────────────────────────── */

  function render() {
    document.getElementById("controls").innerHTML = renderControls();
    document.getElementById("tabs").innerHTML = renderTabs();

    var tab = C.TABS.filter(function (t) { return t.key === state.tab; })[0] || C.TABS[0];
    var view = document.getElementById("view");
    view.innerHTML = tab.platform ? renderPlatform(tab.platform) : renderSummary();
    view.scrollTop = 0;
  }

  /* ── รับคำสั่งจากผู้ใช้ ──────────────────────────────────────────── */

  function onClick(e) {
    var t = e.target.closest("[data-tab],[data-days],[data-cmp],[data-sort]");
    if (!t) return;

    if (t.dataset.tab) { state.tab = t.dataset.tab; render(); return; }

    if (t.dataset.days) {
      if (t.dataset.days === "custom") {
        var r = range();
        // เริ่มจากช่วงที่เห็นอยู่ ผู้ใช้จะได้ไม่ต้องกรอกใหม่จากศูนย์
        state.start = state.start || r.from;
        state.end = state.end || r.to;
        state.preset = "custom";
      } else {
        state.preset = +t.dataset.days;
      }
      render(); return;
    }

    if (t.dataset.cmp) { state.compare = t.dataset.cmp; render(); return; }

    if (t.dataset.sort) {
      var k = t.dataset.sort;
      // กดคอลัมน์เดิมซ้ำ = สลับทิศ · กดคอลัมน์ใหม่ = เริ่มจากมากไปน้อย
      if (state.sort.key === k) state.sort.dir *= -1;
      else state.sort = { key: k, dir: -1 };
      render();
    }
  }

  function onChange(e) {
    if (e.target.id !== "d1" && e.target.id !== "d2") return;
    var d1 = document.getElementById("d1"), d2 = document.getElementById("d2");
    state.start = d1.value; state.end = d2.value;
    if (state.start && state.end) render();
  }

  function mockBanner() {
    var b = document.createElement("div");
    b.id = "mockbar";
    b.textContent = "⚠️ ข้อมูลจำลองสำหรับออกแบบ — ยังไม่ได้ต่อข้อมูลจริง ห้ามนำตัวเลขไปใช้อ้างอิง";
    document.body.insertBefore(b, document.body.firstChild);
    document.title = "[ข้อมูลจำลอง] " + document.title;
  }

  function start() {
    if (DATA && DATA.isMock) mockBanner();
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    render();
  }

  if (document.readyState !== "loading") start();
  else document.addEventListener("DOMContentLoaded", start);
})();
