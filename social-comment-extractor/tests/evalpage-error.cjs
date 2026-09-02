const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/")) return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, ver: 10, rubric: "v5", model: "m", models: ["m"] }) });
    return route.fulfill({ status: 502, contentType: "application/json",
      body: JSON.stringify({ error: "classify_failed", detail: "คำตอบถูกตัดกลางคัน (max_tokens 4200) — ลดจำนวนข้อต่อก้อน" }) });
  });
  await page.goto("http://localhost:8899/issue/sentiment-eval.html");
  const rows = Array.from({ length: 40 }, (_, i) => `${i+1},"ข้อความ ${i+1}",Negative,Negative,0`);
  await page.setInputFiles("#file", { name: "t.csv", mimeType: "text/csv",
    buffer: Buffer.from("id,message,sentiment_cp,overall_cred,is_sarcasm\n" + rows.join("\n"), "utf8") });
  await page.waitForFunction(() => document.querySelector("#fileinfo").textContent.includes("อ่านได้"));
  await page.click("#run");
  await page.waitForSelector(".warn", { timeout: 30000 });
  const w = (await page.locator(".warn").first().textContent()).replace(/\s+/g, " ");
  console.log("กล่องเตือนแสดง:", w.slice(0, 200));
  console.log(/max_tokens/.test(w) ? "✅ เห็นข้อความ error จริงแล้ว" : "❌ ยังไม่โชว์สาเหตุ");
  console.log(errs.length ? "❌ " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
})();
