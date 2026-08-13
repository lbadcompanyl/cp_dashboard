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
 *   checkStatus()       🔎 บอกว่าติดตรงไหน — ชีตมีถึงวันไหน · คลังมีถึงวันไหน · มีของใหม่กี่ใบ
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
var FEEDS = "https://cp-dashboard-680.pages.dev/api/trend/feeds";
var TOPICS = "cpf,blackchin,pm25,alien";
var TAB = "ข่าว";
var DAYS = 7;   // ดึงย้อนหลังกี่วันต่อรอบ — เผื่อไว้เกินความถี่ที่ตั้ง เผื่อรอบไหนไม่วิ่ง
var HEAD = ["สำนักข่าว", "พาดหัว", "link", "วันที่", "หมวด"];

function syncNews() {
  var sheet = getSheet_();
  var seen = seenLinks_(sheet);

  warmArchive_(); // ⚠️ อ่านคำอธิบายที่ฟังก์ชัน — ถ้าไม่มีบรรทัดนี้ ข่าวบางวันจะหายไปเลย

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
  var rng = sheet.getRange(2, 1, last - 1, HEAD.length);
  // ⚠️ ห้ามใช้ Range.sort() ตรงๆ — คอลัมน์วันที่ในชีตปนกันทั้ง Date จริงกับข้อความ
  // (แถวเก่าที่ Sheets แปลงให้ vs แถวใหม่ที่เพิ่งเขียนเป็นสตริง) แล้วมันจะแยกเป็น 2 กอง
  // เรียงเองใน JS ด้วยเวลาจริงจึงแน่นอนกว่า
  var rows = rng.getValues();
  rows.sort(function (a, b) { return cellTime_(b[3]) - cellTime_(a[3]); });
  rng.setValues(rows);
}

/**
 * ค่าในคอลัมน์วันที่อาจเป็น Date หรือข้อความ ("2026-08-13 06:22") — คืนเป็นตัวเลขเทียบกันได้
 * ⚠️ เคยพลาดมาแล้ว: เอา String(Date) มาเรียงแบบตัวอักษร ได้ "Wed Aug 12" > "Thu Aug 13"
 *    แล้ว checkStatus() รายงานว่า "ชีตเรียงถูกแล้ว" ทั้งที่ของใหม่ตกอยู่ก้นชีต
 */
function cellTime_(v) {
  if (v && typeof v.getTime === "function") return v.getTime(); // Date (ดูที่ความสามารถ ไม่ใช่ instanceof)
  var s = String(v || "").trim();
  if (!s) return 0;
  var t = Date.parse(s.replace(" ", "T")); // "2026-08-13 06:22"
  if (isNaN(t)) t = Date.parse(s);         // "Wed Aug 13 2026 06:22:00 GMT+0700"
  return isNaN(t) ? 0 : t;
}

/**
 * แสดงวันที่ให้อ่านง่าย — รับค่าดิบจากเซลล์
 * ⚠️ ห้ามบวก 7 ชั่วโมงเอง: ถ้าเป็นข้อความ มันเป็นเวลาไทยอยู่แล้ว (syncNews เขียนแบบนั้น)
 *    ถ้าเป็น Date ก็ใช้ตัวอ่านแบบ local ซึ่ง Apps Script ตั้งเป็นเวลาของชีตให้อยู่แล้ว
 *    บวกเองเมื่อไหร่ = เวลาเพี้ยนไป 7 ชม. ทั้งที่ข้อมูลถูก
 */
function fmtTime_(v) {
  if (v && typeof v.getTime === "function") {
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return v.getFullYear() + "-" + p(v.getMonth() + 1) + "-" + p(v.getDate()) +
           " " + p(v.getHours()) + ":" + p(v.getMinutes());
  }
  var s = String(v || "").trim();
  return s || "(ว่าง)";
}

/**
 * 🔎 ติดตรงไหน — เลือกฟังก์ชันนี้ในกล่องข้าง ▶ Run แล้วกด Run · อ่านผลที่ Execution log
 *
 * ตอบทีเดียว 3 คำถามที่เดาไม่ได้จากการเปิดชีตดูเฉยๆ:
 *   1. ชีตมีข่าวถึงวันไหน  และ  แถวล่างสุดเป็นวันไหน   → รู้ว่าของใหม่ไปกองอยู่ก้นชีตหรือเปล่า
 *   2. คลังข่าวฝั่งเซิร์ฟเวอร์มีถึงวันไหน               → รู้ว่าปัญหาอยู่ฝั่งชีตหรือฝั่งคลัง
 *   3. รอบนี้มีข่าวที่ยังไม่อยู่ในชีตกี่ใบ              → รู้ว่า syncNews ควรเขียนอะไรไหม
 *
 * ไม่แตะชีตเลย อ่านอย่างเดียว รันกี่ครั้งก็ได้
 */
