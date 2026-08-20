/* กราฟทั้งหมดวาดด้วย SVG เปล่าๆ — ไม่มีไลบรารีเพิ่มสักตัว
 *
 * ⚠️ ทำไมไม่ใช้ไลบรารีกราฟ: ทั้งโปรเจกต์เป็น static ไม่มีขั้นตอน build
 *    และหน้านี้จะอยู่หลัง Cloudflare Access ซึ่งโหลดของจาก CDN ภายนอกไม่ได้
 *
 * ทุกตัวคืน "ข้อความ HTML" ไม่ได้ยุ่งกับ DOM เอง
 * ⚠️ ทุกกราฟใช้ viewBox + width:100% ห้ามกำหนดความกว้างเป็น px ตายตัว
 *
 * 📌 กราฟเส้นแนบข้อมูลไว้ใน data-attribute ของกล่องครอบ (`.chartbox`)
 *    ตัวจับ hover ใน app.js อ่านจากตรงนั้น — ทำแบบนี้เพราะ render() สร้าง HTML ใหม่ทั้งก้อน
 *    ถ้าเก็บข้อมูลไว้ในตัวแปร JS จะต้องคอยผูก/ปลดทุกครั้ง ซึ่งพลาดง่ายกว่า
 */
(function () {
  "use strict";

  var W = 640, PAD_T = 12, PAD_B = 26;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function n(v) { return Math.round(v * 100) / 100; }

  /**
   * ตัวจัดรูปแบบป้ายแกน Y ที่เลือกจำนวนทศนิยมเอง
   * 🔴 เหตุที่ต้องมี: ตอนช่วงข้อมูลแคบมาก การปัดเป็นจำนวนเต็มทำให้ป้ายซ้ำกัน
   *    (เคยได้ 101/100/100/100) จึงไล่เพิ่มทศนิยมจนกว่าป้ายทุกใบจะไม่ซ้ำ
   */
  function axisFmt(values, unit) {
    unit = unit || "";
    for (var dec = 0; dec <= 3; dec++) {
      var seen = {}, dup = false;
      for (var i = 0; i < values.length; i++) {
        var s = values[i].toFixed(dec);
        if (seen[s]) { dup = true; break; }
        seen[s] = 1;
      }
      if (!dup) {
        return (function (d) {
          return function (v) {
            // ⚠️ ห้ามเติม "+" หน้าเลขเปอร์เซ็นต์ — แกนนี้ใช้กับ Engagement rate
            // ซึ่งเป็น "ระดับ" ไม่ใช่ "การเปลี่ยนแปลง" (เคยขึ้น +8% ทั้งที่แปลว่า 8%)
            return v.toFixed(d) + unit;
          };
        })(dec);
      }
    }
    return function (v) { return v.toFixed(3) + unit; };
  }

  /**
   * เลือกจำนวนทศนิยมให้ตัวย่อเลข (num ของ app.js) จนกว่าป้ายแกนจะไม่ซ้ำกัน
   * 🔴 ต่างจาก axisFmt ตรงที่ตัวนี้ใช้กับตัวย่อแบบ K/M — ปัดเป็น K เฉยๆ แล้วช่วงข้อมูลแคบ
   *    จะได้ป้ายซ้ำ (258K / 258K / 259K / 259K) อ่านไม่ออกว่าแกนไล่ยังไง
   */
  function pickFmt(values, fn) {
    for (var d = 0; d <= 2; d++) {
      var seen = {}, dup = false;
      for (var i = 0; i < values.length; i++) {
        var t = fn(values[i], d);
        if (seen[t]) { dup = true; break; }
        seen[t] = 1;
      }
      if (!dup) return (function (dd) { return function (v) { return fn(v, dd); }; })(d);
    }
    return function (v) { return fn(v, 2); };
  }

  function extent(series, pick) {
    var lo = Infinity, hi = -Infinity;
    series.forEach(function (s) {
      if (pick && !pick(s)) return;
      s.points.forEach(function (p) {
        if (p.y == null) return;
        if (p.y < lo) lo = p.y;
        if (p.y > hi) hi = p.y;
      });
    });
    if (lo === Infinity) return null;
    if (hi === lo) { hi = lo + Math.abs(lo || 1) * 0.05 + 0.01; lo = lo - Math.abs(lo || 1) * 0.05 - 0.01; }
    var pad = (hi - lo) * 0.12;
    return { lo: lo - pad, hi: hi + pad };
  }

  /* ── กราฟเส้น ─────────────────────────────────────────────────────
   * o.id       ชื่อกราฟ — ใช้จำว่าเส้นไหนถูกปิดไว้ (ต้องไม่ซ้ำในหน้าเดียว)
   * o.series   [{ label, color, axis:"left"|"right", points:[{y}], tipFmt }]
   * o.hidden   [index ของเส้นที่ผู้ใช้กดปิด] — ยังนับอยู่ในลำดับเดิม ไม่ได้ถูกลบ
   *
   * ⚠️ ค่า y เป็น null ได้ = วันนั้นไม่มีข้อมูล ต้องทำให้เส้นขาด
   *    ห้ามลากผ่านเหมือนเป็น 0 — เส้นที่ลากถึง 0 อ่านว่า "ยอดตก" ซึ่งไม่จริง
   * ⚠️ เส้นที่หน่วยต่างกันหลักร้อยเท่า ห้ามใช้แกนเดียวกัน (ER 4% กับยอดวิวหลักหมื่น)
   * ⚠️ ขอบเขตแกนคิดจาก "เส้นที่ยังเปิดอยู่" เท่านั้น — ปิดเส้นที่ค่าสูงมากแล้ว
   *    เส้นที่เหลือต้องขยายเต็มกรอบ ไม่ใช่ยังแบนติดพื้นเพราะแกนค้างอยู่ที่ของเดิม
   */
  function line(o) {
    var all = (o.series || []).filter(function (s) { return s.points && s.points.length; });
    var labels = o.labels || [];
    var count = labels.length;
    if (!count || !all.length) return "";

    var hidden = o.hidden || [];
    var vis = all.filter(function (s, i) { return hidden.indexOf(i) < 0; });
    if (!vis.length) vis = [];   // ปิดหมด → วาดแต่กรอบ ไม่ใช่พัง

    var hasRight = vis.some(function (s) { return s.axis === "right"; });
    var PAD_L = 46, PAD_R = hasRight ? 46 : 12;
    var H = o.height || 200;

    var L = extent(vis, function (s) { return s.axis !== "right"; });
    var R = hasRight ? extent(vis, function (s) { return s.axis === "right"; }) : null;
    if (o.zeroFloor && L && L.lo < 0) L.lo = 0;
    /* baseZero = "ให้แกนเริ่มที่ 0 เสมอ" ต่างจาก zeroFloor ที่แค่กันไม่ให้ต่ำกว่า 0
       ⚠️ ใช้กับค่าที่ 0 มีความหมายจริง (ยอดวิวรายวัน = วันนั้นไม่มีคนดู)
          ห้ามใช้กับอัตราส่วนอย่าง ER ที่ค่าจริงอยู่ในช่วงแคบ — ลากถึง 0 แล้วเส้นจะแบนจนอ่านไม่ออก */
    if (o.baseZero && L && L.lo > 0) L.lo = 0;
    if (R && o.zeroFloorRight && R.lo < 0) R.lo = 0;

    var iw = W - PAD_L - PAD_R, ih = H - PAD_T - PAD_B;
    var X = function (i) { return PAD_L + (count === 1 ? iw / 2 : (i / (count - 1)) * iw); };
    var mk = function (ax) { return function (v) { return PAD_T + ih - ((v - ax.lo) / (ax.hi - ax.lo)) * ih; }; };
    var YL = L ? mk(L) : null, YR = R ? mk(R) : null;

    var ticks = [0, 1, 2, 3];
    var lVals = L ? ticks.map(function (g) { return L.lo + ((L.hi - L.lo) * g) / 3; }) : [];
    var fmtL = L ? (o.fmtYNum ? pickFmt(lVals, o.fmtYNum) : (o.fmtY || axisFmt(lVals, o.unitLeft || ""))) : null;
    var rVals = R ? ticks.map(function (g) { return R.lo + ((R.hi - R.lo) * g) / 3; }) : [];
    var fmtR = R ? (o.fmtYRight || axisFmt(rVals, o.unitRight || "")) : null;

    var out = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(o.aria || "กราฟเส้น") + '">';

    if (L) {
      ticks.forEach(function (g, k) {
        var y = n(YL(lVals[k]));
        out += '<line x1="' + PAD_L + '" y1="' + y + '" x2="' + (W - PAD_R) + '" y2="' + y + '" class="grid"/>';
        out += '<text x="' + (PAD_L - 6) + '" y="' + (y + 3.5) + '" class="ax" text-anchor="end">' + esc(fmtL(lVals[k])) + "</text>";
        if (R) out += '<text x="' + (W - PAD_R + 6) + '" y="' + (n(YR(rVals[k])) + 3.5) + '" class="ax ax-r" text-anchor="start">' + esc(fmtR(rVals[k])) + "</text>";
      });
      if (L.lo < 0 && L.hi > 0) {
        out += '<line x1="' + PAD_L + '" y1="' + n(YL(0)) + '" x2="' + (W - PAD_R) + '" y2="' + n(YL(0)) + '" class="zero"/>';
      }
    }

    // เส้นชี้ตำแหน่งตอนเอาเมาส์ชี้ (app.js เป็นคนขยับ)
    out += '<line class="crosshair" x1="0" y1="' + PAD_T + '" x2="0" y2="' + (PAD_T + ih) + '" style="display:none"/>';

    vis.forEach(function (s) {
      var Y = s.axis === "right" ? YR : YL;
      if (!Y) return;
      var d = "", pen = false;
      s.points.forEach(function (p, i) {
        if (p.y == null) { pen = false; return; }
        d += (pen ? "L" : "M") + n(X(i)) + " " + n(Y(p.y));
        pen = true;
      });
      if (d) {
        out += '<path d="' + d + '" fill="none" stroke="' + esc(s.color) + '" stroke-width="2" ' +
          (s.dash ? 'stroke-dasharray="5 4" ' : "") +
          'stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
      }
    });

    [0, Math.floor((count - 1) / 2), count - 1].forEach(function (i, k) {
      if (i < 0 || !labels[i]) return;
      out += '<text x="' + n(X(i)) + '" y="' + (H - 8) + '" class="ax ax-x" text-anchor="' +
        (k === 0 ? "start" : k === 2 ? "end" : "middle") + '">' + esc(labels[i]) + "</text>";
    });
    out += "</svg>";

    /* ข้อมูลสำหรับ hover — เก็บทุกเส้น (รวมที่ถูกซ่อน) แล้วให้ app.js กรองเอง
       จะได้ไม่ต้องวาดใหม่ตอนเปิด/ปิดเส้นเพื่ออ่านค่า */
    var payload = {
      labels: labels,
      geo: { w: W, h: H, padL: PAD_L, padR: PAD_R, padT: PAD_T, ih: ih, count: count },
      series: all.map(function (s, i) {
        return {
          label: s.label, color: s.color, fmt: s.tipFmt || "num",
          hidden: hidden.indexOf(i) >= 0,
          y: s.points.map(function (p) { return p.y == null ? null : Math.round(p.y * 1000) / 1000; }),
          py: s.points.map(function (p) {
            var Y = s.axis === "right" ? YR : YL;
            return p.y == null || !Y ? null : Math.round(Y(p.y) * 10) / 10;
          }),
        };
      }),
    };

    return '<div class="chartbox" data-chart="' + esc(o.id || "c") + '" data-pts="' + esc(JSON.stringify(payload)) + '">' +
      out + '<div class="ctip" hidden></div></div>';
  }

  /* ── แท่งเดียว 100% แนวนอน ───────────────────────────────────────── */
  function share100(segs) {
    var list = (segs || []).filter(function (s) { return s.value > 0; });
    var total = list.reduce(function (a, s) { return a + s.value; }, 0);
    if (!total) return "";
    var out = '<div class="share" role="img" aria-label="สัดส่วนแยกช่อง">';
    list.forEach(function (s) {
      var p = (s.value / total) * 100;
      out += '<span class="share-s" style="width:' + n(p) + "%;background:" + esc(s.color) + '" title="' +
        esc(s.label + " " + p.toFixed(1) + "%") + '">' +
        (p >= 9 ? "<b>" + p.toFixed(p < 10 ? 1 : 0) + "%</b>" : "") + "</span>";
    });
    return out + "</div>";
  }

  /* ── แท่งแนวนอน แถวละหนึ่งประเภท ───────────────────────────────────
   * 🔴 มาแทนแท่งซ้อน 100% (เจ้าของแจ้ง 19 ส.ค. 2026 ว่า "ดูยาก")
   *    ถูกแล้ว — พอ Likes กิน 92% ส่วน Comments 0.7% ในแท่งเดียวกัน
   *    ช่องของ Comments จะบางจนมองไม่เห็นและเอาเมาส์ชี้ก็แทบไม่โดน
   * ⚠️ แยกเป็นคนละแถวแล้ว "ตัวเลขกับ %" ยังอ่านได้เสมอแม้แท่งจะสั้นมาก
   *    ความยาวแท่งเทียบกับตัวที่มากที่สุด ไม่ใช่เทียบกับผลรวม —
   *    เทียบกับผลรวมแล้วแท่งที่ใหญ่สุดจะยาวไม่เต็มแถว ดูเหมือนวาดพลาด
   * 🚫 ไม่ใช้ pie เพราะปัญหาเดียวกับแท่งซ้อน — ชิ้น 0.7% มองไม่เห็นอยู่ดี
   */
  function hbars(parts, opt) {
    opt = opt || {};
    var list = (parts || []).filter(function (p) { return p.value != null; });
    var total = list.reduce(function (a, p) { return a + (p.value || 0); }, 0);
    var max = 0;
    list.forEach(function (p) { max = Math.max(max, p.value || 0); });
    if (!max) return "";

    var out = '<div class="hb" role="img" aria-label="' + esc(opt.aria || "แท่งเปรียบเทียบ") + '">';
    list.forEach(function (p) {
      var share = total ? (p.value / total) * 100 : 0;
      out += '<div class="hb-r">' +
        '<div class="hb-n"><span class="hb-d" style="background:' + esc(p.color) + '"></span>' +
          esc(p.label) + "</div>" +
        '<div class="hb-t"><span class="hb-b" style="width:' + n((p.value / max) * 100) +
          "%;background:" + esc(p.color) + '"></span></div>' +
        '<div class="hb-v">' + esc(p.text != null ? p.text : String(p.value)) +
          '<span class="hb-p">' + n(share) + "%</span></div>" +
        '<div class="hb-x">' + (p.extra || "") + "</div>" +
        "</div>";
    });
    return out + "</div>";
  }

  /* ── diverging bar: หายไปทางซ้าย เพิ่มมาทางขวา ───────────────────── */
  function diverging(rows) {
    var max = 0;
    rows.forEach(function (r) { max = Math.max(max, r.gained, r.lost); });
    if (!max) return "";
    var out = '<div class="dv">';
    rows.forEach(function (r) {
      var lw = (r.lost / max) * 50, gw = (r.gained / max) * 50;
      out += '<div class="dv-row">' +
        '<div class="dv-name">' + esc(r.label) + "</div>" +
        '<div class="dv-track" title="' + esc("เพิ่มมา " + r.gainedText + " · หายไป " + r.lostText) + '">' +
        '<span class="dv-axis"></span>' +
        '<span class="dv-neg" style="width:' + n(lw) + '%"></span>' +
        '<span class="dv-pos" style="width:' + n(gw) + '%"></span>' +
        '<i class="dv-lbl neg">−' + esc(r.lostText) + "</i>" +
        '<i class="dv-lbl pos">+' + esc(r.gainedText) + "</i>" +
        "</div>" +
        '<div class="dv-net ' + (r.net >= 0 ? "up" : "down") + '">' + (r.net >= 0 ? "+" : "−") + esc(r.netText) + "</div>" +
        "</div>";
    });
    return out + "</div>";
  }

  window.SOCIAL_CHARTS = {
    line: line, share100: share100, hbars: hbars,
    diverging: diverging, axisFmt: axisFmt,
  };
})();
