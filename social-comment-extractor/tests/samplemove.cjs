/**
 * samplemove.cjs — ตัวอย่างคอมเมนต์ต้องย้ายกลุ่มตามป้ายที่ผู้ใช้แก้เอง
 *
 * เจ้าของแจ้ง 31 ส.ค. 2026: "ตัวอย่างไม่ปรับตามที่กดเปลี่ยน sentiment"
 * ต้นเหตุ: ตัวอย่างเป็นข้อความ **ถอดความ** ที่ AI เขียนใหม่ ไม่ได้ผูกกับคอมเมนต์ใบไหน
 *          พอแก้ป้ายจึงไม่รู้ว่าต้องย้ายอันไหน (ตัวเลข % ขยับอยู่แล้ว แต่ข้อความค้าง)
 * แก้: worker v24 ส่ง src (ตำแหน่งคอมเมนต์ต้นทาง) มาด้วย → หน้าเว็บจัดกลุ่มตามป้ายปัจจุบัน
 *
 * [2] คือข้อสำคัญที่สุด — ย้ายจริงตามที่แก้
 * [4] หลังบ้านรุ่นเก่าไม่ส่ง src → ห้ามพัง และต้องบอกผู้ใช้ว่าตัวอย่างไม่ขยับ
 */
const { chromium } = require("playwright");

