/* 🗂 คลังปลาหมอคางดำ — แยกข่าวเป็นหมวดแบบพับได้ + รูปเล็กหน้าข่าว
 *
 * เจ้าของสั่ง 17 ก.ย. 2026: **"ข่าวต้องแยกเป็นหมวด … เป็นลักษณะ accordance
 * แยกหมวดคร่าวๆเองไปก่อน อยากดู interface และ ต้องมี thumbnail เล็กหน้าข่าวแต่ละข่าว"**
 *
 * สิ่งที่เทสต์นี้คุม
 *   [1] จัดหมวดถูกตามคำในพาดหัว · **1 ข่าว = 1 หมวด** (ผลรวมของทุกหมวด = จำนวนข่าวทั้งหมด)
 *   [2] กล่องพับได้จริง · กางหมวดแรกให้ตอนเปิดหน้า · กด/พับ/ดูเพิ่ม ทำงาน
 *   [3] ค้นแล้วต้องกางหมวดที่มีผลให้เอง ไม่งั้นเจอหัวข้อพับหมด นึกว่าไม่เจออะไร
 *   [4] มีรูปเล็กทุกใบ และ **ยึดเว็บที่ข่าวอยู่ ไม่ใช่คอลัมน์สำนักข่าวในชีต**
 *       (ในคลังจริง 266/365 แถวเป็นชื่อ Google Alert ก้อนเดียวกัน — ยึดคอลัมน์นั้นจะเหมือนกันทั้งหน้า)
 *   [5] 🚫 **หน้าคลังหลักต้องไม่เปลี่ยน** — ไม่มีหมวด ไม่มีรูปเล็ก (เจ้าของสั่งมาสำหรับหน้าปลาหมอคางดำ)
 *
 * ⚠️ ปลอมไฟล์คลังด้วย page.route — ที่วัดคือ "โค้ดจัดหมวด/วาดถูกไหม" ไม่ใช่ "ข่าวจริงอยู่หมวดถูกไหม"
 *    (ความแม่นของการจัดหมวดเป็นเรื่องของคำใน `topics-blackchin.config.js` ซึ่งแก้ได้ตลอด)
 */
import fs from "node:fs";
import { launch } from "./browser.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8899";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra ? " → " + extra : "")); }
};

const APP = fs.readFileSync(new URL("../archives/app.js", import.meta.url), "utf8");
const CFG = fs.readFileSync(new URL("../archives/topics-blackchin.config.js", import.meta.url), "utf8");
const BC = fs.readFileSync(new URL("../archives/blackchin.html", import.meta.url), "utf8");
const IDX = fs.readFileSync(new URL("../archives/index.html", import.meta.url), "utf8");

/** พาดหัวปลอม — คู่ [พาดหัว, ชื่อหมวดที่ควรตกไปอยู่] · ตั้งใจให้ตรงคำของหมวดนั้นชัดๆ */
const CASES = [
  ["ศาลอุทธรณ์ยืนตามชั้นต้น รับฟ้องแบบกลุ่ม เรียกค่าเสียหายปลาหมอคางดำ", "คำพิพากษาศาลปกครอง"],
  ["กรมประมงยืนยันมีการลักลอบนำเข้า ชี้แจงปมปลาหมอคางดำ", "คำพูด/ท่าทีภาครัฐ"],
  ["เคาะงบกลาง 350 ล้าน ลุย 7 มาตรการเร่งตัดวงจรปลาหมอคางดำ", "มาตรการลดประชากรปลา"],
  ["ผลตรวจ DNA ปลาหมอคางดำ กรมประมงเผยแหล่งที่มา", "งานวิจัย DNA"],
  ["ชาวบ้านแปรรูปปลาหมอคางดำเป็นลูกชิ้น สร้างรายได้เสริม", "ใช้ประโยชน์ / เกษตรกรปรับตัว"],
  ["เปิดปม 11 บริษัทส่งออกปลาสวยงาม ปัญหาตรวจสอบย้อนกลับ", "ปลาสวยงาม / ส่งออก"],
  ["ส่องเอเลี่ยนสปีชีส์ในไทย ปลาซัคเกอร์ หอยเชอรี่ ผักตบชวา", "สัตว์ต่างถิ่น / เอเลี่ยนสปีชีส์"],
  ["รู้จักปลาหมอคางดำ กินพืชเป็นหลัก อมไข่ในปาก ทนเค็มได้ดี", "สรีระ / พฤติกรรมปลา"],
  ["พบปลาหมอคางดำริมเขื่อนแห่งหนึ่งเพิ่มอีก 3 ตัว", "อื่น ๆ"],
];

