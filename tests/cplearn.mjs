// "ตัดอันไหนก็ให้ไปเรียนรู้" (เจ้าของสั่ง 13 ส.ค. 2026)
// กด ↩ เอากลับ / ⚑ สั่งตัด → กลายเป็นตัวอย่างสอน AI ในรอบถัดไป
// ⚠️ ต้องไม่มี KV read เพิ่ม (ใช้ blob เดียวกับที่ feeds.js อ่านอยู่แล้ว)
import fs from "node:fs";
import { cpExamples } from "../functions/api/_lib/noise.js";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };
const rec = (title, why, at) => ({ link: "https://x/" + encodeURIComponent(title), title, why, at });

console.log("\n[1] ↩ เอากลับ = ตัวอย่าง 'ใช่ ข่าวของเครือ'");
{
  const d = { allowed: {
    a: rec("ทุ่ม 2 หมื่นล้านผุดโรงงานอาหารสัตว์", "ai-no-cp", "2026-08-13T10:00:00Z"),
    b: rec("เปิดแผนลงทุนอีอีซีปีหน้า", "ไม่มีชื่อเครือ CP ในพาดหัว", "2026-08-13T09:00:00Z"),
  }, blocked: {} };
  const ex = cpExamples(d);
  ok("ได้ 2 ตัวอย่าง", ex.length === 2, JSON.stringify(ex));
  ok("ติดป้ายว่า y ทั้งคู่", ex.every((e) => e.y === true));
  ok("ใหม่สุดมาก่อน", ex[0].t.includes("อาหารสัตว์"), JSON.stringify(ex.map((e) => e.t)));
  ok("รับเหตุผลรุ่นเก่าที่ค้างใน KV ด้วย",
     cpExamples({ allowed: { a: rec("ข่าวหนึ่ง", "ไม่มีชื่อเครือ CP ในพาดหัว/สรุป", "2026-08-13T10:00:00Z") } }).length === 1);
}

console.log("\n[2] เอากลับ 'ด้วยเหตุผลอื่น' ห้ามกลายเป็นตัวอย่างว่าเป็นข่าวเครือ");
for (const why of ["job", "shopping", "property", "vendor", "datapage", "stream", "gallery", "daily"]) {
  const ex = cpExamples({ allowed: { a: rec("รับสมัครพนักงานคลังสินค้า ด่วน", why, "2026-08-13T10:00:00Z") } });
  ok(`เอากลับเพราะ "${why}" → ไม่นับ`, ex.length === 0, JSON.stringify(ex));
}

console.log("\n[3] ⚑ สั่งตัด = ตัวอย่าง 'ไม่ใช่'");
{
  const ex = cpExamples({ blocked: {
    a: rec("ตลาดหุ้นไทยปิดบวก 1.74 จุด", "⚑ เจ้าของสั่งตัด", "2026-08-13T11:00:00Z"),
  } });
  ok("ได้ 1 ตัวอย่าง ป้าย n", ex.length === 1 && ex[0].y === false, JSON.stringify(ex));
}

console.log("\n[4] พาดหัวที่มีชื่อเครืออยู่แล้ว ไม่ต้องเอามาสอน (ไม่มีวันมาถึงชั้น AI)");
{
  ok("↩ ใบที่พาดหัวมี ซีพีเอฟ → ข้าม",
     cpExamples({ allowed: { a: rec("ซีพีเอฟ แจ้งผลประกอบการ", "ai-no-cp", "2026-08-13T10:00:00Z") } }).length === 0);
  ok("⚑ ใบที่พาดหัวมี เซเว่น → ข้าม",
     cpExamples({ blocked: { a: rec("เซเว่น อีเลฟเว่น เปิดสาขาใหม่", "⚑", "2026-08-13T10:00:00Z") } }).length === 0);
}

console.log("\n[5] คละ y/n เสมอ + ไม่เกินเพดาน");
{
  const allowed = {}, blocked = {};
  for (let i = 0; i < 20; i++) {
    allowed["a" + i] = rec("ข่าวที่เอากลับ " + i, "ai-no-cp", `2026-08-13T10:${String(i).padStart(2, "0")}:00Z`);
    blocked["b" + i] = rec("ข่าวที่สั่งตัด " + i, "⚑", `2026-08-13T09:${String(i).padStart(2, "0")}:00Z`);
  }
  const ex = cpExamples({ allowed, blocked });
  ok("ไม่เกิน 8 ตัวอย่าง (โมเดลเล็ก ใส่เยอะจะงง)", ex.length === 8, String(ex.length));
  ok("มีทั้ง y และ n ไม่ใช่ฝั่งเดียว", ex.some((e) => e.y) && ex.some((e) => !e.y), JSON.stringify(ex.map((e) => e.y)));
  ok("แต่ละฝั่งไม่เกินครึ่ง", ex.filter((e) => e.y).length <= 4 && ex.filter((e) => !e.y).length <= 4);
  ok("พาดหัวถูกตัดความยาวไว้", cpExamples({ blocked: { a: rec("ก".repeat(400), "⚑", "2026-08-13T10:00:00Z") } })[0].t.length <= 120);
}

