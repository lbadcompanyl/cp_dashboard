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

  /** ช่องที่ยังใช้ไม่ได้ — โครงต้องครบเสมอ ตัววาดจะได้ไม่ต้องเช็ค null
   * 🔴 แยก "ยังไม่ได้ใส่ค่า" ออกจาก "ใส่แล้วแต่สิทธิ์หมดอายุ" (เจ้าของ 19 ส.ค. 2026)
   *    บัญชี Gmail ธรรมดาที่ยังไม่ได้ publish แอป Google จะให้ refresh token
   *    ที่ **หมดอายุทุก 7 วัน** — วันที่มันหมด แดชบอร์ดต้องบอกว่า "สิทธิ์หมดอายุ
   *    ต้องกดขอใหม่" ไม่ใช่ "ยังไม่ได้เชื่อมต่อ" ซึ่งจะทำให้ไปไล่ตั้งค่าใหม่ทั้งชุดเปล่าๆ
   */
  function emptyChannel(res) {
    var st = (res && res.status) || "not-configured";
    return {
      daily: [], followers: [], posts: [],
      status: {
        connected: false,
        partial: false,
        authFailed: st === "auth-failed",
        fetchFailed: st === "error",
        // เซสชันของ Cloudflare Access หมด — ไม่ใช่เรื่องการตั้งค่าเลย แค่ต้องล็อกอินใหม่
        signedOut: st === "signed-out",
        need: (res && res.need) || [],
        message: (res && res.message) || "",
      },
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
      return emptyChannel(res);
    }
    var ch = res.data.channel || {};
    var vids = res.data.videos || [];

    var an0 = res.data.analytics || {};
    var byVideo = an0.byVideo || {};

    /* ⚠️ ตัวเลขต่อคลิปมาจาก 2 ที่ ต้องรู้ว่าอันไหนมาจากไหน
       Data API  → ยอดวิว ไลก์ คอมเมนต์ (มีเสมอ)
       Analytics → แชร์ เวลาที่คนดู ดูเฉลี่ย ดูจนจบ (มีเฉพาะตอนต่อชั้นที่ 2)
       ตัวที่ Analytics ไม่ได้ให้มา ต้องปล่อยเป็น undefined ห้ามใส่ 0
       — 0 แปลว่า "วัดได้แล้วได้ศูนย์" คนละเรื่องกับ "ยังไม่ได้ต่อชั้นนั้น" */
    var posts = vids.map(function (v) {
      var extra = byVideo[v.id] || null;
      var po = {
        id: v.id,
        title: v.title,
        thumb: v.thumb,
        url: v.url,
        publishedAt: dayKey(v.at),
        views: v.views || 0,
        likes: v.likes || 0,
        comments: v.comments || 0,
      };
      if (extra) {
        if (extra.shares != null) po.shares = extra.shares;
        if (extra.watchTime != null) po.watchTime = extra.watchTime;
        if (extra.avgViewDuration != null) po.avgViewDuration = extra.avgViewDuration;
        if (extra.completionRate != null) po.completionRate = extra.completionRate;
        /* ⚠️ ตัวเศษกับตัวส่วนของ View rate ต้องมาคู่กันเสมอ
           มาแค่ตัวเดียว = คิดอัตราส่วนไม่ได้ ต้องปล่อยว่างทั้งคู่ให้ขึ้น "—" */
        if (extra.impressions != null) {
          po.impressions = extra.impressions;
          po.viewClicks = extra.viewClicks || 0;
        }
      }
      return po;
    });

    /* ชั้นรายวันมาจาก YouTube Analytics — ไม่มีก็ยังใช้ชั้นสาธารณะได้
       ⚠️ analyticsError = เชื่อมไว้แล้วแต่สิทธิ์พัง คนละเรื่องกับ "ยังไม่ได้ต่อ"
          ต้องบอกให้ต่างกัน ไม่งั้นไปไล่ตั้งค่าใหม่ทั้งที่ค่ายังถูก */
    var an = res.data.analytics;
    var anErr = res.data.analyticsError || "";
    var hasDaily = !!(an && an.daily && an.daily.length);

    return {
      daily: hasDaily ? an.daily : [],
      followers: hasDaily ? (an.followers || []) : [],
      posts: posts,
      status: hasDaily
        ? { connected: true, partial: false, need: [], message: "",
            /* ⚠️ ระดับของเส้นผู้ติดตามเดินถอยมาจากยอดปัจจุบันซึ่ง YouTube ปัดเลขไว้
               รูปทรงกับยอดเข้า/ออกรายวันเป็นของจริงเป๊ะ แต่ระดับคลาดได้หลักร้อย */
            approxFollowerLevel: !!an.approxLevel }
        : {
            connected: true,
            partial: true,                 // ← ยังไม่มีตัวเลขรายวัน
            need: anErr ? [] : ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "YT_REFRESH_TOKEN"],
            authFailed: !!anErr,
            message: anErr || "เชื่อมต่อแล้ว แต่ยังไม่มีตัวเลขรายวันย้อนหลัง",
            why: anErr
              ? anErr + " — ตัวเลข ณ ตอนนี้กับคลิปล่าสุดยังใช้ได้ตามปกติ"
              : "YouTube Data API ให้ได้แค่ยอด ณ ตอนนี้ · ตัวเลขรายวันต้องต่อ YouTube Analytics เพิ่ม",
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
      return emptyChannel(res);
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

  /* ── ยิง API หนึ่งเส้น ────────────────────────────────────────────
   * 🔴 Cloudflare Access ทำให้เกิดสถานะที่ 4 ที่ไม่เคยมีมาก่อน: "เซสชันหมดอายุ"
   *    หน้าเว็บเปิดค้างไว้ข้ามคืน → เซสชันของ Access หมด → auto-refresh ทุก 3 นาที
   *    ยิงไปแล้วได้ "หน้าเข้าสู่ระบบ" เป็น HTML กลับมาแทน JSON
   * ⚠️ เอา HTML ไป r.json() จะพังเป็น syntax error แล้วตกลงไปที่ catch
   *    ซึ่งรายงานว่า "ต่อกับเซิร์ฟเวอร์ไม่ได้" — พาไปไล่หาปัญหาเน็ต/ต้นทางผิดทาง
   *    ทั้งที่แค่ต้องกดเข้าสู่ระบบใหม่ · เช็คชนิดของคำตอบก่อนแกะเสมอ
   * ⚠️ อีกทางที่ Access ตอบคือ 302 ข้ามโดเมนไปหน้า login ของทีม
   *    กรณีนั้น fetch จะถูก CORS บล็อกแล้ว reject — แยกจากเน็ตหลุดไม่ได้
   *    ข้อความใน catch จึงต้องพูดถึงทั้ง 2 ความเป็นไปได้ ห้ามฟันธงอันเดียว
   */
  function apiGet(url) {
    return fetch(url, { headers: { accept: "application/json" } })
      .then(function (r) {
        var ct = r.headers.get("content-type") || "";
        if (ct.indexOf("json") < 0) {
          return { ok: false, status: "signed-out", need: [],
                   message: "เซสชันหมดอายุ ต้องเข้าสู่ระบบใหม่" };
        }
        return r.json();
      })
      .catch(function (e) {
        /* ⚠️ ยิงไม่ถึง endpoint ≠ ยังไม่ได้เชื่อมต่อ — คนละเรื่องกัน
           ถ้าบอกว่า "ยังไม่ได้ใส่ค่า" ทั้งที่เน็ตหลุด เจ้าของจะไปนั่งไล่ตั้งค่าใหม่เปล่าๆ */
        return { ok: false, status: "error", need: [],
                 message: "ต่อกับเซิร์ฟเวอร์ไม่ได้ หรือเซสชันหมดอายุ (" + (e.message || e) + ")" };
      });
  }

  function fetchOne(pk) {
    return apiGet(ENDPOINT[pk]);
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
      /* ⚠️ เซสชันหมดจะพังพร้อมกันทุกช่อง — ขึ้นการ์ดซ้ำ 3 ใบเป็นการรบกวนเปล่าๆ
         ยกขึ้นเป็นแถบเดียวบนสุดแทน แล้วให้กดเข้าสู่ระบบใหม่ได้จากตรงนั้นเลย */
      var signedOut = order.every(function (pk) {
        return platforms[pk].status && platforms[pk].status.signedOut;
      });
      return { isMock: false, signedOut: signedOut,
               generatedAt: new Date().toISOString(), platforms: platforms };
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

  /* ── อันดับคอนเทนต์ตามช่วงเวลาที่เลือก ─────────────────────────────
   * 🔴 แยกออกจาก load() เพราะผลลัพธ์ "เปลี่ยนตามช่วงที่ผู้ใช้เลือก"
   *    ส่วน load() คืนข้อมูลของช่องซึ่งไม่ขึ้นกับช่วงเวลา โหลดครั้งเดียวพอ
   * ⚠️ ช่องที่ยังไม่รองรับ ให้คืน null ไม่ใช่ [] — null แปลว่า "ทำไม่ได้"
   *    ส่วน [] แปลว่า "ทำได้แต่ช่วงนี้ไม่มีคลิปไหนมียอดเลย" คนละความหมาย
   */
  var TOP_ENDPOINT = { youtube: "/social/api/youtube-top" };

  function loadTop(pk, from, to) {
    if (wantMock()) {
      var mk = window.SOCIAL_MOCK;
      return Promise.resolve(mk && mk.topInRange ? mk.topInRange(pk, from, to, 10) : null);
    }
    var ep = TOP_ENDPOINT[pk];
    if (!ep) return Promise.resolve(null);

    return apiGet(ep + "?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to))
      .then(function (res) {
        if (!res || !res.ok || !res.data) return null;
        return (res.data.videos || []).map(function (v) {
          var po = {
            id: v.id, title: v.title, thumb: v.thumb, url: v.url,
            publishedAt: dayKey(v.at),
            views: v.views || 0, likes: v.likes || 0, comments: v.comments || 0,
          };
          if (v.shares != null) po.shares = v.shares;
          if (v.watchTime != null) po.watchTime = v.watchTime;
          if (v.avgViewDuration != null) po.avgViewDuration = v.avgViewDuration;
          if (v.completionRate != null) po.completionRate = v.completionRate;
          if (v.impressions != null) {
            po.impressions = v.impressions;
            po.viewClicks = v.viewClicks || 0;
          }
          return po;
        });
      })
      .catch(function () { return null; });
  }

  window.SOCIAL_DATA = {
    load: function () { return wantMock() ? useMock() : loadReal(); },
    loadTop: loadTop,
    isMockRequested: wantMock,
  };
})();
