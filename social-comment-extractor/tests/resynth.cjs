/**
 * resynth.cjs — ปุ่ม "🔄 สรุปใหม่ตามป้ายที่แก้"
 *
 * เจ้าของเสนอเอง 2 ก.ย. 2026: "ตั้งปุ่ม refresh ... สำหรับสรุปใหม่หลังจากปรับ sentiment
 * ดีไหม? จะกิน token เพิ่มไหม?" → เลือกแบบ **ปุ่มเดียวบนการ์ดสรุป**
 *
 * ทำไมต้องเป็นปุ่ม ไม่ใช่ยิงเอง — แก้ป้ายทีละใบ 10 ใบ = ยิง Claude 10 ครั้ง
 * ผู้ใช้ต้องคุมได้เองว่าจ่ายเมื่อไหร่
 *
 * [1] [3] [5] คือข้อสำคัญที่สุด
 *   [1] 🔓 ปุ่มขึ้นตลอด (เจ้าของสั่ง 4 ก.ย. 2026) — ของเดิมซ่อนจนกว่าจะแก้ป้าย
 *   [3] กดแล้วต้องส่งป้าย **ที่แก้แล้ว** ไป ไม่ใช่ป้ายเดิมของ AI
 *   [5] ยิงไม่สำเร็จ = ห้ามลบสรุปเดิมทิ้ง ต้องบอกตรงๆ
 */
const { launch } = require("./browser.cjs");

const AUDIT = [
  { text: "อร่อยมาก", sentiment: "positive", likes: 5 },
  { text: "ดีจัง", sentiment: "positive", likes: 1 },
  { text: "เฉยๆ", sentiment: "neutral", likes: 0 },
  { text: "แพงไป", sentiment: "negative", likes: 9 },
];
const BASE = {
  ok: true, platform: "facebook", target: "overall", model: "claude-opus-5", ver: 30, rubric: "v6",
  analyzed_count: 4, fetched_count: 4, no_text_count: 0,
  sentiment: { positive: 2, neutral: 1, negative: 1 },
  lenses: { cp: { positive: 0, neutral: 4, negative: 0 }, overall: { positive: 2, neutral: 1, negative: 1 } },
  audit: AUDIT, keywords: [{ term: "อร่อย", count: 1 }],
  summary: "สรุปของรอบแรก", summary_from: 4, summary_of: 4,
  samples: [{ sentiment: "positive", text: "ถอดความ อร่อยมาก", src: 0 }],
};

