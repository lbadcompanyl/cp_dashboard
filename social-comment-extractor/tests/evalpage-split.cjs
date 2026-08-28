const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/")) return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, ver: 12, rubric: "v5", model: "claude-opus-5", models: ["claude-opus-5"] }) });
    const body = JSON.parse(route.request().postData());
    // จงใจให้ "ข้อ id คี่ ถูกหมด · id คู่ ผิดหมด" → ช่องว่างต้องกว้างและหน้าต้องเตือน
    const results = body.texts.map(t => {
      const n = +String(t).match(/#(\d+)#/)[1];
      return { sentiment_cp: n % 2 === 1 ? "Negative" : "Neutral",
               overall_cred: "Negative", is_sarcasm: 0 };
    });
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, ver: 12, rubric: "v5", model: "claude-opus-5", results, tokens: { input: 100, output: 50 } }) });
  });
  await page.goto("http://localhost:8899/issue/sentiment-eval.html");
  const rows = Array.from({ length: 60 }, (_, i) => `${i+1},"ข้อความ #${i+1}# ทดสอบ",Negative,Negative,0`);
  await page.setInputFiles("#file", { name: "t.csv", mimeType: "text/csv",
    buffer: Buffer.from("id,message,sentiment_cp,overall_cred,is_sarcasm\n" + rows.join("\n"), "utf8") });
  await page.waitForFunction(() => document.querySelector("#fileinfo").textContent.includes("อ่านได้"));
  await page.click("#run");
  await page.waitForSelector("#expcsv", { timeout: 30000 });

  const txt = (await page.locator("#out").textContent()).replace(/\s+/g, " ");
  console.log("[1] มีการ์ดเทียบ 2 ชุดไหม:", /เทียบข้อที่เคยเห็น/.test(txt) ? "✅ มี" : "❌ ไม่มี");
  const m = txt.match(/ห่างกัน (-?[\d.]+) จุด/);
  console.log("[2] ช่องว่างที่คำนวณได้:", m ? m[1] + " จุด" : "❌ ไม่เจอ",
    m && Math.abs(+m[1] - 100) < 0.5 ? "✅ ถูก (คี่ถูกหมด/คู่ผิดหมด = 100 จุด)" : "");
  console.log("[3] เตือนว่าเชื่อไม่ได้:", /สูงเกินจริง/.test(txt) ? "✅ เตือน" : "❌ ไม่เตือน");

  const dl = await Promise.all([page.waitForEvent("download"), page.click("#expcsv")]);
  const csv = fs.readFileSync(await dl[0].path(), "utf8");
  const head = csv.split("\n")[0];
  console.log("[4] CSV มีข้อมูลกำกับรอบ:", /model/.test(head) && /rubric/.test(head) ? "✅ มี" : "❌ ไม่มี");
  console.log("    แถวแรก:", csv.split("\n")[1].split(",").slice(-4).join(" | "));
  console.log(errs.length ? "❌ " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
})();
