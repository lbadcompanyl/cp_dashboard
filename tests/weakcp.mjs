// ชื่อเครือที่โผล่ "กลางคำอื่น" ต้องไม่ผ่านฟรี — ส่งให้ AI อ่านพาดหัวตัดสินก่อน
// เจ้าของแจ้ง 14 ส.ค. 2026: "คาราจีแนน ฟู้ดเจล อควา เอ็มซีพีไอ" (สารเคมี MCP) หลุดเข้าคอลัมน์ CP
// เพราะคำว่า `ซีพี` ซ่อนอยู่ใน `เอ็ม-ซีพี-ไอ`
import fs from "node:fs";
import { cpEvidence, realCP } from "../functions/api/_lib/noise.js";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

console.log("\n[1] แยก 'ชื่อเครือยืนเป็นคำ' ออกจาก 'ไปเจอกลางคำอื่น'");
const WEAK = [
  ["คาราจีแนน ฟู้ดเจล มือ อควา เอ็มซีพีไอ | สำนักงานคณะกรรมการกลางอิสลามแห่งประเทศไทย", "เคสจริงที่แจ้งมา"],
  ["สารเอ็มซีพีดี ในน้ำมันปาล์ม", "เอ็มซีพีดี ก็สารเคมี"],
];
for (const [t, why] of WEAK) ok(`weak: ${why}`, cpEvidence(t) === "weak", cpEvidence(t));

const STRONG = [
  "ซีพีเอฟ แจ้งผลประกอบการไตรมาส 2",
  "เครือซีพี ลงทุนเพิ่มในอีอีซี",
  "ซีพี ออลล์ เปิดสาขาใหม่ 100 แห่ง",
  "ซีพี แอ็กซ์ตร้า โชว์ผลงานครึ่งปีแรก",
  "ทรู คอร์ปอเรชั่น แจ้งผลประกอบการ",
  "ซีพีพีซี ลงทุนเพิ่ม",
  "ธนินท์ เจียรวนนท์ กล่าวปาฐกถา",
  "CP AXTRA เปิดตัว HAPPITAT",
  "แม็คโคร ขยายสาขา",
  "เซเว่น อีเลฟเว่น ปรับราคา",
];
for (const t of STRONG) ok(`strong: ${t.slice(0, 28)}`, cpEvidence(t) === "strong", cpEvidence(t));

const NONE = [
  "ยางปูพื้น พื้นไวนิล - Thaiwa-Plastic",
  "เพื่อนสุดเศร้า นักท่องเที่ยวถูกช้างเหยียบ",
  "ตลาดหุ้นไทยปิดบวก 1.74 จุด",
];
for (const t of NONE) ok(`ไม่เจอชื่อเครือ: ${t.slice(0, 26)}`, cpEvidence(t) === "", cpEvidence(t));

console.log("\n[2] ชื่อลวงยังถูกตัดออกก่อนเหมือนเดิม");
for (const t of ["ทรัมป์ ถูกฟ้องปมทรูธโซเชียล", "บีแอลซีพี แจ้งผล", "ซีพีเอ็น เปิดโครงการ",
                 "อะไรคือภาวะซีพีพีในเด็ก"]) {
  ok(`ชื่อลวง → ไม่นับว่าเจอ: ${t.slice(0, 24)}`, cpEvidence(t) === "", cpEvidence(t));
}
ok("แต่ ซีพีพีซี (บริษัทจริง) ยังนับ", cpEvidence("ซีพีพีซี ลงทุน") === "strong");

console.log("\n[3] เทียบกับของเดิม — realCP ตอบ true ทั้งคู่ ไม่แยก weak/strong (นี่คือรูรั่ว)");
ok("realCP มองว่าเอ็มซีพีไอ = ข่าวเครือ", realCP("อควา เอ็มซีพีไอ") === true);
ok("cpEvidence แยกออก", cpEvidence("อควา เอ็มซีพีไอ") === "weak");

