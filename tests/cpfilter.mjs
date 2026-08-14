// 1) ชื่อลวง (ทรูธโซเชียล) ต้องถูกตัดทุกด่าน รวมถึงของเก่าที่ไหลกลับมาจาก KV
// 2) ชิพ CPF ต้องจับแค่ "ซีพีเอฟ" กับ "cpf" ตรงทั้งคำ — ห้ามไปจับ CPFresh
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const LIB = "../functions/api/_lib/noise.js";
const { noiseReason, setAllowed, setBlocked, dropFalseCP, realCP } = await import(LIB);
setAllowed({}); setBlocked({});

// พาดหัวจริงที่เจ้าของแจ้ง (คอลัมน์ 🔔 CP / ซีพี ของ IR)
const TRUMP = "งานงอกอีก! ทรัมป์ ถูกฟ้องปมขายสิทธิ์ เข้าถึงโพสต์ทรูธโซเชียลก่อนใคร สูงถึงเดือนละ 3.3 ล้านบาท";
const why = (title, snippet = "", src = "alert1") =>
  noiseReason({ link: "https://www.matichon.co.th/news/1", title, snippet }, title.toLowerCase(), src);

console.log("\n[1] ข่าวทรัมป์/ทรูธโซเชียล — คอลัมน์ CP ต้องตัด");
ok("ตัดตั้งแต่ noiseReason (ด่านที่กวาดของเก่าจาก KV ด้วย)", why(TRUMP) === "false-cp", String(why(TRUMP)));
ok("สรุปที่พ่วงมาก็ไม่ช่วยให้รอด", why(TRUMP, "ทรัมป์ ถูกฟ้องปมขายสิทธิ เข้าถึงโพสต์ทรูธโซเชียล") === "false-cp");
ok("truth social ภาษาอังกฤษก็ตัด", why("Trump sued over Truth Social post access") === "false-cp");
ok("Trump Media ก็ตัด", why("Trump Media reports quarterly loss") === "false-cp");

console.log("\n[2] ข่าวจริงของเครือต้องไม่โดนตัดไปด้วย");
ok("ทรู คอร์ปอเรชั่น ยังอยู่", why("ทรู คอร์ปอเรชั่น แจ้งผลประกอบการไตรมาส 2") === null, String(why("ทรู คอร์ปอเรชั่น แจ้งผลประกอบการไตรมาส 2")));
ok("มีทั้งชื่อจริงและชื่อลวงในพาดหัว → เก็บ",
   why("ศุภชัย เจียรวนนท์ พูดที่ทรูดิจิทัล พาร์ค") === null, String(why("ศุภชัย เจียรวนนท์ พูดที่ทรูดิจิทัล พาร์ค")));
ok("CP AXTRA ยังอยู่", why("CP AXTRA เปิดตัว HAPPITAT ชูโมเดลใหม่โลกรีเทล") === null);
ok("คอลัมน์อื่น (alert2) ไม่โดนกฎชื่อลวง", why(TRUMP, "", "alert2") === null, String(why(TRUMP, "", "alert2")));

console.log("\n[3] ด่านอ่านเนื้อข่าว — ต้องตัดชื่อลวงออกก่อนหา");
{
  // เนื้อข่าวทรัมป์เอ่ย "ทรูธโซเชียล" ทั้งบทความ ถ้าไม่ตัดออกก่อน body.includes("ทรู") จะจริงตลอด
  const body = "ทรัมป์ ถูกฟ้อง กรณีขายสิทธิ์เข้าถึงโพสต์บนทรูธโซเชียล ก่อนใคร โดยทรูธโซเชียลเป็นแพลตฟอร์มของเขาเอง";
  ok("เนื้อข่าวที่มีแต่ชื่อลวง → หาไม่เจอชื่อเครือ", !dropFalseCP(body).includes("ทรู"), dropFalseCP(body));
  const real = "ทรู คอร์ปอเรชั่น ประกาศผลประกอบการ พร้อมกล่าวถึงทรูธโซเชียลของทรัมป์";
  ok("เนื้อข่าวที่มีชื่อจริงด้วย → ยังหาเจอ", dropFalseCP(real).includes("ทรู"), dropFalseCP(real));
  for (const [name, f] of [["trend", "../functions/api/trend/feeds.js"], ["ir", "../functions/api/ir/feeds.js"]]) {
    const src = fs.readFileSync(f, "utf8");
    ok(`${name}: bodyHasKeep ตัดชื่อลวงก่อนหา`, /const hay = dropFalseCP\(body\);/.test(src));
    ok(`${name}: ด่าน verify ยึดพาดหัว ไม่ใช่สรุป`, /hasFalseCP\(bare\) && !realCP\(bare\)/.test(src));
  }
}

