// ทดสอบการจัดหมวด/ดันขึ้นบนของคอลัมน์ Google Trends
// ดึงบล็อกจริงออกจากไฟล์มารัน ไม่ก๊อปโค้ดมาเขียนซ้ำ (ก๊อปแล้วเทสต์จะผ่านทั้งที่ของจริงพัง)
import fs from "node:fs";

const FILES = ["../trend/app.js", "../issue/app.js"];

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log("  ✅ " + n); } else { fail++; console.log("  ❌ " + n + (x ? "\n       " + x : "")); } };

async function loadFrom(file) {
  const src = fs.readFileSync(file, "utf8");
  const grab = (re, name) => { const m = src.match(re); if (!m) throw new Error(`${file}: หาไม่เจอ ${name}`); return m[0]; };
  const block =
    grab(/^const PIN_FALSE_RE = .*$/m, "PIN_FALSE_RE") + "\n" +
    grab(/^const PIN_CP_RE = .*$/m, "PIN_CP_RE") + "\n" +
    grab(/^const PIN_FOOD_STRONG_RE = .*$/m, "PIN_FOOD_STRONG_RE") + "\n" +
    grab(/^const PIN_FOOD_AMBIG_RE = .*$/m, "PIN_FOOD_AMBIG_RE") + "\n" +
    grab(/^const PIN_FOOD_CTX_RE = .*$/m, "PIN_FOOD_CTX_RE") + "\n" +
    grab(/^const PIN_FOOD_BRAND_RE = .*$/m, "PIN_FOOD_BRAND_RE") + "\n" +
    grab(/^const TREND_CATS = \{[\s\S]*?^\};$/m, "TREND_CATS") + "\n" +
    grab(/^const FOOD_CAT = .*$/m, "FOOD_CAT") + "\n" +
    grab(/^function pinScore\(it\) \{[\s\S]*?^\}$/m, "pinScore") + "\n" +
    "export { pinScore, TREND_CATS, FOOD_CAT };";
  return import("data:text/javascript;charset=utf-8," + encodeURIComponent(block));
}

// ---- ด่านแรก: ทั้งสองไฟล์ต้องมีของครบ ----
// เคยพลาดมาแล้ว: sync ข้ามไฟล์ด้วย regex แล้วตัด pinScore หายไปทั้งฟังก์ชัน
// node --check ยังผ่านเพราะ syntax ถูก แต่หน้าเว็บพังตอนรันจริง
console.log("\n[0] ทั้ง trend/ และ issue/ ต้องมีของครบและตรงกัน");
const NEED = ["PIN_FALSE_RE", "PIN_CP_RE", "PIN_FOOD_STRONG_RE", "PIN_FOOD_AMBIG_RE", "PIN_FOOD_CTX_RE", "PIN_FOOD_BRAND_RE", "TREND_CATS", "FOOD_CAT", "pinScore"];
for (const f of FILES) {
  const src = fs.readFileSync(f, "utf8");
  const missing = NEED.filter((n) => !new RegExp(`^(const|function) ${n}\\b`, "m").test(src));
  ok(`${f.split("/").slice(-2).join("/")} ประกาศครบ`, missing.length === 0, "ขาด: " + missing.join(", "));
  // ทุกชื่อที่ renderTrends เรียกใช้ ต้องมีประกาศอยู่จริงในไฟล์เดียวกัน
  const render = src.match(/^function renderTrends[\s\S]*?\n^\}$/m);
  ok(`${f.split("/").slice(-2).join("/")} renderTrends เรียกของที่มีอยู่จริง`,
     !!render && ["pinScore"].every((n) => new RegExp(`^(const|function) ${n}\\b`, "m").test(src)));
  // เจ้าของสั่งเอาป้ายหมวดออกจากการ์ด — ต้องไม่กลับมาโดยไม่ตั้งใจ
  ok(`${f.split("/").slice(-2).join("/")} การ์ดไม่มีป้ายหมวดแล้ว`,
     !/tcat|trendCatLabel/.test(src), "ยังเจอ tcat / trendCatLabel");
}

const A = await loadFrom(FILES[0]);
const B = await loadFrom(FILES[1]);
ok("ตรรกะสองไฟล์ให้ผลตรงกัน",
   [{ title: "starbucks", snippet: "", related: [], topics: [5] },
    { title: "ซีพีเอฟ", snippet: "", related: [] },
    { title: "liverpool", snippet: "", related: [], topics: [17] }]
     .every((it) => A.pinScore(it) === B.pinScore(it)));

