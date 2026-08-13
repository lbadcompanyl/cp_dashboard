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
 *   sortNewestFirst()   เรียงทั้งชีตใหม่→เก่าครั้งเดียว (ใช้ตอนของเก่ายังปนกันอยู่)
 *   cleanupNoTopic()    ลบแถวที่ไม่มีหมวด (หลุดเข้ามาตอนตัวกรองยังไม่ทำงาน)
 *   cleanupDupes()      ลบข่าวซ้ำ เก็บแถวบนสุดของแต่ละข่าวไว้
 *   fixClippedTitles()  ซ่อมพาดหัวที่ถูกตัดสั้น (ลงท้ายด้วย "…") — รันซ้ำได้
 *
 * 📌 ข่าวใหม่ถูกแทรกไว้ "บนสุด" เสมอ — ถ้าบนสุดยังเป็นวันเก่า แปลว่าตัวตั้งเวลาไม่ได้วิ่งจริง
 *    (ไม่ใช่เพราะของใหม่ไปอยู่ก้นชีตเหมือนรุ่นก่อน) เช็คได้ที่ Apps Script → Executions
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
    // ใหม่ → เก่า เพราะแถวใหม่ถูกแทรกไว้ "บนสุด" (ดูเหตุผลที่ท้ายฟังก์ชัน)
    .sort(function (a, b) { return a.publishedAt < b.publishedAt ? 1 : -1; })
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

  // ⚠️ แทรกไว้ "บนสุด" ไม่ใช่ต่อท้าย (แก้ 13 ส.ค. 2026)
  // ของเดิมต่อท้ายด้วย getLastRow()+1 แล้วไม่เคยเรียงชีตให้เลย พอเจ้าของกด Sort
  // เรียงวันที่ใหม่→เก่าครั้งหนึ่ง ข่าวที่เข้ามาหลังจากนั้นก็ไปกองอยู่ "ก้นชีต"
  // เปิดดูข้างบนจึงเห็นวันที่ค้างอยู่วันเดิม เหมือนตัวตั้งเวลาหยุดวิ่ง ทั้งที่วิ่งอยู่
  // (เจอจริง: บนสุดค้างที่ 12 ส.ค. แถวเดียว ส่วนของใหม่อยู่ล่างสุดเป็นร้อยแถว)
  sheet.insertRowsBefore(2, rows.length);
  sheet.getRange(2, 1, rows.length, HEAD.length).setValues(rows);
}

/**
 * เรียงทั้งชีตใหม่→เก่าครั้งเดียว — ใช้ตอนของเก่ายังปนกันอยู่
 * (ของที่ต่อท้ายไว้สมัยก่อนจะขึ้นมาอยู่ในลำดับที่ถูกต้อง) รันซ้ำได้ ไม่เสียหาย
 */
function sortNewestFirst() {
  var sheet = getSheet_();
  var last = sheet.getLastRow();
  if (last < 3) return;
  sheet.getRange(2, 1, last - 1, HEAD.length).sort({ column: 4, ascending: false });
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
