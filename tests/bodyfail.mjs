// อ่านเนื้อข่าวไม่ได้ ≠ ข่าวไม่เกี่ยว — ห้ามตัดทิ้ง
// เจอจริง: ข่าว EV ของฐานเศรษฐกิจ/ข่าวสด โดนตัดด้วยเหตุผล "ไม่อยู่ในพาดหัว/เนื้อ"
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

for (const [tag, file] of [["trend", "../functions/api/trend/feeds.js"],
                           ["ir", "../functions/api/ir/feeds.js"]]) {
  const src = fs.readFileSync(file, "utf8");
  console.log("\n-- " + tag + " --");
  // ⚠️ ตัดตั้งแต่หัวฟังก์ชันถึงปีกกาปิด ไม่ใช่นับจำนวนตัวอักษรตายตัว
  //    เติมคอมเมนต์เข้าไปทีหลังทีไร ของที่จะตรวจจะหลุดออกนอกช่วงที่ตัดมา
  const at = src.indexOf("async function bodyHasKeep");
  const body = src.slice(at, src.indexOf("\n}", at) + 2);
  ok("อ่านไม่ได้ → คืน null (ไม่ใช่ false)", /if \(!body\) return null;/.test(body), body.slice(-160));
  ok("อ่านได้แล้วค่อยตัดสินจากคำ", /return keep\.some\(/.test(body));
  // 🔄 แก้ 2 ก.ย. 2026 — เจ้าของสั่งให้ **ตัดสินที่พาดหัวอย่างเดียวทุกคอลัมน์**
  //    ("ตัดยังไงก็ไม่หมด … ใน body ไม่เอาเลย" -> "คอลัมน์อื่นด้วย")
  //    ด่านอ่านเนื้อจึงถูกถอดออกจากสายงาน · ตัวฟังก์ชันยังอยู่เผื่อเจ้าของเปลี่ยนใจ
  //    ของเดิม 3 ข้อนี้วัดจุดที่เรียกใช้ ซึ่งไม่มีแล้ว — เปลี่ยนเป็นวัดว่าถูกถอดจริง
  ok("🚫 ไม่มีใครเรียก bodyHasKeep แล้ว (ตัดที่พาดหัวแทน)",
    !/bodyHasKeep\(cache, items\[/.test(src));
  ok("ไม่อยู่ในพาดหัว = ตัดทันที", /return \{ ok: false, why: "ไม่อยู่ในพาดหัว"/.test(src));
  ok("🚫 ไม่เหลือ verdict ที่รอไปอ่านเนื้อ", !/ok: "body"/.test(src));

  // จำลองตรรกะการตัดสิน
  const decide = (hit, allowFetch = true) => (allowFetch ? hit !== false : true);
  ok("เจอคำในเนื้อ → เก็บ", decide(true) === true);
  ok("อ่านแล้วไม่เจอคำ → ตัด", decide(false) === false);
  ok("อ่านไม่ได้เลย → เก็บ", decide(null) === true);
  ok("ยังยิงเน็ตไม่ได้ → เก็บ", decide(false, false) === true);
}
console.log("\n" + (fail ? "❌" : "✅") + " ผ่าน " + pass + " · ตก " + fail + "\n");
process.exit(fail ? 1 : 0);
