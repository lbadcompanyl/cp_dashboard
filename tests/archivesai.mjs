/* คลังข่าว — 🤖 ถามเป็นประโยค (เจ้าของสั่ง 26 ส.ค. 2026)
 *
 *   python3 -m http.server 8899 --directory .. &
 *   node archivesai.mjs
 *
 * คุมอะไร:
 *   [1] โหมดเดียว — พิมพ์เฉยๆ ยังไม่ถาม (ห้ามยิง AI ทุกตัวอักษร) · Enter/ปุ่ม = ถาม
 *       และหน้าตาต้องบอกตั้งแต่แรกเห็นว่าเป็น "ค้นด้วย AI" ไม่ใช่ช่องใส่คีย์เวิร์ด
 *   [2] ถาม → เอาคำค้นที่ AI ตีความมาใส่ช่อง → คัดตามเงื่อนไข → เหลือเฉพาะใบที่ผ่าน
 *   [3] แถบต้องบอกเสมอว่า "ค้นด้วยอะไร · คัดด้วยอะไร"
 *   [4] 🔴 AI ล่ม = ยังต้องค้นได้ ไม่ใช่หน้าค้าง — และต้องบอกผู้ใช้
 *   [5] 🔴 คัดไม่สำเร็จ = **แสดงทุกใบ ไม่ใช่ซ่อนทุกใบ** (ซ่อน = ข่าวหายเงียบ)
 *   [6] "เลิกคัด" = ทิ้งเงื่อนไข แต่เก็บคำค้นไว้
 *   [7] ระดับโค้ด: ไม่เขียน KV เลย · Enter สั่งถามได้แต่ห้ามยิงระหว่างพิมพ์ · ห้ามตัดทิ้งเมื่อ AI ใช้ไม่ได้
 *   [9] 🧠 ไม่เจอเลย = ผ่อนเงื่อนไขให้เอง (ตัดช่วงวันที่ → ตัดคำ) และต้องบอกว่าผ่อนอะไร
 *   [8] 🔴 ทางถอยเมื่อ AI ตอบไม่ได้ — ต้องตัดคำถามทิ้งก่อนค้น (ไม่งั้นได้ 0 ข่าว)
 *       และต้องแกะคำตอบที่โมเดลเล็กตอบมาแบบเลอะๆ ได้
 *
 * ⚠️ ยิง Pages Function จริงจากที่นี่ไม่ได้ (python http.server เสิร์ฟไฟล์นิ่งอย่างเดียว)
 *    จึงปลอม /api/archives/ask ด้วย page.route แบบเดียวกับเทสต์ตัวอื่น
 *    → ที่วัดคือ "หน้าเว็บทำตัวถูกไหมเมื่อได้คำตอบแบบนั้น" ไม่ใช่ "AI ฉลาดแค่ไหน"
 */
import fs from "node:fs";
import { launch } from "./browser.mjs";
import { mockTable, buildRows, packYear } from "../tools/build-archives.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8899";

// ข้อมูลจำลอง — เทสต์สร้างเอง ไม่ผูกกับ archives/data/ ที่ commit ไว้ (เหตุผลเดียวกับ archives.mjs)
const FIX = (() => {
  const rows = buildRows(mockTable(600));
  const byYear = new Map();
  for (const r of rows) {
    const y = r.d.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(r);
  }
  const years = [...byYear.keys()].sort().reverse();
  const files = {
    "index.json": JSON.stringify({
      generatedAt: "2026-08-26T00:00:00.000Z",
      total: rows.length, noDate: 0,
      years: years.map((y) => ({ y: +y, n: byYear.get(y).length })),
    }),
  };
  for (const y of years) files[y + ".json"] = JSON.stringify(packYear(byYear.get(y)));
  return files;
})();

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✅", name); }
  else { fail++; console.log("  ❌", name, extra); }
};

const browser = await launch();

