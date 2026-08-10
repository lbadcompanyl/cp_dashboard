/**
 * เก็บข่าวจากแดชบอร์ดลง Google Sheet — วางสคริปต์นี้ในชีตของคุณ
 * ────────────────────────────────────────────────────────────────
 * เก็บเฉพาะ 4 หัวข้อ: CPF · ปลาหมอคางดำ · PM2.5 · Alien species
 *
 * วิธีติดตั้ง (ทำครั้งเดียว)
 *   1. เปิด Google Sheet ที่จะใช้เก็บ
 *   2. เมนู ส่วนขยาย (Extensions) → Apps Script
 *   3. ลบโค้ดที่มีอยู่ แล้ววางไฟล์นี้ทั้งไฟล์ → กดบันทึก
 *   4. เลือกฟังก์ชัน syncNews แล้วกด Run หนึ่งครั้ง (Google จะขออนุญาต ให้กดอนุญาต)
 *   5. ไอคอนนาฬิกา (Triggers) → Add Trigger
 *        ฟังก์ชัน: syncNews · แหล่งที่มา: ตามเวลา · ทุก 1 ชั่วโมง
 *
 * ⚠️ ข่าวในระบบเก็บไว้ 90 วัน — ถ้าตัวตั้งเวลาหยุดวิ่งเกิน 90 วัน ข่าวช่วงที่ขาดจะหายถาวร
 *    เช็คได้จากคอลัมน์วันที่ในชีต ว่ายังเดินต่อเนื่องอยู่ไหม
 */

// ⚠️ ใช้ของ production เท่านั้น — ถ้าอยากลองก่อนให้เปลี่ยนเป็น dev.cp-dashboard-680.pages.dev
var API = "https://cp-dashboard-680.pages.dev/api/trend/archive";
var TOPICS = "cpf,blackchin,pm25,alien";
var TAB = "ข่าว";
var DAYS = 7;   // ดึงย้อนหลังกี่วันต่อรอบ — เผื่อไว้เกินความถี่ที่ตั้ง เผื่อรอบไหนไม่วิ่ง
var HEAD = ["สำนักข่าว", "พาดหัว", "link", "วันที่", "หมวด"];

function syncNews() {
  var sheet = getSheet_();
  var seen = seenLinks_(sheet);

  var res = UrlFetchApp.fetch(
    API + "?src=all&days=" + DAYS + "&topics=" + encodeURIComponent(TOPICS) + "&format=json",
    { muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) {
    throw new Error("ดึงข่าวไม่สำเร็จ (" + res.getResponseCode() + ") " + res.getContentText().slice(0, 200));
  }

  var all = JSON.parse(res.getContentText()).rows || [];

  // ⚠️ ด่านกันข้อมูลผิดลงชีต — ห้ามตัดออก
  // ถ้าฝั่งเซิร์ฟเวอร์ยังไม่รู้จักคำสั่งกรองหัวข้อ มันจะ "ส่งข่าวทั้งหมดมาเงียบๆ"
  // (เคยเกิดจริง: ได้ข่าวเครือ CP มา 423 แถว หมวดว่างเปล่าหมด)
  // ทุกแถวที่กรองแล้วต้องมีหมวดติดมาเสมอ — ถ้าไม่มีแปลว่ายังไม่ได้กรอง ให้หยุดและฟ้อง
  var noTopic = all.filter(function (r) { return !r.topic; }).length;
  if (all.length && noTopic) {
    throw new Error(
      "ยังกรองหัวข้อไม่ได้ (" + noTopic + "/" + all.length + " แถวไม่มีหมวด) — ยังไม่ได้เขียนอะไรลงชีต\n" +
      "แปลว่าตัวกรอง 4 หัวข้อยังไม่ขึ้นเซิร์ฟเวอร์ที่ตั้งไว้ใน var API"
    );
  }

  var rows = all
    // เก่า → ใหม่ จะได้ต่อท้ายเรียงตามเวลาจริง
    .sort(function (a, b) { return a.publishedAt < b.publishedAt ? -1 : 1; })
    // ⚠️ ต้องกันซ้ำ "ภายในรอบเดียวกัน" ด้วย ไม่ใช่เทียบกับที่มีในชีตอย่างเดียว
    // เคยเกิดจริง: ข่าวใบเดียวถูกส่งมา 27 ใบในรอบเดียว (ลิงก์ Bing เปลี่ยนทุกชั่วโมง)
    // แล้วเขียนลงชีตครบ 27 แถว เพราะ seen ถูกอ่านมาก่อนเริ่มเขียน
    .filter(function (r) {
      if (!r.link) return false;
      var byLink = normLink_(r.link);
      var byText = dupKey_(r.outlet, r.title); // กันกรณีลิงก์ต่างแต่เป็นข่าวใบเดียวกัน
      if (seen[byLink] || seen[byText]) return false;
      seen[byLink] = true;
      seen[byText] = true;
      return true;
    })
    .map(function (r) { return [r.outlet, r.title, r.link, r.date, r.topic]; });

  if (!rows.length) return; // ไม่มีข่าวใหม่ — ไม่ต้องแตะชีต
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEAD.length).setValues(rows);
}

