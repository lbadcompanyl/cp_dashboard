// IR ต้องโหลดเหมือน PR/Issue — เปิดหน้ามาขึ้นไอคอนหมุน ไม่ใช่โชว์ข่าวเก่าจากรอบที่แล้ว
// (เจ้าของแจ้ง 14 ส.ค. 2026: "IR แสดง feed เก่า ไม่มีโหลดแบบ PR")
import fs from "node:fs";
import { launch } from "./browser.mjs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

console.log("\n[1] ไม่เหลือโค้ดเก็บ/อ่านสำเนาข่าวในเครื่องแล้ว");
{
  const src = fs.readFileSync(new URL("../ir/app.js", import.meta.url), "utf8");
  ok("ไม่มี saveSnapshot/loadSnapshot", !/function (save|load)Snapshot/.test(src));
  ok("ไม่อ่านสำเนาเก่ามาโชว์", !/localStorage\.getItem\("ir_feeds_snapshot"\)/.test(src));
  ok("ไม่เขียนสำเนาใหม่ทับ", !/localStorage\.setItem\(SNAP_KEY/.test(src));
  ok("เก็บกวาดของเก่าที่ค้างในเครื่องผู้ใช้", /localStorage\.removeItem\("ir_feeds_snapshot"\)/.test(src));
  ok("โครง load() ตรงกับ PR (ขึ้น skeleton เฉพาะตอนไม่ silent)",
     /if \(!silent\) \{\s*\n\s*\$\("#updated"\)\.textContent = "กำลังโหลด…";/.test(src));
}

console.log("\n[2] เปิดหน้าจริง — 3 แดชบอร์ดต้องโหลดเหมือนกัน");
const FEEDS = (label) => ({
  generatedAt: new Date().toISOString(),
  sources: Object.fromEntries(["news", "newsth", "newsintl", "alert1", "alert2"].map((k) => [k, {
    label: k, feedCount: 1, items: [{
      title: label + " ข่าวสดรอบนี้", link: "https://a/" + k, snippet: "", publishedAt: new Date().toISOString(), sourceLabel: "x",
    }],
  }])),
});

const browser = await launch();

for (const [name, url] of [["ir", "http://127.0.0.1:8899/ir/"],
                           ["trend", "http://127.0.0.1:8899/trend/"],
                           ["issue", "http://127.0.0.1:8899/issue/"]]) {
  console.log(`-- ${name} --`);
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));

  // รอบแรก: โหลดปกติ แล้วปล่อยให้หน้าเก็บอะไรก็ตามที่มันอยากเก็บลงเครื่อง
  await page.route("**/api/**", (r) => r.fulfill({ json: FEEDS("รอบแรก") }));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  ok("รอบแรกเห็นข่าวสด", (await page.locator("body").innerText()).includes("รอบแรก"));

  // รอบสอง: เปิดหน้าใหม่โดยหน่วง API ไว้ — ระหว่างรอ ห้ามโชว์ข่าวของรอบแรก
  let release;
  const held = new Promise((res) => (release = res));
  await page.unroute("**/api/**");
  await page.route("**/api/**", async (r) => { await held; r.fulfill({ json: FEEDS("รอบสอง") }); });
  page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1200);

  const mid = await page.locator("body").innerText();
  ok("ระหว่างรอ ไม่โชว์ข่าวเก่าของรอบที่แล้ว", !mid.includes("รอบแรก"), JSON.stringify(mid.slice(0, 220)));
  ok("ระหว่างรอ ขึ้นข้อความกำลังโหลด", /กำลังดึงข้อมูล|กำลังโหลด/.test(mid), JSON.stringify(mid.slice(0, 220)));
  const spins = await page.locator(".panel [data-list] .spin").count();
  ok("มีไอคอนหมุนในคอลัมน์", spins > 0, String(spins));

  release();
  await page.waitForTimeout(1200);
  const done = await page.locator("body").innerText();
  ok("พอข้อมูลมาถึง แสดงของรอบใหม่", done.includes("รอบสอง"), JSON.stringify(done.slice(0, 200)));
  ok("ไม่มี error บนหน้า", errs.length === 0, errs[0]);
  await ctx.close();
}

console.log("\n[3] ไม่มีหน้าไหนแอบเก็บสำเนาข่าวไว้ในเครื่องอีก");
for (const [name, f] of [["ir", "../ir/app.js"],
                         ["trend", "../trend/app.js"],
                         ["issue", "../issue/app.js"]]) {
  const src = fs.readFileSync(f, "utf8");
  ok(`${name}: ไม่เก็บ snapshot ของ feed`, !/_snapshot"/.test(src) || /removeItem\("ir_feeds_snapshot"\)/.test(src));
}

await browser.close();
console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
