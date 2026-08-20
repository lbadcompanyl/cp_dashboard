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
  /* ⚠️ ตั้งค่าตอนโหลดเสร็จ ไม่ใช่ตอนไฟล์ถูกอ่าน — ข้อมูลจริงมาจาก API ซึ่งต้องรอ
     ระหว่างรอ render() ต้องวาดสถานะ "กำลังโหลด" ไม่ใช่วาดของว่างๆ ให้ดูเหมือนไม่มีข้อมูล */
  var DATA = null;
  var LOAD_ERR = null;

  /* ชุดช่วงเวลาสำเร็จรูป — เรียงจากสั้นไปยาว แล้วปิดท้ายด้วย "กำหนดเอง"
   * ⚠️ ชื่อกับวิธีคิดอยู่คู่กันที่นี่ที่เดียว เพิ่มตัวเลือกใหม่เติมแค่ในลิสต์นี้
   *    (แผงเลือกวันที่ กับ ตัวคำนวณช่วง อ่านจากลิสต์เดียวกัน)
   * ⚠️ "ล่าสุด N วัน" นับรวมวันนี้ด้วย — ให้ตรงกับที่คนอ่านเข้าใจ
   *    ส่วนตัวที่เป็นเดือน/ปี ใช้ขอบเดือน-ปีปฏิทินจริง ไม่ใช่ลบจำนวนวันตายตัว */
  var PRESETS = [
    { key: "today", label: "วันนี้", at: function (t) { return [t, t]; } },
    { key: "yesterday", label: "เมื่อวาน", at: function (t) { var y = addDays(t, -1); return [y, y]; } },
    { key: "7d", label: "7 วันล่าสุด", at: function (t) { return [addDays(t, -6), t]; } },
    { key: "30d", label: "30 วันล่าสุด", at: function (t) { return [addDays(t, -29), t]; } },
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
    { key: "reach", label: "Views / Reach", tipFmt: "num", source: "daily",
      at: function (pk, x) { return x[C.PLATFORMS[pk].reachKey]; } },
    { key: "engagement", label: "Engagement", tipFmt: "num", source: "daily",
      at: function (pk, x) { return C.engagementOf(pk, x); } },
    { key: "er", label: "Engagement rate", tipFmt: "pctnum", unit: "%", source: "daily",
      at: function (pk, x) {
        var base = x[C.PLATFORMS[pk].reachKey] || 0;
        return base ? (C.engagementOf(pk, x) / base) * 100 : null;   // ไม่มีฐาน = ไม่รู้ ไม่ใช่ 0
      } },
  ];
  function metricOf(k) { return METRICS.filter(function (m) { return m.key === k; })[0] || METRICS[0]; }

  /* ⚠️ คีย์ที่ไม่รู้จัก (เช่นค่าเก่าอย่าง 28d/90d ที่ถอดออกแล้ว) ต้องตกกลับมาที่ 30 วัน
     ห้ามคืน undefined — เรียก .at() ต่อแล้วหน้าขาวทั้งหน้า */
  function presetOf(k) {
    return PRESETS.filter(function (p) { return p.key === k; })[0] ||
      PRESETS.filter(function (p) { return p.key === "30d"; })[0];
  }
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
    /* 🔴 แถวรายช่องใต้ยอดรวม — กางไว้ตลอด ไม่มีปุ่มพับแล้ว (เจ้าของสั่ง 19 ส.ค. 2026)
       ยอดรวมอย่างเดียวตอบไม่ได้ว่าช่องไหนดันขึ้นหรือฉุดลง จึงไม่มีเหตุผลให้ซ่อน
       ⚠️ ตัวแปรนี้ยังอยู่เพื่อให้ bd() อ่านที่เดียว — ถ้าจะเอาปุ่มกลับมา ต่อสายที่นี่ */
    breakdown: true,
    // ชิพเลือกช่องของหน้าภาพรวม — ไม่ต้องข้ามไปมีผลกับแท็บรายช่อง
    channels: { youtube: true, tiktok: true, facebook: true },
    // เส้นที่ผู้ใช้กดปิดจาก legend — แยกตามกราฟ { chartId: [index,...] }
    // ⚠️ ต้องอยู่ใน state ไม่ใช่ใน DOM เพราะ render() สร้าง HTML ใหม่ทั้งก้อน
    hidden: {},
    // แผงเลือกช่วงเวลาเปิดอยู่ไหม
    periodOpen: false,
    /* เดือนขวาสุดที่ปฏิทินกำลังเปิดอยู่ (null = เดือนของวันสิ้นสุดช่วงที่เลือก)
       ⚠️ ต้องอยู่ใน state ไม่ใช่ใน DOM — render() สร้าง HTML ใหม่ทั้งก้อนทุกครั้ง */
    calAnchor: null,
    /* กำลังเลือกวันที่สองอยู่หรือยัง — คลิกแรกตั้งวันเริ่ม คลิกที่สองตั้งวันจบ */
    picking: false,
    /* จำไว้ว่าปิดการเทียบไปจากโหมดไหน กดเปิดกลับจะได้โหมดเดิม ไม่ใช่ค่าตั้งต้นเสมอ */
    lastCompare: "prev",
    // metric ที่กำลังดูอยู่ในกราฟหลักของหน้าภาพรวม
    metric: "followers",
    // กราฟหลักดูช่องไหน — "all" = รวมทุกช่องที่เปิดอยู่ · วาดทีละเส้นเท่านั้น
    trendCh: "all",
    // ความละเอียดของแกนเวลาในกราฟหลัก
    grain: "day",
    // ตาราง "ผลงานรายช่อง" กำลังดูชุดคอลัมน์ไหน — engagement | reach
    perfTab: "engagement",
    // แถวไหนของตารางกางดูคอนเทนต์อยู่ { youtube:true, ... }
    perfOpen: {},
    /* อันดับคอนเทนต์ "ตามยอดที่เกิดในช่วงที่เลือก" — เก็บแยกตามช่วง
       ⚠️ ต้อง cache ในหน้าเว็บด้วย ไม่งั้นสลับแท็บทีก็ยิงใหม่ทุกครั้ง
          ค่า undefined = ยังไม่เคยขอ · null = ขอแล้วช่องนี้ทำไม่ได้ */
    topCache: {},
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
    var st = ((DATA && DATA.platforms[pk]) || {}).status;
    return st || { connected: true, partial: false, need: [] };
  }
  function isOn(pk) { return statusOf(pk).connected !== false; }
  /* เชื่อมแล้วแต่ต้นทางให้ได้แค่ยอด ณ ตอนนี้ ยังไม่มีประวัติรายวัน
     ⚠️ คนละเรื่องกับ "ยังไม่ได้เชื่อม" — ตัวเลขที่มีอยู่ต้องแสดง ไม่ใช่ทิ้งทั้งช่อง */
  function isPartial(pk) { return !!statusOf(pk).partial; }

  /* ── อันดับคอนเทนต์ตามยอดที่เกิดในช่วงที่เลือก ─────────────────────
   * 🔴 เจ้าของเลือกแบบ A (19 ส.ค. 2026) — "ช่วงนี้ยอดวิวมาจากคลิปไหน"
   *    ไม่ใช่ "คลิปที่ลงในช่วงนี้ ตัวไหนดีสุด" · คลิปเก่าที่ดังขึ้นมาใหม่ต้องติดอันดับ
   * ⚠️ ต้องยิงใหม่ทุกครั้งที่ช่วงเวลาเปลี่ยน จึงโหลดแยกจากข้อมูลหลัก
   *    ระหว่างรอ ต้องขึ้นไอคอนหมุน ไม่ใช่โชว์อันดับของช่วงก่อนหน้าค้างไว้
   */
  function topKey(pk, r) { return pk + "|" + r.from + "|" + r.to; }

  function topFor(pk, r) {
    var k = topKey(pk, r);
    if (k in state.topCache) return state.topCache[k];   // null ก็ถือว่าเคยขอแล้ว
    state.topCache[k] = undefined;                        // กันยิงซ้ำระหว่างรอ
    window.SOCIAL_DATA.loadTop(pk, r.from, r.to).then(function (list) {
      state.topCache[k] = list;
      render();
    });
    return undefined;
  }
  function nowOf(pk) { return ((DATA && DATA.platforms[pk]) || {}).now || null; }

  /** ช่องที่ผู้ใช้เปิดไว้ "และ" มีตัวเลขรายวันให้คิด — ยอดรวมทุกใบนับจากชุดนี้
   * ⚠️ ช่องที่เชื่อมแล้วแต่ยังไม่มีประวัติรายวัน (partial) ต้องไม่อยู่ในชุดนี้
   *    ใส่เข้ามาแล้วมันจะบวกเป็น 0 ทำให้ยอดรวมต่ำกว่าความจริงโดยไม่มีอะไรบอก */
  function activeOrder() {
    return C.ORDER.filter(function (pk) { return state.channels[pk] && isOn(pk) && !isPartial(pk); });
  }

  /* กล่องบอกว่า "เชื่อมแล้ว แต่ได้ข้อมูลไม่ครบ"
   * 🔴 ต้องบอกให้ชัดว่า "ส่วนไหนจริง ส่วนไหนยังไม่มี" — ไม่งั้นเจ้าของจะเห็นกราฟว่าง
   *    แล้วเข้าใจว่าระบบพัง ทั้งที่มันแค่ยังไม่ได้ต่อชั้นที่ 2 */
  function partialNote(pk) {
    var P = C.PLATFORMS[pk], st = statusOf(pk), n = nowOf(pk);
    var bits = [];
    if (n) {
      if (n.followers != null) {
        bits.push("ผู้ติดตาม " + num(n.followers) + (n.followersApprox ? " (โดยประมาณ)" : ""));
      }
      if (n.viewsAllTime != null) bits.push("ยอดวิวรวมทั้งช่อง " + num(n.viewsAllTime));
      if (n.contentCount != null) bits.push(esc(P.contentWord) + "ทั้งหมด " + num(n.contentCount));
    }
    return '<div class="partial"><div class="partial-h">⚠️ ' + esc(P.label) +
      ": เชื่อมต่อแล้ว แต่ยังไม่มีตัวเลขรายวัน</div>" +
      '<p class="partial-p">' + esc(st.why || st.message) + "</p>" +
      (bits.length
        ? '<div class="partial-now"><span class="partial-lb">ตัวเลขจริงที่ได้มาแล้ว</span>' +
          bits.map(function (b) { return "<b>" + b + "</b>"; }).join('<span class="partial-sep">·</span>') + "</div>"
        : "") +
      (st.need && st.need.length
        ? '<div class="setup-n"><span class="setup-nl">ต้องใส่เพิ่มใน Cloudflare</span>' +
          st.need.map(function (k) { return "<code>" + esc(k) + "</code>"; }).join("") + "</div>"
        : "") +
      "</div>";
  }

  /* คอนเทนต์ของช่องที่ยังไม่มีตัวเลขรายวัน — ส่วนนี้เป็นของจริงและใช้ได้เลย
   * ⚠️ ไม่กรองตามช่วงเวลา เพราะต้นทางให้มาแค่ "ล่าสุด N ชิ้น" ไม่ได้ให้เลือกช่วง
   *    กรองแล้วจะว่างเปล่าทั้งที่มีข้อมูลอยู่ — ต้องเขียนบอกด้วยว่าไม่ได้ยึดตามช่วงที่เลือก */
  function partialContent(pk) {
    var P = C.PLATFORMS[pk];
    var posts = ((DATA && DATA.platforms[pk]) || {}).posts || [];
    if (!posts.length) return "";

    var sorted = posts.slice().sort(function (x, y) {
      return x.publishedAt < y.publishedAt ? 1 : -1;
    });
    /* ⚠️ คำเตือนนี้ต้อง "มองเห็น" ไม่ใช่ซ่อนไว้หลัง ⓘ — เจ้าของจะเปลี่ยนช่วงเวลา
       แล้วงงว่าทำไมรายการไม่เปลี่ยน ซึ่งเป็นคำถามที่เกิดก่อนจะไปกด ⓘ */
    return sec(P.contentWord + "ล่าสุด", "ไม่ได้ยึดตามช่วงเวลาที่เลือก",
      "ต้นทางให้มาเป็น \"ล่าสุดเท่านั้น\" เลือกช่วงเองไม่ได้ · ตัวเลขในนี้เป็นของจริงจากต้นทาง " +
      "· ถ้าอยากได้รายการตามช่วงเวลา ต้องต่อ YouTube Analytics เพิ่ม") +
      '<div class="panel"><div class="posts">' +
      sorted.map(function (po) { return postRow(po, pk, { newBadge: true }); }).join("") +
      "</div></div>";
  }

  /** กล่องบอกว่าช่องนี้ยังไม่ได้เชื่อม — เป็นสถานะที่ตั้งใจ ไม่ใช่ข้อผิดพลาด */
  function notConnected(pk) {
    var P = C.PLATFORMS[pk], st = statusOf(pk), need = st.need || [];

    /* 🔴 3 สาเหตุนี้ต้องบอกคนละอย่าง — บอกผิดคือส่งเจ้าของไปแก้ผิดจุด
       ยังไม่ได้ใส่ค่า      → บอกว่าต้องใส่อะไร
       ใส่แล้วแต่สิทธิ์หมด  → บอกให้กดขอสิทธิ์ใหม่ (ค่าใน Cloudflare ยังถูกอยู่ ไม่ต้องแตะ)
       ยิงไม่ถึงเซิร์ฟเวอร์ → ไม่ใช่เรื่องการตั้งค่าเลย ให้ลองใหม่
       ⚠️ เคสสิทธิ์หมดอายุเกิดจริงแน่ๆ กับบัญชี Gmail ธรรมดา — Google ให้ refresh token
          ที่หมดอายุทุก 7 วันถ้าแอปยังไม่ได้ publish */
    var kind = st.authFailed
      ? { t: "สิทธิ์หมดอายุ — " + P.label,
          p: "ค่าที่ตั้งไว้ใน Cloudflare ยังถูกอยู่ <b>ไม่ต้องแก้</b> แค่ต้องกดขออนุญาตใหม่อีกครั้ง " +
             "แล้วเอา token ตัวใหม่มาใส่แทนตัวเดิม",
          how: "ตั้ง SETUP_KEY ชั่วคราว → เปิด /social/api/connect → กดอนุญาตใหม่ → ใส่ token ใหม่ → ลบ SETUP_KEY ทิ้ง",
          showNeed: false }
      : st.fetchFailed
      ? { t: "ดึงข้อมูล " + P.label + " ไม่สำเร็จ",
          p: "ไม่ใช่เรื่องการตั้งค่า — ต้นทางหรือเส้นทางเน็ตมีปัญหาชั่วคราว ลองรีเฟรชหน้าอีกครั้ง",
          how: "", showNeed: false }
      : { t: "ยังไม่ได้เชื่อมต่อ " + P.label,
          p: "ตัวเลขของช่องนี้จะขึ้นเองทันทีที่เชื่อมต่อเสร็จ ระหว่างนี้ยอดรวมบนหน้าภาพรวม" +
             "<b>ไม่ได้นับช่องนี้</b> จึงไม่ใช่ว่าตัวเลขหาย",
          how: "ใส่เป็น Secret ทั้ง Production และ Preview แล้วสั่ง Retry deployment",
          showNeed: true };

    return '<div class="setup' + (st.authFailed ? " warn" : "") + '"><div class="setup-i" style="background:' +
      P.rawColor + '">' + esc(P.label.charAt(0)) + "</div>" +
      '<div class="setup-b"><div class="setup-t">' + esc(kind.t) + "</div>" +
      '<p class="setup-p">' + kind.p + "</p>" +
      (st.message ? '<p class="setup-p sm">ต้นทางแจ้งว่า: ' + esc(st.message) + "</p>" : "") +
      (kind.showNeed && need.length
        ? '<div class="setup-n"><span class="setup-nl">ต้องใส่ค่าใน Cloudflare ก่อน</span>' +
          need.map(function (k) { return "<code>" + esc(k) + "</code>"; }).join("") + "</div>"
        : "") +
      (kind.how ? '<p class="setup-p sm">' + esc(kind.how) + "</p>" : "") +
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
    a.views3s = 0;
    rows.forEach(function (x) {
      a[rk] += x[rk] || 0;
      a.likes += x.likes || 0;
      a.comments += x.comments || 0;
      a.shares += x.shares || 0;
      a.views3s += x.views3s || 0;
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

  /**
   * ย่อตัวเลขให้อ่านง่าย (1.2M / 258K / 1,240)
   * @param dec บังคับจำนวนทศนิยม — ใช้ตอนทำป้ายแกน Y เท่านั้น
   *   🔴 เหตุที่ต้องมี: ช่วงข้อมูลแคบ (ผู้ติดตามขยับ 0.1% ใน 30 วัน) การปัดเป็น K
   *      ทำให้ป้ายแกนซ้ำกันหมด — เคยได้ 258K / 258K / 259K / 259K ซึ่งอ่านไม่ออกว่าไล่ยังไง
   *      charts.js จะไล่เพิ่มทศนิยมเองจนกว่าป้ายทุกใบจะไม่ซ้ำ
   */
  function num(v, dec) {
    if (v == null || isNaN(v)) return null;
    v = Number(v);
    var s = v < 0 ? "−" : "";
    v = Math.abs(v);
    if (dec != null) {
      if (v >= 1e6) return s + (v / 1e6).toFixed(dec) + "M";
      if (v >= 1e3) return s + (v / 1e3).toFixed(dec) + "K";
      return s + v.toFixed(dec);
    }
    if (v >= 1e6) return s + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (v >= 1e4) return s + Math.round(v / 1e3) + "K";
    if (v >= 1e3) return s + (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return s + Math.round(v).toLocaleString("th-TH");
  }
  function pct(v) { return v == null || isNaN(v) ? null : (v * 100).toFixed(2).replace(/\.?0+$/, "") + "%"; }
  /** เลขเต็มมีลูกน้ำคั่น — ใช้กับค่าที่ "ส่วนต่างหลักร้อยมีความหมาย" เช่นยอดผู้ติดตาม */
  function full(v) { return v == null || isNaN(v) ? null : Math.round(v).toLocaleString("th-TH"); }
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
      /* ⚠️ ตัวเลขเทียบต้องบอกด้วยว่าเทียบกับช่วงไหน (เจ้าของสั่ง 19 ส.ค. 2026)
         "▲ 0.1%" ลอยๆ ไม่มีทางรู้ว่าเทียบกับช่วงก่อนหน้า เดือนที่แล้ว หรือปีก่อน
         — และค่านี้เปลี่ยนได้จากในแผงเลือกช่วงเวลาซึ่งอยู่คนละที่กับการ์ด */
      '<div class="sc-d">' + (o.delta || "") +
        (o.delta && state.compare !== "none"
          ? '<span class="sc-vs">เทียบกับ' + esc(compareName()) + "</span>" : "") +
      "</div>" + (o.extra || "") + "</div>";
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
    // เลขอันดับ — โชว์เมื่อมีมากกว่า 1 ใบในกล่องเดียวกัน ไม่งั้นไม่รู้ว่าใบไหนมาก่อน
    var rank = opts.rank ? '<span class="rk">' + opts.rank + "</span>" : "";
    /* ⚠️ ลิงก์มาจาก post.url ของข้อมูลตรงๆ — ของจริงคือ URL โพสต์บนแพลตฟอร์ม
       ถ้าไม่มีลิงก์ ให้เป็นการ์ดเฉยๆ ไม่ใช่ <a> ที่กดแล้วไม่ไปไหน (หลอกว่ากดได้) */
    var live = p.url && p.url !== "#";
    var tag = live ? "a" : "div";
    var attr = live ? ' href="' + esc(p.url) + '" target="_blank" rel="noopener"' : "";
    return "<" + tag + ' class="post' + (live ? "" : " nolink") + '"' + attr + '>' +
      rank + '<img src="' + esc(p.thumb) + '" alt="" loading="lazy">' +
      '<div class="post-b"><div class="post-t">' + esc(p.title) + badge +
      (live ? ' <span class="ext">↗</span>' : "") + "</div>" +
      /* ⚠️ ต้องมี "จำนวน engagement" ด้วย ไม่ใช่มีแต่ ER (เจ้าของแจ้ง 19 ส.ค. 2026)
         ER เป็นอัตราส่วน — 2% ของคนดู 100 กับ 2% ของคนดู 100,000 คนละเรื่องกันมาก
         ต้องเห็นทั้งฐานและอัตราส่วนถึงจะตัดสินได้ว่าใบไหนดีจริง */
      '<div class="post-m">' +
      (opts.showPlatform ? '<span class="chip" style="border-color:' + P.rawColor + '">' + esc(P.label) + "</span>" : "") +
      "<span>" + esc(P.reachLabel) + " <b>" + esc(num(reach)) + "</b></span>" +
      "<span>Engagement <b>" + esc(num(C.engagementOf(pk, p))) + "</b></span>" +
      "<span>ER <b>" + esc(pct(P.er(p)) || "—") + "</b></span>" +
      '<span class="post-d">' + esc(thaiShort(p.publishedAt)) + "</span>" +
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

    // ⓪ ภาพรวมก่อน: Views / Reach รวมขยับไปทางไหน
    if (cr) {
      var tc = 0, tp = 0;
      order.forEach(function (pk) {
        if (cur[pk]) tc += cur[pk].reach;
        if (prev[pk]) tp += prev[pk].reach;
      });
      if (tp >= INSIGHT_MIN_BASE) {
        var tch = (tc - tp) / tp;
        out.push(Math.abs(tch) < 0.05
          ? { tone: "flat", text: "Views / Reach รวมทรงตัว เปลี่ยนจากช่วงก่อนหน้าไม่ถึง 5%" }
          : {
              tone: tch > 0 ? "up" : "down",
              text: "Views / Reach รวม" + (tch > 0 ? "เพิ่มขึ้น " : "ลดลง ") + Math.round(Math.abs(tch) * 100) +
                "% เทียบกับ" + compareText(),
            });
      }
    }

    /* ① ช่องที่ Views / Reach ขยับแรงที่สุด
       ⚠️ มีช่องเดียวข้อนี้ไม่มีความหมาย — มันคือยอดรวมข้อ ⓪ นั่นเอง
          เจอจริง 19 ส.ค. 2026: "Views รวมลดลง 26%" คู่กับ "YouTube ลดลง 26%" */
    if (cr && order.length > 1) {
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
            C.PLATFORMS[mv.pk].reachLabel + (mv.ch > 0 ? " เพิ่มขึ้น " : " ลดลง ") +
            Math.round(Math.abs(mv.ch) * 100) + "% เทียบกับช่วงก่อนหน้า",
        });
      }
    }

    /* ② ช่องที่ ER ดีที่สุดในช่วงนี้
       ⚠️ "สูงสุด" ต้องมีอะไรให้เทียบ มีช่องเดียวก็ไม่ใช่การเปรียบเทียบ */
    var bestEr = null;
    if (order.length > 1) order.forEach(function (pk) {
      var a = cur[pk];
      if (!a || a.er == null || !a.reach) return;
      if (!bestEr || a.er > bestEr.er) bestEr = { pk: pk, er: a.er };
    });
    if (bestEr) {
      out.push({
        tone: "flat",
        text: C.PLATFORMS[bestEr.pk].label + " มี Engagement rate สูงสุดที่ " + pct(bestEr.er) +
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
    /* ⚠️ "ไม่มีช่องให้รวม" มีได้ 3 สาเหตุ ต้องแยกให้ออก ไม่งั้นเจ้าของไล่หาสาเหตุผิดทาง
       ปิดชิพเอง = บอกให้กดกลับ
       ยังไม่ได้เชื่อม = บอกว่าต้องใส่อะไร
       เชื่อมแล้วแต่ยังไม่มีตัวเลขรายวัน = ขยายช่วงเวลาเท่าไหร่ก็ไม่มี ต้องต่อชั้นที่ 2 */
    if (!order.length) {
      var offAll = C.ORDER.filter(function (pk) { return !isOn(pk); });
      var partAll = C.ORDER.filter(isPartial);
      if (offAll.length + partAll.length === C.ORDER.length) {
        return (partAll.length
            ? '<div class="empty"><div class="empty-i">◔</div><div>' +
              "<b>ยังไม่มีช่องไหนที่มีตัวเลขรายวัน</b>" +
              "<div>หน้าภาพรวมทั้งหน้าคิดจากข้อมูลรายวัน — เปิดแท็บของแต่ละช่องเพื่อดูตัวเลขที่มีอยู่แล้ว</div>" +
              "</div></div>"
            : "") +
          '<div class="setups">' +
          partAll.map(partialNote).join("") + offAll.map(notConnected).join("") + "</div>";
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
    /* แถวรายช่องใต้ยอดรวม
     * 🔴 บอก "สัดส่วนของยอดรวม" ด้วย (เจ้าของสั่ง 19 ส.ค. 2026) — เห็นตัวเลขดิบ
     *    อย่างเดียวยังต้องมานั่งหารเองว่าช่องไหนคิดเป็นกี่ % ของทั้งหมด
     * ⚠️ ใส่ % ได้เฉพาะค่าที่ "บวกกันแล้วเป็นยอดรวม" (ผู้ติดตาม/การมองเห็น/การมีส่วนร่วม)
     *    ห้ามใส่กับ Engagement rate — เป็นอัตราส่วน บวกกันไม่ได้ ค่ารายช่องรวมกันไม่ใช่ 100%
     *    (ใส่ไปจะได้เลขที่ดูเหมือนสัดส่วนแต่ไม่มีความหมายเลย) */
    function bd(pick, opt) {
      if (!state.breakdown) return "";
      /* ⚠️ มีช่องเดียว แถวรายช่องจะเท่ากับยอดรวมเป๊ะ ("YT 100% 41,500" ใต้ "41,500")
         ซ้ำเปล่าๆ และทำให้การ์ดสูงขึ้นโดยไม่ได้อะไร */
      if (order.length < 2) return "";
      opt = opt || {};
      var vals = order.map(function (pk) { return pick(cur[pk], prev[pk], pk, r, cr); });
      var share = !opt.pp && !opt.noShare;
      var tot = 0;
      if (share) vals.forEach(function (v) { if (v.cur != null) tot += v.cur; });

      var rows = order.map(function (pk, i) {
        var P = C.PLATFORMS[pk], v = vals[i];
        /* ⚠️ ปัดเป็นจำนวนเต็ม — ตรงนี้ต้องการแค่ "ประมาณเท่าไหร่ของทั้งหมด"
           ทศนิยม 2 ตำแหน่งทำให้แถวยาวจนล้นการ์ดบนมือถือ (วัดได้ 401px บนจอ 390px) */
        var pctText = share && tot && v.cur != null ? Math.round((v.cur / tot) * 100) + "%" : null;
        return '<div class="bd-r"><span class="bd-d" style="background:' + P.rawColor + '"></span>' +
          '<span class="bd-n">' + esc(P.short) + "</span>" +
          '<span class="bd-s">' + (pctText ? esc(pctText) : "") + "</span>" +
          '<span class="bd-v">' + esc(v.text == null ? "—" : v.text) + "</span>" +
          delta(v.cur, v.prev, opt) + "</div>";
      }).join("");
      return '<div class="bd">' + rows + "</div>";
    }

    /* ⚠️ ป้าย "รวม" ต้องบอกว่ารวมกี่ช่อง — ชิพเลือกช่องปิดได้ทีละช่อง
       ตัวเลขจึงเปลี่ยนได้โดยที่ป้ายยังเขียนว่า "รวม" เหมือนเดิม (เข้าใจผิดว่าตัวเลขผิด) */
    var nch = " (" + order.length + " ช่อง)";

    h += '<div class="grid4">' +
      /* 🔴 ผู้ติดตามโชว์เลขเต็ม ไม่ย่อเป็น K (เจ้าของแจ้ง 19 ส.ค. 2026 ว่า "โดนตัด")
         ย่อเป็น 41K แล้วเลขที่ต่างกัน 400 คนมองไม่เห็นเลย ซึ่งเป็นตัวเลขที่คนดูบ่อยที่สุด
         ⚠️ ยอดวิว/engagement ยังย่ออยู่โดยตั้งใจ — หลักล้าน เขียนเต็มแล้วอ่านยากกว่า */
      card({ label: "ผู้ติดตามรวม" + nch, value: full(tf), delta: delta(tf, cr ? pf : null),
             tip: "ตัวเลขจาก YouTube ถูกปัดเป็นเลขนัยสำคัญ 3 ตัวก่อนส่งมา (เช่น 41,437 จะได้มาเป็น 41,400) " +
                  "จึงใช้ดูระดับได้ แต่เอาไปนับว่าวันนี้เพิ่มกี่คนไม่ได้ — ยอดเพิ่ม/หายรายวันดูที่กราฟข้างๆ",
             extra: bd(function (a, b, pk) {
               var g = growth(pk, r), pg2 = cr ? growth(pk, cr) : null;
               return { text: g ? full(g.end) : null, cur: g ? g.end : null, prev: pg2 ? pg2.end : null };
             }) }) +
      card({ label: "Views / Reach รวม" + nch, value: num(tv),
             tip: "YouTube และ TikTok นับเป็น Views (จำนวนครั้งที่ถูกเปิดดู) · Facebook นับเป็น Reach (จำนวนคนที่เห็นโพสต์) สองอย่างนี้ไม่ใช่หน่วยเดียวกัน แต่รวมไว้เพื่อดูภาพกว้าง",
             delta: delta(tv, cr ? pv : null),
             extra: bd(function (a, b) {
               return { text: a ? num(a.reach) : null, cur: a ? a.reach : null, prev: b ? b.reach : null };
             }) }) +
      card({ label: "Engagement รวม" + nch, value: num(te),
             tip: "Engagement = Likes + Comments + Shares ตามที่แต่ละช่องนับได้ · " +
                  "ตัวเลข Shares ของ YouTube มาจาก YouTube Analytics ถ้าต่อแค่ API key จะไม่มีส่วนนี้",
             delta: delta(te, cr ? pe : null),
             extra: bd(function (a, b) {
               return { text: a ? num(a.engagement) : null, cur: a ? a.engagement : null, prev: b ? b.engagement : null };
             }) }) +
      card({ label: "Engagement rate รวม" + nch, value: pct(erNow),
             tip: "Engagement รวม ÷ (Views / Reach) รวม ของช่องที่เปิดอยู่ · ค่ารายช่องคิดด้วยสูตรของช่องนั้นเอง จึงเทียบข้ามช่องตรงๆ ไม่ได้",
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
    var partList = C.ORDER.filter(isPartial);
    var link = function (pk) {
      return '<button type="button" class="offlink" data-tab="' + esc(pk) + '">' +
        esc(C.PLATFORMS[pk].label) + "</button>";
    };
    if (offList.length) {
      h += '<div class="offnote">ยอดรวมข้างบนยังไม่ได้นับ ' + offList.map(link).join(" · ") +
        " เพราะยังไม่ได้เชื่อมต่อ</div>";
    }
    /* ⚠️ ช่องที่เชื่อมแล้วแต่ยังไม่มีตัวเลขรายวัน ก็ไม่ได้ถูกนับเหมือนกัน
       แต่คนละเหตุผล ต้องแยกบรรทัด ไม่งั้นเจ้าของจะไปไล่ตั้งค่าที่ตั้งไปแล้ว */
    if (partList.length) {
      h += '<div class="offnote">' + partList.map(link).join(" · ") +
        " เชื่อมต่อแล้วแต่ยังไม่มีตัวเลขรายวัน จึงยังไม่ถูกนับในยอดรวม — กดดูตัวเลขที่มีอยู่ได้ในแท็บของช่องนั้น</div>";
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
        sec("แนวโน้ม", null,
          "วาดทีละเส้น — กดแท็บเพื่อสลับระหว่างยอดรวมกับรายช่อง แกนจะขยายเต็มกรอบให้เส้นที่กำลังดูอยู่เสมอ " +
          "(เอาหลายช่องมาซ้อนกันแล้วช่องเล็กจะแบนติดพื้น) · เลือกได้ว่าจะดูเป็นรายวัน รายสัปดาห์ หรือรายเดือน " +
          "· เอาเมาส์ชี้เพื่ออ่านตัวเลข") +
        '<div class="panel">' +
          '<div class="mchips">' + METRICS.map(function (mm) {
            return '<button type="button" class="mchip' + (state.metric === mm.key ? " on" : "") +
              '" data-metric="' + mm.key + '">' + esc(mm.label) + "</button>";
          }).join("") + "</div>" +
          trendControls(order, r) +
          metricTrend(order, r, state.metric, 196, "sum-" + state.metric) +
        "</div>" +
      "</div>" +
      '<div class="duo-c">' +
        sec("ผู้ติดตามที่เพิ่มและที่หายไป", null,
          "แท่งแดงยื่นซ้ายคือคนที่เลิกติดตาม แท่งเขียวยื่นขวาคือคนที่เพิ่งติดตาม ทุกช่องใช้มาตราส่วนเดียวกัน " +
          "ยอดสุทธิเท่ากันไม่ได้แปลว่าเหมือนกัน — ได้ 500 เสีย 480 คนละเรื่องกับ ได้ 30 เสีย 10") +
        /* ⚠️ ทุกช่องเป็น 0 = วาดแท่งความยาว 0 ได้กล่องเปล่าที่ดูเหมือนหน้าพัง
           ต้องบอกว่า "ไม่มีคนเข้าออกเลย" ซึ่งเป็นข้อมูลจริง ไม่ใช่ความว่างเปล่า */
        '<div class="panel">' + (glRows.some(function (x) { return x.gained || x.lost; })
          ? CH.diverging(glRows)
          : empty("ไม่มีคนติดตามเข้าหรือออกเลยในช่วงนี้",
                  glRows.length ? "ถ้าคิดว่าไม่น่าใช่ ให้ตรวจว่าดึงสถิติมาจากช่องที่ถูกต้องหรือไม่" : "")) + "</div>" +
      "</div>" +
      "</div>";

    /* ③ ตารางผลงานรายช่อง — ช่องเป็น "แถว" ตัวชี้วัดเป็น "คอลัมน์"
     * 🔴 เดิมสลับกัน (ตัวชี้วัดเป็นแถว ช่องเป็นคอลัมน์) เจ้าของสั่งเปลี่ยน 19 ส.ค. 2026
     *    เพราะคนอ่านตารางแบบ "หนึ่งแถว = หนึ่งช่อง" แล้วกวาดตาไปตามคอลัมน์
     * 🔴 กดแถวแล้วกางดูได้ว่ายอดนั้นมาจากคอนเทนต์ใบไหนบ้าง (เจ้าของสั่ง 19 ส.ค. 2026)
     *    ตัวเลขรวมอย่างเดียวตอบไม่ได้ว่า "โตเพราะคลิปเดียวดัง หรือดีขึ้นทั้งกระดาน"
     * ⚠️ 2 แท็บมีคอลัมน์ไม่เท่ากันโดยตั้งใจ — ยัดรวมกันเป็นตารางเดียวจะกว้างจนต้องเลื่อน
     * ⚠️ ช่องไหนไม่มีตัวเลขนั้นจริงๆ ต้องขึ้น "—" พร้อมเหตุผล
     *    ห้ามใส่ 0 — 0 แปลว่า "วัดได้แล้วได้ศูนย์" คนละเรื่องกับ "วัดไม่ได้" */
    var PERF_TABS = [
      { key: "engagement", label: "Engagement" },
      { key: "reach", label: "Views / Reach" },
    ];
    var ptab = state.perfTab === "reach" ? "reach" : "engagement";

    /** ช่องนั้นนับ engagement ส่วนนี้ไหม — ดูจาก parts ของช่อง ไม่ได้เดาจากชื่อ */
    function hasPart(pk, k) {
      return C.PLATFORMS[pk].parts.some(function (x) { return x.key === k; });
    }

    var shareTot = 0;
    order.forEach(function (pk) { if (cur[pk]) shareTot += cur[pk].reach; });

    var ENG_COLS = [
      { key: "likes", label: "Likes", na: "ช่องนี้ไม่เปิดเผยตัวเลขนี้" },
      { key: "comments", label: "Comments", na: "ช่องนี้ไม่เปิดเผยตัวเลขนี้" },
      { key: "shares", label: "Shares", na: "YouTube ไม่เปิดเผยจำนวนแชร์ผ่าน API" },
      { key: "engagement", label: "Engagement รวม", strong: true, always: true },
      { key: "er", label: "ER", fmt: "pct", pp: true, always: true,
        tip: "แต่ละช่องคิด ER คนละสูตร เทียบข้ามช่องตรงๆ ไม่ได้" },
    ];
    var COLS = ptab === "engagement" ? ENG_COLS : C.VIEW_COLS;

    /** ค่าของคอลัมน์นั้นสำหรับช่องนี้ — คืน null เมื่อช่องนี้ไม่มีตัวเลขนั้น */
    function colVal(c2, a, pk) {
      if (!a) return null;
      if (c2.key === "share") return a.reach;
      if (c2.always) return a[c2.key];
      if (ptab === "engagement") return hasPart(pk, c2.key) ? a[c2.key] : null;
      return C.hasStat(pk, c2.key) ? a[c2.key] : null;
    }

    function cellText(v, f) {
      if (v == null || isNaN(v)) return null;
      if (f === "share") return shareTot ? pct(v / shareTot) : null;
      return fmt(f || "num", v);
    }

    h += sec("ผลงานรายช่อง", null,
      "หนึ่งแถวคือหนึ่งช่อง · กดแถวเพื่อดูว่ายอดนั้นมาจากคอนเทนต์ใบไหนบ้าง " +
      "· แต่ละช่องวัดคนละหน่วย (YouTube/TikTok เป็น Views · Facebook เป็น Reach) และคิด ER คนละสูตร " +
      "ตัวเลขในคอลัมน์เดียวกันจึงใช้ดูทิศทางของแต่ละช่อง ไม่ใช่เอามาเทียบขนาดกันตรงๆ");

    h += '<div class="panel">' +
      '<div class="perftabs">' + PERF_TABS.map(function (x) {
        return '<button type="button" class="ptab' + (ptab === x.key ? " on" : "") +
          '" data-ptab="' + x.key + '">' + esc(x.label) + "</button>";
      }).join("") + "</div>" +
      '<div class="tblwrap"><table class="tbl perf"><thead><tr><th>ช่อง</th>' +
      COLS.map(function (c2) {
        return '<th class="num">' + esc(c2.label) +
          (c2.tip ? ' <button type="button" class="tipi" data-tip="' + esc(c2.tip) + '" title="' +
            esc(c2.tip) + '" aria-label="คำอธิบาย">ⓘ</button>' : "") + "</th>";
      }).join("") + "</tr></thead><tbody>";

    order.forEach(function (pk) {
      var P = C.PLATFORMS[pk], a = cur[pk], b = prev[pk];
      var open = !!state.perfOpen[pk];

      /* ⚠️ ชื่อช่องเป็นปุ่มกาง/พับ ส่วนทางลัดไปแท็บของช่องเป็นปุ่มแยกอีกอัน
         ปุ่มเดียวทำ 2 อย่างไม่ได้ — กดแล้วเดาไม่ถูกว่าจะกางหรือจะเปลี่ยนหน้า */
      /* ⚠️ ห้ามใส่ display:flex บน <th> โดยตรง — ช่องตารางจะหลุดออกจากการจัดแถว
         แล้วเส้นขอบล่างกับความสูงของแถวจะไม่ตรงกับช่องอื่น (เจ้าของเห็น 19 ส.ค. 2026)
         ต้องห่อของข้างในด้วย div แล้วค่อยจัดเรียงที่ div นั้นแทน */
      h += '<tr class="perf-r' + (open ? " open" : "") + '"><th scope="row"><div class="rowhead">' +
        '<button type="button" class="rowtog" data-perf="' + esc(pk) + '" aria-expanded="' +
          (open ? "true" : "false") + '" title="กางดูคอนเทนต์ที่ทำยอดนี้">' +
          '<span class="caret">' + (open ? "▾" : "▸") + "</span>" +
          '<span class="pdot" style="background:' + P.rawColor + '"></span>' + esc(P.label) + "</button>" +
        '<button type="button" class="drill" data-tab="' + esc(pk) + '" ' +
          'title="ไปที่แท็บของ' + esc(P.label) + '">›</button></div></th>';

      COLS.forEach(function (c2) {
        if (!a) { h += '<td class="num na">—</td>'; return; }
        var v = colVal(c2, a, pk);
        var txt = cellText(v, c2.fmt);
        if (txt == null) {
          h += '<td class="num na"' + (c2.na ? ' title="' + esc(c2.na) + '"' : "") + ">—</td>";
          return;
        }
        var pv = b ? colVal(c2, b, pk) : null;
        h += '<td class="num' + (c2.strong ? " strong" : "") + '"><span class="cv">' + esc(txt) + "</span>" +
          (c2.noDelta ? "" : '<span class="cd">' + delta(v, pv, { pp: c2.pp }) + "</span>") + "</td>";
      });
      h += "</tr>";

      if (!open) return;

      /* แถวย่อย: คอนเทนต์ที่ทำยอดนั้น เรียงจากมากไปน้อยตามคอลัมน์หลักของแท็บ
         ⚠️ ค่าต่อโพสต์ที่ช่องไม่ได้ให้มา ต้องขึ้น "—" เหมือนแถวบน ไม่ใช่ 0 */
      var mainKey = ptab === "engagement" ? "engagement" : "reach";
      var list = postsIn(pk, r).map(function (po) {
        var one = { likes: po.likes || 0, comments: po.comments || 0, shares: po.shares || 0 };
        one[P.reachKey] = po[P.reachKey] || 0;
        one.reach = C.reachOf(pk, one);
        one.engagement = C.engagementOf(pk, one);
        one.er = P.er(one);
        ["views3s", "avgViewDuration", "completionRate", "watchTime"].forEach(function (k) {
          if (po[k] != null) one[k] = po[k];
        });
        one.posts = 1;
        one.avgPerPost = one.reach;
        return { po: po, a: one };
      }).sort(function (x, y) { return (y.a[mainKey] || 0) - (x.a[mainKey] || 0); });

      if (!list.length) {
        h += '<tr class="perf-sub"><td colspan="' + (COLS.length + 1) + '" class="sub-none">' +
          "ไม่มี" + esc(P.contentWord) + "ที่เผยแพร่ในช่วงนี้ — ตัวเลขข้างบนมาจากโพสต์เก่า</td></tr>";
        return;
      }

      /* ⚠️ ยอดของช่องไม่ได้มาจากโพสต์ในช่วงนี้ทั้งหมด — โพสต์เก่ายังมีคนดูอยู่
         ไม่บอกไว้ เจ้าของจะบวกแถวย่อยแล้วงงว่าทำไมไม่เท่ายอดข้างบน */
      var covered = list.reduce(function (t2, x) { return t2 + (x.a[mainKey] || 0); }, 0);
      var whole = a ? a[mainKey] || 0 : 0;
      h += '<tr class="perf-sub"><td colspan="' + (COLS.length + 1) + '" class="sub-note">' +
        esc(P.contentWord) + "ที่เผยแพร่ในช่วงนี้ " + list.length + " ใบ คิดเป็น " +
        esc(whole ? pct(covered / whole) : "—") + " ของยอดช่อง — ที่เหลือมาจากโพสต์ที่ลงไว้ก่อนหน้า</td></tr>";

      list.forEach(function (x) {
        var live = x.po.url && x.po.url !== "#";
        h += '<tr class="perf-sub"><td class="sub-t">' +
          (live ? '<a href="' + esc(x.po.url) + '" target="_blank" rel="noopener">' : "<span>") +
          esc(x.po.title) + (live ? ' <span class="ext">↗</span></a>' : "</span>") +
          '<span class="sub-d">' + esc(thaiShort(x.po.publishedAt)) + "</span></td>";
        COLS.forEach(function (c2) {
          var v = colVal(c2, x.a, pk);
          // ⚠️ "% ของยอดรวม" ของโพสต์ = ส่วนแบ่งในช่องตัวเอง ไม่ใช่ในยอดรวมทุกช่อง
          if (c2.key === "share") {
            var own = a && a.reach ? x.a.reach / a.reach : null;
            h += '<td class="num">' + esc(own == null ? "—" : pct(own)) + "</td>";
            return;
          }
          var txt = cellText(v, c2.fmt);
          h += '<td class="num' + (txt == null ? " na" : "") + '">' + esc(txt == null ? "—" : txt) + "</td>";
        });
        h += "</tr>";
      });
    });
    h += "</tbody></table></div></div>";

    /* ④ สัดส่วนแยกช่อง — แท่ง 100% หลายเส้น เส้นละตัวชี้วัด
     * 🔴 เดิมมีแท่งเดียว (Views / Reach) เจ้าของบอกว่า "ไม่มีประโยชน์" (19 ส.ค. 2026)
     *    ถูกแล้ว — แท่งเดียวบอกได้แค่ "ช่องไหนใหญ่" ซึ่งดูจากตารางก็รู้
     *    ประโยชน์อยู่ที่ "เทียบสัดส่วนข้ามตัวชี้วัด" เช่น ช่องที่กินยอดวิว 64%
     *    อาจได้คอมเมนต์แค่ 20% = คนดูเยอะแต่ไม่คุยด้วย
     * ⚠️ แชร์ไม่รวม YouTube เพราะไม่เปิดเผยตัวเลข — ต้องเขียนบอกไว้
     *    ไม่งั้นจะอ่านว่า "YouTube ไม่มีใครแชร์เลย" ซึ่งไม่จริง */
    var SHARE_ROWS = [
      { key: "reach", label: "Views / Reach" },
      { key: "engagement", label: "Engagement" },
      { key: "likes", label: "Likes" },
      { key: "comments", label: "Comments" },
      { key: "shares", label: "Shares", part: true },
    ];

    h += sec("สัดส่วนแยกช่อง", null,
      "แต่ละแถวคือตัวชี้วัดหนึ่งตัว แบ่ง 100% ตามช่อง · ประโยชน์อยู่ที่การเทียบข้ามแถว — " +
      "ช่องที่กินยอดวิวเยอะแต่ได้คอมเมนต์น้อย แปลว่าคนดูผ่านตาแต่ไม่ได้คุยด้วย " +
      "· หน่วย pt คือส่วนต่างของสัดส่วน เช่น จาก 40% เป็น 43% = +3 pt ไม่ใช่ +7.5%");

    h += '<div class="panel compact"><div class="sbars">';
    SHARE_ROWS.forEach(function (row) {
      // ช่องที่ไม่นับตัวนี้ (YouTube ไม่มีแชร์) ต้องไม่ถูกนับเป็น 0 ในฐาน
      var pks = order.filter(function (pk) {
        if (!cur[pk]) return false;
        if (!row.part) return true;
        return C.PLATFORMS[pk].parts.some(function (x) { return x.key === row.key; });
      });
      var tot = 0, pTot = 0;
      pks.forEach(function (pk) {
        tot += cur[pk][row.key] || 0;
        if (prev[pk]) pTot += prev[pk][row.key] || 0;
      });
      if (!tot) return;

      var segs = pks.map(function (pk) {
        return { label: C.PLATFORMS[pk].label, value: cur[pk][row.key] || 0, color: C.PLATFORMS[pk].rawColor, pk: pk };
      });
      var missing = order.filter(function (pk) { return pks.indexOf(pk) < 0; });

      h += '<div class="sbar-r"><div class="sbar-l">' + esc(row.label) +
        (missing.length
          ? ' <span class="sbar-x" title="' + esc(missing.map(function (pk) { return C.PLATFORMS[pk].label; }).join(" · ")) +
            ' ไม่เปิดเผยตัวเลขนี้ จึงไม่ได้นับในฐาน 100%">ไม่รวม ' +
            esc(missing.map(function (pk) { return C.PLATFORMS[pk].short; }).join("/")) + "</span>"
          : "") +
        "</div>" + CH.share100(segs) + '<div class="sbar-v">';
      segs.forEach(function (sg) {
        var sh = sg.value / tot;
        var pSh = cr && pTot && prev[sg.pk] ? (prev[sg.pk][row.key] || 0) / pTot : null;
        h += '<span class="sbar-i"><span class="lg-d" style="background:' + sg.color + '"></span>' +
          esc(pct(sh)) + (cr ? delta(sh, pSh, { pp: true }) : "") + "</span>";
      });
      h += "</div></div>";
    });
    h += "</div>";

    // ป้ายสีบอกว่าแท่งไหนคือช่องไหน — ประกาศครั้งเดียวใช้ได้ทุกแถว
    h += '<div class="legend row">' + order.map(function (pk) {
      var P = C.PLATFORMS[pk];
      return '<div class="lg"><span class="lg-d" style="background:' + P.rawColor + '"></span>' +
        '<span class="lg-n">' + esc(P.label) + "</span></div>";
    }).join("") + "</div></div>";

    /* ⑥ คอนเทนต์เด่น — 2 อันดับวางคู่กัน: คนมีส่วนร่วมมากสุด / คนดูมากสุด
     * ⚠️ หยิบ "ที่ดีที่สุดของแต่ละช่อง" ไม่เอาทุกช่องมาเรียงรวมกัน
     *    เพราะ ER คิดคนละสูตร ช่องที่นับแชร์ด้วยจะกวาดอันดับไปหมด (เจอจริงตอนรีวิว)
     *    วิธีนี้ได้ทั้งการเทียบข้ามช่องและหน้าที่ไม่ยาว */
    /* 🔴 ช่องละ 2 อันดับ (เจ้าของสั่ง 19 ส.ค. 2026) — ใบเดียวต่อช่องบอกไม่ได้ว่า
       ใบที่ชนะมันโดดออกมาใบเดียว หรือทั้งช่องทำได้ดีพอๆ กัน */
    var TOP_PER_CHANNEL = 2;

    function bestList(rank) {
      var waiting = false;
      var rows = order.map(function (pk) {
        var P = C.PLATFORMS[pk];
        var inRange = topFor(pk, r);
        if (inRange === undefined) { waiting = true; return { pk: pk, top: [], best: null }; }

        /* ⚠️ ช่องที่ยังทำอันดับตามช่วงไม่ได้ (null) ตกไปใช้วิธีเดิม —
           คัดจากคลิปที่ "ลง" ในช่วงนั้น · ต้องบอกไว้ในหัวข้อว่าคนละเกณฑ์กัน */
        var pool = inRange || postsIn(pk, r);
        var top = pool
          .map(function (p) { return { p: p, v: rank === "er" ? P.er(p) : (p[P.reachKey] || 0) }; })
          .filter(function (x) { return x.v != null; })
          .sort(function (x, y) { return y.v - x.v; })
          .slice(0, TOP_PER_CHANNEL);
        return { pk: pk, top: top, best: top[0] };
      });

      if (waiting) {
        return '<div class="loading"><span class="spin"></span> กำลังจัดอันดับคอนเทนต์ของช่วงนี้…</div>';
      }
      if (!rows.some(function (x) { return x.best; })) {
        return empty("ไม่มีคอนเทนต์ที่มียอดเข้ามาในช่วงนี้", "ลองขยายช่วงเวลา");
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
          (x.top.length
            ? x.top.map(function (t2, i) { return postRow(t2.p, x.pk, { rank: i + 1 }); }).join("")
            : '<div class="tcard-none">ไม่มี' + esc(P.contentWord) + "ที่เผยแพร่ในช่วงนี้</div>") +
          "</div></div>";
      }).join("") + "</div>";
    }

    h += '<div class="duo">' +
      '<div class="duo-c">' +
        /* ⚠️ เรียงตาม "อัตราส่วน" ไม่ใช่ "จำนวน" — ชื่อหัวข้อต้องบอกให้ตรง
       ไม่งั้นพอโชว์จำนวน engagement ด้วยแล้ว จะดูเหมือนเรียงผิด */
    /* ⚠️ ต้องเขียนให้ชัดว่า "คัดจากอะไร" และ "เรียงด้วยอะไร" (เจ้าของถาม 19 ส.ค. 2026)
       คัด = คลิปที่ "เผยแพร่" ในช่วงที่เลือก ไม่ใช่คลิปที่ "มียอดเข้ามา" ในช่วงนั้น
       เรียง = ยอดสะสมตลอดอายุคลิป ไม่ใช่ยอดที่เกิดขึ้นเฉพาะในช่วงที่เลือก
       ไม่บอกไว้ = อ่านแล้วเข้าใจไปคนละอย่างได้ 3 แบบ */
    /* 🔴 เกณฑ์เปลี่ยนแล้ว (เจ้าของเลือกแบบ A · 19 ส.ค. 2026)
       เดิม: คัดเฉพาะคลิปที่ "ลง" ในช่วงนี้ → คลิปเก่าที่ดังขึ้นมาใหม่ไม่ติดอันดับเลย
       ตอนนี้: ทุกคลิป เรียงตามยอดที่ "เกิดขึ้นจริง" ในช่วงที่เลือก
       ⚠️ ตัวเลขที่เห็นจึงเป็นยอดของช่วงนี้ ไม่ใช่ยอดสะสมตลอดอายุคลิป
          ต้องเขียนบอก ไม่งั้นเอาไปเทียบกับตัวเลขในหน้า YouTube Studio แล้วงงว่าทำไมไม่ตรง */
    sec("Engagement rate สูงสุด", "ยอดที่เกิดในช่วงนี้ · รวมคลิปเก่าที่กลับมาดัง",
          "คิดจากยอดที่ \"เกิดขึ้นจริงในช่วงที่เลือก\" ไม่ได้ดูว่าคลิปลงเมื่อไหร่ — " +
          "คลิปที่ลงไปนานแล้วแต่ช่วงนี้มีคนดูเยอะก็ติดอันดับได้ " +
          "· ตัวเลขที่เห็นเป็นยอดเฉพาะช่วงนี้ ไม่ใช่ยอดสะสมตั้งแต่วันที่ลง " +
          "· แต่ละช่องคิด ER คนละสูตร จึงหยิบมาช่องละ 2 ใบ ไม่เอามาเรียงรวมกัน · กดเพื่อเปิดโพสต์จริง") +
        '<div class="panel">' + bestList("er") + "</div>" +
      "</div>" +
      '<div class="duo-c">' +
        sec("Views / Reach สูงสุด", "ยอดที่เกิดในช่วงนี้ · รวมคลิปเก่าที่กลับมาดัง",
          "คิดจากยอดที่ \"เกิดขึ้นจริงในช่วงที่เลือก\" ไม่ได้ดูว่าคลิปลงเมื่อไหร่ " +
          "· ตัวเลขที่เห็นเป็นยอดเฉพาะช่วงนี้ ไม่ใช่ยอดสะสมตั้งแต่วันที่ลง " +
          "· เป็นคนละอันดับกับฝั่งซ้าย เพราะใบที่คนดูเยอะไม่ได้แปลว่า Engagement เยอะ") +
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
  /* ── กลุ่มช่วงเวลาของกราฟ (วัน / สัปดาห์ / เดือน) ────────────────────
   * ⚠️ วิธีรวมค่าไม่เหมือนกันในแต่ละ metric ห้ามบวกดื้อๆ ทั้งหมด
   *    ผู้ติดตาม = "ระดับ" ต้องเอา "ค่าสุดท้ายของช่วง" (บวกกันคือคนละความหมาย)
   *    ยอดวิว/การมีส่วนร่วม = "เหตุการณ์" บวกกันได้
   *    ER = อัตราส่วน ต้องคิดใหม่จาก (ผลรวมการมีส่วนร่วม ÷ ผลรวมการมองเห็น)
   *        ห้ามเอา ER รายวันมาเฉลี่ย — วันที่คนดูน้อยจะถ่วงเท่าวันที่คนดูเยอะ ซึ่งผิด
   * ⚠️ สัปดาห์เริ่มวันอาทิตย์ตามปฏิทินไทย (ให้ตรงกับปฏิทินในแผงเลือกช่วงเวลา) */
  var GRAINS = [
    { key: "day", label: "รายวัน" },
    { key: "week", label: "รายสัปดาห์" },
    { key: "month", label: "รายเดือน" },
  ];

  function bucketsOf(r, grain) {
    var days = dateList(r), out = [], byKey = {};
    days.forEach(function (dk) {
      var d = parseKey(dk), bk, label;
      if (grain === "month") {
        bk = dk.slice(0, 7);
        label = TH_MON[d.getMonth()] + " " + String(d.getFullYear()).slice(2);
      } else if (grain === "week") {
        var ws = addDays(d, -d.getDay());
        bk = key(ws);
        label = thaiShort(bk);
      } else {
        bk = dk;
        label = thaiShort(dk);
      }
      if (!byKey[bk]) { byKey[bk] = { key: bk, label: label, days: [] }; out.push(byKey[bk]); }
      byKey[bk].days.push(dk);
    });
    return out;
  }

  /** จำนวนกลุ่มที่จะได้ถ้าเลือกช่วงเวลานั้น — น้อยกว่า 2 จุด วาดกราฟไม่ได้ */
  function grainCount(r, grain) { return bucketsOf(r, grain).length; }

  /* ── กราฟแนวโน้มของหน้าภาพรวม — เส้นเดียว ─────────────────────────
   * 🔴 เดิมวาดเส้นรวม + เส้นรายช่องซ้อนกัน 4 เส้น (เจ้าของสั่งเปลี่ยน 19 ส.ค. 2026)
   *    ช่องที่ตัวเลขต่างกันหลายเท่าอยู่บนแกนเดียวกัน เส้นเล็กเลยแบนติดพื้น
   *    ตอนนี้เลือกดูทีละเส้นด้วยแท็บ "รวม / YouTube / TikTok / Facebook"
   *    แกนจึงขยายเต็มกรอบให้เส้นที่กำลังดูอยู่เสมอ
   * ⚠️ แท็บ "รวม" ต้องนับเฉพาะช่องที่เปิดอยู่ (order) ให้ตรงกับตัวเลขรวมข้างบน
   */
  function trendSeries(order, r, m, grain, chKey) {
    var buckets = bucketsOf(r, grain);
    var pks = chKey === "all" ? order : [chKey];

    var lut = {}, dayLut = {};
    pks.forEach(function (pk) {
      var mm = {};
      (m.source === "followers" ? followersIn(pk, r) : dailyIn(pk, r))
        .forEach(function (x) { mm[x.date] = x; });
      lut[pk] = mm;
      var dd = {};
      dailyIn(pk, r).forEach(function (x) { dd[x.date] = x; });
      dayLut[pk] = dd;
    });

    var points = buckets.map(function (b) {
      if (m.key === "er") {
        var eng = 0, base = 0, seen = false;
        b.days.forEach(function (dk) {
          pks.forEach(function (pk) {
            var row = dayLut[pk][dk];
            if (!row) return;
            seen = true;
            eng += C.engagementOf(pk, row);
            base += row[C.PLATFORMS[pk].reachKey] || 0;
          });
        });
        return { y: !seen || !base ? null : (eng / base) * 100 };
      }

      if (m.source === "followers") {
        // ระดับ ณ วันสุดท้ายของกลุ่มที่มีข้อมูล — บวกกันไม่ได้
        var sum = null;
        for (var i = b.days.length - 1; i >= 0; i--) {
          var got = 0, any = false;
          pks.forEach(function (pk) {
            var row = lut[pk][b.days[i]];
            if (!row) return;
            var v = m.at(pk, row);
            if (v == null) return;
            any = true; got += v;
          });
          if (any) { sum = got; break; }
        }
        return { y: sum };
      }

      var tot = 0, has = false;
      b.days.forEach(function (dk) {
        pks.forEach(function (pk) {
          var row = lut[pk][dk];
          if (!row) return;
          var v = m.at(pk, row);
          if (v == null) return;
          has = true; tot += v;
        });
      });
      return { y: has ? tot : null };
    });

    return { labels: buckets.map(function (b) { return b.label; }), points: points };
  }

  function metricTrend(order, r, mk, height, id) {
    var m = metricOf(mk);
    var chKey = state.trendCh;
    // ช่องที่ถูกปิดด้วยชิพ ห้ามค้างเป็นแท็บที่เลือกอยู่ — ตกกลับไปที่ "รวม"
    if (chKey !== "all" && order.indexOf(chKey) < 0) chKey = "all";

    var grain = state.grain;
    if (grainCount(r, grain) < 2) grain = "day";

    var d = trendSeries(order, r, m, grain, chKey);
    if (!d.points.some(function (p) { return p.y != null; })) return empty("ไม่มีข้อมูลในช่วงนี้");

    var color = chKey === "all" ? "#111827" : C.PLATFORMS[chKey].rawColor;
    var label = chKey === "all" ? "รวมทุกช่อง" : C.PLATFORMS[chKey].label;

    return CH.line({
      id: id + "-" + chKey + "-" + grain,
      labels: d.labels, series: [{ label: label, color: color, tipFmt: m.tipFmt, points: d.points }],
      height: height || 200,
      // ⚠️ ผู้ติดตามห้ามบังคับให้เริ่มที่ 0 — เส้นจะไปกองอยู่บนสุดจนดูไม่ออกว่าขยับ
      zeroFloor: m.key !== "followers",
      baseZero: m.key !== "followers" && m.key !== "er",
      fmtYNum: m.unit === "%" ? null : num,
      unitLeft: m.unit || "", aria: "แนวโน้ม " + m.label + " ของ " + label,
    });
  }

  /** แถวควบคุมเหนือกราฟ: เลือกช่อง (เส้นเดียว) + ความละเอียดของแกนเวลา */
  function trendControls(order, r) {
    var chKey = state.trendCh;
    if (chKey !== "all" && order.indexOf(chKey) < 0) chKey = "all";

    var tabs = [{ key: "all", label: "รวม" }].concat(order.map(function (pk) {
      return { key: pk, label: C.PLATFORMS[pk].label, color: C.PLATFORMS[pk].rawColor };
    }));

    var h = '<div class="trendbar">' +
      '<div class="chtabs">' + tabs.map(function (x) {
        return '<button type="button" class="chtab' + (chKey === x.key ? " on" : "") +
          '" data-tch="' + esc(x.key) + '"' + (x.color ? ' style="--pc:' + x.color + '"' : "") + ">" +
          (x.color ? '<span class="pdot"></span>' : "") + esc(x.label) + "</button>";
      }).join("") + "</div>" +
      '<div class="seg grain">' + GRAINS.map(function (g) {
        /* ⚠️ ช่วงสั้นๆ เลือก "รายเดือน" แล้วได้จุดเดียว วาดกราฟไม่ได้
           ปิดปุ่มไปเลยพร้อมบอกเหตุผล ดีกว่าให้กดแล้วได้กราฟเปล่า */
        var few = grainCount(r, g.key) < 2;
        return '<button type="button" class="' + (state.grain === g.key && !few ? "on" : "") +
          '" data-grain="' + g.key + '"' + (few ? ' disabled title="ช่วงที่เลือกสั้นเกินไปสำหรับมุมมองนี้"' : "") +
          ">" + esc(g.label) + "</button>";
      }).join("") + "</div></div>";
    return h;
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

    /* ⚠️ ช่องที่ยังไม่มีตัวเลขรายวัน ต้องโชว์ของที่มีจริง (ยอดปัจจุบัน + คอนเทนต์)
       ไม่ใช่บอกว่า "ไม่มีข้อมูล ลองขยายช่วงเวลา" ซึ่งชี้ทางผิด — ขยายเท่าไหร่ก็ไม่มี */
    if (isPartial(pk)) return partialNote(pk) + partialContent(pk);

    if (!a) return empty("ไม่มีข้อมูลของ " + P.label + " ในช่วงที่เลือก", "ลองขยายช่วงเวลา หรือเลือกวันที่ใหม่");

    var h = "";

    // ① สรุปของช่อง — รวม metric เฉพาะแพลตฟอร์มไว้ในกริดเดียวกัน
    // ⚠️ เดิมแยกเป็น 2 กริด ทำให้ TikTok เหลือใบ "ดูจนจบ" ลอยเดี่ยวท้ายแถว
    //    รวมเป็นกริดเดียวแล้วสั่งจำนวนคอลัมน์ตามจำนวนใบจริง (--n)
    var cards = [
      { label: "ผู้ติดตาม", value: g ? full(g.end) : null, d: delta(g ? g.end : null, pg ? pg.end : null) },
      { label: "เพิ่มสุทธิในช่วงนี้", value: g ? full(g.net) : null, d: delta(g ? g.net : null, pg ? pg.net : null) },
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
            zeroFloor: true, baseZero: opt.baseZero, fmtYNum: opt.fmtYNum,
            // ⚠️ วินาทีดิบบนแกนอ่านยาก (245 ไม่รู้ว่านานแค่ไหน) แปลงเป็น น:วว
            fmtY: opt.fmtYSec ? function (v) { return dur(v); } : null,
            unitLeft: opt.unit || "",
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
      '<div class="duo-c">' + dailyPanel(P.reachLabel + " รายวัน",
        "จำนวน " + P.reachLabel + " ที่เกิดขึ้นในแต่ละวัน · วันที่ไม่มีข้อมูลเส้นจะขาด ไม่ใช่ลากลงศูนย์",
        sView, { id: "p-" + pk + "-v", baseZero: true, fmtYNum: num }) + "</div>" +
      '<div class="duo-c">' + dailyPanel("Engagement rate รายวัน",
        P.erFormula + " · " + P.erNote +
        " · แกนไม่ได้เริ่มจาก 0 เพราะค่าจริงอยู่ในช่วงแคบ ให้ดูรูปทรงว่าวันไหนดีกว่าวันไหน ไม่ใช่ดูความสูงของเส้น",
        sEr, { id: "p-" + pk + "-er", unit: "%" }) + "</div>" +
      "</div>";

    /* ②b คุณภาพการดู — Retention กับเวลาที่ดูเฉลี่ย
     * 🔴 เจ้าของสั่งเพิ่ม 19 ส.ค. 2026 — YouTube ให้น้ำหนักกับ "เวลาที่คนดู" เป็นหลัก
     *    ยอดวิวอย่างเดียวบอกไม่ได้ว่าคลิปดีจริงหรือแค่ปกดี
     * ⚠️ ขึ้นเฉพาะช่องที่ให้ตัวเลขนี้จริง (ดู stats ใน metrics.js) — Facebook ไม่มี
     * ⚠️ Retention ของแต่ละเจ้านิยามไม่เหมือนกัน ต้องเขียนบอกในหัวข้อของช่องนั้นเลย
     *    YouTube = ดูเฉลี่ยกี่ % ของความยาวคลิป · TikTok = สัดส่วนที่ดูจนจบจริง */
    var hasRet = C.hasStat(pk, "completionRate") &&
      rows.some(function (x) { return x.completionRate != null; });
    var hasAvd = C.hasStat(pk, "avgViewDuration") &&
      rows.some(function (x) { return x.avgViewDuration != null; });

    if (hasRet || hasAvd) {
      var retWhat = pk === "youtube"
        ? "ดูเฉลี่ยกี่ % ของความยาวคลิป — คลิป 10 นาที คนดูเฉลี่ย 4 นาที = 40%"
        : "สัดส่วนของการดูที่ดูไปจนจบ";

      h += '<div class="duo">';
      if (hasRet) {
        h += '<div class="duo-c">' + dailyPanel("Retention รายวัน",
          retWhat + " · เป็นตัวชี้วัดคุณภาพของคอนเทนต์ที่ตรงกว่ายอดวิว — " +
          "ยอดวิวบอกว่าคนกดเข้ามากี่คน (ปกดี) ส่วน retention บอกว่าเข้ามาแล้วอยู่ต่อไหม (เนื้อดี) " +
          "· แกนไม่ได้เริ่มจาก 0 เพราะค่าจริงอยู่ในช่วงแคบ ให้ดูรูปทรง ไม่ใช่ความสูงของเส้น",
          { label: "Retention", color: "#7c3aed", tipFmt: "pctnum",
            points: rows.map(function (x) {
              // ไม่มีค่า = ไม่รู้ ไม่ใช่ 0 → ส่ง null ให้เส้นขาด
              return { y: x.completionRate == null ? null : x.completionRate * 100 };
            }) },
          { id: "p-" + pk + "-ret", unit: "%" }) + "</div>";
      }
      if (hasAvd) {
        h += '<div class="duo-c">' + dailyPanel("เวลาที่ดูเฉลี่ยต่อครั้ง รายวัน",
          "ดูนานเฉลี่ยกี่นาที:วินาทีต่อการดู 1 ครั้ง · คู่กับ Retention — " +
          "คลิปยาวที่ retention ต่ำ อาจมีเวลาดูจริงมากกว่าคลิปสั้นที่ retention สูง",
          { label: "ดูเฉลี่ยต่อครั้ง", color: "#0891b2", tipFmt: "dur",
            points: rows.map(function (x) {
              return { y: x.avgViewDuration == null ? null : x.avgViewDuration };
            }) },
          { id: "p-" + pk + "-avd", fmtYSec: true }) + "</div>";
      }
      h += "</div>";
    }

    // ③ แยกประเภทการมีส่วนร่วม
    var parts = P.parts.map(function (p) { return { key: p.key, label: p.label, value: a[p.key] || 0, color: p.color }; });
    var totalPart = parts.reduce(function (s, p) { return s + p.value; }, 0);
    h += sec("Engagement แยกประเภท", null, P.erNote);
    h += '<div class="panel">';
    if (totalPart) {
      /* 🔴 เปลี่ยนจากแท่งซ้อน 100% เป็นแท่งแนวนอนแถวละประเภท (เจ้าของแจ้ง 19 ส.ค. 2026)
         แท่งซ้อนอ่านไม่ได้เมื่อสัดส่วนต่างกันมาก — Likes 92% กับ Comments 0.7%
         อยู่ในแท่งเดียวกัน ช่องของ Comments จะบางจนมองไม่เห็น */
      h += CH.hbars(parts.map(function (p) {
        return {
          label: p.label, color: p.color, value: p.value, text: num(p.value),
          extra: delta(p.value, b ? b[p.key] : null),
        };
      }), { aria: "Engagement แยกประเภท" });
    } else {
      h += empty("ไม่มี Engagement ในช่วงนี้");
    }
    h += "</div>";

    // ④⑤⑥⑦ คอนเทนต์
    var posts = postsIn(pk, r);
    var withEr = posts.map(function (p) { return { p: p, er: P.er(p) }; }).filter(function (x) { return x.er != null; });
    var now = midnight(new Date());
    var ageOf = function (p) { return Math.round((now - parseKey(p.publishedAt)) / 864e5); };

    h += sec(P.contentWord + "ที่ Engagement สูงสุด") + '<div class="panel">' +
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
  /* ── ปฏิทินเลือกช่วงวันที่ ─────────────────────────────────────────
   * 🔴 เขียนเอง ไม่มีไลบรารี — ทั้งโปรเจกต์เป็น static ไม่มีขั้นตอน build
   *    และหน้านี้จะอยู่หลัง Cloudflare Access ซึ่งโหลดของจาก CDN ภายนอกไม่ได้
   * ⚠️ วันในอนาคตต้องกดไม่ได้ ไม่ใช่กดได้แล้วค่อยตัดทีหลัง — เราไม่มีข้อมูลของวันพรุ่งนี้
   * ⚠️ สัปดาห์เริ่มวันอาทิตย์ตามปฏิทินไทย
   */
  var TH_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

  /** เดือนขวาสุดที่ปฏิทินเปิดอยู่ — ยึดจากวันสิ้นสุดของช่วงที่เลือกถ้าผู้ใช้ยังไม่เลื่อนเอง */
  function calAnchorMonth() {
    if (state.calAnchor) {
      var q = state.calAnchor.split("-");
      return new Date(+q[0], +q[1] - 1, 1);
    }
    var r = range(), d = parseKey(r.to);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function monthGrid(first, sel, today) {
    var y = first.getFullYear(), m = first.getMonth();
    var lead = new Date(y, m, 1).getDay();
    var days = new Date(y, m + 1, 0).getDate();

    var out = '<div class="cal-m"><div class="cal-mh">' + TH_MON[m] + " " + y + "</div>" +
      '<div class="cal-g">' + TH_DOW.map(function (d) { return '<span class="cal-w">' + d + "</span>"; }).join("");
    for (var i = 0; i < lead; i++) out += '<span class="cal-x"></span>';

    for (var day = 1; day <= days; day++) {
      var k = key(new Date(y, m, day));
      var future = k > today;
      var cls = "cal-d";
      if (sel.from && sel.to) {
        if (k === sel.from) cls += " s";
        if (k === sel.to) cls += " e";
        if (k > sel.from && k < sel.to) cls += " in";
      } else if (sel.from && k === sel.from) {
        cls += " s e";
      }
      if (k === today) cls += " today";
      out += '<button type="button" class="' + cls + '" data-day="' + k + '"' +
        (future ? " disabled" : "") + ' aria-label="' + esc(thaiFull(k)) + '">' + day + "</button>";
    }
    return out + "</div></div>";
  }

  function renderCalendar() {
    var t = midnight(new Date()), today = key(t);
    var right = calAnchorMonth();
    var left = new Date(right.getFullYear(), right.getMonth() - 1, 1);

    /* ระหว่างเลือกอยู่ (คลิกไปแล้ว 1 ครั้ง) ให้ไฮไลต์แค่วันเดียว
       ⚠️ ห้ามเอาช่วงเดิมมาโชว์คู่กัน จะดูเหมือนเลือกได้ 2 ช่วงพร้อมกัน */
    var sel;
    if (state.picking) sel = { from: state.start, to: null };
    else { var r = range(); sel = { from: r.from, to: r.to }; }

    // เลื่อนไปข้างหน้าเกินเดือนปัจจุบันไม่ได้ — ไม่มีข้อมูลของอนาคต
    var atNow = right.getFullYear() === t.getFullYear() && right.getMonth() === t.getMonth();

    return '<div class="pp-cal2">' +
      '<div class="cal-nav">' +
        '<button type="button" class="cal-b" data-cal="prev" aria-label="เดือนก่อนหน้า">‹</button>' +
        '<span class="cal-t">' + esc(TH_MON[left.getMonth()] + " " + left.getFullYear()) + " – " +
          esc(TH_MON[right.getMonth()] + " " + right.getFullYear()) + "</span>" +
        '<button type="button" class="cal-b" data-cal="next" aria-label="เดือนถัดไป"' +
          (atNow ? " disabled" : "") + ">›</button>" +
      "</div>" +
      '<div class="cal-ms">' + monthGrid(left, sel, today) + monthGrid(right, sel, today) + "</div>" +
      '<p class="pp-note">' +
        (state.picking ? "เลือกวันสิ้นสุดอีกครั้ง" : "กดวันเริ่ม แล้วกดวันสิ้นสุด · เลือกได้ถึงวันนี้เท่านั้น") +
      "</p></div>";
  }

  function renderPeriod() {
    var t = midnight(new Date()), r = range();
    var p = presetOf(state.preset);
    var btnText = state.preset === "custom" ? rangeText(r.from, r.to) : presetLabel(p, t);

    /* 🔴 ปุ่มต้องบอกด้วยว่ากำลังเทียบกับช่วงไหน (เจ้าของสั่ง 19 ส.ค. 2026)
       ตัวเลือกโหมดเทียบซ่อนอยู่ในแผงที่ต้องกดเปิด ถ้าปุ่มไม่บอก จะไม่มีอะไรบนหน้า
       บอกเลยว่าตัวเลข ▲▼ ทั้งหน้ากำลังเทียบกับอะไรอยู่ */
    var cmpLine = compareRange() ? "เทียบกับ" + compareText() : "ไม่ได้เทียบกับช่วงไหน";

    var h = '<button type="button" class="periodbtn' + (state.periodOpen ? " on" : "") + '" data-period="toggle" ' +
      'aria-expanded="' + (state.periodOpen ? "true" : "false") + '">' +
      '<span class="pb-ic">🗓</span><span class="pb-t">' + esc(btnText) + "</span>" +
      '<span class="pb-sub">' + esc(rangeText(r.from, r.to)) + " (" + r.days + " วัน)</span>" +
      '<span class="pb-cmp">' + esc(cmpLine) + "</span>" +
      '<span class="pb-caret">▾</span></button>';

    if (!state.periodOpen) return h;

    h += '<div class="periodpanel" role="dialog" aria-label="เลือกช่วงเวลา">' +
      /* ช่องวันที่พิมพ์เองได้ — ปฏิทินใช้กดเลือกช่วงใกล้ๆ ส่วนช่วงที่ไกลมาก
         (ย้อนไปหลายปี) กดทีละเดือนไม่ไหว ต้องพิมพ์เอา
         ⚠️ max = วันนี้เสมอ ไม่มีข้อมูลของอนาคต */
      '<div class="pp-head">' +
        '<input type="date" id="d1" class="pp-dt" max="' + key(t) + '" value="' + esc(r.from) + '" aria-label="วันเริ่ม">' +
        '<span class="pp-dash">–</span>' +
        '<input type="date" id="d2" class="pp-dt" max="' + key(t) + '" value="' + esc(r.to) + '" aria-label="วันสิ้นสุด">' +
        '<span class="pp-days">(' + r.days + ' วัน)</span></div>' +
      /* ⚠️ ส่วนกลางต้องเลื่อนได้ ไม่งั้นแผงสูงเกินจอ (ตัวเลือกสำเร็จรูป 13 อัน +
         ปฏิทิน 2 เดือน + ตัวเลือกเทียบ = เกือบ 1000px) แล้วปุ่มล่างๆ กดไม่ถึง */
      '<div class="pp-scroll"><div class="pp-body">' +
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
      }).join("") + "</div>" +
      renderCalendar() +
      "</div>";

    /* ── เทียบกับช่วงอื่น — อยู่ในแผงเดียวกับช่วงเวลา (แบบ GA4)
       🔴 เดิมเป็นแถวปุ่มแยกอยู่บนแถบควบคุม กินพื้นที่ตลอดเวลาทั้งที่นานๆ เปลี่ยนที
          และอยู่คนละที่กับช่วงเวลาที่มันอ้างอิงถึง */
    var cmpOn = state.compare !== "none";
    h += '<div class="pp-cmp">' +
      '<button type="button" class="pp-sw' + (cmpOn ? " on" : "") + '" data-cmp="' +
        (cmpOn ? "none" : (state.lastCompare || "prev")) + '" role="switch" ' +
        'aria-checked="' + (cmpOn ? "true" : "false") + '">' +
        '<span class="pp-sw-t"></span>เทียบกับช่วงอื่น</button>';
    if (cmpOn) {
      h += '<div class="pp-cmp-l">' + COMPARE.filter(function (x) { return x.key !== "none"; })
        .map(function (x) {
          var save = state.compare, txt;
          state.compare = x.key;
          var crx = compareRange();
          txt = crx ? rangeText(crx.from, crx.to) : "";
          state.compare = save;
          return '<button type="button" class="pp-c' + (state.compare === x.key ? " on" : "") +
            '" data-cmp="' + esc(x.key) + '"><span class="pp-n">' + esc(x.label) + "</span>" +
            '<span class="pp-r">' + esc(txt) + "</span></button>";
        }).join("") + "</div>";
    }
    h += "</div>";

    h += "</div>";   // ปิด .pp-scroll

    h += '<div class="pp-foot"><span class="pp-cur">' + esc(rangeText(r.from, r.to)) +
      " (" + r.days + " วัน)</span>" +
      '<button type="button" class="pp-done" data-period="close">เสร็จ</button></div></div>';
    return h;
  }

  function renderControls() {
    var r = range(), cr = compareRange();

    /* 🔴 ปุ่ม "เทียบกับ" ย้ายเข้าไปอยู่ในแผงเลือกช่วงเวลาแล้ว (แบบ GA4)
       เดิมเป็นแถวปุ่มค้างอยู่ตรงนี้ กินพื้นที่แถบติดขอบตลอดเวลาทั้งที่นานๆ เปลี่ยนที
       และอยู่คนละที่กับช่วงเวลาที่มันอ้างอิงถึง */
    var h = '<div class="ctrl-row">';

    // ชิพเลือกช่อง + ปุ่มแยกช่อง — มีผลกับหน้าภาพรวมเท่านั้น
    if (state.tab === "summary") {
      h += '<div class="chips" id="chips">' + C.ORDER.map(function (pk) {
        var P = C.PLATFORMS[pk], on = state.channels[pk] && isOn(pk);
        /* ⚠️ ช่องที่ยังไม่เชื่อมต้องกดไม่ได้ ไม่ใช่กดติดแล้วไม่มีอะไรเปลี่ยน
           (กดแล้วหน้าเหมือนเดิม = ดูเหมือนปุ่มเสีย) */
        if (!isOn(pk) || isPartial(pk)) {
          var why = isOn(pk)
            ? { tip: "เชื่อมต่อแล้ว แต่ยังไม่มีตัวเลขรายวัน — เปิดแท็บของช่องนี้เพื่อดูตัวเลขที่มีอยู่", tag: " (ไม่มีรายวัน)" }
            : { tip: "ยังไม่ได้เชื่อมต่อ — เปิดแท็บของช่องนี้เพื่อดูว่าต้องใส่ค่าอะไร", tag: " (ยังไม่เชื่อม)" };
          return '<button type="button" class="ch off" disabled title="' + esc(why.tip) + '" ' +
            'style="--pc:' + P.rawColor + '"><span class="pdot"></span>' + esc(P.label) + esc(why.tag) + "</button>";
        }
        return '<button type="button" class="ch' + (on ? " on" : "") + '" data-ch="' + pk + '" ' +
          'aria-pressed="' + (on ? "true" : "false") + '" style="--pc:' + P.rawColor + '">' +
          '<span class="pdot"></span>' + esc(P.label) + "</button>";
      }).join("") + "</div>";

    }
    h += "</div>";

    /* 🔴 บรรทัดสรุป "ช่วงไหน · เทียบกับอะไร" ย้ายไปอยู่บนปุ่มเลือกช่วงเวลาแล้ว
       เดิมอยู่ตรงนี้ซึ่งซ้ำกับปุ่ม และกินความสูงของแถบติดขอบตลอดเวลา */
    return h;
  }

  function renderTabs() {
    return C.TABS.map(function (t) {
      return '<button type="button" class="tab' + (state.tab === t.key ? " on" : "") + '" data-tab="' + t.key + '">' +
        '<span class="ti">' + esc(t.icon) + "</span>" + esc(t.label) + "</button>";
    }).join("");
  }

  function render() {
    /* ⚠️ ยังไม่มีข้อมูล = "กำลังมา" ต้องมีไอคอนหมุน ไม่ใช่หน้าว่างเปล่า
       (ฟีเจอร์มาตรฐานข้อ 6 ของโปรเจกต์ — ข้อความเปล่าๆ อ่านแล้วเหมือนหน้าค้าง) */
    if (!DATA) {
      document.getElementById("periodbox").innerHTML = "";
      document.getElementById("controls").innerHTML = "";
      document.getElementById("tabs").innerHTML = "";
      document.getElementById("view").innerHTML = LOAD_ERR
        ? '<div class="empty"><div class="empty-i">⚠️</div><div><b>โหลดข้อมูลไม่สำเร็จ</b>' +
          "<div>" + esc(LOAD_ERR) + "</div></div></div>"
        : '<div class="loading"><span class="spin"></span> กำลังดึงข้อมูล…</div>';
      return;
    }

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
    // ⚠️ ค่าที่เป็นวินาทีต้องอ่านเป็น น:วว — 245 วินาทีดิบไม่มีใครรู้ว่านานแค่ไหน
    if (kind === "dur") return dur(v);
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

    var t = e.target.closest("[data-tab],[data-period],[data-preset],[data-cmp],[data-sort],[data-ch],[data-lg],[data-metric],[data-cal],[data-day],[data-tch],[data-grain],[data-ptab],[data-perf]");

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


    if (t.dataset.metric) { state.metric = t.dataset.metric; render(); return; }

    if (t.dataset.tch) { state.trendCh = t.dataset.tch; render(); return; }
    if (t.dataset.grain) { state.grain = t.dataset.grain; render(); return; }
    if (t.dataset.ptab) { state.perfTab = t.dataset.ptab; render(); return; }
    if (t.dataset.perf) {
      var rk = t.dataset.perf;
      state.perfOpen[rk] = !state.perfOpen[rk];
      render(); return;
    }

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

    /* เลื่อนเดือนของปฏิทิน — ไม่แตะช่วงที่เลือกไว้ แค่เปลี่ยนเดือนที่มองอยู่ */
    if (t.dataset.cal) {
      var an = calAnchorMonth();
      an.setMonth(an.getMonth() + (t.dataset.cal === "next" ? 1 : -1));
      state.calAnchor = key(an);
      render(); return;
    }

    /* กดวันบนปฏิทิน — คลิกแรกตั้งวันเริ่ม คลิกที่สองตั้งวันจบ คลิกที่สามเริ่มใหม่
       ⚠️ กดย้อนหลัง (วันจบมาก่อนวันเริ่ม) ต้องสลับให้ ไม่ใช่ไม่ยอมรับ */
    if (t.dataset.day) {
      var d = t.dataset.day;
      if (!state.picking) {
        state.preset = "custom";
        state.start = d; state.end = d; state.picking = true;
      } else {
        if (d < state.start) { state.end = state.start; state.start = d; }
        else state.end = d;
        state.picking = false;
      }
      state.calAnchor = null;   // ให้ปฏิทินยึดตามช่วงที่เพิ่งเลือก
      render(); return;
    }

    if (t.dataset.cmp) {
      // จำโหมดเดิมไว้ กดสวิตช์เปิดกลับจะได้ของเดิม ไม่ใช่ค่าตั้งต้นเสมอ
      if (state.compare !== "none") state.lastCompare = state.compare;
      state.compare = t.dataset.cmp;
      render(); return;
    }

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
    // พิมพ์วันที่เอง = ใช้ช่วงกำหนดเอง ไม่ใช่ยังค้างที่ชุดสำเร็จรูปเดิม
    if (state.start && state.end) {
      state.preset = "custom";
      state.picking = false;
      state.calAnchor = null;   // ให้ปฏิทินเลื่อนไปที่ช่วงที่เพิ่งพิมพ์
      render();
    }
  }

  function mockBanner() {
    if (document.getElementById("mockbar")) return;
    var b = document.createElement("div");
    b.id = "mockbar";
    b.textContent = "⚠️ ข้อมูลจำลองสำหรับออกแบบ — ยังไม่ได้ต่อข้อมูลจริง ห้ามนำตัวเลขไปใช้อ้างอิง";
    document.body.insertBefore(b, document.body.firstChild);
    document.title = "[ข้อมูลจำลอง] " + document.title;
  }

  function start() {
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    render();   // วาดสถานะกำลังโหลดก่อน

    window.SOCIAL_DATA.load().then(function (d) {
      DATA = d;
      if (DATA && DATA.isMock) mockBanner();
      render();
    }).catch(function (e) {
      LOAD_ERR = e && (e.message || String(e));
      render();
    });
  }

  if (document.readyState !== "loading") start();
  else document.addEventListener("DOMContentLoaded", start);
})();
