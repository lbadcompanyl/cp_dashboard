/**
 * skipped.cjs — คอมเมนต์ที่ไม่มีข้อความ (สติกเกอร์/รูป) ต้องไม่หายเงียบ
 *
 * 🔄 เปลี่ยนพฤติกรรม 31 ส.ค. 2026 — เจ้าของสั่ง "sticker ไม่ตัด ใส่เป็น neutral เอง"
 *    เดิม: คัดทิ้ง → เลขบนจอไม่ตรงกับที่ดึงมา
 *    ตอนนี้: นับเป็นกลาง → เลขตรงกัน แต่ยังต้องบอกว่ามีกี่ใบ
 *    (ตรรกะฝั่ง worker คุมโดย notext.mjs · ไฟล์นี้คุมฝั่งหน้าเว็บ)
 *
 * เจ้าของเจอเอง 29 ส.ค. 2026: Facebook บอกว่ามี 20 คอมเมนต์
 *   = บนสุด 11 + reply 9 · เราดึงบนสุดมาครบ 11 · 3 ใบเป็นสติกเกอร์ไม่มีข้อความ → เหลือ 8
 * แต่หน้าเว็บขึ้นว่า "ดึงมา 8 คอมเมนต์" เฉยๆ ไม่มีอะไรบอกว่า 3 ใบไปไหน
 * → คนอ่านจะสรุปว่า "โพสนี้มีคนคอมเมนต์แค่ 8 คน" ซึ่งผิด
 *
 * [2] คือข้อสำคัญที่สุด — ห้ามเอา analyzed_count มาแปะป้ายว่า "ดึงมา"
 */
const { chromium } = require("playwright");

const base = {
  ok: true, platform: "facebook", target: "overall", model: "claude-opus-5", ver: 21, rubric: "v6",
  sentiment: { positive: 8, neutral: 0, negative: 0 },
  lenses: { cp: { positive: 0, neutral: 8, negative: 0 }, overall: { positive: 8, neutral: 0, negative: 0 } },
  audit: Array.from({ length: 8 }, (_, i) => ({ text: "คอมเมนต์ " + (i + 1), sentiment: "positive" })),
  samples: [], keywords: [],
};
// เคสจริงของเจ้าของ: ดึงมา 11 · คัดออก 3 · วิเคราะห์ 8
const WITH_SKIP = { ...base, fetched_count: 11, no_text_count: 3, analyzed_count: 11, reply_count: 0,
  sentiment: { positive: 8, neutral: 3, negative: 0 } };
// เคสปกติ: ไม่มีใบไหนถูกคัด
const NO_SKIP = { ...base, fetched_count: 8, no_text_count: 0, analyzed_count: 8, reply_count: 0 };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  let payload = WITH_SKIP;

  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const u = route.request().url();
    const send = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.endsWith("/credits")) return send({ credits_remaining: 7025 });
    if (u.endsWith("/analyze")) return send(payload);
    if (u.endsWith("/")) return send({ ok: true, ver: 21, rubric: "v6", model: "claude-opus-5" });
    return send({});
  });

  let fail = 0;
  const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };
  const run = async () => {
    /* ⚠️ ต้องล้างของรอบก่อนทิ้งก่อนเสมอ ไม่งั้น waitForFunction ผ่านทันทีจากข้อความเก่า
       แล้วเทสต์จะอ่านผลรอบก่อน — เป็น race ที่ทำให้ตกๆ ผ่านๆ ตอนรันทั้งชุด */
    await page.evaluate(() => { document.querySelector("#resSub").textContent = ""; });
    await page.fill("#url", "https://www.facebook.com/reel/1075429034954622");
    await page.click("#analyzeBtn");
    await page.waitForFunction(() => /คอมเมนต์/.test(document.querySelector("#resSub").textContent), null, { timeout: 8000 });
    return (await page.locator("#resSub").textContent()).replace(/\s+/g, " ").trim();
  };

  await page.goto("http://localhost:8899/issue/sentiment.html");
  const t = await run();
  console.log("   บรรทัดที่ขึ้นจริง: " + t);
  ok("[1] บอกจำนวนที่ดึงมาจริง (11)", /ดึงมา 11/.test(t));
  ok("[2] ⚠️ ห้ามเขียนว่า 'ดึงมา 8' — 8 ไม่ใช่จำนวนคอมเมนต์", !/ดึงมา 8/.test(t));
  ok("[3] ไม่ต้องมีคำว่า 'วิเคราะห์ได้' แล้ว (นับครบทุกใบ)", !/วิเคราะห์ได้/.test(t));
  ok("[4] บอกจำนวนสติกเกอร์และว่านับเป็นกลาง", /3 ใบ/.test(t) && /สติกเกอร์/.test(t) && /นับเป็นกลาง/.test(t));

  // ไม่มีใบไหนถูกคัด → อย่าขึ้นวงเล็บรกๆ
  payload = NO_SKIP;
  const t2 = await run();
  console.log("   ไม่มีใบถูกคัด: " + t2);
  ok("[5] ไม่มีสติกเกอร์ → ไม่ขึ้นวงเล็บอธิบายให้รก", !/สติกเกอร์/.test(t2) && /ดึงมา 8/.test(t2));

  // หลังบ้านรุ่นเก่าที่ยังไม่ส่ง skipped_no_text มา → ต้องไม่พัง
  payload = { ...base, analyzed_count: 8 };   // หลังบ้านรุ่นเก่าไม่ส่ง fetched_count/no_text_count
  const t3 = await run();
  ok("[6] หลังบ้านรุ่นเก่า (ไม่มีฟิลด์ใหม่) → ไม่พัง", /ดึงมา 8/.test(t3), t3);

  console.log(errs.length ? "❌ JS error: " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