const FILLER = 30;   // ข่าวคดีเติมให้หมวดแรกเกินเพดาน 25 ใบต่อรอบ

/** คลังปลอม — ใบละคนละเว็บ จะได้เช็คว่ารูปเล็กยึดเว็บจริง */
function fakeArchive(page, dir) {
  const hosts = ["thairath.co.th", "matichon.co.th", "dailynews.co.th", "posttoday.com",
                 "khaosod.co.th", "bangkokbiznews.com", "prachachat.net", "thaipbs.or.th", "naewna.com"];
  // เติมข่าวคดีอีก 30 ใบ ให้หมวดแรกเกิน 25 ใบ — จะได้ทดสอบปุ่ม "ดูอีก N ใบ" ของหมวดนั้นได้จริง
  const rows = [
    ...CASES.map(([t]) => t),
    ...Array.from({ length: FILLER }, (_, i) => `ศาลอุทธรณ์นัดไต่สวนคดีปลาหมอคางดำ ครั้งที่ ${i + 1}`),
  ];
  return page.route(`**/archives/${dir}/*.json`, (route) => {
    const u = route.request().url();
    const body = u.endsWith("index.json")
      ? { generatedAt: "2026-09-17T00:00:00.000Z", total: rows.length, noDate: 0, years: [{ y: 2026, n: rows.length }] }
      : {
          o: ["หัวข้อที่จับตามอง"],   // ← เหมือนของจริง: ทุกแถวเป็นชื่อ Google Alert ก้อนเดียวกัน
          c: [],
          r: rows.map((t, i) => [t, `https://www.${hosts[i % hosts.length]}/news/${i}`, 1789600000 - i * 60, 0, []]),
        };
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

const groupsOf = (p) => p.evaluate(() => [...document.querySelectorAll(".grp")].map((s) => ({
  name: s.querySelector(".gname")?.textContent.trim(),
  n: +(s.querySelector(".gcount")?.textContent.replace(/\D/g, "") || 0),
  open: s.querySelector(".ghead")?.getAttribute("aria-expanded") === "true",
  items: [...s.querySelectorAll(".item a.t")].map((a) => a.textContent.replace(/\s+/g, " ").trim()),
})));

const browser = await launch();

// ── [1] จัดหมวดถูก และ 1 ข่าว = 1 หมวด ────────────────────────────
console.log("\n[1] จัดหมวดตามคำในพาดหัว");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await fakeArchive(p, "data-blackchin");
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);

  const gs = await groupsOf(p);
  ok("มีครบ 9 หมวด", gs.length === 9, String(gs.length));
  ok("หมวดสุดท้ายคือถังรับของที่ไม่เข้าหมวดไหน", gs.at(-1)?.name === "อื่น ๆ", String(gs.at(-1)?.name));
  // ผลรวมต้องเท่าจำนวนข่าว — ถ้าใบเดียวเข้าหลายหมวด ตัวเลขบนหัวข้อจะเกิน อ่านแล้วงง
  const sum = gs.reduce((a, g) => a + g.n, 0);
  const total = CASES.length + FILLER;
  ok("ผลรวมทุกหมวด = จำนวนข่าวทั้งหมด (1 ข่าว = 1 หมวด)", sum === total, `${sum} ≠ ${total}`);

  // กางทุกหมวดแล้วไล่ดูว่าแต่ละพาดหัวไปอยู่หมวดที่ควรอยู่ไหม
  for (let i = 0; i < 9; i++) {
    const h = await p.$(`.grp:nth-child(${i + 1}) .ghead:not([disabled])`);
    const exp = await h?.getAttribute("aria-expanded");
    if (h && exp !== "true") await h.click();
  }
  await p.waitForTimeout(300);
  const full = await groupsOf(p);
  const where = new Map();
  for (const g of full) for (const t of g.items) where.set(t, g.name);
  for (const [title, want] of CASES) {
    ok(`"${title.slice(0, 26)}…" → ${want}`, where.get(title) === want, String(where.get(title)));
  }
  ok("🚫 ไม่มี error หลุดออกมา", errs.length === 0, JSON.stringify(errs));
  await ctx.close();
}

// ── [2] กล่องพับได้จริง ───────────────────────────────────────────
console.log("\n[2] กาง / พับ / ดูเพิ่ม");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  await fakeArchive(p, "data-blackchin");
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);

  let gs = await groupsOf(p);
  ok("เปิดหน้ามากางให้ 1 หมวด (ไม่ใช่หัวข้อเปล่าทั้งหน้า)", gs.filter((g) => g.open).length === 1,
     JSON.stringify(gs.map((g) => g.open)));
  ok("หมวดที่กางอยู่วาดข่าวจริง", gs.find((g) => g.open)?.items.length > 0);
  ok("หมวดที่ยังพับ ไม่วาดข่าว", gs.filter((g) => !g.open).every((g) => g.items.length === 0));
  // หมวดที่ไม่มีข่าวต้องกดไม่ได้ ไม่ใช่กดแล้วกางออกมาว่างเปล่า
  const dis = await p.$$eval(".ghead[disabled]", (b) => b.length);
  ok("หมวดที่ไม่มีข่าวกดไม่ได้", dis === (await groupsOf(p)).filter((g) => !g.n).length, String(dis));

  // หมวดแรกมี 31 ใบ → วาด 25 แล้วมีปุ่ม "ดูอีก 6 ใบ"
  ok("หมวดใหญ่วาดทีละ 25 ใบ ไม่เทหมดทีเดียว", gs[0].items.length === 25, String(gs[0].items.length));
  ok("มีปุ่มดูอีกของหมวดนั้น", !!(await p.$(".grp:nth-child(1) [data-gmore]")));
  await p.click(".grp:nth-child(1) [data-gmore]");
  await p.waitForTimeout(250);
  gs = await groupsOf(p);
  ok("กดดูอีกแล้วได้ครบทั้งหมวด", gs[0].items.length === gs[0].n, `${gs[0].items.length} / ${gs[0].n}`);
  ok("ครบแล้วปุ่มดูอีกหายไป", !(await p.$(".grp:nth-child(1) [data-gmore]")));

  await p.click(".grp:nth-child(1) .ghead");
  await p.waitForTimeout(250);
  gs = await groupsOf(p);
  ok("กดหัวข้อแล้วพับลงได้", !gs[0].open && gs[0].items.length === 0);
  await p.click(".grp:nth-child(1) .ghead");
  await p.waitForTimeout(250);
  gs = await groupsOf(p);
  ok("กดอีกทีกางกลับมา", gs[0].open && gs[0].items.length > 0);
  await ctx.close();
}

