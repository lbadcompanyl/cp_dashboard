// True Digital Park = สถานที่ ไม่ใช่ข่าวเครือ CP — ต้องไม่ถูกดึงเข้าคอลัมน์ CP และไม่ถูกดันขึ้นบน
// ดึงบล็อกจริงจากไฟล์มารัน ไม่ก๊อปโค้ดมาเขียนซ้ำ
import fs from "node:fs";
// ตัวกรองย้ายไป functions/api/_lib/noise.js แล้ว — หาในไฟล์ feeds.js ไม่เจอให้ไปหาต่อในไลบรารี
const LIB_SRC = fs.readFileSync(new URL("../functions/api/_lib/noise.js", import.meta.url), "utf8").replace(/^export /gm, "");

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? "\n       " + x : ""))); };

// ---------- ฝั่ง server: realCP() ตัดสินว่าดึงข่าวเข้าคอลัมน์ CP ไหม ----------
async function serverFrom(file) {
  const src = fs.readFileSync(file, "utf8");
  const grab = (re, n) => { const m = src.match(re) || LIB_SRC.match(re); if (!m) throw new Error(`${file}: หา ${n} ไม่เจอ`); return m[0]; };
  const block =
    grab(/^const CP_BRANDS = \[[\s\S]*?^\];$/m, "CP_BRANDS") + "\n" +
    grab(/^const CP_FALSE = \[.*$/m, "CP_FALSE") + "\n" +
    grab(/^const CP_FALSE_RX = \[[\s\S]*?^\];$/m, "CP_FALSE_RX") + "\n" +
    grab(/^const CP_FALSE_RE = new RegExp\([\s\S]*?^\);$/m, "CP_FALSE_RE") + "\n" +
    grab(/^const dropFalseCP = .*$/m, "dropFalseCP") + "\n" +
    grab(/^function realCP\(text\) \{[\s\S]*?^\}$/m, "realCP") + "\n" +
    "export { realCP };";
  return import("data:text/javascript;charset=utf-8," + encodeURIComponent(block));
}

// ---------- ฝั่งหน้าเว็บ: pinScore() ตัดสินว่าดันขึ้นบนสุดไหม ----------
async function clientFrom(file) {
  const src = fs.readFileSync(file, "utf8");
  const grab = (re, n) => { const m = src.match(re) || LIB_SRC.match(re); if (!m) throw new Error(`${file}: หา ${n} ไม่เจอ`); return m[0]; };
  const block =
    grab(/^const PIN_FALSE_RE = .*$/m, "PIN_FALSE_RE") + "\n" +
    grab(/^const PIN_CP_RE = .*$/m, "PIN_CP_RE") + "\n" +
    grab(/^const PIN_FOOD_STRONG_RE = .*$/m, "PIN_FOOD_STRONG_RE") + "\n" +
    grab(/^const PIN_FOOD_AMBIG_RE = .*$/m, "PIN_FOOD_AMBIG_RE") + "\n" +
    grab(/^const PIN_FOOD_CTX_RE = .*$/m, "PIN_FOOD_CTX_RE") + "\n" +
    grab(/^const PIN_FOOD_BRAND_RE = .*$/m, "PIN_FOOD_BRAND_RE") + "\n" +
    grab(/^const FOOD_CAT = .*$/m, "FOOD_CAT") + "\n" +
    grab(/^function pinScore\(it\) \{[\s\S]*?^\}$/m, "pinScore") + "\n" +
    "export { pinScore };";
  return import("data:text/javascript;charset=utf-8," + encodeURIComponent(block));
}

// สะกดได้หลายแบบ — ต้องตัดออกหมดทุกแบบ
const PARK = [
  "เปิดตัวสตาร์ทอัพที่ทรูดิจิทัล พาร์ค",
  "งานจัดที่ทรูดิจิทัลพาร์ค",
  "อีเวนต์ที่ ทรู ดิจิทัล พาร์ค กรุงเทพ",
  "เวิร์กช็อปที่ทรูดิจิตอล พาร์ค",
  "ประชุมที่ทรูดิจิตอลปาร์ค",
  "meetup at True Digital Park",
  "co-working space true digital park bangkok",
  "TRUE DIGITAL PARK เปิดพื้นที่ใหม่",
];
// ของทรู/เครือ CP จริง — ห้ามหายไปด้วย
const REAL = [
  "ทรู คอร์ปอเรชั่น แจ้งผลประกอบการไตรมาส 2",
  "ทรูดิจิทัล กรุ๊ป เปิดบริการใหม่",
  "ทรู เปิดตัวแพ็กเกจ 5G",
  "ซีพีเอฟ กำไรโต",
  "ศุภชัย เจียรวนนท์ กล่าวในงานที่ทรูดิจิทัล พาร์ค",
];

for (const [tag, file] of [["trend", "../functions/api/trend/feeds.js"],
                           ["ir", "../functions/api/ir/feeds.js"]]) {
  console.log(`\n[server] ${tag}/feeds.js — ดึงเข้าคอลัมน์ CP ไหม`);
  const { realCP } = await serverFrom(file);
  for (const t of PARK) ok(`ไม่ดึงเข้า: ${t.slice(0, 34)}`, realCP(t) === false);
  for (const t of REAL) ok(`ยังดึงเข้าอยู่: ${t.slice(0, 34)}`, realCP(t) === true);
}

for (const [tag, file] of [["trend", "../trend/app.js"], ["issue", "../issue/app.js"]]) {
  console.log(`\n[หน้าเว็บ] ${tag}/app.js — ดันขึ้นบนสุดไหม (2 = เครือ CP)`);
  const { pinScore } = await clientFrom(file);
  const mk = (title) => ({ title, snippet: "", related: [] });
  for (const t of PARK) ok(`ไม่ดัน: ${t.slice(0, 34)}`, pinScore(mk(t)) !== 2, "ได้ " + pinScore(mk(t)));
  for (const t of REAL) ok(`ยังดันอยู่: ${t.slice(0, 34)}`, pinScore(mk(t)) === 2, "ได้ " + pinScore(mk(t)));
}

console.log(`\n${fail ? "❌" : "✅"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