/** สร้างแท็บ + หัวตารางถ้ายังไม่มี */
function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TAB) || ss.insertSheet(TAB);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 140); // สำนักข่าว
    sheet.setColumnWidth(2, 460); // พาดหัว
    sheet.setColumnWidth(3, 260); // link
    sheet.setColumnWidth(4, 130); // วันที่
    sheet.setColumnWidth(5, 160); // หมวด
  }
  return sheet;
}

/**
 * ลิงก์ที่เคยเก็บแล้ว — กันข่าวซ้ำเวลารอบถัดไปดึงช่วงเวลาทับกัน
 * ⚠️ อ่านทั้งคอลัมน์ทีเดียว ไม่ใช่ไล่ทีละแถว — ชีตหมื่นแถวก็ยังเร็ว
 */
function seenLinks_(sheet) {
  var last = sheet.getLastRow();
  var out = {};
  if (last < 2) return out;
  var vals = sheet.getRange(2, 1, last - 1, 3).getValues(); // A=สำนักข่าว B=พาดหัว C=link
  for (var i = 0; i < vals.length; i++) {
    var k = normLink_(vals[i][2]);
    if (k) out[k] = true;
    var t = dupKey_(vals[i][0], vals[i][1]);
    if (t) out[t] = true;
  }
  return out;
}

/**
 * กุญแจกันซ้ำแบบไม่พึ่งลิงก์ — สำนักข่าวเดียวกัน + พาดหัวเดียวกัน = ข่าวใบเดียวกัน
 * ใช้คู่กับลิงก์ เพราะ Bing เปลี่ยนลิงก์ของข่าวใบเดิมทุกชั่วโมง
 * ตัด "…" ท้ายพาดหัวออกด้วย — ใบเดียวกันบางรอบได้ตัวเต็ม บางรอบได้ตัวที่ถูกตัด
 */
function dupKey_(outlet, title) {
  var t = String(title || "").replace(/\s+/g, " ").replace(/(?:…|\.\.\.)\s*$/, "").trim().toLowerCase();
  if (!t) return "";
  return "t:" + String(outlet || "").trim().toLowerCase() + "|" + t.slice(0, 80);
}

/** ตัด ?utm_... และ / ท้าย เพื่อให้ลิงก์เดียวกันที่พ่วงพารามิเตอร์ต่างกันนับเป็นใบเดียว */
function normLink_(link) {
  var s = String(link || "").trim().toLowerCase();
  if (!s) return "";
  return s.split("#")[0].split("?")[0].replace(/\/+$/, "");
}

/**
 * ล้างแถวที่ไม่มีหมวด (ข่าวที่หลุดเข้ามาตอนตัวกรองยังไม่ทำงาน)
 * เลือกฟังก์ชันนี้แล้วกด Run หนึ่งครั้ง — ใช้เมื่อชีตมีข่าวที่ไม่ได้อยู่ใน 4 หัวข้อปนอยู่
 *
 * ⚠️ ลบจากล่างขึ้นบน — ถ้าลบจากบนลงล่าง เลขแถวจะเลื่อนแล้วลบผิดแถว
 */
function cleanupNoTopic() {
  var sheet = getSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return;
  var vals = sheet.getRange(2, 5, last - 1, 1).getValues(); // คอลัมน์ E = หมวด
  var removed = 0;
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0] || "").trim() === "") { sheet.deleteRow(i + 2); removed++; }
  }
  SpreadsheetApp.getActiveSpreadsheet().toast("ลบแถวที่ไม่มีหมวดออก " + removed + " แถว");
}

/**
 * ล้างข่าวซ้ำที่มีอยู่แล้วในชีต — เก็บแถวบนสุดของแต่ละข่าวไว้ ที่เหลือลบทิ้ง
 * เลือกฟังก์ชันนี้แล้วกด Run หนึ่งครั้ง (ทำครั้งเดียวพอ รอบถัดไป syncNews กันซ้ำเองแล้ว)
 *
 * นับซ้ำ 2 ทาง: ลิงก์เดียวกัน หรือ สำนักข่าว+พาดหัวเดียวกัน
 * ⚠️ ลบจากล่างขึ้นบน ไม่งั้นเลขแถวจะเลื่อนแล้วลบผิดแถว
 */
function cleanupDupes() {
  var sheet = getSheet_();
  var last = sheet.getLastRow();
  if (last < 3) return;
  var vals = sheet.getRange(2, 1, last - 1, 3).getValues();
  var keep = {}, drop = [];
  for (var i = 0; i < vals.length; i++) {
    var byLink = normLink_(vals[i][2]);
    var byText = dupKey_(vals[i][0], vals[i][1]);
    if ((byLink && keep[byLink]) || (byText && keep[byText])) { drop.push(i + 2); continue; }
    if (byLink) keep[byLink] = true;
    if (byText) keep[byText] = true;
  }
  for (var j = drop.length - 1; j >= 0; j--) sheet.deleteRow(drop[j]);
  SpreadsheetApp.getActiveSpreadsheet().toast("ลบข่าวซ้ำออก " + drop.length + " แถว");
}
