/**
 * poststats.cjs — 📊 การ์ด Engagement / ยอดดู ของ **ตัวโพส**
 *
 * เจ้าของสั่งจัดคอลัมน์ใหม่ 4 ก.ย. 2026:
 *   "comment, กล่าวถึง CP และ เครือ, engagement (post), view(post)"
 *
 * 🔴 [2] คือข้อสำคัญที่สุด — **ไม่รู้ต้องขึ้น "—" ห้ามขึ้น 0**
 *    0 แปลว่า "ไม่มีใครดูเลย" ซึ่งคนละความหมายกับ "ต้นทางไม่ส่งมา"
 *    เป็นกฎเดียวกับบทเรียนที่แพงที่สุดของโปรเจกต์ (รายงาน 10.8% ทั้งที่ไม่เคยได้คำตอบเลย)
 *
 * ⚠️ [3] ยอดรวม engagement ของแต่ละแพลตฟอร์ม **ประกอบด้วยคนละชนิด**
 *    YouTube ไม่เปิดเผยยอดแชร์ · ถ้าไม่เขียนกำกับ จะเอาไปเทียบข้ามแพลตฟอร์มแล้วสรุปผิด
 */
const { chromium } = require("playwright");

const AUDIT = [
  { text: "ซีพีต้องรับผิดชอบ", sentiment: "negative", likes: 9 },
  { text: "ปลามันว่ายน้ำได้", sentiment: "neutral", likes: 1 },
];
const BASE = {
  ok: true, platform: "facebook", target: "cp", model: "claude-opus-5", ver: 37, rubric: "v6",
  analyzed_count: 2, fetched_count: 2, no_text_count: 0,
  sentiment: { positive: 0, neutral: 1, negative: 1 },
  lenses: { cp: { positive: 0, neutral: 1, negative: 1 }, overall: { positive: 0, neutral: 1, negative: 1 } },
  audit: AUDIT, keywords: [], summary: "สรุป", summary_from: 1, summary_of: 2, samples: [],
  engagement: { total_likes: 10, total_replies: 0, unique_commenters: 2 },
};

