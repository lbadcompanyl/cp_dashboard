// คอลัมน์ CP ต้องรับเฉพาะข่าวที่มีชื่อเครือ CP จริง
// ไม่ใช่คำที่ Google ไฮไลต์มา (Google ไฮไลต์ "เศษคำ" ได้ เช่น inter[cep]t)
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

// ⚠️ ตัวกรองอยู่ใน functions/api/_lib/noise.js ชุดเดียวใช้ทุกแดชบอร์ดแล้ว
// harness จึง import โมดูลจริงตรงๆ ไม่ต้องแกะโค้ดจาก feeds.js มารันเหมือนเมื่อก่อน
const LIB = "../functions/api/_lib/noise.js";
async function load(_file) { return import(LIB); }

// จำลองด่านชั้น 1 ของคอลัมน์ alert1 ตามโค้ดจริง (หลังแก้)
function layer1(m, it) {
  const bare = (it.title || "").replace(/\[\[\/?hl\]\]/g, "");
  const rawHay = bare + " " + (it.snippet || "");
  return m.realCP(rawHay) ? "เก็บ" : "ไปเช็คเนื้อข่าว";
}

// เคสจริงจากรูปที่เจ้าของส่งมา
const JUNK = [
  ["ข่าว F-16 ของ Al Jazeera — Google ไฮไลต์ 'cep' ใน intercept",
   { title: "F-16s inter[[hl]]cep[[/hl]]t two aircraft near Trump's New Jersey golf club",
     snippet: "F-16s inter[[hl]]cep[[/hl]]ted two civilian aircraft entering restricted airspace over Bedminster, NJ." }],
  ["เศษคำอื่นที่จะเจอแบบเดียวกัน — con[cep]t",
   { title: "New con[[hl]]cep[[/hl]]t store opens in Bangkok", snippet: "" }],
  ["ex[cep]tion",
   { title: "Court grants ex[[hl]]cep[[/hl]]tion in landmark ruling", snippet: "" }],
  ["ชื่อลวง บีแอลซีพี",
   { title: "[[hl]]บีแอลซีพี[[/hl]] เพาเวอร์ แจ้งผลประกอบการ", snippet: "" }],
];
// ข่าวเครือ CP จริง — ต้องเก็บไว้
const REAL = [
  ["ซีพีเอฟ", { title: "[[hl]]ซีพีเอฟ[[/hl]] กำไรไตรมาส 2 โต", snippet: "" }],
  ["CP Foods อังกฤษ", { title: "[[hl]]CP[[/hl]] Foods reports higher revenue", snippet: "" }],
  ["เซเว่น", { title: "[[hl]]เซเว่น[[/hl]] อีเลฟเว่น ขยายสาขา", snippet: "" }],
  ["ชื่อผู้บริหาร", { title: "ศุภชัย [[hl]]เจียรวนนท์[[/hl]] แถลงทิศทางธุรกิจ", snippet: "" }],
  ["ชื่ออยู่ในสรุป ไม่ได้อยู่พาดหัว", { title: "หุ้นกลุ่มค้าปลีกพุ่ง", snippet: "โดยมี ซีพี ออลล์ นำตลาด" }],
  ["ชื่อจริงปนชื่อลวง", { title: "ศุภชัย เจียรวนนท์ พูดที่ทรูดิจิทัล พาร์ค", snippet: "" }],
];

for (const [tag, file] of [["trend", "../functions/api/trend/feeds.js"],
                           ["ir", "../functions/api/ir/feeds.js"]]) {
  console.log(`\n--- ${tag}/feeds.js · คอลัมน์ CP (alert1) ---`);
  const m = await load(file);
  for (const [n, it] of JUNK) ok(`ไม่เก็บทันที: ${n}`, layer1(m, it) === "ไปเช็คเนื้อข่าว", layer1(m, it));
  for (const [n, it] of REAL) ok(`เก็บ: ${n}`, layer1(m, it) === "เก็บ", layer1(m, it));

  // ยืนยันว่าเป็นบั๊กเดิมจริง: ด่านเก่า (คำที่ไฮไลต์อยู่ในพาดหัว) จะปล่อยผ่าน
  const it = JUNK[0][1];
  const terms = m.highlightedTerms(it).filter((t) => !m.WEAK_TERMS.has(t));
  const title = it.title.replace(/\[\[\/?hl\]\]/g, "").toLowerCase();
  ok("ด่านเก่าปล่อยผ่านจริง (ยืนยันว่าแก้ถูกจุด)", terms.some((t) => title.includes(t)), JSON.stringify(terms));
}

console.log(`\n${fail ? "❌" : "✅"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
