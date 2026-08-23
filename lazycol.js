/* โหลดทีละคอลัมน์ (lazy) — ใช้ร่วมกันทั้ง /trend/ /ir/ /issue/
 *
 * 🎯 ปัญหาที่แก้: บนมือถือแดชบอร์ดเป็น carousel ปัดซ้ายขวา **เห็นทีละคอลัมน์**
 *    แต่ของเดิมยิงทุกต้นทางพร้อมกันตั้งแต่วินาทีแรก (/trend/ ยิง 4 คำขอ:
 *    ข่าว + Google Trends + X + YouTube) คอลัมน์แรกที่ผู้ใช้กำลังจ้องอยู่จึงต้อง
 *    รอแชร์เน็ตกับคอลัมน์ที่ยังมองไม่เห็น — และคอลัมน์ที่ช้าที่สุด (YouTube ที่พึ่ง
 *    instance อาสาสมัคร) ก็ดึงทุกอย่างช้าตามไปด้วย
 *
 * ✅ วิธีทำ: คอลัมน์ไหนกำลังจะเลื่อนเข้ามาในจอ ค่อยโหลดคอลัมน์นั้น
 *    - มือถือ: ปัดไปถึงเมื่อไหร่ค่อยยิง (โหลดล่วงหน้าเล็กน้อยด้วย rootMargin
 *      ปัดถึงพอดีข้อมูลมักมาแล้ว)
 *    - เดสก์ท็อป: เห็นทุกคอลัมน์พร้อมกันอยู่แล้ว → ยิงทันทีทั้งหมด ไม่ช้าลงกว่าเดิม
 *
 * ⚠️ **ห้ามให้คอลัมน์ที่ยังไม่ถูกเปิดดูค้างเป็นไอคอนหมุนตลอดกาล** — กฎในหน้า
 *    "ฟีเจอร์มาตรฐาน" ข้อ 6 บอกว่าไอคอนหมุนแปลว่า "กำลังมา" เท่านั้น
 *    ที่นี่ถือว่ายังจริงอยู่ เพราะวินาทีที่คอลัมน์โผล่เข้าจอ การโหลดจะเริ่มทันที
 *    แต่ต้องมีตาข่ายกันเหนียวเผื่อ IntersectionObserver ใช้ไม่ได้/ไม่ยิง (ดู FALLBACK_MS)
 *
 * ⚠️ เบราว์เซอร์ที่ไม่มี IntersectionObserver (Safari เก่ามาก) = เปิดทุกคอลัมน์ทันที
 *    ยอมโหลดหนักดีกว่าหน้าว่างเปล่า — sandbox ทดสอบ WebKit ไม่ได้ ต้องเผื่อไว้เสมอ
 */
(function () {
  "use strict";

  // โหลดล่วงหน้าก่อนคอลัมน์จะเลื่อนเข้าจอจริง — ปัดถึงพอดีข้อมูลมักมาแล้ว
  // (ค่าเดียวกับที่ renderWidgets() ของ sd.html ใช้อยู่ ซึ่งพิสูจน์แล้วว่าพอดี)
  var ROOT_MARGIN = "300px";
  // ตาข่ายกันเหนียว: ถ้า IntersectionObserver เงียบไปเฉยๆ ให้ไล่วัดตำแหน่งเอง
  // แล้วเปิดเฉพาะคอลัมน์ที่อยู่ในจอจริง (ไม่เปิดหมดทุกคอลัมน์ ไม่งั้นเสียความหมายของ lazy)
  var FALLBACK_MS = 8000;

  var revealed = new Set();
  var onReveal = null;
  var io = null;

  function panelOf(source) {
    return document.querySelector('.panel[data-source="' + source + '"]');
  }

  function reveal(source, panel) {
    if (!source || revealed.has(source)) return false;
    revealed.add(source);
    if (io) {
      var el = panel || panelOf(source);
      if (el) io.unobserve(el); // เปิดแล้วไม่ต้องเฝ้าอีก
    }
    try {
      if (onReveal) onReveal(source, panel || panelOf(source));
    } catch (e) {
      // คอลัมน์เดียวพังห้ามลามไปล้มคอลัมน์อื่น
      if (window.console) console.error("[lazycol]", source, e);
    }
    return true;
  }

  // อยู่ในจอไหม (เผื่อกรณี IntersectionObserver ไม่ยิง) — เผื่อขอบเท่า rootMargin
  function inView(el) {
    var r = el.getBoundingClientRect();
    var m = parseInt(ROOT_MARGIN, 10) || 0;
    var vw = window.innerWidth || document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    return r.right > -m && r.left < vw + m && r.bottom > -m && r.top < vh + m;
  }

  var LazyCol = {
    /**
     * @param opts.panels   NodeList/array ของ .panel (ไม่ส่ง = หาเองจาก DOM)
     * @param opts.onReveal (source, panel) — เรียกครั้งเดียวต่อคอลัมน์ ตอนกำลังจะเข้าจอ
     * @param opts.eager    รายชื่อคอลัมน์ที่ต้องเปิดทันทีไม่ต้องรอ (เช่นคอลัมน์แรกสุด)
     */
    init: function (opts) {
      opts = opts || {};
      onReveal = opts.onReveal || null;
      var panels = [].slice.call(opts.panels || document.querySelectorAll(".panel"));
      if (!panels.length) return;

      (opts.eager || []).forEach(function (s) { reveal(s); });

      if (typeof IntersectionObserver !== "function") {
        // ไม่มี IO → เปิดหมด ดีกว่าปล่อยให้หน้าว่าง
        panels.forEach(function (p) { reveal(p.dataset.source, p); });
        return;
      }

      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) reveal(e.target.dataset.source, e.target);
        });
      }, { root: null, rootMargin: ROOT_MARGIN, threshold: 0 });

      panels.forEach(function (p) {
        if (!revealed.has(p.dataset.source)) io.observe(p);
      });

      // ⚠️ ตาข่ายกันเหนียว — IO ปกติยิงทันทีตอนเริ่มเฝ้า แต่ถ้าเลย์เอาต์แปลกจนไม่ยิง
      //    คอลัมน์ที่ผู้ใช้มองเห็นอยู่จะค้างเป็นไอคอนหมุนโดยไม่มีอะไรมา
      setTimeout(function () {
        panels.forEach(function (p) {
          if (!revealed.has(p.dataset.source) && inView(p)) reveal(p.dataset.source, p);
        });
      }, FALLBACK_MS);
    },

    /** สั่งเปิดเอง (เช่นผู้ใช้กดจุด carousel ข้ามไปคอลัมน์ไกลๆ) */
    reveal: function (source) { return reveal(source); },

    /** คอลัมน์นี้เคยถูกเปิดดูแล้วหรือยัง — ใช้ตัดสินว่า auto-refresh ต้องดึงซ้ำไหม */
    seen: function (source) { return revealed.has(source); },

    /** รายชื่อคอลัมน์ที่เปิดไปแล้ว */
    list: function () { return Array.from(revealed); },  // ⚠️ Set ใช้ [].slice.call ไม่ได้ (ไม่มี length) ได้ค่าว่างเสมอ
  };

  window.LazyCol = LazyCol;
})();
