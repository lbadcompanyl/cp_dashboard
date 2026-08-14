// คำอังกฤษต้องตรงทั้งคำ — "rcep" ห้ามไปจับ "inte(rcep)t"
// เคสจริง: ข่าว F-16s intercept ของ Al Jazeera หลุดเข้าคอลัมน์การค้าของ IR
import fs from "node:fs";
// ตัวกรองย้ายไป functions/api/_lib/noise.js แล้ว — หาในไฟล์ feeds.js ไม่เจอให้ไปหาต่อในไลบรารี
const LIB_SRC = fs.readFileSync(new URL("../functions/api/_lib/noise.js", import.meta.url), "utf8").replace(/^export /gm, "");

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

// ⚠️ ตัวกรองอยู่ใน functions/api/_lib/noise.js ชุดเดียวใช้ทุกแดชบอร์ดแล้ว
// harness จึง import โมดูลจริงตรงๆ ไม่ต้องแกะโค้ดจาก feeds.js มารันเหมือนเมื่อก่อน
const LIB = "../functions/api/_lib/noise.js";
async function load(_file) { return import(LIB); }

// คำที่อยู่ในลิสต์จริงของคอลัมน์การค้า
const TERMS = ["rcep", "fta", "acfta", "iuu", "tu", "gfpt", "cage free", "brazil chicken",
               "นำเข้า", "ส่งออก", "เถื่อน", "หมูเป็น", "ราคาลูกสุกร"];

const JUNK = [
  "F-16s intercept two aircraft near Trump's New Jersey golf club",
  "Russia exploits Ukraine's interceptor shortage in ongoing strikes",
  "Police intercepted the shipment at the border",   // มีทั้ง intercept และคำที่ดูคล้ายการค้า
  "The concept store opened yesterday",
  "Stuttgart wins the cup final",                     // "tu" อยู่กลาง Stuttgart
  "Actual results differ from the forecast",          // "tu" อยู่กลาง Actual
];
const REAL = [
  ["RCEP ตัวเต็ม", "ไทยได้ประโยชน์จาก RCEP เต็มที่ปีนี้"],
  ["rcep พิมพ์เล็ก", "thailand gains from rcep trade pact"],
  ["RCEP ติดเครื่องหมาย", "Trade under RCEP, ASEAN grows"],
  ["IUU", "EU lifts IUU yellow card for Thailand"],
  ["TU เดี่ยว", "TU reports record quarterly profit"],
  ["cage free", "Retailers commit to cage free eggs by 2027"],
  ["คำไทยกลางประโยค", "ยอดส่งออกไก่แปรรูปพุ่ง"],
  ["คำไทยติดกัน", "ราคาลูกสุกรขยับขึ้น"],
];

for (const [tag, file] of [["ir", "../functions/api/ir/feeds.js"],
                           ["trend", "../functions/api/trend/feeds.js"]]) {
  console.log(`\n--- ${tag}/feeds.js ---`);
  const m = await load(file);
  const matchers = m.buildMatchers(TERMS);
  const hit = (t) => m.anyTermIn(t.toLowerCase(), matchers);

  for (const t of JUNK) ok(`ไม่ดึงเข้า: ${t.slice(0, 46)}`, hit(t) === null, "ติดคำ " + hit(t));
  for (const [n, t] of REAL) ok(`ยังดึงเข้า [${n}]: ${t.slice(0, 34)}`, hit(t) !== null);

  // ไฮไลต์ก็ต้องไม่ครอบกลางคำ
  ok("ไม่ไฮไลต์กลางคำ (intercept)", !m.hlWrap("F-16s intercept two aircraft", "rcep").includes("[[hl]]"),
     m.hlWrap("F-16s intercept two aircraft", "rcep"));
  ok("ไฮไลต์คำเต็มได้ปกติ", m.hlWrap("gains from RCEP pact", "rcep").includes("[[hl]]RCEP[[/hl]]"),
     m.hlWrap("gains from RCEP pact", "rcep"));
}

console.log(`\n${fail ? "❌" : "✅"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
