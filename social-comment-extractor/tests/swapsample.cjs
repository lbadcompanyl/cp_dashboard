/**
 * swapsample.cjs — ปุ่ม ✕ ตัดตัวอย่างที่ไม่ตรงประเด็นออก แล้วเอาใบอื่นมาแทน
 *
 * เจ้าของสั่ง 2 ก.ย. 2026: "อยากได้ปุ่มตัดตัวอย่างออกแล้วเปลี่ยนเป็นอันใหม่
 * เพราะบางสรุปไม่ตรงประเด็น"
 *
 * [2] [4] [5] คือข้อสำคัญที่สุด
 *   [2] ต้องเอา **ใบในกลุ่มเดียวกัน** มาแทน ไม่ใช่ใบไหนก็ได้
 *   [4] กดซ้ำต้องเดินหน้า ไม่วนกลับมาใบที่เพิ่งตัด
 *   [5] ถอดความไม่สำเร็จ = **ห้ามเปลี่ยน** ต้องคืนใบเดิม ไม่ใช่ปล่อยช่องว่าง
 */
const { chromium } = require("playwright");

/* บวก 4 ใบ (ถูกใจ 9/5/3/1) · ลบ 1 ใบ — ตัวอย่างตอนแรกคือใบถูกใจเยอะสุด 2 ใบ */
const AUDIT = [
  { text: "อร่อยมากครับ", sentiment: "positive", likes: 9 },
  { text: "ดีจังเลย", sentiment: "positive", likes: 5 },
  { text: "ชอบมาก", sentiment: "positive", likes: 3 },
  { text: "เยี่ยม", sentiment: "positive", likes: 1 },
  { text: "แพงไป", sentiment: "negative", likes: 2 },
  /* ⚠️ ใบลบใบนี้ **ถูกใจสูงกว่าใบบวกที่เหลือทุกใบ** และยังไม่ถูกใช้เป็นตัวอย่าง
     มีไว้เพื่อให้เทสต์จับได้ว่าโค้ดเลือกใบข้ามกลุ่มหรือเปล่า
     (ตอนแรกไม่มีใบนี้ → ลองทำให้เลือกข้ามกลุ่มแล้วเทสต์ยังผ่าน = จับไม่ได้) */
  { text: "ไม่ชอบเลย", sentiment: "negative", likes: 8 },
];
const BASE = {
  ok: true, platform: "facebook", target: "overall", model: "claude-opus-5", ver: 33, rubric: "v6",
  analyzed_count: 6, fetched_count: 6, no_text_count: 0,
  sentiment: { positive: 4, neutral: 0, negative: 2 },
  lenses: { cp: { positive: 0, neutral: 6, negative: 0 }, overall: { positive: 4, neutral: 0, negative: 2 } },
  audit: AUDIT, keywords: [], summary: "สรุป", summary_from: 5, summary_of: 5,
  samples: [
    { sentiment: "positive", text: "ถอดความ อร่อยมากครับ", src: 0 },
    { sentiment: "positive", text: "ถอดความ ดีจังเลย", src: 1 },
    { sentiment: "negative", text: "ถอดความ แพงไป", src: 4 },
  ],
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  let sent = [], paraMode = "ok";

  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const req = route.request(), u = req.url();
    const send = (o, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(o) });
    if (u.endsWith("/credits")) return send({ credits_remaining: 7000 });
    if (u.endsWith("/analyze")) return send(JSON.parse(JSON.stringify(BASE)));
    if (u.endsWith("/paraphrase")) {
      const body = JSON.parse(req.postData() || "{}");
      sent.push(body);
      if (paraMode === "fail") return send({ error: "paraphrase_failed", detail: "ต้นทางล่ม" }, 502);
      return send({ ok: true, ver: 33, texts: (body.texts || []).map(t => "ถอดความใหม่ของ " + t) });
    }
    if (u.endsWith("/")) return send({ ok: true, ver: 33, rubric: "v6", model: "claude-opus-5" });
    return send({});
  });

  let fail = 0;
  const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };
  const groups = () => page.evaluate(() =>
    [...document.querySelectorAll(".sc-sgroup")].map(g => ({
      head: g.querySelector(".sc-shead").textContent.replace(/\s+/g, " ").trim(),
      items: [...g.querySelectorAll(".sc-sample")].map(x => x.textContent.replace("✕", "").trim()),
    })));
  /** กดปุ่ม ✕ ของตัวอย่างที่มีคำว่า word */
  const cut = (word) => page.evaluate((w) => {
    const box = [...document.querySelectorAll(".sc-sample")].find(x => x.textContent.includes(w));
    box.querySelector(".sc-swap").click();
  }, word);
  const waitMsg = (re) => page.waitForFunction((r) =>
    new RegExp(r).test(document.querySelector("#swapMsg")?.textContent || ""), re.source, { timeout: 8000 });

  await page.goto("http://localhost:8899/issue/sentiment.html");
  await page.evaluate(() => { document.querySelector("#sampleList").innerHTML = ""; });
  await page.fill("#url", "https://www.facebook.com/reel/1");
  await page.click("#analyzeBtn");
  await page.waitForFunction(() => document.querySelectorAll(".sc-sample").length > 0, null, { timeout: 8000 });

  /* ── [1] ทุกตัวอย่างที่ผูกกับใบต้นทางต้องมีปุ่ม ✕ ─────────── */
  ok("[1] มีปุ่ม ✕ ครบทุกตัวอย่าง",
     await page.evaluate(() => document.querySelectorAll(".sc-sample").length === document.querySelectorAll(".sc-swap").length));

  /* ── [2] ⚠️ ตัดแล้วต้องได้ใบในกลุ่มเดียวกัน เรียงตามถูกใจ ── */
  await cut("อร่อยมากครับ");
  await waitMsg(/เปลี่ยนเป็นคอมเมนต์ใบอื่นแล้ว/);
  const g1 = await groups();
  console.log("   หลังตัดใบแรก: " + JSON.stringify(g1[0].items));
  ok("[2] ⚠️ ส่งใบถัดไป **ของกลุ่มบวก** ไปถอดความ (ถูกใจรองลงมาที่ยังไม่ได้ใช้ = 'ชอบมาก')",
     sent[0]?.texts?.[0] === "ชอบมาก", JSON.stringify(sent[0]));
  ok("[2b] ใบที่ถูกตัดหายไปแล้ว", !g1[0].items.some(t => t.includes("อร่อยมากครับ")));
  ok("[2c] ใบใหม่ขึ้นมาแทน", g1[0].items.some(t => t.includes("ถอดความใหม่ของ ชอบมาก")), JSON.stringify(g1[0].items));
  ok("[2d] จำนวนตัวอย่างเท่าเดิม ไม่ได้หายไปหนึ่ง", g1[0].items.length === 2);
  ok("[2e] 🚫 ไม่ไปแตะกลุ่มลบ", g1[1].items.length === 1 && g1[1].items[0].includes("แพงไป"), JSON.stringify(g1[1].items));

  /* ── [3] 🚫 ส่งไปแค่ข้อความ ไม่ส่งชื่อ/ลิงก์/ป้าย ─────────── */
  ok("[3] 🚫 คำขอมีแค่ข้อความ ไม่มีลิงก์โพสหรือชื่อคน",
     Object.keys(sent[0]).join(",") === "texts" && !/https?:/.test(JSON.stringify(sent[0])),
     Object.keys(sent[0]).join(","));

  /* ── [4] ⚠️ กดซ้ำต้องเดินหน้า ไม่วนกลับมาใบที่เพิ่งตัด ───── */
  await cut("ถอดความใหม่ของ ชอบมาก");
  await waitMsg(/เปลี่ยนเป็นคอมเมนต์ใบอื่นแล้ว/);
  ok("[4] ⚠️ กดซ้ำได้ใบถัดไป (เยี่ยม) ไม่วนกลับมาใบที่ตัดไปแล้ว",
     sent[1]?.texts?.[0] === "เยี่ยม", JSON.stringify(sent[1]));

  /* ── [5] ไม่มีใบเหลือ → บอกตรงๆ และเก็บใบเดิมไว้ ──────────── */
  await cut("ถอดความ ดีจังเลย");
  await waitMsg(/ไม่มีคอมเมนต์ใบอื่น/);
  const g3 = await groups();
  ok("[5] ไม่มีใบเหลือ → บอกตรงๆ", true);
  ok("[5b] ⚠️ และ **เก็บใบเดิมไว้** ไม่ใช่ปล่อยช่องว่าง",
     g3[0].items.some(t => t.includes("ดีจังเลย")), JSON.stringify(g3[0].items));
  ok("[5c] 🚫 ไม่ยิงคำขอเปล่าๆ ตอนไม่มีใบให้เปลี่ยน", sent.length === 2, `ยิงไป ${sent.length} ครั้ง`);

  /* ── [6] ⚠️ ถอดความไม่สำเร็จ → คืนใบเดิม ห้ามหายไปเฉยๆ ─────
     ⚠️ ต้องวิเคราะห์ใหม่ก่อน ไม่งั้นใบบวกถูกใช้/ตัดหมดแล้วจากข้อ [5]
        จะไปเจอทาง "ไม่มีใบเหลือ" แทน แล้วไม่ได้ทดสอบสิ่งที่ตั้งใจ */
  await page.evaluate(() => { document.querySelector("#sampleList").innerHTML = ""; });
  await page.click("#analyzeBtn");
  await page.waitForFunction(() => document.querySelectorAll(".sc-sample").length > 0, null, { timeout: 8000 });
  ok("[6-pre] วิเคราะห์ใหม่แล้วใบที่เคยตัดกลับมาใช้ได้ (ไม่ค้างข้ามโพส)",
     (await groups())[0].items.some(t => t.includes("อร่อยมากครับ")), JSON.stringify((await groups())[0].items));

  paraMode = "fail";
  await cut("ถอดความ อร่อยมากครับ");
  await waitMsg(/เปลี่ยนไม่สำเร็จ/);
  const g4 = await groups();
  ok("[6] ⚠️ ยิงไม่สำเร็จ → ใบเดิมยังอยู่",
     g4[0].items.some(t => t.includes("ถอดความ อร่อยมากครับ")), JSON.stringify(g4[0].items));
  ok("[6b] บอกเหตุผลให้อ่านได้", /ต้นทางล่ม|502/.test(await page.locator("#swapMsg").textContent()));
  ok("[6c] ปุ่มกลับมากดได้อีก ไม่ค้างเป็นไอคอนหมุน",
     await page.evaluate(() => [...document.querySelectorAll(".sc-swap")].every(b => !b.disabled)));

  console.log(errs.length ? "❌ JS error: " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