/** เปิดหน้าพร้อมปลอมข้อมูล + ปลอมคำตอบของ /api/archives/ask */
async function open({ plan, keep, planStatus = 200, judgeStatus = 200 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const seen = { get: 0, post: 0, postBody: null };

  await ctx.route("**/archives/data/*.json", (route) => {
    const name = route.request().url().split("/").pop().split("?")[0];
    const body = FIX[name];
    if (!body) return route.fulfill({ status: 404, body: "no fixture: " + name });
    route.fulfill({ status: 200, contentType: "application/json", body });
  });

  await ctx.route("**/api/archives/ask*", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      seen.post++;
      try { seen.postBody = JSON.parse(req.postData() || "{}"); } catch (e) { seen.postBody = null; }
      if (judgeStatus !== 200) return route.fulfill({ status: judgeStatus, contentType: "text/plain", body: "boom" });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ keep: keep || [], ai: true }) });
    }
    seen.get++;
    if (planStatus !== 200) return route.fulfill({ status: planStatus, contentType: "text/plain", body: "boom" });
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(plan || {}) });
  });

  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message)));
  await page.goto(BASE + "/archives/", { waitUntil: "networkidle" });
  return { ctx, page, seen, errs };
}

const count = (page) => page.$$eval("#list a[data-u], #list .item", (els) => els.length);
const titles = (page) => page.$$eval("#list [data-u]", (els) => els.map((e) => e.textContent.trim()));

/* ─────────── [1] โหมดเดียว: ต้องกดถึงจะถาม ─────────── */
console.log("\n[1] โหมดเดียว — พิมพ์เฉยๆ ยังไม่ถาม · กด Enter หรือปุ่มถึงจะถาม");
{
  const { ctx, page, seen, errs } = await open({ plan: { terms: ["ก"], judge: "", ai: true } });
  ok("มีปุ่มถามในช่องค้นหา", await page.$("#askbtn") !== null);
  ok("แถบตีความยังไม่ขึ้นตอนเปิดหน้า", await page.$eval("#askbar", (e) => e.hidden));
  // ⚠️ หน้าตาต้องบอกตั้งแต่แรกเห็นว่านี่คือค้นด้วย AI ไม่ใช่ช่องใส่คีย์เวิร์ด
  const hint = await page.$eval(".qhint", (e) => e.textContent);
  ok("บอกว่าค้นด้วย AI ตั้งแต่ยังไม่พิมพ์", /AI/.test(hint), hint);
  ok("ช่องพิมพ์ชวนให้ถามเป็นประโยค", /ถาม/.test(await page.$eval("#q", (e) => e.placeholder)));

  // 🚫 พิมพ์เฉยๆ ต้องไม่ยิงถาม AI — ไม่งั้นถามทุกตัวอักษร
  // (หน้านี้เปิดมาแสดงข่าวทั้งคลังอยู่แล้ว จึงวัดว่า "ผลไม่เปลี่ยน" ไม่ใช่ "ว่างเปล่า")
  const before = await count(page);
  await page.fill("#q", "ก");
  await page.waitForTimeout(500);
  ok("🚫 พิมพ์เฉยๆ ไม่ยิงถาม AI", seen.get === 0 && seen.post === 0, JSON.stringify(seen));
  ok("พิมพ์เฉยๆ ผลยังไม่เปลี่ยน (ต้องกดถึงจะค้น)", (await count(page)) === before, `${before} → ${await count(page)}`);

  // ⭐ Enter = ทางหลักของหน้านี้
  await page.press("#q", "Enter");
  await page.waitForFunction(() => !document.querySelector("#askbar .loading"), null, { timeout: 15000 });
  ok("กด Enter แล้วถามให้", seen.get === 1, `get=${seen.get}`);
  ok("ได้ผลลัพธ์ออกมา", (await count(page)) > 0);
  ok("ไม่มี JS error", errs.length === 0, errs.join(" · "));
  await ctx.close();
}

