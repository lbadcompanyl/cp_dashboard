// ประกาศงาน / อสังหา / หน้าขายของ ต้องไม่หลุดเข้าคอลัมน์ alert
// ดึง noiseReason จริงจากไฟล์มารัน — และเช็คด้วยว่าข่าวจริงไม่โดนตัดไปด้วย
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

// ⚠️ ตัวกรองอยู่ใน functions/api/_lib/noise.js ชุดเดียวใช้ทุกแดชบอร์ดแล้ว
// harness จึง import โมดูลจริงตรงๆ ไม่ต้องแกะโค้ดจาก feeds.js มารันเหมือนเมื่อก่อน
const LIB = "../functions/api/_lib/noise.js";
async function load(_file) { return import(LIB); }

// พาดหัวจริงจากรูปที่เจ้าของส่งมา + ตัวอย่างใกล้เคียง
const JUNK = [
  ["job", "C.P. Intertrade งานเต็มเวลา Jobs in ดินแดง กรุงเทพมหานคร - ส.ค. 2569 | Jobsdb", "https://th.jobsdb.com/j/123"],
  ["job", "รับสมัครงาน เจ้าหน้าที่ประจำสาขา ซีพี", "https://example.com/a"],
  ["job", "หางาน สมัครงาน ซีพี ออลล์", "https://jobbkk.com/x"],
  ["property", "บ้านเดี่ยวให้เช่า 3 ห้องนอน ในโครงการ ซี พี เอ็น วิลล์ 2 | Dot Property", "https://www.dotproperty.co.th/y"],
  ["property", "ขายคอนโดใกล้ทรูดิจิทัล", "https://example.com/b"],
  ["property", "ห้องเช่าราคาถูก ใกล้เซเว่น", "https://ddproperty.com/z"],
  ["vendor", "เซนเซอร์วัดคุณภาพอากาศ Air Quality Sensor ตรวจจับ PM2.5 - e-power service", "https://epower.co.th/p"],
  ["vendor", "เครื่องกรองน้ำ รุ่นใหม่ ซีพี", "https://example.com/c"],
  ["vendor", "ตัวแทนจำหน่ายอุปกรณ์กรองอากาศ", "https://example.com/d"],
];
// ข่าวจริง — ห้ามโดนตัด
const REAL = [
  "ซีพีเอฟ แจ้งผลประกอบการไตรมาส 2 กำไรโต 15%",
  "ค่าฝุ่น PM2.5 กรุงเทพฯ เกินมาตรฐาน 12 เขต",
  "ทรู คอร์ปอเรชั่น เปิดตัวบริการใหม่",
  "ศาลสั่งโรงงานหยุดปล่อยน้ำเสียลงคลอง",
  "กรมควบคุมมลพิษเผยผลตรวจคุณภาพอากาศภาคเหนือ",
  "เซเว่น อีเลฟเว่น ขยายสาขาเพิ่ม 700 แห่ง",
  "ผู้ว่าฯ ลงพื้นที่ตรวจสอบโรงงานหลังชาวบ้านร้องเรียน",
];

for (const [tag, file] of [["trend", "../functions/api/trend/feeds.js"],
                           ["ir", "../functions/api/ir/feeds.js"]]) {
  console.log(`\n--- ${tag}/feeds.js ---`);
  const { noiseReason, dropNoiseAfterArchive } = await load(file);
  const why = (title, link = "https://news.example.com/1") =>
    noiseReason({ link, snippet: "" }, title.toLowerCase(), "alert1");

  for (const [kind, title, link] of JUNK) {
    const got = why(title, link);
    ok(`ตัด [${kind}] ${title.slice(0, 40)}`, !!got, "ได้ " + got);
  }
  for (const t of REAL) ok(`เก็บไว้: ${t.slice(0, 42)}`, why(t) === null, "โดนตัดเพราะ " + why(t));

  // ของที่ค้างใน KV ต้องถูกกวาดออกด้วย ไม่ใช่รอ 10 วัน
  const sources = {
    alert1: { items: [
      { title: "C.P. Intertrade งานเต็มเวลา Jobs in ดินแดง", link: "https://th.jobsdb.com/j/1" },
      { title: "ซีพีเอฟ กำไรโต", link: "https://thairath.co.th/1" },
    ] },
    alert2: { items: [{ title: "บ้านเดี่ยวให้เช่า 3 ห้องนอน", link: "https://dotproperty.co.th/1" }] },
  };
  const diag = {};
  dropNoiseAfterArchive(sources, diag);
  ok("กวาดของเก่าใน KV: alert1 เหลือแต่ข่าวจริง",
     sources.alert1.items.length === 1 && sources.alert1.items[0].title.includes("ซีพีเอฟ"));
  ok("กวาดของเก่าใน KV: alert2 ว่างเปล่า", sources.alert2.items.length === 0);
  ok("รายงานจำนวนที่ตัดออก", diag.alert1 === 1 && diag.alert2 === 1, JSON.stringify(diag));
}


