/* นิยาม metric ของแต่ละช่อง — จุดเดียวในระบบที่กำหนดว่าแต่ละช่องวัดอะไรด้วยสูตรไหน
 *
 * ⚠️ แต่ละแพลตฟอร์มนับไม่เหมือนกันโดยธรรมชาติ ห้ามบังคับให้เท่ากัน
 *    Facebook ไม่มี "Views" แบบ YouTube — ตัวที่เทียบได้คือ "Reach" (จำนวนคนที่เห็น)
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
      rawColor: "#dc2626",
      icon: "▶",
      contentWord: "คลิป",
      // ⚠️ ชื่อ metric หลักของแต่ละช่องไม่เหมือนกัน — ใช้ค่านี้ตั้งป้ายทุกที่ ห้ามฮาร์ดโค้ดคำว่า "Views"
      reachKey: "views",
      reachLabel: "Views",
      erLabel: "Engagement rate",
      erFormula: "(ไลก์ + คอมเมนต์) ÷ Views",
      erNote: "YouTube ไม่เปิดเผยจำนวนแชร์ผ่าน API จึงไม่ได้นับรวม",
      er: function (a) { return rate(a.likes + a.comments, a.views); },
      // ส่วนประกอบของ engagement — ใช้วาด stacked bar และโชว์จำนวนจริง
      parts: [
        { key: "likes", label: "ไลก์", color: "#dc2626" },
        { key: "comments", label: "คอมเมนต์", color: "#ea9010" },
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
      rawColor: "#0d9488",
      icon: "♪",
      contentWord: "คลิป",
      reachKey: "views",
      reachLabel: "Views",
      erLabel: "Engagement rate",
      erFormula: "(ไลก์ + คอมเมนต์ + แชร์) ÷ Views",
      erNote: "TikTok นับแชร์รวมด้วย ตัวเลข ER จึงมักสูงกว่าช่องอื่นโดยธรรมชาติ",
      er: function (a) { return rate(a.likes + a.comments + a.shares, a.views); },
      parts: [
        { key: "likes", label: "ไลก์", color: "#0d9488" },
        { key: "comments", label: "คอมเมนต์", color: "#1d78c9" },
        { key: "shares", label: "แชร์", color: "#7048c4" },
      ],
      extras: [
        { key: "views", label: "Views ของวิดีโอ", fmt: "num" },
        { key: "completionRate", label: "ดูจนจบ", fmt: "pct" },
      ],
    },

    facebook: {
      key: "facebook",
      label: "Facebook",
      short: "FB",
      color: "var(--fb)",
      rawColor: "#2563eb",
      icon: "f",
      contentWord: "โพสต์",
      // 🔴 Facebook ใช้ Reach ไม่ใช่ Views — เทียบกับ 2 ช่องบนแบบตรงๆ ไม่ได้
      reachKey: "reach",
      reachLabel: "Reach",
      erLabel: "Engagement rate",
      erFormula: "(ไลก์ + คอมเมนต์ + แชร์) ÷ Reach",
      erNote: "Facebook วัดจากจำนวนคนที่เห็นโพสต์ (reach) ไม่ใช่จำนวนครั้งที่ถูกเปิด",
      er: function (a) { return rate(a.likes + a.comments + a.shares, a.reach); },
      parts: [
        { key: "likes", label: "ไลก์", color: "#2563eb" },
        { key: "comments", label: "คอมเมนต์", color: "#4f6ed6" },
        { key: "shares", label: "แชร์", color: "#8257c9" },
      ],
      extras: [
        { key: "reach", label: "Reach", fmt: "num" },
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
