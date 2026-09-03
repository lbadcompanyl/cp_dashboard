// ด่าน "ไปอ่านเนื้อข่าวจริง" ต้องได้คำไปหาด้วย ไม่ใช่ได้ลิสต์ว่าง
//
// เจอจริง 20 ส.ค. 2026 — หน้า /admin/ โชว์ว่าตัดข่าว 9 ใบด้วยเหตุผล
// "คำที่ match ไม่ได้อยู่ในพาดหัวหรือเนื้อข่าว" ทั้งที่ข่าวเกี่ยวตรงๆ
// และคำก็อยู่ในเนื้อข่าวจริง (เจ้าของแจ้งพร้อมภาพหน้าจอ)
//
// ต้นเหตุ 2 ชั้นซ้อนกัน:
//   1. ส่ง `extra` (ลิสต์ชื่อเครือ CP) ไปให้ bodyHasKeep ทุกคอลัมน์
//      คอลัมน์ที่ไม่ใช่ CP ค่านี้เป็น [] → ไม่มีคำให้หาเลย
//   2. bodyHasKeep เจอลิสต์ว่างแล้วคืน false ซึ่งแปลว่า "อ่านแล้วไม่เจอ"
//      ทั้งที่ยังไม่เคยเปิดหน้าข่าวสักครั้ง → ถูกตัดทิ้ง
// รวมกัน = ด่านอ่านเนื้อข่าวของคอลัมน์ที่ไม่ใช่ CP **ไม่เคยทำงานเลย**
// มันกลายเป็นเครื่องตัดทิ้งทุกใบที่คำไม่อยู่ในพาดหัว
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

for (const [tag, file] of [["trend", "../functions/api/trend/feeds.js"],
                           ["ir", "../functions/api/ir/feeds.js"]]) {
  const src = fs.readFileSync(file, "utf8");
  console.log("\n-- " + tag + " --");

  const head = src.slice(src.indexOf("async function bodyHasKeep"),
                         src.indexOf("async function bodyHasKeep") + 900);
  ok("ไม่มีคำให้หา = ตัดสินไม่ได้ (คืน null ไม่ใช่ false)",
    /if \(!keep \|\| !keep\.length\) return null;/.test(head), head.slice(0, 200));
  ok("ไม่เหลือของเดิมที่คืน false",
    !/if \(!keep \|\| !keep\.length\) return false;/.test(src));

  // 🔄 แก้ 2 ก.ย. 2026 — ด่านอ่านเนื้อถูกถอดออกจากสายงาน (ตัดสินที่พาดหัวอย่างเดียวทุกคอลัมน์)
  //    บั๊กที่ไฟล์นี้เคยจับ (ส่งลิสต์ว่างไปให้ bodyHasKeep แล้วมันคืน false = ตัดทิ้งทั้งที่ไม่เคยอ่าน)
  //    หมดโอกาสเกิดเพราะไม่มีใครเรียกแล้ว — แต่ยังคุมพฤติกรรมของตัวฟังก์ชันไว้ (ข้อข้างบน)
  //    เผื่อวันหนึ่งต่อกลับ จะได้ไม่ต่อกลับมาพร้อมบั๊กเดิม
  ok("🚫 ไม่มีใครเรียก bodyHasKeep แล้ว", !/bodyHasKeep\(cache, items\[/.test(src));
  ok("ตัดสินที่พาดหัวแทน", /return \{ ok: false, why: "ไม่อยู่ในพาดหัว"/.test(src));
}

// ── จำลองตรรกะทั้งเส้น ────────────────────────────────────────────────
console.log("\n-- จำลองการตัดสิน --");
{
  // คืนค่าแบบเดียวกับ bodyHasKeep หลังแก้
  const bodyHasKeep = (body, keep) => {
    if (!keep || !keep.length) return null;   // ไม่มีคำให้หา = ตัดสินไม่ได้
    if (!body) return null;                    // อ่านไม่ได้ = ตัดสินไม่ได้
    return keep.some((t) => body.includes(t));
  };
  const keptAfter = (hit) => hit !== false;    // ตรงกับ verdict[i].ok = hits[k] !== false

  const NEWS = "วอนรัฐเร่งแก้ 'โรคกุ้ง' เหตุผลหลักฉุดผลผลิตกุ้ง ปีนี้ทรงตัว 2.5 แสนตัน";
  const BODY = "สมาคมกุ้งไทยระบุว่า โรคกุ้ง ยังเป็นเหตุผลหลักที่ฉุดผลผลิตกุ้งของไทย";

  ok("คำอยู่ในเนื้อข่าว → เก็บไว้", keptAfter(bodyHasKeep(BODY, ["โรคกุ้ง"])) === true);
  ok("คำไม่อยู่ในเนื้อข่าวจริงๆ → ตัด", keptAfter(bodyHasKeep(BODY, ["ปลากระป๋อง"])) === false);
  ok("อ่านเนื้อข่าวไม่ได้ → เก็บไว้ (ไม่รู้ ไม่ใช่ไม่เกี่ยว)", keptAfter(bodyHasKeep("", ["โรคกุ้ง"])) === true);

  // ⚠️ หัวใจของบั๊กรอบนี้
  ok("ไม่มีคำให้หา → ต้องเก็บไว้ ห้ามตัด", keptAfter(bodyHasKeep(BODY, [])) === true);

  // ของเดิมเป็นยังไง — ไว้ยืนยันว่าเทสต์นี้จับของจริง
  const old = (body, keep) => { if (!keep || !keep.length) return false; if (!body) return null; return keep.some((t) => body.includes(t)); };
  ok("(ยืนยันว่าของเดิมพังจริง) ลิสต์ว่างแล้วโดนตัด", keptAfter(old(BODY, [])) === false);

  ok("พาดหัวไม่มีคำ แต่เนื้อมี → ต้องไม่ถูกตัด",
    !NEWS.includes("สมาคมกุ้งไทย") && keptAfter(bodyHasKeep(BODY, ["สมาคมกุ้งไทย"])) === true);
}

console.log("\n" + (fail ? "❌" : "✅") + " ผ่าน " + pass + " · ตก " + fail + "\n");
process.exit(fail ? 1 : 0);
