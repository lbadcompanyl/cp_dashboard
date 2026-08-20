/* ข้อมูลจำลองสำหรับออกแบบหน้าเว็บ — ยังไม่ได้ต่อ API จริง
 *
 * 🔴 ไฟล์นี้แยกออกมาโดยตั้งใจ ให้ถอดทิ้งได้ทั้งไฟล์ตอนต่อของจริง
 *    โครงข้อมูลที่คืนออกไปคือ "สัญญา" ที่ฝั่ง API ต้องส่งมาให้เหมือนกันเป๊ะ
 *    เปลี่ยนรูปร่างตรงนี้เมื่อไหร่ ต้องเปลี่ยนฝั่ง functions/social/api/ ตามด้วย
 *
 * โครงที่ตกลงไว้ (ต่อ 1 ช่อง):
 *   daily[]     { date, views|reach, likes, comments, shares, ...extras เฉพาะช่อง }
 *   followers[] { date, value, gained, lost }
 *   posts[]     { id, title, thumb, url, publishedAt, views|reach, likes, comments, shares }
 *
 * ⚠️ ตัวเลขทั้งหมดสุ่มจาก seed คงที่ — เปิดกี่ครั้งก็ได้เลขเดิม
 *    ไม่งั้นทีมออกแบบเทียบหน้าจอกันคนละรอบแล้วเลขไม่ตรง คุยกันไม่รู้เรื่อง
 */