console.log("\n[3b] เคสใหม่ 13 ส.ค. 2026 (รอบสอง)");
{
  // ร้านค้าออนไลน์ของเครือเอง — มีชื่อเครือเต็มไปหมด ด่านชื่อเครือกรองไม่ออก ต้องตัดที่โดเมน
  const allonline = (link) => noiseReason(
    { link, title: "อาหารตามเทศกาล | AllOnline", snippet: "หมูกรอบชาชู 400 กรัม ซีพี-คูโรบูตะ. 4%. ฿ 249. ฿ 259." },
    "อาหารตามเทศกาล | allonline", "alert1");
  ok("AllOnline (โดเมนของเครือ) → ตัด", allonline("https://allonline.7eleven.co.th/product/1") === "shopping",
     String(allonline("https://allonline.7eleven.co.th/product/1")));
  ok("ถึงโดเมนไม่อยู่ในลิสต์ ชื่อ AllOnline ในพาดหัวก็ยังจับได้",
     allonline("https://www.example.com/p/1") === "shopping", String(allonline("https://www.example.com/p/1")));
  ok("ราคาแบบ ฿249 เป็นสัญญาณหน้าขายของ",
     noiseReason({ link: "https://www.example.com/p/2", title: "ชุดของขวัญ ซีพี", snippet: "฿ 259 พร้อมจัดส่ง" },
                 "ชุดของขวัญ ซีพี", "alert1") === "shopping");

  // ซีพีพี = ศัพท์การแพทย์ ไม่ใช่ชื่อเครือ
  const bbc = noiseReason(
    { link: "https://www.bbc.com/thai/articles/1", title: "อะไรคือสาเหตุของภาวะเป็นหนุ่มสาวก่อนวัยอันควร และมันรักษาได้หรือไม่ - BBC News ไทย", snippet: "" },
    "อะไรคือสาเหตุของภาวะเป็นหนุ่มสาวก่อนวัยอันควร และมันรักษาได้หรือไม่ - bbc news ไทย", "alert1");
  ok("พาดหัว BBC ไม่มีชื่อเครือ → ไปเช็คเนื้อข่าว (ไม่ใช่ปล่อยผ่าน)", bbc === null, String(bbc));
  ok("ซีพีพี ในเนื้อข่าวไม่นับเป็นชื่อเครือ",
     !dropFalseCP("หรือซีพีพี (Central precocious puberty - CPP) คือเมื่อร่างกาย").includes("ซีพี"));
  ok("ซีพีพีซี (บริษัทจริงในเครือ) ยังนับเป็นเครือ", realCP("ซีพีพีซี ลงทุนเพิ่ม") === true);
  ok("central precocious puberty ภาษาอังกฤษก็ไม่นับ",
     !dropFalseCP("central precocious puberty").includes("precocious"));

  // ข่าวจริงของเครือบนเว็บข่าว ยังต้องผ่าน
  ok("ข่าว ซีพี แอ็กซ์ตร้า บนเว็บข่าว ไม่โดนตัด",
     noiseReason({ link: "https://www.thansettakij.com/news/1", title: "ซีพี แอ็กซ์ตร้า เล่นใหญ่ ขานรับนโยบายรัฐ", snippet: "" },
                 "ซีพี แอ็กซ์ตร้า เล่นใหญ่ ขานรับนโยบายรัฐ", "alert1") === null);
}

console.log("\n[4] ชิพ CPF — จับแค่ ซีพีเอฟ กับ cpf ตรงทั้งคำ");
for (const [name, f, kind] of [["trend", "../trend/app.js", "isCPF"],
                               ["issue", "../issue/app.js", "isCPF"],
                               ["ir", "../ir/app.js", "catOf"]]) {
  const src = fs.readFileSync(f, "utf8");
  const m = src.match(/^const CPF_RE = .*$/m);
  ok(`${name}: มี CPF_RE`, !!m, "ไม่เจอ");
  if (!m) continue;
  const re = await import("data:text/javascript;charset=utf-8," + encodeURIComponent(m[0] + "\nexport { CPF_RE };"))
    .then((x) => x.CPF_RE);
  const hit = (s) => re.test(s);
  ok(`${name}: "CPF แจ้งผลประกอบการ" → ใช่`, hit("CPF แจ้งผลประกอบการ"));
  ok(`${name}: "ซีพีเอฟ ลงทุนเพิ่ม" → ใช่`, hit("ซีพีเอฟ ลงทุนเพิ่ม"));
  ok(`${name}: "cpf" ตัวเล็ก → ใช่`, hit("หุ้น cpf วันนี้"));
  ok(`${name}: "CPFresh" → ไม่ใช่`, !hit('เครือซีพี เปิดตัว "ทุเรียนแห่งชาติ CPFresh" ปักหมุดตลาดจีน'), "CPFresh ยังติด");
  ok(`${name}: "CPFGS" → ไม่ใช่`, !hit("บริษัท CPFGS จำกัด"));
  ok(`${name}: "cp foods" → ไม่ใช่แล้ว (เจ้าของสั่งเอาแค่ 2 คำ)`, !hit("cp foods expands"));
  ok(`${name}: "เจริญโภคภัณฑ์อาหาร" → ไม่ใช่แล้ว`, !hit("เจริญโภคภัณฑ์อาหาร แจ้งผล"));
  ok(`${name}: ไม่เหลือลิสต์คำเก่า`, !/charoen pokphand foods/.test(src), "ยังมีลิสต์เก่า");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
