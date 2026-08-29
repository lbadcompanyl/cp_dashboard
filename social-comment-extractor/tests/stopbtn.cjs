/**
 * stopbtn.cjs — ปุ่มเดียวสลับ วิเคราะห์ ⇄ หยุด
 * เดิมเป็น 2 ปุ่ม (#analyzeBtn + #stopBtn) เจ้าของสั่งรวมเป็นปุ่มเดียว 29 ส.ค. 2026
 * เทสต์นี้จึงวัด "ปุ่มเดิมเปลี่ยนคำ" ไม่ใช่ "ปุ่มที่สองโผล่มา"
 */
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const u = route.request().url();
    if (u.endsWith("/")) return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, ver: 18, rubric: "v6", model: "claude-opus-5" }) });
    if (u.endsWith("/credits")) return route.fulfill({ status: 200, contentType: "application/json", body: '{"credits_remaining":7070}' });
    // /analyze — ค้างไว้ไม่ตอบ เลียนแบบรอบที่ใช้เวลานาน
    await new Promise(r => setTimeout(r, 30000));
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("http://localhost:8899/issue/sentiment.html");

  const label = () => page.locator("#analyzeBtn").textContent();
  const nBtn = await page.locator("#stopBtn").count();
  console.log("[1] ไม่มีปุ่มหยุดแยกแล้ว:", nBtn === 0 ? "✅ ปุ่มเดียว" : "❌ ยังมี #stopBtn อยู่");
  console.log("    ก่อนกด ปุ่มเขียนว่า:", (await label()).trim());

  await page.fill("#url", "https://www.facebook.com/reel/2183511618857767");
  await page.click("#analyzeBtn");
  await page.waitForFunction(() => /หยุด/.test(document.querySelector("#analyzeBtn").textContent), null, { timeout: 5000 });
  console.log("[2] ระหว่างวิเคราะห์ ปุ่มเปลี่ยนเป็นหยุด:", "✅", (await label()).trim());
  console.log("    ปุ่มยังกดได้ (ไม่ถูก disable):", await page.locator("#analyzeBtn").isDisabled() ? "❌ กดไม่ได้" : "✅");

  await page.click("#analyzeBtn");
  await page.waitForFunction(() => /วิเคราะห์/.test(document.querySelector("#analyzeBtn").textContent), null, { timeout: 5000 });
  console.log("[3] กดแล้วหยุดจริง — ปุ่มกลับเป็นวิเคราะห์:", "✅", (await label()).trim());
  console.log("    ไอคอนหมุนหยุด:", await page.locator("#loading").evaluate(e => !e.classList.contains("sc-show")) ? "✅" : "❌");
  const err = await page.locator("#err").textContent();
  console.log("    ไม่ขึ้นแถบแดงว่า error:", err.trim() === "" ? "✅ (กดหยุดเองไม่ใช่ error)" : "❌ ขึ้นว่า: " + err.trim());

  // กดวิเคราะห์ซ้ำได้หลังหยุด
  await page.click("#analyzeBtn");
  await page.waitForFunction(() => /หยุด/.test(document.querySelector("#analyzeBtn").textContent), null, { timeout: 5000 });
  console.log("[4] กดวิเคราะห์ใหม่หลังหยุดได้:", "✅");
  console.log(errs.length ? "❌ " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
})();
