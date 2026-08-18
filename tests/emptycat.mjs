// หมวดที่ไม่มีเทรนด์ ต้องบอกว่า "ไม่มีเทรนด์ในหมวดนี้" ไม่ใช่หมุนค้างว่า "กรุณารอซักครู่"
// + เลขเวอร์ชันต้องอ่านจาก DOM ไม่ฮาร์ดโค้ดซ้ำ (ต้นเหตุที่แถบ "มีเวอร์ชันใหม่" เด้งไม่หยุด)
import { chromium } from "playwright";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const FEEDS = { generatedAt: new Date().toISOString(), sources: {} };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

// ⚠️ อ่านเลขเวอร์ชันจาก index.html เอง — ของเดิมพิมพ์เลขไว้ในเทสต์ แล้วตกทุกครั้งที่ bump
// (ตกด้วยเหตุผลที่ไม่ใช่บั๊ก = คนจะเริ่มไม่เชื่อเทสต์)
import fs from "node:fs";
const verOf = (page) => {
  const html = fs.readFileSync(new URL(`../${page}/index.html`, import.meta.url), "utf8");
  const m = html.match(/app\.js\?v=(\d+)/);
  if (!m) throw new Error(`หาเลขเวอร์ชันใน ${page}/index.html ไม่เจอ`);
  return +m[1];
};
const DASH = [
  { name: "trend", url: "http://127.0.0.1:8899/trend/", ver: verOf("trend") },
  { name: "issue", url: "http://127.0.0.1:8899/issue/", ver: verOf("issue") },
];

for (const D of DASH) {
  console.log(`\n════════ ${D.name} ════════`);
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));

  // ทุก endpoint ตอบ "สำเร็จแต่ไม่มีของ" — เป็นเคสที่รายงานมา (เลือกหมวดที่ไม่ติดเทรนด์)
  await page.route("**/api/trend/trending**", (r) => r.fulfill({ json: { items: [], source: "trendingnow" } }));
  await page.route("**/api/trend/xtrends**", (r) => r.fulfill({ json: { trends: [] } }));
  await page.route("**/api/trend/yttrends**", (r) => r.fulfill({ json: { items: [] } }));
  await page.route("**/api/**", (r) => r.fulfill({ json: FEEDS }));
  await page.goto(D.url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  console.log("\n[1] คอลัมน์ Google Trends");
  const box = page.locator('.panel[data-source="trends"] [data-list]');
  const txt = await box.innerText();
  ok("ไม่หมุนค้างว่า 'กรุณารอซักครู่'", !txt.includes("กรุณารอซักครู่"), JSON.stringify(txt));
  ok("บอกตรงๆ ว่าไม่มีเทรนด์ในหมวดนี้", txt.includes("ไม่มีเทรนด์ในหมวดนี้"), JSON.stringify(txt));
  ok("บอกด้วยว่าทำอะไรต่อได้", txt.includes("เปลี่ยนหมวด"), JSON.stringify(txt));
  ok("ไม่มี error", errs.length === 0, errs[0]);

  if (D.name === "trend") {
    console.log("\n[2] คอลัมน์ X / YouTube ก็ต้องไม่หมุนค้างเหมือนกัน");
    for (const src of ["xtrends", "yttrends"]) {
      const t = await page.locator(`.panel[data-source="${src}"] [data-list]`).innerText();
      ok(`${src} ไม่หมุนค้าง`, !t.includes("กรุณารอซักครู่"), JSON.stringify(t));
    }
  }

  console.log("\n[3] เลขเวอร์ชัน — ต้องอ่านจากหน้า ไม่ใช่เลขที่พิมพ์ค้างไว้ในโค้ด");
  const ver = await page.evaluate(() => (typeof APP_VER !== "undefined" ? APP_VER : null));
  ok(`APP_VER ตรงกับ ?v= ในหน้า (${D.ver})`, ver === D.ver, String(ver));

  console.log("\n[4] เวอร์ชันเท่ากัน ห้ามเด้งแถบ 'มีเวอร์ชันใหม่'");
  await page.route(/_ct=/, (r) => r.fulfill({ body: `<script src="./app.js?v=${D.ver}"></script>`, headers: { "content-type": "text/html" } }));
  await page.evaluate(() => checkForUpdate());
  await page.waitForTimeout(400);
  ok("ไม่มีแถบอัปเดตขึ้นมา", (await page.locator("#updbar").count()) === 0);

  console.log("\n[5] มีของใหม่จริง ค่อยเด้ง");
  await page.unroute(/_ct=/);
  await page.route(/_ct=/, (r) => r.fulfill({ body: `<script src="./app.js?v=${D.ver + 1}"></script>`, headers: { "content-type": "text/html" } }));
  await page.evaluate(() => checkForUpdate());
  await page.waitForTimeout(400);
  ok("เจอของใหม่แล้วเด้งแถบ", (await page.locator("#updbar").count()) === 1);

  console.log("\n[6] กลับเข้าแอป — ต้องไม่ยิงเช็คใหม่ทุกครั้ง (วันละครั้งพอ)");
  const page2 = await ctx.newPage();
  const hits = [];
  await page2.route("**/api/trend/trending**", (r) => r.fulfill({ json: { items: [], source: "trendingnow" } }));
  await page2.route("**/api/**", (r) => r.fulfill({ json: FEEDS }));
  await page2.route(/_ct=/, (r) => { hits.push(1); r.fulfill({ body: "<script src=\"./app.js?v=1\"></script>", headers: { "content-type": "text/html" } }); });
  await page2.goto(D.url, { waitUntil: "domcontentloaded" });
  await page2.waitForTimeout(1200);
  const atStart = hits.length;
  for (let i = 0; i < 3; i++) {
    await page2.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await page2.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await page2.waitForTimeout(200);
  }
  ok("สลับออก-เข้า 3 รอบ ไม่ยิงเช็คเวอร์ชันเพิ่มเลย", hits.length === atStart, `${atStart} → ${hits.length}`);
  await page2.close();

  await ctx.close();
}

console.log("\n════════ landing + sd ════════");
const metaVer = (file) => {
  const html = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const m = html.match(/<meta name="page-ver" content="(\d+)"\s*\/?>/); // landing เขียนแบบ <... />
  if (!m) throw new Error(`หา page-ver ใน ${file} ไม่เจอ`);
  return +m[1];
};
for (const [name, url, expect] of [["landing", "http://127.0.0.1:8899/", metaVer("index.html")], ["sd", "http://127.0.0.1:8899/sd.html", metaVer("sd.html")]]) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  await page.route("**://ssl.gstatic.com/**", (r) => r.abort());
  await page.route("**://trends.google.com/**", (r) => r.abort());
  await page.route("**/api/**", (r) => r.fulfill({ json: { sources: {} } }));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  const meta = await page.evaluate(() => +document.querySelector('meta[name="page-ver"]').content);
  ok(`${name}: page-ver = ${expect}`, meta === expect, String(meta));
  ok(`${name}: ไม่มีแถบ 'มีเวอร์ชันใหม่' โผล่เอง`, (await page.locator("#updbar").count()) === 0);
  await ctx.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