console.log("\n[6] ของว่าง/ของพัง ต้องไม่ล้ม");
{
  ok("ไม่ส่งอะไรมาเลย", JSON.stringify(cpExamples()) === "[]");
  ok("blob ว่าง", JSON.stringify(cpExamples({})) === "[]");
  ok("record ไม่มีพาดหัว → ข้าม", cpExamples({ blocked: { a: { link: "https://x/1", at: "2026-08-13T10:00:00Z" } } }).length === 0);
  ok("record เป็น null → ข้าม", cpExamples({ blocked: { a: null } }).length === 0);
  ok("ไม่มีเวลา ก็ยังใช้ได้", cpExamples({ blocked: { a: { title: "ข่าวไม่มีเวลา" } } }).length === 1);
  ok("ถอด marker ไฮไลต์ออก",
     cpExamples({ blocked: { a: rec("[[hl]]ข่าว[[/hl]]ทดสอบ", "⚑", "2026-08-13T10:00:00Z") } })[0].t === "ข่าวทดสอบ");
}

console.log("\n[7] ต่อสายเข้า AI จริง — ตัวอย่างต้องไปโผล่ใน prompt");
const grabAI = (file) => {
  const src = fs.readFileSync(file, "utf8");
  const a = src.indexOf("async function aiHeadlineIsCP");
  return src.slice(a, src.indexOf("\nasync function ", a + 10));
};
for (const [name, f, model] of [["trend", "../functions/api/trend/feeds.js", "AI_MODEL_CAT"],
                                 ["ir", "../functions/api/ir/feeds.js", "AI_MODEL"]]) {
  console.log(`-- ${name} --`);
  const code = `const ${model} = "m";\n` + grabAI(f) + "\nexport { aiHeadlineIsCP };";
  const { aiHeadlineIsCP } = await import("data:text/javascript;charset=utf-8," + encodeURIComponent(code));
  let seen = "";
  const env = (reply) => ({ AI: { run: async (m, o) => { seen = o.messages[0].content; return { response: reply }; } } });

  await aiHeadlineIsCP(env("n"), ["ตลาดหุ้นไทยปิดบวก"], [
    { t: "ทุ่มหมื่นล้านผุดโรงงาน", y: true }, { t: "หุ้นไทยปิดลบ", y: false },
  ]);
  ok("ตัวอย่าง y อยู่ใน prompt", seen.includes('"ทุ่มหมื่นล้านผุดโรงงาน" => y'), seen.slice(0, 200));
  ok("ตัวอย่าง n อยู่ใน prompt", seen.includes('"หุ้นไทยปิดลบ" => n'));
  ok("มีคำอธิบายว่าเป็นคำตัดสินของเจ้าของ", seen.includes("เจ้าของเคยตัดสินแบบนี้มาแล้ว"));
  ok("พาดหัวที่ต้องตัดสินยังอยู่ครบ", seen.includes("ตลาดหุ้นไทยปิดบวก"));

  seen = "";
  await aiHeadlineIsCP(env("n"), ["ข่าวหนึ่ง"], []);
  ok("ยังไม่เคยกดอะไรเลย → ไม่มีหัวข้อตัวอย่างมารก", !seen.includes("เจ้าของเคยตัดสิน"), seen.slice(0, 120));
  seen = "";
  await aiHeadlineIsCP(env("n"), ["ข่าวหนึ่ง"]);
  ok("ไม่ส่งตัวอย่างมาเลย ก็ไม่พัง", !seen.includes("เจ้าของเคยตัดสิน") && seen.includes("ข่าวหนึ่ง"));

  const src = fs.readFileSync(f, "utf8");
  ok("สร้างตัวอย่างจาก blob ที่อ่านอยู่แล้ว (ไม่อ่าน KV เพิ่ม)",
     /const d = await readDecisions\(env\); setAllowed\(d\.allowed\); setBlocked\(d\.blocked\); cpEx = cpExamples\(d\);/.test(src));
  ok("อ่าน KV ที่เดียวเหมือนเดิม", (src.match(/readDecisions\(/g) || []).length === 1);
  ok("ส่งตัวอย่างเข้า verifyAlertItems", /verifyAlertItems\(cache, sources, alertVerify, \w+, env, cpEx\)/.test(src));
  ok("ส่งต่อถึง AI", /aiHeadlineIsCP\(env, blind\.map\(\(i\) => verdict\[i\]\.bare\), cpEx\)/.test(src));
  ok("อ่าน blob ล้ม → ตัวอย่างว่าง ไม่ใช่ค้างของเก่า", /let cpEx = \[\];/.test(src));
  ok("ไม่ก๊อป cpExamples มาไว้ในแดชบอร์ด", !/function cpExamples\(/.test(src));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
