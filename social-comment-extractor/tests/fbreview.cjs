/**
 * fbreview.cjs — ชั้น ③ บนหน้าวัดผล: กล่อง "กองรอตรวจ"
 *
 * สิ่งที่ต้องคุมให้ได้
 *  [3] กุญแจผิด/ยังไม่ตั้ง → บอกเป็นภาษาคน ไม่ใช่โยนรหัสดิบให้อ่าน
 *  [5] จับกลุ่มตาม pattern และ **บอกว่าครบ 3 ใบหรือยัง** (กฎข้อ 3 ของ FEEDBACK.md)
 *  [7] ล้างกองต้องถามยืนยันก่อน — กดพลาดแล้วเอากลับไม่ได้
 */
const { chromium } = require("playwright");

const ITEMS = [
  { text: "ดูยังไม่จบก็ตำหนิแล้ว", was: "negative", now: "positive", target: "overall", at: "2026-08-29", model: "claude-opus-5", ver: 19, rubric: "v6" },
  { text: "อ่านข่าวก่อนค่อยด่านะ", was: "negative", now: "positive", target: "overall", at: "2026-08-29", model: "claude-opus-5", ver: 19, rubric: "v6" },
  { text: "ไม่ได้ดูคลิปแล้วมาบ่น", was: "negative", now: "positive", target: "overall", at: "2026-08-29", model: "claude-opus-5", ver: 19, rubric: "v6" },
  { text: "ซื้อที่ไหนได้บ้างคะ", was: "positive", now: "neutral", target: "cp", at: "2026-08-29", model: "claude-opus-5", ver: 19, rubric: "v6" },
];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  let mode = "ok", lastUrl = "", cleared = false;

  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const u = route.request().url();
    const send = (o, st = 200) => route.fulfill({ status: st, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("/feedback")) {
      lastUrl = u;
      if (mode === "badkey") return send({ error: "bad_key" }, 403);
      if (mode === "nokey") return send({ error: "read_disabled", detail: "ยังไม่ได้ตั้ง FEEDBACK_KEY ที่ Cloudflare" }, 403);
      if (u.includes("clear=1")) { cleared = true; return send({ ok: true, cleared: ITEMS.length, items: [] }); }
      return send({ ok: true, ver: 19, count: ITEMS.length, max: 500, items: ITEMS });
    }
    if (u.endsWith("/")) return send({ ok: true, ver: 19, rubric: "v6", model: "claude-opus-5", models: ["claude-opus-5"] });
    return send({});
  });

  await page.goto("http://localhost:8899/issue/sentiment-eval.html");
  let fail = 0;
  const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };
  const info = () => page.locator("#fbinfo").textContent();

  ok("[1] ยังไม่เปิดกอง ปุ่มบันทึก/ล้างต้องซ่อน",
     await page.locator("#fbcsv").isHidden() && await page.locator("#fbclear").isHidden());

  // ── ไม่ใส่กุญแจ ──
  await page.click("#fbload");
  await page.waitForFunction(() => document.querySelector("#fbinfo").textContent.includes("❌"), null, { timeout: 5000 });
  ok("[2] ไม่ใส่กุญแจ = บอกให้ใส่ ไม่ยิงหลังบ้าน", /ใส่กุญแจก่อน/.test(await info()), (await info()).trim());

  // ── กุญแจผิด / ยังไม่ตั้ง: ต้องแปลเป็นภาษาคน ──
  for (const [m, want, label] of [["badkey", /กุญแจไม่ถูก/, "กุญแจผิด"], ["nokey", /ยังไม่ได้ตั้ง FEEDBACK_KEY/, "ยังไม่ตั้งกุญแจ"]]) {
    mode = m;
    await page.fill("#fbkey", "s3cret");
    await page.click("#fbload");
    await page.waitForFunction(() => document.querySelector("#fbinfo").textContent.includes("❌"), null, { timeout: 5000 });
    const t = (await info()).trim();
    ok(`[3] ${label} → ข้อความภาษาคน`, want.test(t) && !/bad_key|read_disabled/.test(t), t);
  }

  // ── เปิดกองสำเร็จ ──
  mode = "ok";
  await page.click("#fbload");
  await page.waitForFunction(() => document.querySelector("#fblist").children.length > 0, null, { timeout: 5000 });
  ok("[4] ส่งกุญแจไปกับคำขอ", /key=s3cret/.test(lastUrl));
  const t = (await info()).trim();
  ok("[4b] บอกจำนวนใบและจำนวนรูปแบบ", /4/.test(t) && /2/.test(t), t);
  ok("[4c] ⚠️ ย้ำว่ายังไม่มีผลกับ AI", /ยังไม่มีผลกับ AI/.test(t));

  const list = await page.locator("#fblist").textContent();
  ok("[5] จับกลุ่มตาม pattern", /negative→positive/.test(list) && /positive→neutral/.test(list));
  ok("[5b] กลุ่มที่ครบ 3 ใบ บอกว่าเอาไปทำกฎได้", /ครบ 3 ใบ พอเอาไปทำเป็นกฎได้/.test(list));
  ok("[5c] กลุ่มที่ยังไม่ครบ บอกว่าขาดอีกกี่ใบ", /ขาดอีก 2/.test(list));
  const firstGroup = await page.locator("#fblist details").first().textContent();
  ok("[5d] กลุ่มใหญ่สุดขึ้นก่อน", /negative→positive/.test(firstGroup), firstGroup.slice(0, 40).trim());

  ok("[6] เปิดกองแล้วปุ่มบันทึก/ล้างโผล่",
     await page.locator("#fbcsv").isVisible() && await page.locator("#fbclear").isVisible());

  // ── ล้างกองต้องถามก่อน ──
  page.once("dialog", d => d.dismiss());
  await page.click("#fbclear");
  await page.waitForTimeout(400);
  ok("[7] กดยกเลิกตอนถามยืนยัน = ไม่ล้าง", cleared === false && await page.locator("#fbclear").isVisible());

  page.once("dialog", d => d.accept());
  await page.click("#fbclear");
  await page.waitForFunction(() => /ล้างแล้ว/.test(document.querySelector("#fbinfo").textContent), null, { timeout: 5000 });
  ok("[7b] ยืนยันแล้วล้างจริง", cleared === true && await page.locator("#fbclear").isHidden());
  ok("[7c] ล้างแล้วรายการหายไป", /กองว่าง/.test(await page.locator("#fblist").textContent()));

  // ── กุญแจถูกจำไว้ในเครื่อง ──
  await page.reload();
  ok("[8] จำกุญแจไว้ ไม่ต้องพิมพ์ซ้ำทุกครั้ง", (await page.locator("#fbkey").inputValue()) === "s3cret");
  ok("[8b] ช่องกุญแจเป็นแบบซ่อนตัวอักษร",
     (await page.locator("#fbkey").getAttribute("type")) === "password");

  console.log(errs.length ? "❌ JS error: " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
