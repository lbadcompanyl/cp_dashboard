const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/")) return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, ver: 11, rubric: "v5", model: "m", models: ["m"] }) });
    const body = JSON.parse(route.request().postData());
    const results = body.texts.map(() => ({ sentiment_cp: "Negative", overall_cred: "Negative", is_sarcasm: 0 }));
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, ver: 11, rubric: "v5", model: "m", results, tokens: { input: 5000, output: 1500 } }) });
  });
  await page.goto("http://localhost:8899/issue/sentiment-eval.html");
  const rows = Array.from({ length: 80 }, (_, i) => `${i+1},"ข้อความ ${i+1}",Negative,Negative,0`);
  await page.setInputFiles("#file", { name: "t.csv", mimeType: "text/csv",
    buffer: Buffer.from("id,message,sentiment_cp,overall_cred,is_sarcasm\n" + rows.join("\n"), "utf8") });
  await page.waitForFunction(() => document.querySelector("#fileinfo").textContent.includes("อ่านได้"));
  await page.click("#run");
  await page.waitForSelector("#expcsv", { timeout: 30000 });
  const t = await page.evaluate(() => window.__tok);
  console.log("80 ข้อ = 2 ก้อน · ก้อนละ เข้า 5000 / ออก 1500");
  console.log("  รวมที่หน้าจอนับได้:", JSON.stringify(t),
    (t.input === 10000 && t.output === 3000) ? "✅ ถูก" : "❌ ผิด");
  const sum = (await page.locator("#out").textContent()).replace(/\s+/g," ");
  console.log("  แถบสรุปแสดง:", /โทเคนที่ใช้/.test(sum) ? "✅ โชว์โทเคน" : "❌ ไม่โชว์");
  const log = await page.locator("#log table tr").nth(1).textContent();
  console.log("  บันทึกรอบ:", log ? "✅ มีแถว" : "❌");
  console.log(errs.length ? "❌ " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
})();
