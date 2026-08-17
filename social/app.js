/* Social Dashboard — สถิติช่องของเราเอง
 *
 * ⚠️ ห้ามเก็บสำเนาข้อมูลไว้ใน localStorage แล้วเปิดมาโชว์ของเก่าทันที (เจ้าของสั่ง 14 ส.ค. 2026)
 *    /ir/ เคยทำแบบนั้นแล้วผู้ใช้อ่านข้อมูลรอบที่แล้วโดยไม่รู้ตัว — ถอดออกไปแล้ว
 *    หน้านี้จึงเริ่มด้วยไอคอนหมุนเสมอ ไม่ใช่ตัวเลขเก่า
 *
 * ⚠️ เลขเวอร์ชันอ่านจาก DOM ตัวเดียว (<meta name="page-ver">) ห้ามเขียนซ้ำไว้ในไฟล์นี้
 *    เคยพลาดมาแล้ว: เลขอยู่ 2 ที่แล้วลืม bump คู่กัน → แถบ "มีเวอร์ชันใหม่" เด้งไม่หยุด
 */
(function () {
  "use strict";

  var COLS = [
    { key: "youtube",  label: "YouTube" },
    { key: "facebook", label: "Facebook Page" },
    { key: "tiktok",   label: "TikTok" },
  ];

  var REFRESH_MS = 3 * 60 * 1000; // รีเฟรชเงียบทุก 3 นาที (ฟีเจอร์มาตรฐานข้อ 5)

  /* ⚠️ ข้อความรอทุกจุดต้องมีไอคอนหมุน — ข้อความเปล่าๆ อ่านแล้วเหมือนหน้าค้าง
     แต่ห้ามใส่กับข้อความที่ไม่ใช่สถานะรอ ไม่งั้นจะหมุนค้างโดยไม่มีอะไรมา */
  var WAITING = '<span class="spin"></span> กำลังดึงข้อมูล…';

  var state = {};   // key → payload ล่าสุด
  var timer = null;

  /* ── โหมดข้อมูลตัวอย่าง: /social/?demo ────────────────────────────
   * มีไว้ให้ทีมออกแบบทำงานได้โดยไม่ต้องรอ token ครบทุกช่อง
   *
   * ⚠️ กฎ 3 ข้อที่ห้ามแก้:
   *   1. เปิดด้วย URL เท่านั้น — ไม่มีทางติดมาเองโดยบังเอิญ
   *   2. ต้องมีแถบเตือนค้างบนจอตลอดเวลา ไม่มีปุ่มปิด
   *      (ตัวเลขดูสมจริงเพื่อให้ออกแบบได้ ความเสี่ยงคือมีคนแคปไปใช้จริง แถบนี้คือตัวกัน)
   *   3. ชื่อช่องต้องบอกว่าเป็นตัวอย่าง — ต่อให้แถบหลุดหาย ยังอ่านออกจากตัวข้อมูลเอง
   */
  var DEMO = /[?&]demo\b/.test(location.search);

  var SAMPLE = {
    youtube: { ok: true, status: "ok", at: Date.now(), data: {
      channel: { title: "ช่องตัวอย่าง (ข้อมูลสมมติ)", url: "#", subs: 128400, views: 52840000, videos: 412 },
      videos: [
        { id: "d1", title: "ตัวอย่างพาดหัวคลิปที่ยาวพอสมควร เอาไว้ดูว่าตัดบรรทัดแล้วหน้าตาเป็นยังไง", url: "#", at: new Date(Date.now() - 5 * 36e5).toISOString(), views: 48200, likes: 1820, comments: 143 },
        { id: "d2", title: "คลิปสั้น ชื่อไม่ยาว", url: "#", at: new Date(Date.now() - 28 * 36e5).toISOString(), views: 15600, likes: 604, comments: 38 },
        { id: "d3", title: "รายงานพิเศษ ตัวอย่างข้อมูลสมมติ", url: "#", at: new Date(Date.now() - 74 * 36e5).toISOString(), views: 9120, likes: 287, comments: 12 },
        { id: "d4", title: "คลิปที่ปิดยอดไลก์ไว้ ใช้ดูว่าช่องว่างหน้าตาเป็นยังไง", url: "#", at: new Date(Date.now() - 120 * 36e5).toISOString(), views: 3400, likes: null, comments: null },
      ],
    } },
    facebook: { ok: true, status: "ok", at: Date.now(), data: {
      page: { name: "เพจตัวอย่าง (ข้อมูลสมมติ)", url: "#", followers: 86300, fans: 84150 },
      posts: [
        { id: "p1", title: "ข้อความโพสต์ตัวอย่าง เอาไว้ดูว่าข้อความยาวๆ ในการ์ดจะตัดตรงไหน และเหลือที่ให้ตัวเลขพอไหม", url: "#", at: new Date(Date.now() - 3 * 36e5).toISOString(), views: 24800, reach: 19200, engaged: 1640 },
        { id: "p2", title: "โพสต์สั้น", url: "#", at: new Date(Date.now() - 26 * 36e5).toISOString(), views: 8900, reach: 7100, engaged: 410 },
        { id: "p3", title: "(โพสต์ไม่มีข้อความ)", url: "#", at: new Date(Date.now() - 50 * 36e5).toISOString(), views: 5200, reach: 4300, engaged: 168 },
      ],
    } },
    tiktok: { ok: true, status: "ok", at: Date.now(), data: {
      account: { name: "บัญชีตัวอย่าง (ข้อมูลสมมติ)", url: "#", followers: 43900, likes: 512000, videos: 186 },
      videos: [
        { id: "t1", title: "คลิปตัวอย่างที่ยอดวิวสูงกว่าคลิปอื่นมาก ใช้ดูว่าเลขหลักล้านล้นช่องไหม", url: "#", at: new Date(Date.now() - 8 * 36e5).toISOString(), views: 1240000, likes: 88400, comments: 2130, shares: 5600 },
        { id: "t2", title: "คลิปทั่วไป", url: "#", at: new Date(Date.now() - 40 * 36e5).toISOString(), views: 62000, likes: 3100, comments: 88, shares: 210 },
        { id: "t3", title: "คลิปที่ยอดยังน้อย", url: "#", at: new Date(Date.now() - 96 * 36e5).toISOString(), views: 4300, likes: 190, comments: 6, shares: 11 },
      ],
    } },
  };

  function demoBanner() {
    if (document.getElementById("demobar")) return;
    var b = document.createElement("div");
    b.id = "demobar";
    b.textContent = "⚠️ ข้อมูลตัวอย่าง — ไม่ใช่ตัวเลขจริง ห้ามนำไปใช้อ้างอิง";
    b.style.cssText = "position:sticky;top:0;z-index:9999;background:#f5a524;color:#3b2600;" +
      "font-weight:700;text-align:center;padding:9px 14px;font-size:.86rem;letter-spacing:.01em";
    document.body.insertBefore(b, document.body.firstChild);
    document.title = "[ตัวอย่าง] " + document.title;
  }

  /* ── ตัวช่วยแสดงผล ─────────────────────────────────────────────── */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ⚠️ null กับ 0 คนละความหมาย — null = เจ้าของช่องซ่อนตัวเลขไว้ ไม่ใช่ "ศูนย์"
     โชว์ 0 ทั้งที่ซ่อนอยู่ = บอกข้อมูลผิดให้เจ้าของ */
  function nfmt(n) {
    if (n == null || isNaN(n)) return null;
    n = Number(n);
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (n >= 1e4) return (n / 1e3).toFixed(0) + "K";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }

  function stat(n, label) {
    var v = nfmt(n);
    if (v === null) return '<div class="stat na"><b>—</b><span>' + esc(label) + "</span></div>";
    return '<div class="stat"><b>' + v + "</b><span>" + esc(label) + "</span></div>";
  }

  function when(iso) {
    if (!iso) return "";
    var t = Date.parse(iso);
    if (isNaN(t)) return "";
    var mins = Math.floor((Date.now() - t) / 60000);
    if (mins < 60) return mins <= 1 ? "เมื่อสักครู่" : mins + " นาทีที่แล้ว";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + " ชม.ที่แล้ว";
    var days = Math.floor(hrs / 24);
    if (days < 30) return days + " วันที่แล้ว";
    return new Date(t).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
  }

  function metrics(pairs) {
    var out = [];
    for (var i = 0; i < pairs.length; i++) {
      var v = nfmt(pairs[i][1]);
      if (v !== null) out.push("<span>" + esc(pairs[i][0]) + " " + v + "</span>");
    }
    return out.join("");
  }

  function itemRow(it, mets) {
    var thumb = it.thumb ? '<img src="' + esc(it.thumb) + '" alt="" loading="lazy" />' : "";
    var m = metrics(mets);
    var age = when(it.at);
    if (age) m += "<span>" + esc(age) + "</span>";
    return '<a class="item" href="' + esc(it.url || "#") + '" target="_blank" rel="noopener">' +
      thumb + '<div><div class="t">' + esc(it.title) + '</div><div class="m">' + m + "</div></div></a>";
  }

  /* ── วาดแต่ละสถานะ ─────────────────────────────────────────────── */

  function renderNotConfigured(p) {
    var h = '<div class="note warn"><span class="ic">⚠️</span><div>' + esc(p.message || "ยังไม่ได้เชื่อมต่อ") + "</div></div>";
    if (p.need && p.need.length) {
      h += '<div class="needs">ต้องตั้งค่าใน Cloudflare → Variables and Secrets:<br>' +
        p.need.map(function (n) { return "<code>" + esc(n) + "</code>"; }).join(" ") +
        "<br>⚠️ ใส่ทั้ง Production และ Preview แล้วกด Retry deployment</div>";
    }
    return h;
  }

  function renderYouTube(d) {
    var c = d.channel || {};
    var h = "";
    if (c.title) {
      h += '<div class="who">' + (c.thumb ? '<img src="' + esc(c.thumb) + '" alt="" />' : "") +
        '<div><div class="nm">' + esc(c.title) + '</div>' +
        (c.url ? '<a href="' + esc(c.url) + '" target="_blank" rel="noopener">เปิดช่อง ↗</a>' : "") +
        "</div></div>";
    }
    h += '<div class="stats">' + stat(c.subs, "ผู้ติดตาม") + stat(c.views, "ยอดวิวรวม") + stat(c.videos, "คลิป") + "</div>";
    if (c.subsHidden) h += '<div class="note"><span class="ic">ℹ️</span><div>ช่องนี้ตั้งค่าซ่อนยอดผู้ติดตามไว้</div></div>';

    var vs = d.videos || [];
    h += '<p class="sub">คลิปล่าสุด</p>';
    if (!vs.length) {
      h += '<div class="note">ยังไม่มีคลิปในช่วงที่ดึงมา</div>';
    } else {
      h += '<div class="items">' + vs.map(function (v) {
        return itemRow(v, [["▶", v.views], ["❤", v.likes], ["💬", v.comments]]);
      }).join("") + "</div>";
    }
    return h;
  }

  function renderFacebook(d) {
    var p = d.page || {};
    var h = "";
    if (p.name) {
      h += '<div class="who"><div><div class="nm">' + esc(p.name) + "</div>" +
        (p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">เปิดเพจ ↗</a>' : "") + "</div></div>";
    }
    h += '<div class="stats">' + stat(p.followers, "ผู้ติดตาม") + stat(p.fans, "ถูกใจเพจ") + "</div>";

    var ps = d.posts || [];
    h += '<p class="sub">โพสต์ล่าสุด</p>';
    if (d.postsFailed) {
      h += '<div class="note warn"><span class="ic">⚠️</span><div>อ่านสถิติโพสต์ไม่ได้ — token อาจยังไม่มีสิทธิ์ read_insights</div></div>';
    } else if (!ps.length) {
      h += '<div class="note">ยังไม่มีโพสต์ในช่วงที่ดึงมา</div>';
    } else {
      h += '<div class="items">' + ps.map(function (o) {
        return itemRow(o, [["👁", o.views], ["👥", o.reach], ["✨", o.engaged]]);
      }).join("") + "</div>";
    }
    return h;
  }

  function renderTikTok(d) {
    var a = d.account || {};
    var h = "";
    if (a.name) {
      h += '<div class="who">' + (a.avatar ? '<img src="' + esc(a.avatar) + '" alt="" />' : "") +
        '<div><div class="nm">' + esc(a.name) + "</div>" +
        (a.url ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener">เปิดโปรไฟล์ ↗</a>' : "") +
        "</div></div>";
    }
    h += '<div class="stats">' + stat(a.followers, "ผู้ติดตาม") + stat(a.likes, "ไลก์รวม") + stat(a.videos, "คลิป") + "</div>";

    var vs = d.videos || [];
    h += '<p class="sub">คลิปล่าสุด</p>';
    if (!vs.length) {
      h += '<div class="note">ยังไม่มีคลิปในช่วงที่ดึงมา</div>';
    } else {
      h += '<div class="items">' + vs.map(function (v) {
        return itemRow(v, [["▶", v.views], ["❤", v.likes], ["💬", v.comments], ["↪", v.shares]]);
      }).join("") + "</div>";
    }
    return h;
  }

  var RENDER = { youtube: renderYouTube, facebook: renderFacebook, tiktok: renderTikTok };

  function paint(key) {
    var el = document.querySelector('[data-body="' + key + '"]');
    if (!el) return;
    var p = state[key];

    if (!p) { el.innerHTML = WAITING; return; }

    if (p.status === "not-configured") { el.innerHTML = renderNotConfigured(p); return; }

    if (p.status === "auth-failed") {
      el.innerHTML = '<div class="note bad"><span class="ic">🔑</span><div>' +
        esc(p.message || "สิทธิ์หมดอายุ") + "</div></div>";
      return;
    }

    if (!p.ok && !p.data) {
      el.innerHTML = '<div class="note bad"><span class="ic">⚠️</span><div>' +
        esc(p.message || "ดึงข้อมูลไม่สำเร็จ") + "</div></div>";
      return;
    }

    var html = RENDER[key](p.data || {});
    if (p.stale) {
      html += '<div class="stale">⚠️ ต้นทางไม่ตอบ กำลังแสดงข้อมูลรอบก่อน (' + esc(when(new Date(p.at).toISOString())) + ")</div>";
    }
    el.innerHTML = html;
  }

  /* ── โหลดข้อมูล ────────────────────────────────────────────────── */

  /* ⚠️ แต่ละคอลัมน์โหลดแยกกัน ไม่รวมใน Promise.all
     ต้นทางตัวหนึ่งอืดต้องไม่ทำให้อีก 2 คอลัมน์ค้างตามไปด้วย */
  function loadOne(key, isAuto) {
    if (!isAuto) { state[key] = null; paint(key); }

    // ⚠️ โหมดตัวอย่างไม่ยิง API เลย — กันไม่ให้เผลอกินโควตาของต้นทางระหว่างออกแบบ
    if (DEMO) {
      state[key] = SAMPLE[key];
      paint(key);
      return Promise.resolve();
    }

    return fetch("/social/api/" + key, { headers: { accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (p) { state[key] = p; paint(key); })
      .catch(function (e) {
        // ⚠️ เน็ตหลุดตอน auto-refresh ไม่ควรลบของที่อ่านอยู่ทิ้ง
        if (!isAuto || !state[key]) {
          state[key] = { ok: false, status: "error", message: "ต่อกับเซิร์ฟเวอร์ไม่ได้" };
          paint(key);
        }
      });
  }

  function loadAll(isAuto) {
    COLS.forEach(function (c) { loadOne(c.key, isAuto); });
  }

  function start() {
    if (DEMO) demoBanner();
    COLS.forEach(function (c) { paint(c.key); });  // ขึ้นไอคอนหมุนก่อน แล้วค่อยยิง
    loadAll(false);

    var btn = document.getElementById("reload");
    if (btn) btn.addEventListener("click", function () { loadAll(false); });

    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      if (!document.hidden) loadAll(true);
    }, REFRESH_MS);
  }

  if (document.readyState !== "loading") start();
  else document.addEventListener("DOMContentLoaded", start);
})();