/* ─────────── [2] ถามแล้วได้ผลที่ถูกคัด ─────────── */
console.log("\n[2] ถามเป็นประโยค → ค้น → คัดตามเงื่อนไข");
{
  // ให้ AI ตอบว่า: ค้นคำ "ก" แล้วคัดเฉพาะที่ "เป็นข่าวเชิงบวก"
  const { ctx, page, seen, errs } = await open({
    plan: { terms: ["ก"], from: "", to: "", judge: "เป็นข่าวเชิงบวก", ai: true },
    keep: [0, 2],           // ให้ผ่านแค่ใบที่ 1 กับ 3 ของที่ค้นเจอ
  });
  await page.fill("#q", "หาข่าวด้านดีของปลาหมอคางดำทั้งหมด");
  await page.click("#askbtn");
  await page.waitForFunction(() => !document.querySelector("#askbar .loading"), null, { timeout: 15000 });

  ok("ยิงถามไป 1 ครั้ง", seen.get === 1, `get=${seen.get}`);
  ok("ส่งพาดหัวไปให้คัด", seen.post === 1 && Array.isArray(seen.postBody?.titles) && seen.postBody.titles.length > 0);
  ok("ส่งเงื่อนไขไปด้วย", seen.postBody?.judge === "เป็นข่าวเชิงบวก", JSON.stringify(seen.postBody?.judge));
  // ⚠️ ช่องพิมพ์ต้องเก็บ "คำถาม" ไว้ ไม่ใช่โดนเขียนทับด้วยคำค้นที่ AI แยกออกมา
  ok("ช่องพิมพ์ยังเป็นคำถามเดิม ไม่โดนเขียนทับ",
    (await page.inputValue("#q")) === "หาข่าวด้านดีของปลาหมอคางดำทั้งหมด", await page.inputValue("#q"));
  const bar1 = await page.$eval("#askbar", (e) => e.textContent);
  ok("คำค้นที่แยกได้ไปโชว์ในแถบตีความแทน", /ค้นคำ/.test(bar1), bar1);

  const n = await count(page);
  ok("เหลือเฉพาะใบที่ผ่านเงื่อนไข", n === 2, `เหลือ ${n} ใบ`);
  ok("ไม่มี JS error", errs.length === 0, errs.join(" · "));
  await ctx.close();
}

/* ─────────── [3] แถบต้องบอกว่าตีความเป็นอะไร ─────────── */
console.log("\n[3] บอกเสมอว่าค้นด้วยอะไร คัดด้วยอะไร");
{
  const { ctx, page } = await open({
    plan: { terms: ["ก"], from: "", to: "", judge: "เป็นข่าวเชิงบวก", ai: true },
    keep: [0],
  });
  await page.fill("#q", "หาข่าวด้านดีของปลาหมอคางดำทั้งหมด");
  await page.click("#askbtn");
  await page.waitForFunction(() => !document.querySelector("#askbar .loading"), null, { timeout: 15000 });

  const bar = await page.$eval("#askbar", (e) => ({ hidden: e.hidden, text: e.textContent }));
  ok("แถบขึ้นให้เห็น", !bar.hidden);
  ok("บอกว่าถามอะไรไป", bar.text.includes("ปลาหมอคางดำ"), bar.text);
  ok("บอกเงื่อนไขที่ใช้คัด", bar.text.includes("เป็นข่าวเชิงบวก"), bar.text);
  ok("มีปุ่มเลิกคัด", await page.$("#askbar [data-askclear]") !== null);
  // ก๊อป URL ส่งต่อแล้วต้องได้ผลเดิม ไม่ใช่ได้ผลกว้างกว่า
  ok("เงื่อนไขติดไปกับ URL", new URL(page.url()).searchParams.get("judge") === "เป็นข่าวเชิงบวก", page.url());
  await ctx.close();
}

/* ─────────── [4] 🔴 AI ตีความไม่ได้ = ต้องยังค้นได้ ─────────── */
console.log("\n[4] 🔴 ตีความคำถามไม่ได้ — ห้ามหน้าค้าง ต้องค้นให้ตรงๆ แทน");
{
  const { ctx, page, errs } = await open({ planStatus: 500 });
  await page.fill("#q", "ก");
  await page.click("#askbtn");
  await page.waitForFunction(() => !document.querySelector("#askbar .loading"), null, { timeout: 15000 });

  const n = await count(page);
  ok("ยังค้นเจอข่าวตามปกติ", n > 0, `เจอ ${n}`);
  const bar = await page.$eval("#askbar", (e) => e.textContent);
  ok("บอกผู้ใช้ว่า AI ตอบไม่ได้ ไม่ใช่เงียบ", /AI ตอบไม่ได้/.test(bar), bar);
  ok("ไม่มี JS error", errs.length === 0, errs.join(" · "));
  await ctx.close();
}

