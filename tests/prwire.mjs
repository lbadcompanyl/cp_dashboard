// เว็บแจกข่าวประชาสัมพันธ์ (newswit/thaipr) — กฎ "ต้องมีชื่อเครือ CP ในพาดหัว"
// ใช้ได้เฉพาะคอลัมน์ CP · เอาไปใช้กับ alert2 แล้วตัดข่าวอุตสาหกรรมที่ถูกต้องทิ้ง
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const FILES = { trend: "../functions/api/trend/feeds.js", ir: "../functions/api/ir/feeds.js" };

// ดึงบล็อกจริงออกจากไฟล์มารัน ไม่ก๊อปโค้ดมาเขียนซ้ำ
// ⚠️ ตัวจับต้องนับวงเล็บปีกกาเอง — เคยใช้ regex [\s\S]*?^\}$ แล้วมันกลืนฟังก์ชันถัดไปด้วย
// (const ที่เป็น arrow บรรทัดเดียว ไปจบที่ } ของ function ตัวล่าง → ประกาศชื่อซ้ำ)
function grabFn(src, name) {
  const i = src.search(new RegExp(`^function ${name}\\(`, "m"));
  if (i < 0) return "";
  let depth = 0, j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}" && --depth === 0) return src.slice(i, k + 1);
  }
  return "";
}
function grabConst(src, name) {
  const m = src.match(new RegExp(`^const ${name} =[\\s\\S]*?;$`, "m")); // =\n ก็มี (DAILY_RE) ห้ามบังคับเว้นวรรค
  return m ? m[0] : "";
}

// ⚠️ ตัวกรองอยู่ใน functions/api/_lib/noise.js ชุดเดียวใช้ทุกแดชบอร์ดแล้ว
// harness จึง import โมดูลจริงตรงๆ ไม่ต้องแกะโค้ดจาก feeds.js มารันเหมือนเมื่อก่อน
const LIB = "../functions/api/_lib/noise.js";
async function load(_file) { return import(LIB); }

// พาดหัวจริงที่เจ้าของแจ้งว่าไม่ควรโดนตัด (คอลัมน์ 🐷 ปศุสัตว์ · อาหาร · การค้า ของ IR)
const CASES = [
  { title: "TFG โชว์ผลงาน Q2/69 รายได้รวม 18,601.84 ลบ. และ กำไร 1,474.46 ลบ. บอร์ดเคาะจ่ายปันผล", host: "www.newswit.com" },
  { title: "กรมประมงยืนยันมาตรฐานความปลอดภัยเดินหน้าเฝ้าระวังเชื้อดื้อยาด้านจุลชีพในสัตว์น้ำ สร้างความเชื่อมั่นผู้บริโภค", host: "www.thaipr.net" },
];

