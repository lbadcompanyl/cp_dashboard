/* กราฟทั้งหมดวาดด้วย SVG เปล่าๆ — ไม่มีไลบรารีเพิ่มสักตัว
 *
 * ⚠️ ทำไมไม่ใช้ไลบรารีกราฟ: ทั้งโปรเจกต์เป็น static ไม่มีขั้นตอน build
 *    และหน้านี้จะอยู่หลัง Cloudflare Access ซึ่งโหลดของจาก CDN ภายนอกไม่ได้
 *
 * ทุกตัวคืน "ข้อความ HTML" ไม่ได้ยุ่งกับ DOM เอง
 * ⚠️ ทุกกราฟใช้ viewBox + width:100% ห้ามกำหนดความกว้างเป็น px ตายตัว
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function n(v) { return Math.round(v * 100) / 100; }

  /**
   * ตัวจัดรูปแบบป้ายแกน Y ที่เลือกจำนวนทศนิยมเอง
   *
   * 🔴 เหตุที่ต้องมี: ตอนช่วงข้อมูลแคบมาก (เช่น 0% ถึง 0.6%) การปัดเป็นจำนวนเต็ม
   *    ทำให้ป้ายออกมาเป็น 0/1/1/1 ซ้ำกันจนอ่านไม่ได้ความ — เป็นบั๊กที่เจอในรอบรีวิว
   *    จึงไล่เพิ่มทศนิยมขึ้นไปจนกว่าป้ายทุกใบจะไม่ซ้ำกัน
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
            var t = v.toFixed(d);
            if (unit === "%") return (v > 0 ? "+" : "") + t + "%";
            return t + unit;
          };
        })(dec);
      }
    }
    return function (v) { return v.toFixed(3) + unit; };
  }

  /** หาช่วง lo/hi ของชุดข้อมูล เผื่อขอบบน-ล่างไว้เล็กน้อย */
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

  /* ── กราฟเส้น (รองรับแกน Y 2 ข้าง) ─────────────────────────────────
   * series: [{ label, color, axis:"left"|"right", points:[{y}] }]
   *
   * ⚠️ ค่า y เป็น null ได้ = วันนั้นไม่มีข้อมูล ต้องทำให้เส้นขาด
   *    ห้ามลากผ่านเหมือนเป็น 0 — เส้นที่ลากถึง 0 อ่านว่า "ยอดตก" ซึ่งไม่จริง
   *
   * ⚠️ เส้นที่หน่วยต่างกันหลักร้อยเท่า ห้ามใช้แกนเดียวกัน
   *    (ยอดวิวหลักหมื่น กับ ER 4% วาดแกนเดียวกัน = เส้น ER แบนติดพื้น อ่านไม่ได้เลย)
   */
  function line(o) {
    var series = (o.series || []).filter(function (s) { return s.points && s.points.length; });
    var labels = o.labels || [];
    var count = labels.length;
    if (!count || !series.length) return "";

    var hasRight = series.some(function (s) { return s.axis === "right"; });
    var W = 640, H = o.height || 200;
    var PAD_L = 46, PAD_R = hasRight ? 46 : 12, PAD_T = 12, PAD_B = 26;

    var L = extent(series, function (s) { return s.axis !== "right"; });
    var R = hasRight ? extent(series, function (s) { return s.axis === "right"; }) : null;
    if (!L) return "";
    if (o.zeroFloor && L.lo < 0) L.lo = 0;
    if (R && o.zeroFloorRight && R.lo < 0) R.lo = 0;

    var iw = W - PAD_L - PAD_R, ih = H - PAD_T - PAD_B;
    var X = function (i) { return PAD_L + (count === 1 ? iw / 2 : (i / (count - 1)) * iw); };
    var scale = function (ax) {
      return function (v) { return PAD_T + ih - ((v - ax.lo) / (ax.hi - ax.lo)) * ih; };
    };
    var YL = scale(L), YR = R ? scale(R) : null;

    // ค่าที่จะเขียนบนแกน — คำนวณล่วงหน้าเพื่อเลือกทศนิยมให้ไม่ซ้ำกัน
    var ticks = [0, 1, 2, 3];
    var lVals = ticks.map(function (g) { return L.lo + ((L.hi - L.lo) * g) / 3; });
    var fmtL = o.fmtY || axisFmt(lVals, o.unitLeft || "");
    var rVals = R ? ticks.map(function (g) { return R.lo + ((R.hi - R.lo) * g) / 3; }) : [];
    var fmtR = R ? (o.fmtYRight || axisFmt(rVals, o.unitRight || "")) : null;

    var out = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(o.aria || "กราฟเส้น") + '">';

    ticks.forEach(function (g, k) {
      var y = n(YL(lVals[k]));
      out += '<line x1="' + PAD_L + '" y1="' + y + '" x2="' + (W - PAD_R) + '" y2="' + y + '" class="grid"/>';
      out += '<text x="' + (PAD_L - 6) + '" y="' + (y + 3.5) + '" class="ax" text-anchor="end">' + esc(fmtL(lVals[k])) + "</text>";
      if (R) {
        out += '<text x="' + (W - PAD_R + 6) + '" y="' + (n(YR(rVals[k])) + 3.5) + '" class="ax ax-r" text-anchor="start">' + esc(fmtR(rVals[k])) + "</text>";
      }
    });

    // เส้นศูนย์ — มีความหมายเฉพาะกราฟที่มีค่าลบได้ (เช่น % เปลี่ยนแปลง)
    if (L.lo < 0 && L.hi > 0) {
      out += '<line x1="' + PAD_L + '" y1="' + n(YL(0)) + '" x2="' + (W - PAD_R) + '" y2="' + n(YL(0)) + '" class="zero"/>';
    }

    series.forEach(function (s) {
      var Y = s.axis === "right" ? YR : YL;
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

    // ป้ายแกนล่าง — โชว์แค่หัว/กลาง/ท้าย ไม่งั้นบนมือถือทับกันอ่านไม่ออก
    [0, Math.floor((count - 1) / 2), count - 1].forEach(function (i, k) {
      if (i < 0 || !labels[i]) return;
      out += '<text x="' + n(X(i)) + '" y="' + (H - 8) + '" class="ax" text-anchor="' +
        (k === 0 ? "start" : k === 2 ? "end" : "middle") + '">' + esc(labels[i]) + "</text>";
    });

    return out + "</svg>";
  }

  /* ── แท่งเดียว 100% แนวนอน ─────────────────────────────────────────
   * ใช้แทนโดนัท — กินพื้นที่น้อยกว่าครึ่ง และเทียบสัดส่วนด้วยตาง่ายกว่า
   * segs: [{ label, value, color }]
   */
  function share100(segs) {
    var list = (segs || []).filter(function (s) { return s.value > 0; });
    var total = list.reduce(function (a, s) { return a + s.value; }, 0);
    if (!total) return "";
    var out = '<div class="share" role="img" aria-label="สัดส่วนแยกช่อง">';
    list.forEach(function (s) {
      var p = (s.value / total) * 100;
      // ป้าย % วางในแท่งเฉพาะช่องที่กว้างพอ ที่แคบเกินไปจะทับกันจนอ่านไม่ออก
      out += '<span class="share-s" style="width:' + n(p) + "%;background:" + esc(s.color) + '" title="' +
        esc(s.label + " " + p.toFixed(1) + "%") + '">' +
        (p >= 9 ? '<b>' + p.toFixed(p < 10 ? 1 : 0) + "%</b>" : "") + "</span>";
    });
    return out + "</div>";
  }

  /* ── แท่งซ้อน (ใช้ในหน้ารายช่อง) ─────────────────────────────────── */
  function stack(parts) {
    var list = (parts || []).filter(function (p) { return p.value > 0; });
    var total = list.reduce(function (a, p) { return a + p.value; }, 0);
    if (!total) return "";
    var out = '<div class="stackbar" role="img" aria-label="สัดส่วนการมีส่วนร่วม">';
    list.forEach(function (p) {
      out += '<span style="width:' + n((p.value / total) * 100) + "%;background:" + esc(p.color) + '" title="' + esc(p.label) + '"></span>';
    });
    return out + "</div>";
  }

  /* ── diverging bar: เสียซ้าย ได้ขวา ───────────────────────────────
   * rows: [{ label, gained, lost, net, gainedText, lostText, netText }]
   *
   * ⚠️ ทุกแถวใช้ scale เดียวกัน (หาค่าสูงสุดจากทุกช่องก่อน) —
   *    ถ้าให้แต่ละแถว scale ของตัวเอง ช่องเล็กจะดูแท่งยาวเท่าช่องใหญ่ ซึ่งหลอกตา
   * ⚠️ ต้องเห็นทั้ง 2 ฝั่ง ไม่ใช่เห็นแต่ยอดสุทธิ —
   *    ได้ 500 เสีย 480 กับ ได้ 30 เสีย 10 สุทธิเท่ากันแต่คนละเรื่องกันคนละโลก
   */
  function diverging(rows) {
    var max = 0;
    rows.forEach(function (r) { max = Math.max(max, r.gained, r.lost); });
    if (!max) return "";
    var out = '<div class="dv">';
    rows.forEach(function (r) {
      var lw = (r.lost / max) * 50, gw = (r.gained / max) * 50;   // ครึ่งละ 50% ของความกว้าง
      out += '<div class="dv-row">' +
        '<div class="dv-name">' + esc(r.label) + "</div>" +
        '<div class="dv-track">' +
        '<span class="dv-axis"></span>' +
        '<span class="dv-neg" style="width:' + n(lw) + '%" title="หายไป ' + esc(r.lostText) + '"></span>' +
        '<span class="dv-pos" style="width:' + n(gw) + '%" title="เพิ่มมา ' + esc(r.gainedText) + '"></span>' +
        '<i class="dv-lbl neg">−' + esc(r.lostText) + "</i>" +
        '<i class="dv-lbl pos">+' + esc(r.gainedText) + "</i>" +
        "</div>" +
        '<div class="dv-net ' + (r.net >= 0 ? "up" : "down") + '">' + (r.net >= 0 ? "+" : "−") + esc(r.netText) + "</div>" +
        "</div>";
    });
    return out + "</div>";
  }

  window.SOCIAL_CHARTS = { line: line, share100: share100, stack: stack, diverging: diverging, axisFmt: axisFmt };
})();
