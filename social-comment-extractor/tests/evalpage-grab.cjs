const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  let sent = null;
  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/")) return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, ver: 14, rubric: "v5", model: "m", models: ["m"] }) });
    if (url.endsWith("/comments")) {
      sent = JSON.parse(route.request().postData());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        ok: true, platform: "facebook", post_title: "รีลทดสอบ", credits_remaining: 97, count: 3,
        comments: [{ text: 'คอมเมนต์ไทย มี "อัญประกาศ" และ , จุลภาค', likes: 5, time: "2026-08-28" },
                   { text: "อันที่สอง", likes: 0, time: "" },
                   { text: "อันที่สาม 😡", likes: 2, time: "" }] }) });
    }
    return route.fulfill({ status: 404, body: "{}" });
  });
  await page.goto("http://localhost:8899/issue/sentiment-eval.html");
  await page.fill("#posturl", "https://www.facebook.com/reel/2183511618857767");
  const dl = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.click("#grab")]);
  const csv = fs.readFileSync(await dl[0].path(), "utf8");
  console.log("[1] ส่งไปที่ Worker:", JSON.stringify(sent));
  console.log("[2] หัวตาราง:", csv.split("\n")[0]);
  console.log("[3] คอลัมน์ตรงกับที่หน้าวัดผลต้องการ:",
    ["id","message","sentiment_cp","overall_cred"].every(c => csv.split("\n")[0].includes(c)) ? "✅ ครบ" : "❌ ขาด");
  console.log("[4] แถวแรก:", csv.split("\n")[1]);
  // หัวตาราง 1 บรรทัด + 3 แถว = 4 บรรทัด (ไม่มีบรรทัดว่างท้ายไฟล์)
  const n = csv.split("\n").length;
  console.log("[5] อัญประกาศ/จุลภาคในข้อความไม่ทำ CSV พัง:",
    n === 4 ? "✅ หัว 1 + ข้อมูล 3 แถว ตรงตามจำนวนคอมเมนต์" : "❌ ได้ " + n + " บรรทัด (ควรเป็น 4)");
  const info = (await page.locator("#grabinfo").textContent()).replace(/\s+/g," ");
  console.log("[6] แจ้งผล:", info.slice(0, 110));
  console.log(errs.length ? "❌ " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
})();
