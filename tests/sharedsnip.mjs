/* สรุปที่เป็นบล็อก "ข่าวที่เกี่ยวข้อง" ของเว็บ ไม่ใช่สรุปของข่าวใบนั้น
 *
 * 🎯 เจ้าของแจ้ง 21 ส.ค. 2026 (พร้อมภาพ): การ์ด 2 ใบในคอลัมน์ "หัวข้อที่จับตามอง"
 *    คนละข่าวกันสนิท แต่มีสรุปเหมือนกันเป๊ะ:
 *      "พี่ชายยืนยันน้องชายโดน ฮ.บินไล่ยิงจริง"   ← Workpoint
 *      "ปิดทางรถไฟนราธิวาส! มะรือโบ-ตันหยงมัส"    ← Workpoint
 *    ทั้งคู่มีสรุปว่า "ทช. สำรวจปลาหมอคางดำ 4 จังหวัด พบ 5 ตัว…"
 *
 * เสียหาย 2 ชั้น — อ่านแล้วสับสน + **ดูดข่าวคนละเรื่องเข้าคอลัมน์**
 * เพราะ mergeNewsIntoAlert ของ alert2 เทียบคำที่ "พาดหัว + สรุป"
 *
 * ⚠️ ตัวกรองเดิม looksLikeListing() จับไม่ได้ เพราะมันดูสัญญาณ "วันที่" ซึ่งบล็อกนี้ไม่มี
 */
import fs from "node:fs";
import { dropSharedSnippets } from "../functions/api/_lib/noise.js";
import { looksLikeListing } from "../functions/api/trend/_lib/parser.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra ? " → " + extra : "")); }
};

// สรุปจริงจากภาพที่เจ้าของส่งมา
const RELATED = "ทช. สำรวจปลาหมอคางดำ 4 จังหวัด พบ 5 ตัวในพื้นที่ปากแม่น้ำเจ้าพระยา–คลองขุนราชพินิจใจ. อาชญากรรม. 457 ...";

console.log("\n[1] เคสจริงจากภาพ — สรุปก้อนเดียวกันโผล่ 2 ข่าว");
{
  const sources = { news: { items: [
    { id: "1", link: "https://workpointtoday.com/a", title: "พี่ชายยืนยันน้องชายโดน ฮ.บินไล่ยิงจริง", snippet: RELATED },
    { id: "2", link: "https://workpointtoday.com/b", title: "ปิดทางรถไฟนราธิวาส! มะรือโบ-ตันหยงมัส", snippet: RELATED },
    { id: "3", link: "https://thairath.co.th/c", title: "กรมประมงเร่งกำจัดปลาหมอคางดำ",
      snippet: "กรมประมงเดินหน้ากำจัดปลาหมอคางดำในคลองสายหลัก 5 จังหวัด ตั้งเป้าลดจำนวนลงครึ่งหนึ่งภายในปีนี้" },
  ] } };
  const d = {};
  ok("ตัวกรองเดิมจับไม่ได้ (จึงต้องมีตัวใหม่)", !looksLikeListing(RELATED));
  dropSharedSnippets(sources, d);
  const [a, b, c] = sources.news.items;
  ok("ตัดสรุปปลอมของข่าวใบที่ 1", a.snippet === "" && a.sharedSnip === true);
  ok("ตัดสรุปปลอมของข่าวใบที่ 2", b.snippet === "" && b.sharedSnip === true);
  ok("สรุปจริงของข่าวที่เกี่ยวจริงต้องไม่ถูกแตะ", c.snippet.includes("กรมประมง") && !c.sharedSnip);
  ok("นับจำนวนที่ตัดไว้ให้ไล่ปัญหาได้", d.sharedSnippets === 2, String(d.sharedSnippets));
  ok("ไม่ได้ลบข่าวทิ้ง แค่ตัดสรุป", sources.news.items.length === 3);
}

