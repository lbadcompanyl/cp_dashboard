/* นิยาม metric ของแต่ละช่อง — จุดเดียวในระบบที่กำหนดว่าแต่ละช่องวัดอะไรด้วยสูตรไหน
 *
 * ⚠️ แต่ละแพลตฟอร์มนับไม่เหมือนกันโดยธรรมชาติ ห้ามบังคับให้เท่ากัน
 *    Facebook ไม่มี "ยอดวิว" แบบ YouTube — ตัวที่เทียบได้คือ "การเข้าถึง (reach)"
 *    TikTok นับแชร์เข้า engagement ด้วย ส่วน YouTube ไม่มีตัวเลขแชร์ให้เลย
 *    เอา 3 ช่องมาหารด้วยสูตรเดียวกันเมื่อไหร่ = ตัวเลขที่ได้เทียบกันไม่ได้จริง
 *
 * ⚠️ แก้สูตรตรงนี้ที่เดียว ทั้งหน้าเว็บและ footnote จะตามเอง —
 *    ห้ามเขียนสูตรซ้ำไว้ในไฟล์อื่น ไม่งั้นตัวเลขกับคำอธิบายจะเพี้ยนคนละทาง
 */
(function () {
  "use strict";

  /** ป้องกันหารด้วยศูนย์ — ไม่มีฐานให้หาร = ไม่รู้ ไม่ใช่ 0 */
  function rate(numer, denom) {
    return denom > 0 ? numer / denom : null;
  }

  var PLATFORMS = {
    youtube: {
      key: "youtube",
      label: "YouTube",
      short: "YT",
      color: "var(--yt)",
      rawColor: "#ff3d3d",
      icon: "▶",
      contentWord: "คลิป",
      // ⚠️ ชื่อ metric หลักของแต่ละช่องไม่เหมือนกัน — ใช้ค่านี้ตั้งป้ายทุกที่ ห้ามฮาร์ดโค้ดคำว่า "ยอดวิว"
      reachKey: "views",
      reachLabel: "ยอดวิว",
      erLabel: "Engagement rate",
      erFormula: "(ไลก์ + คอมเมนต์) ÷ ยอดวิว",
      erNote: "YouTube ไม่เปิดเผยจำนวนแชร์ผ่าน API จึงไม่ได้นับรวม",
      er: function (a) { return rate(a.likes + a.comments, a.views); },
      // ส่วนประกอบของ engagement — ใช้วาด stacked bar และโชว์จำนวนจริง
      parts: [
        { key: "likes", label: "ไลก์", color: "#ff6b6b" },
        { key: "comments", label: "คอมเมนต์", color: "#ffa94d" },
      ],
      // metric เฉพาะแพลตฟอร์ม — โผล่เฉพาะในแท็บของช่องนั้น
      extras: [
        { key: "watchTime", label: "เวลาที่คนดูรวม", fmt: "hours" },
        { key: "avgViewDuration", label: "ดูเฉลี่ยต่อคลิป", fmt: "duration" },
      ],
    },

    tiktok: {
      key: "tiktok",
      label: "TikTok",
      short: "TT",
      color: "var(--tt)",
      rawColor: "#25f4ee",
      icon: "♪",
      contentWord: "คลิป",
      reachKey: "views",
      reachLabel: "ยอดวิว",
      erLabel: "Engagement rate",
      erFormula: "(ไลก์ + คอมเมนต์ + แชร์) ÷ ยอดวิว",
      erNote: "TikTok นับแชร์รวมด้วย ตัวเลข ER จึงมักสูงกว่าช่องอื่นโดยธรรมชาติ",
      er: function (a) { return rate(a.likes + a.comments + a.shares, a.views); },
      parts: [
        { key: "likes", label: "ไลก์", color: "#25f4ee" },
        { key: "comments", label: "คอมเมนต์", color: "#4dabf7" },
        { key: "shares", label: "แชร์", color: "#9775fa" },
      ],
      extras: [
        { key: "views", label: "ยอดวิววิดีโอ", fmt: "num" },
        { key: "completionRate", label: "ดูจนจบ", fmt: "pct" },
      ],
    },

    facebook: {
      key: "facebook",
      label: "Facebook",
      short: "FB",
      color: "var(--fb)",
      rawColor: "#4a8cff",
      icon: "f",
      contentWord: "โพสต์",
      // 🔴 Facebook ใช้ reach ไม่ใช่ views — เทียบกับ 2 ช่องบนแบบตรงๆ ไม่ได้
      reachKey: "reach",
      reachLabel: "การเข้าถึง",
      erLabel: "Engagement rate",
      erFormula: "(ไลก์ + คอมเมนต์ + แชร์) ÷ การเข้าถึง",
      erNote: "Facebook วัดจากจำนวนคนที่เห็นโพสต์ (reach) ไม่ใช่จำนวนครั้งที่ถูกเปิด",
      er: function (a) { return rate(a.likes + a.comments + a.shares, a.reach); },
      parts: [
        { key: "likes", label: "ไลก์", color: "#4a8cff" },
        { key: "comments", label: "คอมเมนต์", color: "#748ffc" },
        { key: "shares", label: "แชร์", color: "#b197fc" },
      ],
      extras: [
        { key: "reach", label: "การเข้าถึง", fmt: "num" },
      ],
    },
  };

  /* ลำดับที่ใช้แสดงผลทุกที่ — เปลี่ยนที่นี่ที่เดียวได้ทั้งหน้า */
  var ORDER = ["youtube", "tiktok", "facebook"];

  /* แท็บของหน้านี้
   * ⚠️ เพิ่มแท็บใหม่ (เช่น "โฆษณา") ให้เติมในลิสต์นี้ที่เดียว —
   *    แถบแท็บ กับ ตัวจำว่าเปิดแท็บไหนอยู่ อ่านจากลิสต์นี้ ไม่ได้เขียนค้างไว้ใน HTML */
  var TABS = [
    { key: "summary", label: "ภาพรวม", icon: "◎" },
    { key: "youtube", label: "YouTube", icon: "▶", platform: "youtube" },
    { key: "tiktok", label: "TikTok", icon: "♪", platform: "tiktok" },
    { key: "facebook", label: "Facebook", icon: "f", platform: "facebook" },
    // ตัวอย่างของอนาคต: { key:"paid", label:"โฆษณา", icon:"฿" }
  ];

  window.SOCIAL_CONFIG = {
    PLATFORMS: PLATFORMS,
    ORDER: ORDER,
    TABS: TABS,
    /** รวม engagement ตามที่แต่ละช่องนับ — ใช้ทั้งตอนคิด ER และตอนวาดแท่ง */
    engagementOf: function (pk, a) {
      var parts = PLATFORMS[pk].parts, sum = 0;
      for (var i = 0; i < parts.length; i++) sum += a[parts[i].key] || 0;
      return sum;
    },
    /** ค่าที่ใช้เป็น "ฐานการมองเห็น" ของช่องนั้น (views หรือ reach) */
    reachOf: function (pk, a) {
      return a[PLATFORMS[pk].reachKey] || 0;
    },
  };
})();
