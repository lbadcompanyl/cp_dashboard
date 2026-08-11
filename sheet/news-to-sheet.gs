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
 * ฟังก์ชันซ่อมของเก่า (เลือกชื่อในกล่องข้างปุ่ม ▶ Run แล้วกด Run — ทำเมื่อจำเป็น)
 *   cleanupNoTopic()    ลบแถวที่ไม่มีหมวด (หลุดเข้ามาตอนตัวกรองยังไม่ทำงาน)
 *   cleanupDupes()      ลบข่าวซ้ำ เก็บแถวบนสุดของแต่ละข่าวไว้
 *   fixClippedTitles()  ซ่อมพาดหัวที่ถูกตัดสั้น (ลงท้ายด้วย "…") — รันซ้ำได้
 *
 * ดึงข่าวย้อนหลังจาก GDELT (คลังข่าวเปิด ฟรี ไม่ต้องมี key)
 *   probeGdelt()        ลองดูว่าย้อนได้ถึงไหน ได้กี่ข่าว — อ่านอย่างเดียว ไม่เขียนชีต
 *   backfillGdelt()     ดึงของจริงลงชีต (ตั้งช่วงเวลาที่ GD_FROM / GD_TO)
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

// ───────── ข่าวย้อนหลังจาก GDELT ─────────
// GDELT = คลังข่าวออนไลน์ทั่วโลกแบบเปิด ใช้ฟรี ไม่ต้องขอ key
//
// ⚠️ ยังไม่เคยยิงจริงจากเครื่องที่เขียนโค้ดนี้ (ยิงเน็ตออกไม่ได้) — ให้กด probeGdelt() ก่อนเสมอ
//    มันจะบอกเองว่าย้อนได้ถึงปีไหน แต่ละหัวข้อได้กี่ข่าว โดยไม่แตะชีตเลย
//
// ⚠️ GDELT ขอให้ยิงไม่ถี่กว่า 1 ครั้งต่อ 5 วินาที — โค้ดหน่วงให้แล้ว อย่าลดลง
var GD_API = "https://api.gdeltproject.org/api/v2/doc/doc";
var GD_WAIT_MS = 5000;
var GD_MAX = 250;          // เพดานของ GDELT ต่อ 1 ครั้ง
var GD_FROM = "2025-01-01"; // backfillGdelt ดึงตั้งแต่วันนี้
var GD_TO   = "";           // ว่าง = ถึงวันนี้

// หัวข้อ → คำค้นแบบ GDELT · ชื่อหัวข้อต้องสะกดให้ตรงกับที่เซิร์ฟเวอร์ใช้ ไม่งั้นตัวกรองในชีตจะแยกเป็นคนละหมวด
// (ใช้คำค้นเป็นตัวกำหนดหมวดเลย จะได้ไม่ต้องมีตารางคำซ้ำอีกที่หนึ่งให้ลืมอัปเดต)
var GD_QUERIES = {
  "CPF": '("ซีพีเอฟ" OR "CPF" OR "เจริญโภคภัณฑ์อาหาร")',
  "ปลาหมอคางดำ": '("ปลาหมอคางดำ" OR "หมอคางดำ" OR "blackchin tilapia")',
  "PM2.5": '("PM2.5" OR "ฝุ่นพิษ" OR "ฝุ่นละอองขนาดเล็ก")',
  "Alien species": '("ชนิดพันธุ์ต่างถิ่น" OR "สัตว์ต่างถิ่น" OR "เอเลี่ยนสปีชีส์")'
};

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
 * ซ่อมพาดหัวที่ถูกตัดสั้น (ลงท้ายด้วย "…") ของแถวที่เขียนลงชีตไปแล้ว
 * เลือกฟังก์ชันนี้แล้วกด Run — รันซ้ำได้เรื่อยๆ ไม่มีผลเสีย
 *
 * syncNews เขียนแต่แถวใหม่ ไม่เคยกลับไปแก้ของเดิม พาดหัวที่ถูกตัดตอนเก็บมาจึงค้างอยู่ตลอด
 * ตัวนี้ไปขอพาดหัวตัวเต็มจากคลังข่าวมาทับให้
 *
 * ⚠️ จับคู่ด้วย "สำนักข่าว + ต้นพาดหัว" ไม่ใช่ลิงก์ — แถวเก่าเก็บลิงก์ Bing ที่เปลี่ยนทุกชั่วโมง
 *    เทียบลิงก์จะไม่มีวันตรง · เจอแล้วอัปเดตลิงก์ให้เป็นลิงก์ข่าวจริงไปด้วยเลย
 *
 * ⚠️ คลังข่าวเก็บ 90 วัน — แถวที่เก่ากว่านั้นซ่อมไม่ได้แล้ว
 *    และฝั่งเซิร์ฟเวอร์ก็ทยอยเติมพาดหัวรอบละ 20 ข่าว ถ้ายังไม่ครบให้รันซ้ำอีกวันสองวัน
 */
