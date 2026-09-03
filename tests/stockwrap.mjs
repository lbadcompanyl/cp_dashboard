// ข่าวตลาดหุ้นของเดลินิวส์หลุดเข้าคอลัมน์ CP (เจ้าของแจ้ง 13 ส.ค. 2026 รอบสาม)
// รูรั่ว 3 ชั้น: (1) สรุปแบบรายการข่าวที่ใช้ชื่อเดือนเต็มไม่ถูกจับ (2) merge เข้าคอลัมน์ CP
// ด้วยคำในสรุป (3) เปิดอ่านเนื้อไม่ได้ = ปล่อยผ่านตาบอด → ให้ AI อ่านพาดหัวตัดสินแทน
import fs from "node:fs";
import { looksLikeListing } from "../functions/api/trend/_lib/parser.js";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

console.log("\n[1] สรุปที่เขียนวันที่แบบชื่อเดือนเต็ม ต้องถูกจับว่าเป็นรายการข่าว");
const DN = "... 13 สิงหาคม 2569 18:30 น. 'ซีพี'สร้าง CP-CoEX ปั้นคนไทยเป็นผู้นำยุค AI. 13 สิงหาคม 2569 18:24 น. อ่านความจริง อ่านเดลินิวส์. ข่าวเดลินิวส์ · บทความ ...";
ok("เคสจริงจากเดลินิวส์ (สิงหาคม เต็มคำ ×2)", looksLikeListing(DN), DN.slice(0, 60));
ok("เดือนเต็มอื่นก็จับ", looksLikeListing("ข่าวแรก 5 มกราคม 2569 และข่าวสอง 7 กุมภาพันธ์ 2569"));
ok("ชื่อย่อยังจับเหมือนเดิม", looksLikeListing("ข่าวแรก 07 ส.ค. 2569 และอีกข่าว 08 ส.ค. 2569"));
ok("สรุปจริงที่เอ่ยวันที่เต็มครั้งเดียว ห้ามตัด",
   !looksLikeListing("บริษัทประกาศเมื่อ 13 สิงหาคม 2569 ว่าจะขยายการลงทุนเพิ่มอีกเท่าตัว"));
ok("สรุปจริงไม่มีวันที่ ห้ามตัด", !looksLikeListing("ซีพี แอ็กซ์ตร้า วางกลยุทธ์ผ่านโมเดลธุรกิจใหม่"));

console.log("\n[2] คอลัมน์ CP ต้อง merge/prune ด้วยพาดหัวเท่านั้น (สรุปเชื่อไม่ได้)");
for (const [name, f] of [["trend", "../functions/api/trend/feeds.js"],
                         ["ir", "../functions/api/ir/feeds.js"]]) {
  const src = fs.readFileSync(f, "utf8");
  // 🔄 แก้ 2 ก.ย. 2026: เดิมมีแต่ alert1 ที่ยึดพาดหัว · ตอนนี้ **ทุกคอลัมน์** ยึดพาดหัว
  //    (เจ้าของสั่ง "ใน body ไม่เอาเลย" แล้วสั่งต่อว่า "คอลัมน์อื่นด้วย")
  // ⚠️ ต้องตัดเฉพาะตัวฟังก์ชันมาดู — ที่อื่นในไฟล์ก็ใช้บรรทัดหน้าตาเดียวกันได้
  for (const fn of ["function mergeNewsIntoAlert", "function pruneStaleMerged"]) {
    const i = src.indexOf(fn);
    const body = i < 0 ? "" : src.slice(i, src.indexOf("\n}", i));
    ok(`${name}: ${fn.replace("function ", "")} เทียบคำจากพาดหัวอย่างเดียว`,
      i >= 0 && /const hay = \(it\.title \|\| ""\)\.toLowerCase\(\)/.test(body)
             && !/\(it\.snippet \|\| ""\)/.test(body),
      i < 0 ? "ไม่เจอฟังก์ชัน" : "ยังเอาสรุปมาเทียบ");
  }
}
{ // จำลองตรรกะ: สรุปมี "ซีพี" แต่พาดหัวไม่มี → ต้องไม่ถูกดูดเข้าคอลัมน์ไหนเลย
  const it = { title: "ตลาดหุ้นไทยปิดบวก 1.74 จุด", snippet: "'ซีพี'สร้าง CP-CoEX" };
  const hay = (it.title || "").toLowerCase();
  ok("คำในสรุปไม่ดูดข่าวเข้าอีกแล้ว (ทุกคอลัมน์)", !hay.includes("ซีพี"));
  ok("ข่าวที่ชื่ออยู่ในพาดหัวจริง ยังเข้าได้",
     "ซีพีเอฟ แจ้งผลประกอบการ".toLowerCase().includes("ซีพี"));
}