// ── 3 เคสจริงที่เจ้าของส่งมา (11 ส.ค. 2026) ────────────────────────────
console.log("\n=== 3 เคสจริงจากคอลัมน์ CP ===");
{
  const { noiseReason } = await load("../functions/api/trend/feeds.js");
  const why = (title, link = "https://news.example.com/1", snippet = "") =>
    noiseReason({ link, snippet }, String(title).toLowerCase(), "alert1");

  // 1) แอดเวอร์ทอเรียลเครื่องสำอาง เข้ามาเพราะในเนื้อบอกว่าหาซื้อได้ที่เซเว่น
  ok("ตัด [advertorial] ครีม/เซรั่มขายที่เซเว่น",
    why("ปาร์ตี้ฉลองท้ายปีหน้าแน่นแค่ไหนก็รอด! สเต็ปคลีนหน้าด้วย รีมูฟเวอร์ บำรุงต่อด้วย เซรั่มหน้าใส",
        "https://www.khaosod.co.th/x", "ครีมของเซเว่น หาซื้อได้ที่เซเว่นทุกสาขา") === "advertorial");

  // 2) เว็บแจกข่าวประชาสัมพันธ์ — ชื่อซีพีเป็นแค่รายชื่อผู้ร่วมงานท้ายข่าว
  ok("ตัด [pr] ข่าวจาก newswit.com",
    why("อ้อม พิยดา - นก ฉัตรชัย คว้ารางวัลใหญ่ งาน นาคราช อวอร์ด ครั้งที่ 8",
        "https://www.newswit.com/th/abcd", "บริษัท ซีพี ออลล์ จำกัด (มหาชน) รับรางวัล") === "pr");

  // 3) ข่าวจริงต้องไม่โดนตัด
  ok("เก็บไว้: ข่าวเรียกคืนครีมที่เป็นข่าวจริง",
    why("อย. สั่งเรียกคืนครีมบำรุงผิวผสมสารห้ามใช้ 12 ยี่ห้อ",
        "https://www.thairath.co.th/news/1", "พบสารปรอทเกินมาตรฐาน สั่งเก็บออกจากท้องตลาด") === null);
  ok("เก็บไว้: ข่าวซีพีจากสำนักข่าวปกติ",
    why("ซีพีเอฟ แจ้งผลประกอบการไตรมาส 2 กำไรโต 15%", "https://www.thairath.co.th/news/2") === null);
  ok("เก็บไว้: ข่าวเซเว่นที่เป็นข่าวธุรกิจจริง",
    why("เซเว่น อีเลฟเว่น เปิดสาขาใหม่ครบ 15,000 แห่งทั่วประเทศ", "https://www.prachachat.net/x") === null);
}


// ── ประกาศงานภาษาอังกฤษที่หลุดเข้าคอลัมน์ IR (11 ส.ค. 2026) ──────────────
console.log("\n=== ประกาศงานภาษาอังกฤษ ===");
for (const [tag, file] of [["trend", "../functions/api/trend/feeds.js"],
                           ["ir", "../functions/api/ir/feeds.js"]]) {
  const { noiseReason } = await load(file);
  const why = (title, link = "https://news.example.com/1", snippet = "") =>
    noiseReason({ link, snippet }, String(title).toLowerCase(), "alert1");
  console.log("  -- " + tag + " --");
  ok("ตัด [job] ประกาศงานจาก monster.co.th",
    why("AI Business Partner/ AI Expert with 5 - 7 Years of Experience at thai union",
        "https://www.monster.co.th/job/abc", "Job Purpose: responsible for driving hands-on AI adoption") === "job");
  ok("ตัด [job] แม้โดเมนไม่รู้จัก แต่ข้อความเป็นใบประกาศงาน",
    why("Supply Chain Manager at CPF", "https://careers.example.com/x",
        "Responsibilities: manage end-to-end logistics. Qualifications: 5 years experience") === "job");
  ok("ตัด [job] jobstreet", why("Sales Executive", "https://th.jobstreet.com/job/1") === "job");
  // ข่าวจริงที่พูดถึงการจ้างงาน ต้องไม่โดนตัด
  ok("เก็บไว้: ข่าวบริษัทประกาศรับพนักงานเพิ่ม (เป็นข่าวธุรกิจ)",
    why("ไทยยูเนี่ยนเตรียมขยายกำลังผลิต เพิ่มการจ้างงานในพื้นที่ 500 อัตรา",
        "https://www.prachachat.net/x") === null);
  ok("เก็บไว้: ข่าวเลิกจ้าง",
    why("โรงงานแปรรูปอาหารทะเลประกาศเลิกจ้างพนักงาน 200 คน", "https://www.thairath.co.th/x") === null);
}