console.log("\n[4] ต่อสายในโค้ดจริงทั้ง 2 แดชบอร์ด");
for (const [name, f] of [["trend", "../functions/api/trend/feeds.js"],
                         ["ir", "../functions/api/ir/feeds.js"]]) {
  const src = fs.readFileSync(new URL(f, import.meta.url), "utf8");
  console.log(`-- ${name} --`);
  ok("ชั้น 1 ใช้ cpEvidence ไม่ใช่ realCP ลอยๆ", /const ev = cpEvidence\(bare\);/.test(src));
  ok("strong = ผ่านเลย + ติดธง", /if \(ev === "strong"\) return \{ ok: true, mark: true \};/.test(src));
  ok("weak = ส่งให้ AI ตัดสิน", /if \(ev === "weak"\) return \{ ok: "ai", why: "ai-weak-cp"/.test(src));
  ok("แยกคิว AI ออกจากคิวอ่านเนื้อ", /const needAI = \[\]/.test(src));
  ok("AI ตอบไม่ได้ → เก็บไว้ ไม่ตัด", /if \(ans\[k\] === null\) \{ verdict\[i\]\.ok = true; return; \}/.test(src));
  ok("AI ว่าใช่ → ติดธง ไม่ต้องตรวจซ้ำ", /if \(ans\[k\]\) verdict\[i\]\.mark = true;/.test(src));
  ok("มีเพดานต่อ build", /const AI_CP_MAX = \d+;/.test(src));
  ok("เกินเพดาน = เก็บไว้ก่อน รอรอบหน้า", /needAI\.slice\(AI_CP_MAX\)\.forEach\(\(i\) => \{ verdict\[i\]\.ok = true; \}\)/.test(src));
  ok("ยังยิงเน็ตไม่ได้ = ไม่ตัด", /needAI\.forEach\(\(i\) => \{ verdict\[i\]\.ok = true; \}\)/.test(src));
  ok("จำคำตอบ AI ต่อข่าว 1 ใบ", /async function cachedHeadlineIsCP\(cache, env, titles, links, examples\)/.test(src));
  ok("จำไว้ 7 วัน", /max-age=604800/.test(src));
  ok("ใช้ edge cache ไม่ใช่ KV (โควตาเขียนมีจำกัด)",
     !/kv\.put\([^)]*cpai/.test(src) && (src.match(/kv\.put\(/g) || []).length <= 1);
  ok("สั่งตรวจของเก่าใหม่ทั้งคลัง (VFY_VER)", /const VFY_VER = \d+;/.test(src)); // ⚠️ ห้ามตรึงเลข — ตัวเลขนี้ถูกบวกทุกครั้งที่แก้ด่านตรวจ
}

console.log("\n[5] ตรรกะแคช — ถามครั้งเดียวต่อข่าว 1 ใบ");
{
  // จำลอง cache + นับจำนวนครั้งที่ถาม AI จริง
  const store = new Map();
  const cache = {
    match: async (req) => store.get(req.url) || undefined,
    // cache จริงคืน Response ใบใหม่ทุกครั้งที่ match — ของปลอมต้องเก็บ "ค่า" ไม่ใช่ตัว Response
    put: async (req, res) => { const body = await res.text(); store.set(req.url, { json: async () => JSON.parse(body) }); },
  };
  let asked = 0;
  const aiHeadlineIsCP = async (env, titles) => { asked += titles.length; return titles.map((t) => t.includes("ซีพีเอฟ")); };
  async function cachedHeadlineIsCP(cache, env, titles, links, examples) {
    const out = new Array(titles.length).fill(null);
    const keyOf = (l) => ({ url: "https://verify.local/cpai1?u=" + encodeURIComponent(l || "") });
    const ask = [];
    await Promise.all(titles.map(async (_, k) => {
      const hit = await cache.match(keyOf(links[k]));
      if (hit) { const j = await hit.json(); if (typeof j.y === "boolean") { out[k] = j.y; return; } }
      ask.push(k);
    }));
    if (ask.length) {
      const ans = await aiHeadlineIsCP(env, ask.map((k) => titles[k]), examples);
      if (ans) await Promise.all(ask.map(async (k, j) => {
        out[k] = ans[j];
        await cache.put(keyOf(links[k]), new Response(JSON.stringify({ y: ans[j] })));
      }));
    }
    return out;
  }
  const T = ["อควา เอ็มซีพีไอ", "ซีพีเอฟ แจ้งผล"], L = ["https://a/1", "https://a/2"];
  const r1 = await cachedHeadlineIsCP(cache, {}, T, L, []);
  ok("รอบแรกถาม AI 2 ใบ", asked === 2, String(asked));
  ok("ตอบถูกตามที่ AI ว่า", JSON.stringify(r1) === "[false,true]", JSON.stringify(r1));
  const r2 = await cachedHeadlineIsCP(cache, {}, T, L, []);
  ok("รอบสองไม่ถามซ้ำเลย", asked === 2, String(asked));
  ok("ได้คำตอบเดิมจากที่จำไว้", JSON.stringify(r2) === "[false,true]", JSON.stringify(r2));
  const r3 = await cachedHeadlineIsCP(cache, {}, [...T, "ข่าวใหม่ ซีพีเอฟ"], [...L, "https://a/3"], []);
  ok("มีใบใหม่ ถามเฉพาะใบใหม่", asked === 3, String(asked));
  ok("ใบใหม่ได้คำตอบ", r3[2] === true);
}

console.log("\n[6] หน้า admin แปลเหตุผลใหม่แล้ว");
{
  const admin = fs.readFileSync(new URL("../admin/app.js", import.meta.url), "utf8");
  ok("WHY_TH มี ai-weak-cp", /"ai-weak-cp":/.test(admin));
  ok("อธิบายเป็นภาษาคน ไม่ใช่รหัสดิบ", /ชื่อเครือโผล่กลางคำอื่น/.test(admin));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
