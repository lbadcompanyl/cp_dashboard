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
      erFormula: "(Likes + Comments + Shares) ÷ Views",
      /* 🔴 เดิมไม่นับแชร์ เพราะชั้น API key (YouTube Data API) ไม่เปิดเผยตัวเลขนี้
         พอต่อ YouTube Analytics แล้วได้มาจริง เจ้าของสั่งให้นับด้วย (19 ส.ค. 2026)
         ⚠️ ผลข้างเคียง: ค่า ER ของ YouTube สูงขึ้นเล็กน้อยเทียบกับที่เคยเห็นก่อนหน้า
            แลกกับการที่ทั้ง 3 ช่องใช้สูตรตัวเศษเดียวกัน เทียบกันได้ตรงขึ้น
            (ตัวส่วนยังต่างกันอยู่ — YouTube/TikTok เป็น Views · Facebook เป็น Reach) */
      erNote: "ตัวเลขแชร์มาจาก YouTube Analytics — ถ้าต่อแค่ API key จะไม่มีส่วนนี้",
      er: function (a) { return rate(a.likes + a.comments + (a.shares || 0), a.views); },
      // ส่วนประกอบของ engagement — ใช้วาด stacked bar และโชว์จำนวนจริง
      parts: [
        { key: "likes", label: "Likes", color: "#dc2626" },
        { key: "comments", label: "Comments", color: "#ea9010" },
        { key: "shares", label: "Shares", color: "#9333ea" },
      ],
      // metric เฉพาะแพลตฟอร์ม — โผล่เฉพาะในแท็บของช่องนั้น
      /* 🔴 "จากที่ถูกโชว์ กลายเป็นการดูจริงกี่ %" — แต่ละเจ้าไม่ได้เรียกเหมือนกัน
         YouTube เรียก CTR เพราะมีขั้นตอน "เห็นรูปปกแล้วกด" จริงๆ
         Facebook ไม่มีการกด (วิดีโอเล่นเองตอนเลื่อนผ่าน) ตัวที่เทียบได้คือ "ดูเกิน 3 วิ"
         ⚠️ ใช้ป้ายกลางๆ ในตารางรวม แล้วเรียกชื่อจริงของช่องนั้นในแท็บของช่อง
            เหมือนที่ทำกับ Retention — ห้ามเขียนว่า CTR ในคอลัมน์รวม ไม่งั้นอ่านค่า FB ผิด */
      viewRateLabel: "CTR",
      viewRateWhat: "จากจำนวนครั้งที่รูปปกถูกโชว์ มีกี่ % ที่คนกดเข้ามาดู",
      extras: [
        { key: "impressions", label: "Impressions (ครั้งที่รูปปกถูกโชว์)", fmt: "num" },
        { key: "viewRate", label: "CTR (กดเข้ามาดู ÷ เห็นรูปปก)", fmt: "pct" },
        { key: "watchTime", label: "เวลาที่คนดูรวม", fmt: "hours" },
        { key: "avgViewDuration", label: "ดูเฉลี่ยต่อคลิป", fmt: "duration" },
        { key: "completionRate", label: "Retention (ดูเฉลี่ย % ของคลิป)", fmt: "pct" },
      ],
      /* ตัวชี้วัดคุณภาพการดู ที่ช่องนี้ให้ตัวเลขได้จริง (ดู VIEW_COLS)
         ⚠️ completionRate ของ YouTube = averageViewPercentage (ดูเฉลี่ยกี่ % ของคลิป)
            ไม่ใช่ "สัดส่วนคนที่ดูจนจบ" แบบ TikTok — ดูคำอธิบายที่ VIEW_COLS */
      stats: { watchTime: true, avgViewDuration: true, completionRate: true,
               impressions: true, viewRate: true },
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
      erFormula: "(Likes + Comments + Shares) ÷ Views",
      erNote: "TikTok นับแชร์รวมด้วย ตัวเลข ER จึงมักสูงกว่าช่องอื่นโดยธรรมชาติ",
      er: function (a) { return rate(a.likes + a.comments + a.shares, a.views); },
      parts: [
        { key: "likes", label: "Likes", color: "#0d9488" },
        { key: "comments", label: "Comments", color: "#1d78c9" },
        { key: "shares", label: "Shares", color: "#7048c4" },
      ],
      extras: [
        { key: "views", label: "Views ของวิดีโอ", fmt: "num" },
        { key: "completionRate", label: "ดูจนจบ (ดูครบทั้งคลิป)", fmt: "pct" },
      ],
      /* ⚠️ TikTok นับ 1 view ตั้งแต่วินาทีแรกที่คลิปเริ่มเล่น ไม่มีเกณฑ์ 3 วินาที
         และ API พื้นฐานไม่ให้เวลาดูรวม — ใส่ไปก็เป็นตัวเลขที่ไม่มีอยู่จริง
         🚫 ไม่มี Impressions / CTR ด้วย (เจ้าของถามไว้ 20 ส.ค. 2026)
            TikTok เป็นฟีดที่คลิปเล่นเองตอนเลื่อนถึง ไม่มีขั้นตอน "เห็นรูปปกแล้วกด"
            จึงไม่มีทั้งตัวหารและตัวเศษของ CTR · ที่ใกล้เคียงคือ "ดูจนจบ" ซึ่งมีอยู่แล้ว
            ⚠️ ห้ามเอา views ÷ reach มาใส่แทนแล้วเรียกว่า view rate —
               นั่นคือ "คนหนึ่งคนดูซ้ำกี่รอบ" คนละเรื่องกับ "ถูกโชว์แล้วกลายเป็นการดูกี่ %" */
      stats: { avgViewDuration: true, completionRate: true },
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
      erFormula: "(Likes + Comments + Shares) ÷ Reach",
      erNote: "Facebook วัดจากจำนวนคนที่เห็นโพสต์ (reach) ไม่ใช่จำนวนครั้งที่ถูกเปิด",
      er: function (a) { return rate(a.likes + a.comments + a.shares, a.reach); },
      parts: [
        { key: "likes", label: "Likes", color: "#2563eb" },
        { key: "comments", label: "Comments", color: "#4f6ed6" },
        { key: "shares", label: "Shares", color: "#8257c9" },
      ],
      /* ⚠️ Facebook ไม่มี "คลิก" ที่เทียบกับ CTR ของ YouTube ได้
         post_clicks ของ Facebook รวมทั้งกดดูรูป กดอ่านต่อ กดชื่อเพจ — คนละความหมาย
         ตัวที่ตรงกับ "ถูกโชว์แล้วกลายเป็นการดูจริง" คือ ดูเกิน 3 วิ ÷ impressions */
      viewRateLabel: "อัตราหยุดดู",
      viewRateWhat: "จากจำนวนครั้งที่โพสต์ถูกโชว์ในฟีด มีกี่ % ที่คนหยุดดูเกิน 3 วินาที",
      extras: [
        { key: "reach", label: "Reach", fmt: "num" },
        { key: "impressions", label: "Impressions (ครั้งที่ถูกโชว์)", fmt: "num" },
        { key: "views3s", label: "ดูเกิน 3 วินาที", fmt: "num" },
        { key: "viewRate", label: "อัตราหยุดดู (3 วิ ÷ Impressions)", fmt: "pct" },
      ],
      /* 🔴 Facebook เป็นเจ้าเดียวที่มี "ดูเกิน 3 วินาที" (post_video_views_3s)
         เพราะ Facebook เล่นวิดีโออัตโนมัติตอนเลื่อนผ่าน ยอดวิวดิบจึงพองมาก
         ตัวเลข 3 วินาทีคือตัวที่บอกว่า "มีคนหยุดดูจริงกี่ครั้ง" */
      stats: { views3s: true, impressions: true, viewRate: true },
    },
  };

  /* คอลัมน์ฝั่ง "การมองเห็น" ของตารางผลงานรายช่อง
   * ⚠️ แต่ละเจ้าให้ตัวเลขไม่เท่ากันโดยธรรมชาติ ช่องที่ไม่มีต้องขึ้น "—" พร้อมเหตุผล
   *    ห้ามใส่ 0 หรือเดาค่าให้ — 0 แปลว่า "วัดได้แล้วได้ศูนย์" คนละเรื่องกับ "วัดไม่ได้"
   * ⚠️ เพิ่มคอลัมน์ใหม่ที่นี่ที่เดียว แล้วเติม stats ของช่องที่มีตัวเลขนั้นให้ครบ */
  var VIEW_COLS = [
    { key: "reach", label: "Views / Reach", fmt: "num", strong: true, always: true },
    /* 🔴 เจ้าของสั่งเพิ่ม 20 ส.ค. 2026 — ตอบคำถาม "วิวน้อยเพราะอะไร"
     *    Impressions น้อย = ระบบไม่เอาไปโชว์ (แก้ที่หัวข้อ/ความถี่)
     *    Impressions เยอะ แต่ View rate ต่ำ = โชว์แล้วคนไม่หยุดดู (แก้ที่ปก/พาดหัว)
     *    View rate ดี แต่ Retention ต่ำ = เข้ามาแล้วออกเร็ว (แก้ที่เนื้อ)
     * ⚠️ เรียงต่อจาก Views / Reach เพื่อให้อ่านเป็นลำดับ โชว์ → กลายเป็นวิว → ดูนานแค่ไหน */
    { key: "impressions", label: "Impressions", fmt: "num",
      tip: "จำนวนครั้งที่ระบบเอาคอนเทนต์ไปโชว์ให้คนเห็น — เห็นแล้วยังไม่ได้ดู · " +
           "YouTube = ครั้งที่รูปปกถูกโชว์ · Facebook = ครั้งที่โพสต์ถูกโชว์ในฟีด",
      na: "ช่องนี้ไม่เปิดเผยจำนวนครั้งที่ถูกโชว์" },
    /* ⚠️ ป้ายกลางๆ โดยตั้งใจ — ห้ามเขียนว่า "CTR" ในคอลัมน์รวม
       YouTube เป็น CTR จริง (มีการกด) ส่วน Facebook ไม่มีการกด นับที่ 3 วินาทีแทน
       บทเรียนเดียวกับ "ดูจนจบ" ที่เคยเขียนผิดจนอ่านค่า YouTube ผิดความหมาย
       ชื่อจริงของแต่ละช่องอยู่ที่ viewRateLabel แล้วโผล่ในแท็บของช่องนั้น */
    { key: "viewRate", label: "View rate", fmt: "pct",
      tip: "จากจำนวนครั้งที่ถูกโชว์ กลายเป็นการดูจริงกี่ % · " +
           "YouTube = คนกดเข้ามาดู ÷ ครั้งที่รูปปกถูกโชว์ (ตัวที่ YouTube เรียกว่า CTR) · " +
           "Facebook = ดูเกิน 3 วินาที ÷ ครั้งที่ถูกโชว์ (ไม่มีการกด วิดีโอเล่นเอง) · " +
           "นิยามคนละแบบ ใช้ดูแนวโน้มของช่องตัวเอง ไม่ควรเอาไปเทียบข้ามช่อง",
      na: "ช่องนี้ไม่มีขั้นตอน \"เห็นแล้วกด\" — คลิปเล่นเองในฟีด จึงไม่มีตัวเลขนี้" },
    { key: "views3s", label: "ดูเกิน 3 วิ", fmt: "num",
      tip: "จำนวนครั้งที่มีคนดูนานเกิน 3 วินาที · Facebook เล่นวิดีโอเองตอนเลื่อนผ่าน ยอดวิวดิบจึงพอง " +
           "ตัวเลขนี้บอกว่ามีคนหยุดดูจริงกี่ครั้ง",
      na: "ช่องนี้ไม่ได้แยกยอดวิวตามระยะเวลาที่ดู" },
    { key: "avgViewDuration", label: "ดูเฉลี่ย/ครั้ง", fmt: "duration",
      tip: "ดูนานเฉลี่ยกี่นาที:วินาทีต่อการดู 1 ครั้ง",
      na: "ช่องนี้ไม่เปิดเผยเวลาที่ดูเฉลี่ย" },
    /* 🔴 ป้ายเดิมเขียนว่า "ดูจนจบ" ซึ่ง **ไม่ตรงความหมายของ YouTube**
     * YouTube ให้ averageViewPercentage = "ดูเฉลี่ยกี่ % ของความยาวคลิป"
     *   คลิป 10 นาที คนดูเฉลี่ย 4 นาที = 40% — ไม่ได้แปลว่ามีคน 40% ดูจนจบ
     * TikTok ให้ "อัตราการดูจบจริง" ซึ่งเป็นคนละนิยาม
     * ⚠️ 2 นิยามนี้อยู่คอลัมน์เดียวกันโดยเลี่ยงไม่ได้ (แต่ละเจ้าให้มาแบบนั้น)
     *    จึงต้องใช้ชื่อกลางๆ ว่า Retention แล้วอธิบายความต่างไว้ที่ ⓘ
     *    ห้ามกลับไปใช้คำว่า "ดูจนจบ" — เจ้าของจะอ่านตัวเลข YouTube ผิดความหมาย */
    { key: "completionRate", label: "Retention", fmt: "pct",
      tip: "ตัวชี้วัดคุณภาพการดู แต่ละเจ้านิยามไม่เหมือนกัน · " +
           "YouTube = ดูเฉลี่ยกี่ % ของความยาวคลิป (คลิป 10 นาที ดูเฉลี่ย 4 นาที = 40%) · " +
           "TikTok = สัดส่วนที่ดูจนจบจริง · ใช้ดูแนวโน้มของช่องตัวเอง ไม่ควรเอาไปเทียบข้ามช่อง",
      na: "ช่องนี้ไม่เปิดเผยตัวชี้วัดนี้" },
    { key: "watchTime", label: "เวลาดูรวม", fmt: "hours",
      tip: "เวลาที่คนใช้ดูรวมกันทั้งหมดในช่วงนี้",
      na: "ช่องนี้ไม่เปิดเผยเวลาดูรวม" },
    { key: "posts", label: "โพสต์", fmt: "num", always: true },
    { key: "avgPerPost", label: "เฉลี่ยต่อโพสต์", fmt: "num", always: true },
    { key: "share", label: "% ของยอดรวม", fmt: "share", always: true, noDelta: true,
      tip: "ช่องนี้คิดเป็นกี่ % ของ Views / Reach รวมทุกช่อง — เป็นส่วนแบ่งระหว่างช่อง " +
           "ไม่ใช่ retention (retention คือคอลัมน์ 'ดูจนจบ')" },
  ];

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
    VIEW_COLS: VIEW_COLS,
    /** ช่องนี้ให้ตัวเลขนี้ได้จริงไหม — คอลัมน์ที่ทุกช่องมีเสมอไม่ต้องเช็ค */
    hasStat: function (pk, key) {
      return !!(PLATFORMS[pk].stats || {})[key];
    },
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