// ── [3] ค้นแล้วต้องกางหมวดที่มีผลให้เอง ───────────────────────────
console.log("\n[3] ค้นแล้วกางหมวดที่มีผลให้เอง");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  await fakeArchive(p, "data-blackchin");
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  await p.fill("#q", "ศาลอุทธรณ์");
  await p.press("#q", "Enter");
  await p.waitForTimeout(400);
  const gs = await groupsOf(p);
  const hit = gs.filter((g) => g.n > 0);
  ok("หมวดที่มีผลถูกกางให้หมด", hit.length > 0 && hit.every((g) => g.open), JSON.stringify(hit.map((g) => [g.name, g.open])));
  ok("หมวดที่ไม่มีผลยังพับ", gs.filter((g) => !g.n).every((g) => !g.open));
  ok("ไฮไลต์คำค้นในหมวดด้วย", (await p.$$eval(".grp .item mark", (m) => m.length)) > 0);
  await ctx.close();
}

// ── [4] รูปเล็กหน้าข่าว ───────────────────────────────────────────
console.log("\n[4] รูปเล็กหน้าข่าว");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  await fakeArchive(p, "data-blackchin");
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  // กางทุกหมวดก่อน — ไม่งั้นเห็นแค่หมวดเดียว แล้ววัด "หลายเว็บ" ไม่ได้
  for (let i = 0; i < 9; i++) {
    const h = await p.$(`.grp:nth-child(${i + 1}) .ghead:not([disabled])`);
    if (h && (await h.getAttribute("aria-expanded")) !== "true") await h.click();
  }
  await p.waitForTimeout(300);
  const th = await p.evaluate(() => {
    const items = [...document.querySelectorAll(".item")];
    return {
      all: items.length && items.every((i) => i.querySelector(".thumb")),
      titles: [...document.querySelectorAll(".thumb")].map((t) => t.getAttribute("title")),
      inis: [...document.querySelectorAll(".thumb")].map((t) => t.textContent.trim()),
      box: (() => { const r = document.querySelector(".thumb").getBoundingClientRect();
                    return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
      // 🚫 ต้องไม่โหลดรูปจากข้างนอกเลย — หน้านี้อยู่หลัง Access ไม่ควรบอกเว็บนอกว่าใครอ่านข่าวใบไหน
      imgs: document.querySelectorAll(".item img").length,
    };
  });
  ok("ทุกใบมีรูปเล็ก", th.all);
  ok("เป็นสี่เหลี่ยมเล็ก ไม่ยืดตามความสูงการ์ด", th.box.w === 46 && th.box.h === 46, JSON.stringify(th.box));
  ok("รูปเล็กยึด 'เว็บที่ข่าวอยู่' ไม่ใช่ชื่อ Google Alert",
     th.titles.every((t) => t && !/google alert|จับตามอง/i.test(t)), JSON.stringify(th.titles.slice(0, 3)));
  ok("คนละเว็บได้ตัวย่อคนละตัว (ไม่ใช่ป้ายเดียวกันทั้งหน้า)", new Set(th.inis).size > 1, JSON.stringify(th.inis));
  ok("🚫 ไม่โหลดรูปจากเว็บนอกสักใบ", th.imgs === 0, String(th.imgs));
  await ctx.close();
}

// ── [5] หน้าคลังหลักต้องไม่เปลี่ยน ────────────────────────────────
console.log("\n[5] 🚫 หน้าคลังหลักต้องไม่ถูกเปลี่ยนไปด้วย");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  await fakeArchive(p, "data");
  await p.goto(`${BASE}/archives/?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  const o = await p.evaluate(() => ({
    grps: document.querySelectorAll(".grp").length,
    thumbs: document.querySelectorAll(".thumb").length,
    items: document.querySelectorAll(".item").length,
  }));
  ok("ไม่มีกล่องหมวด", o.grps === 0, String(o.grps));
  ok("ไม่มีรูปเล็ก", o.thumbs === 0, String(o.thumbs));
  ok("ยังวาดข่าวเป็นรายการเรียงวันที่เหมือนเดิม", o.items > 0, String(o.items));
  await ctx.close();
}

// ── [6] ด่านระดับโค้ด ─────────────────────────────────────────────
console.log("\n[6] ด่านระดับโค้ด");
{
  ok("หน้าปลาหมอคางดำโหลดไฟล์หมวด", /topics-blackchin\.config\.js/.test(BC));
  ok("🚫 หน้าคลังหลักไม่โหลดไฟล์หมวด", !/topics-[\w-]+\.config\.js/.test(IDX));
  ok("app.js เปิดใช้หมวดจาก window.ARCHIVE_TOPICS เท่านั้น", /window\.ARCHIVE_TOPICS/.test(APP));
  ok("ไฟล์หมวดมีครบ 9 หมวด", (CFG.match(/^\s{2}\{\s*$|^\s{2}\{ id:/gm) || []).length === 9,
     String((CFG.match(/^\s{2}\{\s*$|^\s{2}\{ id:/gm) || []).length));
  ok("ถังรับของที่ไม่เข้าหมวดไหนอยู่ล่างสุดและไม่มีคำของตัวเอง",
     /id: "etc"[\s\S]*any: \[\] \}\s*,?\s*\];\s*$/.test(CFG.trim() + "\n"), "ต้องเป็นตัวสุดท้ายและ any ว่าง");
  // 🚫 หมวดคิดตอนโหลดครั้งเดียว ไม่ใช่ทุกครั้งที่วาด (365 ใบ × 9 หมวด ทุก render = เปลือง)
  ok("คิดหมวดตอนคลี่ข้อมูล ไม่ใช่ตอนวาด", /g: TOPICS \? topicOf\(/.test(APP));
  // 🚫 สถานะกาง/พับต้องอยู่นอก DOM — render() สร้าง innerHTML ใหม่ทั้งก้อนทุกครั้งที่ค้น
  ok("จำสถานะกาง/พับไว้นอก DOM", /const openG = new Set\(\)/.test(APP));
}

await browser.close();
console.log(`\n${fail ? "❌ ตก" : "✅ ผ่านหมด"} — ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
