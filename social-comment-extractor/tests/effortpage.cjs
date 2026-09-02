/**
 * effortpage.cjs — หน้าวัดผล: ช่องเลือกระดับการคิด + การรายงานโทเคนแคช
 *
 * [3] คือข้อสำคัญที่สุด — ถ้าแคชไม่ทำงาน ต้องขึ้นเตือนให้เห็น
 *     ไม่ใช่แสดงตัวเลข 0 เงียบๆ ให้เข้าใจว่าปกติ (กฎ "ไม่รู้ ≠ ค่าใดค่าหนึ่ง")
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// ไฟล์เฉลยจำลอง 6 ข้อ — ไม่ใช่ของจริง ไม่มีคอมเมนต์ของใคร
const CSV = [
  "id,message,topic,sentiment_cp,overall_cred,is_sarcasm",
  "1,ซื้อของซีพีอร่อยมาก,cpf,Positive,Positive,0",
  "2,ซีพีผูกขาดตลาด,cpf,Negative,Negative,0",
  "3,ราคาเท่าไหร่ครับ,cpf,Neutral,Neutral,0",
  "4,รัฐบาลห่วยมาก,pm25,Neutral,Negative,0",
  "5,ซีพีช่วยชาวบ้านจริง,cpf,Positive,Positive,0",
  "6,เจ้าสัวรวยขึ้นทุกปี,cpf,Negative,Negative,0",
].join("\n");

(async () => {
  const tmp = path.join(process.env.TMPDIR || "/tmp", "eval-mini.csv");
  fs.writeFileSync(tmp, "﻿" + CSV);

  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  const bodies = [];
  let withCache = true;

  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const req = route.request(), u = req.url();
    const send = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.endsWith("/")) return send({ ok: true, ver: 22, rubric: "v6", model: "claude-opus-5",
                                       models: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"] });
    if (u.endsWith("/classify")) {
      const body = JSON.parse(req.postData() || "{}");
      bodies.push(body);
      return send({
        ok: true, ver: 22, rubric: "v6", model: body.model || "claude-opus-5", effort: body.effort || null,
        results: body.texts.map(() => ({ sentiment_cp: "Neutral", overall_cred: "Neutral", is_sarcasm: 0 })),
        tokens: withCache
          ? { input: 300, output: 200, cache_write: 3000, cache_read: 9000 }
          : { input: 300, output: 200, cache_write: 0, cache_read: 0 },
      });
    }
    return send({});
  });

  let fail = 0;
  const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };
  const run = async () => {
    bodies.length = 0;
    /* ⚠️ ต้องล้างผลรอบก่อนทิ้งก่อนเสมอ ไม่งั้นเทสต์จะอ่านผลรอบเก่าแล้วผ่านแบบหลอกๆ
       (เจอจริงตอนเขียน: ข้อ [5] ผ่านทั้งที่ยังไม่ได้รันรอบใหม่) */
    await page.evaluate(() => { document.querySelector("#out").innerHTML = ""; });
    await page.setInputFiles("#file", tmp);
    await page.waitForFunction(() => !document.querySelector("#run").disabled, null, { timeout: 8000 });
    await page.click("#run");
    await page.waitForFunction(() => /โทเคนที่ใช้/.test(document.querySelector("#out").textContent), null, { timeout: 15000 });
  };

  await page.goto("http://localhost:8899/issue/sentiment-eval.html");
  await page.waitForFunction(() => document.querySelector("#model").options.length > 1, null, { timeout: 8000 });

  ok("[1] มีช่องเลือกระดับการคิด", await page.locator("#effort").count() === 1);
  ok("[1b] ค่าตั้งต้นคือ 'ไม่สั่ง' (ของเดิมไม่เปลี่ยน)", (await page.locator("#effort").inputValue()) === "");

  // ── ไม่เลือกระดับ → ต้องไม่ส่งฟิลด์ไปเลย ──
  await run();
  ok("[2] ไม่เลือกระดับ → ไม่ส่ง effort ไปหลังบ้าน",
     bodies.length > 0 && bodies.every(x => x.effort === undefined),
     `ยิงไป ${bodies.length} ก้อน`);

  // ── เลือก low → ต้องส่งไปทุกก้อน ──
  await page.selectOption("#effort", "low");
  await run();
  ok("[3] เลือก low → ส่งไปทุกก้อน", bodies.length > 0 && bodies.every(x => x.effort === "low"));
  const head = await page.locator("#out").textContent();
  ok("[3b] หัวผลลัพธ์บอกว่าคิดระดับไหน", /คิดระดับ\s*low/.test(head.replace(/\s+/g, " ")));

  // ── รายงานโทเคนแคชแยกก้อน ──
  ok("[4] บอกจำนวนโทเคนที่อ่านจากแคช", /อ่านแคช/.test(head), head.match(/โทเคนที่ใช้[^·]*(·[^·]*){0,3}/)?.[0]?.trim());
  ok("[4b] แยกเขียนแคชกับอ่านแคชคนละก้อน", /เขียนแคช/.test(head) && /อ่านแคช/.test(head));

  // ── ⚠️ แคชไม่ทำงาน ต้องเตือน ไม่ใช่โชว์ 0 เงียบๆ ──
  withCache = false;
  await run();
  const head2 = await page.locator("#out").textContent();
  ok("[5] ⚠️ แคชไม่ทำงาน → ขึ้นเตือนให้เห็น", /แคชไม่ทำงาน/.test(head2), "ขึ้นว่า: " + (head2.match(/แคชไม่ทำงาน/) || ["ไม่ขึ้นเลย"])[0]);

  // ── บันทึกรอบเก็บค่าใหม่ครบ ──
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem("sentEvalLog") || "[]")[0] || {});
  ok("[6] บันทึกรอบเก็บระดับการคิดไว้ด้วย", "effort" in log, JSON.stringify({ effort: log.effort }));
  ok("[6b] บันทึกรอบเก็บโทเคนแคชไว้ด้วย", "cache_r" in log && "cache_w" in log,
     JSON.stringify({ cache_w: log.cache_w, cache_r: log.cache_r }));

  console.log(errs.length ? "❌ JS error: " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