console.log("\n[2] ห้ามตัดสรุปจริงทิ้ง");
{
  // ข่าวใบเดียวโผล่ 2 คอลัมน์ (News + alert) เป็นเรื่องปกติของแดชบอร์ดนี้
  // ⚠️ ถ้านับ "จำนวนใบ" แทน "จำนวนลิงก์" ข่าวปกติทุกใบจะถูกตัดสรุปทิ้งฟรีๆ
  const snip = "ซีพีเอฟ รายงานผลประกอบการครึ่งปีแรก 2569 รายได้ 283,883 ล้านบาท กำไรสุทธิ 8,951 ล้านบาท";
  const sources = {
    news: { items: [{ id: "x", link: "https://kaohoon.com/x", title: "CPF โชว์กำไร", snippet: snip }] },
    alert1: { items: [{ id: "x", link: "https://kaohoon.com/x?utm_source=g", title: "CPF โชว์กำไร", snippet: snip }] },
  };
  const d = {};
  dropSharedSnippets(sources, d);
  ok("ข่าวใบเดียวกันอยู่ 2 คอลัมน์ ไม่ถือว่าสรุปซ้ำ",
     sources.news.items[0].snippet === snip && sources.alert1.items[0].snippet === snip, String(d.sharedSnippets));

  // สรุปสั้นๆ ซ้ำกันได้โดยบังเอิญ ไม่ควรเหมาโดนตัด
  const s2 = { news: { items: [
    { id: "1", link: "https://a/1", title: "ข่าว 1", snippet: "อ่านต่อที่นี่" },
    { id: "2", link: "https://a/2", title: "ข่าว 2", snippet: "อ่านต่อที่นี่" },
  ] } };
  dropSharedSnippets(s2, {});
  ok("สรุปสั้นมากไม่เข้าเกณฑ์ (สั้นกว่า 30 ตัวอักษร)", s2.news.items[0].snippet === "อ่านต่อที่นี่");

  // ข่าวที่ไม่มีสรุปเลย ต้องไม่พัง
  const s3 = { news: { items: [{ id: "1", link: "https://a/1", title: "ไม่มีสรุป" }, { id: "2", link: "https://a/2", title: "ไม่มีสรุป 2", snippet: "" }] } };
  dropSharedSnippets(s3, {});
  ok("ข่าวที่ไม่มีสรุปไม่ทำให้พัง", s3.news.items.length === 2);
  ok("ไม่มี sources ก็ไม่พัง", dropSharedSnippets(null, {}) === 0 && dropSharedSnippets({}, {}) === 0);
}

console.log("\n[3] ต้องกวาดของเก่าที่ค้างในคลังด้วย");
{
  // ⚠️ verify/merge ทำงาน "ก่อน" ดึงของเก่าจาก KV — ของที่เก็บไว้ตั้งแต่ยังไม่มีกฎนี้
  //    ยังพกสรุปปลอมติดมา ถ้าไม่กวาดรอบสอง ต้องรอ 90 วันกว่าคลังจะหมดอายุ
  for (const f of ["trend", "ir"]) {
    const src = fs.readFileSync(new URL(`../functions/api/${f}/feeds.js`, import.meta.url), "utf8");
    const calls = [...src.matchAll(/dropSharedSnippets\(sources/g)].length;
    ok(`${f}: เรียกทั้งก่อน merge และหลังดึงของเก่าจากคลัง`, calls === 2, String(calls));

    const before = src.indexOf("dropSharedSnippets(sources");
    const merge = src.indexOf('mergeNewsIntoAlert(sources, "alert1"');
    ok(`${f}: รอบแรกต้องมาก่อน mergeNewsIntoAlert`, before !== -1 && merge > before);

    const after = src.lastIndexOf("dropSharedSnippets(sources");
    const prune = src.indexOf('pruneStaleMerged(sources, "alert1"');
    ok(`${f}: รอบสองต้องมาก่อน pruneStaleMerged (ไม่งั้นของเก่าไม่ถูกตัดออกจากคอลัมน์)`,
       after > merge && prune > after);
  }
}

console.log("\n[4] ตัดสรุปแล้วข่าวที่ถูกดูดผิดต้องหลุดออกจากคอลัมน์");
{
  // จำลอง mergeNewsIntoAlert + pruneStaleMerged ของ alert2 (เทียบที่ "พาดหัว + สรุป")
  const term = "ปลาหมอคางดำ";
  const matches = (it) => ((it.title || "") + " " + (it.snippet || "")).toLowerCase().includes(term);
  const items = [
    { id: "1", link: "https://workpointtoday.com/a", title: "พี่ชายยืนยันน้องชายโดน ฮ.บินไล่ยิงจริง", snippet: RELATED },
    { id: "2", link: "https://workpointtoday.com/b", title: "ปิดทางรถไฟนราธิวาส!", snippet: RELATED },
    { id: "3", link: "https://thairath.co.th/c", title: "ข่าวปลาหมอคางดำของจริง", snippet: "กรมประมงเร่งกำจัด" },
  ];
  ok("ก่อนแก้: ข่าวคนละเรื่องถูกดูดเข้าคอลัมน์ 3 ใบ", items.filter(matches).length === 3);

  dropSharedSnippets({ news: { items } }, {});
  const kept = items.filter(matches);
  ok("หลังแก้: เหลือเฉพาะข่าวที่เกี่ยวจริง", kept.length === 1 && kept[0].id === "3",
     JSON.stringify(kept.map((x) => x.id)));
}

console.log("\n" + (fail ? "❌ ตก" : "✅ ผ่านหมด") + " — ผ่าน " + pass + " · ตก " + fail + "\n");
process.exit(fail ? 1 : 0);
