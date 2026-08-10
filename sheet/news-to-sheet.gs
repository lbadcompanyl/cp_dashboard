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

  var rows = (JSON.parse(res.getContentText()).rows || [])
    // เก่า → ใหม่ จะได้ต่อท้ายเรียงตามเวลาจริง
    .sort(function (a, b) { return a.publishedAt < b.publishedAt ? -1 : 1; })
    .filter(function (r) { return r.link && !seen[normLink_(r.link)]; })
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
  var vals = sheet.getRange(2, 3, last - 1, 1).getValues(); // คอลัมน์ C = link
  for (var i = 0; i < vals.length; i++) {
    var k = normLink_(vals[i][0]);
    if (k) out[k] = true;
  }
  return out;
}

/** ตัด ?utm_... และ / ท้าย เพื่อให้ลิงก์เดียวกันที่พ่วงพารามิเตอร์ต่างกันนับเป็นใบเดียว */
function normLink_(link) {
  var s = String(link || "").trim().toLowerCase();
  if (!s) return "";
  return s.split("#")[0].split("?")[0].replace(/\/+$/, "");
}