function fixClippedTitles() {
  var sheet = getSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return;

  var res = UrlFetchApp.fetch(
    API + "?src=all&days=90&topics=" + encodeURIComponent(TOPICS) + "&format=json",
    { muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) {
    throw new Error("ดึงคลังข่าวไม่สำเร็จ (" + res.getResponseCode() + ") — ยังไม่ได้แก้อะไรในชีต");
  }

  // รวบพาดหัวตัวเต็มจากคลัง แยกตามสำนักข่าว
  var byOutlet = {};
  var rows = JSON.parse(res.getContentText()).rows || [];
  for (var i = 0; i < rows.length; i++) {
    var t = String(rows[i].title || "").replace(/\s+/g, " ").trim();
    // ⚠️ ตรงนี้ต้องเช็คแบบเข้ม (เฉพาะที่ลงท้ายด้วยจุดไข่ปลาจริงๆ) ห้ามใช้ isClipped_
    // ที่เดาจากความยาว — ไม่งั้นพาดหัวตัวเต็มที่ยาวจะถูกมองว่า "ยังถูกตัด" แล้วโดนคัดทิ้ง
    // กลายเป็นไม่มีตัวเต็มเหลือให้เอามาซ่อมเลยสักใบ
    if (!t || /(?:…|\.\.\.)$/.test(t)) continue;
    var o = String(rows[i].outlet || "").trim().toLowerCase();
    (byOutlet[o] = byOutlet[o] || []).push({ title: t, link: String(rows[i].link || "") });
  }

  var vals = sheet.getRange(2, 1, last - 1, 3).getValues(); // A=สำนักข่าว B=พาดหัว C=link
  var fixed = 0;
  for (var r = 0; r < vals.length; r++) {
    var cur = String(vals[r][1] || "").replace(/\s+/g, " ").trim();
    if (!isClipped_(cur)) continue;
    var head = cur.replace(/(?:…|\.\.\.)\s*$/, "").trim();
    if (head.length < 10) continue; // สั้นเกินไป จับคู่แล้วเสี่ยงได้ข่าวผิดใบ
    var cands = byOutlet[String(vals[r][0] || "").trim().toLowerCase()] || [];
    for (var c = 0; c < cands.length; c++) {
      if (cands[c].title.indexOf(head) !== 0) continue; // ต้องขึ้นต้นตรงกันเป๊ะ
      // ต้องยาวกว่าของเดิมจริงถึงจะทับ — ไม่งั้นแถวที่ซ่อมไปแล้วจะถูกเขียนทับด้วยค่าเดิม
      // ทุกครั้งที่รัน แล้วรายงานว่า "ซ่อมได้ n แถว" ทั้งที่ไม่มีอะไรเปลี่ยน
      if (cands[c].title.length <= cur.length) continue;
      vals[r][1] = cands[c].title;
      if (cands[c].link) vals[r][2] = cands[c].link; // เก็บลิงก์ข่าวจริงแทนลิงก์ Bing ไปด้วย
      fixed++;
      break;
    }
  }

  if (!fixed) {
    SpreadsheetApp.getActiveSpreadsheet().toast("ไม่มีพาดหัวที่ซ่อมได้เพิ่ม — ลองรันใหม่พรุ่งนี้");
    return;
  }
  // เขียนกลับทีเดียวทั้งคอลัมน์ B กับ C (เขียนทีละช่องจะช้ามากเมื่อชีตยาว)
  sheet.getRange(2, 2, vals.length, 2).setValues(vals.map(function (v) { return [v[1], v[2]]; }));
  SpreadsheetApp.getActiveSpreadsheet().toast("ซ่อมพาดหัวได้ " + fixed + " แถว");
}

/**
 * พาดหัวที่น่าจะถูกตัด
 * ⚠️ บางฟีดตัดโดยไม่ใส่ "…" ด้วย (จบห้วนๆ กลางประโยค) ดูแค่จุดไข่ปลาจึงไม่พอ
 *    พาดหัวที่ยาวใกล้เพดานของฟีดจึงนับว่าน่าสงสัยไว้ก่อน — เดาเกินไปไม่เสียหาย
 *    เพราะจะทับได้ก็ต่อเมื่อเจอตัวที่ยาวกว่าและขึ้นต้นตรงกันเท่านั้น
 */
function isClipped_(s) {
  var t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/(?:…|\.\.\.)$/.test(t)) return true;
  return t.length >= 80 && !/[.!?"”』】]$/.test(t);
}

/* ═══════════ ข่าวย้อนหลังจาก GDELT ═══════════ */

/**
 * ลองดูก่อนว่า GDELT ย้อนได้ถึงไหน — อ่านอย่างเดียว ไม่เขียนอะไรลงชีตเลย
 * เลือกฟังก์ชันนี้แล้วกด Run แล้วเปิด "บันทึกการดำเนินการ" (Execution log) อ่านผล
 *
 * ยิงถามทีละปี ปีละ 1 ครั้งต่อหัวข้อ แล้วรายงานว่าปีไหนมีข่าว ปีไหนไม่มี
 */
function probeGdelt() {
  var years = [2026, 2025, 2024, 2023, 2022];
  var out = ["ผลตรวจ GDELT — ตัวเลขคือจำนวนข่าวที่ขอมาได้ (เพดาน " + GD_MAX + " ต่อครั้ง)"];
  for (var topic in GD_QUERIES) {
    var line = [];
    for (var i = 0; i < years.length; i++) {
      var y = years[i];
      var res = gdeltFetch_(GD_QUERIES[topic], y + "-01-01", y + "-12-31");
      line.push(y + ": " + (res.err ? "ผิดพลาด (" + res.err + ")" : res.articles.length));
      Utilities.sleep(GD_WAIT_MS);
    }
    out.push("• " + topic + " → " + line.join(" · "));
  }
  out.push("");
  out.push("อ่านยังไง: ปีที่ได้เลข 0 ทุกหัวข้อ = ย้อนไม่ถึงปีนั้น");
  out.push("ถ้าได้ " + GD_MAX + " เต็มเพดาน = ยังมีมากกว่านั้น ต้องแบ่งดึงทีละเดือน (backfillGdelt ทำให้แล้ว)");
  var msg = out.join("\n");
  Logger.log(msg);
  SpreadsheetApp.getActiveSpreadsheet().toast("ตรวจเสร็จแล้ว — เปิด Execution log อ่านผล", "GDELT", 10);
  return msg;
}

/**
 * ดึงข่าวย้อนหลังจาก GDELT ลงชีตจริง — ตั้งช่วงเวลาที่ GD_FROM / GD_TO ด้านบน
 * แบ่งดึงทีละเดือนต่อหัวข้อ เพราะ GDELT ให้ครั้งละไม่เกิน 250 ข่าว
 *
 * ⚠️ ใช้ตัวกันข่าวซ้ำชุดเดียวกับ syncNews — ข่าวที่มีอยู่แล้วจะไม่ถูกเพิ่มซ้ำ
 * ⚠️ ช้า (หน่วง 5 วินาทีต่อครั้งตามที่ GDELT ขอ) · Apps Script จำกัด 6 นาทีต่อรอบ
 *    ถ้าไม่จบใน 1 รอบ มันจะบอกให้กด Run ซ้ำ แล้วเลื่อน GD_FROM ตามที่ค้างไว้
 */
function backfillGdelt() {
  var sheet = getSheet_();
  var seen = seenLinks_(sheet);
  var months = monthRanges_(GD_FROM, GD_TO || ymd_(new Date()));
  var started = Date.now();
  var rows = [], calls = 0, stoppedAt = "";

  for (var m = 0; m < months.length && !stoppedAt; m++) {
    for (var topic in GD_QUERIES) {
      // Apps Script ตัดการทำงานที่ 6 นาที — เผื่อเวลาไว้เขียนชีตก่อนโดนตัด
      if (Date.now() - started > 4.5 * 60 * 1000) { stoppedAt = months[m].from; break; }
      var res = gdeltFetch_(GD_QUERIES[topic], months[m].from, months[m].to);
      calls++;
      if (res.err) { Logger.log("ข้าม " + topic + " " + months[m].from + " — " + res.err); }
      for (var i = 0; i < res.articles.length; i++) {
        var a = res.articles[i];
        var link = String(a.url || "");
        if (!link) continue;
        var title = String(a.title || "").replace(/\s+/g, " ").trim();
        if (!title) continue;
        var outlet = String(a.domain || "").replace(/^www\./, "");
        var byLink = normLink_(link), byText = dupKey_(outlet, title);
        if (seen[byLink] || seen[byText]) continue;
        seen[byLink] = true;
        seen[byText] = true;
        rows.push([outlet, title, link, gdeltDate_(a.seendate), topic]);
      }
      Utilities.sleep(GD_WAIT_MS);
    }
  }

  if (rows.length) {
    // เรียงเก่า → ใหม่ แล้วต่อท้ายชีต (รูปแบบเดียวกับ syncNews)
    rows.sort(function (a, b) { return a[3] < b[3] ? -1 : 1; });
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEAD.length).setValues(rows);
  }
  var msg = "GDELT: ยิง " + calls + " ครั้ง · เพิ่มลงชีต " + rows.length + " ข่าว" +
    (stoppedAt ? "\n⏱ หมดเวลาของ Apps Script — ยังไม่จบ ให้แก้ GD_FROM เป็น " + stoppedAt + " แล้วกด Run ซ้ำ" : "\n✅ ครบช่วงที่ตั้งไว้แล้ว");
  Logger.log(msg);
  SpreadsheetApp.getActiveSpreadsheet().toast(msg, "GDELT", 15);
  return msg;
}

