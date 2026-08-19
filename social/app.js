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

  /* ชุดช่วงเวลาสำเร็จรูป — เรียงจากสั้นไปยาว แล้วปิดท้ายด้วย "กำหนดเอง"
   * ⚠️ ชื่อกับวิธีคิดอยู่คู่กันที่นี่ที่เดียว เพิ่มตัวเลือกใหม่เติมแค่ในลิสต์นี้
   *    (แผงเลือกวันที่ กับ ตัวคำนวณช่วง อ่านจากลิสต์เดียวกัน)
   * ⚠️ "ล่าสุด N วัน" นับรวมวันนี้ด้วย — ให้ตรงกับที่คนอ่านเข้าใจ
   *    ส่วนตัวที่เป็นเดือน/ปี ใช้ขอบเดือน-ปีปฏิทินจริง ไม่ใช่ลบจำนวนวันตายตัว */
  var PRESETS = [
    { key: "today", label: "วันนี้", at: function (t) { return [t, t]; } },
    { key: "yesterday", label: "เมื่อวาน", at: function (t) { var y = addDays(t, -1); return [y, y]; } },
    { key: "7d", label: "7 วันล่าสุด", at: function (t) { return [addDays(t, -6), t]; } },
    { key: "28d", label: "28 วันล่าสุด", at: function (t) { return [addDays(t, -27), t]; } },
    { key: "30d", label: "30 วันล่าสุด", at: function (t) { return [addDays(t, -29), t]; } },
    { key: "90d", label: "90 วันล่าสุด", at: function (t) { return [addDays(t, -89), t]; } },
    { key: "mtd", label: "เดือนนี้ถึงวันนี้", at: function (t) { return [new Date(t.getFullYear(), t.getMonth(), 1), t]; } },
    { key: "lastmonth", label: "เดือนที่แล้ว (ทั้งเดือน)", at: function (t) {
        return [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)]; } },
    { key: "3m", label: "3 เดือนล่าสุด", at: function (t) {
        var a = new Date(t.getTime()); a.setMonth(a.getMonth() - 3); return [addDays(a, 1), t]; } },
    { key: "12m", label: "12 เดือนล่าสุด", at: function (t) {
        var a = new Date(t.getTime()); a.setFullYear(a.getFullYear() - 1); return [addDays(a, 1), t]; } },
    { key: "ytd", label: "ปีนี้ถึงวันนี้", at: function (t) { return [new Date(t.getFullYear(), 0, 1), t]; },
      suffix: function (t) { return String(t.getFullYear()); } },
    { key: "lastyear", label: "ปีที่แล้ว", at: function (t) {
        return [new Date(t.getFullYear() - 1, 0, 1), new Date(t.getFullYear() - 1, 11, 31)]; },
      suffix: function (t) { return String(t.getFullYear() - 1); } },
    { key: "custom", label: "กำหนดเอง…", custom: true },
  ];
  /* ชุด metric ที่สลับดูได้ในกราฟเดียว (แทนการวางกราฟใหญ่เรียงกันหลายอัน)
   * ⚠️ แต่ละตัวคืน "ค่าเป็นรายวันต่อช่อง" — ตัววาดไม่ต้องรู้ว่าเป็น metric อะไร
   *    เพิ่ม metric ใหม่ เติมที่นี่ที่เดียว ชิพกับกราฟตามเอง */
  var METRICS = [
    { key: "followers", label: "ผู้ติดตาม", tipFmt: "num", source: "followers",
      at: function (pk, x) { return x.value; } },
    { key: "reach", label: "ยอดวิว / การเข้าถึง", tipFmt: "num", source: "daily",
      at: function (pk, x) { return x[C.PLATFORMS[pk].reachKey]; } },
    { key: "engagement", label: "การมีส่วนร่วม", tipFmt: "num", source: "daily",
      at: function (pk, x) { return C.engagementOf(pk, x); } },
    { key: "er", label: "Engagement rate", tipFmt: "pctnum", unit: "%", source: "daily",
      at: function (pk, x) {
        var base = x[C.PLATFORMS[pk].reachKey] || 0;
        return base ? (C.engagementOf(pk, x) / base) * 100 : null;   // ไม่มีฐาน = ไม่รู้ ไม่ใช่ 0
      } },
  ];
  function metricOf(k) { return METRICS.filter(function (m) { return m.key === k; })[0] || METRICS[0]; }

  function presetOf(k) { return PRESETS.filter(function (p) { return p.key === k; })[0] || PRESETS[4]; }
  /** ชื่อที่โชว์บนปุ่ม — ตัวที่ผูกกับปีจะต่อเลขปีจริงให้ด้วย */
  function presetLabel(p, t) { return p.label + (p.suffix ? " (" + p.suffix(t) + ")" : ""); }

  /* 🔴 กติกา delta ใช้ร่วมทั้งแอป: ฐานต่ำกว่านี้ให้บอกเป็น "จำนวนจริง" ไม่ใช่ %
   *    เปอร์เซ็นต์บนฐานเลขหลักสิบ/ร้อยหลอกตา — เคสจริงจากรอบรีวิว:
   *    Facebook เพิ่มสุทธิ 37 คน แล้วขึ้นว่า ▲23.3% ซึ่งอ่านแล้วเข้าใจผิดว่าโตเยอะ
   *    ⚠️ ห้ามคิด % เองที่อื่น ให้เรียก delta() ตัวนี้เท่านั้น */
  var DELTA_MIN_BASE = 1000;

  var state = {
    tab: "summary",
    preset: "30d",       // คีย์จาก PRESETS
    start: null,
    end: null,
    compare: "prev",     // prev | yoy | none
    sort: { key: "date", dir: -1 },
    // กางการ์ดสรุปให้เห็นตัวเลขรายช่อง — ของหน้าภาพรวมเท่านั้น
    breakdown: false,
    // ชิพเลือกช่องของหน้าภาพรวม — ไม่ต้องข้ามไปมีผลกับแท็บรายช่อง
    channels: { youtube: true, tiktok: true, facebook: true },
    // เส้นที่ผู้ใช้กดปิดจาก legend — แยกตามกราฟ { chartId: [index,...] }
    // ⚠️ ต้องอยู่ใน state ไม่ใช่ใน DOM เพราะ render() สร้าง HTML ใหม่ทั้งก้อน
    hidden: {},
    // แผงเลือกช่วงเวลาเปิดอยู่ไหม
    periodOpen: false,
    // metric ที่กำลังดูอยู่ในกราฟหลักของหน้าภาพรวม
    metric: "followers",
  };

  /* ── วันที่ ──────────────────────────────────────────────────────── */

  function midnight(d) { var x = new Date(d.getTime()); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, k) { var x = new Date(d.getTime()); x.setDate(x.getDate() + k); return x; }
  function key(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function parseKey(s) { var p = String(s).split("-"); return midnight(new Date(+p[0], +p[1] - 1, +p[2])); }
  var TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  function thaiShort(k) {
    var d = parseKey(k);
    return d.getDate() + " " + TH_MON[d.getMonth()];
  }
  function thaiFull(k) {
    var d = parseKey(k);
    return d.getDate() + " " + TH_MON[d.getMonth()] + " " + d.getFullYear();
  }

  /**
   * ข้อความช่วงวันที่
   * ⚠️ ต้องมีปีกำกับเมื่อช่วงข้ามปี หรือไม่ใช่ปีปัจจุบัน
   *    ไม่งั้น "12 เดือนล่าสุด" จะขึ้นว่า "20 ส.ค. – 19 ส.ค." ซึ่งอ่านเหมือนช่วงสั้นๆ
   */
  function rangeText(from, to) {
    var a = parseKey(from), b = parseKey(to), now = new Date().getFullYear();
    var needYear = a.getFullYear() !== b.getFullYear() || a.getFullYear() !== now;
    return needYear ? thaiFull(from) + " – " + thaiFull(to) : thaiShort(from) + " – " + thaiShort(to);
  }

  function range() {
    var t = midnight(new Date());
    var a, b;
    if (state.preset === "custom" && state.start && state.end) {
      a = parseKey(state.start); b = parseKey(state.end);
      if (a > b) { var sw = a; a = b; b = sw; }
    } else {
      var p = presetOf(state.preset);
      var pair = (p.custom ? presetOf("30d") : p).at(t);
      a = midnight(pair[0]); b = midnight(pair[1]);
    }
    // 🔴 ไม่มีข้อมูลของอนาคต — ตัดปลายไว้ที่วันนี้เสมอ
    if (b > t) b = t;
    if (a > b) a = b;
    return { from: key(a), to: key(b), days: Math.round((b - a) / 864e5) + 1 };
  }

  /* ตัวเลือกช่วงเทียบ — ชื่อกับวิธีคิดอยู่ที่เดียวกัน เพิ่มตัวใหม่เติมที่นี่ */
  var COMPARE = [
    { key: "prev", label: "ช่วงก่อนหน้า" },
    { key: "lastmonth", label: "เดือนที่แล้ว" },
    { key: "yoy", label: "ปีก่อน" },
    { key: "none", label: "ไม่เทียบ" },
  ];

  function compareRange() {
    if (state.compare === "none") return null;
    var r = range(), a = parseKey(r.from), b = parseKey(r.to);

    // ⚠️ ถอยด้วยเดือน/ปีปฏิทิน ไม่ใช่ลบจำนวนวัน — เดือนยาวไม่เท่ากัน
    //    ถ้าลบ 30 วันตายตัว "เดือนที่แล้ว" ของเดือน ก.พ. จะเลื่อนไปคนละช่วงกับที่คนเข้าใจ
    if (state.compare === "yoy" || state.compare === "lastmonth") {
      var back = function (d) {
        var x = new Date(d.getTime());
        if (state.compare === "yoy") x.setFullYear(x.getFullYear() - 1);
        else x.setMonth(x.getMonth() - 1);
        return x;
      };
      return { from: key(back(a)), to: key(back(b)), days: r.days };
    }

    var pb = addDays(a, -1), pa = addDays(pb, -(r.days - 1));
    return { from: key(pa), to: key(pb), days: r.days };
  }

  /** ชื่อของช่วงเทียบ — ใช้ทั้งบนแถบควบคุมและใน tooltip ของทุก delta */
  function compareName() {
    var c = COMPARE.filter(function (x) { return x.key === state.compare; })[0];
    return c ? c.label : "";
  }
  function compareText() {
    var cr = compareRange();
    if (!cr) return "";
    return compareName() + " (" + rangeText(cr.from, cr.to) + ")";
  }

  /** ช่องที่เปิดอยู่ — หน้าภาพรวมทุกส่วนต้องอ่านจากตัวนี้ ห้ามใช้ C.ORDER ตรงๆ */
  /* ── ช่องที่ยังไม่ได้เชื่อมต่อ ───────────────────────────────────────
   * ⚠️ "ยังไม่ได้เชื่อม" กับ "เชื่อมแล้วแต่ช่วงนี้ไม่มีข้อมูล" คนละเรื่องกัน
   *    ถ้าขึ้นข้อความเดียวกัน เจ้าของจะไล่หาสาเหตุผิดทาง (ขยายช่วงเวลาเท่าไหร่ก็ไม่มา)
   *    ช่องที่ยังไม่เชื่อมจึงบอกตรงๆ ว่าต้องใส่ค่าอะไรถึงจะใช้ได้ */
  function statusOf(pk) {
    var st = (DATA.platforms[pk] || {}).status;
    return st || { connected: true, need: [] };
  }
  function isOn(pk) { return statusOf(pk).connected !== false; }

  /** ช่องที่ผู้ใช้เปิดไว้ "และ" เชื่อมต่อแล้ว — ยอดรวมทุกใบนับจากชุดนี้ */
  function activeOrder() {
    return C.ORDER.filter(function (pk) { return state.channels[pk] && isOn(pk); });
  }

  /** กล่องบอกว่าช่องนี้ยังไม่ได้เชื่อม — เป็นสถานะที่ตั้งใจ ไม่ใช่ข้อผิดพลาด */
  function notConnected(pk) {
    var P = C.PLATFORMS[pk], need = statusOf(pk).need || [];
    return '<div class="setup"><div class="setup-i" style="background:' + P.rawColor + '">' +
      esc(P.label.charAt(0)) + "</div>" +
      '<div class="setup-b"><div class="setup-t">ยังไม่ได้เชื่อมต่อ ' + esc(P.label) + "</div>" +
      '<p class="setup-p">ตัวเลขของช่องนี้จะขึ้นเองทันทีที่เชื่อมต่อเสร็จ ระหว่างนี้ยอดรวมบนหน้าภาพรวม' +
      "<b>ไม่ได้นับช่องนี้</b> จึงไม่ใช่ว่าตัวเลขหาย</p>" +
      (need.length
        ? '<div class="setup-n"><span class="setup-nl">ต้องใส่ค่าใน Cloudflare ก่อน</span>' +
          need.map(function (k) { return "<code>" + esc(k) + "</code>"; }).join("") + "</div>"
        : "") +
      '<p class="setup-p sm">ใส่เป็น Secret ทั้ง Production และ Preview แล้วสั่ง Retry deployment</p>' +
      "</div></div>";
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

    // ⚠️ ทุกป้ายต้องบอกได้ว่าเทียบกับช่วงไหน ไม่งั้นเห็น ▲12% แล้วไม่รู้ว่าเทียบกับอะไร
    var vs = ' title="เทียบกับ' + esc(compareText()) + '"';

    // อัตราส่วน (ER, completion rate) → เทียบเป็น percentage point เสมอ
    if (opt.pp) {
      var d = (cur - prev) * 100;
      var dTxt = Math.abs(d).toFixed(1);
      var dir0 = dirOf(dTxt, d);
      return '<span class="dlt ' + dir0 + '"' + vs + ">" + arrow(dir0) + " " + dTxt + " pt</span>";
    }

    var diff = cur - prev;

    // 🔴 ฐานเล็ก → จำนวนจริง (เช่น +7) เพราะ % บนฐานหลักสิบหลักร้อยหลอกตา
    if (Math.abs(prev) < DELTA_MIN_BASE) {
      var mag = Math.abs(diff);
      var txt = mag < 1 ? mag.toFixed(1) : String(Math.round(mag));
      var dirA = dirOf(txt, diff);
      return '<span class="dlt ' + dirA + '" title="เทียบกับ' + esc(compareText()) +
        " · บอกเป็นจำนวนจริงเพราะฐานน้อยกว่า " + DELTA_BASE_LABEL + '">' +
        arrow(dirA) + " " + (dirA === "down" ? "−" : dirA === "up" ? "+" : "") +
        Number(txt).toLocaleString("th-TH") + "</span>";
    }

    if (!prev) return '<span class="dlt none">ไม่มีข้อมูลเทียบ</span>';
    var rr = (diff / Math.abs(prev)) * 100;
    var rTxt = Math.abs(rr).toFixed(1);
    var dir = dirOf(rTxt, rr);
    return '<span class="dlt ' + dir + '"' + vs + ">" + arrow(dir) + " " + rTxt + "%</span>";
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
    /* ⚠️ ลิงก์มาจาก post.url ของข้อมูลตรงๆ — ของจริงคือ URL โพสต์บนแพลตฟอร์ม
       ถ้าไม่มีลิงก์ ให้เป็นการ์ดเฉยๆ ไม่ใช่ <a> ที่กดแล้วไม่ไปไหน (หลอกว่ากดได้) */
    var live = p.url && p.url !== "#";
    var tag = live ? "a" : "div";
    var attr = live ? ' href="' + esc(p.url) + '" target="_blank" rel="noopener"' : "";
    return "<" + tag + ' class="post' + (live ? "" : " nolink") + '"' + attr + '>' +
      '<img src="' + esc(p.thumb) + '" alt="" loading="lazy">' +
      '<div class="post-b"><div class="post-t">' + esc(p.title) + badge +
      (live ? ' <span class="ext">↗</span>' : "") + "</div>" +
      '<div class="post-m">' +
      (opts.showPlatform ? '<span class="chip" style="border-color:' + P.rawColor + '">' + esc(P.label) + "</span>" : "") +
      "<span>" + esc(P.reachLabel) + " " + esc(num(reach)) + "</span>" +
      "<span>ER " + esc(pct(P.er(p)) || "—") + "</span>" +
      "<span>" + esc(thaiShort(p.publishedAt)) + "</span>" +
      "</div></div></" + tag + ">";
  }

  /* ── กล่องสรุปให้อ่าน (แบบ Insights ของ GA4) ─────────────────────────
   * 🔴 เป็น "กฎตายตัว" ไม่ใช่ AI — อ่านจากตัวเลขชุดเดียวกับที่วาดบนหน้า
   *    จึงอธิบายได้เสมอว่าทำไมถึงขึ้นข้อความนี้ และเขียนเทสต์คุมได้
   * ⚠️ ข้อที่ต้องเทียบกับช่วงก่อนหน้า จะไม่ขึ้นเลยถ้าผู้ใช้เลือก "ไม่เทียบ"
   *    ห้ามเดาแทน — ไม่มีของให้เทียบ = ไม่มีอะไรจะบอก
   * ⚠️ ฐานเล็กห้ามคิดเป็น % (จาก 2 เป็น 4 = +100% ซึ่งไม่มีความหมาย) */
  var INSIGHT_MIN_BASE = 500;

  function insights(order, r, cr, cur, prev) {
    var out = [];

    // ⓪ ภาพรวมก่อน: การมองเห็นรวมขยับไปทางไหน
    if (cr) {
      var tc = 0, tp = 0;
      order.forEach(function (pk) {
        if (cur[pk]) tc += cur[pk].reach;
        if (prev[pk]) tp += prev[pk].reach;
      });
      if (tp >= INSIGHT_MIN_BASE) {
        var tch = (tc - tp) / tp;
        out.push(Math.abs(tch) < 0.05
          ? { tone: "flat", text: "การมองเห็นรวมทรงตัว เปลี่ยนจากช่วงก่อนหน้าไม่ถึง 5%" }
          : {
              tone: tch > 0 ? "up" : "down",
              text: "การมองเห็นรวม" + (tch > 0 ? "เพิ่มขึ้น " : "ลดลง ") + Math.round(Math.abs(tch) * 100) +
                "% เทียบกับ" + compareText(),
            });
      }
    }

    // ① ช่องที่การมองเห็นขยับแรงที่สุด (บวกหรือลบก็ได้)
    if (cr) {
      var mv = null;
      order.forEach(function (pk) {
        var a = cur[pk], b = prev[pk];
        if (!a || !b || b.reach < INSIGHT_MIN_BASE) return;
        var ch = (a.reach - b.reach) / b.reach;
        if (!mv || Math.abs(ch) > Math.abs(mv.ch)) mv = { pk: pk, ch: ch };
      });
      if (mv && Math.abs(mv.ch) >= 0.1) {
        out.push({
          tone: mv.ch > 0 ? "up" : "down",
          text: C.PLATFORMS[mv.pk].label + " เปลี่ยนแปลงมากที่สุด — " +
            C.PLATFORMS[mv.pk].reachLabel + (mv.ch > 0 ? "เพิ่มขึ้น " : "ลดลง ") +
            Math.round(Math.abs(mv.ch) * 100) + "% เทียบกับช่วงก่อนหน้า",
        });
      }
    }

    // ② ช่องที่คนมีส่วนร่วมดีที่สุดในช่วงนี้ (ER ของช่องนั้นเทียบกับตัวเอง)
    var bestEr = null;
    order.forEach(function (pk) {
      var a = cur[pk];
      if (!a || a.er == null || !a.reach) return;
      if (!bestEr || a.er > bestEr.er) bestEr = { pk: pk, er: a.er };
    });
    if (bestEr) {
      out.push({
        tone: "flat",
        text: C.PLATFORMS[bestEr.pk].label + " มีสัดส่วนคนมีส่วนร่วมสูงสุดที่ " + pct(bestEr.er) +
          " — แต่ละช่องคิด ER คนละสูตร ใช้ดูว่าช่องไหนคนตอบสนองดีเทียบกับคนที่เห็น",
      });
    }

    // ③ ช่องที่ผู้ติดตามลดสุทธิ — เตือนเสมอ ไม่ต้องรอให้เทียบช่วง
    var losing = order.filter(function (pk) {
      var g = growth(pk, r);
      return g && g.net < 0;
    });
    if (losing.length) {
      out.push({
        tone: "down",
        text: losing.map(function (pk) { return C.PLATFORMS[pk].label; }).join(" · ") +
          " ผู้ติดตามลดลงสุทธิในช่วงนี้ — ดูกราฟแท่งเพิ่ม/หาย ว่าคนเลิกติดตามเยอะขึ้น หรือคนใหม่เข้ามาน้อยลง",
      });
    }

    // ④ ช่องที่ไม่ได้โพสต์เลยในช่วงนี้
    var quiet = order.filter(function (pk) { return !postsIn(pk, r).length; });
    if (quiet.length && quiet.length < order.length) {
      out.push({
        tone: "flat",
        text: quiet.map(function (pk) { return C.PLATFORMS[pk].label; }).join(" · ") +
          " ไม่มีคอนเทนต์เผยแพร่ในช่วงนี้ ตัวเลขที่เห็นจึงมาจากโพสต์เก่า",
      });
    }

    if (!out.length) return "";
    var ICON = { up: "▲", down: "▼", flat: "•" };
    return '<div class="insight"><div class="insight-h">สิ่งที่เห็นจากตัวเลขชุดนี้</div><ul class="insight-l">' +
      out.slice(0, 3).map(function (x) {
        return '<li class="ins-' + x.tone + '"><span class="ins-i">' + ICON[x.tone] + "</span>" +
          esc(x.text) + "</li>";
      }).join("") + "</ul></div>";
  }

  /* ── แท็บภาพรวม ──────────────────────────────────────────────────── */

  function renderSummary() {
    var order = activeOrder();
    /* ⚠️ "ไม่มีช่องเปิดอยู่" มีได้ 2 สาเหตุ ต้องแยกให้ออก
       ปิดชิพเอง = บอกให้กดกลับ · ยังไม่ได้เชื่อมสักช่อง = บอกวิธีเชื่อม */
    if (!order.length) {
      var offAll = C.ORDER.filter(function (pk) { return !isOn(pk); });
      if (offAll.length === C.ORDER.length) {
        return '<div class="setups">' + offAll.map(notConnected).join("") + "</div>";
      }
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

    /* ⚠️ ป้าย "รวม" ต้องบอกว่ารวมกี่ช่อง — ชิพเลือกช่องปิดได้ทีละช่อง
       ตัวเลขจึงเปลี่ยนได้โดยที่ป้ายยังเขียนว่า "รวม" เหมือนเดิม (เข้าใจผิดว่าตัวเลขผิด) */
    var nch = " (" + order.length + " ช่อง)";

    h += '<div class="grid4">' +
      card({ label: "ผู้ติดตามรวม" + nch, value: num(tf), delta: delta(tf, cr ? pf : null),
             extra: bd(function (a, b, pk) {
               var g = growth(pk, r), pg2 = cr ? growth(pk, cr) : null;
               return { text: g ? num(g.end) : null, cur: g ? g.end : null, prev: pg2 ? pg2.end : null };
             }) }) +
      card({ label: "การมองเห็นรวม" + nch, value: num(tv),
             tip: "YouTube และ TikTok นับเป็นยอดวิว · Facebook นับเป็นการเข้าถึง (จำนวนคนที่เห็นโพสต์) สองอย่างนี้ไม่ใช่หน่วยเดียวกัน แต่รวมไว้เพื่อดูภาพกว้าง",
             delta: delta(tv, cr ? pv : null),
             extra: bd(function (a, b) {
               return { text: a ? num(a.reach) : null, cur: a ? a.reach : null, prev: b ? b.reach : null };
             }) }) +
      card({ label: "การมีส่วนร่วมรวม" + nch, value: num(te),
             tip: "ไลก์ + คอมเมนต์ + แชร์ ตามที่แต่ละช่องนับได้ · YouTube ไม่มีตัวเลขแชร์ให้",
             delta: delta(te, cr ? pe : null),
             extra: bd(function (a, b) {
               return { text: a ? num(a.engagement) : null, cur: a ? a.engagement : null, prev: b ? b.engagement : null };
             }) }) +
      card({ label: "Engagement rate รวม" + nch, value: pct(erNow),
             tip: "การมีส่วนร่วมรวม ÷ การมองเห็นรวม ของช่องที่เปิดอยู่ · ค่ารายช่องคิดด้วยสูตรของช่องนั้นเอง จึงเทียบข้ามช่องตรงๆ ไม่ได้",
             delta: delta(erNow, cr ? erPrev : null, { pp: true }),
             extra: bd(function (a, b) {
               return { text: a ? pct(a.er) : null, cur: a ? a.er : null, prev: b ? b.er : null };
             }, { pp: true }) }) +
      "</div>";

    // ①b กล่องสรุปให้อ่าน — วางใต้ตัวเลขรวม ก่อนกราฟ (เหมือน Insights ของ GA4)
    h += insights(order, r, cr, cur, prev);

    /* ①c ช่องที่ยังไม่ได้เชื่อม — บอกไว้ตรงนี้ให้เห็นคู่กับยอดรวม
       ไม่งั้นเจ้าของจะอ่านยอดรวมโดยไม่รู้ว่ามีช่องที่ไม่ได้ถูกนับ */
    var offList = C.ORDER.filter(function (pk) { return !isOn(pk); });
    if (offList.length) {
      h += '<div class="offnote">ยอดรวมข้างบนยังไม่ได้นับ ' +
        offList.map(function (pk) {
          return '<button type="button" class="offlink" data-tab="' + esc(pk) + '">' +
            esc(C.PLATFORMS[pk].label) + "</button>";
        }).join(" · ") + " เพราะยังไม่ได้เชื่อมต่อ</div>";
    }

    /* ② แนวโน้ม — กราฟเดียวสลับ metric ได้ คู่กับแท่งผู้ติดตามเพิ่ม/หาย
     * 🔴 เดิมวางกราฟใหญ่ 3 อันเรียงกัน หน้ายาวมากและอ่านทีละอันไม่ได้เทียบอะไร
     *    ยุบเหลืออันเดียวแล้วสลับด้วยชิพ — หน้าสั้นลงเกินครึ่ง
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
        sec("แนวโน้มรายวัน", null,
          "เส้นดำคือผลรวมของทุกช่องที่เปิดอยู่ · เส้นสีคือรายช่อง — กดที่ป้ายใต้กราฟเพื่อซ่อน/แสดงเส้นได้ " +
          "แกนจะขยายตามเส้นที่เหลือ ทำให้เห็นรูปทรงของช่องเดียวชัดขึ้น · เอาเมาส์ชี้เพื่ออ่านตัวเลขรายวัน") +
        '<div class="panel">' +
          '<div class="mchips">' + METRICS.map(function (mm) {
            return '<button type="button" class="mchip' + (state.metric === mm.key ? " on" : "") +
              '" data-metric="' + mm.key + '">' + esc(mm.label) + "</button>";
          }).join("") + "</div>" +
          metricTrend(order, r, state.metric, 196, "sum-" + state.metric) +
        "</div>" +
      "</div>" +
      '<div class="duo-c">' +
        sec("ผู้ติดตามที่เพิ่มและที่หายไป", null,
          "แท่งแดงยื่นซ้ายคือคนที่เลิกติดตาม แท่งเขียวยื่นขวาคือคนที่เพิ่งติดตาม ทุกช่องใช้มาตราส่วนเดียวกัน " +
          "ยอดสุทธิเท่ากันไม่ได้แปลว่าเหมือนกัน — ได้ 500 เสีย 480 คนละเรื่องกับ ได้ 30 เสีย 10") +
        '<div class="panel">' + (glRows.length ? CH.diverging(glRows) : empty("ไม่มีข้อมูลผู้ติดตามในช่วงนี้")) + "</div>" +
      "</div>" +
      "</div>";

    // ③ ตารางเทียบรายช่อง (เดิมเป็นการ์ด 3 ใบ)
    h += sec("ผลงานรายช่อง", null,
      "แต่ละช่องวัดคนละหน่วย: YouTube/TikTok เป็นยอดวิว · Facebook เป็นการเข้าถึง " +
      "ตัวเลขในแถวเดียวกันจึงเทียบขนาดกันตรงๆ ไม่ได้ ใช้ดูทิศทางของแต่ละช่องแทน");
    h += '<div class="panel"><div class="tblwrap"><table class="tbl cmp"><thead><tr><th>ตัวชี้วัด</th>' +
      order.map(function (pk) {
        var P = C.PLATFORMS[pk];
        /* ⚠️ หัวคอลัมน์กดได้ = ทางลัดไปแท็บของช่องนั้น (drill-down)
           ต้องเป็น <button> จริง ไม่ใช่ <th> ที่ผูก onclick — คีย์บอร์ดกับ screen reader ต้องใช้ได้ */
        return '<th class="num"><button type="button" class="drill" data-tab="' + esc(pk) + '" ' +
          'title="ดูรายละเอียดของ' + esc(P.label) + '"><span class="pdot" style="background:' +
          P.rawColor + '"></span> ' + esc(P.label) + ' <span class="drill-a">›</span></button></th>';
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

    /* ⑥ คอนเทนต์เด่น — 2 อันดับวางคู่กัน: คนมีส่วนร่วมมากสุด / คนดูมากสุด
     * ⚠️ หยิบ "ที่ดีที่สุดของแต่ละช่อง" ไม่เอาทุกช่องมาเรียงรวมกัน
     *    เพราะ ER คิดคนละสูตร ช่องที่นับแชร์ด้วยจะกวาดอันดับไปหมด (เจอจริงตอนรีวิว)
     *    วิธีนี้ได้ทั้งการเทียบข้ามช่องและหน้าที่ไม่ยาว */
    function bestList(rank) {
      var rows = order.map(function (pk) {
        var P = C.PLATFORMS[pk];
        var best = postsIn(pk, r)
          .map(function (p) { return { p: p, v: rank === "er" ? P.er(p) : (p[P.reachKey] || 0) }; })
          .filter(function (x) { return x.v != null; })
          .sort(function (x, y) { return y.v - x.v; })[0];
        return { pk: pk, best: best };
      });
      if (!rows.some(function (x) { return x.best; })) {
        return empty("ไม่มีคอนเทนต์ที่เผยแพร่ในช่วงนี้", "ลองขยายช่วงเวลา");
      }
      /* ⚠️ แยกเป็นกล่องต่อช่อง ไม่ใช่ลิสต์รวมที่ติดป้ายช่องไว้ในแต่ละใบ
         เจ้าของสั่งไว้ตั้งแต่รอบรีวิว: ต้องเห็นเป็น 3 ช่องแยกกันชัดๆ
         ⚠️ ช่องที่ไม่มีคอนเทนต์ในช่วงนี้ ยังต้องมีกล่องอยู่ (บอกว่าไม่มี)
            ซ่อนกล่องทิ้ง = ดูเหมือนช่องนั้นไม่มีอยู่ */
      return '<div class="tcards">' + rows.map(function (x) {
        var P = C.PLATFORMS[x.pk];
        return '<div class="tcard"><div class="tcard-h" style="--pc:' + P.rawColor + '">' +
          '<span class="pdot"></span>' + esc(P.label) + "</div>" +
          '<div class="tcard-b">' +
          (x.best
            ? postRow(x.best.p, x.pk)
            : '<div class="tcard-none">ไม่มี' + esc(P.contentWord) + "ที่เผยแพร่ในช่วงนี้</div>") +
          "</div></div>";
      }).join("") + "</div>";
    }

    h += '<div class="duo">' +
      '<div class="duo-c">' +
        sec("คนมีส่วนร่วมมากที่สุด", "ที่ดีที่สุดของแต่ละช่อง",
          "เรียงตาม engagement rate ซึ่งแต่ละช่องคิดคนละสูตร จึงหยิบมาช่องละใบ ไม่เอามาเรียงรวมกัน · กดเพื่อเปิดโพสต์จริง") +
        '<div class="panel">' + bestList("er") + "</div>" +
      "</div>" +
      '<div class="duo-c">' +
        sec("คนดูมากที่สุด", "ที่ดีที่สุดของแต่ละช่อง",
          "เรียงตามยอดวิว (Facebook ใช้การเข้าถึง) · เป็นคนละอันดับกับฝั่งซ้าย เพราะใบที่คนดูเยอะไม่ได้แปลว่าคนมีส่วนร่วมเยอะ") +
        '<div class="panel">' + bestList("reach") + "</div>" +
      "</div>" +
      "</div>";

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
  /**
   * กราฟแนวโน้มตัวเดียว สลับ metric ได้
   * 🔴 เส้นแรกคือ "รวมทุกช่อง" — เจ้าของแจ้งว่าเส้นรายช่องอย่างเดียวดูนิ่งเกินไป
   *    เส้นรวมขยับชัดกว่าเพราะบวกการเปลี่ยนแปลงของทุกช่องเข้าด้วยกัน
   * ⚠️ Engagement rate รวม ต้องคิดจาก (การมีส่วนร่วมรวม ÷ การมองเห็นรวม)
   *    ห้ามเอา ER ของแต่ละช่องมาเฉลี่ยกัน — ช่องเล็กจะถ่วงผลเท่าช่องใหญ่ ซึ่งผิด
   */
  function metricTrend(order, r, mk, height, id) {
    var m = metricOf(mk), days = dateList(r), series = [];

    // ⚠️ ทำตารางค้นหาก่อนวน ไม่งั้นเป็นการค้นซ้อนกัน (วัน × ช่อง × แถว) ช่วง 12 เดือนจะอืดชัดเจน
    var lut = {};
    order.forEach(function (pk) {
      var mm = {};
      (m.source === "followers" ? followersIn(pk, r) : dailyIn(pk, r))
        .forEach(function (x) { mm[x.date] = x; });
      lut[pk] = mm;
    });
    var dayLut = {};
    order.forEach(function (pk) {
      var mm = {};
      dailyIn(pk, r).forEach(function (x) { mm[x.date] = x; });
      dayLut[pk] = mm;
    });

    if (order.length > 1) {
      var tot = days.map(function (dk) {
        if (m.key === "er") {
          var eng = 0, base = 0, seen = false;
          order.forEach(function (pk) {
            var row = dayLut[pk][dk];
            if (!row) return;
            seen = true;
            eng += C.engagementOf(pk, row);
            base += row[C.PLATFORMS[pk].reachKey] || 0;
          });
          return { y: !seen || !base ? null : (eng / base) * 100 };
        }
        var sum = 0, any = false;
        order.forEach(function (pk) {
          var row = lut[pk][dk];
          if (!row) return;
          var v = m.at(pk, row);
          if (v == null) return;
          any = true; sum += v;
        });
        return { y: any ? sum : null };
      });
      series.push({ label: "รวมทุกช่อง", color: "#111827", tipFmt: m.tipFmt, points: tot });
    }

    order.forEach(function (pk) {
      var byDate = lut[pk];
      if (!Object.keys(byDate).length) return;
      series.push({
        label: C.PLATFORMS[pk].label, color: C.PLATFORMS[pk].rawColor, tipFmt: m.tipFmt,
        points: days.map(function (dk) {
          var row = byDate[dk];
          return { y: row ? m.at(pk, row) : null };
        }),
      });
    });
    if (!series.length) return empty("ไม่มีข้อมูลในช่วงนี้");
    return CH.line({
      id: id, hidden: hiddenOf(id),
      labels: days.map(thaiShort), series: series, height: height || 200,
      // ⚠️ ผู้ติดตามห้ามบังคับให้เริ่มที่ 0 — เส้นจะไปกองอยู่บนสุดจนดูไม่ออกว่าขยับ
      zeroFloor: m.key !== "followers",
      fmtY: m.unit === "%" ? null : function (v) { return num(v); },
      unitLeft: m.unit || "", aria: "แนวโน้ม" + m.label,
    }) + legendOf(series, id);
  }

  /**
   * แนวโน้มผู้ติดตาม — จำนวนคนจริง
   * 🔴 เคยแสดงเป็น % เปลี่ยนแปลง แต่เจ้าของขอเป็นจำนวนผู้ติดตามตรงๆ (17 ส.ค. 2026)
   * ⚠️ ข้อแลก: ฐานของแต่ละช่องต่างกันหลักเท่า พอวาดรวมกันเส้นจะดูแบนเพราะ
   *    การขยับรายวันเล็กมากเทียบกับตัวเลขหลักหมื่น-แสน
   *    → แก้ด้วยการกดปิดเส้นอื่นจาก legend แล้วแกนจะขยายตามช่องที่เหลือเอง
   *    (ขอบเขตแกนคิดจากเส้นที่ยังเปิดอยู่เท่านั้น — ดู charts.js)
   */
  function followerTrend(order, r, height, id) {
    var days = dateList(r);
    var series = [];
    order.forEach(function (pk) {
      var f = followersIn(pk, r);
      if (!f.length) return;
      var byDate = {};
      f.forEach(function (x) { byDate[x.date] = x.value; });
      series.push({
        label: C.PLATFORMS[pk].label, color: C.PLATFORMS[pk].rawColor,
        points: days.map(function (dk) {
          var v = byDate[dk];
          return { y: v == null ? null : v };
        }),
      });
    });
    if (!series.length) return empty("ไม่มีข้อมูลผู้ติดตามในช่วงนี้");
    return CH.line({
      id: id, hidden: hiddenOf(id),
      labels: days.map(thaiShort), series: series, height: height || 210,
      fmtY: function (v) { return num(v); }, aria: "แนวโน้มผู้ติดตาม",
    }) + legendOf(series, id);
  }

  /** เส้นที่ถูกกดปิดของกราฟนั้น */
  function hiddenOf(id) { return state.hidden[id] || []; }

  /**
   * legend ที่กดเปิด/ปิดเส้นได้
   * ⚠️ ปิดแล้วต้องยังเห็นปุ่มอยู่ (แค่จางลง) ไม่ใช่หายไป — ไม่งั้นกดกลับไม่ได้
   */
  function legendOf(series, id) {
    var hid = hiddenOf(id);
    return '<div class="legend row">' + series.map(function (s, i) {
      var off = hid.indexOf(i) >= 0;
      return '<button type="button" class="lg lg-btn' + (off ? " off" : "") + '" data-lg="' + esc(id) + ":" + i + '" ' +
        'aria-pressed="' + (off ? "false" : "true") + '" title="กดเพื่อ' + (off ? "แสดง" : "ซ่อน") + "เส้นนี้\">" +
        '<span class="lg-d" style="background:' + s.color + '"></span><span class="lg-n">' +
        esc(s.label) + (s.axisNote ? ' <em>' + esc(s.axisNote) + "</em>" : "") + "</span></button>";
    }).join("") + "</div>";
  }

  /* ── แท็บรายช่อง ─────────────────────────────────────────────────── */

  function renderPlatform(pk) {
    if (!isOn(pk)) return notConnected(pk);

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

    /* ② กราฟรายวัน — แยกเป็น 2 กราฟ (เจ้าของสั่ง 19 ส.ค. 2026)
     * 🔴 เดิมเป็นกราฟเดียวแกนคู่: ยอดวิวอ่านแกนซ้าย ER อ่านแกนขวา
     *    ปัญหาคือ 2 เส้นตัดกันไปมาโดยที่ "จุดตัด" ไม่มีความหมายอะไรเลย
     *    (คนละหน่วย คนละแกน) ตาอ่านแล้วเข้าใจว่าเส้นแซงกัน ทั้งที่เทียบกันไม่ได้
     * ⚠️ แยกแล้วต้องใช้แกนเวลาชุดเดียวกันทั้ง 2 กราฟ — วันที่ตรงกันตามแนวตั้ง
     *    ไม่งั้นแยกแล้วยิ่งอ่านยากกว่าเดิม
     * ⚠️ กราฟ ER ห้ามกดพื้นให้เป็น 0 — ความน่าสนใจอยู่ในช่วงแคบ (5–11%)
     *    ลากถึง 0 เมื่อไหร่เส้นจะแบนจนดูไม่ออกว่าวันไหนดีวันไหนแย่ */
    var rows = dailyIn(pk, r);
    var dayLabels = rows.map(function (x) { return thaiShort(x.date); });

    function dailyPanel(title, tip, series, opt) {
      var out = sec(title, null, tip) + '<div class="panel">';
      out += rows.length
        ? CH.line({
            id: opt.id, labels: dayLabels, series: [series], height: 190,
            zeroFloor: true, baseZero: opt.baseZero, fmtY: opt.fmtY, unitLeft: opt.unit || "",
            aria: title,
          })
        : empty("ไม่มีข้อมูลรายวันในช่วงนี้");
      return out + "</div>";
    }

    var sView = {
      label: P.reachLabel, color: P.rawColor, tipFmt: "num",
      points: rows.map(function (x) { return { y: x[P.reachKey] }; }),
    };
    var sEr = {
      label: "Engagement rate", color: "#4b5563", tipFmt: "pctnum",
      points: rows.map(function (x) {
        var base = x[P.reachKey] || 0;
        // ไม่มีฐาน = ไม่รู้ ไม่ใช่ 0 → ส่ง null ให้เส้นขาด
        return { y: base ? (C.engagementOf(pk, x) / base) * 100 : null };
      }),
    };

    h += '<div class="duo">' +
      '<div class="duo-c">' + dailyPanel(P.reachLabel + "รายวัน",
        "จำนวน" + P.reachLabel + "ที่เกิดขึ้นในแต่ละวัน · วันที่ไม่มีข้อมูลเส้นจะขาด ไม่ใช่ลากลงศูนย์",
        sView, { id: "p-" + pk + "-v", baseZero: true, fmtY: function (v) { return num(v); } }) + "</div>" +
      '<div class="duo-c">' + dailyPanel("Engagement rate รายวัน",
        P.erFormula + " · " + P.erNote +
        " · แกนไม่ได้เริ่มจาก 0 เพราะค่าจริงอยู่ในช่วงแคบ ให้ดูรูปทรงว่าวันไหนดีกว่าวันไหน ไม่ใช่ดูความสูงของเส้น",
        sEr, { id: "p-" + pk + "-er", unit: "%" }) + "</div>" +
      "</div>";

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

  /**
   * แผงเลือกช่วงเวลา — ปุ่มบอกช่วงที่เลือกอยู่ กดแล้วกางแผงตัวเลือก
   * (โครงเดียวกับที่เครื่องมือวิเคราะห์ทั่วไปใช้: รายการสำเร็จรูปด้านหนึ่ง ปฏิทินอีกด้าน)
   *
   * ⚠️ ปฏิทินใช้ <input type="date"> ของเบราว์เซอร์ ไม่เขียนปฏิทินเอง —
   *    ได้ปฏิทินของระบบที่คนคุ้นอยู่แล้ว รองรับคีย์บอร์ด/screen reader ฟรี
   *    และไม่ต้องเพิ่มไลบรารีหรือดูแลโค้ดปฏิทินเองอีกก้อน
   * ⚠️ เปิด/ปิดแผงเก็บใน state ไม่ใช่ใน DOM — render() สร้าง HTML ใหม่ทั้งก้อน
   */
  function renderPeriod() {
    var t = midnight(new Date()), r = range();
    var p = presetOf(state.preset);
    var btnText = state.preset === "custom" ? rangeText(r.from, r.to) : presetLabel(p, t);

    var h = '<button type="button" class="periodbtn' + (state.periodOpen ? " on" : "") + '" data-period="toggle" ' +
      'aria-expanded="' + (state.periodOpen ? "true" : "false") + '">' +
      '<span class="pb-ic">🗓</span><span class="pb-t">' + esc(btnText) + "</span>" +
      '<span class="pb-sub">' + esc(rangeText(r.from, r.to)) + "</span>" +
      '<span class="pb-caret">▾</span></button>';

    if (!state.periodOpen) return h;

    var today = key(t);
    h += '<div class="periodpanel" role="dialog" aria-label="เลือกช่วงเวลา">' +
      '<div class="pp-list">' + PRESETS.map(function (x) {
        var on = state.preset === x.key;
        var rr = x.custom ? null : (function () {
          var pr = x.at(t), a = midnight(pr[0]), b = midnight(pr[1]);
          if (b > t) b = t;
          return rangeText(key(a), key(b));
        })();
        return '<button type="button" class="pp-i' + (on ? " on" : "") + '" data-preset="' + esc(x.key) + '">' +
          '<span class="pp-n">' + esc(presetLabel(x, t)) + "</span>" +
          (rr ? '<span class="pp-r">' + esc(rr) + "</span>" : "") + "</button>";
      }).join("") + "</div>";

    if (state.preset === "custom") {
      h += '<div class="pp-cal"><div class="pp-cal-h">เลือกวันที่เอง</div>' +
        '<label>ตั้งแต่<input type="date" id="d1" max="' + today + '" value="' + esc(state.start || r.from) + '"></label>' +
        '<label>ถึง<input type="date" id="d2" max="' + today + '" value="' + esc(state.end || r.to) + '"></label>' +
        '<p class="pp-note">เลือกได้ถึงวันนี้เท่านั้น</p></div>';
    }

    h += '<div class="pp-foot"><span class="pp-cur">' + esc(rangeText(r.from, r.to)) +
      " (" + r.days + " วัน)</span>" +
      '<button type="button" class="pp-done" data-period="close">เสร็จ</button></div></div>';
    return h;
  }

  function renderControls() {
    var r = range(), cr = compareRange();

    var h = "";
    h += '<div class="ctrl-row"><span class="ctrl-lb">เทียบกับ</span><div class="seg" id="cmp">' +
      COMPARE.map(function (x) {
        return '<button type="button" class="' + (state.compare === x.key ? "on" : "") + '" data-cmp="' + x.key + '">' +
          esc(x.label) + "</button>";
      }).join("") + "</div>";

    // ชิพเลือกช่อง + ปุ่มแยกช่อง — มีผลกับหน้าภาพรวมเท่านั้น
    if (state.tab === "summary") {
      h += '<div class="chips" id="chips">' + C.ORDER.map(function (pk) {
        var P = C.PLATFORMS[pk], on = state.channels[pk] && isOn(pk);
        /* ⚠️ ช่องที่ยังไม่เชื่อมต้องกดไม่ได้ ไม่ใช่กดติดแล้วไม่มีอะไรเปลี่ยน
           (กดแล้วหน้าเหมือนเดิม = ดูเหมือนปุ่มเสีย) */
        if (!isOn(pk)) {
          return '<button type="button" class="ch off" disabled ' +
            'title="ยังไม่ได้เชื่อมต่อ — เปิดแท็บของช่องนี้เพื่อดูว่าต้องใส่ค่าอะไร" ' +
            'style="--pc:' + P.rawColor + '"><span class="pdot"></span>' + esc(P.label) + " (ยังไม่เชื่อม)</button>";
        }
        return '<button type="button" class="ch' + (on ? " on" : "") + '" data-ch="' + pk + '" ' +
          'aria-pressed="' + (on ? "true" : "false") + '" style="--pc:' + P.rawColor + '">' +
          '<span class="pdot"></span>' + esc(P.label) + "</button>";
      }).join("") + "</div>";

      h += '<button type="button" class="bd-btn' + (state.breakdown ? " on" : "") + '" data-bd="1" ' +
        'aria-pressed="' + (state.breakdown ? "true" : "false") + '">' +
        (state.breakdown ? "▾" : "▸") + ' แยก<span class="lbl-long">ช่อง</span></button>';
    }
    h += "</div>";

    // ⚠️ ต้องบอกให้ชัดว่ากำลังเทียบกับ "ช่วงไหน" ไม่ใช่แค่บอกว่ามีการเทียบ
    /* ⚠️ ช่วงวันที่ซ้ำกับบรรทัดล่างของปุ่มเลือกช่วงเวลา — บนจอแคบซ่อนครึ่งนี้
       เพื่อไม่ให้แถบติดขอบสูงจนกินจอ (ครึ่งที่เหลือคือ "เทียบกับอะไร" ซึ่งไม่มีที่อื่นบอก) */
    h += '<div class="ctrl-note"><span class="rg">' + esc(rangeText(r.from, r.to)) + " (" + r.days + " วัน)</span>" +
      (cr ? ' <span class="vs">เทียบกับ' + esc(compareText()) + "</span>"
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
    document.getElementById("periodbox").innerHTML = renderPeriod();
    document.getElementById("controls").innerHTML = renderControls();
    document.getElementById("tabs").innerHTML = renderTabs();
    var tab = C.TABS.filter(function (t) { return t.key === state.tab; })[0] || C.TABS[0];
    document.getElementById("view").innerHTML = tab.platform ? renderPlatform(tab.platform) : renderSummary();
    bindHovers();
  }


  /* ── เอาเมาส์ชี้บนกราฟแล้วอ่านตัวเลขได้ ──────────────────────────
   * ข้อมูลอยู่ใน data-pts ของ .chartbox (charts.js เป็นคนใส่ให้)
   * ⚠️ ผูกใหม่ทุกครั้งหลัง render() เพราะ innerHTML สร้าง element ชุดใหม่หมด
   * ⚠️ ใช้ pointer event ตัวเดียว ครอบทั้งเมาส์และนิ้ว — แตะบนมือถือก็อ่านค่าได้
   */
  function tipVal(kind, v) {
    if (v == null) return "ไม่มีข้อมูล";
    if (kind === "pctnum") return v.toFixed(2).replace(/\.?0+$/, "") + "%";
    return Math.round(v).toLocaleString("th-TH");
  }

  function bindHovers() {
    var boxes = document.querySelectorAll(".chartbox");
    for (var i = 0; i < boxes.length; i++) bindOne(boxes[i]);
  }

  function bindOne(box) {
    var data;
    try { data = JSON.parse(box.dataset.pts); } catch (e) { return; }
    var svg = box.querySelector("svg");
    var tip = box.querySelector(".ctip");
    var cross = box.querySelector(".crosshair");
    if (!svg || !tip || !data.geo.count) return;

    var g = data.geo;
    var iw = g.w - g.padL - g.padR;
    var xAt = function (i) { return g.count === 1 ? g.padL + iw / 2 : g.padL + (i / (g.count - 1)) * iw; };

    function show(ev) {
      var rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      // แปลงพิกัดจอ → พิกัดใน viewBox (SVG ยืดตามความกว้างกล่อง)
      var vx = ((ev.clientX - rect.left) / rect.width) * g.w;
      var idx = Math.round(((vx - g.padL) / iw) * (g.count - 1));
      idx = Math.max(0, Math.min(g.count - 1, idx));

      var vis = data.series.filter(function (s) { return !s.hidden; });
      if (!vis.length) { hide(); return; }

      var html = '<b>' + esc(data.labels[idx]) + "</b>";
      vis.forEach(function (s) {
        html += '<span class="ct-r"><i style="background:' + esc(s.color) + '"></i>' +
          esc(s.label) + "<b>" + esc(tipVal(s.fmt, s.y[idx])) + "</b></span>";
      });
      tip.innerHTML = html;
      tip.hidden = false;

      if (cross) {
        var cx = xAt(idx);
        cross.setAttribute("x1", cx);
        cross.setAttribute("x2", cx);
        cross.style.display = "";
      }

      // วางกล่องให้ไม่ล้นขอบ — ชิดซ้ายเมื่อใกล้ขอบขวา
      var px = (xAt(idx) / g.w) * rect.width;
      var tw = tip.offsetWidth || 150;
      var left = px + 12;
      if (left + tw > rect.width) left = px - tw - 12;
      tip.style.left = Math.max(2, left) + "px";
      tip.style.top = "6px";
    }

    function hide() {
      tip.hidden = true;
      if (cross) cross.style.display = "none";
    }

    box.addEventListener("pointermove", show);
    box.addEventListener("pointerdown", show);
    box.addEventListener("pointerleave", hide);
  }

  /* ── รับคำสั่งจากผู้ใช้ ──────────────────────────────────────────── */

  function onClick(e) {
    var tip = e.target.closest(".tipi");
    if (tip) { showTip(tip); return; }

    var t = e.target.closest("[data-tab],[data-period],[data-preset],[data-cmp],[data-sort],[data-ch],[data-bd],[data-lg],[data-metric]");

    // คลิกนอกแผงเลือกช่วงเวลา = ปิดแผง
    if (state.periodOpen && !e.target.closest("#periodbox")) { state.periodOpen = false; render(); if (!t) return; }
    if (!t) return;

    if (t.dataset.period) {
      state.periodOpen = t.dataset.period === "toggle" ? !state.periodOpen : false;
      render(); return;
    }

    if (t.dataset.preset) {
      state.preset = t.dataset.preset;
      if (state.preset === "custom") {
        var rr = range();
        state.start = state.start || rr.from;
        state.end = state.end || rr.to;
      } else {
        state.periodOpen = false;   // เลือกของสำเร็จรูปแล้วปิดแผงเลย ไม่ต้องกดซ้ำ
      }
      render(); return;
    }

    // กดป้ายใต้กราฟ = ซ่อน/แสดงเส้นนั้น (แกนจะขยายตามเส้นที่เหลือเอง)
    if (t.dataset.lg) {
      var pair = t.dataset.lg.split(":");
      var cid = pair[0], si = +pair[1];
      var list = (state.hidden[cid] || []).slice();
      var at = list.indexOf(si);
      if (at >= 0) list.splice(at, 1); else list.push(si);
      state.hidden[cid] = list;
      render(); return;
    }

    if (t.dataset.tab) { state.tab = t.dataset.tab; render(); return; }

    if (t.dataset.bd) { state.breakdown = !state.breakdown; render(); return; }

    if (t.dataset.metric) { state.metric = t.dataset.metric; render(); return; }

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
    var d1 = document.getElementById("d1"), d2 = document.getElementById("d2");
    // ⚠️ กันเลือกวันในอนาคตอีกชั้น — บาง browser ไม่บังคับตาม max ให้
    var today = key(midnight(new Date()));
    if (d1.value > today) d1.value = today;
    if (d2.value > today) d2.value = today;
    state.start = d1.value;
    state.end = d2.value;
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
