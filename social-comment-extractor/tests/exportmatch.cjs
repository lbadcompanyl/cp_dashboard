/**
 * exportmatch.cjs — ไฟล์ที่ export ออกมา ต้องตรงกับสิ่งที่เห็นบนหน้าจอ
 *
 * 🐞 เจ้าของส่งภาพเทียบมา 11 ก.ย. 2026: "สิ่งที่ export ออกมาไม่ตรงกับสิ่งที่แสดง แก้ด่วน"
 *      หน้าจอ : บวก 0% (1)  ·  **กลาง 70% (211)**  ·  ลบ 30% (88)
 *      ไฟล์   : บวก 0% (1)  ·  ลบ 30% (88)          ← **กลาง 211 ใบหายทั้งกลุ่ม**
 *
 *    ต้นเหตุ: โค้ดวาดรูปเขียนลิสต์กลุ่มของตัวเองไว้แค่ 2 กลุ่ม (positive/negative)
 *    ตอนเพิ่มช่อง "กลาง" ให้หน้าจอ (2 ก.ย. 2026) ไม่ได้ตามมาแก้ที่นี่
 *
 * 🎯 เทสต์นี้ไม่ได้เช็ค "มีช่องกลางไหม" อย่างเดียว — มันดัก `fillText` ตอนวาดรูปจริง
 *    แล้วเอาข้อความที่ถูกวาดลงผืนผ้าใบมาเทียบกับ DOM บนหน้าจอ **ทีละบรรทัด**
 *    เพิ่มกลุ่มใหม่ตรงไหนก็ตาม ถ้าอีกฝั่งไม่ตาม เทสต์ตกทันที
 *
 * [2] คือข้อสำคัญที่สุด (หัวข้อกลุ่มต้องครบเท่ากัน)  ·  [3] ข้อความตัวอย่างต้องครบ
 * [5] ป้ายที่ผู้ใช้แก้เองต้องไปถึงไฟล์ด้วย (รูที่สองที่เจอระหว่างแก้)
 */
const { launch } = require("./browser.cjs");

/* ── ข้อมูลจำลองให้ตรงกับภาพที่เจ้าของส่งมา: 1 บวก · 211 กลาง · 88 ลบ ──
   audit ใส่แค่ใบที่เป็นตัวอย่าง (หน้าเว็บอ่าน audit[src] เพื่อหาป้ายปัจจุบัน) */
const AUDIT = [
  { text: "ยกให้ซีพีเป็นคนดี",       sentiment: "positive" },
  { text: "เห็นด้วยกับคุณป้าสุดๆ",    sentiment: "neutral"  },
  { text: "แล้วรัฐมนตรีจะออกมาชี้แจง", sentiment: "neutral"  },
  { text: "ยกให้คุณป้าเป็นที่หนึ่ง",  sentiment: "neutral"  },
  { text: "ชมว่าคุณป้ามีสติปัญญา",    sentiment: "neutral"  },
  { text: "ด่าซีพีว่าเห็นแก่ผลประโยชน์", sentiment: "negative" },
  { text: "ชวนเลิกอุดหนุนซีพี",       sentiment: "negative" },
];
const PAYLOAD = {
  ok: true, platform: "tiktok", target: "cp", model: "claude-opus-5", ver: 43, rubric: "v6",
  analyzed_count: 300, fetched_count: 300, no_text_count: 0,
  sentiment: { positive: 1, neutral: 211, negative: 88 },
  lenses: { cp: { positive: 1, neutral: 211, negative: 88 }, overall: { positive: 1, neutral: 211, negative: 88 } },
  audit: AUDIT, keywords: [{ term: "ผูกขาด", count: 7 }],
  summary: "คอมเมนต์ส่วนใหญ่เป็นกลาง",
  engagement: { total_likes: 7148, total_replies: 0, unique_commenters: 297 },
  samples: [
    { sentiment: "positive", text: "ยกให้ซีพีเป็นคนดี รักชาติ ศาสนา และสถาบันกษัตริย์", src: 0 },
    { sentiment: "neutral",  text: "เห็นด้วยกับคุณป้าสุดๆ ขอปรบมือให้เลย",              src: 1 },
    { sentiment: "neutral",  text: "แล้วรัฐมนตรีเจ้ากระทรวงจะออกมาชี้แจงเรื่องนี้ว่าอย่างไร", src: 2 },
    { sentiment: "neutral",  text: "ยกให้คุณป้าเป็นที่หนึ่ง",                            src: 3 },
    { sentiment: "neutral",  text: "ชมว่าคุณป้ายังมีสติปัญญามากกว่ารัฐบาล",              src: 4 },
    { sentiment: "negative", text: "ด่าซีพีว่าเห็นแก่ผลประโยชน์และเลวร้าย",              src: 5 },
    { sentiment: "negative", text: "ชวนเลิกอุดหนุนซีพี ไม่เข้าเซเว่น",                   src: 6 },
  ],
};