/** ยิงถาม GDELT 1 ครั้ง — คืน {articles:[], err:""} ไม่ throw เพื่อให้รอบอื่นไปต่อได้ */
function gdeltFetch_(query, from, to) {
  var url = GD_API +
    "?query=" + encodeURIComponent(query) +
    "&mode=artlist&format=json&sort=datedesc" +
    "&maxrecords=" + GD_MAX +
    "&startdatetime=" + from.replace(/-/g, "") + "000000" +
    "&enddatetime=" + to.replace(/-/g, "") + "235959";
  try {
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return { articles: [], err: "HTTP " + res.getResponseCode() };
    var txt = res.getContentText();
    // GDELT ตอบเป็นข้อความธรรมดาเวลาคำค้นผิดรูป ไม่ใช่ JSON — อย่าให้ทั้งรอบล้มเพราะอันเดียว
    if (txt.charAt(0) !== "{") return { articles: [], err: txt.slice(0, 80) };
    var j = JSON.parse(txt);
    return { articles: j.articles || [], err: "" };
  } catch (e) {
    return { articles: [], err: String(e).slice(0, 80) };
  }
}

/** "20260807T024500Z" → "2026-08-07 09:45" (เวลาไทย ให้ตรงรูปแบบกับที่เซิร์ฟเวอร์เขียน) */
function gdeltDate_(s) {
  var m = String(s || "").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return "";
  var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + 7 * 3600000;
  var d = new Date(t), p = function (n) { return String(n).padStart(2, "0"); };
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) +
    " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes());
}

/** แบ่งช่วงวันที่เป็นรายเดือน — GDELT ให้ครั้งละ 250 ข่าว ขอทีเดียวทั้งปีจะได้ไม่ครบ */
function monthRanges_(from, to) {
  var out = [], s = new Date(from + "T00:00:00Z"), e = new Date(to + "T00:00:00Z");
  while (s <= e) {
    var last = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0));
    out.push({ from: ymd_(s), to: ymd_(last < e ? last : e) });
    s = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1));
  }
  return out;
}

function ymd_(d) {
  var p = function (n) { return String(n).padStart(2, "0"); };
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
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
