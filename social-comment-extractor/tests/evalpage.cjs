const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));

  let call = 0;
  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/")) return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, ver: 6, rubric: "v3", model: "m" }) });
    const body = JSON.parse(route.request().postData());
    call++;
    // ก้อนที่ 3 จงใจล้ม — ต้องไม่ทำให้ทั้งชุดพัง และต้องไม่เดาแทน
    if (call === 3) return route.fulfill({ status: 502, contentType: "application/json",
      body: JSON.stringify({ error: "classify_failed", detail: "จำลองต้นทางล่ม" }) });
    // ตอบป้ายตาม "เฉลยจริง" ที่ฝังอยู่ในข้อความ เพื่อพิสูจน์ว่าแถวไม่เลื่อน
    const results = body.texts.map(t => {
      const m = String(t).match(/#(\d+)#/);
      const n = m ? +m[1] : 0;
      return { sentiment_cp: n % 3 === 0 ? "Negative" : n % 3 === 1 ? "Positive" : "Neutral",
               overall_cred: "Neutral", is_sarcasm: 0 };
    });
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, ver: 6, rubric: "v3", model: "m", results }) });
  });

  await page.goto("http://localhost:8899/issue/sentiment-eval.html");
  // สร้าง CSV ที่ "เฉลย" ตรงกับกติกาข้างบนเป๊ะ → ถ้าไม่เลื่อน accuracy ต้องเป็น 100%
  const rows = Array.from({ length: 120 }, (_, i) => {
    const n = i + 1;
    const cp = n % 3 === 0 ? "Negative" : n % 3 === 1 ? "Positive" : "Neutral";
    return `${n},"คอมเมนต์ทดสอบ #${n}# ข้อความไทย",${cp},Neutral,0`;
  });
  const csv = "id,message,sentiment_cp,overall_cred,is_sarcasm\n" + rows.join("\n");
  await page.setInputFiles("#file", { name: "t.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await page.waitForFunction(() => document.querySelector("#fileinfo").textContent.includes("อ่านได้"));
  await page.click("#run");
  await page.waitForSelector("#expcsv", { timeout: 60000 });

  const r = await page.evaluate(() => ({ n: window.__last.cp.n, acc: window.__last.cp.acc }));
  console.log("ทั้งหมด 120 ข้อ · ก้อนที่ 3 จงใจล้ม (40 ข้อ)");
  console.log("วัดจริง:", r.n, "ข้อ ·", r.n === 80 ? "✅ ไม่นับข้อที่ไม่ได้ผลกลับมา" : "❌ ควรเป็น 80");
  console.log("accuracy:", (r.acc*100).toFixed(1)+"% ·", r.acc === 1 ? "✅ แถวไม่เลื่อน" : "❌ แถวเลื่อน!");
  const warn = await page.locator(".warn").first().textContent().catch(() => "");
  console.log("ป้ายเตือน:", warn.trim().replace(/\s+/g," ").slice(0,90) || "❌ ไม่ขึ้น");
  console.log(errs.length ? "❌ error: " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
})();
