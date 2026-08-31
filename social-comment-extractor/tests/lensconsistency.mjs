/* ตรวจ "ตัวเลขบนแถบสรุป" กับ "รายการ audit ข้างล่าง" ว่ามาจากแกนเดียวกัน
   🐞 เจ้าของจับได้เอง 28 ส.ค. 2026: แถบสรุปบอก ลบ 20 แต่รายการมี ลบ 7
      เพราะแถบสรุปใช้ overall_cred ส่วน audit ฮาร์ดโค้ดไว้ที่ sentiment_cp */
import { readFileSync } from "fs";
let fail = 0; const ok = (c, m) => { console.log((c ? "✅" : "❌") + " " + m); if (!c) fail++; };

const src = readFileSync("/home/user/cp_dashboard/social-comment-extractor/worker/worker.js", "utf8");
const body = src.slice(src.indexOf("async function analyze("), src.indexOf("function detectPlatform("));

// [1] ต้องมีตัวแปรเดียวที่ตัดสินว่าใช้แกนไหน
ok(/const LENS_KEY = target === "cp" \? "sentiment_cp" : "overall_cred";/.test(body),
   "มี LENS_KEY ตัวเดียวเป็นคนตัดสินว่าใช้แกนไหน");

// [2] audit ต้องใช้ LENS_KEY ไม่ใช่ฮาร์ดโค้ด
ok(/two\.map\(r => String\(r\[LENS_KEY\]/.test(body), "labels/audit อ่านผ่าน LENS_KEY");
ok(!/two\.map\(r => String\(r\.sentiment_cp/.test(body),
   "ไม่มีการฮาร์ดโค้ด sentiment_cp ใน labels อีกแล้ว (ตัวที่ทำให้เลขไม่ตรง)");

// [3] จำลองผลจริงแล้วนับ — แถบสรุปกับ audit ต้องได้เลขเท่ากันทั้ง 2 โหมด
const two = [
  { sentiment_cp: "Positive", overall_cred: "Negative", is_sarcasm: 0 },
  { sentiment_cp: "Neutral",  overall_cred: "Negative", is_sarcasm: 0 },
  { sentiment_cp: "Neutral",  overall_cred: "Negative", is_sarcasm: 0 },
  { sentiment_cp: "Negative", overall_cred: "Positive", is_sarcasm: 0 },
];
const count = (key) => { const c = { positive: 0, neutral: 0, negative: 0 };
  for (const r of two) { const k = String(r[key] || "").toLowerCase(); if (c[k] != null) c[k]++; } return c; };
for (const target of ["cp", "general"]) {
  const LENS_KEY = target === "cp" ? "sentiment_cp" : "overall_cred";
  const lenses = { cp: count("sentiment_cp"), overall: count("overall_cred") };
  const sentiment = target === "cp" ? lenses.cp : lenses.overall;      // แถบสรุป
  const labels = two.map(r => String(r[LENS_KEY] || "neutral").toLowerCase());  // audit
  const fromAudit = { positive: 0, neutral: 0, negative: 0 };
  for (const l of labels) fromAudit[l]++;
  ok(JSON.stringify(sentiment) === JSON.stringify(fromAudit),
     `โหมด ${target}: แถบสรุป ${JSON.stringify(sentiment)} = audit ${JSON.stringify(fromAudit)}`);
}

// [4] พิสูจน์ว่าเทสต์นี้จับของพังได้จริง — ลองฮาร์ดโค้ดแบบเดิมในโหมดอารมณ์รวม
{
  const lenses = { cp: count("sentiment_cp"), overall: count("overall_cred") };
  const sentiment = lenses.overall;                                  // แถบสรุป (ถูก)
  const labels = two.map(r => String(r.sentiment_cp).toLowerCase()); // audit (แบบบั๊กเดิม)
  const fromAudit = { positive: 0, neutral: 0, negative: 0 };
  for (const l of labels) fromAudit[l]++;
  ok(JSON.stringify(sentiment) !== JSON.stringify(fromAudit),
     "ถ้าย้อนกลับไปใช้โค้ดแบบเดิม เทสต์ต้องจับได้ (เลขไม่ตรงกันจริง)");
}

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