for (const [name, file] of Object.entries(FILES)) {
  console.log(`\n════════ ${name} ════════`);
  const { noiseReason } = await load(file);
  const mk = (c) => ({ link: `https://${c.host}/n/12345`, title: c.title, snippet: "" });
  const why = (c, src) => noiseReason(mk(c), c.title.toLowerCase(), src);

  console.log("\n[1] คอลัมน์อุตสาหกรรม (alert2) — ห้ามตัดเพราะมาจากเว็บแจกข่าว");
  for (const c of CASES) ok(c.title.slice(0, 34) + "…", why(c, "alert2") === null, String(why(c, "alert2")));

  console.log("\n[2] คอลัมน์ CP (alert1) — กฎเดิมต้องยังอยู่");
  for (const c of CASES) ok("ไม่มีชื่อเครือในพาดหัว → ตัด", why(c, "alert1") === "pr", String(why(c, "alert1")));
  const cpNews = { title: "ซีพี แอ็กซ์ตร้า แจ้งผลประกอบการไตรมาส 2", host: "www.newswit.com" };
  ok("ข่าวจริงของเครือบนเว็บแจกข่าว ยังไม่โดนตัด", why(cpNews, "alert1") === null, String(why(cpNews, "alert1")));
  const award = { title: "นาคราชอวอร์ด 2569 ประกาศผลผู้ได้รับรางวัล", host: "www.newswit.com" };
  ok("ใบที่ชื่อเครืออยู่แค่ท้ายข่าว ยังโดนตัด", why(award, "alert1") === "pr", String(why(award, "alert1")));

  console.log("\n[3] ตัวกรองอื่นไม่ได้ถูกปิดไปด้วย");
  ok("ประกาศงานยังโดนตัดทั้งสองคอลัมน์",
     noiseReason({ link: "https://th.jobsdb.com/j/1", title: "x", snippet: "" }, "x", "alert2") === "job");
  ok("พาดหัวขึ้นต้น 'ข่าวประชาสัมพันธ์' ยังโดนตัดใน alert2",
     noiseReason({ link: "https://www.matichon.co.th/1", title: "ข่าวประชาสัมพันธ์ ...", snippet: "" },
                 "ข่าวประชาสัมพันธ์ กรมอนามัย", "alert2") === "pr");
}


console.log("\n════════ เคสที่เจ้าของชี้ว่า 'ควรโดนตัด' (13 ส.ค. 2026) ════════");
{
  const { noiseReason } = await load(FILES.trend);
  const why = (link, title, snippet = "") => noiseReason({ link, title, snippet }, String(title).toLowerCase(), "alert1");
  ok("หน้าสินค้าโฮมโปร (ราวแขวนผ้า KOHLER K-R26691-CP สีโครม)",
     why("https://www.homepro.co.th/p/1234", "ราวแขวนผ้า KOHLER K-R26691-CP สีโครม - โฮมโปร") === "shopping",
     String(why("https://www.homepro.co.th/p/1234", "ราวแขวนผ้า KOHLER K-R26691-CP สีโครม - โฮมโปร")));
  ok("หน้าค้นหาของเว็บเกม (Card Search — OnPlay Arena)",
     why("https://arena.onplay.in.th/card", "Card Search — OnPlay Arena") === "shopping",
     String(why("https://arena.onplay.in.th/card", "Card Search — OnPlay Arena")));
  ok("หน้าหนังของ Netflix (ดู 'บ้านหลังสุดท้าย')",
     why("https://www.netflix.com/th/title/81234567", "ดู \"บ้านหลังสุดท้าย\" | เว็บไซต์อย่างเป็นทางการของ Netflix") === "stream",
     String(why("https://www.netflix.com/th/title/81234567", "ดู บ้านหลังสุดท้าย | Netflix")));
  ok("หน้าสินค้าสัตว์เลี้ยง (CP แผ่นรองซับอนามัย - VIF)",
     why("https://vif.pet/product/pad", "CP แผ่นรองซับอนามัย สำหรับสัตว์เลี้ยง - VIF", "CP Premium Training Pad") === "shopping",
     String(why("https://vif.pet/product/pad", "CP แผ่นรองซับอนามัย สำหรับสัตว์เลี้ยง - VIF", "CP Premium Training Pad")));
  // ⚠️ ทรูไอดีเป็นบริการของทรูในเครือ CP — ข่าวของมันคือของที่เราต้องการ ห้ามตัด
  ok("ข่าวของทรูไอดี (ในเครือ CP) ไม่โดนตัด",
     why("https://news.trueid.net/detail/123", "ทรูไอดี เปิดตัวบริการใหม่") === null,
     String(why("https://news.trueid.net/detail/123", "ทรูไอดี เปิดตัวบริการใหม่")));
}
{
  // C.P.HOLIDAYS = บริษัททัวร์คนละเจ้า → realCP ต้องตอบว่า "ไม่ใช่เครือ"
  const { realCP } = await import(LIB);
  ok("C.P.HOLIDAYS ไม่ใช่เครือ CP",
     realCP("บริการจองตั๋วเครื่องบิน - C.P.HOLIDAYS :: บริการทัวร์ท่องเที่ยวครบวงจร") === false);
  ok("รหัสสินค้า K-R26691-CP ไม่ใช่เครือ CP",
     realCP("ราวแขวนผ้า KOHLER K-R26691-CP สีโครม") === false);
  ok("ข่าวจริงของเครือยังนับเป็นเครือ", realCP("ซีพีเอฟ แจ้งผลประกอบการ") === true);
  ok("ซีพี ออลล์ ยังนับเป็นเครือ", realCP("ซีพี ออลล์ เปิดสาขาใหม่") === true);
}

