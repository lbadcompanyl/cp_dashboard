/* ตัวโหลดข้อมูลจริง — แปลงคำตอบของ /social/api/* ให้เป็นโครงที่หน้าเว็บใช้
 *
 * 🎯 หน้าเว็บรู้จักโครงเดียวเท่านั้น: { daily, followers, posts, status }
 *    ไฟล์นี้คือที่เดียวที่รู้ว่า API ของแต่ละเจ้าหน้าตาเป็นยังไง
 *    เพิ่มช่องใหม่ / เปลี่ยนรูปคำตอบของ API → แก้ที่นี่ที่เดียว ไม่ต้องแตะตัววาด
 *
 * 🔴 สถานะของช่องมี 3 แบบ ไม่ใช่ 2 — จุดนี้สำคัญที่สุดของไฟล์นี้
 *
 *    connected  เชื่อมแล้วและมีตัวเลขรายวันย้อนหลัง → ใช้ได้ทุกส่วนของแดชบอร์ด
 *    partial    เชื่อมแล้ว แต่ต้นทางให้ได้แค่ "ยอด ณ ตอนนี้" กับรายการคอนเทนต์
 *               ยังไม่มีประวัติรายวัน → กราฟกับตารางรายวันว่าง
 *    off        ยังไม่ได้ใส่ค่า → ขึ้นการ์ดบอกว่าต้องใส่อะไร
 *
 *    ⚠️ ห้ามยุบ partial ไปรวมกับอันไหน — YouTube ที่ใส่แค่ API key อยู่ในสถานะนี้
 *       ถ้านับเป็น connected กราฟจะว่างโดยไม่มีคำอธิบาย (ดูเหมือนระบบพัง)
 *       ถ้านับเป็น off ตัวเลขจริงที่มีอยู่แล้วจะถูกทิ้งไปเปล่าๆ
 */