const AUDIT = [
  { text: "อร่อยมาก", sentiment: "positive" },
  { text: "ดีจัง", sentiment: "positive" },
  { text: "เยี่ยม", sentiment: "positive" },
  { text: "แพงไป", sentiment: "negative" },
  { text: "ไม่ชอบ", sentiment: "negative" },
];
const base = {
  ok: true, platform: "facebook", target: "overall", model: "claude-opus-5", ver: 24, rubric: "v6",
  analyzed_count: 5, fetched_count: 5, no_text_count: 0,
  sentiment: { positive: 3, neutral: 0, negative: 2 },
  lenses: { cp: { positive: 0, neutral: 5, negative: 0 }, overall: { positive: 3, neutral: 0, negative: 2 } },
  audit: AUDIT, keywords: [],
};
// v24: ตัวอย่างผูกกับคอมเมนต์ต้นทาง (src)
const LINKED = { ...base, samples: [
  { sentiment: "positive", text: "ถอดความจาก อร่อยมาก", src: 0 },
  { sentiment: "positive", text: "ถอดความจาก ดีจัง", src: 1 },
  { sentiment: "negative", text: "ถอดความจาก แพงไป", src: 3 },
]};
// หลังบ้านรุ่นเก่า: ไม่มี src
const OLD = { ...base, samples: [
  { sentiment: "positive", text: "ถอดความจาก อร่อยมาก" },
  { sentiment: "negative", text: "ถอดความจาก แพงไป" },
]};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  let payload = LINKED;

  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const u = route.request().url();
    const send = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.endsWith("/credits")) return send({ credits_remaining: 7000 });
    if (u.endsWith("/analyze")) return send(JSON.parse(JSON.stringify(payload)));
    if (u.endsWith("/")) return send({ ok: true, ver: 24, rubric: "v6", model: "claude-opus-5" });
    return send({});
  });

  let fail = 0;
  const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

  const run = async () => {
    /* ⚠️ ต้องล้าง DOM ของรอบก่อนทั้ง 2 ที่ ไม่งั้น waitForFunction ผ่านทันทีจากของเก่า
       แล้วเทสต์จะไปคลิกแถวของรอบก่อน — เจอจริงตอนเขียน ข้อ [4b] ตกเพราะเรื่องนี้ */
    await page.evaluate(() => {
      document.querySelector("#sampleList").innerHTML = "";
      document.querySelector("#auditList").innerHTML = "";
    });
    await page.fill("#url", "https://www.facebook.com/reel/1");
    await page.click("#analyzeBtn");
    await page.waitForFunction(() => document.querySelectorAll(".sc-fix").length > 0
      && document.querySelectorAll(".sc-sgroup").length > 0, null, { timeout: 8000 });
  };
  /** คืนข้อความตัวอย่างที่อยู่ใต้หัวข้อแต่ละกลุ่ม */
  const groups = () => page.evaluate(() =>
    [...document.querySelectorAll(".sc-sgroup")].map(g => ({
      head: g.querySelector(".sc-shead").textContent.replace(/\s+/g, " ").trim(),
      items: [...g.querySelectorAll(".sc-sample")].map(x => x.textContent.trim()),
      note: (g.querySelector(".sc-nonemsg")?.textContent || "").replace(/\s+/g, " ").trim(),
    })));
  const flip = (word, to) => page.evaluate(([w, t]) => {
    const row = [...document.querySelectorAll(".sc-arow")].find(r => r.textContent.includes(w));
    [...row.querySelectorAll(".sc-fix")].find(b => b.dataset.s === t).click();
  }, [word, to]);

  await page.goto("http://localhost:8899/issue/sentiment.html");
  await run();

  const before = await groups();
  console.log("   ก่อนแก้: " + JSON.stringify(before, null, 0));
  ok("[1] ตอนแรกตัวอย่างอยู่กลุ่มที่ AI จัดไว้",
     before[0].items.length === 2 && before[1].items.length === 1);

  // แก้ "อร่อยมาก" จาก บวก → ลบ · ตัวอย่างที่ถอดความจากใบนี้ต้องย้ายตาม
  await flip("อร่อยมาก", "negative");
  await page.waitForTimeout(400);
  const after = await groups();
  console.log("   หลังแก้: " + JSON.stringify(after, null, 0));

  ok("[2] ⚠️ ตัวอย่างของใบที่แก้ ย้ายไปกลุ่มลบแล้ว",
     after[1].items.some(t => t.includes("อร่อยมาก")),
     "กลุ่มลบมี: " + JSON.stringify(after[1].items));
  ok("[2b] และหายจากกลุ่มบวก", !after[0].items.some(t => t.includes("อร่อยมาก")),
     "กลุ่มบวกมี: " + JSON.stringify(after[0].items));
  ok("[2c] ตัวอย่างของใบที่ไม่ได้แก้ อยู่ที่เดิม",
     after[0].items.some(t => t.includes("ดีจัง")) && after[1].items.some(t => t.includes("แพงไป")));
  ok("[3] ตัวเลขในหัวข้อขยับด้วย", /บวก.*2 คอมเมนต์/.test(after[0].head) && /ลบ.*3 คอมเมนต์/.test(after[1].head),
     after.map(g => g.head).join(" | "));

  // แก้กลับ → ต้องย้ายกลับ
  await flip("อร่อยมาก", "positive");
  await page.waitForTimeout(400);
  const back = await groups();
  ok("[3b] แก้กลับแล้วย้ายกลับ", back[0].items.some(t => t.includes("อร่อยมาก")));

  /* ── [5] 🟡 แก้เป็น "กลาง" → ต้องมีช่องกลางให้ตัวอย่างไปอยู่ ─────
     เจ้าของแจ้งรอบที่ 4 (2 ก.ย. 2026) ว่า "ก็ยังไม่อัพเดท"
     จำลองภาพที่ส่งมาแล้วพบว่า **ตัวอย่างย้ายถูกแล้ว** — แต่การ์ดมีแค่ช่องบวก/ลบ
     ใบที่ถูกแก้เป็นกลางจึงหายไปเฉยๆ อ่านแล้วเหมือนระบบไม่ทำงาน */
  payload = LINKED;
  await run();
  const g0 = await groups();
  ok("[5] ตอนแรกไม่มีตัวอย่างกลาง → 🚫 ห้ามขึ้นช่องกลางเปล่าๆ ให้รก",
     g0.length === 2 && !g0.some(g => /กลาง/.test(g.head)), g0.map(g => g.head).join(" | "));

  await flip("อร่อยมาก", "neutral");
  await page.waitForTimeout(400);
  const g1 = await groups();
  console.log("   แก้เป็นกลาง: " + JSON.stringify(g1, null, 0));
  const neu = g1.find(g => /กลาง/.test(g.head));
  ok("[5b] ⚠️ แก้เป็นกลางแล้ว ช่องกลางโผล่ขึ้นมา", !!neu, g1.map(g => g.head).join(" | "));
  ok("[5c] ⚠️ และตัวอย่างของใบนั้นย้ายเข้าไปอยู่ในช่องกลางจริง",
     !!neu && neu.items.some(t => t.includes("อร่อยมาก")), JSON.stringify(neu?.items));
  ok("[5d] หายจากช่องบวก", !g1[0].items.some(t => t.includes("อร่อยมาก")));

  /* ย้ายตัวอย่างบวกออกให้หมด → ช่องบวกยังมีคอมเมนต์อยู่ 1 ใบ แต่ไม่มีตัวอย่างเหลือ
     นี่คือหน้าตาที่เจ้าของเจอจริง ("บวก 7% (1 คอมเมนต์) — ไม่มีตัวอย่าง —") */
  await flip("ดีจัง", "neutral");
  await page.waitForTimeout(400);
  const g2 = await groups();
  console.log("   ย้ายตัวอย่างบวกออกหมด: " + JSON.stringify(g2[0], null, 0));
  ok("[5e] ⚠️ ช่องบวกที่ว่างต้องบอกว่า 'ย้ายไปแล้ว' ไม่ใช่ 'ไม่มีตัวอย่าง' (อ่านแล้วเหมือนของหาย)",
     /ย้ายไปตามป้ายที่คุณแก้/.test(g2[0].note), g2[0].note || "(ไม่มีข้อความ)");
  ok("[5f] ยังมีคอมเมนต์บวกเหลืออยู่จริง (เลขไม่หาย)", /1 คอมเมนต์/.test(g2[0].head), g2[0].head);

  // แก้กลับให้ครบก่อนไปเคสถัดไป
  await flip("อร่อยมาก", "positive"); await page.waitForTimeout(200);
  await flip("ดีจัง", "positive"); await page.waitForTimeout(200);

  // ── หลังบ้านรุ่นเก่า: ไม่มี src ──
  payload = OLD;
  await run();
  await flip("อร่อยมาก", "negative");
  await page.waitForTimeout(400);
  const oldTxt = (await page.locator("#sampleList").textContent()).replace(/\s+/g, " ");
  ok("[4] หลังบ้านรุ่นเก่า → ไม่พัง ยังแสดงตัวอย่างได้", /ถอดความจาก/.test(oldTxt));
  ok("[4b] ⚠️ และบอกตรงๆ ว่าตัวอย่างไม่ได้ย้ายตามที่แก้",
     /ไม่ได้ย้ายตามที่คุณแก้/.test(oldTxt), oldTxt.slice(-150));

  console.log(errs.length ? "❌ JS error: " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