function checkStatus() {
  var sheet = getSheet_();
  var last = sheet.getLastRow();
  var out = ["แถวข้อมูลในชีต: " + Math.max(0, last - 1)];

  if (last > 1) {
    // ⚠️ เทียบเป็น "เวลา" ไม่ใช่ "ข้อความ" — ดู cellTime_
    var col = sheet.getRange(2, 4, last - 1, 1).getValues().map(function (r) { return r[0]; });
    var newestVal = col[0], newest = cellTime_(col[0]);
    for (var i = 1; i < col.length; i++) {
      var t = cellTime_(col[i]);
      if (t > newest) { newest = t; newestVal = col[i]; }
    }
    var top = cellTime_(col[0]);
    out.push("วันที่ใหม่สุดที่มีในชีต: " + fmtTime_(newestVal));
    out.push("แถวบนสุด (แถว 2): " + fmtTime_(col[0]));
    out.push("แถวล่างสุด (แถว " + last + "): " + fmtTime_(col[col.length - 1]));
    out.push(newest > top
      ? "→ ของใหม่ไม่ได้อยู่บนสุด ชีตยังเรียงไม่ถูก — กด Run sortNewestFirst() หนึ่งครั้ง"
      : "→ ชีตเรียงถูกแล้ว ของใหม่อยู่บนสุด");
  }

  var res = UrlFetchApp.fetch(
    API + "?src=all&days=" + DAYS + "&topics=" + encodeURIComponent(TOPICS) + "&format=json",
    { muteHttpExceptions: true }
  );
  var code = res.getResponseCode();
  out.push("คลังข่าวตอบ: HTTP " + code);
  if (code !== 200) {
    out.push("→ ดึงคลังข่าวไม่สำเร็จ: " + res.getContentText().slice(0, 200));
    console.log(out.join("\n"));
    return;
  }

  var rows = JSON.parse(res.getContentText()).rows || [];
  out.push("คลังข่าวส่งมา (ย้อนหลัง " + DAYS + " วัน): " + rows.length + " ใบ");
  out.push("ใหม่สุดในคลัง: " + (rows.length ? rows[0].date : "(ไม่มีเลย)"));

  var seen = seenLinks_(sheet);
  var fresh = rows.filter(function (r) {
    return r.link && !seen[normLink_(r.link)] && !seen[dupKey_(r.outlet, r.title)];
  });
  out.push("ที่ยังไม่มีในชีต: " + fresh.length + " ใบ");
  out.push(fresh.length
    ? "→ กด Run syncNews จะเขียนลงชีต " + fresh.length + " แถว (ปัญหาอยู่ที่การเขียน/การเรียง)"
    : rows.length
      ? "→ คลังข่าวไม่มีของใหม่เลย ปัญหาอยู่ฝั่งคลังข่าว ไม่ใช่ฝั่งชีต"
      : "→ คลังข่าวว่างเปล่า — ไม่มีอะไรให้ดึงตั้งแต่ต้นทาง");
  console.log(out.join("\n"));
}

/**
 * แตะแดชบอร์ดให้เก็บข่าวรอบใหม่เข้าคลังก่อน แล้วค่อยมาดึง
 *
 * ⚠️ **คลังข่าวโตเฉพาะตอนมีคนเปิดแดชบอร์ด** — Cloudflare Pages ตั้ง cron ไม่ได้
 * (Workers ทำได้ Pages ไม่ได้) คลังจึงถูกเขียนตอนมีคนขอ /api/trend/feeds เท่านั้น
 * วันไหนไม่มีใครเปิดหน้าเว็บ ข่าววันนั้นจะไม่ถูกเก็บเลย และชีตก็ไม่มีอะไรให้ดึงตามไปด้วย
 * → **ตัวตั้งเวลาของชีตนี้ทำหน้าที่ cron ให้ทั้งระบบ** ไม่ใช่แค่ดึงข่าวมาลงชีต
 *
 * เขียน KV เพิ่มแค่ตอน cache หมดอายุ (~1 ชม./ครั้ง = ไม่เกิน 24 ครั้ง/วัน)
 * โควตาแผนฟรี 1,000 ครั้ง/วันที่ใช้ร่วมกันทั้งโปรเจกต์ จึงยังเหลือเฟือ
 * ล้มก็ไม่เป็นไร — ข้ามไปดึงคลังเท่าที่มีตามปกติ
 */
function warmArchive_() {
  try { UrlFetchApp.fetch(FEEDS, { muteHttpExceptions: true }); } catch (e) {}
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
