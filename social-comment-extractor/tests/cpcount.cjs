/**
 * cpcount.cjs — ป้ายในโหมด CP ต้องไม่โกหก
 *
 * 🐞 เจ้าของเจอ 2 ก.ย. 2026 (โพสข่าวปลาหมอคางดำ 48 คอมเมนต์)
 *      "พูดถึงเครือ CP 48 · ไม่เกี่ยวกับ CP 0" — ทั้งที่เปิด CSV ดูแล้ว
 *      มีคอมเมนต์ที่เอ่ยถึง CP จริงๆ แค่ 1-2 ใบ
 *
 * ต้นเหตุ: ป้ายคู่นั้นค้างมาจากตอนที่ระบบยังมีหมวด `not_related`
 *   พอเลิกใช้ (26 ส.ค. 2026 · นิยามใหม่ "ไม่แตะ CP = กลาง")
 *   `not_related` เลยเป็น 0 เสมอ และทุกใบไปกองอยู่ใน "พูดถึงเครือ CP"
 *   → **ตัวเลขถูกตามนิยาม แต่ป้ายอ่านแล้วเข้าใจผิดสนิท**
 *
 * [1] และ [2] คือข้อสำคัญที่สุด
 */
const { chromium } = require("playwright");

/* 6 ใบ · เอ่ยชื่อ CP จริงๆ แค่ 2 ใบ · บวก 2 กลาง 3 ลบ 1 */
const AUDIT = [
  { text: "ลงเขื่อนลำปาวเรียบร้อย มาดูกันคางดำจะเป็นยังไง", sentiment: "neutral", likes: 3 },
  { text: "ได้แดกปลาหมอคางดำทุกวันแน่ๆ", sentiment: "positive", likes: 5 },
  { text: "ปลามันว่ายน้ำได้ ไม่ใช่หอยเชอรี่", sentiment: "neutral", likes: 1 },
  { text: "ควรเรียกว่าปลาหมอ CP ไปเลย", sentiment: "negative", likes: 9 },   // ← เอ่ย CP
  { text: "ซีพี ต้องรับผิดชอบเรื่องนี้", sentiment: "positive", likes: 2 },     // ← เอ่ย CP
  { text: "รัฐทำงานช้ามาก", sentiment: "neutral", likes: 0 },
];
const BASE = {
  ok: true, platform: "facebook", target: "cp", model: "claude-opus-5", ver: 33, rubric: "v6",
  analyzed_count: 6, fetched_count: 6, no_text_count: 0, not_related: 0,
  sentiment: { positive: 2, neutral: 3, negative: 1 },
  lenses: { cp: { positive: 2, neutral: 3, negative: 1 }, overall: { positive: 2, neutral: 3, negative: 1 } },
  audit: AUDIT, keywords: [], summary: "สรุป", summary_from: 3, summary_of: 6, samples: [],
  engagement: { total_likes: 20, total_replies: 4, unique_commenters: 6 },
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));

  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const u = route.request().url();
    const send = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.endsWith("/credits")) return send({ credits_remaining: 7000 });
    if (u.endsWith("/analyze")) return send(JSON.parse(JSON.stringify(BASE)));
    if (u.endsWith("/")) return send({ ok: true, ver: 33, rubric: "v6", model: "claude-opus-5" });
    return send({});
  });

  let fail = 0;
  const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

  await page.goto("http://localhost:8899/issue/sentiment.html");
  await page.selectOption("#target", "cp");
  await page.fill("#url", "https://www.facebook.com/reel/1");
  await page.click("#analyzeBtn");
  await page.waitForFunction(() => document.querySelectorAll(".sc-stat").length > 0, null, { timeout: 8000 });

  const stats = await page.evaluate(() =>
    [...document.querySelectorAll(".sc-stat")].map(x => ({
      k: x.querySelector(".sc-k").textContent.trim(),
      v: x.querySelector(".sc-v").textContent.trim(),
    })));
  console.log("   ป้ายที่ขึ้นจริง: " + stats.map(x => `${x.k}=${x.v}`).join(" · "));
  const get = (k) => stats.find(x => x.k === k)?.v;

  /* ── [1] 🚫 ป้ายที่โกหกต้องหายไป ─────────────────────────── */
  ok("[1] 🚫 ไม่มีป้าย 'พูดถึงเครือ CP' อีกแล้ว (มันนับทุกใบ = โกหก)",
     !stats.some(x => x.k === "พูดถึงเครือ CP"), stats.map(x => x.k).join(" · "));
  ok("[1b] 🚫 ไม่มีป้าย 'ไม่เกี่ยวกับ CP' (เป็น 0 เสมอ ไม่มีความหมาย)",
     !stats.some(x => x.k === "ไม่เกี่ยวกับ CP"));

  /* ── [2] ⚠️ ตัวเลขที่ขึ้นแทนต้องตรวจสอบได้จริง ───────────── */
  ok("[2] ⚠️ 'เอ่ยชื่อเครือ CP' นับจากข้อความจริง = 2 ใบ (ไม่ใช่ 6)",
     get("เอ่ยชื่อเครือ CP") === "2", `ได้ ${get("เอ่ยชื่อเครือ CP")}`);
  ok("[2b] 'แสดงท่าทีต่อ CP' = บวก+ลบ = 3", get("แสดงท่าทีต่อ CP") === "3", `ได้ ${get("แสดงท่าทีต่อ CP")}`);
  ok("[2c] 'คอมเมนต์ทั้งหมด' ยังเป็น 6", get("คอมเมนต์ทั้งหมด") === "6");

  /* ── [3] คำอธิบายใต้โดนัทต้องบอกว่า % คิดจากทุกใบ ────────── */
  const cap = (await page.locator("#donutCap").textContent()).trim();
  ok("[3] คำอธิบายบอกว่า % คิดจากคอมเมนต์ทั้งหมด", /ทั้งหมด/.test(cap), cap);
  ok("[3b] 🚫 ไม่เขียนว่า 'เฉพาะใบที่พูดถึงเครือ CP' อีก", !/เฉพาะใบที่พูดถึง/.test(cap), cap);

  /* ── [4] บรรทัดบนหัวก็ต้องไม่เขียนตัวเลขที่โกหก ──────────── */
  const sub = (await page.locator("#resSub").textContent()).replace(/\s+/g, " ");
  ok("[4] 🚫 บรรทัดบนไม่เขียน 'พูดถึง CP 6 คอมเมนต์'", !/พูดถึง CP \d/.test(sub), sub);

  /* ── [5] คำที่ใช้จับต้องไม่กว้างเกินจนจับผิด ───────────────
     "ทรูธโซเชียล" เป็นแอปของทรัมป์ ไม่ใช่ทรูของเครือ (บทเรียนจากฝั่งแดชบอร์ดข่าว) */
  const hit = await page.evaluate(() => {
    const RE = /(ซี\.?พี|เครือซีพี|cpf|cp\s*all|cp\s*axtra|แม็คโคร|makro|โลตัส|lotus'?s|ทรู(?!ธ)|true\s*(corp|move|online)|เจริญโภคภัณฑ์|charoen\s*pokphand|\bcp\b)/i;
    return {
      truth: RE.test("ข่าวทรูธโซเชียลของทรัมป์"),
      cpu: RE.test("ราคา CPU แพงมาก"),
      real: RE.test("ซีพีต้องรับผิดชอบ"),
      trueCorp: RE.test("ทรูมูฟเน็ตช้า"),
    };
  });
  ok("[5] 🚫 'ทรูธโซเชียล' ไม่นับเป็นเครือ CP", !hit.truth);
  ok("[5b] 🚫 'CPU' ไม่นับ", !hit.cpu);
  ok("[5c] ✅ 'ซีพี' กับ 'ทรูมูฟ' นับ", hit.real && hit.trueCorp);

  console.log(errs.length ? "❌ JS error: " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