/* ─────────── [5] 🔴 คัดไม่สำเร็จ = แสดงทุกใบ ไม่ใช่ซ่อนทุกใบ ─────────── */
console.log("\n[5] 🔴 คัดตามเงื่อนไขไม่สำเร็จ — ต้องแสดงทุกใบ ไม่ใช่ซ่อนหมด");
{
  const { ctx, page, errs } = await open({
    plan: { terms: ["ก"], from: "", to: "", judge: "เป็นข่าวเชิงบวก", ai: true },
    judgeStatus: 500,
  });
  await page.fill("#q", "หาข่าวด้านดี");
  await page.click("#askbtn");
  await page.waitForFunction(() => !document.querySelector("#askbar .loading"), null, { timeout: 15000 });

  const n = await count(page);
  ok("ไม่ได้ซ่อนข่าวทิ้งทั้งหมด", n > 0, `เหลือ ${n} ใบ`);
  const bar = await page.$eval("#askbar", (e) => e.textContent);
  ok("บอกว่ายังไม่ได้คัด ไม่ใช่ทำเป็นว่าคัดแล้ว", /คัดตามเงื่อนไขไม่สำเร็จ/.test(bar), bar);
  ok("ไม่มี JS error", errs.length === 0, errs.join(" · "));
  await ctx.close();
}

/* ─────────── [6] เลิกคัด ─────────── */
console.log("\n[6] เลิกคัด = ทิ้งเงื่อนไข แต่เก็บคำค้นไว้");
{
  const { ctx, page } = await open({
    plan: { terms: ["ก"], from: "", to: "", judge: "เป็นข่าวเชิงบวก", ai: true },
    keep: [0],
  });
  await page.fill("#q", "หาข่าวด้านดี");
  await page.click("#askbtn");
  await page.waitForFunction(() => !document.querySelector("#askbar .loading"), null, { timeout: 15000 });
  const few = await count(page);

  await page.click("#askbar [data-askclear]");
  await page.waitForTimeout(300);
  const many = await count(page);

  ok("คัดอยู่เหลือน้อยกว่า", few < many, `${few} → ${many}`);
  ok("เลิกคัดแล้วยังเก็บคำถามไว้", (await page.inputValue("#q")) === "หาข่าวด้านดี");
  ok("เงื่อนไขหลุดออกจาก URL ด้วย", !new URL(page.url()).searchParams.get("judge"), page.url());
  await ctx.close();
}

