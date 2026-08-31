const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const ctx = await b.newContext();
  const errs = [];

  // [1] ปกติ — ต้องโชว์เวอร์ชัน + โมเดล
  let page = await ctx.newPage();
  page.on("pageerror", e => errs.push(e.message));
  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const u = route.request().url();
    if (u.endsWith("/")) return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, ver: 16, rubric: "v5", model: "claude-opus-5" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ credits_remaining: 7070 }) });
  });
  await page.goto("http://localhost:8899/issue/sentiment.html");
  await page.waitForFunction(() => !document.querySelector("#verBadge").textContent.includes("กำลังถาม"), null, { timeout: 8000 });
  const t = await page.locator("#verBadge").textContent();
  console.log("[1] ป้ายเวอร์ชัน:", t.trim(), /v16/.test(t) && /opus/.test(t) ? "✅ บอกทั้งเวอร์ชันและโมเดล" : "❌");
  console.log("    tooltip:", (await page.locator("#verBadge").getAttribute("title")).slice(0, 60));

  // [2] ต่อหลังบ้านไม่ได้ — ต้องบอกว่าต่อไม่ได้ ไม่ใช่ค้างที่ 'กำลังถาม'
  const page2 = await ctx.newPage();
  page2.on("pageerror", e => errs.push(e.message));
  await page2.route("**/comment-sentiment.s3445028.workers.dev/**", r => r.abort());
  await page2.goto("http://localhost:8899/issue/sentiment.html");
  await page2.waitForFunction(() => !document.querySelector("#verBadge").textContent.includes("กำลังถาม"), null, { timeout: 8000 });
  console.log("[2] ตอน Worker ล่ม:", (await page2.locator("#verBadge").textContent()).trim(),
    /ต่อหลังบ้านไม่ได้/.test(await page2.locator("#verBadge").textContent()) ? "✅ บอกตรงๆ ไม่ค้าง" : "❌");

  console.log(errs.length ? "❌ " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
})();
