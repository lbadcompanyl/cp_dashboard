/* หน้า /issue/upload/ — เปิดจริงในเบราว์เซอร์แล้วป้อนไฟล์เข้าไป
 *
 *   python3 -m http.server 8899 --directory .. &
 *   node zocialui.mjs
 *
 * คุมอะไร: อ่านไฟล์แล้วต้องขึ้นผล ไม่ใช่หน้าว่าง · สลับ timezone แล้ววันที่เปลี่ยนจริง ·
 *          ปุ่มบันทึกต้องกดไม่ได้ตราบใดที่ยังไม่มี D1 · ขาดคอลัมน์ต้องบอก ไม่ใช่เงียบ ·
 *          และหน้าไม่ล้นจอบนมือถือ
 */
import { launch, ENGINE } from "./browser.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8899";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const CSV_HEAD = "Post time,Source,Message,Direct URL,Account Name,Account Type,Comment Count\n";
const CSV = CSV_HEAD +
  '2026-09-02 22:00,Facebook,"โพสต์หัวค่ำ ทดสอบ",https://www.facebook.com/p/posts/1,เพจตัวอย่าง,Page,87\n' +
  '2026-09-01 10:00,Twitter,"ทวีตทดสอบ",https://x.com/a/status/2,คุณเอ,User,3\n' +
  '2026-09-01 11:00,Twitter,"แถวนี้ไม่มีลิงก์",,คุณบี,User,0\n';
const CSV_MISSING = "Post time,Source\n2026-09-02 22:00,Facebook\n";

const upload = async (page, text, name = "zocial-test_2026-09-02.csv") => {
  await page.setInputFiles("#file", { name, mimeType: "text/csv", buffer: Buffer.from(text, "utf8") });
  await page.waitForSelector("#out:not([hidden]), #err:not([hidden])", { timeout: 8000 });
};