(async () => {
  const b = await launch();
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  let sent = null, resynthMode = "ok";

  await page.route("**/issue/api/sentiment/**", async (route) => {
    const req = route.request(), u = req.url();
    const send = (o, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(o) });
    if (u.endsWith("/credits")) return send({ credits_remaining: 7000 });
    if (u.endsWith("/analyze")) return send(JSON.parse(JSON.stringify(BASE)));
    if (u.endsWith("/resynth")) {
      sent = JSON.parse(req.postData() || "{}");
      if (resynthMode === "fail") return send({ error: "resynth_failed", detail: "ต้นทางล่ม" }, 502);
      return send({ ok: true, ver: 30, rubric: "v6", target: sent.target,
        summary: "สรุปรอบใหม่หลังแก้ป้าย", keywords: [{ term: "แพง", count: 1 }],
        samples: [{ sentiment: "negative", text: "ถอดความใบที่ย้ายมา", src: 0 }],
        summary_from: 4, summary_of: 4, claude_usage: { input: 100, output: 50, total: 150 } });
    }
    if (u.endsWith("/")) return send({ ok: true, ver: 30, rubric: "v6", model: "claude-opus-5" });
    return send({});
  });

  let fail = 0;
  const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };
  const vis = (sel) => page.evaluate((s) => {
    const e = document.querySelector(s);
    return !!e && !e.hidden && getComputedStyle(e).display !== "none";
  }, sel);
  const flip = (word, to) => page.evaluate(([w, t]) => {
    const row = [...document.querySelectorAll(".sc-arow")].find(r => r.textContent.includes(w));
    [...row.querySelectorAll(".sc-fix")].find(x => x.dataset.s === t).click();
  }, [word, to]);

  await page.goto("http://localhost:8899/issue/sentiment.html");
  await page.evaluate(() => { document.querySelector("#auditList").innerHTML = ""; });
  await page.fill("#url", "https://www.facebook.com/reel/1");
  await page.click("#analyzeBtn");
  await page.waitForFunction(() => document.querySelectorAll(".sc-fix").length > 0, null, { timeout: 8000 });
  /* กางกล่อง audit ก่อน — ต้องกางถึงจะแก้ป้ายได้ (ตรงกับการใช้จริง)
     ⚠️ ตัวปุ่มไม่ต้องกางก็เห็น เพราะอยู่บนบรรทัดหัวกล่อง */
  await page.evaluate(() => { const d = document.querySelector("#auditCard"); if (d) d.open = true; });

  /* ── [1] 🔓 ปุ่มขึ้นตลอด ไม่ต้องรอให้แก้ป้าย (เจ้าของสั่ง 4 ก.ย. 2026) ──
     ของเดิมซ่อนไว้จนกว่าจะแก้ป้าย · เหตุผลเดิม "ไม่แก้ก็ได้ของเดิม" ไม่จริงเสียทีเดียว
     เพราะกดแล้ว AI ถอดความใหม่ ได้สรุป/ตัวอย่างคนละชุด */
  ok("[1] 🔓 ยังไม่แก้ป้าย ปุ่มก็ต้องขึ้นแล้ว", await vis("#resynthBtn"));
  ok("[1b] แต่ยังไม่มีคำเตือนว่าสรุปเก่า (ยังไม่มีใครแก้อะไร)", !(await vis("#resynthWrap")));

  /* ── [2] แก้ป้ายแล้วปุ่มโผล่ + บอกว่าสรุปยังเป็นของเก่า ──── */
  await flip("อร่อยมาก", "negative");
  await page.waitForTimeout(300);
  ok("[2] แก้ป้ายแล้วปุ่มยังอยู่ + คำเตือนโผล่", await vis("#resynthBtn") && await vis("#resynthWrap"));
  const note = (await page.locator("#resynthNote").textContent()).trim();
  ok("[2b] บอกว่าสรุปยังเป็นของรอบที่แล้ว", /ยังเป็นของรอบที่แล้ว/.test(note) && /1 ใบ/.test(note), note);

  /* ── [3] ⚠️ กดแล้วต้องส่งป้าย "ที่แก้แล้ว" ไป ─────────────── */
  await page.click("#resynthBtn");
  await page.waitForFunction(() => /สรุปใหม่แล้ว/.test(document.querySelector("#resynthMsg")?.textContent || ""), null, { timeout: 8000 });
  const byText = Object.fromEntries((sent.items || []).map(i => [i.text, i.sentiment]));
  ok("[3] ⚠️ ส่งป้ายที่ผู้ใช้แก้แล้ว ไม่ใช่ป้ายเดิมของ AI",
     byText["อร่อยมาก"] === "negative", JSON.stringify(byText));
  ok("[3b] ส่งครบทุกใบ", (sent.items || []).length === 4);
  ok("[3c] ส่งยอดถูกใจไปด้วย (ไม่งั้นเลือกใบตัวอย่างได้คนละใบกับรอบแรก)",
     sent.items.some(i => i.likes === 9), JSON.stringify(sent.items.map(i => i.likes)));
  ok("[3d] 🚫 ไม่ส่งลิงก์โพส/ชื่อผู้คอมเมนต์ไปด้วย",
     !/https?:|name|author/i.test(JSON.stringify(sent)), Object.keys(sent).join(","));

  /* ── [4] ผลลัพธ์ใหม่ถูกเอามาแสดงจริง ──────────────────────── */
  const sum = await page.locator("#summaryBox").textContent();
  ok("[4] สรุปบนจอเปลี่ยนเป็นของรอบใหม่", /สรุปรอบใหม่หลังแก้ป้าย/.test(sum), sum.trim().slice(0, 40));
  const kw = await page.locator("#kwList").textContent();
  ok("[4b] คำที่พูดถึงบ่อยอัปเดตตาม", /แพง/.test(kw));
  const smp = await page.locator("#sampleList").textContent();
  ok("[4c] ตัวอย่างเป็นชุดใหม่", /ถอดความใบที่ย้ายมา/.test(smp));
  /* 🔴 สรุปใหม่ไปแล้ว คำเตือน "ยังเป็นของรอบที่แล้ว" ต้องหายไป ไม่งั้นคำเตือนโกหก */
  ok("[4d] 🔴 สรุปใหม่แล้ว → คำเตือนว่าสรุปเก่าต้องหายไป", !(await vis("#resynthWrap")));
  ok("[4e] แต่ปุ่มยังอยู่ (กดสรุปซ้ำได้)", await vis("#resynthBtn"));

  /* ── [5] ⚠️ ยิงไม่สำเร็จ = ห้ามลบสรุปเดิมทิ้ง ─────────────── */
  resynthMode = "fail";
  await flip("ดีจัง", "neutral");
  await page.waitForTimeout(300);
  await page.click("#resynthBtn");
  await page.waitForFunction(() => /ไม่สำเร็จ/.test(document.querySelector("#resynthMsg")?.textContent || ""), null, { timeout: 8000 });
  const sum2 = await page.locator("#summaryBox").textContent();
  ok("[5] ⚠️ ยิงไม่สำเร็จ → สรุปเดิมยังอยู่ ไม่หายไปเฉยๆ", /สรุปรอบใหม่หลังแก้ป้าย/.test(sum2), sum2.trim().slice(0, 40));
  /* ⚠️ ต้องเช็ค **ตัวอย่างกับคำ** ด้วย ไม่ใช่แค่สรุป
     ตอนเขียนเทสต์ครั้งแรกเช็คแต่สรุป → ลองถอดตัวดัก error ออกแล้ว **เทสต์ยังผ่าน**
     ทั้งที่ตัวอย่างหายเกลี้ยง (samples = [] เพราะคำตอบที่ล้มเหลวไม่มีฟิลด์นั้น) */
  const smp2 = await page.locator("#sampleList").textContent();
  ok("[5a] ⚠️ ตัวอย่างเดิมก็ต้องยังอยู่", /ถอดความใบที่ย้ายมา/.test(smp2), smp2.replace(/\s+/g, " ").slice(0, 60));
  ok("[5a2] คำที่พูดถึงบ่อยก็ยังอยู่", /แพง/.test(await page.locator("#kwList").textContent()));
  ok("[5b] และบอกเหตุผลให้อ่านได้", /ต้นทางล่ม|502/.test(await page.locator("#resynthMsg").textContent()));
  ok("[5c] ปุ่มกลับมากดได้อีก ไม่ค้างเป็นไอคอนหมุน",
     await page.evaluate(() => !document.querySelector("#resynthBtn").disabled));

  /* ── [5d] 📍 ปุ่มต้องอยู่หัวกล่อง audit แถวเดียวกับ Excel/CSV ────
     เจ้าของสั่งย้ายมา 4 ก.ย. 2026 — ผู้ใช้แก้ป้ายกันในกล่องนี้ กดต่อได้เลย ไม่ต้องเลื่อนขึ้นไป
     ⚠️ คำเตือนยังต้องอยู่ **ข้างนอก** กล่องนี้ เพราะกล่องพับอยู่เป็นค่าตั้งต้น
        คนที่ไม่กางจะไม่เห็นอะไรข้างในเลย แล้วอ่านสรุปที่ตกยุคโดยไม่รู้ตัว */
  const where = await page.evaluate(() => ({
    inHead: !!document.querySelector("#auditCard > summary > #resynthBtn"),
    alone: (() => {
      const t = document.querySelector("#auditCard .sc-bar-tools");
      return t ? [...t.children].map(b => b.id).join(",") : "";
    })(),
    warnOutside: !document.querySelector("#auditCard #resynthWrap"),
  }));
  ok("[5d] 📍 ปุ่มอยู่บนหัวกล่อง (มุมขวาบน) ไม่ใช่ในแถวเครื่องมือ", where.inHead);
  ok("[5e] 🚫 และเป็นปุ่มเดียว ไม่ปนกับ Excel/CSV", where.alone === "auditXlsxBtn,auditCsvBtn", where.alone);
  ok("[5f] ⚠️ คำเตือนยังอยู่นอกกล่อง audit (กล่องพับอยู่ คนไม่กางต้องยังเห็น)", where.warnOutside);

  /* ── [5g] 🚫 กดปุ่มแล้วกล่องต้องไม่พับ/กางตาม ────────────────────
     ปุ่มอยู่ใน <summary> ซึ่งเบราว์เซอร์ถือว่าคลิกที่ไหนก็คือสั่งพับ/กาง
     ถ้ากล่องหุบทุกครั้งที่กดสรุปใหม่ = อ่านผลไม่ได้เลย */
  const openBefore = await page.evaluate(() => document.querySelector("#auditCard").open);
  await page.click("#resynthBtn");
  await page.waitForTimeout(400);
  const openAfter = await page.evaluate(() => document.querySelector("#auditCard").open);
  ok("[5g] 🚫 กดปุ่มแล้วกล่องไม่พับตาม", openBefore === true && openAfter === true,
     `ก่อน ${openBefore} → หลัง ${openAfter}`);

  /* ── [5h] 🔒 และต้องมีตัวกัน event อยู่ในโค้ดจริงๆ ─────────────────
     🔴 **[5g] ข้างบนพิสูจน์อะไรไม่ได้** — ลองถอด preventDefault ออกแล้ว **มันยังผ่าน**
        เพราะ Chromium ไม่สั่งพับเมื่อคลิกโดน <button> ที่ซ้อนอยู่ข้างใน
        แต่ **WebKit (Safari/iOS) ทดสอบจากที่นี่ไม่ได้** และผู้ใช้ส่วนใหญ่ของเราอยู่บน iOS
     → จึงต้องคุมที่ระดับโค้ดแทน แบบเดียวกับ pintest.mjs ที่คุมกฎในซอร์ส */
  const src = await (await fetch("http://localhost:8899/issue/sentiment.html")).text();
  const guard = /resynthBtn"\)\.onclick\s*=\s*\(e\)\s*=>\s*\{[^}]*preventDefault[^}]*stopPropagation/.test(src);
  ok("[5h] 🔒 โค้ดมี preventDefault + stopPropagation กันไว้ (เผื่อ Safari)", guard);

  /* ── [6] 🚫 ห้ามมีปุ่มแบบนี้ที่การ์ด "คำที่พูดถึงบ่อย" ──────
     ตัวเลขตรงนั้นนับจากข้อความคอมเมนต์ ไม่ได้ขึ้นกับป้าย กดไปก็ได้เลขเดิมเป๊ะ */
  ok("[6] 🚫 การ์ด 'คำที่พูดถึงบ่อย' ไม่มีปุ่มสรุปใหม่ของตัวเอง",
     await page.evaluate(() => {
       const card = [...document.querySelectorAll(".sc-card")].find(c => /คำที่พูดถึงบ่อย/.test(c.querySelector("h2")?.textContent || ""));
       return !!card && !card.querySelector("button");
     }));

  console.log(errs.length ? "❌ JS error: " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
