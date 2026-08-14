// อ่านเนื้อข่าวไม่ได้ ≠ ข่าวไม่เกี่ยว — ห้ามตัดทิ้ง
// เจอจริง: ข่าว EV ของฐานเศรษฐกิจ/ข่าวสด โดนตัดด้วยเหตุผล "ไม่อยู่ในพาดหัว/เนื้อ"
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

for (const [tag, file] of [["trend", "../functions/api/trend/feeds.js"],
                           ["ir", "../functions/api/ir/feeds.js"]]) {
  const src = fs.readFileSync(file, "utf8");
  console.log("\n-- " + tag + " --");
  const body = src.slice(src.indexOf("async function bodyHasKeep"), src.indexOf("async function bodyHasKeep") + 1600);
  ok("อ่านไม่ได้ → คืน null (ไม่ใช่ false)", /if \(!body\) return null;/.test(body), body.slice(-160));
  ok("อ่านได้แล้วค่อยตัดสินจากคำ", /return keep\.some\(/.test(body));
  ok("null = เก็บไว้ ไม่ตัด", /verdict\[i\]\.ok = hits\[k\] !== false;/.test(src));
  ok("รอบที่ยังยิงเน็ตไม่ได้ ก็ไม่ตัด", /needBody\.forEach\(\(i\) => \{ verdict\[i\]\.ok = true; \}\);/.test(src));
  ok("ไม่เหลือโค้ดเดิมที่ตัดทิ้ง", !/verdict\[i\]\.ok = hits\[k\] === true/.test(src) && !/needBody\.forEach\(\(i\) => \{ verdict\[i\]\.ok = false; \}\)/.test(src));

  // จำลองตรรกะการตัดสิน
  const decide = (hit, allowFetch = true) => (allowFetch ? hit !== false : true);
  ok("เจอคำในเนื้อ → เก็บ", decide(true) === true);
  ok("อ่านแล้วไม่เจอคำ → ตัด", decide(false) === false);
  ok("อ่านไม่ได้เลย → เก็บ", decide(null) === true);
  ok("ยังยิงเน็ตไม่ได้ → เก็บ", decide(false, false) === true);
}
console.log("\n" + (fail ? "❌" : "✅") + " ผ่าน " + pass + " · ตก " + fail + "\n");
process.exit(fail ? 1 : 0);