const { pinScore, TREND_CATS, FOOD_CAT } = A;

console.log("\n[1] เคสจริงที่เจ้าของเจอ — ห้ามไฮไลต์ของที่ไม่ใช่อาหารและไม่ใช่ CP");
// ⚠️ ทั้งสามอันนี้ Google ติดเลขหมวดมาให้ และเลขนั้นเคยพาให้ไฮไลต์ผิดมาแล้วทั้งคู่
// (เลข 5 ดันดารา · เลข 6 ดันบอลกับหวย) — ถ้าวันหนึ่งมีคนเอา it.topics กลับมาใช้ เทสต์นี้จะตก
ok("ดารา (พัชราภา ไชยเชื้อ) ไม่ถูกไฮไลต์",
   pinScore({ title: "พัชราภา ไชยเชื้อ", snippet: "", related: [], topics: [5] }) === 0);
ok("ฟุตบอล (ปาแลร์โม่ พบ ยูเวนตุส) ไม่ถูกไฮไลต์",
   pinScore({ title: "ปาแลร์โม่ พบ ยูเวนตุส", snippet: "ยูเวนตุส", related: [], topics: [6] }) === 0);
ok("หวยลาว ไม่ถูกไฮไลต์",
   pinScore({ title: "หวยลาว11/8/69", snippet: "หวยลาววันนี้ · หวยลาว", related: [], topics: [6] }) === 0);
ok("apple iphone 18 ไม่ถูกไฮไลต์",
   pinScore({ title: "apple iphone 18", snippet: "", related: [], topics: [18] }) === 0);
ok("สุขสันต์วันแม่ ไม่ถูกไฮไลต์",
   pinScore({ title: "สุขสันต์วันแม่", snippet: "อวยพรวันแม่ · คำอวยพรวันแม่ 2569", related: [], topics: [12] }) === 0);

console.log("\n[2] แบรนด์อาหารที่ในชื่อไม่มีคำว่าอาหาร — ต้องไล่ชื่อเอง");
ok("starbucks → ดันขึ้น", pinScore({ title: "starbucks", snippet: "", related: [], topics: [] }) === 1);
ok("บอนชอน → ดันขึ้น", pinScore({ title: "บอนชอน สาขาใหม่", snippet: "", related: [] }) === 1);
ok("มิกซู → ดันขึ้น", pinScore({ title: "mixue", snippet: "", related: [] }) === 1);
ok("เลขหมวดของ Google ไม่มีผลกับการไฮไลต์แล้ว",
   pinScore({ title: "zzyzx corp", snippet: "", related: [], topics: [6] }) ===
   pinScore({ title: "zzyzx corp", snippet: "", related: [], topics: [] }));
ok("คำที่เป็นชื่อเล่นคนดัง ไม่ถูกเหมาว่าเป็นอาหาร",
   pinScore({ title: "เบียร์ เดอะวอยซ์", snippet: "", related: [] }) === 0);

console.log("\n[3] คำอาหารทั่วไป — และคำที่ดูคล้ายแต่ไม่ใช่");
ok("ทุเรียน → 1", pinScore({ title: "ทุเรียน", snippet: "", related: [] }) === 1);
ok("ราคาหมูหน้าฟาร์ม → 1", pinScore({ title: "ราคาหมูหน้าฟาร์ม", snippet: "", related: [] }) === 1);
ok("หมู่บ้านจัดสรร ไม่ใช่อาหาร", pinScore({ title: "หมู่บ้านจัดสรร", snippet: "", related: [] }) === 0);
ok("เนื้อหาบทเรียน ไม่ใช่อาหาร", pinScore({ title: "เนื้อหาบทเรียน", snippet: "", related: [] }) === 0);
ok("มี topics มาด้วยก็ไม่เปลี่ยนผล", pinScore({ title: "ทุเรียน", snippet: "", related: [], topics: [17] }) === 1);

console.log("\n[4] เครือ CP มาก่อนเสมอ (Google ไม่มีหมวดนี้ ต้องดูชื่อเอง)");
ok("ซีพีเอฟ + มีเลขหมวดมาด้วย → ยังได้ 2", pinScore({ title: "ซีพีเอฟ", snippet: "", related: [], topics: [5] }) === 2);
ok("ซีพีเอฟ + เลขหมวดอื่น → ยังได้ 2", pinScore({ title: "ซีพีเอฟ", snippet: "", related: [], topics: [3] }) === 2);
ok("เซเว่น → 2", pinScore({ title: "เซเว่น", snippet: "", related: [] }) === 2);
ok("ชื่อลวง บีซีพีจี ไม่ถูกนับเป็น CP", pinScore({ title: "บีซีพีจี", snippet: "", related: [] }) !== 2);