// ── ข่าวจริงของเครือที่ส่งผ่านเว็บแจกข่าว PR ต้องไม่โดนตัด (12 ส.ค. 2026) ──
console.log("\n=== เว็บแจกข่าว PR — ตัดเฉพาะใบที่ชื่อเครือไม่อยู่ในพาดหัว ===");
for (const [tag, file] of [["trend", "../functions/api/trend/feeds.js"],
                           ["ir", "../functions/api/ir/feeds.js"]]) {
  const { noiseReason } = await load(file);
  const why = (title, link = "https://www.newswit.com/th/x", snippet = "") =>
    noiseReason({ link, snippet }, String(title).toLowerCase(), "alert1");
  console.log("  -- " + tag + " --");
  // เก็บไว้ — ชื่อเครืออยู่ในพาดหัว = ข่าวของเครือจริง
  ok("เก็บ: ซีพี แอ็กซ์ตร้า แจ้งผลประกอบการ",
    why("ซีพี แอ็กซ์ตร้า เผยผลประกอบการครึ่งปีแรก 2569 ทำรายได้รวม 268,334 ล้านบาท") === null);
  ok("เก็บ: ซีพี แอ็กซ์ตร้า คว้ารางวัล",
    why("ซีพี แอ็กซ์ตร้า คว้ารางวัล Next Gen Retail Award ตอกย้ำความเป็นผู้นำค้าปลีก") === null);
  ok("เก็บ: Makro ครบรอบ 37 ปี",
    why("Makro Celebrates 37th Anniversary with Rak Mak Makro Campaign Thanking Thai") === null);
  ok("เก็บ: กิจกรรมสิ่งแวดล้อมของ CP AXTRA",
    why("ซีพี แอ็กซ์ตร้า รวมพลังคนรุ่นใหม่ปลูกจิตสำนึกด้านสิ่งแวดล้อม ผ่านเวที พลาสติก คืนค่า by CP AXTRA") === null);
  // ตัด — พาดหัวเป็นเรื่องอื่น ชื่อเครืออยู่แค่ท้ายข่าว
  ok("ตัด: นาคราชอวอร์ด (ซีพีอยู่แค่ในเนื้อ)",
    why("อ้อม พิยดา - นก ฉัตรชัย คว้ารางวัลใหญ่ งาน นาคราช อวอร์ด ครั้งที่ 8",
        "https://www.newswit.com/th/abcd", "บริษัท ซีพี ออลล์ จำกัด (มหาชน) รับรางวัล") === "pr");
  ok("ตัด: ข่าว PR ที่ไม่เกี่ยวกับเครือเลย",
    why("เปิดตัวคอนโดใหม่ใจกลางเมือง", "https://www.thaipr.net/x") === "pr");
  // ชื่อลวงในพาดหัว ไม่นับว่าเป็นข่าวของเครือ
  ok("ตัด: บีแอลซีพี บนเว็บ PR (ชื่อลวง ไม่ใช่เครือ CP)",
    why("บีแอลซีพี เพาเวอร์ แจ้งผลประกอบการ", "https://www.newswit.com/th/blcp") === "pr");
  // เว็บข่าวปกติไม่โดนกฎนี้อยู่แล้ว
  ok("เก็บ: ข่าวเดียวกันจากสำนักข่าวปกติ",
    why("อ้อม พิยดา คว้ารางวัลใหญ่ งาน นาคราช อวอร์ด", "https://www.thairath.co.th/x") === null);
}

console.log("\n════════ หน้ารวมบทความ (Archives) — เจ้าของสั่งตัดทั้งหมด 14 ส.ค. 2026 ════════");
{
  const { noiseReason } = await load("../functions/api/trend/feeds.js");
  const w = (title, link = "https://www.example.com/tag/pm25/", src = "alert2") =>
    noiseReason({ link, title, snippet: "Recent Posts." }, title.toLowerCase(), src);
  ok("เคสจริง: สู้ฝุ่น PM 2.5 Archives", w("สู้ฝุ่น PM 2.5 Archives - ข่าวท้องถิ่น") === "archive-page",
     String(w("สู้ฝุ่น PM 2.5 Archives - ข่าวท้องถิ่น")));
  ok("เอกพจน์ Archive ก็ตัด", w("PM 2.5 Archive - เชียงใหม่นิวส์") === "archive-page");
  ok("Category Archives ก็ตัด", w("Category Archives: สิ่งแวดล้อม") === "archive-page");
  ok("ตัดทุกคอลัมน์ (alert1 ด้วย)", w("ซีพี Archives - ข่าวธุรกิจ", "https://x/t/", "alert1") === "archive-page");
  // ⚠️ ห้ามจับที่ URL — /archives/12345 เป็น permalink ของข่าวจริงบนเว็บ WordPress
  ok("ลิงก์ /archives/12345 แต่พาดหัวปกติ → ไม่ตัด",
     w("ฝุ่น PM2.5 พุ่งสูงในกรุงเทพ", "https://www.thairath.co.th/archives/12345") === null,
     String(w("ฝุ่น PM2.5 พุ่งสูงในกรุงเทพ", "https://www.thairath.co.th/archives/12345")));
  ok("ข่าวจริงที่ไม่มีคำนี้ ไม่โดน", w("ฝุ่น PM2.5 พุ่งสูงในกรุงเทพ") === null);
  ok("คำที่มี archive ซ่อนอยู่ในคำอื่นไม่นับ (archived ก็ยังนับ แต่ archiver ไม่)",
     w("archiverX ทดสอบ") === null, String(w("archiverX ทดสอบ")));
}

console.log(`\n${fail ? "❌" : "✅"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