// ---- ด่านกันโค้ดถูกก๊อปกลับไปวางในแต่ละแดชบอร์ดอีก ----
// เจ้าของสั่ง (13 ส.ค. 2026): ตัดที่เดียว = ตัดทุกแดชบอร์ด · มีสำเนาเมื่อไหร่ กฎก็เพี้ยนกันอีก
console.log("\n════════ ryt9 — เว็บแจกข่าว PR อีกเจ้า (เจ้าของแจ้ง 14 ส.ค. 2026) ════════");
{
  const { noiseReason } = await load(FILES.trend);
  const t1 = `"อิน-องศา"บุกตลาด "A FAIR" เซ็นทรัล ลาดพร้าวแฟนคลับเต็มสตรีม | RYT9`;
  const w = (title, src) => noiseReason({ link: "https://www.ryt9.com/s/prg/1", title, snippet: "ซีพี แอ็กซ์ตร้า ปักหมุด" }, title.toLowerCase(), src);
  ok("พาดหัวไม่มีชื่อเครือ → ตัด (คอลัมน์ CP)", w(t1, "alert1") === "pr", String(w(t1, "alert1")));
  ok("พาดหัวมีชื่อเครือจริง → เก็บ", w("ซีพี แอ็กซ์ตร้า โชว์ผลงานครึ่งปีแรก | RYT9", "alert1") === null);
  ok("คอลัมน์อื่นไม่โดนกฎนี้", w(t1, "alert2") === null, String(w(t1, "alert2")));
  ok("ชื่อเครือกลางคำอื่น ไม่นับว่ามีในพาดหัว", w("อควา เอ็มซีพีไอ | RYT9", "alert1") === "pr");
}

console.log("\n════════ ตัวกรองต้องมีชุดเดียว ════════");
{
  const SHARED = ["SHOP_HOSTS", "STREAM_HOSTS", "JOB_HOSTS", "PROP_HOSTS", "PR_HOSTS", "CP_BRANDS",
                  "CP_FALSE", "CP_FALSE_RX", "DAILY_RE", "SHOP_RE", "JOB_RE", "PROP_RE", "VENDOR_RE",
                  "AD_PRODUCT_RE", "AD_PITCH_RE", "GALLERY_RE", "IMGPOST_RE", "PR_RE"];
  for (const [name, file] of Object.entries(FILES)) {
    const src = fs.readFileSync(file, "utf8");
    const dup = SHARED.filter((n) => new RegExp(`^const ${n} =`, "m").test(src));
    ok(`${name}/feeds.js ไม่มีสำเนาตัวกรอง`, dup.length === 0, "เจอสำเนา: " + dup.join(", "));
    ok(`${name}/feeds.js ไม่มีสำเนา noiseReason`, !/^function noiseReason\(/m.test(src));
    ok(`${name}/feeds.js import จาก _lib/noise.js`, /from "\.\.\/_lib\/noise\.js"/.test(src));
  }
  const lib = fs.readFileSync(new URL("../functions/api/_lib/noise.js", import.meta.url), "utf8");
  for (const n of SHARED) ok(`ไลบรารีมี ${n}`, new RegExp(`^export const ${n} =`, "m").test(lib));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