/* ─────────── [7] ระดับโค้ด ─────────── */
console.log("\n[7] กฎที่ต้องคุมระดับโค้ด");
{
  const api = fs.readFileSync(new URL("../functions/api/archives/ask.js", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../archives/app.js", import.meta.url), "utf8");

  // 💧 ผู้ใช้พิมพ์อะไรก็ได้ = จำนวน key ไม่มีขอบเขต เขียน KV เมื่อไหร่โควตาหมดทั้งโปรเจกต์
  ok("🚫 endpoint ไม่เขียน KV เลย", !/\.put\s*\(/.test(api.replace(/cache\.put\s*\(/g, "")), "เจอ kv.put");
  ok("ใช้ edge cache แทน", /caches\.default/.test(api));
  // ⚠️ AI ใช้ไม่ได้ ต้องเก็บทุกใบ ไม่ใช่ตัดทุกใบ — ตัดทิ้งเงียบคือของหายโดยไม่มีใครรู้
  ok("ไม่มี AI แล้วยังคืนทุกใบ", /keep:\s*titles\.map\(\(_, i\) => i\)/.test(api));
  ok("ก้อนที่ถาม AI ไม่สำเร็จ เก็บทั้งก้อน", /if \(!picked\) \{ chunk\.forEach/.test(api));
  ok("จำกัดจำนวนพาดหัวต่อคำขอ", /MAX_TITLES\s*=\s*\d+/.test(api));
  ok("จำกัดขนาดคำขอ", /MAX_BODY\s*=/.test(api));
  // ⭐ โหมดเดียว = Enter ต้องสั่งถามได้ · แต่ห้ามยิงระหว่างพิมพ์
  ok("Enter สั่งถามได้", /Enter[\s\S]{0,60}runAsk/.test(app));
  ok("🚫 ไม่ยิงถามระหว่างพิมพ์", !/function onSearchInput\(\)[\s\S]{0,200}runAsk/.test(app));
  ok("ยังใช้ includes() ค้นเหมือนเดิม", /\.n\.includes\(/.test(app));
}

/* ─────────── [9] 🧠 ไม่เจอเลย = ผ่อนเงื่อนไขให้ แล้วบอกว่าผ่อนอะไร ─────────── */
console.log("\n[9] 🧠 ไม่เจอเลย — ผ่อนเงื่อนไขให้เอง และต้องบอกว่าผ่อนอะไร");
{
  // AI แต่งคำที่ไม่มีในพาดหัวไหนเลยมาเกิน 1 คำ → ถ้าไม่ผ่อน ผู้ใช้เจอ "พบ 0 ข่าว"
  const { ctx, page, errs } = await open({
    plan: { terms: ["ก", "ไม่มีทางมีคำนี้อยู่จริงหรอกนะจ๊ะ"], from: "", to: "", judge: "", ai: true },
  });
  await page.fill("#q", "หาข่าวอะไรสักอย่าง");
  await page.click("#askbtn");
  await page.waitForFunction(() => !document.querySelector("#askbar .loading"), null, { timeout: 15000 });

  ok("ไม่ปล่อยให้เหลือ 0 ข่าว", (await count(page)) > 0, `เหลือ ${await count(page)}`);
  const bar = await page.$eval("#askbar", (e) => e.textContent);
  ok("บอกว่าตัดคำไหนออก ไม่ผ่อนเงียบๆ", /ตัดคำว่า/.test(bar) && bar.includes("ไม่มีทางมีคำนี้"), bar);
  ok("ไม่มี JS error", errs.length === 0, errs.join(" · "));
  await ctx.close();
}

console.log("\n[9b] ช่วงวันที่ที่ AI เดาพลาด — ตัดช่วงวันที่ออกให้ก่อนตัดคำ");
{
  const { ctx, page } = await open({
    plan: { terms: ["ก"], from: "1990-01-01", to: "1990-12-31", judge: "", ai: true },
  });
  await page.fill("#q", "ข่าวอะไรก็ได้เดือนที่แล้ว");
  await page.click("#askbtn");
  await page.waitForFunction(() => !document.querySelector("#askbar .loading"), null, { timeout: 15000 });

  ok("ไม่ปล่อยให้เหลือ 0 ข่าว", (await count(page)) > 0, `เหลือ ${await count(page)}`);
  const bar = await page.$eval("#askbar", (e) => e.textContent);
  ok("บอกว่าตัดช่วงวันที่ออก", /ตัดช่วงวันที่ออกให้แล้ว/.test(bar), bar);
  ok("คำค้นยังอยู่ครบ", (await page.inputValue("#q")) === "ข่าวอะไรก็ได้เดือนที่แล้ว");
  await ctx.close();
}

/* ─────────── [8] ตรรกะฝั่งเซิร์ฟเวอร์ที่พลาดแล้วเจ็บทันที ─────────── */
console.log("\n[8] ทางถอยเมื่อ AI ตอบไม่ได้ + การแกะคำตอบของโมเดล");
{
  const M = await import("../functions/api/archives/ask.js");

  // 🔴 เคสจริงที่เจ้าของเจอ: ถาม "หาข่าว dna ของ ปลาหมอคางดำ" แล้วได้ 0 ข่าว
  //    เพราะเอา "หาข่าว" กับ "ของ" ไปหาในพาดหัวด้วย (หน้านี้ใช้กฎ 'ต้องมีครบทุกคำ')
  const a = M.fallbackPlan("หาข่าว dna ของ ปลาหมอคางดำ");
  ok("ตัดคำถามทิ้ง เหลือแต่คำที่อยู่ในพาดหัวจริง",
    a.terms.length === 2 && a.terms.includes("ปลาหมอคางดำ") && a.terms.includes("dna"), JSON.stringify(a.terms));
  ok("🚫 ไม่เอาคำว่า 'หาข่าว' ไปค้น", !a.terms.includes("หาข่าว"));
  ok("🚫 ไม่เอาคำว่า 'ของ' ไปค้น", !a.terms.includes("ของ"));

  // ⚠️ ตัดจนไม่เหลืออะไร = ต้องคืนของเดิม ไม่ใช่คืนลิสต์ว่าง (ค้นด้วยคำว่าง = ได้ทั้งคลัง)
  const b = M.fallbackPlan("ของ ที่ ใน");
  ok("ตัดจนหมดแล้วคืนของเดิม ไม่ใช่ค้นทั้งคลัง", b.terms.length === 3, JSON.stringify(b.terms));

  // โมเดลเล็กชอบครอบ ```json และใส่จุลภาคเกิน — ต้องแกะได้ ไม่ใช่ทิ้งคำตอบทั้งก้อน
  ok("แกะ JSON ที่ครอบด้วย ```json ได้", M.parseJSON('```json\n{"terms":["ก"]}\n```')?.terms?.[0] === "ก");
  ok("แกะ JSON ที่มีจุลภาคเกินได้", M.parseJSON('{"terms":["ก",],}')?.terms?.[0] === "ก");
  ok("แกะ JSON ที่มีข้อความพ่วงหน้า-หลังได้", M.parseJSON('นี่คือคำตอบ {"terms":["ปลา"]} ครับ')?.terms?.[0] === "ปลา");
  ok("ไม่มี JSON เลย = ยอมแพ้ ไม่เดา", M.parseJSON("ขอโทษครับ ผมไม่เข้าใจ") === null);

  // 🔑 กุญแจ Claude เป็นของเสริม — ไม่ใส่ก็ต้องทำงานเหมือนเดิม และห้ามหลุดลง repo
  const api = fs.readFileSync(new URL("../functions/api/archives/ask.js", import.meta.url), "utf8");
  ok("อ่านกุญแจจาก env เท่านั้น", /env\.ANTHROPIC_API_KEY/.test(api));
  ok("🚫 ไม่มีกุญแจจริงฝังอยู่ในโค้ด", !/sk-ant-[A-Za-z0-9-]{10}/.test(api));
  ok("ไม่มีกุญแจ = ไม่ถือว่าพัง แค่ไม่ได้เปิดใช้", /if \(!key\) return \{ obj: null, why: "" \}/.test(api));
  ok("มีทาง Cloudflare สำรองไว้เสมอ", /PLAN_MODELS/.test(api) && /env\.AI\.run/.test(api));
  // ⚠️ ชื่อรุ่นห้ามมีวันที่ต่อท้าย — เติมแล้วกลายเป็นชื่อที่ไม่มีอยู่จริง แล้วยิงไม่ผ่านทุกครั้ง
  const mdl = api.match(/ANTHROPIC_DEFAULT_MODEL = "([^"]+)"/);
  ok("ตั้งรุ่นตั้งต้นไว้", !!mdl, "หาไม่เจอ");
  ok("🚫 ชื่อรุ่นไม่มีวันที่ต่อท้าย", mdl && !/-\d{8}$/.test(mdl[1]), mdl && mdl[1]);
  ok("ใช้ haiku ตามที่เจ้าของเลือก", mdl && mdl[1] === "claude-haiku-4-5", mdl && mdl[1]);

  // 🐞 เจ้าของเจอจริง: "raw.replace is not a function" — คำตอบไม่ได้เป็นสตริงเสมอไป
  //    แล้ว error หลุดออกไปทั้งฟังก์ชัน = โมเดลสำรองไม่มีวันได้ลอง
  ok("คำตอบเป็นสตริง", M.aiText({ response: "hi" }) === "hi");
  ok("คำตอบเป็น object = แปลงเป็น JSON ให้ ไม่ใช่พัง", M.aiText({ response: { terms: ["ปลา"] } }).includes("ปลา"));
  ok("คำตอบห่อใน result อีกชั้น", M.aiText({ result: { response: "ok" } }) === "ok");
  ok("ไม่มีอะไรเลยก็ไม่พัง", M.aiText(null) === "" && M.aiText({}) === "");

  // ⏰ ต้องบอกวันนี้ให้โมเดลรู้ ไม่งั้น "เดือนที่แล้ว" แปลงเป็นวันที่ไม่ได้
  ok("วันที่ไทยเป็นรูปแบบ YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(M.todayTH()));
  const jan = M.monthRangeTH(-1, Date.parse("2026-01-15T10:00:00Z"));
  ok("ถอยเดือนข้ามปีได้", jan.from === "2025-12-01" && jan.to === "2025-12-31", JSON.stringify(jan));
  const feb = M.monthRangeTH(0, Date.parse("2024-02-10T10:00:00Z"));
  ok("รู้ว่าปีอธิกสุรทินเดือนกุมภามี 29 วัน", feb.to === "2024-02-29", feb.to);
}

console.log(`\n${fail === 0 ? "✅ ผ่านหมด" : "❌ ตก"} — ผ่าน ${pass} · ตก ${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
