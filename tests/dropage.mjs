// รายการ "✂️ ข่าวที่ระบบตัดทิ้ง" บนหน้า admin โชว์แค่ 3 วันล่าสุด (เจ้าของสั่ง 14 ส.ค. 2026)
// ⚠️ กรองแค่ "การแสดงผล" — ข่าวเก่ายังถูกตัดอยู่เหมือนเดิม ห้ามไปแตะตรรกะการตัด
import fs from "node:fs";
import { chromium } from "playwright";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();

console.log("\n[1] ฝั่งเซิร์ฟเวอร์ — ต้องติดวันที่ข่าวไปกับรายการที่ถูกตัด");
for (const [name, f] of [["trend", "../functions/api/trend/feeds.js"],
                         ["ir", "../functions/api/ir/feeds.js"]]) {
  const src = fs.readFileSync(f, "utf8");
  ok(`${name}: verifyAlertItems ส่ง at มาด้วย`, /at: \(items\[i\] && items\[i\]\.publishedAt\) \|\| ""/.test(src));
}
{
  const lib = fs.readFileSync(new URL("../functions/api/_lib/noise.js", import.meta.url), "utf8");
  ok("ด่านกวาดของเก่า (dropNoiseAfterArchive) ก็ส่ง at", /at: it\.publishedAt \|\| ""/.test(lib));
}

console.log("\n[2] หน้า admin — กรอง 3 วัน");
const DROPPED = [
  { src: "alert1", why: "by-owner", title: "ข่าววันนี้ ที่เจ้าของสั่งตัด", link: "https://a/1", at: iso(0) },
  { src: "alert1", why: "by-owner", title: "ข่าวเมื่อวาน", link: "https://a/2", at: iso(1) },
  { src: "alert1", why: "by-owner", title: "ข่าว 2.9 วันที่แล้ว ยังทัน", link: "https://a/3", at: iso(2.9) },
  { src: "alert1", why: "by-owner", title: "ข่าว 5 วันที่แล้ว ต้องไม่โชว์", link: "https://a/4", at: iso(5) },
  { src: "alert1", why: "roundup", title: "ข่าว 9 วันที่แล้ว ต้องไม่โชว์", link: "https://a/5", at: iso(9) },
  { src: "alert2", why: "daily", title: "ข่าวไม่มีวันที่ ต้องยังโชว์", link: "https://a/6" },
];
const FEEDS = {
  generatedAt: new Date().toISOString(),
  sources: {},
  alertVerify: { dropped: DROPPED },
  swept: { dropped: [] },
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.route("**/api/**", (r) => r.fulfill({ json: FEEDS }));
await page.route("**/api/allow**", (r) => r.fulfill({ json: { count: 0, items: {}, blocked: {}, blockedCount: 0 } }));
await page.goto("http://127.0.0.1:8899/admin/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const openAll = async () => { await page.$$eval("#admDrop details", (ds) => ds.forEach((d) => (d.open = true))); await page.waitForTimeout(150); };
await openAll();
const txt = await page.locator("#admDrop").innerText();
ok("ไม่มี error บนหน้า", errs.length === 0, errs[0]);
ok("ข่าววันนี้ยังอยู่", txt.includes("ข่าววันนี้"), JSON.stringify(txt.slice(0, 300)));
ok("ข่าวเมื่อวานยังอยู่", txt.includes("ข่าวเมื่อวาน"));
ok("ข่าว 2.9 วัน ยังทัน", txt.includes("ยังทัน"));
ok("ข่าว 5 วัน ไม่โชว์", !txt.includes("ข่าว 5 วันที่แล้ว"), JSON.stringify(txt));
ok("ข่าว 9 วัน ไม่โชว์", !txt.includes("ข่าว 9 วันที่แล้ว"));
ok("ข่าวที่ไม่มีวันที่ ยังโชว์ (ตัดสินไม่ได้ ห้ามซ่อน)", txt.includes("ข่าวไม่มีวันที่"), JSON.stringify(txt));
ok("นับเฉพาะที่โชว์ = 4 ข่าว", /ตัดทิ้ง\s*4\s*ข่าว/.test(txt.replace(/\s+/g, " ")), JSON.stringify(txt.slice(0, 200)));
ok("บอกว่าโชว์แค่ 3 วันล่าสุด", txt.includes("3 วันล่าสุด"), JSON.stringify(txt.slice(0, 200)));
ok("บอกจำนวนที่ซ่อนไว้ (2 ใบ) ไม่ใช่หายเงียบ", /เก่ากว่านั้นอีก\s*2/.test(txt.replace(/\s+/g, " ")), JSON.stringify(txt.slice(0, 200)));

console.log("\n[3] ทุกใบเก่าหมด → ต้องบอกให้รู้ ไม่ใช่ขึ้นว่า 'ไม่มีอะไรถูกตัด' เฉยๆ");
{
  const old = { ...FEEDS, alertVerify: { dropped: DROPPED.filter((d) => d.at && new Date(d.at) < new Date(Date.now() - 4 * 86400000)) } };
  await page.unroute("**/api/**");
  await page.route("**/api/**", (r) => r.fulfill({ json: old }));
  await page.route("**/api/allow**", (r) => r.fulfill({ json: { count: 0, items: {}, blocked: {} } }));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const t2 = await page.locator("#admDrop").innerText();
  ok("บอกว่าไม่มีของใน 3 วันล่าสุด", t2.includes("3 วันล่าสุด"), JSON.stringify(t2));
  ok("และบอกว่ามีของเก่ากว่านั้นอยู่", /เก่ากว่านั้นอีก\s*2/.test(t2.replace(/\s+/g, " ")), JSON.stringify(t2));
}

console.log("\n[4] ปุ่ม ↩ เอากลับ ยังใช้ได้เหมือนเดิม");
{
  await page.unroute("**/api/**");
  await page.route("**/api/**", (r) => r.fulfill({ json: FEEDS }));
  await page.route("**/api/allow**", (r) => r.request().method() === "POST"
    ? r.fulfill({ json: { ok: true, mode: "allow", on: true, count: 1 } })
    : r.fulfill({ json: { count: 0, items: {}, blocked: {} } }));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.$$eval("#admDrop details", (ds) => ds.forEach((d) => (d.open = true)));
  const btn = page.locator("#admDrop .dropback").first();
  ok("มีปุ่มเอากลับ", (await btn.count()) === 1);
  await btn.click();
  await page.waitForTimeout(500);
  ok("กดแล้วบันทึกสำเร็จ", (await btn.innerText()).includes("เอากลับแล้ว"), await btn.innerText());
}

console.log("\n[5] ตรรกะการตัดต้องไม่ถูกแตะ — กรองแค่ตอนแสดงผล");
{
  const admin = fs.readFileSync(new URL("../admin/app.js", import.meta.url), "utf8");
  ok("ค่าอายุอยู่ที่เดียว", (admin.match(/const DROP_DAYS = 3;/g) || []).length === 1);
  ok("ใบไม่มีวันที่ไม่ถูกซ่อน", /if \(!isNaN\(t\) && t < cutoff\)/.test(admin));
  const lib = fs.readFileSync(new URL("../functions/api/_lib/noise.js", import.meta.url), "utf8");
  ok("ฝั่งเซิร์ฟเวอร์ไม่มีเพดานอายุมาเกี่ยว", !/DROP_DAYS/.test(lib));
}

await browser.close();
console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