const run = async (page, patch) => {
  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const u = route.request().url();
    const send = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.endsWith("/credits")) return send({ credits_remaining: 7000 });
    if (u.endsWith("/analyze")) return send({ ...JSON.parse(JSON.stringify(BASE)), ...patch });
    if (u.endsWith("/")) return send({ ok: true, ver: 37, rubric: "v6", model: "claude-opus-5" });
    return send({});
  });
  await page.goto("http://localhost:8899/issue/sentiment.html");
  await page.selectOption("#target", "cp");
  await page.fill("#url", "https://www.facebook.com/reel/1");
  await page.click("#analyzeBtn");
  await page.waitForFunction(() => document.querySelectorAll(".sc-stat").length > 0, null, { timeout: 8000 });
  return page.evaluate(() => [...document.querySelectorAll(".sc-stat")].map(x => ({
    k: x.querySelector(".sc-k").textContent.trim(),
    v: x.querySelector(".sc-v").textContent.trim(),
    note: (x.querySelector(".sc-note")?.textContent || "").trim(),
  })));
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const ctx = await b.newContext();
  let fail = 0;
  const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };
  const errs = [];

  /* ── [1] มีครบทั้ง 4 ชนิด → รวมได้ตรงและใส่คั่นหลักพัน ───────────── */
  let p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
  let st = await run(p, { post_stats: { views: 128400, likes: 5210, comments: 612, shares: 88 } });
  console.log("   [1] " + st.map(x => `${x.k}=${x.v}`).join(" · "));
  const get = (s, k) => s.find(x => x.k === k) || {};
  ok("[1] Engagement = ถูกใจ+คอมเมนต์+แชร์ = 5,910", get(st, "Engagement (โพส)").v === "5,910",
     `ได้ ${get(st, "Engagement (โพส)").v}`);
  ok("[1b] ยอดดูมาจากโพส ไม่ใช่จำนวนคอมเมนต์", get(st, "ยอดดู (โพส)").v === "128,400");
  ok("[1c] ครบทุกชนิดแล้ว ไม่ต้องเขียนว่าขาดอะไร", !/ไม่มียอด/.test(get(st, "Engagement (โพส)").note),
     get(st, "Engagement (โพส)").note);
  await p.close();

  /* ── [2] 🔴 หลังบ้านรุ่นเก่าไม่ส่ง post_stats มาเลย → "—" ห้ามเป็น 0 ── */
  p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
  st = await run(p, {});                                  // ไม่มีคีย์ post_stats เลย (worker ≤ v36)
  console.log("   [2] " + st.map(x => `${x.k}=${x.v}`).join(" · "));
  ok("[2] 🔴 ไม่มีข้อมูล → Engagement ขึ้น '—' ไม่ใช่ 0", get(st, "Engagement (โพส)").v === "—",
     `ได้ ${get(st, "Engagement (โพส)").v}`);
  ok("[2b] 🔴 ยอดดูก็ขึ้น '—' ไม่ใช่ 0", get(st, "ยอดดู (โพส)").v === "—", `ได้ ${get(st, "ยอดดู (โพส)").v}`);
  /* 🐞 เจ้าของเจอ 4 ก.ย. 2026 — การ์ด 2 ใบข้างกันบอกคนละสาเหตุ ทั้งที่ต้นเหตุเดียวกัน
        "Engagement: หลังบ้านยังไม่ส่งยอดของโพสมา" · "ยอดดู: แพลตฟอร์มนี้ไม่เปิดเผยยอดดู"
     ข้อความหนึ่งบอกว่ายังมีอะไรต้องทำต่อ อีกข้อความบอกว่าจบแล้วทำอะไรไม่ได้ → พาไปแก้ผิดทาง */
  ok("[2c] ⚠️ และบอกสาเหตุด้วย ไม่ใช่ขีดเปล่าๆ", /หลังบ้าน/.test(get(st, "Engagement (โพส)").note),
     get(st, "Engagement (โพส)").note);
  ok("[2e] 🔴 การ์ดทั้ง 2 ใบต้องบอกสาเหตุ **เดียวกัน**",
     get(st, "Engagement (โพส)").note === get(st, "ยอดดู (โพส)").note,
     `"${get(st, "Engagement (โพส)").note}" vs "${get(st, "ยอดดู (โพส)").note}"`);
  ok("[2f] 🚫 ห้ามโทษแพลตฟอร์ม ทั้งที่หลังบ้านยังไม่ได้อัปเดต",
     !/แพลตฟอร์ม/.test(get(st, "ยอดดู (โพส)").note), get(st, "ยอดดู (โพส)").note);
  ok("[2g] ⚠️ บอกด้วยว่าต้องทำอะไรต่อ (เลขเวอร์ชันที่ต้องมี)",
     /v37|อัปเดตหลังบ้าน/.test(get(st, "Engagement (โพส)").note), get(st, "Engagement (โพส)").note);
  ok("[2d] คอลัมน์ซ้ายยังใช้ได้ตามปกติ (ไม่พังทั้งแถว)",
     get(st, "คอมเมนต์").v === "2" && get(st, "กล่าวถึง CP และเครือ").v === "1");
  await p.close();

  /* ── [3] ⚠️ ขาดบางชนิด (YouTube ไม่มียอดแชร์) → รวมเท่าที่มี + เขียนกำกับ ── */
  p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
  st = await run(p, { post_stats: { views: 9000, likes: 300, comments: 40, shares: null } });
  console.log("   [3] note = " + get(st, "Engagement (โพส)").note);
  ok("[3] รวมเฉพาะที่มีจริง = 340", get(st, "Engagement (โพส)").v === "340", `ได้ ${get(st, "Engagement (โพส)").v}`);
  ok("[3b] ⚠️ ต้องเขียนว่าขาดยอดแชร์ (ไม่งั้นเอาไปเทียบข้ามแพลตฟอร์มผิด)",
     /ไม่มียอดแชร์/.test(get(st, "Engagement (โพส)").note), get(st, "Engagement (โพส)").note);
  await p.close();

  /* ── [4] แพลตฟอร์มที่ไม่มียอดดู (โพสข้อความของ Facebook) ─────────── */
  p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
  st = await run(p, { post_stats: { views: null, likes: 120, comments: 30, shares: 5 } });
  ok("[4] ไม่มียอดดู → '—' แต่ Engagement ยังคิดได้", get(st, "ยอดดู (โพส)").v === "—" &&
     get(st, "Engagement (โพส)").v === "155", `${get(st, "ยอดดู (โพส)").v} / ${get(st, "Engagement (โพส)").v}`);
  ok("[4b] และบอกว่าแพลตฟอร์มนี้ไม่เปิดเผยยอดดู", /ไม่เปิดเผย/.test(get(st, "ยอดดู (โพส)").note),
     get(st, "ยอดดู (โพส)").note);
  /* ⚠️ ตรงข้ามกับ [2f] — ตรงนี้หลังบ้านส่งมาแล้วจริงๆ ห้ามไปโทษว่ายังไม่ได้อัปเดต */
  ok("[4c] 🚫 หลังบ้านส่งมาแล้ว ห้ามบอกให้ไปอัปเดตหลังบ้าน",
     !/อัปเดตหลังบ้าน|v37/.test(get(st, "ยอดดู (โพส)").note), get(st, "ยอดดู (โพส)").note);
  await p.close();

  /* ── [5] 🚫 ยอดของโพส ห้ามสับสนกับยอดถูกใจของ "คอมเมนต์" ──────────
     engagement.total_likes = 10 (รวมจากคอมเมนต์ 2 ใบ) ต้องไม่ไปโผล่ในช่องนี้ */
  p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
  st = await run(p, { post_stats: { views: null, likes: null, comments: null, shares: null } });
  ok("[5] 🚫 โพสไม่มียอด → ไม่หยิบยอดถูกใจของคอมเมนต์ (10) มาแปะแทน",
     get(st, "Engagement (โพส)").v === "—", `ได้ ${get(st, "Engagement (โพส)").v}`);
  await p.close();

  console.log(errs.length ? "❌ JS error: " + errs.join(";") : "✅ ไม่มี JS error");
  console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