/* zip แบบ "เก็บดิบ ไม่บีบอัด" — พอสำหรับสร้าง .xlsx ปลอมไว้เทสต์ */
function crc32(buf) {
  let c, t = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  let crc = 0xffffffff;
  for (const b of buf) crc = t[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function zipStore(entries) {
  const parts = [], dir = [];
  let off = 0;
  for (const [name, text] of entries) {
    const nb = Buffer.from(name, "utf8"), db = Buffer.from(text, "utf8"), cr = crc32(db);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(cr, 14);
    lh.writeUInt32LE(db.length, 18); lh.writeUInt32LE(db.length, 22); lh.writeUInt16LE(nb.length, 26);
    parts.push(lh, nb, db);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(cr, 16);
    ch.writeUInt32LE(db.length, 20); ch.writeUInt32LE(db.length, 24); ch.writeUInt16LE(nb.length, 28);
    ch.writeUInt32LE(off, 42);
    dir.push(ch, nb);
    off += 30 + nb.length + db.length;
  }
  const cd = Buffer.concat(dir);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

const browser = await launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on("pageerror", (e) => { fail++; console.log("  ❌ JS พังบนหน้า → " + e.message); });

console.log(`\n[1] เปิดหน้า (${ENGINE})`);
await page.goto(`${BASE}/issue/upload/`, { waitUntil: "domcontentloaded" });
{
  ok("มีที่ให้วางไฟล์", await page.isVisible("#drop"));
  ok("ยังไม่มีผลก่อนเลือกไฟล์", !(await page.isVisible("#out")));
  ok("มีปุ่มกลับหน้าหลัก", (await page.locator('a[href="/"]').count()) > 0);
  ok("มีเลขเวอร์ชันของหน้า", !!(await page.getAttribute('meta[name="page-ver"]', "content")));
  // 🚫 แถบชวนติดตั้งอยู่ที่หน้าแรกหน้าเดียว — ใส่ที่นี่จะบังตอนกำลังตรวจไฟล์
  const html = await page.content();
  ok("ไม่มีแถบชวนติดตั้ง", !html.includes("installprompt"));
}

console.log("\n[2] ป้อนไฟล์แล้วต้องเห็นผล ไม่ใช่หน้าว่าง");
await upload(page, CSV);
{
  const t = await page.textContent("#out");
  ok("บอกจำนวนแถวในไฟล์", t.includes("แถวในไฟล์"));
  ok("นับที่จะบันทึกได้ 2 ใบ (ใบไม่มีลิงก์ถูกตัด)", /จะบันทึก[\s\S]{0,40}2/.test(t), t.slice(0, 120).replace(/\s+/g, " "));
  ok("บอกเหตุผลที่ตัด เป็นภาษาคน", t.includes("ไม่มีลิงก์"));
  ok("เดาชื่อแคมเปญจากชื่อไฟล์", (await page.inputValue("#camp")) === "zocial-test", await page.inputValue("#camp"));
  ok("เตือนว่าคอมเมนต์ไม่ใช่ยอดจริง", t.includes("นับเฉพาะที่อยู่ในไฟล์"));
  ok("บอกว่ายังไม่มี sentiment ของเราเอง", t.includes("ยังไม่เอาขึ้นการ์ด"));
}

console.log("\n[2b] แยกโพสต์ / คอมเมนต์ / ช่องทาง");
{
  const t = await page.textContent("#out");
  ok("บอกชนิดของแถว", t.includes("ชนิดของแถว") && t.includes("โพสต์"));
  ok("เตือนว่าโพสต์กับคอมเมนต์ปนกันมาในชีตเดียว", t.includes("มาปนกันในชีตเดียว"));
  ok("บอกช่องทางที่พบ (ไว้จับว่าอ่านชีตผิด)", t.includes("ช่องทาง") && t.includes("facebook"));
}

console.log("\n[3] สลับ timezone แล้ววันที่ต้องเปลี่ยนจริง (§7.3)");
{
  const dateNow = () => page.evaluate(() => {
    const els = [...document.querySelectorAll(".kv")].find((e) => e.textContent.includes("จะบันทึกเป็นวันที่"));
    return els ? els.querySelector("b").textContent.trim() : "";
  });
  ok("ค่าตั้งต้นตีความเป็นเวลาไทย → 2 ก.ย.", (await dateNow()) === "2026-09-02", await dateNow());
  await page.selectOption("#tz", "utc");
  await page.waitForTimeout(120);
  ok("เลือก UTC → เลื่อนเป็น 3 ก.ย.", (await dateNow()) === "2026-09-03", await dateNow());
  ok("มีปุ่มเปิดโพสต์จริงไปเทียบเวลา", (await page.locator('a:has-text("เปิดโพสต์แถวแรก")').count()) === 1);
  await page.selectOption("#tz", "th");
  await page.waitForTimeout(120);
  ok("สลับกลับได้", (await dateNow()) === "2026-09-02");
}

console.log("\n[4] จับคู่คอลัมน์เองได้");
{
  ok("จับคู่ให้อัตโนมัติแล้ว", (await page.inputValue('select[data-field="url"]')) === "Direct URL");
  await page.selectOption('select[data-field="comments"]', "");
  await page.waitForTimeout(120);
  const t = await page.textContent("#out");
  ok("ถอดคอลัมน์คอมเมนต์ออก แล้วผลวาดใหม่ทันที", t.includes("—"));
  await page.selectOption('select[data-field="comments"]', "Comment Count");
  await page.waitForTimeout(120);
}

console.log("\n[5] ปุ่มบันทึก — ต้องส่งจริง และรายงานผลจริง");
{
  ok("ปุ่มกดได้เมื่อไฟล์อ่านได้ครบ", !(await page.isDisabled("#save"))); 
  const t = await page.textContent("#out");
  ok("บอกว่าจะบันทึกกี่แถว และคอมเมนต์ไปอยู่ไหน", t.includes("ขึ้นการ์ด") && t.includes("เก็บไว้เบื้องหลัง"));
  ok("บอกว่าส่งซ้ำแล้วผลตรวจ sentiment ไม่หาย", t.includes("จะไม่ถูกลบ"));

  // ปลอมเซิร์ฟเวอร์ — วัดว่าหน้าเว็บส่งครบ 3 จังหวะและรายงานผลถูก
  const seen = [];
  await page.route("**/issue/api/upload", async (route) => {
    const b = JSON.parse(route.request().postData() || "{}");
    seen.push(b.op);
    const out = b.op === "begin" ? { ok: true, batchId: "b1", maxRows: 500 }
      : b.op === "rows" ? { ok: true, received: (b.rows || []).length }
      : { ok: true, dates: (b.dates || []).length, retentionDays: 180, cutoff: "2026-03-06", removed: 4 };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(out) });
  });
  await page.click("#save");
  await page.waitForSelector("#savedone:not([hidden])", { timeout: 8000 });
  const done = await page.textContent("#savedone");
  ok("ส่งครบ 3 จังหวะ", seen[0] === "begin" && seen.includes("rows") && seen.at(-1) === "finish", seen.join(","));
  ok("รายงานว่าบันทึกแล้วกี่แถว", done.includes("บันทึกแล้ว"));
  ok("บอกด้วยว่าลบของเกินกำหนดไปเท่าไร", done.includes("4") && done.includes("2026-03-06"), done.replace(/\s+/g, " ").slice(0, 120));
  ok("ย้ำว่าเพจไม่ถูกลบ", done.includes("เก็บถาวร"));
}

console.log("\n[5b] เซิร์ฟเวอร์ตอบไม่ดี ต้องบอกให้ถูกเรื่อง");
{
  await page.unroute("**/issue/api/upload");
  await page.route("**/issue/api/upload", (route) => route.fulfill({ status: 503, contentType: "application/json",
    body: JSON.stringify({ ok: false, error: "no-binding", message: "ยังไม่ได้ผูกฐานข้อมูล D1 ... ZOCIAL_DB ..." }) }));
  await page.click("#save");
  await page.waitForFunction(() => document.getElementById("savedone")?.textContent.includes("❌"), { timeout: 8000 });
  ok("ยกข้อความจากเซิร์ฟเวอร์มาบอกตรงๆ", (await page.textContent("#savedone")).includes("ZOCIAL_DB"));

  // 🔒 Access หมดอายุจะตอบหน้าล็อกอินเป็น HTML ไม่ใช่ JSON
  await page.unroute("**/issue/api/upload");
  await page.route("**/issue/api/upload", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html>login</html>" }));
  await page.click("#save");
  await page.waitForFunction(() => document.getElementById("savedone")?.textContent.includes("เซสชัน"), { timeout: 8000 });
  ok("เซสชันหมดอายุ ต้องบอกให้ไปเข้าสู่ระบบใหม่ ไม่ใช่ 'บันทึกไม่สำเร็จ'",
     (await page.textContent("#savedone")).includes("เข้าสู่ระบบใหม่"));
  await page.unroute("**/issue/api/upload");
  ok("ปุ่มกลับมากดได้หลังพลาด", !(await page.isDisabled("#save")));
}

console.log("\n[6] ไฟล์ที่ขาดคอลัมน์จำเป็น — ห้ามเงียบ");
{
  await upload(page, CSV_MISSING, "missing.csv");
  const t = await page.textContent("#out");
  ok("บอกว่ายังอ่านไม่ได้", t.includes("ยังอ่านไฟล์นี้ไม่ได้"));
  ok("บอกด้วยว่าขาดคอลัมน์อะไร", t.includes("ลิงก์") && t.includes("ข้อความ"), t.slice(0, 150).replace(/\s+/g, " "));
  ok("ยังให้เลือกคอลัมน์เองได้", (await page.locator("select[data-field]").count()) > 0);
}

console.log("\n[7] ไฟล์ใหม่ต้องล้างผลของไฟล์เก่า (กฎข้อ 5b)");
{
  await upload(page, CSV, "another_2026-09-03.csv");
  ok("ชื่อแคมเปญเปลี่ยนตามไฟล์ใหม่", (await page.inputValue("#camp")) === "another", await page.inputValue("#camp"));
  ok("ผลเก่าไม่ค้าง", !(await page.textContent("#out")).includes("ยังอ่านไฟล์นี้ไม่ได้"));
}

console.log("\n[8] มือถือ");
{
  const m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto(`${BASE}/issue/upload/`, { waitUntil: "domcontentloaded" });
  await m.setInputFiles("#file", { name: "m.csv", mimeType: "text/csv", buffer: Buffer.from(CSV, "utf8") });
  await m.waitForSelector("#out:not([hidden])", { timeout: 8000 });
  const w = await m.evaluate(() => ({ doc: document.scrollingElement.scrollWidth, win: innerWidth }));
  ok("หน้าไม่ล้นออกทางขวา", w.doc <= w.win + 1, JSON.stringify(w));
  await m.close();
}

console.log("\n[9] ไฟล์ .xlsx จริง — วันที่ที่ Excel เก็บเป็น 'ตัวเลข'");
{
  // สร้าง .xlsx ขั้นต่ำในเทสต์เอง (เก็บแบบไม่บีบอัด) เพื่อพิสูจน์ทั้งเส้นทาง:
  // อ่าน zip → sharedStrings → เซลล์ตัวเลข → แปลง serial กลับเป็นวันที่
  // ⚠️ Excel ไม่ได้เก็บ "2026-09-02 22:00" เป็นข้อความ แต่เก็บเป็นตัวเลข 46266.91…
  //    ถ้าตรงนี้พลาด ทั้งไฟล์จะขึ้นว่า "อ่านเวลาโพสต์ไม่ได้" ทุกแถว
  const serial = Date.UTC(2026, 8, 2, 22, 0) / 86400000 + 25569;
  const strs = ["Post time", "Source", "Message", "Direct URL", "Facebook", "โพสต์จาก xlsx", "https://www.facebook.com/p/posts/9"];
  const si = strs.map((t) => `<si><t>${t}</t></si>`).join("");
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>` +
    `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>` +
    `<row r="2"><c r="A2"><v>${serial}</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c><c r="D2" t="s"><v>6</v></c></row>` +
    `</sheetData></worksheet>`;
  const buf = zipStore([
    ["xl/sharedStrings.xml", `<?xml version="1.0"?><sst count="${strs.length}">${si}</sst>`],
    ["xl/worksheets/sheet1.xml", sheet],
  ]);

  await page.setInputFiles("#file", { name: "excel_2026-09-02.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: buf });
  await page.waitForSelector("#out:not([hidden]), #err:not([hidden])", { timeout: 8000 });
  const t = await page.textContent("#out");
  ok("อ่าน .xlsx ได้ ไม่เข้ากอง 'อ่านเวลาไม่ได้'", !t.includes("อ่านเวลาโพสต์ไม่ได้"), t.slice(0, 160).replace(/\s+/g, " "));
  ok("แปลงตัวเลขของ Excel กลับเป็นเวลาถูก", t.includes("2026-09-02 22:00"), t.slice(0, 200).replace(/\s+/g, " "));
  ok("บันทึกเป็นวันที่ 2 ก.ย. (ตีความเป็นเวลาไทย)", t.includes("2026-09-02"));
}

await browser.close();
console.log(`\n${fail ? "❌" : "✅"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
