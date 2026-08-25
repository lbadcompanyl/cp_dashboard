/* ชวนติดตั้งเป็นแอป (เพิ่มไอคอนบนหน้าจอ) — ใช้ร่วมทุกหน้า
 *
 * 🎯 เจ้าของสั่ง (21 ส.ค. 2026): เปิดครั้งแรกทั้งบนมือถือและเดสก์ท็อป ให้เด้งถามเลย
 *    ว่าจะติดตั้ง shortcut ไหม — ของเดิมต้องไปหาเมนู "ติดตั้งแอป" ของเบราว์เซอร์เอง
 *    ซึ่งซ่อนลึกมากจนแทบไม่มีใครเจอ
 *
 * ⚠️ **Chrome/Edge กับ Safari ทำงานคนละแบบ ต้องแยกทาง**
 *    - Chrome/Edge (เดสก์ท็อป + Android): มี event `beforeinstallprompt`
 *      เก็บไว้แล้วเรียก `.prompt()` ตอนผู้ใช้กดปุ่มของเรา → เด้งกล่องติดตั้งของจริง
 *    - **Safari / ทุกเบราว์เซอร์บน iOS: ไม่มี event นี้เลย** สั่งติดตั้งด้วยโค้ดไม่ได้
 *      ทำได้อย่างเดียวคือ **บอกวิธี** (แตะปุ่มแชร์ → เพิ่มไปยังหน้าจอโฮม)
 *      · ผู้ใช้ส่วนใหญ่ของเราอยู่บน iOS ทางนี้จึงสำคัญไม่แพ้ทางแรก
 *      · ⚠️ sandbox ทดสอบ WebKit ไม่ได้ — ต้องให้เจ้าของเปิดบน iPhone ยืนยันเอง
 *
 * ⚠️ **ห้ามกวนซ้ำ** — ถามแล้วไม่เอา ต้องเงียบยาว ไม่ใช่เด้งใหม่ทุกครั้งที่เปิดหน้า
 *    (บทเรียนเดียวกับแถบ "มีเวอร์ชันใหม่" ที่เคยเด้งทั้งวันจนเจ้าของสั่งให้ลดเหลือวันละครั้ง)
 */
(function () {
  "use strict";

  var KEY = "installPromptAt";     // เวลาที่ถามครั้งล่าสุด
  var DONE = "installPromptDone";  // ติดตั้งแล้ว / ไม่เอาถาวร
  var SNOOZE_DAYS = 30;            // กด "ไว้ก่อน" แล้วเงียบกี่วัน
  var DELAY_MS = 3500;             // รอให้หน้าโหลดเสร็จก่อน อย่าเด้งทับตอนกำลังดึงข้อมูล

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  // ติดตั้งไปแล้ว = เปิดจากไอคอนบนหน้าจอ ไม่ต้องชวนอีก
  function installed() {
    try {
      if (window.matchMedia && matchMedia("(display-mode: standalone)").matches) return true;
      if (window.matchMedia && matchMedia("(display-mode: window-controls-overlay)").matches) return true;
    } catch (e) {}
    return navigator.standalone === true; // iOS ใช้ธงของตัวเอง
  }

  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ รายงานตัวเป็น Mac — แยกด้วยว่ามีระบบสัมผัสไหม
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function shouldAsk() {
    if (installed()) return false;
    if (store(DONE)) return false;
    var last = +store(KEY) || 0;
    return Date.now() - last > SNOOZE_DAYS * 86400000;
  }

  var deferred = null;   // event ของ Chrome/Edge ที่เก็บไว้รอผู้ใช้กด
  var shown = false;

  function show(mode) {
    if (shown || !shouldAsk()) return;
    // ⚠️ แถบ "มีเวอร์ชันใหม่" สำคัญกว่า — ถ้ามันขึ้นอยู่ อย่าไปทับ ไว้ค่อยชวนรอบหน้า
    if (document.getElementById("updbar")) return;
    shown = true;
    store(KEY, String(Date.now()));

    var how = mode === "ios"
      ? 'แตะปุ่มแชร์ <b>⬆︎</b> ด้านล่างของ Safari แล้วเลือก <b>“เพิ่มไปยังหน้าจอโฮม”</b>'
      : "กดติดตั้งครั้งเดียว เปิดใช้ได้เหมือนแอป ไม่ต้องเปิดเบราว์เซอร์";

    var box = document.createElement("div");
    box.id = "installbar";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "ติดตั้งเป็นแอป");
    box.innerHTML =
      '<div class="ib-in">' +
        '<div class="ib-txt"><b>ติดตั้งเป็นแอปไหม?</b><span>' + how + "</span></div>" +
        '<div class="ib-act">' +
          (mode === "ios" ? "" : '<button type="button" class="ib-yes">ติดตั้ง</button>') +
          '<button type="button" class="ib-no">' + (mode === "ios" ? "เข้าใจแล้ว" : "ไว้ก่อน") + "</button>" +
        "</div>" +
      "</div>";
    document.body.appendChild(box);

    var close = function (forever) {
      if (forever) store(DONE, "1");
      box.classList.add("ib-out");
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 200);
    };
    var no = box.querySelector(".ib-no");
    if (no) no.onclick = function () { close(mode === "ios"); }; // iOS บอกวิธีไปแล้ว ไม่ต้องบอกซ้ำ
    var yes = box.querySelector(".ib-yes");
    if (yes) yes.onclick = function () {
      close(false);
      if (!deferred) return;
      var d = deferred;
      deferred = null;
      try {
        d.prompt();
        // ⚠️ กดแล้วยกเลิกในกล่องของเบราว์เซอร์ ไม่ใช่ "ไม่เอาถาวร" — แค่เงียบตามรอบปกติ
        if (d.userChoice && d.userChoice.then) d.userChoice.then(function (r) {
          if (r && r.outcome === "accepted") store(DONE, "1");
        });
      } catch (e) {}
    };
  }

  // ---- Chrome / Edge (เดสก์ท็อป + Android) ----
  // ⚠️ ต้อง preventDefault ไม่งั้นเบราว์เซอร์เด้งแถบของมันเอง แล้วจะมี 2 อันซ้อนกัน
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    setTimeout(function () { show("std"); }, DELAY_MS);
  });

  // ติดตั้งสำเร็จ (ไม่ว่าจะผ่านปุ่มเราหรือเมนูของเบราว์เซอร์) = เลิกชวนถาวร
  window.addEventListener("appinstalled", function () {
    store(DONE, "1");
    var b = document.getElementById("installbar");
    if (b && b.parentNode) b.parentNode.removeChild(b);
  });

  // ---- iOS ----
  // ไม่มี event ให้รอ ต้องตัดสินใจเองว่าจะบอกวิธีเมื่อไหร่
  if (isIOS && shouldAsk()) setTimeout(function () { show("ios"); }, DELAY_MS);
})();
