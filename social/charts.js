/* กราฟทั้งหมดวาดด้วย SVG เปล่าๆ — ไม่มีไลบรารีเพิ่มสักตัว
 *
 * ⚠️ ทำไมไม่ใช้ไลบรารีกราฟ: ทั้งโปรเจกต์เป็น static ไม่มีขั้นตอน build
 *    และหน้านี้จะอยู่หลัง Cloudflare Access ซึ่งโหลดของจาก CDN ภายนอกไม่ได้
 *    SVG เขียนเองจึงเป็นทางเดียวที่ไม่เพิ่มภาระให้ระบบเดิม
 *
 * ทุกตัวคืน "ข้อความ HTML" ไม่ได้ยุ่งกับ DOM เอง — ให้ผู้เรียกเอาไปวางเอง
 * ⚠️ ทุกกราฟใช้ viewBox + width:100% เพื่อให้ย่อขยายตามจอ ห้ามกำหนดความกว้างเป็น px ตายตัว
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /** ทศนิยมสั้นๆ พอให้ SVG ไม่บวม */
  function n(v) { return Math.round(v * 100) / 100; }

  /* ── กราฟเส้น ─────────────────────────────────────────────────────
   * series: [{ label, color, points:[{x(ลำดับ), y(ค่า)}] }]
   * ⚠️ ค่า y เป็น null ได้ = "วันนั้นไม่มีข้อมูล" ต้องทำให้เส้นขาด
   *    ห้ามลากผ่านเหมือนเป็น 0 — เส้นที่ลากถึง 0 อ่านว่า "วันนั้นยอดตก" ซึ่งไม่จริง
   */
  function line(o) {
    var W = 640, H = o.height || 200, PAD_L = 44, PAD_R = 10, PAD_T = 12, PAD_B = 26;
    var series = o.series || [];
    var labels = o.labels || [];
    var count = labels.length;
    if (!count) return "";

    var lo = Infinity, hi = -Infinity;
    series.forEach(function (s) {
      s.points.forEach(function (p) {
        if (p.y == null) return;
        if (p.y < lo) lo = p.y;
        if (p.y > hi) hi = p.y;
      });
    });
    if (lo === Infinity) return "";
    if (hi === lo) { hi = lo + 1; lo = lo - 1; }
    var pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;
    if (o.zeroFloor && lo < 0) lo = 0;

    var iw = W - PAD_L - PAD_R, ih = H - PAD_T - PAD_B;
    var X = function (i) { return PAD_L + (count === 1 ? iw / 2 : (i / (count - 1)) * iw); };
    var Y = function (v) { return PAD_T + ih - ((v - lo) / (hi - lo)) * ih; };

    var out = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(o.aria || "กราฟเส้น") + '">';

    // เส้นแนวนอน 4 เส้น + ป้ายค่า
    for (var g = 0; g <= 3; g++) {
      var v = lo + ((hi - lo) * g) / 3, y = n(Y(v));
      out += '<line x1="' + PAD_L + '" y1="' + y + '" x2="' + (W - PAD_R) + '" y2="' + y + '" class="grid"/>';
      out += '<text x="' + (PAD_L - 6) + '" y="' + (y + 3.5) + '" class="ax" text-anchor="end">' + esc(o.fmtY ? o.fmtY(v) : Math.round(v)) + "</text>";
    }

    series.forEach(function (s) {
      var dstr = "", pen = false;
      s.points.forEach(function (p, i) {
        if (p.y == null) { pen = false; return; }     // ข้อมูลขาด → ยกปากกา
        dstr += (pen ? "L" : "M") + n(X(i)) + " " + n(Y(p.y));
        pen = true;
      });
      if (dstr) out += '<path d="' + dstr + '" fill="none" stroke="' + esc(s.color) + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
    });

    // ป้ายแกนล่าง — โชว์แค่หัว/กลาง/ท้าย ไม่งั้นบนมือถือทับกันอ่านไม่ออก
    [0, Math.floor((count - 1) / 2), count - 1].forEach(function (i, k) {
      if (i < 0 || !labels[i]) return;
      out += '<text x="' + n(X(i)) + '" y="' + (H - 8) + '" class="ax" text-anchor="' +
        (k === 0 ? "start" : k === 2 ? "end" : "middle") + '">' + esc(labels[i]) + "</text>";
    });

    return out + "</svg>";
  }

  /* ── โดนัท ────────────────────────────────────────────────────────
   * slices: [{ label, value, color }]
   */
  function donut(o) {
    var slices = (o.slices || []).filter(function (s) { return s.value > 0; });
    var total = slices.reduce(function (a, s) { return a + s.value; }, 0);
    if (!total) return "";

    var S = 200, R = 78, r = 50, cx = S / 2, cy = S / 2, ang = -Math.PI / 2;
    var out = '<svg class="donut" viewBox="0 0 ' + S + " " + S + '" role="img" aria-label="' + esc(o.aria || "สัดส่วน") + '">';

    slices.forEach(function (s) {
      var frac = s.value / total, sweep = frac * Math.PI * 2, end = ang + sweep;
      // วงกลมเต็ม 100% วาดด้วย arc ไม่ได้ (จุดเริ่มกับจุดจบทับกันพอดี) — ใช้วงแหวนแทน
      if (frac > 0.9999) {
        out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + ((R + r) / 2) + '" fill="none" stroke="' + esc(s.color) + '" stroke-width="' + (R - r) + '"/>';
        return;
      }
      var big = sweep > Math.PI ? 1 : 0;
      var x1 = cx + R * Math.cos(ang), y1 = cy + R * Math.sin(ang);
      var x2 = cx + R * Math.cos(end), y2 = cy + R * Math.sin(end);
      var x3 = cx + r * Math.cos(end), y3 = cy + r * Math.sin(end);
      var x4 = cx + r * Math.cos(ang), y4 = cy + r * Math.sin(ang);
      out += '<path d="M' + n(x1) + " " + n(y1) + "A" + R + " " + R + " 0 " + big + " 1 " + n(x2) + " " + n(y2) +
        "L" + n(x3) + " " + n(y3) + "A" + r + " " + r + " 0 " + big + " 0 " + n(x4) + " " + n(y4) + 'Z" fill="' + esc(s.color) + '"/>';
      ang = end;
    });

    if (o.center) {
      out += '<text x="' + cx + '" y="' + (cy - 2) + '" class="dc" text-anchor="middle">' + esc(o.center) + "</text>";
      if (o.centerSub) out += '<text x="' + cx + '" y="' + (cy + 16) + '" class="dcs" text-anchor="middle">' + esc(o.centerSub) + "</text>";
    }
    return out + "</svg>";
  }

  /* ── แท่งซ้อน (แนวนอน) ────────────────────────────────────────────
   * ใช้กับ engagement breakdown — ต้องโชว์ "จำนวนจริง" ไม่ใช่แค่สัดส่วน
   * จึงคืนแท่งอย่างเดียว ส่วนตัวเลขให้ผู้เรียกวางเป็น legend เอง
   */
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

  /* ── แท่งคู่ ได้/เสีย ──────────────────────────────────────────────
   * rows: [{ label, gained, lost, net, color }]
   * ⚠️ ต้องเห็นทั้ง 2 ฝั่ง ไม่ใช่เห็นแต่ยอดสุทธิ —
   *    ได้ 500 เสีย 480 กับ ได้ 30 เสีย 10 สุทธิเท่ากันแต่คนละเรื่องกันคนละโลก
   */
  function gainLoss(rows) {
    var max = 0;
    rows.forEach(function (r) { max = Math.max(max, r.gained, r.lost); });
    if (!max) return "";
    var out = "";
    rows.forEach(function (r) {
      out += '<div class="gl-row"><div class="gl-name">' + esc(r.label) + "</div>" +
        '<div class="gl-bars">' +
        '<div class="gl-bar"><span class="gl-fill up" style="width:' + n((r.gained / max) * 100) + '%"></span>' +
        '<b class="gl-val">+' + esc(r.gainedText) + "</b></div>" +
        '<div class="gl-bar"><span class="gl-fill down" style="width:' + n((r.lost / max) * 100) + '%"></span>' +
        '<b class="gl-val">−' + esc(r.lostText) + "</b></div>" +
        "</div>" +
        '<div class="gl-net ' + (r.net >= 0 ? "up" : "down") + '">' + (r.net >= 0 ? "+" : "−") + esc(r.netText) + "</div></div>";
    });
    return out;
  }

  window.SOCIAL_CHARTS = { line: line, donut: donut, stack: stack, gainLoss: gainLoss };
})();
