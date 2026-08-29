/**
 * teachbox.cjs — ชั้น ② บนหน้าเว็บ: ปุ่มส่งที่แก้ไว้เข้ากองรอตรวจ
 *
 * สิ่งที่ต้องคุมให้ได้ (เรียงตามความอันตราย)
 *  [4] หลังบ้านตอบ stored:false มาพร้อม status 200 → ห้ามขึ้นว่าส่งสำเร็จ
 *  [6] ห้ามส่งชื่อ/ลิงก์โพสไปกับ payload
 *  [2] ห้ามส่งอัตโนมัติตอนกดแก้ป้าย — ต้องรอผู้ใช้กดปุ่มเอง
 */
const { chromium } = require("playwright");

const RESULT = {
  ok: true, platform: "facebook", target: "overall", analyzed_count: 4, model: "claude-opus-5",
  ver: 19, rubric: "v6", post_title: "โพสทดสอบ",
  sentiment: { positive: 1, neutral: 1, negative: 2 },
  lenses: { cp: { positive: 0, neutral: 4, negative: 0 }, overall: { positive: 1, neutral: 1, negative: 2 } },
  audit: [
    { text: "ดูยังไม่จบก็ตำหนิแล้ว", sentiment: "negative" },
    { text: "อร่อยมากครับ", sentiment: "positive" },
    { text: "ราคาเท่าไหร่", sentiment: "neutral" },
    { text: "แย่มาก ไม่ซื้ออีกแล้ว", sentiment: "negative" },
  ],
  samples: [], keywords: [],
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  let fbBody = null, fbCalls = 0, fbReply = { ok: true, stored: true, added: 1, skipped: 0, total: 1 };

  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const req = route.request(), u = req.url();
    const send = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.endsWith("/credits")) return send({ credits_remaining: 7070 });
    if (u.includes("/feedback")) { fbCalls++; fbBody = JSON.parse(req.postData() || "{}"); return send(fbReply); }
    if (u.endsWith("/analyze")) return send(RESULT);
    if (u.endsWith("/")) return send({ ok: true, ver: 19, rubric: "v6", model: "claude-opus-5" });
    return send({});
  });

  await page.goto("http://localhost:8899/issue/sentiment.html");
  await page.fill("#url", "https://www.facebook.com/reel/2183511618857767");
  await page.click("#analyzeBtn");
  await page.waitForSelector("#auditCard", { state: "attached" });
  await page.waitForFunction(() => document.querySelectorAll(".sc-fix").length > 0, null, { timeout: 8000 });
  await page.evaluate(() => { document.querySelector("#auditCard").open = true; });

  let fail = 0;
  const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

  ok("[1] ยังไม่แก้อะไร กล่องส่งต้องซ่อน", await page.locator("#teachBox").isHidden());

  // แก้ใบแรก: ลบ → บวก
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".sc-arow")].find(r => r.textContent.includes("ดูยังไม่จบ"));
    [...row.querySelectorAll(".sc-fix")].find(b => b.dataset.s === "positive").click();
  });
  await page.waitForSelector("#teachBox:not([hidden])", { timeout: 5000 });
  ok("[2] แก้แล้วกล่องโผล่ แต่ยังไม่ส่งเอง", fbCalls === 0, `ยิงไปแล้ว ${fbCalls} ครั้ง`);
  ok("[2b] ปุ่มบอกจำนวนใบ", /\(1 ใบ\)/.test(await page.locator("#teachBtn").textContent()),
     (await page.locator("#teachBtn").textContent()).trim());

  // ── กรณีหลังบ้านยังไม่ได้ผูก KV: ตอบ 200 แต่ stored:false ──
  fbReply = { ok: false, stored: false, reason: "no_kv", detail: "ยังไม่ได้ผูก KV (FEEDBACK_KV) ที่ Cloudflare" };
  await page.click("#teachBtn");
  await page.waitForSelector("#teachMsg:not([hidden])", { timeout: 5000 });
  const bad = (await page.locator("#teachMsg").textContent()).trim();
  ok("[3] ยิงไปหลังบ้านจริง", fbCalls === 1, `ยิง ${fbCalls} ครั้ง`);
  ok("[4] stored:false ต้องไม่ขึ้นว่าสำเร็จ ⚠️",
     /ไม่สำเร็จ/.test(bad) && !/ส่งเข้ากองรอตรวจแล้ว/.test(bad), bad);
  ok("[4b] ขึ้นเป็นสีเตือน", await page.locator("#teachMsg").evaluate(e => e.classList.contains("sc-bad")));
  ok("[4c] ส่งไม่ผ่าน ปุ่มต้องกดซ้ำได้", !(await page.locator("#teachBtn").isDisabled()));

  // ── กรณีสำเร็จจริง ──
  fbReply = { ok: true, stored: true, added: 1, skipped: 0, total: 12 };
  await page.click("#teachBtn");
  await page.waitForFunction(() => /ส่งเข้ากองรอตรวจแล้ว/.test(document.querySelector("#teachMsg").textContent), null, { timeout: 5000 });
  ok("[5] สำเร็จแล้วบอกจำนวนในกอง", /กองมี 12 ใบ/.test(await page.locator("#teachMsg").textContent()));
  ok("[5b] บอกด้วยว่ายังไม่มีผลกับ AI", /ยังไม่มีผลกับ AI/.test(await page.locator("#teachMsg").textContent()));
  ok("[5c] ส่งแล้วกล่องหายไป (ไม่มีของค้าง)", await page.locator("#teachBox").isHidden());

  // ── payload ที่ส่งจริง ──
  const it = fbBody.items[0];
  ok("[6] ส่งเฉพาะข้อความ+ป้าย ไม่มีชื่อ/ลิงก์ 🔒",
     !("name" in it) && !("url" in it) && !("post_title" in it) && !("link" in it),
     "คีย์: " + Object.keys(it).join(","));
  ok("[6b] ป้ายเดิม/ป้ายใหม่ถูกต้อง", it.was === "negative" && it.now === "positive",
     `${it.was} → ${it.now}`);
  ok("[6c] บอกแกนที่แก้", it.target === "overall", it.target);
  ok("[6d] ติดเวอร์ชันไปด้วย ไว้ไล่ย้อน", it.ver === 19 && it.rubric === "v6", `ver=${it.ver} rubric=${it.rubric}`);

  // ── วิเคราะห์โพสใหม่ = เริ่มนับใหม่ ──
  await page.click("#analyzeBtn");
  await page.waitForFunction(() => document.querySelector("#teachMsg").hidden, null, { timeout: 8000 });
  ok("[7] วิเคราะห์รอบใหม่ ล้างสถานะเดิม", await page.locator("#teachBox").isHidden());

  console.log(errs.length ? "❌ JS error: " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
