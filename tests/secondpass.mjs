// ด่านตรวจรอบสอง (เจ้าของแจ้ง 14 ส.ค. 2026: khaosod/dailynews/naewna ยังค้างในคอลัมน์ CP)
// ต้นเหตุ: verify ทำงาน "ก่อน" archive — ของเก่าใน KV ไหลกลับเข้าคอลัมน์โดยไม่ผ่านด่านใหม่เลย
// แก้: ใบที่ผ่านด่านติดธง vfy · ใบไม่มีธง (ของเก่า) ถูกตรวจซ้ำหลัง archive แล้วตัดออกจาก "คลัง" ด้วย
import fs from "node:fs";
import { ROUNDUP_RE } from "../functions/api/_lib/noise.js";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

console.log("\n[1] คอลัมน์รวมข่าวสั้นหลายบริษัท (มาร์เก็ตนิวส์) = roundup ไม่ใช่ข่าวของเครือ");
ok("เคสจริงแนวหน้า", ROUNDUP_RE.test("โลกธุรกิจ - มาร์เก็ตนิวส์ : 14 สิงหาคม 2569 - แนวหน้า".toLowerCase()));
ok("market news อังกฤษ", ROUNDUP_RE.test("market news roundup today".toLowerCase()));
ok("ข่าวจริงที่มีคำว่า มาร์เก็ต เฉยๆ ไม่โดน", !ROUNDUP_RE.test("ซีพี แอ็กซ์ตร้า รุกตลาดมาร์เก็ตเพลส".toLowerCase()));

for (const [name, f] of [["trend", "../functions/api/trend/feeds.js"],
                         ["ir", "../functions/api/ir/feeds.js"]]) {
  const src = fs.readFileSync(f, "utf8");
  console.log(`\n[2-${name}] ธง vfy — ติดเฉพาะคำตัดสินที่ชี้ขาดแล้ว`);
  ok("มี VFY_VER", /const VFY_VER = \d+;/.test(src));
  ok("ผ่านชั้นพาดหัว (ชื่อเครือยืนเป็นคำ) → ติดธง", /if \(ev === "strong"\) return \{ ok: true, mark: true \};/.test(src));
  ok("เจ้าของสั่งคืน → ติดธง", /isAllowed\(it\)\) return \{ ok: true, mark: true \}/.test(src));
  ok("อ่านเนื้อเจอคำ → ติดธง", /if \(hits\[k\] === true\) verdict\[i\]\.mark = true;/.test(src));
  ok("AI ตอบ 'ใช่' → ติดธง", /else \{ verdict\[i\]\.mark = true; \}/.test(src));
  ok("ธงลงที่ item ตอนเก็บ (ติดไปกับคลังเอง)", /if \(v\.mark\) items\[i\]\.vfy = VFY_VER;/.test(src));
  ok("อ่านไม่ได้/ยังไม่ตัดสิน → ไม่ติดธง (ต้องตรวจใหม่รอบหน้า)",
     !/verdict\[i\]\.ok = hits\[k\] !== false; verdict\[i\]\.mark/.test(src));

  console.log(`[3-${name}] เพดานยิงอ่านเนื้อต่อ build`);
  ok("มี BODY_FETCH_MAX", /const BODY_FETCH_MAX = \d+;/.test(src));
  ok("ยิงแค่หัวคิว", /const toFetch = needBody\.slice\(0, BODY_FETCH_MAX\);/.test(src));
  ok("เกินเพดาน = เก็บไว้ก่อน ไม่ตัดมั่ว", /needBody\.slice\(BODY_FETCH_MAX\)\.forEach\(\(i\) => \{ verdict\[i\]\.ok = true; \}\);/.test(src));

  console.log(`[4-${name}] รอบสอง — ของเก่าจากคลังต้องผ่านด่านเดียวกัน`);
  ok("ตรวจเฉพาะใบที่ยังไม่มีธง", /filter\(\(it\) => it\.vfy !== VFY_VER\)/.test(src));
  ok("เรียก verify ซ้ำหลัง archive", /await verifyAlertItems\(cache, pending, v2/.test(src));
  ok("ตัดออกจากหน้าจอ", /sources\[s2\]\.items = sources\[s2\]\.items\.filter\(\(it\) => !cut\.has\(normLink\(it\.link\)\)\)/.test(src));
  ok("ตัดออกจากคลังด้วย — ไม่วนกลับมาอีก", /archiveOut\[s2\] = archiveOut\[s2\]\.filter\(\(it\) => !cut\.has\(normLink\(it\.link\)\)\)/.test(src));
  ok("ใบที่ตัดโผล่ในรายการบนหน้า admin", /alertVerify\.dropped = \[\.\.\.\(alertVerify\.dropped \|\| \[\]\), \.\.\.v2\.dropped\]/.test(src));
  ok("รอบสองมาก่อนเขียนคลังลง KV",
     src.indexOf("await verifyAlertItems(cache, pending, v2") < src.indexOf("await saveArchives(env, archiveOut"));
  ok("เขียน KV ครั้งเดียวต่อ build เท่าเดิม", (src.match(/kv\.put\(/g) || []).length <= 1,
     String((src.match(/kv\.put\(/g) || []).length));
}

console.log("\n[5] IR — การเขียนคลังแยกออกมาแล้ว (แบบเดียวกับ trend)");
{
  const src = fs.readFileSync(new URL("../functions/api/ir/feeds.js", import.meta.url), "utf8");
  ok("mergeArchives ไม่เขียน KV เองแล้ว", /return out; \/\/ ยังไม่เขียน KV/.test(src));
  ok("มี saveArchives แยก", /async function saveArchives\(env, out, diag\)/.test(src));
  ok("เรียกหลังรอบสอง", /await saveArchives\(env, archiveOut, arDiag\)/.test(src));
}

console.log("\n[6] จำลองการไหล: ของเก่าไม่มีธง → ถูกตรวจ · ของที่มีธง → ข้าม");
{
  const VFY_VER = 1;
  const sources = { alert1: { items: [
    { link: "https://a/1", title: "ซีพีเอฟ ลงทุน", vfy: 1 },          // ผ่านแล้ว มีธง
    { link: "https://a/2", title: "ตลาดหุ้นไทยปิดบวก" },              // ของเก่าจากคลัง ไม่มีธง
    { link: "https://a/3", title: "เอส แอนด์ พี คว้ารางวัล" },        // ของเก่าจากคลัง ไม่มีธง
  ] } };
  const un = sources.alert1.items.filter((it) => it.vfy !== VFY_VER);
  ok("ใบมีธงไม่ถูกตรวจซ้ำ (ไม่เปลืองของ)", un.length === 2 && !un.some((it) => it.vfy === VFY_VER));
  // สมมุติด่านตัดใบ 2 กับ 3 → ทั้งหน้าจอและคลังต้องเหลือใบเดียวกัน
  const cut = new Set(["a/2", "a/3"]);
  const norm = (l) => l.replace("https://", "");
  const archiveOut = { alert1: [...sources.alert1.items] };
  sources.alert1.items = sources.alert1.items.filter((it) => !cut.has(norm(it.link)));
  archiveOut.alert1 = archiveOut.alert1.filter((it) => !cut.has(norm(it.link)));
  ok("หน้าจอเหลือแต่ข่าวจริง", sources.alert1.items.length === 1 && sources.alert1.items[0].link === "https://a/1");
  ok("คลังก็เหลือเท่ากัน", archiveOut.alert1.length === 1 && archiveOut.alert1[0].link === "https://a/1");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