(function () {
  "use strict";

  // ต้องมีข้อมูลย้อนหลังพอสำหรับ "90 วัน + เทียบปีก่อน" = 365 + 90 + เผื่อ
  var DAYS = 500;

  /** สุ่มแบบมี seed — ผลเหมือนเดิมทุกครั้งที่เปิด */
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function dayKey(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /** วันนี้แบบตัดเวลาออก — ใช้เป็นจุดอ้างอิงเดียวของทั้งไฟล์ */
  function today() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  /* รูปย่อของข้อมูลจำลอง — วาดเป็น SVG เอง ไม่ยิงเน็ต
   *
   * 🔴 ของจริงจะใช้รูปจากแพลตฟอร์มโดยตรง: API ทุกช่องส่ง URL รูปปกมาให้อยู่แล้ว
   *    (YouTube = snippet.thumbnails · TikTok = cover_image_url · Facebook = full_picture)
   *    ฝั่งหน้าเว็บวาง `post.thumb` ลง <img src> ตรงๆ อยู่แล้ว จึงไม่ต้องแก้อะไรตอนต่อของจริง
   * ⚠️ ที่นี่ใช้ภาพวาดเพราะโหมดจำลองต้องเปิดได้โดยไม่ต้องมีเน็ต และไม่ควรไปดึงรูป
   *    ของช่องคนอื่นมาแปะให้เข้าใจผิดว่าเป็นคอนเทนต์ของเรา
   */
  function thumb(color, n, rnd) {
    var hue = Math.floor(rnd() * 360);
    var sky = "hsl(" + hue + ",45%,72%)", land = "hsl(" + ((hue + 40) % 360) + ",35%,38%)";
    var svg =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 100'>" +
      "<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'>" +
      "<stop offset='0' stop-color='" + sky + "'/><stop offset='1' stop-color='#fff' stop-opacity='.65'/>" +
      "</linearGradient></defs>" +
      "<rect width='160' height='100' fill='url(#s)'/>" +
      "<circle cx='" + (30 + Math.floor(rnd() * 100)) + "' cy='26' r='11' fill='#fff' opacity='.75'/>" +
      "<path d='M0 78 L38 " + (46 + Math.floor(rnd() * 18)) + " L74 74 L108 " + (52 + Math.floor(rnd() * 16)) +
      " L160 80 L160 100 L0 100 Z' fill='" + land + "' opacity='.85'/>" +
      "<rect x='0' y='0' width='4' height='100' fill='" + color + "'/></svg>";
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  /* ลิงก์ของโพสต์
   * 🔴 ของจริงคือ URL โพสต์ที่ API ส่งมา (YouTube watch · TikTok share_url · Facebook permalink)
   * ⚠️ ของจำลองใช้รูปแบบเดียวกันแต่ใส่ id ที่บอกว่าเป็นของปลอม (`mock-…`)
   *    ตั้งใจให้กดแล้วเห็นว่าเปิดแท็บใหม่ได้จริง — ปลายทางจะไม่เจอโพสต์ ซึ่งถูกแล้ว
   *    เพราะห้ามพาไปโพสต์ของคนอื่นแล้วทำให้เข้าใจว่าเป็นของเรา */
  function postUrl(pk, id) {
    if (pk === "youtube") return "https://www.youtube.com/watch?v=mock-" + id;
    if (pk === "tiktok") return "https://www.tiktok.com/@example/video/mock-" + id;
    return "https://www.facebook.com/permalink.php?story_fbid=mock-" + id;
  }

  /* หัวข้อจำลอง — เขียนให้ความยาวหลากหลาย จะได้เห็นว่าตัดบรรทัดแล้วหน้าตาเป็นยังไง */
  var TITLES = [
    "เบื้องหลังการผลิตที่ไม่เคยเปิดเผยมาก่อน",
    "สรุปข่าวประจำสัปดาห์",
    "พาชมโรงงานแบบเจาะลึกทุกขั้นตอน ตั้งแต่วัตถุดิบจนถึงมือผู้บริโภค",
    "ตอบคำถามที่ถูกถามมากที่สุด",
    "5 เรื่องที่หลายคนเข้าใจผิด",
    "สัมภาษณ์พิเศษ",
    "อัปเดตความคืบหน้าโครงการปีนี้ พร้อมตัวเลขที่เปิดเผยได้ทั้งหมด",
    "วันเดียวกับทีมงานเบื้องหลัง",
    "ประกาศผลกิจกรรมประจำเดือน",
    "รีวิวจากผู้ใช้จริง",
    "เปิดตัวอย่างเป็นทางการ",
    "ถาม-ตอบสดกับทีมงาน ครั้งที่ผ่านมาที่หลายคนพลาด",
  ];

  /** โครงของแต่ละช่อง — ตัวเลขฐานต่างกันมากโดยตั้งใจ (เป็นเหตุผลที่กราฟ follower ต้องวัดเป็น % ไม่ใช่ตัวเลขดิบ) */
  var SHAPE = {
    youtube: { seed: 11, followers0: 128400, viewsBase: 42000, viewsSwing: 0.55, er: 0.041, postEvery: 4, growth: 90 },
    tiktok:  { seed: 22, followers0: 43900,  viewsBase: 96000, viewsSwing: 1.15, er: 0.082, postEvery: 3, growth: 210 },
    facebook:{ seed: 33, followers0: 86300,  viewsBase: 21000, viewsSwing: 0.40, er: 0.028, postEvery: 5, growth: 35 },
  };

  function buildPlatform(pk) {
    var cfg = SHAPE[pk];
    var rnd = makeRng(cfg.seed);
    var C = window.SOCIAL_CONFIG.PLATFORMS[pk];
    var reachKey = C.reachKey;

    var start = addDays(today(), -(DAYS - 1));
    var daily = [], followers = [], posts = [];

    // เดินย้อนจากยอดผู้ติดตามปัจจุบัน กลับไปหาอดีต แล้วค่อยกลับด้าน
    // ทำแบบนี้เพื่อให้ "ยอดวันนี้" ตรงกับเลขที่ตั้งไว้เป๊ะ ไม่ใช่ค่าที่บวกสะสมแล้วเลยเถิด
    var followerSeries = new Array(DAYS);
    var cur = cfg.followers0;
    for (var i = DAYS - 1; i >= 0; i--) {
      followerSeries[i] = Math.round(cur);
      var wobble = 0.55 + rnd() * 0.9;
      cur -= (cfg.growth / 30) * wobble;   // growth = ต่อเดือน → ต่อวัน
    }

    for (var d = 0; d < DAYS; d++) {
      var date = addDays(start, d);
      var dow = date.getDay();
      // เสาร์-อาทิตย์คนดูน้อยลง — ใส่ไว้ให้กราฟมีจังหวะ ไม่ใช่เส้นเรียบจนดูปลอม
      var weekend = (dow === 0 || dow === 6) ? 0.78 : 1;
      // ขยับขึ้นช้าๆ ตามเวลา เพื่อให้ "ช่วงก่อนหน้า" กับ "ปีก่อน" ต่างกันจริง
      var trend = 0.72 + (d / DAYS) * 0.5;
      var spike = rnd() < 0.035 ? 2.4 + rnd() * 2.2 : 1;   // มีวันไวรัลบ้าง
      var noise = 1 + (rnd() - 0.5) * cfg.viewsSwing;

      var reach = Math.max(120, Math.round(cfg.viewsBase * weekend * trend * spike * noise));
      var erDay = cfg.er * (0.7 + rnd() * 0.7);
      var eng = Math.round(reach * erDay);

      var row = { date: dayKey(date) };
      row[reachKey] = reach;
      // แบ่ง engagement ตามส่วนประกอบที่ช่องนั้นนับจริง
      if (pk === "youtube") {
        // 🔴 YouTube นับแชร์ด้วยแล้ว — ตัวเลขมาจาก YouTube Analytics (19 ส.ค. 2026)
        row.likes = Math.round(eng * 0.84);
        row.comments = Math.round(eng * 0.09);
        row.shares = eng - row.likes - row.comments;
        row.watchTime = Math.round(reach * (2.4 + rnd() * 2.6) / 60);      // ชั่วโมง
        row.avgViewDuration = Math.round(150 + rnd() * 190);               // วินาที
        row.completionRate = 0.28 + rnd() * 0.3;                           // averageViewPercentage
        /* CTR ของ YouTube อยู่ราว 3-8% ในช่องส่วนใหญ่ · เก็บเป็น "ถูกโชว์กี่ครั้ง"
           กับ "กลายเป็นการดูกี่ครั้ง" ไม่ใช่เก็บเป็น % สำเร็จรูป —
           ⚠️ รวมหลายวันต้องบวกทั้งสองตัวก่อนหาร ถ้าเก็บเป็น % จะเฉลี่ยผิดถ่วงน้ำหนัก */
        row.viewClicks = Math.round(reach * (0.62 + rnd() * 0.16));        // วิวที่มาจากการกดปก
        row.impressions = Math.round(row.viewClicks / (0.035 + rnd() * 0.045));
      } else if (pk === "tiktok") {
        row.likes = Math.round(eng * 0.80);
        row.comments = Math.round(eng * 0.07);
        row.shares = eng - row.likes - row.comments;
        row.completionRate = 0.32 + rnd() * 0.28;
        row.avgViewDuration = Math.round(9 + rnd() * 22);   // คลิปสั้น หน่วยเป็นวินาที
      } else {
        row.likes = Math.round(eng * 0.74);
        row.comments = Math.round(eng * 0.14);
        row.shares = eng - row.likes - row.comments;
        /* ⚠️ Facebook เล่นวิดีโอเองตอนเลื่อนผ่าน ยอดวิวดิบจึงพองกว่าคนที่หยุดดูจริงมาก
           ตัวเลข "ดูเกิน 3 วินาที" จึงต้องน้อยกว่า reach เสมอ (ราว 1 ใน 3) */
        row.views3s = Math.round(reach * (0.24 + rnd() * 0.16));
        /* Facebook: impressions มากกว่า reach เสมอ (คนเดียวเห็นได้หลายครั้ง)
           ตัวเศษของอัตราหยุดดูคือ "ดูเกิน 3 วิ" ไม่ใช่การกด — FB ไม่มีการกด */
        row.impressions = Math.round(reach * (1.25 + rnd() * 0.5));
        row.viewClicks = row.views3s;
      }
      daily.push(row);

      // ผู้ติดตาม: เก็บทั้งยอดสะสม และ เพิ่ม/ลด ของวันนั้น
      var prev = d === 0 ? followerSeries[0] : followerSeries[d - 1];
      var net = followerSeries[d] - prev;
      var lost = Math.round(Math.abs(net) * (0.35 + rnd() * 0.5) + rnd() * 12);
      followers.push({ date: dayKey(date), value: followerSeries[d], gained: net + lost, lost: lost });
    }

    // โพสต์ — กระจายตามความถี่ของช่องนั้น
    var pid = 0;
    for (var p = 0; p < DAYS; p += cfg.postEvery) {
      var pd = addDays(start, p + Math.floor(rnd() * cfg.postEvery));
      if (pd > today()) break;
      pid++;
      var vspike = rnd() < 0.09 ? 3.2 + rnd() * 4 : 0.55 + rnd() * 1.1;
      var pv = Math.max(90, Math.round(cfg.viewsBase * 0.42 * vspike));
      var per = cfg.er * (0.35 + rnd() * 1.7);   // ให้มีทั้งใบที่ ER ดีและแย่ ไว้ทดสอบ top/bottom
      var pe = Math.round(pv * per);

      var post = {
        id: pk + "-" + pid,
        title: TITLES[pid % TITLES.length],
        thumb: thumb(C.rawColor, pid, rnd),
        url: postUrl(pk, pid),
        publishedAt: dayKey(pd),
      };
      post[reachKey] = pv;
      if (pk === "youtube") {
        post.likes = Math.round(pe * 0.84);
        post.comments = Math.round(pe * 0.09);
        post.shares = Math.max(0, pe - post.likes - post.comments);
        post.watchTime = Math.round(pv * (2.4 + rnd() * 2.6) / 60);
        post.avgViewDuration = Math.round(150 + rnd() * 190);
        post.completionRate = 0.28 + rnd() * 0.3;
        post.viewClicks = Math.round(pv * (0.62 + rnd() * 0.16));
        post.impressions = Math.round(post.viewClicks / (0.035 + rnd() * 0.045));
      } else {
        post.likes = Math.round(pe * (pk === "tiktok" ? 0.80 : 0.74));
        post.comments = Math.round(pe * (pk === "tiktok" ? 0.07 : 0.14));
        post.shares = Math.max(0, pe - post.likes - post.comments);
        if (pk === "tiktok") {
          post.avgViewDuration = Math.round(9 + rnd() * 22);
          post.completionRate = 0.32 + rnd() * 0.28;
        } else {
          post.views3s = Math.round(pv * (0.24 + rnd() * 0.16));
          post.impressions = Math.round(pv * (1.25 + rnd() * 0.5));
          post.viewClicks = post.views3s;
        }
      }
      posts.push(post);
    }

    return { daily: daily, followers: followers, posts: posts };
  }

  /* ── ช่องที่ "ยังไม่ได้เชื่อมต่อ" ──────────────────────────────────
   * ของจริง: API จะตอบ ok:false พร้อม need[] ว่าขาด env ตัวไหน
   * ตอนนี้ยังเป็นข้อมูลจำลอง จึงเปิดดูสถานะนั้นได้ด้วย ?off=facebook
   * (คั่นหลายช่องด้วยจุลภาค) — ไว้ตรวจว่าหน้าตาตอนยังไม่เชื่อมเป็นยังไง
   * ⚠️ อ่านที่ชั้นข้อมูล ไม่ใช่ที่หน้าเว็บ เพราะพอต่อของจริงแล้ว
   *    หน้าเว็บต้องอ่านสถานะจากที่เดียวกันนี้โดยไม่ต้องแก้อะไรเพิ่ม */
  var NEED = {
    youtube: ["YT_API_KEY", "SOCIAL_YT_CHANNEL_ID"],
    tiktok: ["SOCIAL_TT_CLIENT_KEY", "SOCIAL_TT_CLIENT_SECRET", "SOCIAL_TT_REFRESH_TOKEN"],
    facebook: ["SOCIAL_FB_PAGE_ID", "SOCIAL_FB_TOKEN"],
  };
  var off = {};
  try {
    (new URLSearchParams(location.search).get("off") || "").split(",").forEach(function (k) {
      k = k.trim(); if (k) off[k] = 1;
    });
  } catch (e) {}

  var platforms = {};
  window.SOCIAL_CONFIG.ORDER.forEach(function (pk) {
    if (off[pk]) {
      platforms[pk] = {
        daily: [], followers: [], posts: [],
        status: { connected: false, need: NEED[pk] || [] },
      };
      return;
    }
    platforms[pk] = buildPlatform(pk);
    platforms[pk].status = { connected: true, need: [] };
  });

  /* ── อันดับคอนเทนต์ตามช่วงเวลา (แบบเดียวกับที่ของจริงทำ) ────────────
   * 🔴 ของจริงถาม YouTube ว่า "ช่วงนี้คลิปไหนทำยอดสูงสุด" ซึ่งรวมคลิปเก่าด้วย
   *    ข้อมูลจำลองต้องตอบแบบเดียวกัน ไม่งั้นหน้า demo กับของจริงทำงานคนละอย่าง
   *
   * ⚠️ ไม่เก็บยอดรายวันต่อโพสต์ (โพสต์ละ 500 วัน × หลายสิบโพสต์ = หนักเกินจำเป็น)
   *    ใช้สูตรการสลายตัวแทน: ยอดวิวส่วนใหญ่เกิดใน 1-2 สัปดาห์แรกแล้วค่อยๆ เหลือหาง
   *    views ที่เกิดระหว่างวันที่ a ถึง b หลังลง = V × (e^(-a/τ) − e^(-b/τ))
   *    τ = 6 วัน → ~90% ของยอดเกิดใน 14 วันแรก ซึ่งใกล้เคียงของจริง
   */
  var DECAY_TAU = 6;

  function shareInRange(post, from, to) {
    var pub = new Date(post.publishedAt + "T00:00:00");
    var a = Math.max(0, Math.round((new Date(from + "T00:00:00") - pub) / 864e5));
    var b = Math.round((new Date(to + "T00:00:00") - pub) / 864e5) + 1;
    if (b <= 0) return 0;                       // ยังไม่ได้ลงในช่วงนี้
    if (b <= a) return 0;
    return Math.exp(-a / DECAY_TAU) - Math.exp(-b / DECAY_TAU);
  }

  /** คลิปที่ทำยอดสูงสุดในช่วงที่เลือก — ไม่กรองด้วยวันที่ลง */
  function topInRange(pk, from, to, limit) {
    var P = window.SOCIAL_CONFIG.PLATFORMS[pk];
    var rk = P.reachKey;
    return (platforms[pk].posts || [])
      .map(function (po) {
        var f = shareInRange(po, from, to);
        if (!f) return null;
        var out = { id: po.id, title: po.title, thumb: po.thumb, url: po.url, publishedAt: po.publishedAt };
        // ⚠️ ปัดเป็นจำนวนเต็มทุกตัว — ยอดวิว 0.4 ครั้งไม่มีอยู่จริง
        out[rk] = Math.round((po[rk] || 0) * f);
        out.likes = Math.round((po.likes || 0) * f);
        out.comments = Math.round((po.comments || 0) * f);
        if (po.shares != null) out.shares = Math.round(po.shares * f);
        // ค่าเฉลี่ยไม่ต้องคูณสัดส่วน — เป็นค่าเฉลี่ยอยู่แล้ว
        if (po.avgViewDuration != null) out.avgViewDuration = po.avgViewDuration;
        if (po.completionRate != null) out.completionRate = po.completionRate;
        if (po.watchTime != null) out.watchTime = Math.round(po.watchTime * f);
        if (po.views3s != null) out.views3s = Math.round(po.views3s * f);
        /* ⚠️ ทั้งคู่ต้องคูณสัดส่วนเท่ากัน ไม่งั้น View rate ของช่วงสั้นจะเพี้ยน */
        if (po.impressions != null) {
          out.impressions = Math.round(po.impressions * f);
          out.viewClicks = Math.round((po.viewClicks || 0) * f);
        }
        return out[rk] > 0 ? out : null;
      })
      .filter(Boolean)
      .sort(function (x, y) { return (y[rk] || 0) - (x[rk] || 0); })
      .slice(0, limit || 10);
  }

  window.SOCIAL_MOCK = {
    topInRange: topInRange,
    isMock: true,               // ⚠️ หน้าเว็บใช้ธงนี้ตัดสินใจว่าจะขึ้นแถบเตือน
    generatedAt: new Date().toISOString(),
    platforms: platforms,
  };
})();
