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
    box.innerHTML =
      '<div class="ib-in">' +
        '<div class="ib-txt"><b>' + head + "</b><span>" + how + "</span></div>" +
        '<div class="ib-act">' +
          (canInstall ? '<button type="button" class="ib-yes">ติดตั้ง</button>' : "") +
          '<button type="button" class="ib-no">' + (canInstall ? "ไว้ก่อน" : "เข้าใจแล้ว") + "</button>" +
        "</div>" +
      "</div>";
    document.body.appendChild(box);

    var close = function (forever) {
      if (forever) store(DONE, "1");
      box.classList.add("ib-out");
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 200);
    };
    var no = box.querySelector(".ib-no");
    // บอกวิธีไปแล้ว = ไม่ต้องบอกซ้ำ · ส่วน "ไว้ก่อน" ของฝั่งที่กดติดตั้งได้ ให้เงียบตามรอบปกติ
    if (no) no.onclick = function () { close(!canInstall); };
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
