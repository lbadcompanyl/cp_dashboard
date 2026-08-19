/* Social Dashboard — 4 แท็บ (ภาพรวม / YouTube / TikTok / Facebook)
 *
 * 🔴 รอบนี้ยังใช้ข้อมูลจำลองจาก mock.js
 *    ตัวคำนวณทุกตัวอ่านจากโครง { daily, followers, posts } เท่านั้น
 *    ตอนต่อ API จริง เปลี่ยนแค่ที่มาของ `DATA` — ไม่ต้องแตะตัวคำนวณหรือตัววาด
 *
 * ⚠️ ช่วงเวลา + โหมดเทียบ เก็บไว้ที่ `state` ตัวเดียว ทุกแท็บอ่านจากตัวนี้
 *    ห้ามให้แท็บไหนเก็บช่วงเวลาของตัวเอง — สลับแท็บแล้วเลขต้องเป็นชุดเดียวกัน
 *
 * ⚠️ สถานะที่ผู้ใช้เลือกไว้ห้ามอยู่ใน DOM อย่างเดียว — render() สร้าง innerHTML ใหม่ทั้งก้อน
 *    อะไรที่กดแล้วเปลี่ยนสภาพ (แท็บ / การเรียง / ชิพเลือกช่อง) ต้องจำใน state
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

  /* 🔴 กติกา delta ใช้ร่วมทั้งแอป: ฐานต่ำกว่านี้ให้บอกเป็น "จำนวนจริง" ไม่ใช่ %
   *    เปอร์เซ็นต์บนฐานเลขหลักสิบ/ร้อยหลอกตา — เคสจริงจากรอบรีวิว:
   *    Facebook เพิ่มสุทธิ 37 คน แล้วขึ้นว่า ▲23.3% ซึ่งอ่านแล้วเข้าใจผิดว่าโตเยอะ
   *    ⚠️ ห้ามคิด % เองที่อื่น ให้เรียก delta() ตัวนี้เท่านั้น */
  var DELTA_MIN_BASE = 1000;

  var state = {
    tab: "summary",
    preset: 30,          // 7 | 30 | 90 | "custom"
    start: null,
    end: null,
    compare: "prev",     // prev | yoy | none
    sort: { key: "date", dir: -1 },
    // กางการ์ดสรุปให้เห็นตัวเลขรายช่อง — ของหน้าภาพรวมเท่านั้น
    breakdown: false,
    // ชิพเลือกช่องของหน้าภาพรวม — ไม่ต้องข้ามไปมีผลกับแท็บรายช่อง
    channels: { youtube: true, tiktok: true, facebook: true },
  };

  /* ── วันที่ ──────────────────────────────────────────────────────── */

  function midnight(d) { var x = new Date(d.getTime()); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, k) { var x = new Date(d.getTime()); x.setDate(x.getDate() + k); return x; }
  function key(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function parseKey(s) { var p = String(s).split("-"); return midnight(new Date(+p[0], +p[1] - 1, +p[2])); }
  function thaiShort(k) {
    var M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    var d = parseKey(k);
    return d.getDate() + " " + M[d.getMonth()];
  }

  function range() {
    if (state.preset === "custom" && state.start && state.end) {
      var a = parseKey(state.start), b = parseKey(state.end);
      if (a > b) { var t = a; a = b; b = t; }
      return { from: key(a), to: key(b), days: Math.round((b - a) / 864e5) + 1 };
    }
    var end = midnight(new Date());
    return { from: key(addDays(end, -(state.preset - 1))), to: key(end), days: state.preset };
  }

  function compareRange() {
    if (state.compare === "none") return null;
    var r = range(), a = parseKey(r.from), b = parseKey(r.to);
    if (state.compare === "yoy") {
      var a2 = new Date(a.getTime()); a2.setFullYear(a2.getFullYear() - 1);
      var b2 = new Date(b.getTime()); b2.setFullYear(b2.getFullYear() - 1);
      return { from: key(a2), to: key(b2), days: r.days };
    }
    var pb = addDays(a, -1), pa = addDays(pb, -(r.days - 1));
    return { from: key(pa), to: key(pb), days: r.days };
  }

  /** ช่องที่เปิดอยู่ — หน้าภาพรวมทุกส่วนต้องอ่านจากตัวนี้ ห้ามใช้ C.ORDER ตรงๆ */
  function activeOrder() {
    return C.ORDER.filter(function (pk) { return state.channels[pk]; });
  }

  /* ── รวมตัวเลข ───────────────────────────────────────────────────── */

  function dailyIn(pk, r) {
    return DATA.platforms[pk].daily.filter(function (x) { return x.date >= r.from && x.date <= r.to; });
  }

  function postsIn(pk, r) {
    // ⚠️ Top/Bottom/Newest/ตาราง ดูเฉพาะที่เผยแพร่ "ในช่วงที่เลือก" เท่านั้น
    return DATA.platforms[pk].posts.filter(function (p) {
      return p.publishedAt >= r.from && p.publishedAt <= r.to;
    });
  }

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
    a.avgViewDuration = avd / rows.length;
    a.completionRate = cr / rows.length;
    a.engagement = C.engagementOf(pk, a);
    a.reach = C.reachOf(pk, a);
    a.er = P.er(a);
    a.posts = postsIn(pk, r).length;
    a.avgPerPost = a.posts ? a.reach / a.posts : null;
    return a;
  }

  function followersIn(pk, r) {
    return DATA.platforms[pk].followers.filter(function (f) { return f.date >= r.from && f.date <= r.to; });
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
    var m = Math.floor(sec / 60);
    return m + ":" + String(Math.round(sec % 60)).padStart(2, "0");
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

  /* ── delta (ตัวเดียวของทั้งแอป) ──────────────────────────────────── */

  function arrow(d) { return d === "up" ? "▲" : d === "down" ? "▼" : "▬"; }

  /**
   * ป้ายเปรียบเทียบกับช่วงก่อน
   * ⚠️ เลือก "ไม่เทียบ" = ไม่มีป้ายเลย ไม่ใช่ป้ายที่เขียนว่า 0%
   * ⚠️ ช่วงเทียบไม่มีข้อมูล = บอกว่าไม่มีให้เทียบ ห้ามคิดเป็น +100%
   * ⚠️ ฐานต่ำกว่า DELTA_MIN_BASE = บอกเป็นจำนวนจริง ไม่ใช่ %
   */
  function delta(cur, prev, opt) {
    if (state.compare === "none") return "";
    if (cur == null || prev == null) return '<span class="dlt none">ไม่มีข้อมูลเทียบ</span>';
    opt = opt || {};

    /* ⚠️ ลูกศรกับตัวเลขต้องเล่าเรื่องเดียวกัน
     *    เคยได้ "▬ 0.1%" อยู่ข้าง "▲ 0.1%" เพราะเกณฑ์ "ถือว่าเท่าเดิม" กับจำนวน
     *    ทศนิยมที่แสดง ใช้คนละค่ากัน · ตอนนี้ยึดค่าที่ "แสดงจริงหลังปัด" เป็นตัวตัดสิน
     *    → ลูกศรราบ ก็ต่อเมื่อเลขที่เห็นเป็น 0 เท่านั้น */
    var dirOf = function (shown, signed) {
      return Number(shown) === 0 ? "flat" : signed > 0 ? "up" : "down";
    };

    // อัตราส่วน (ER, completion rate) → เทียบเป็น percentage point เสมอ
    if (opt.pp) {
      var d = (cur - prev) * 100;
      var dTxt = Math.abs(d).toFixed(1);
      var dir0 = dirOf(dTxt, d);
      return '<span class="dlt ' + dir0 + '">' + arrow(dir0) + " " + dTxt + " pt</span>";
    }

    var diff = cur - prev;

    // 🔴 ฐานเล็ก → จำนวนจริง (เช่น +7) เพราะ % บนฐานหลักสิบหลักร้อยหลอกตา
    if (Math.abs(prev) < DELTA_MIN_BASE) {
      var mag = Math.abs(diff);
      var txt = mag < 1 ? mag.toFixed(1) : String(Math.round(mag));
      var dirA = dirOf(txt, diff);
      return '<span class="dlt ' + dirA + '" title="เทียบเป็นจำนวนจริงเพราะฐานน้อยกว่า ' +
        DELTA_BASE_LABEL + '">' + arrow(dirA) + " " + (dirA === "down" ? "−" : dirA === "up" ? "+" : "") +
        Number(txt).toLocaleString("th-TH") + "</span>";
    }

    if (!prev) return '<span class="dlt none">ไม่มีข้อมูลเทียบ</span>';
    var rr = (diff / Math.abs(prev)) * 100;
    var rTxt = Math.abs(rr).toFixed(1);
    var dir = dirOf(rTxt, rr);
    return '<span class="dlt ' + dir + '">' + arrow(dir) + " " + rTxt + "%</span>";
  }
  var DELTA_BASE_LABEL = DELTA_MIN_BASE.toLocaleString("th-TH");

  /* ── ชิ้นส่วนหน้าจอ ──────────────────────────────────────────────── */

  /** หัวข้อ — คำอธิบายยาวๆ ไปอยู่ใน tooltip ของ ⓘ ไม่ใช่ย่อหน้าใต้การ์ด */
  function sec(title, sub, tip) {
    return '<h2 class="sec">' + esc(title) +
      (tip ? ' <button type="button" class="tipi" data-tip="' + esc(tip) + '" title="' + esc(tip) + '" aria-label="คำอธิบาย">ⓘ</button>' : "") +
      (sub ? ' <span class="sub">' + esc(sub) + "</span>" : "") + "</h2>";
  }

  function card(o) {
    return '<div class="sc' + (o.value == null ? " na" : "") + '">' +
      '<div class="sc-l">' + esc(o.label) +
      (o.tip ? ' <button type="button" class="tipi" data-tip="' + esc(o.tip) + '" title="' + esc(o.tip) + '" aria-label="คำอธิบาย">ⓘ</button>' : "") +
      "</div>" +
      '<div class="sc-v">' + esc(o.value == null ? "—" : o.value) + "</div>" +
      '<div class="sc-d">' + (o.delta || "") + "</div>" + (o.extra || "") + "</div>";
  }

  function empty(msg, sub) {
    return '<div class="empty"><div class="empty-i">◔</div><div><b>' + esc(msg) + "</b>" +
      (sub ? "<div>" + esc(sub) + "</div>" : "") + "</div></div>";
  }

  function postRow(p, pk, opts) {
    opts = opts || {};
    var P = C.PLATFORMS[pk];
    var reach = p[P.reachKey] || 0;
    var age = Math.round((midnight(new Date()) - parseKey(p.publishedAt)) / 864e5);
    var badge = opts.newBadge && age < 7 ? '<span class="badge new">ยังใหม่</span>' : "";
    return '<a class="post" href="' + esc(p.url) + '" target="_blank" rel="noopener">' +
      '<img src="' + esc(p.thumb) + '" alt="" loading="lazy">' +
      '<div class="post-b"><div class="post-t">' + esc(p.title) + badge + "</div>" +
      '<div class="post-m">' +
      (opts.showPlatform ? '<span class="chip" style="border-color:' + P.rawColor + '">' + esc(P.label) + "</span>" : "") +
      "<span>" + esc(P.reachLabel) + " " + esc(num(reach)) + "</span>" +
      "<span>ER " + esc(pct(P.er(p)) || "—") + "</span>" +
      "<span>" + esc(thaiShort(p.publishedAt)) + "</span>" +
      "</div></div></a>";
  }

  /* ── แท็บภาพรวม ──────────────────────────────────────────────────── */

  function renderSummary() {
    var order = activeOrder();
    if (!order.length) {
      return empty("ยังไม่ได้เลือกช่องไหนเลย", "กดชิพช่องด้านบนให้ติดอย่างน้อย 1 ช่อง");
    }

    var r = range(), cr = compareRange();
    var cur = {}, prev = {}, any = false;
    order.forEach(function (pk) {
      cur[pk] = agg(pk, r);
      prev[pk] = cr ? agg(pk, cr) : null;
      if (cur[pk]) any = true;
    });
    if (!any) return empty("ไม่มีข้อมูลในช่วงที่เลือก", "ลองขยายช่วงเวลา หรือเลือกวันที่ใหม่");

    var h = "";

    // ① สรุปรวม 4 ใบ — นับจากช่องที่เปิดอยู่เท่านั้น
    var tf = 0, tv = 0, te = 0, pf = 0, pv = 0, pe = 0;
    order.forEach(function (pk) {
      var g = growth(pk, r), pgg = cr ? growth(pk, cr) : null;
      if (g) tf += g.end;
      if (pgg) pf += pgg.end;
      if (cur[pk]) { tv += cur[pk].reach; te += cur[pk].engagement; }
      if (prev[pk]) { pv += prev[pk].reach; pe += prev[pk].engagement; }
    });
    var erNow = tv ? te / tv : null, erPrev = pv ? pe / pv : null;

    /* แถวรายช่องใต้ยอดรวม — โผล่เมื่อกดปุ่ม "แยกช่อง"
     * ⚠️ อ่านจาก order (ช่องที่เปิดอยู่) เหมือนยอดรวม ปิดช่องไหนต้องหายทั้งคู่
     *    ไม่งั้นยอดรวมกับรายช่องจะบวกกันไม่ลง แล้วดูเหมือนคำนวณผิด */
    function bd(pick, opt) {
      if (!state.breakdown) return "";
      var rows = order.map(function (pk) {
        var P = C.PLATFORMS[pk];
        var v = pick(cur[pk], prev[pk], pk, r, cr);
        return '<div class="bd-r"><span class="bd-d" style="background:' + P.rawColor + '"></span>' +
          '<span class="bd-n">' + esc(P.short) + '</span><span class="bd-v">' +
          esc(v.text == null ? "—" : v.text) + "</span>" +
          delta(v.cur, v.prev, opt) + "</div>";
      }).join("");
      return '<div class="bd">' + rows + "</div>";
    }

    h += '<div class="grid4">' +
      card({ label: "ผู้ติดตามรวม", value: num(tf), delta: delta(tf, cr ? pf : null),
             extra: bd(function (a, b, pk) {
               var g = growth(pk, r), pg2 = cr ? growth(pk, cr) : null;
               return { text: g ? num(g.end) : null, cur: g ? g.end : null, prev: pg2 ? pg2.end : null };
             }) }) +
      card({ label: "การมองเห็นรวม", value: num(tv),
             tip: "YouTube และ TikTok นับเป็นยอดวิว · Facebook นับเป็นการเข้าถึง (จำนวนคนที่เห็นโพสต์) สองอย่างนี้ไม่ใช่หน่วยเดียวกัน แต่รวมไว้เพื่อดูภาพกว้าง",
             delta: delta(tv, cr ? pv : null),
             extra: bd(function (a, b) {
               return { text: a ? num(a.reach) : null, cur: a ? a.reach : null, prev: b ? b.reach : null };
             }) }) +
      card({ label: "การมีส่วนร่วมรวม", value: num(te),
             tip: "ไลก์ + คอมเมนต์ + แชร์ ตามที่แต่ละช่องนับได้ · YouTube ไม่มีตัวเลขแชร์ให้",
             delta: delta(te, cr ? pe : null),
             extra: bd(function (a, b) {
               return { text: a ? num(a.engagement) : null, cur: a ? a.engagement : null, prev: b ? b.engagement : null };
             }) }) +
      card({ label: "Engagement rate รวม", value: pct(erNow),
             tip: "การมีส่วนร่วมรวม ÷ การมองเห็นรวม ของช่องที่เปิดอยู่ · ค่ารายช่องคิดด้วยสูตรของช่องนั้นเอง จึงเทียบข้ามช่องตรงๆ ไม่ได้",
             delta: delta(erNow, cr ? erPrev : null, { pp: true }),
             extra: bd(function (a, b) {
               return { text: a ? pct(a.er) : null, cur: a ? a.er : null, prev: b ? b.er : null };
             }, { pp: true }) }) +
      "</div>";

    /* ② แนวโน้ม — วางเป็นคู่ซ้าย-ขวา 2 แถว (จอแคบยุบเป็นบนล่าง)
     *    แถวบน: ผู้ติดตาม (เส้น) คู่กับ ผู้ติดตามเพิ่ม/หาย (แท่ง) — เรื่องเดียวกัน 2 มุม
     *    แถวล่าง: การมีส่วนร่วม คู่กับ การมองเห็น
     * ⚠️ กราฟผู้ติดตามเคยกินเต็มความกว้างแล้วสูงเกินจำเป็น (เจ้าของแจ้ง)
     *    ย่อลงครึ่งหนึ่งแล้วเอาแท่งเพิ่ม/หายมาวางข้างๆ ได้ข้อมูลมากขึ้นในที่เท่าเดิม
     * ทุกกราฟอ่านจาก order (ช่องที่เปิดอยู่) → ชิพเลือกช่องคุมได้ทั้งหมด */

    var glRows = [];
    order.forEach(function (pk) {
      var g = growth(pk, r);
      if (!g) return;
      glRows.push({
        label: C.PLATFORMS[pk].label, gained: g.gained, lost: g.lost, net: g.net,
        gainedText: num(g.gained), lostText: num(g.lost), netText: num(Math.abs(g.net)),
      });
    });

    h += '<div class="duo">' +
      '<div class="duo-c">' +
        sec("แนวโน้มผู้ติดตาม", "% สะสมจากวันแรก",
          "ทุกเส้นเริ่มที่ 0% ในวันแรกของช่วงที่เลือก แล้ววัดว่าขยับขึ้นลงกี่เปอร์เซ็นต์จากจุดนั้น " +
          "จำนวนผู้ติดตามของแต่ละช่องต่างกันหลักสิบเท่า ถ้าวาดด้วยตัวเลขดิบ เส้นของช่องที่เล็กกว่าจะแบนติดพื้นจนดูไม่ออก") +
        '<div class="panel">' + followerTrend(order, r, 168) + "</div>" +
      "</div>" +
      '<div class="duo-c">' +
        sec("ผู้ติดตามที่เพิ่มและที่หายไป", null,
          "แท่งแดงยื่นซ้ายคือคนที่เลิกติดตาม แท่งเขียวยื่นขวาคือคนที่เพิ่งติดตาม ทุกช่องใช้มาตราส่วนเดียวกัน " +
          "ยอดสุทธิเท่ากันไม่ได้แปลว่าเหมือนกัน — ได้ 500 เสีย 480 คนละเรื่องกับ ได้ 30 เสีย 10") +
        '<div class="panel">' + (glRows.length ? CH.diverging(glRows) : empty("ไม่มีข้อมูลผู้ติดตามในช่วงนี้")) + "</div>" +
      "</div>" +
      "</div>";

    // การมีส่วนร่วม / การมองเห็น — คู่ซ้าย-ขวาแถวที่สอง
    h += '<div class="duo">' +
      '<div class="duo-c">' +
        sec("การมีส่วนร่วมรายวัน", null,
          "ไลก์ + คอมเมนต์ + แชร์ ตามที่แต่ละช่องนับได้ · YouTube ไม่มีตัวเลขแชร์ให้ ตัวเลขจึงต่ำกว่าช่องอื่นโดยธรรมชาติ") +
        '<div class="panel">' + channelTrend(order, r, function (pk, x) { return C.engagementOf(pk, x); }, 175) + "</div>" +
      "</div>" +
      '<div class="duo-c">' +
        sec("การมองเห็นรายวัน", null,
          "YouTube และ TikTok เป็นยอดวิว · Facebook เป็นการเข้าถึง (จำนวนคนที่เห็นโพสต์) คนละหน่วยกัน วางเส้นไว้ด้วยกันเพื่อดูจังหวะขึ้นลง ไม่ใช่เพื่อเทียบขนาด") +
        '<div class="panel">' + channelTrend(order, r, function (pk, x) { return x[C.PLATFORMS[pk].reachKey]; }, 175) + "</div>" +
      "</div>" +
      "</div>";

    // ③ ตารางเทียบรายช่อง (เดิมเป็นการ์ด 3 ใบ)
    h += sec("ผลงานรายช่อง", null,
      "แต่ละช่องวัดคนละหน่วย: YouTube/TikTok เป็นยอดวิว · Facebook เป็นการเข้าถึง " +
      "ตัวเลขในแถวเดียวกันจึงเทียบขนาดกันตรงๆ ไม่ได้ ใช้ดูทิศทางของแต่ละช่องแทน");
    h += '<div class="panel"><div class="tblwrap"><table class="tbl cmp"><thead><tr><th>ตัวชี้วัด</th>' +
      order.map(function (pk) {
        var P = C.PLATFORMS[pk];
        return '<th class="num"><span class="pdot" style="background:' + P.rawColor + '"></span> ' + esc(P.label) + "</th>";
      }).join("") + "</tr></thead><tbody>";

    var ROWS = [
      { label: "ยอดวิว / การเข้าถึง", get: function (a) { return num(a.reach); }, raw: function (a) { return a.reach; } },
      { label: "Engagement rate", get: function (a) { return pct(a.er); }, raw: function (a) { return a.er; }, pp: true },
      { label: "จำนวนโพสต์ในช่วงนี้", get: function (a) { return num(a.posts); }, raw: function (a) { return a.posts; } },
      { label: "เฉลี่ยต่อโพสต์", get: function (a) { return num(a.avgPerPost); }, raw: function (a) { return a.avgPerPost; } },
    ];
    ROWS.forEach(function (row) {
      h += "<tr><th scope=\"row\">" + esc(row.label) + "</th>";
      order.forEach(function (pk) {
        var a = cur[pk], b = prev[pk];
        if (!a) { h += '<td class="num na">—</td>'; return; }
        h += '<td class="num"><span class="cv">' + esc(row.get(a) == null ? "—" : row.get(a)) + "</span>" +
          '<span class="cd">' + delta(row.raw(a), b ? row.raw(b) : null, { pp: row.pp }) + "</span></td>";
      });
      h += "</tr>";
    });
    h += "</tbody></table></div></div>";

    // ③ สัดส่วนการมองเห็น — แท่งเดียว 100% (เดิมเป็นโดนัท กินที่เกินไป)
    var totalV = 0, pTot = 0;
    order.forEach(function (pk) { if (cur[pk]) totalV += cur[pk].reach; if (prev[pk]) pTot += prev[pk].reach; });
    var segs = order.filter(function (pk) { return cur[pk]; }).map(function (pk) {
      return { label: C.PLATFORMS[pk].label, value: cur[pk].reach, color: C.PLATFORMS[pk].rawColor, pk: pk };
    });

    h += sec("สัดส่วนการมองเห็นแยกช่อง", null,
      "หน่วย pt คือส่วนต่างของสัดส่วน เช่น จาก 40% เป็น 43% = +3 pt ไม่ใช่ +7.5%");
    h += '<div class="panel compact">' + CH.share100(segs) + '<div class="legend row">';
    segs.forEach(function (s) {
      var share = totalV ? s.value / totalV : null;
      var pShare = cr && pTot && prev[s.pk] ? prev[s.pk].reach / pTot : null;
      h += '<div class="lg"><span class="lg-d" style="background:' + s.color + '"></span>' +
        '<span class="lg-n">' + esc(s.label) + '</span><span class="lg-v">' + esc(pct(share)) + "</span>" +
        (cr ? delta(share, pShare, { pp: true }) : "") + "</div>";
    });
    h += "</div></div>";

    // ⑥ คอนเทนต์เด่นข้ามช่อง — เฉพาะช่องที่เปิดอยู่
    var all = [];
    order.forEach(function (pk) {
      postsIn(pk, r).forEach(function (p) {
        var er = C.PLATFORMS[pk].er(p);
        if (er != null) all.push({ p: p, pk: pk, er: er });
      });
    });
    all.sort(function (a, b) { return b.er - a.er; });
    h += sec("คอนเทนต์ที่คนมีส่วนร่วมมากที่สุด", "ทุกช่องที่เปิดอยู่",
      "เรียงตาม engagement rate ซึ่งแต่ละช่องคิดคนละสูตร (ดูสูตรได้ในแท็บของช่องนั้น) " +
      "ใช้ดูว่าใบไหนคนตอบสนองดี ไม่ใช่ใช้เทียบข้ามช่องแบบตรงๆ");
    h += '<div class="panel">' + (all.length
      ? '<div class="posts">' + all.slice(0, 3).map(function (x) { return postRow(x.p, x.pk, { showPlatform: true }); }).join("") + "</div>"
      : empty("ไม่มีคอนเทนต์ที่เผยแพร่ในช่วงนี้", "ลองขยายช่วงเวลา")) + "</div>";

    return h;
  }

  /** ทุกวันในช่วง เรียงตามลำดับ — ใช้เป็นแกนเวลาร่วมของทุกช่อง */
  function dateList(r) {
    var out = [], d = parseKey(r.from), end = parseKey(r.to);
    while (d <= end) { out.push(key(d)); d = addDays(d, 1); }
    return out;
  }

  /**
   * กราฟเส้นรายวัน แยกเส้นตามช่อง
   *
   * ⚠️ ทุกช่องต้องวางบนแกนเวลาชุดเดียวกัน — ถ้าปล่อยให้แต่ละช่องใช้จำนวนจุดของตัวเอง
   *    ช่องที่ข้อมูลขาดไปบางวันจะถูกดันให้เลื่อนไปตรงกับวันของช่องอื่น = เส้นเพี้ยนทั้งกราฟ
   * ⚠️ วันที่ไม่มีข้อมูลส่ง null ไม่ใช่ 0 — เส้นจะได้ขาด ไม่ใช่ดิ่งลงพื้นเหมือนยอดตก
   */
  function channelTrend(order, r, valueOf, height) {
    var days = dateList(r);
    var series = [];
    order.forEach(function (pk) {
      var byDate = {};
      dailyIn(pk, r).forEach(function (x) { byDate[x.date] = x; });
      if (!Object.keys(byDate).length) return;
      series.push({
        label: C.PLATFORMS[pk].label, color: C.PLATFORMS[pk].rawColor,
        points: days.map(function (dk) {
          var row = byDate[dk];
          return { y: row ? valueOf(pk, row) : null };
        }),
      });
    });
    if (!series.length) return empty("ไม่มีข้อมูลในช่วงนี้");
    return CH.line({
      labels: days.map(thaiShort), series: series, height: height || 180,
      zeroFloor: true, fmtY: function (v) { return num(v); }, aria: "แนวโน้มรายวันแยกช่อง",
    }) + legendOf(series);
  }

  /** แนวโน้มผู้ติดตามเป็น % เปลี่ยนแปลงสะสมจากวันแรกของช่วง */
  function followerTrend(order, r, height) {
    var days = dateList(r);
    var series = [];
    order.forEach(function (pk) {
      var f = followersIn(pk, r);
      if (!f.length) return;
      var byDate = {};
      f.forEach(function (x) { byDate[x.date] = x.value; });
      var base = f[0].value || 1;
      series.push({
        label: C.PLATFORMS[pk].label, color: C.PLATFORMS[pk].rawColor,
        points: days.map(function (dk) {
          var v = byDate[dk];
          return { y: v == null ? null : ((v - base) / base) * 100 };
        }),
      });
    });
    if (!series.length) return empty("ไม่มีข้อมูลผู้ติดตามในช่วงนี้");
    return CH.line({
      labels: days.map(thaiShort), series: series, height: height || 210,
      unitLeft: "%", aria: "แนวโน้มผู้ติดตาม",
    }) + legendOf(series);
  }

  function legendOf(series) {
    return '<div class="legend row">' + series.map(function (s) {
      return '<div class="lg"><span class="lg-d" style="background:' + s.color + '"></span><span class="lg-n">' +
        esc(s.label) + (s.axisNote ? ' <em>' + esc(s.axisNote) + "</em>" : "") + "</span></div>";
    }).join("") + "</div>";
  }

  /* ── แท็บรายช่อง ─────────────────────────────────────────────────── */

  function renderPlatform(pk) {
    var P = C.PLATFORMS[pk], r = range(), cr = compareRange();
    var a = agg(pk, r), b = cr ? agg(pk, cr) : null;
    var g = growth(pk, r), pg = cr ? growth(pk, cr) : null;
    if (!a) return empty("ไม่มีข้อมูลของ " + P.label + " ในช่วงที่เลือก", "ลองขยายช่วงเวลา หรือเลือกวันที่ใหม่");

    var h = "";

    // ① สรุปของช่อง — รวม metric เฉพาะแพลตฟอร์มไว้ในกริดเดียวกัน
    // ⚠️ เดิมแยกเป็น 2 กริด ทำให้ TikTok เหลือใบ "ดูจนจบ" ลอยเดี่ยวท้ายแถว
    //    รวมเป็นกริดเดียวแล้วสั่งจำนวนคอลัมน์ตามจำนวนใบจริง (--n)
    var cards = [
      { label: "ผู้ติดตาม", value: g ? num(g.end) : null, d: delta(g ? g.end : null, pg ? pg.end : null) },
      { label: "เพิ่มสุทธิในช่วงนี้", value: g ? num(g.net) : null, d: delta(g ? g.net : null, pg ? pg.net : null) },
      { label: P.reachLabel, value: num(a.reach), d: delta(a.reach, b ? b.reach : null) },
      { label: P.erLabel, value: pct(a.er), tip: P.erFormula + " · " + P.erNote, d: delta(a.er, b ? b.er : null, { pp: true }) },
    ];
    P.extras.filter(function (e) { return e.key !== P.reachKey; }).forEach(function (e) {
      cards.push({
        label: e.label, value: fmt(e.fmt, a[e.key]),
        d: delta(a[e.key], b ? b[e.key] : null, { pp: e.fmt === "pct" }),
      });
    });
    h += '<div class="scgrid" style="--n:' + cards.length + '">' +
      cards.map(function (c2) { return card({ label: c2.label, value: c2.value, tip: c2.tip, delta: c2.d }); }).join("") + "</div>";

    // ② กราฟรายวัน — แกนซ้าย views/reach · แกนขวา ER%
    // 🔴 เดิมวาด engagement ดิบบนแกนเดียวกับ views ซึ่งต่างกันหลักร้อยเท่า
    //    เส้น engagement เลยแบนติดพื้นอ่านไม่ได้ — เปลี่ยนเป็น ER% แกนขวาแยก
    var rows = dailyIn(pk, r);
    h += sec(P.reachLabel + "และ engagement rate รายวัน", null,
      "เส้นสีของช่องอ่านแกนซ้าย (" + P.reachLabel + ") · เส้นเทาประอ่านแกนขวา (engagement rate %) " +
      "สองอย่างนี้หน่วยต่างกันหลักร้อยเท่า ถ้าใช้แกนเดียวกันเส้นหนึ่งจะแบนติดพื้นจนดูไม่ออก");
    h += '<div class="panel">';
    if (rows.length) {
      var s1 = { label: P.reachLabel, color: P.rawColor, axis: "left", axisNote: "แกนซ้าย",
                 points: rows.map(function (x) { return { y: x[P.reachKey] }; }) };
      var s2 = { label: "Engagement rate", color: "#6b7280", axis: "right", dash: true, axisNote: "แกนขวา",
                 points: rows.map(function (x) {
                   var base = x[P.reachKey] || 0;
                   // ไม่มีฐาน = ไม่รู้ ไม่ใช่ 0 → ส่ง null ให้เส้นขาด
                   return { y: base ? (C.engagementOf(pk, x) / base) * 100 : null };
                 }) };
      h += CH.line({
        labels: rows.map(function (x) { return thaiShort(x.date); }),
        series: [s1, s2], height: 220, zeroFloor: true, zeroFloorRight: true,
        fmtY: function (v) { return num(v); }, unitRight: "%", aria: "รายวัน",
      }) + legendOf([s1, s2]);
    } else {
      h += empty("ไม่มีข้อมูลรายวันในช่วงนี้");
    }
    h += "</div>";

    // ③ แยกประเภทการมีส่วนร่วม
    var parts = P.parts.map(function (p) { return { key: p.key, label: p.label, value: a[p.key] || 0, color: p.color }; });
    var totalPart = parts.reduce(function (s, p) { return s + p.value; }, 0);
    h += sec("การมีส่วนร่วมแยกประเภท", null, P.erNote);
    h += '<div class="panel">';
    if (totalPart) {
      h += CH.stack(parts) + '<div class="legend row">';
      parts.forEach(function (p) {
        h += '<div class="lg"><span class="lg-d" style="background:' + p.color + '"></span>' +
          '<span class="lg-n">' + esc(p.label) + '</span><span class="lg-v">' + esc(num(p.value)) + "</span>" +
          '<span class="lg-s">' + esc(pct(p.value / totalPart)) + "</span>" +
          delta(p.value, b ? b[p.key] : null) + "</div>";
      });
      h += "</div>";
    } else {
      h += empty("ไม่มีการมีส่วนร่วมในช่วงนี้");
    }
    h += "</div>";

    // ④⑤⑥⑦ คอนเทนต์
    var posts = postsIn(pk, r);
    var withEr = posts.map(function (p) { return { p: p, er: P.er(p) }; }).filter(function (x) { return x.er != null; });
    var now = midnight(new Date());
    var ageOf = function (p) { return Math.round((now - parseKey(p.publishedAt)) / 864e5); };

    h += sec(P.contentWord + "ที่คนมีส่วนร่วมมากที่สุด") + '<div class="panel">' +
      (withEr.length
        ? '<div class="posts">' + withEr.slice().sort(function (x, y) { return y.er - x.er; }).slice(0, 3)
            .map(function (x) { return postRow(x.p, pk); }).join("") + "</div>"
        : empty("ไม่มี" + P.contentWord + "ที่เผยแพร่ในช่วงนี้")) + "</div>";

    var newest = posts.slice().sort(function (x, y) { return x.publishedAt < y.publishedAt ? 1 : -1; }).slice(0, 5);
    h += sec(P.contentWord + "ล่าสุด", null, "ป้าย 'ยังใหม่' ขึ้นกับใบที่เผยแพร่มาไม่ถึง 7 วัน") +
      '<div class="panel">' + (newest.length
        ? '<div class="posts">' + newest.map(function (p) { return postRow(p, pk, { newBadge: true }); }).join("") + "</div>"
        : empty("ไม่มี" + P.contentWord + "ที่เผยแพร่ในช่วงนี้")) + "</div>";

    // ⚠️ ใบที่เพิ่งลงยังไม่ทันมีคนเห็น เอามาจัดอันดับท้ายไม่ได้
    var mature = withEr.filter(function (x) { return ageOf(x.p) >= 7; });
    h += sec(P.contentWord + "ที่ผลตอบรับน้อยที่สุด", "เฉพาะที่ลงมาแล้วเกิน 7 วัน",
      "ไม่นับใบที่เพิ่งลงไม่ถึง 7 วัน เพราะยังไม่ทันมีคนเห็น จะติดอันดับท้ายทุกใบโดยไม่ได้แปลว่าไม่ดี") +
      '<div class="panel">' + (mature.length
        ? '<div class="posts">' + mature.sort(function (x, y) { return x.er - y.er; }).slice(0, 3)
            .map(function (x) { return postRow(x.p, pk); }).join("") + "</div>"
        : empty("ยังไม่มี" + P.contentWord + "ที่ลงเกิน 7 วันในช่วงนี้", "ลองขยายช่วงเวลา")) + "</div>";

    h += sec(P.contentWord + "ทั้งหมดในช่วงที่เลือก", posts.length + " รายการ") +
      '<div class="panel">' + (posts.length ? table(posts, pk) : empty("ไม่มี" + P.contentWord + "ที่เผยแพร่ในช่วงนี้")) + "</div>";

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
    var h = '<div class="tblwrap"><table class="tbl"><thead><tr><th>' + esc(P.contentWord) + "</th>" +
      '<th class="sortable" data-sort="date">วันที่' + caret("date") + "</th>" +
      '<th class="sortable num" data-sort="views">' + esc(P.reachLabel) + caret("views") + "</th>" +
      '<th class="sortable num" data-sort="er">ER' + caret("er") + "</th></tr></thead><tbody>";
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

    h += '<div class="seg" id="cmp">' + ["prev|ช่วงก่อนหน้า", "yoy|ปีก่อน", "none|ไม่เทียบ"].map(function (x) {
      var p = x.split("|");
      return '<button type="button" class="' + (state.compare === p[0] ? "on" : "") + '" data-cmp="' + p[0] + '">' + esc(p[1]) + "</button>";
    }).join("") + "</div>";

    // ชิพเลือกช่อง — มีผลกับหน้าภาพรวมเท่านั้น จึงโชว์เฉพาะตอนอยู่แท็บนั้น
    if (state.tab === "summary") {
      h += '<div class="chips" id="chips">' + C.ORDER.map(function (pk) {
        var P = C.PLATFORMS[pk], on = state.channels[pk];
        return '<button type="button" class="ch' + (on ? " on" : "") + '" data-ch="' + pk + '" ' +
          'aria-pressed="' + (on ? "true" : "false") + '" style="--pc:' + P.rawColor + '">' +
          '<span class="pdot"></span>' + esc(P.label) + "</button>";
      }).join("") + "</div>";

      // กางตัวเลขรายช่องใต้ยอดรวม — ของหน้าภาพรวมเหมือนกัน
      // ⚠️ ไม่ใช้ class .ch — นั่นสงวนไว้ให้ "ชิพเลือกช่อง" เท่านั้น
      //    ปนกันเมื่อไหร่ ตัวนับช่องจะนับปุ่มนี้เป็นช่องที่ 4
      h += '<button type="button" class="bd-btn' + (state.breakdown ? " on" : "") + '" data-bd="1" ' +
        'aria-pressed="' + (state.breakdown ? "true" : "false") + '">' +
        (state.breakdown ? "▾" : "▸") + " แยกช่อง</button>";
    }
    h += "</div>";

    if (state.preset === "custom") {
      h += '<div class="ctrl-row dates"><label>ตั้งแต่ <input type="date" id="d1" value="' + esc(state.start || r.from) + '"></label>' +
        '<label>ถึง <input type="date" id="d2" value="' + esc(state.end || r.to) + '"></label></div>';
    }

    h += '<div class="ctrl-note">' + esc(thaiShort(r.from)) + " – " + esc(thaiShort(r.to)) + " (" + r.days + " วัน)" +
      (cr ? ' <span class="vs">เทียบกับ ' + esc(thaiShort(cr.from)) + " – " + esc(thaiShort(cr.to)) + "</span>"
          : ' <span class="vs">ไม่ได้เทียบกับช่วงไหน</span>') + "</div>";
    return h;
  }

  function renderTabs() {
    return C.TABS.map(function (t) {
      return '<button type="button" class="tab' + (state.tab === t.key ? " on" : "") + '" data-tab="' + t.key + '">' +
        '<span class="ti">' + esc(t.icon) + "</span>" + esc(t.label) + "</button>";
    }).join("");
  }

  function render() {
    document.getElementById("controls").innerHTML = renderControls();
    document.getElementById("tabs").innerHTML = renderTabs();
    var tab = C.TABS.filter(function (t) { return t.key === state.tab; })[0] || C.TABS[0];
    document.getElementById("view").innerHTML = tab.platform ? renderPlatform(tab.platform) : renderSummary();
  }

  /* ── รับคำสั่งจากผู้ใช้ ──────────────────────────────────────────── */

  function onClick(e) {
    var tip = e.target.closest(".tipi");
    if (tip) { showTip(tip); return; }

    var t = e.target.closest("[data-tab],[data-days],[data-cmp],[data-sort],[data-ch],[data-bd]");
    if (!t) return;

    if (t.dataset.tab) { state.tab = t.dataset.tab; render(); return; }

    if (t.dataset.bd) { state.breakdown = !state.breakdown; render(); return; }

    if (t.dataset.ch) {
      var pk = t.dataset.ch;
      // ปิดช่องสุดท้ายไม่ได้ ไม่งั้นหน้าจะว่างเปล่าโดยไม่มีใครเข้าใจว่าทำไม
      var on = activeOrder();
      if (state.channels[pk] && on.length === 1) return;
      state.channels[pk] = !state.channels[pk];
      render(); return;
    }

    if (t.dataset.days) {
      if (t.dataset.days === "custom") {
        var r = range();
        state.start = state.start || r.from;
        state.end = state.end || r.to;
        state.preset = "custom";
      } else state.preset = +t.dataset.days;
      render(); return;
    }

    if (t.dataset.cmp) { state.compare = t.dataset.cmp; render(); return; }

    if (t.dataset.sort) {
      var k = t.dataset.sort;
      if (state.sort.key === k) state.sort.dir *= -1;
      else state.sort = { key: k, dir: -1 };
      render();
    }
  }

  /* คำอธิบายแบบแตะได้ — มือถือไม่มี hover จึงต้องกดแล้วขึ้นกล่อง
     (ใช้ title ควบคู่ไว้ให้เดสก์ท็อปได้ tooltip ของเบราว์เซอร์เองด้วย) */
  function showTip(btn) {
    var old = document.getElementById("tipbox");
    if (old) old.remove();
    if (btn.dataset.open === "1") { btn.dataset.open = ""; return; }
    document.querySelectorAll('.tipi[data-open="1"]').forEach(function (x) { x.dataset.open = ""; });
    btn.dataset.open = "1";
    var box = document.createElement("div");
    box.id = "tipbox";
    box.className = "tipbox";
    box.textContent = btn.dataset.tip;
    btn.insertAdjacentElement("afterend", box);
  }

  function onChange(e) {
    if (e.target.id !== "d1" && e.target.id !== "d2") return;
    state.start = document.getElementById("d1").value;
    state.end = document.getElementById("d2").value;
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
