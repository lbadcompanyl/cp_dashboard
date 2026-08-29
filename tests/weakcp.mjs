// ชื่อเครือที่โผล่ "กลางคำอื่น" ต้องไม่ผ่านฟรี — ส่งให้ AI อ่านพาดหัวตัดสินก่อน
// เจ้าของแจ้ง 14 ส.ค. 2026: "คาราจีแนน ฟู้ดเจล อควา เอ็มซีพีไอ" (สารเคมี MCP) หลุดเข้าคอลัมน์ CP
// เพราะคำว่า `ซีพี` ซ่อนอยู่ใน `เอ็ม-ซีพี-ไอ`
import fs from "node:fs";
import { cpEvidence, realCP, noiseReason } from "../functions/api/_lib/noise.js";

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

// ─────────────────────────────────────────────────────────────────────────────
// [7] `CP` เดี่ยวๆ — ข่าวที่เขียนชื่อเครือเป็นอังกฤษล้วนต้องไม่หายเงียบ
// เจอจริง 20 ส.ค. 2026: "รับมือเลิกสัญญาไฮสปีด CP" ของกรุงเทพธุรกิจ ถูกตัดด้วยเหตุผล
// "ไม่มีชื่อเครือ CP ในพาดหัว" ทั้งที่คำว่า CP อยู่ในพาดหัว — เพราะลิสต์ไม่มี `cp` เดี่ยว
// ⚠️ ต้องเป็น weak (ให้ AI ตัดสิน) ไม่ใช่ strong — CP เป็นตัวย่อของอย่างอื่นเยอะมาก
console.log("\n[7] `CP` เดี่ยวๆ = weak (ให้ AI ตัดสิน) ไม่ใช่ตัดทิ้ง ไม่ใช่ปล่อยผ่าน");
{
  const ev = (t) => cpEvidence(t);
  // 🔄 **เปลี่ยนจาก weak เป็น strong เมื่อ 27 ส.ค. 2026** (ดูข้อ [8])
  //    ใบนี้มีทั้ง "ไฮสปีด" และ "แอร์พอร์ตเรลลิงก์" ซึ่งเป็นบริบทของเครือชัดเจน
  //    ของเดิมส่งให้ AI ตัดสิน แล้ว AI ตอบผิดจนข่าวจริงถูกตัดทิ้ง (เจ้าของส่งภาพมา)
  ok("ไฮสปีด CP + บริบทของเครือ = เชื่อได้เลย ไม่ต้องรอ AI",
     ev("เปิดแผน รฟฟท.บริหาร 'แอร์พอร์ตเรลลิงก์' รับมือเลิกสัญญาไฮสปีด CP") === "strong");
  ok("CP เดี่ยวห้ามผ่านฟรี (ยังเป็นตัวย่อของอย่างอื่นได้)",
     ev("ผู้ป่วยโรค CP สมองพิการ") === "weak");
  ok("ชื่อเต็มยังผ่านฟรีเหมือนเดิม", ev("CP AXTRA ทุ่ม 15,000 ล้าน") === "strong");
  ok("เครือซีพี ยังผ่านฟรีเหมือนเดิม", ev("เครือซีพี ผนึกปิดทองหลังพระฯ") === "strong");

  // คำละตินต้องตรงทั้งคำ — บทเรียนเดิมกับ SLAPP → slapped
  ok("CPU ไม่ใช่ชื่อเครือ", ev("ซื้อ CPU รุ่นใหม่ ราคาถูก") === "");
  ok("CP3 (คริส พอล) ไม่ใช่ชื่อเครือ", ev("เทียบสเปค CP3 คริส พอล") === "");
  ok("CPI ไม่ใช่ชื่อเครือ", ev("เงินเฟ้อ CPI เดือนล่าสุด") === "");
  ok("cpfresh เป็นแบรนด์จริงของเครือ", ev("ทุเรียนแห่งชาติ CPFresh") === "strong");
  ok("แต่ CPFreshMart ที่ยาวออกไปไม่นับ", ev("ทุเรียน CPFreshMart") === "");

  // ชื่อลวงต้องถูกตัดก่อนเสมอ ไม่ให้ `cp` เดี่ยวไปเจอเศษที่เหลือ
  ok("BLCP ยังไม่ใช่เครือ", ev("BLCP Power แจ้งผลประกอบการ") === "");
  ok("CPN ยังไม่ใช่เครือ", ev("CPN เปิดศูนย์การค้าใหม่") === "");
  ok("ทรูธโซเชียลยังไม่ใช่เครือ", ev("Trump Media ขาดทุนหนัก ทรูธโซเชียล") === "");
}

console.log("\n[6] หน้า admin แปลเหตุผลใหม่แล้ว");
{
  const admin = fs.readFileSync(new URL("../admin/app.js", import.meta.url), "utf8");
  ok("WHY_TH มี ai-weak-cp", /"ai-weak-cp":/.test(admin));
  ok("อธิบายเป็นภาษาคน ไม่ใช่รหัสดิบ", /ชื่อเครือโผล่กลางคำอื่น/.test(admin));
}

