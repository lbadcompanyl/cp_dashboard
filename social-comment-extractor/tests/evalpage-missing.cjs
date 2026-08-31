const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/")) return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, ver: 10, rubric: "v5", model: "m", models: ["m"] }) });
    const body = JSON.parse(route.request().postData());
    // จำลองเคส opus: ครึ่งหนึ่งของก้อนโมเดลไม่ได้ตอบ (missing) แต่ HTTP 200 ปกติ
    const results = body.texts.map((t, i) => i % 2 === 0
      ? { sentiment_cp: "Negative", overall_cred: "Negative", is_sarcasm: 0 }
      : { sentiment_cp: "Neutral", overall_cred: "Neutral", is_sarcasm: 0, missing: true });
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, ver: 10, rubric: "v5", model: "m", results }) });
  });
  await page.goto("http://localhost:8899/issue/sentiment-eval.html");
  const rows = Array.from({ length: 40 }, (_, i) => `${i+1},"ข้อความ ${i+1}",Negative,Negative,0`);
  await page.setInputFiles("#file", { name: "t.csv", mimeType: "text/csv",
    buffer: Buffer.from("id,message,sentiment_cp,overall_cred,is_sarcasm\n" + rows.join("\n"), "utf8") });
  await page.waitForFunction(() => document.querySelector("#fileinfo").textContent.includes("อ่านได้"));
  await page.click("#run");
  await page.waitForSelector("#expcsv", { timeout: 30000 });
  const r = await page.evaluate(() => ({ n: window.__last.cp.n, acc: window.__last.cp.acc }));
  console.log("ทั้งหมด 40 ข้อ · โมเดลตอบจริง 20 ข้อ (อีก 20 ติดธง missing)");
  console.log("  วัดจริง:", r.n, r.n === 20 ? "✅ ไม่นับข้อที่โมเดลไม่ได้ตอบ" : "❌ ควรเป็น 20");
  console.log("  accuracy:", (r.acc*100).toFixed(0)+"%", r.acc === 1 ? "✅ ไม่ถูกเจือด้วย Neutral ปลอม" : "❌ ปนแล้ว");
  const warn = (await page.locator(".warn").first().textContent().catch(()=>"" )).replace(/\s+/g," ");
  console.log("  ป้ายเตือน:", /เกิน 20%/.test(warn) ? "✅ เตือนว่าเชื่อไม่ได้" : "❌ ไม่เตือน");
  console.log(errs.length ? "❌ " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
})();