(function () {
  "use strict";

  var C = window.SOCIAL_CONFIG;

  /* endpoint ของแต่ละช่อง — ชื่อไฟล์ต้องตรงกับ functions/social/api/<key>.js */
  var ENDPOINT = {
    youtube: "/social/api/youtube",
    tiktok: "/social/api/tiktok",
    facebook: "/social/api/facebook",
  };

  /** ช่องเปล่าที่ยังไม่ได้เชื่อม — โครงต้องครบเสมอ ตัววาดจะได้ไม่ต้องเช็ค null */
  function emptyChannel(need, message) {
    return {
      daily: [], followers: [], posts: [],
      status: { connected: false, partial: false, need: need || [], message: message || "" },
    };
  }

  function dayKey(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return String(iso).slice(0, 10);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
  }

  /* ── YouTube ────────────────────────────────────────────────────────
   * ชั้น API key ให้ได้แค่ "ยอด ณ ตอนนี้" กับคลิปล่าสุด — ไม่มีประวัติรายวันเลย
   * ⚠️ ยอดผู้ติดตามถูก YouTube ปัดเหลือเลขนัยสำคัญ 3 ตัวก่อนส่งมา (52,437 → 52,400)
   *    จึงเอาไปคิด "เพิ่มขึ้นกี่คนวันนี้" ไม่ได้ ต้องติดป้ายว่าเป็นค่าประมาณ
   */
  function fromYouTube(res) {
    if (!res || !res.ok || !res.data) {
      return emptyChannel(res && res.need, res && res.message);
    }
    var ch = res.data.channel || {};
    var vids = res.data.videos || [];

    var posts = vids.map(function (v) {
      return {
        id: v.id,
        title: v.title,
        thumb: v.thumb,
        url: v.url,
        publishedAt: dayKey(v.at),
        views: v.views || 0,
        likes: v.likes || 0,
        comments: v.comments || 0,
        // ⚠️ YouTube ไม่เปิดเผยจำนวนแชร์ — 0 ตรงนี้แปลว่า "ไม่นับ" ไม่ใช่ "ไม่มีใครแชร์"
        //    ตัววาดรู้เรื่องนี้จาก PLATFORMS.youtube.parts ที่ไม่มี shares อยู่แล้ว
        shares: 0,
      };
    });

    return {
      daily: [],
      followers: [],
      posts: posts,
      status: {
        connected: true,
        partial: true,                 // ← ยังไม่มีตัวเลขรายวัน
        need: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "YT_REFRESH_TOKEN"],
        message: "เชื่อมต่อแล้ว แต่ยังไม่มีตัวเลขรายวันย้อนหลัง",
        why: "YouTube Data API ให้ได้แค่ยอด ณ ตอนนี้ · ตัวเลขรายวันต้องต่อ YouTube Analytics เพิ่ม",
      },
      now: {
        followers: ch.subs,
        followersApprox: !!ch.subsApprox,
        followersHidden: !!ch.subsHidden,
        viewsAllTime: ch.views,
        contentCount: ch.videos,
        title: ch.title,
        url: ch.url,
      },
    };
  }

  /* ── TikTok / Facebook ──────────────────────────────────────────────
   * ยังไม่ได้ต่อของจริง (ยังไม่มี token) — endpoint คืน not-configured อยู่
   * ⚠️ เขียนตัวแปลงไว้ล่วงหน้าไม่ได้ ต้องเห็นคำตอบจริงก่อนถึงจะรู้ชื่อฟิลด์
   *    เดาไว้แล้วผิด จะกลายเป็นตัวเลขที่ดูเหมือนถูกแต่ผิด ซึ่งแย่กว่าไม่มีข้อมูล
   */
  function fromGeneric(res) {
    if (!res || !res.ok || !res.data) {
      return emptyChannel(res && res.need, res && res.message);
    }
    var d = res.data;
    return {
      daily: d.daily || [],
      followers: d.followers || [],
      posts: d.posts || [],
      status: {
        connected: true,
        partial: !(d.daily && d.daily.length),
        need: [],
        message: "",
      },
      now: d.now || null,
    };
  }

  var MAP = { youtube: fromYouTube, tiktok: fromGeneric, facebook: fromGeneric };

  function fetchOne(pk) {
    return fetch(ENDPOINT[pk], { headers: { accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .catch(function (e) {
        /* ⚠️ ยิงไม่ถึง endpoint ≠ ยังไม่ได้เชื่อมต่อ — คนละเรื่องกัน
           ถ้าบอกว่า "ยังไม่ได้ใส่ค่า" ทั้งที่เน็ตหลุด เจ้าของจะไปนั่งไล่ตั้งค่าใหม่เปล่าๆ */
        return { ok: false, status: "error", need: [], message: "ต่อกับเซิร์ฟเวอร์ไม่ได้ (" + (e.message || e) + ")" };
      });
  }

  /**
   * โหลดข้อมูลของทุกช่องพร้อมกัน
   * ⚠️ ต้องยิงพร้อมกัน ไม่ใช่ไล่ทีละช่อง — ช่องที่ต้นทางอืดช่องเดียว
   *    จะทำให้ทั้งแดชบอร์ดค้างรอ (บทเรียนเดิมจากคอลัมน์ YouTube ของ /trend/)
   */
  function loadReal() {
    var order = C.ORDER;
    return Promise.all(order.map(fetchOne)).then(function (list) {
      var platforms = {};
      order.forEach(function (pk, i) {
        platforms[pk] = MAP[pk](list[i]);
      });
      return { isMock: false, generatedAt: new Date().toISOString(), platforms: platforms };
    });
  }

  /** ใช้ข้อมูลจำลอง — สำหรับออกแบบหน้าตา เปิดด้วย ?mock=1 */
  function useMock() {
    return Promise.resolve(window.SOCIAL_MOCK);
  }

  function wantMock() {
    try {
      var q = new URLSearchParams(location.search);
      if (q.get("mock") === "1") return true;
      // ?off=... เป็นเครื่องมือดูหน้าตาตอนยังไม่เชื่อม ซึ่งอยู่ในชั้นข้อมูลจำลอง
      if (q.get("off")) return true;
      // เปิดจากไฟล์ในเครื่อง (ตอนทดสอบเลย์เอาต์) ไม่มี API ให้ยิงอยู่แล้ว
      return location.protocol === "file:";
    } catch (e) { return false; }
  }

  window.SOCIAL_DATA = {
    load: function () { return wantMock() ? useMock() : loadReal(); },
    isMockRequested: wantMock,
  };
})();
