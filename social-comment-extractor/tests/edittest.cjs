const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.goto("http://localhost:8899/issue/sentiment.html?demo=1");
  await page.fill("#url", "https://www.youtube.com/watch?v=demo1234567");
  await page.click("#analyzeBtn");
  await page.waitForSelector("#auditCard", { state: "visible", timeout: 15000 });
  // การ์ด audit เป็น <details> ต้องกางก่อนถึงจะกดปุ่มข้างในได้
  await page.evaluate(() => { document.querySelector("#auditCard").open = true; });
  await page.waitForSelector(".sc-fix", { state: "visible", timeout: 10000 });

  const donutBefore = (await page.locator("#donutWrap, .sc-donut, #results").first().textContent()).replace(/\s+/g," ").slice(0, 120);
  const before = await page.locator("#auditFilter").textContent();
  console.log("[1] ตัวกรองก่อนแก้:", before.replace(/\s+/g," ").trim());

  // แก้ใบแรกที่ยังไม่ใช่ "บวก" ให้เป็น "บวก"
  const row = page.locator(".sc-arow").first();
  const tagBefore = (await row.locator(".sc-atag").textContent()).trim();
  const target = tagBefore === "บวก" ? "ลบ" : "บวก";
  await row.locator(`.sc-fix:text-is("${target}")`).click();
  await page.waitForTimeout(300);

  const tagAfter = (await page.locator(".sc-arow").first().locator(".sc-atag").textContent()).trim();
  console.log(`[2] ป้ายเปลี่ยน ${tagBefore} → ${tagAfter}:`, tagAfter === target ? "✅" : "❌");

  const after = await page.locator("#auditFilter").textContent();
  console.log("[3] ตัวกรองหลังแก้:", after.replace(/\s+/g," ").trim());
  console.log("    ตัวเลขในตัวกรองขยับ:", before !== after ? "✅" : "❌ ไม่ขยับ");

  const sub = await page.locator("#resSub").textContent();
  console.log("[4] หัวบอกว่าแก้เอง:", /แก้เอง 1 ใบ/.test(sub) ? "✅" : "❌ " + sub.slice(0,60));

  const mark = await page.locator(".sc-editmark").count();
  console.log("[5] ใบที่แก้มีป้าย ✏️:", mark >= 1 ? "✅" : "❌");

  // ส่วนสรุปด้านบนต้องขยับตามด้วย ไม่ใช่ค้างเลขเดิม
  const donutAfter = (await page.locator("#donutWrap, .sc-donut, #results").first().textContent()).replace(/\s+/g," ").slice(0, 120);
  console.log("[6] ส่วนสรุปด้านบนขยับตาม:", donutBefore !== donutAfter ? "✅ เปลี่ยนแล้ว" : "❌ ค้างเลขเดิม");

  // ปุ่มเดียว
  console.log("[7] มีปุ่มหยุดแยกไหม:", await page.locator("#stopBtn").count() === 0 ? "✅ ไม่มีแล้ว (ปุ่มเดียว)" : "❌ ยังมี");
  console.log(errs.length ? "❌ " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
})();