/* ─────────── [8] เคสจริงจากหน้า /admin/ ที่เจ้าของส่งภาพมา 27 ส.ค. 2026 ─────────── */
console.log("\n[8] 🐞 ข่าวของเครือถูกตัดผิด 2 แบบ (เจ้าของส่งภาพจาก /admin/ มา)");
{
  // 🐞 แบบที่ 1 — ชื่อเครือเขียนแบบมีจุด "C.P. Group" แล้วลิสต์จับไม่ได้เลย
  //    ถูกตัดด้วยเหตุผล "อ่านเนื้อข่าวแล้วไม่มีชื่อเครือ CP" ทั้งที่ชื่ออยู่ในพาดหัวเต็มๆ
  for (const t of [
    "เจาะเบื้องหลังความร่วมมือ C.P. Group x Arise Venture x True x Amazon: ก้าวต่อไปที่ไทยต้อง",
    "ซี.พี. ออลล์ เปิดสาขาใหม่ 100 แห่ง",
    "ซี.พี.เอฟ แจ้งผลประกอบการไตรมาส 2",
  ]) ok(`ชื่อเครือแบบมีจุดต้องผ่านฟรี: ${t.slice(0, 28)}`, cpEvidence(t) === "strong", cpEvidence(t) || "(ไม่เจอ)");

  // 🐞 แบบที่ 2 — "CP" เดี่ยวๆ ในบริบทที่เป็นของเครือชัดเจน แต่ AI ตัดสินว่าไม่ใช่แล้วตัดทิ้ง
  //    ให้บริบทยืนยันแทน ไม่ต้องรอ AI เดา
  for (const t of [
    "รฟท.นัดถก CP พรุ่งนี้ ชี้ขาด 'ไฮสปีดเทรน 3 สนามบิน' หยุดเดินรถแอร์พอร์ตลิงก์",
    "CP ยืนยันเดินหน้าไฮสปีดเทรน 3 สนามบิน",
  ]) ok(`CP + บริบทของเครือ = เชื่อได้เลย: ${t.slice(0, 26)}`, cpEvidence(t) === "strong", cpEvidence(t) || "(ไม่เจอ)");

  // ⚠️ บริบทลอยๆ ที่ไม่มี CP ต้องไม่ถูกดึงเข้ามา — ไม่งั้นข่าวสนามบินทั้งหมดไหลเข้าคอลัมน์ CP
  for (const t of [
    "สุวรรณภูมิ แจ้งปิดเบี่ยงจราจรทางเข้า-ออก เริ่ม 31 ส.ค. แนะใช้แอร์พอร์ตลิงก์",
    "รฟท.เปิดเดินรถไฟสายใหม่",
  ]) ok(`บริบทลอยๆ ไม่มี CP = ไม่นับ: ${t.slice(0, 26)}`, cpEvidence(t) === "", cpEvidence(t) || "(ไม่เจอ)");

  // ⚠️ ของที่เคยกันไว้ต้องยังกันอยู่ — การตัดจุดต้องไม่ทำให้ชื่อลวงหลุด
  for (const t of [
    "ซี.พี.เอ็น เปิดโครงการใหม่",
    "บี.แอล.ซี.พี. แจ้งผลประกอบการ",
    "CPU รุ่นใหม่ของ Intel",
    "ฝุ่น PM 2.5 เชียงใหม่พุ่งสูง",
  ]) ok(`ยังกันของเดิมไว้ได้: ${t.slice(0, 26)}`, cpEvidence(t) === "", cpEvidence(t) || "(ไม่เจอ)");
}

/* ─────────── [9] 🌫️ หน้ารายงานค่าฝุ่นของท้องถิ่น ไม่ใช่ข่าว ─────────── */
console.log("\n[9] 🌫️ หน้ารายงานค่าฝุ่นของเทศบาล/อบต. — ตัดทิ้ง แต่ห้ามโดนข่าวจริง");
{
  const drop = (t) => noiseReason({ link: "https://example.com/x", title: t }, t, "alert2") === "dustpage";
  ok("ตัด: รายงานสถานการณ์ PM 2.5 - เทศบาล เมือง ปู่เจ้าสมิงพราย",
    drop("รายงานสถานการณ์ PM 2.5 - เทศบาล เมือง ปู่เจ้าสมิงพราย"));
  ok("ตัด: รายงานสถานการณ์ฝุ่น PM2.5 อบต.บางพลี", drop("รายงานสถานการณ์ฝุ่น PM2.5 อบต.บางพลี"));
  // 🚫 ข่าวจริงห้ามโดน — ต้องครบทั้ง "ขึ้นต้นว่ารายงานสถานการณ์" และ "มีชื่อหน่วยงานท้องถิ่น"
  ok("เก็บ: รายงานสถานการณ์ PM 2.5 เชียงใหม่วิกฤต ค่าฝุ่นพุ่งสูงสุดในรอบปี",
    !drop("รายงานสถานการณ์ PM 2.5 เชียงใหม่วิกฤต ค่าฝุ่นพุ่งสูงสุดในรอบปี"));
  ok("เก็บ: เทศบาลนครเชียงใหม่เร่งแก้ปัญหาฝุ่น PM 2.5", !drop("เทศบาลนครเชียงใหม่เร่งแก้ปัญหาฝุ่น PM 2.5"));
  ok("เก็บ: ฝุ่น PM 2.5 กทม. เกินมาตรฐาน 30 เขต", !drop("ฝุ่น PM 2.5 กทม. เกินมาตรฐาน 30 เขต"));

  // ⚠️ เพิ่มเหตุผลใหม่ทีไร ต้องเติมคำแปลใน WHY_TH ของ /admin/ ด้วยเสมอ ไม่งั้นเจ้าของเห็นรหัสดิบ
  const adm = fs.readFileSync(new URL("../admin/app.js", import.meta.url), "utf8");
  ok("หน้า admin แปลเหตุผล dustpage เป็นภาษาคนแล้ว", /dustpage:\s*"[^"]*[ก-๙]/.test(adm));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
