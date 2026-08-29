const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  let aborted = false;
  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const u = route.request().url();
    if (u.endsWith("/")) return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, ver: 16, rubric: "v5", model: "claude-opus-5" }) });
    if (u.endsWith("/credits")) return route.fulfill({ status: 200, contentType: "application/json", body: '{"credits_remaining":7070}' });
    // /analyze — ค้างไว้ไม่ตอบ เลียนแบบรอบที่ใช้เวลานาน
    await new Promise(r => setTimeout(r, 30000));
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("http://localhost:8899/issue/sentiment.html");
  console.log("[1] ก่อนกดวิเคราะห์ ปุ่มหยุดซ่อนอยู่:", await page.locator("#stopBtn").isHidden() ? "✅ ซ่อน" : "❌ โผล่");

  await page.fill("#url", "https://www.facebook.com/reel/2183511618857767");
  await page.click("#analyzeBtn");
  await page.waitForSelector("#stopBtn:not([hidden])", { timeout: 5000 });
  console.log("[2] ระหว่างวิเคราะห์ ปุ่มหยุดโผล่:", "✅");
  console.log("    ปุ่มวิเคราะห์ถูกปิด:", await page.locator("#analyzeBtn").isDisabled() ? "✅" : "❌");

  await page.click("#stopBtn");
  await page.waitForFunction(() => document.querySelector("#stopBtn").hidden, null, { timeout: 5000 });
  console.log("[3] หลังกดหยุด — ปุ่มหยุดซ่อน:", "✅");
  console.log("    ปุ่มวิเคราะห์กลับมากดได้:", await page.locator("#analyzeBtn").isDisabled() ? "❌ ยังปิดอยู่" : "✅");
  console.log("    ไอคอนหมุนหยุด:", await page.locator("#loading").evaluate(e => !e.classList.contains("sc-show")) ? "✅" : "❌");
  const err = await page.locator("#err").textContent();
  console.log("    ไม่ขึ้นแถบแดงว่า error:", err.trim() === "" ? "✅ (กดหยุดเองไม่ใช่ error)" : "❌ ขึ้นว่า: " + err.trim());

  // กดวิเคราะห์ซ้ำได้หลังหยุด
  await page.click("#analyzeBtn");
  await page.waitForSelector("#stopBtn:not([hidden])", { timeout: 5000 });
  console.log("[4] กดวิเคราะห์ใหม่หลังหยุดได้:", "✅");
  console.log(errs.length ? "❌ " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
})();