console.log("\n[5] เลขหมวดต้องเป็นชุดของ Google จริง — เรียงตามตัวอักษรอังกฤษ 1-19");
// ⚠️ ที่ต้องคุมไว้: ของเดิมมีคนพิมพ์ตารางเองแล้ว "ข้าม Climate" เลข 4-11 เลยเลื่อนหมด
// ผิดแบบไม่มี error อะไรเลย รู้ตัวก็ต่อเมื่อเห็นดาราขึ้นไฮไลต์เป็นเรื่องอาหาร
const GOOGLE_ORDER = ["Autos and Vehicles","Beauty and Fashion","Business and Finance","Climate",
  "Entertainment","Food and Drink","Games","Health","Hobbies and Leisure","Jobs and Education",
  "Law and Government","Other","Pets and Animals","Politics","Science","Shopping","Sports",
  "Technology","Travel and Transportation"];
const TH = { "Autos and Vehicles":"🚗 ยานยนต์","Beauty and Fashion":"💄 ความงาม/แฟชั่น",
  "Business and Finance":"💼 ธุรกิจ/การเงิน","Climate":"🌍 สิ่งแวดล้อม","Entertainment":"🎬 บันเทิง",
  "Food and Drink":"🍔 อาหาร/เครื่องดื่ม","Games":"🎮 เกม","Health":"🩺 สุขภาพ",
  "Hobbies and Leisure":"🎨 งานอดิเรก","Jobs and Education":"🎓 งาน/การศึกษา",
  "Law and Government":"⚖️ กฎหมาย/ราชการ","Other":"📦 อื่นๆ","Pets and Animals":"🐾 สัตว์เลี้ยง",
  "Politics":"🏛️ การเมือง","Science":"🔬 วิทยาศาสตร์","Shopping":"🛍️ ช้อปปิ้ง","Sports":"⚽ กีฬา",
  "Technology":"💻 เทคโนโลยี","Travel and Transportation":"✈️ ท่องเที่ยว" };
ok("มีครบ 19 หมวด ไม่ขาดไม่เกิน", Object.keys(TREND_CATS).length === 19, JSON.stringify(Object.keys(TREND_CATS)));
GOOGLE_ORDER.forEach((en, i) => {
  ok(`${i + 1} = ${en}`, TREND_CATS[i + 1] === TH[en], `ได้ ${TREND_CATS[i + 1]}`);
});
ok("FOOD_CAT ชี้ไปที่ Food and Drink (6)", FOOD_CAT === 6 && TREND_CATS[FOOD_CAT] === "🍔 อาหาร/เครื่องดื่ม", String(FOOD_CAT));
ok("ฝั่งเซิร์ฟเวอร์รับครบทุกหมวดที่ dropdown มี", (() => {
  const js = fs.readFileSync(new URL("../functions/api/trend/trending.js", import.meta.url), "utf8");
  const m = js.match(/const VALID_CATS = \[([^\]]+)\]/);
  if (!m) return false;
  const valid = m[1].split(",").map((x) => +x.trim());
  return Object.keys(TREND_CATS).every((k) => valid.includes(+k)) && valid.includes(0);
})());
ok("ทั้งสองไฟล์ใช้ตารางเดียวกัน", JSON.stringify(A.TREND_CATS) === JSON.stringify(B.TREND_CATS) && A.FOOD_CAT === B.FOOD_CAT);

// dropdown ในหน้า HTML ต้องตรงกับตารางในโค้ดทุกตัว — เคยหลุด: แก้ตารางแล้วลืมแก้ HTML
// ผลคือ "เกม" ในหน้าเว็บส่งเลข 6 ซึ่งโค้ดแปลว่า "อาหาร" → เลือกเกมแล้วไฮไลต์ทุกแถว (13 ส.ค. 2026)
console.log("\n[5b] dropdown ใน HTML ต้องตรงกับ TREND_CATS");
for (const page of ["../trend/index.html", "../issue/index.html"]) {
  const html = fs.readFileSync(page, "utf8");
  const sel = html.match(/<select[^>]*data-cat[^>]*>([\s\S]*?)<\/select>/);
  ok(`${page.split("/").slice(-2)[0]}: มี dropdown หมวด`, !!sel, "ไม่เจอ");
  if (!sel) continue;
  const opts = [...sel[1].matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)];
  ok("มี option อย่างน้อย 10 อัน", opts.length >= 10, String(opts.length));
  for (const [, v, label] of opts) {
    if (v === "0") { ok(`0 = ทุกหมวด`, /ทุกหมวด/.test(label), label); continue; }
    ok(`${v} = ${label.trim()}`, TREND_CATS[+v] === label.trim(), `ตารางบอก ${TREND_CATS[+v]}`);
  }
}