(async () => {
  const b = await launch();
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));

  await page.route("**/issue/api/sentiment/**", async (route) => {
    const u = route.request().url();
    const send = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.endsWith("/credits")) return send({ credits_remaining: 7000 });
    if (u.endsWith("/analyze")) return send(JSON.parse(JSON.stringify(PAYLOAD)));
    if (u.endsWith("/")) return send({ ok: true, ver: 43, rubric: "v6", model: "claude-opus-5" });
    return send({});
  });

  let fail = 0;
  const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

  await page.goto("http://localhost:8899/issue/sentiment.html");
  await page.fill("#url", "https://www.tiktok.com/@x/video/1");
  await page.click("#analyzeBtn");
  await page.waitForFunction(() => document.querySelectorAll(".sc-sgroup").length > 0, null, { timeout: 8000 });

  /* ── ฝั่งหน้าจอ ───────────────────────────────────────────────── */
  const screen = await page.evaluate(() => ({
    heads: [...document.querySelectorAll(".sc-shead")].map(e => e.textContent.replace(/\s+/g, " ").trim()),
    texts: [...document.querySelectorAll(".sc-sample")].map(e => e.textContent.replace("✕", "").trim()),
  }));

  /* ── ฝั่งไฟล์: ดัก fillText ตอนวาดรูปจริง แล้วเก็บทุกบรรทัดที่ถูกวาด ──
     ⚠️ ต้องดักที่ prototype — โค้ดสร้าง canvas ขึ้นมาเองข้างใน เข้าถึงตัว ctx จากข้างนอกไม่ได้ */
  const drawn = await page.evaluate(async (d) => {
    const P = CanvasRenderingContext2D.prototype, orig = P.fillText, out = [];
    P.fillText = function (t, ...r) { out.push(String(t)); return orig.call(this, t, ...r); };
    try { await window.renderReport(d); } finally { P.fillText = orig; }
    return out;
  }, PAYLOAD);
  const joined = drawn.join("\n");
  /* บรรทัดหัวข้อกลุ่มในไฟล์เขียนแบบ "บวก · 0%  (1 คอมเมนต์)" */
  const fileHeads = drawn.filter(t => /·\s*\d+%\s+\(\d+ คอมเมนต์\)/.test(t)).map(t => t.replace(/\s+/g, " ").trim());

  ok("[1] วาดรูปได้จริง มีบรรทัดออกมา", drawn.length > 10, `${drawn.length} บรรทัด`);

  /* ── [2] 🔴 หัวข้อกลุ่มต้องครบเท่ากันทั้ง 2 ฝั่ง ───────────────── */
  const norm = (s) => s.replace(/[😊😐😞]/g, "").replace(/\s+/g, " ").replace(/\s*·\s*/g, "·").trim();
  const sHeads = screen.heads.map(norm), fHeads = fileHeads.map(norm);
  ok("[2] 🔴 จำนวนกลุ่มเท่ากัน", sHeads.length === fHeads.length,
     `หน้าจอ ${sHeads.length} กลุ่ม · ไฟล์ ${fHeads.length} กลุ่ม`);
  ok("[2b] 🔴 **มีกลุ่ม \"กลาง\" ในไฟล์ด้วย** (บั๊กที่เจ้าของเจอ)",
     fHeads.some(h => h.startsWith("กลาง")), fHeads.join(" | "));
  ok("[2c] หัวข้อตรงกันทุกกลุ่ม ทั้งชื่อ % และจำนวน",
     sHeads.join("||") === fHeads.join("||"), `\n   หน้าจอ: ${sHeads.join(" | ")}\n   ไฟล์  : ${fHeads.join(" | ")}`);
  /* ยึดกับตัวเลขจริงของภาพที่เจ้าของส่งมา กันไม่ให้ทั้ง 2 ฝั่งพังเหมือนกันแล้วเทสต์ยังผ่าน */
  ok("[2d] ⚠️ ไฟล์บอกจำนวนกลางถูกต้อง (211 ใบ · 70%)",
     fHeads.some(h => h.includes("กลาง") && h.includes("70%") && h.includes("211 คอมเมนต์")));

  /* ── [3] ข้อความตัวอย่างต้องอยู่ในไฟล์ครบทุกใบ ─────────────────
     ⚠️ ไฟล์ตัดบรรทัดเอง ข้อความยาวจะถูกหั่น จึงเทียบด้วย "ต้นข้อความ" */
  const missing = screen.texts.filter(t => !joined.includes(t.slice(0, 12)));
  ok("[3] ตัวอย่างทุกใบบนหน้าจอ อยู่ในไฟล์ครบ", missing.length === 0,
     missing.length ? `หายไป ${missing.length} ใบ: ${missing.map(t => t.slice(0, 18)).join(" / ")}` : `${screen.texts.length} ใบ`);
  ok("[3b] 🔴 ตัวอย่างของกลุ่มกลางอยู่ในไฟล์", joined.includes("เห็นด้วยกับคุณป้าสุดๆ".slice(0, 12)));

  /* ── [4] 🚫 ห้ามมีลิสต์กลุ่มเขียนมือซ้ำในโค้ดอีก ──────────────────
     ด่านระดับโค้ด — เทสต์ข้างบนจับได้เฉพาะตอนที่ "ลืมกลุ่ม" จริงๆ
     ส่วนอันนี้จับตั้งแต่ตอนที่มีคนก๊อปลิสต์ไปวาง ก่อนที่มันจะเพี้ยน */
  const src = await (await fetch("http://localhost:8899/issue/sentiment.html")).text();
  /* `word:"…"` เป็นคีย์ที่มีอยู่เฉพาะในลิสต์กลุ่ม — นับได้ตรงๆ ไม่ไปโดนคำในคำอธิบาย
     (เคยเขียนด่านนี้เป็น `["positive"` แล้วไปโดนตัวกรองของรายการ audit ที่คนละเรื่องกัน) */
  const groupDefs = (src.match(/word:\s*"เป็นกลาง"/g) || []).length;
  ok("[4] 🚫 ลิสต์กลุ่มมีชุดเดียว (อยู่ใน sampleGroups)", groupDefs === 1,
     `เจอ ${groupDefs} ชุด — เกิน 1 แปลว่ามีคนก๊อปลิสต์ไปวางอีกที่ แล้วมันจะแยกกันอีก`);
  ok("[4b] ทั้งหน้าจอและตัววาดรูปเรียก sampleGroups()",
     (src.match(/sampleGroups\(d\)/g) || []).length >= 2);
  /* 🚫 รูที่สอง: จัดกลุ่มด้วยป้ายแรกของ AI ตรงๆ = ป้ายที่ผู้ใช้แก้ไม่มีผล */
  ok("[4c] 🚫 ไม่มีที่ไหนจัดกลุ่มตัวอย่างด้วย x.sentiment ดิบๆ อีก",
     !/samples\s*\.filter\(\s*x\s*=>\s*x\.sentiment\s*===/.test(src));

  /* ── [5] 🔴 ป้ายที่ผู้ใช้แก้เอง ต้องไปถึงไฟล์ด้วย ────────────────
     รูที่สองที่เจอระหว่างแก้: ไฟล์ใช้ `x.sentiment` (ป้ายแรกของ AI)
     ส่วนหน้าจอใช้ป้ายปัจจุบัน → แก้ป้ายแล้ว export จะอยู่คนละกลุ่มกันเงียบๆ */
  const moved = await page.evaluate((d) => {
    /* ย้ายใบบวกใบเดียวไปเป็นลบ (เหมือนผู้ใช้กดแก้ป้ายเอง) แล้วถามทั้ง 2 ทางว่าเห็นอะไร */
    d.audit[0].sentiment = "negative";
    d.sentiment = { positive: 0, neutral: 211, negative: 89 };
    const g = window.sampleGroups(d);
    const row = (window.buildSheets(d)["ตัวอย่าง"] || [])[1];
    return { inPos: g.find(x => x.key === "positive").items.length,
             inNeg: g.find(x => x.key === "negative").items.map(i => i.text),
             csvLabel: row && row[0] };
  }, JSON.parse(JSON.stringify(PAYLOAD)));
  ok("[5] 🔴 แก้ป้ายแล้ว ใบนั้นออกจากกลุ่มเดิมในไฟล์", moved.inPos === 0);
  ok("[5b] และไปอยู่กลุ่มใหม่จริง", moved.inNeg.some(t => t.startsWith("ยกให้ซีพีเป็นคนดี")));
  ok("[5c] 🔴 CSV/Excel ก็ต้องใช้ป้ายปัจจุบัน ไม่ใช่ป้ายแรกของ AI",
     moved.csvLabel === "ลบ", `ได้ "${moved.csvLabel}" (ของเดิมจะได้ "บวก")`);

  ok("ไม่มี JS error", errs.length === 0, errs.join(" | "));
  await b.close();
  console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
  process.exit(fail ? 1 : 0);
})();
