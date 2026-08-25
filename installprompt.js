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
 * ⚠️ **เกณฑ์เดียวคือ "ติดตั้งแล้วหรือยัง"** (เจ้าของสั่ง 25 ส.ค. 2026)
 *    ยังไม่ได้ติดตั้ง = ขึ้นทุกครั้งที่เปิดหน้า · ติดตั้งแล้ว = ไม่ขึ้นอีกเลย
 *    ของเดิมเงียบ 30 วันทันทีที่ขึ้นครั้งเดียว ซึ่งทำให้ทดสอบไม่ได้และคนทั่วไปไม่มีทางรู้ว่าทำไม
 *    · แถบไม่บังเนื้อหา (ลอยล่างจอ) และหายเองใน 9 วิ จึงไม่ถือว่ากวน
 */
(function () {
  "use strict";

  var KEY = "installPromptAt";     // เวลาที่ขึ้นครั้งล่าสุด — เก็บไว้ดูตอนไล่ปัญหาเท่านั้น
  var DONE = "installPromptDone";  // **ติดตั้งสำเร็จแล้ว** เท่านั้น
  var DELAY_MS = 3500;             // รอให้หน้าโหลดเสร็จก่อน อย่าเด้งทับตอนกำลังดึงข้อมูล
  // ⏱ **หายเอง ไม่ต้องให้ใครกด** (เจ้าของสั่ง 25 ส.ค. 2026: "ต้องกด? ไม่เอา bad user experience")
  //    ของเดิมมีปุ่ม [เข้าใจแล้ว] เป็นทางเดียวที่จะทำให้แถบหายไป = บังคับให้กดทั้งที่
  //    แค่มาบอกข้อมูลเฉยๆ · ตอนนี้แถบหายเองเมื่อครบเวลา ปุ่ม × มีไว้เผื่อคนอยากปิดเดี๋ยวนี้
  //    ⚠️ **9 วินาที เจ้าของกำหนดเอง** (สั่ง 6 วิ ก่อน แล้วสั่งยืดเป็น 9 วิ 25 ส.ค. 2026)
  //       ใช้เท่ากันทุกแบบ · ห้ามเปลี่ยนเองโดยไม่ถาม
  var AUTO_HIDE_MS = 9000;

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  // ติดตั้งไปแล้ว = เปิดจากไอคอนบนหน้าจอ ไม่ต้องชวนอีก
  function installed() {
    try {
      if (window.matchMedia && matchMedia("(display-mode: standalone)").matches) return true;
      if (window.matchMedia && matchMedia("(display-mode: window-controls-overlay)").matches) return true;
    } catch (e) {}
    return navigator.standalone === true; // iOS ใช้ธงของตัวเอง
  }

  var UA = navigator.userAgent || "";

  var isIOS = /iphone|ipad|ipod/i.test(UA) ||
    // iPadOS 13+ รายงานตัวเป็น Mac — แยกด้วยว่ามีระบบสัมผัสไหม
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // iPad วางปุ่มแชร์ไว้ "ด้านบน" ไม่ใช่ด้านล่างเหมือน iPhone — บอกผิดคือหาไม่เจอ
  var isIPad = /ipad/i.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // เบราว์เซอร์อื่นบน iOS (Chrome/Edge/Firefox) วางปุ่มแชร์คนละที่กับ Safari
  var iosSafari = isIOS && !/(CriOS|EdgiOS|FxiOS|OPiOS)/i.test(UA);

  // ⚠️ **เปิดจากในแอปแชต/โซเชียล ติดตั้งไม่ได้เลย** (เจ้าของถาม 25 ส.ค. 2026: "เปิดผ่านไลน์")
  //    ไลน์/เฟซบุ๊ก เปิดลิงก์ในเบราว์เซอร์ย่อยของแอปตัวเอง ซึ่ง:
  //    · iOS  — เมนูแชร์เป็นของแอปนั้น **ไม่มี "เพิ่มไปยังหน้าจอโฮม"** ให้เลือก
  //    · Android — เป็น WebView ไม่ยิง beforeinstallprompt เลย
  //    ของเดิมบอกให้ "แตะปุ่มแชร์ด้านล่างของ Safari" ทั้งที่ผู้ใช้อยู่ในไลน์ = ทำตามไม่ได้
  //    ต้องบอกให้ไปเปิดในเบราว์เซอร์ก่อน ไม่ใช่บอกวิธีที่ทำไม่ได้
  var IN_APP = [
    { re: /(^|[\s;])Line\/\d/i, name: "ไลน์", how: "แตะ <b>⋯</b> มุมขวาล่าง แล้วเลือก <b>“เปิดในเบราว์เซอร์อื่น”</b>" },
    { re: /(FBAN|FBAV|FB_IAB|FB4A)/i, name: "เฟซบุ๊ก", how: "แตะ <b>⋯</b> มุมขวาบน แล้วเลือก <b>“เปิดในเบราว์เซอร์”</b>" },
    { re: /Instagram/i, name: "อินสตาแกรม", how: "แตะ <b>⋯</b> มุมขวาบน แล้วเลือก <b>“เปิดในเบราว์เซอร์”</b>" },
    { re: /MicroMessenger/i, name: "วีแชท", how: "แตะ <b>⋯</b> มุมขวาบน แล้วเลือกเปิดในเบราว์เซอร์" },
    { re: /(TikTok|musical_ly|Bytedance)/i, name: "ติ๊กต่อก", how: "แตะ <b>⋯</b> มุมขวาบน แล้วเลือกเปิดในเบราว์เซอร์" },
  ];
  function inApp() {
    for (var i = 0; i < IN_APP.length; i++) if (IN_APP[i].re.test(UA)) return IN_APP[i];
    return null;
  }

  // 🎯 **เจ้าของสั่ง 25 ส.ค. 2026: "เช็ค ถ้าเช็คแล้วยังไม่มีก็โชว์เลย"**
  //    เกณฑ์เดียวคือ **ติดตั้งแล้วหรือยัง** — ยังไม่ได้ติดตั้ง = ขึ้นทุกครั้ง
  //
  // ⚠️ **ของเดิมเงียบ 30 วันทันทีที่แถบขึ้นครั้งเดียว** ซึ่งกลายเป็นปัญหาจริง:
  //    เจ้าของทดสอบบน iPhone แล้วไม่ขึ้นสักที เพราะเครื่องจำค่าจากการทดสอบรอบก่อนไว้
  //    ต้องไปกดล้างที่ /selftest/ ถึงจะเห็น — คนทั่วไปไม่มีทางรู้
  //
  // ⚠️ **ผลข้างเคียงที่ต้องยอมรับ:** คนที่ติดตั้งไปแล้วแต่ยังเปิดผ่าน Safari ปกติ
  //    จะเห็นแถบอีก เพราะ iOS ไม่มีสัญญาณบอกว่า "ติดตั้งไปแล้ว" ตอนเปิดจากเบราว์เซอร์
  //    (`display-mode: standalone` เป็นจริงเฉพาะตอนเปิดจากไอคอนบนหน้าจอ)
  //    แลกกับการที่คนที่ยังไม่ได้ติดตั้งจะได้เห็นจริงๆ — เจ้าของเลือกทางนี้
  function shouldAsk() {
    if (installed()) return false;   // เปิดจากไอคอนบนหน้าจอ = มีแล้ว ไม่ต้องชวน
    if (store(DONE)) return false;   // กดติดตั้งสำเร็จไปแล้ว (Chrome/Edge ยิง appinstalled มาบอก)
    return true;
  }

  var deferred = null;   // event ของ Chrome/Edge ที่เก็บไว้รอผู้ใช้กด
  var shown = false;

  function show(mode) {
    if (shown || !shouldAsk()) return;
    // ⚠️ แถบ "มีเวอร์ชันใหม่" สำคัญกว่า — ถ้ามันขึ้นอยู่ อย่าไปทับ ไว้ค่อยชวนรอบหน้า
    if (document.getElementById("updbar")) return;
    shown = true;
    store(KEY, String(Date.now()));

    // ⚠️ บอกวิธีให้ตรงกับที่ผู้ใช้กำลังเปิดอยู่จริง — บอกผิดแปลว่าหาปุ่มไม่เจอ
    //    แล้วเขาจะสรุปว่าเว็บพัง เสียหายกว่าไม่บอกอะไรเลย
    var app = mode === "inapp" ? inApp() : null;
    var head = app ? "เปิดในเบราว์เซอร์ก่อนนะครับ" : "ติดตั้งเป็นแอปไหม?";
    var how;
    if (app) {
      how = "ติดตั้งจากใน" + app.name + "ไม่ได้ — " + app.how + " แล้วค่อยติดตั้ง";
    } else if (mode === "ios") {
      how = "แตะปุ่มแชร์ <b>⬆︎</b> " +
        (iosSafari ? (isIPad ? "ด้านบนของ Safari" : "ด้านล่างของ Safari") : "ของเบราว์เซอร์") +
        ' แล้วเลือก <b>“เพิ่มไปยังหน้าจอโฮม”</b>';
    } else {
      how = "กดติดตั้งครั้งเดียว เปิดใช้ได้เหมือนแอป ไม่ต้องเปิดเบราว์เซอร์";
    }
    // ปุ่ม "ติดตั้ง" มีได้เฉพาะตอนที่กดแล้วเกิดอะไรขึ้นจริง — ที่เหลือเป็นการบอกวิธี
    var canInstall = mode !== "ios" && mode !== "inapp";

    var box = document.createElement("div");
    box.id = "installbar";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "ติดตั้งเป็นแอป");
    // ⏱ ไม่มีปุ่ม "รับทราบ" ให้ต้องกด — มีแต่ × สำหรับคนที่อยากปิดเดี๋ยวนี้
    //    ปุ่มที่เหลือคือ "ติดตั้ง" ซึ่งกดแล้วได้อะไรจริงๆ เท่านั้น
    box.innerHTML =
      '<div class="ib-in">' +
        '<div class="ib-txt"><b>' + head + "</b><span>" + how + "</span></div>" +
        (canInstall ? '<div class="ib-act"><button type="button" class="ib-yes">ติดตั้ง</button></div>' : "") +
        '<button type="button" class="ib-x" aria-label="ปิด" title="ปิด">✕</button>' +
      "</div>";
    document.body.appendChild(box);

    var gone = false;
    var close = function (forever) {
      if (gone) return;
      gone = true;
      clearTimeout(autoHide);
      if (forever) store(DONE, "1");
      box.classList.add("ib-out");
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 200);
    };
    // ⚠️ หายเองแล้ว **ห้ามถือว่าไม่เอาถาวร** — เขาอาจยังไม่ทันอ่าน
    //    รอบหน้าที่เปิดหน้าเว็บก็ขึ้นใหม่ · "ถาวร" เก็บไว้ให้ตอนติดตั้งสำเร็จจริงเท่านั้น
    var autoHide = setTimeout(function () { close(false); }, AUTO_HIDE_MS);
    var x = box.querySelector(".ib-x");
    if (x) x.onclick = function () { close(false); };
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
    schedule();
  });

  // ติดตั้งสำเร็จ (ไม่ว่าจะผ่านปุ่มเราหรือเมนูของเบราว์เซอร์) = เลิกชวนถาวร
  window.addEventListener("appinstalled", function () {
    store(DONE, "1");
    var b = document.getElementById("installbar");
    if (b && b.parentNode) b.parentNode.removeChild(b);
  });

  // ---- ตัดสินใจตอนจะขึ้นแถบจริง ไม่ใช่ตอนโหลดไฟล์ ----
  // ⚠️ ต้องเลือกโหมด **ตอนครบเวลา** ไม่ใช่ตั้งไว้ล่วงหน้า เพราะ beforeinstallprompt
  //    มาถึงตอนไหนก็ได้ · ถ้าตั้งไว้ล่วงหน้าจะแข่งกันเองแล้วขึ้นโหมดผิด
  //    (เช่นเปิดในไลน์บน Android ที่บังเอิญยิง event มา = ติดตั้งได้จริง ต้องขึ้นปุ่มติดตั้ง
  //     ไม่ใช่ไปบอกให้เปิดในเบราว์เซอร์)
  var timer = null;
  function schedule() {
    if (timer || shown || !shouldAsk()) return;
    timer = setTimeout(function () {
      timer = null;
      if (deferred) show("std");        // กดติดตั้งได้จริง — ทางที่ดีที่สุด
      else if (inApp()) show("inapp");  // อยู่ในแอปแชต ติดตั้งไม่ได้ ต้องออกไปเบราว์เซอร์ก่อน
      else if (isIOS) show("ios");      // iOS สั่งไม่ได้ ทำได้แค่บอกวิธี
      // เดสก์ท็อป/Android ที่ไม่ยิง event = เบราว์เซอร์ไม่ให้ติดตั้ง เงียบไว้ดีกว่าบอกมั่ว
    }, DELAY_MS);
  }
  if (isIOS || inApp()) schedule();
})();