console.log("\n[5c] คำอาหารที่กำกวม ต้องมีบริบทหนุน (เจ้าของแจ้ง 14 ส.ค. 2026)");
{
  const S = (t, related = []) => pinScore({ title: t, snippet: "", related, topics: [] });
  // เคสจริง: "ดูสนุกเกอร์สด" ถูกไฮไลต์เป็นอาหาร
  ok("สนุกเกอร์ + ถ่ายทอดสด → ไม่ใช่อาหาร",
     S("ดูสนุกเกอร์สด", ["ถ่ายทอดสดสนุกเกอร์", "หมู ปากน้ำ", "ผลสนุกเกอร์"]) === 0);
  // คำบริบทต้องไม่ไปซ่อนในคำอื่น — บทเรียนเดิมของโปรเจกต์นี้
  ok('"ทอด" ที่ซ่อนใน ถ่ายทอด ไม่นับเป็นบริบทอาหาร', S("ถ่ายทอดสดไก่ชน") === 0);
  ok('"นึ่ง" ที่ซ่อนใน หนึ่ง ไม่นับ', S("หนึ่งในสิบ ข้าวสาร") === 0);
  ok('"ย่าง" ที่ซ่อนใน อย่าง ไม่นับ', S("อย่างไรก็ตาม เนื้อหาข่าว") === 0);
  ok("ตลาดหุ้น ไม่ใช่บริบทอาหาร", S("ตลาดหุ้นไทย ปลาย ปี") === 0);
  // ของจริงต้องยังติด
  ok("ราคาหมู → อาหาร", S("ราคาหมูวันนี้") === 1);
  ok("ไข่ไก่ + ราคา → อาหาร", S("ไข่ไก่ขึ้นราคา") === 1);
  ok("กุ้ง + ส่งออก → อาหาร", S("ส่งออกกุ้งไทยโต") === 1);
  ok("หมู + ร้านอาหาร → อาหาร", S("หมูเด้ง", ["ร้านอาหารหมู"]) === 1);
  // คำที่ชัดอยู่แล้ว ไม่ต้องมีบริบท
  ok("บุฟเฟ่ต์ คำเดียวพอ", S("บุฟเฟ่ต์ชาบู") === 1);
  ok("ทุเรียน คำเดียวพอ", S("ทุเรียนหมอนทอง") === 1);
  ok("แบรนด์อาหาร คำเดียวพอ", S("starbucks") === 1);
  ok("เครือ CP มาก่อนอาหาร", S("ซีพีเอฟ แจ้งผล") === 2);
}

console.log("\n[6] เรียงจริงเหมือนในหน้าเว็บ (sort เสถียร — ลำดับ Google คงอยู่ในกลุ่มเดียวกัน)");
const feed = [
  { title: "อาร์เซนอล พบ เรอัล เบติส", snippet: "", related: [], topics: [16] },
  { title: "ติวเตอร์ที่รัก ep 14", snippet: "ช่องวันออนไลน์", related: [], topics: [5] },
  { title: "starbucks", snippet: "", related: [], topics: [6] },
  { title: "kit connor", snippet: "", related: [], topics: [5] },
  { title: "ซีพีเอฟ", snippet: "", related: [], topics: [3] },
];
feed.forEach((it) => { it._pin = pinScore(it); });
feed.sort((a, b) => b._pin - a._pin);
const order = feed.map((f) => f.title);
ok("ซีพีเอฟ อันดับ 1", order[0] === "ซีพีเอฟ", JSON.stringify(order));
ok("starbucks อันดับ 2", order[1] === "starbucks", JSON.stringify(order));
ok("ที่เหลือคงลำดับเดิมของ Google",
   JSON.stringify(order.slice(2)) === JSON.stringify(["อาร์เซนอล พบ เรอัล เบติส", "ติวเตอร์ที่รัก ep 14", "kit connor"]),
   JSON.stringify(order));

console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