console.log("\n[3] AI อ่านพาดหัวตัดสินใบที่เปิดอ่านเนื้อไม่ได้");
const grabAI = (file) => {
  const src = fs.readFileSync(file, "utf8");
  const a = src.indexOf("async function aiHeadlineIsCP");
  const b = src.indexOf("\nasync function ", a + 10);
  return src.slice(a, b);
};
for (const [name, f, model] of [["trend", "../functions/api/trend/feeds.js", "AI_MODEL_CAT"],
                                 ["ir", "../functions/api/ir/feeds.js", "AI_MODEL"]]) {
  const code = `const ${model} = "test-model";\n` + grabAI(f) + "\nexport { aiHeadlineIsCP };";
  const { aiHeadlineIsCP } = await import("data:text/javascript;charset=utf-8," + encodeURIComponent(code));
  const env = (reply) => ({ AI: { run: async () => ({ response: reply }) } });
  console.log(`-- ${name} --`);
  ok("ตอบ y/n เปล่าๆ", JSON.stringify(await aiHeadlineIsCP(env("n\ny"), ["หุ้นไทยปิดบวก", "ซีพีเอฟ ลงทุน"])) === "[false,true]");
  ok("ตอบแบบมีเลขนำ (1. n)", JSON.stringify(await aiHeadlineIsCP(env("1. n\n2. y"), ["a", "b"])) === "[false,true]");
  ok("ตอบไม่ครบ = null (อย่าเดา)", (await aiHeadlineIsCP(env("y"), ["a", "b"])) === null);
  ok("ตอบเกิน = null", (await aiHeadlineIsCP(env("y\nn\ny"), ["a", "b"])) === null);
  ok("ตอบเป็นข้อความเพ้อ = null", (await aiHeadlineIsCP(env("ไม่แน่ใจครับ"), ["a"])) === null);
  ok("AI ล้ม = null (fail-open)", (await aiHeadlineIsCP({ AI: { run: async () => { throw new Error("x"); } } }, ["a"])) === null);
  ok("ไม่มี binding = null", (await aiHeadlineIsCP({}, ["a"])) === null);
  ok("ไม่มีพาดหัว = null", (await aiHeadlineIsCP(env("y"), [])) === null);

  const src = fs.readFileSync(f, "utf8");
  // 🔄 แก้ 2 ก.ย. 2026 (เจ้าของสั่ง "เอาเฉพาะ keyword อยู่ในพาดหัว ใน body ไม่เอาเลย")
  // ของเดิม 3 ข้อนี้วัดชั้น AI ที่ยิงหลังอ่านเนื้อข่าว ซึ่งถูกถอดออกไปทั้งบล็อกแล้ว
  // เพราะคอลัมน์ CP ไม่เดินไปถึงการอ่านเนื้ออีกต่อไป — วัดกฎใหม่แทน (ชุดเต็มอยู่ที่ cptitle.mjs)
  ok("คอลัมน์ CP ตัดที่พาดหัวเลย ไม่ไปอ่านเนื้อ",
     /return \{ ok: false, why: "ไม่มีชื่อเครือ CP ในพาดหัว"/.test(src));
  ok("🚫 ไม่เหลือชั้น AI ที่ผูกกับการอ่านเนื้อ", !/const blind = toFetch/.test(src));
  ok("ชั้น AI ที่ดูพาดหัว (ชื่อเครือกลางคำอื่น) ยังอยู่", /ok: "ai", why: "ai-weak-cp"/.test(src));
  ok("ส่ง env เข้า verifyAlertItems แล้ว", /verifyAlertItems\(cache, sources, alertVerify, \w+, env\b/.test(src));
}

console.log("\n[4] หน้า admin แปลเหตุผลใหม่เป็นภาษาคนแล้ว");
{
  const admin = fs.readFileSync(new URL("../admin/app.js", import.meta.url), "utf8");
  ok("WHY_TH มี ai-no-cp", /"ai-no-cp":/.test(admin));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
