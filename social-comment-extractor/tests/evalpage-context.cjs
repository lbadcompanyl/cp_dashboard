const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  const seenCtx = new Set();

  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/")) return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, ver: 6, rubric: "v3", model: "m" }) });
    const body = JSON.parse(route.request().postData());
    if (body.context) seenCtx.add(body.context);
    const results = body.texts.map(t => {
      const n = +String(t).match(/#(\d+)#/)[1];
      return { sentiment_cp: n % 3 === 0 ? "Negative" : n % 3 === 1 ? "Positive" : "Neutral",
               overall_cred: "Neutral", is_sarcasm: 0 };
    });
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, ver: 6, rubric: "v3", model: "m", results }) });
  });

  await page.goto("http://localhost:8899/issue/sentiment-eval.html");
  // สลับหัวข้อไปมาทุกแถว → พอจัดกลุ่มตามหัวข้อ ลำดับจะพลิกทั้งตาราง
  const topics = ["ผลิตภัณฑ์", "ระบบนิเวศ", "ภาครัฐ"];
  const rows = Array.from({ length: 90 }, (_, i) => {
    const n = i + 1;
    const cp = n % 3 === 0 ? "Negative" : n % 3 === 1 ? "Positive" : "Neutral";
    return `${n},"คอมเมนต์ #${n}# ทดสอบ",${topics[i % 3]},${cp},Neutral,0`;
  });
  const csv = "id,message,topic,sentiment_cp,overall_cred,is_sarcasm\n" + rows.join("\n");
  await page.setInputFiles("#file", { name: "t.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await page.waitForFunction(() => document.querySelector("#fileinfo").textContent.includes("อ่านได้"));

  console.log("ช่องติ๊กบริบทโผล่ไหม:", await page.locator("#ctxwrap").isVisible() ? "✅ โผล่ (ไฟล์มี topic)" : "❌ ไม่โผล่");
  await page.check("#ctx");
  await page.click("#run");
  await page.waitForSelector("#expcsv", { timeout: 60000 });

  const r = await page.evaluate(() => ({ n: window.__last.cp.n, acc: window.__last.cp.acc }));
  console.log("วัด", r.n, "ข้อ · accuracy", (r.acc*100).toFixed(1)+"% ·",
    r.acc === 1 ? "✅ แถวไม่เลื่อนแม้จะจัดกลุ่มใหม่ตามหัวข้อ" : "❌ แถวเลื่อน! (บั๊กเงียบ)");
  console.log("บริบทที่ส่งไปจริง", seenCtx.size, "แบบ:");
  [...seenCtx].forEach(c => console.log("   ·", c));
  const logRow = await page.locator("#log table tr").nth(1).textContent();
  console.log("บันทึกรอบนี้บอกว่าส่งบริบท:", /ส่ง/.test(logRow) ? "✅ บันทึกไว้" : "❌ ไม่ได้บันทึก");
  console.log(errs.length ? "❌ " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
})();
