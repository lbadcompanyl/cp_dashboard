/* 🗂 คลังปลาหมอคางดำ — แยกข่าวเป็นหมวดแบบพับได้ + รูปเล็กหน้าข่าว
 *
 * เจ้าของสั่ง 17 ก.ย. 2026: **"ข่าวต้องแยกเป็นหมวด … เป็นลักษณะ accordance
 * แยกหมวดคร่าวๆเองไปก่อน อยากดู interface และ ต้องมี thumbnail เล็กหน้าข่าวแต่ละข่าว"**
 *
 * สิ่งที่เทสต์นี้คุม
 *   [1] จัดหมวดถูกตามคำในพาดหัว · **1 ข่าว = 1 หมวด** (ผลรวมของทุกหมวด = จำนวนข่าวทั้งหมด)
 *   [2] **เปิดหน้ามาพับทุกหมวด** (เจ้าของสั่ง "defualt คือ ปิดทุกอัน") · ปุ่ม 2 ช่อง
 *       เปิดทั้งหมด/ปิดทั้งหมด ทำงาน · กด/พับ/ดูเพิ่ม ทำงาน
 *   [3] 🚫 **ค้นแล้วต้องไม่กางเอง** — เลขบนหัวข้อเป็นตัวบอกว่าหมวดไหนมีผล
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

/** ปุ่ม 2 ช่อง — คืนคำบนปุ่ม + ช่องที่กำลังถูกเลือก */
const segOf = (p) => p.$$eval(".gseg .gsegb", (bs) => bs.map((b) => ({
  text: b.textContent.replace(/\s+/g, " ").trim(),
  on: b.classList.contains("on"),
  pressed: b.getAttribute("aria-pressed"),
})));

/** กางทุกหมวดด้วยปุ่ม "เปิดทั้งหมด" (ไล่กดทีละหัวข้อก็ได้ แต่ท่านี้เป็นท่าที่ผู้ใช้ใช้จริง) */
async function openAll(p) {
  await p.click('.gseg [data-gall="open"]');
  await p.waitForTimeout(250);
}

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
  await openAll(p);
  const full = await groupsOf(p);
  const where = new Map();
  for (const g of full) for (const t of g.items) where.set(t, g.name);
  for (const [title, want] of CASES) {
    ok(`"${title.slice(0, 26)}…" → ${want}`, where.get(title) === want, String(where.get(title)));
  }
  ok("🚫 ไม่มี error หลุดออกมา", errs.length === 0, JSON.stringify(errs));
  await ctx.close();
}

// ── [2] เปิดหน้ามาพับทุกหมวด + ปุ่ม 2 ช่อง ────────────────────────
console.log("\n[2] ค่าตั้งต้นพับทุกหมวด · ปุ่ม 2 ช่อง · กาง/พับ/ดูเพิ่ม");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  await fakeArchive(p, "data-blackchin");
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);

  let gs = await groupsOf(p);
  // 🚫 เจ้าของสั่ง "defualt คือ ปิดทุกอัน" — กางเองแม้แต่หมวดเดียวก็ถือว่าตก
  ok("เปิดหน้ามาพับทุกหมวด", gs.every((g) => !g.open), JSON.stringify(gs.map((g) => g.open)));
  ok("พับอยู่ = ไม่วาดข่าวสักใบ", (await p.$$eval(".item", (n) => n.length)) === 0);
  ok("เลขบนหัวข้อยังบอกว่าหมวดไหนมีกี่ใบ", gs.filter((g) => g.n > 0).length > 1,
     JSON.stringify(gs.map((g) => g.n)));

  // 🔘 ปุ่ม 2 ช่อง — ต้องเห็นทั้ง 2 ตัวเลือกพร้อมกัน ไม่ใช่ป้ายใบเดียวที่กดแล้วสลับ
  let seg = await segOf(p);
  ok("มีปุ่ม 2 ช่อง โชว์ทั้ง 2 ตัวเลือก", seg.length === 2, JSON.stringify(seg));
  ok("ช่องซ้ายคือ 'เปิดทั้งหมด' ช่องขวาคือ 'ปิดทั้งหมด'",
     /เปิดทั้งหมด/.test(seg[0]?.text || "") && /ปิดทั้งหมด/.test(seg[1]?.text || ""), JSON.stringify(seg));
  ok("ค่าตั้งต้นเลือกอยู่ที่ 'ปิดทั้งหมด'", !seg[0].on && seg[1].on && seg[1].pressed === "true",
     JSON.stringify(seg));

  await openAll(p);
  gs = await groupsOf(p);
  seg = await segOf(p);
  ok("กดเปิดทั้งหมด → กางทุกหมวดที่มีข่าว", gs.filter((g) => g.n).every((g) => g.open),
     JSON.stringify(gs.map((g) => [g.n, g.open])));
  ok("กดแล้วช่องที่เลือกย้ายมาที่ 'เปิดทั้งหมด'", seg[0].on && !seg[1].on, JSON.stringify(seg));

  await p.click('.gseg [data-gall="close"]');
  await p.waitForTimeout(250);
  gs = await groupsOf(p);
  ok("กดปิดทั้งหมด → พับหมดทุกหมวด", gs.every((g) => !g.open), JSON.stringify(gs.map((g) => g.open)));
  ok("ปิดแล้วไม่เหลือข่าวที่วาดไว้", (await p.$$eval(".item", (n) => n.length)) === 0);

  // หมวดที่ไม่มีข่าวต้องกดไม่ได้ ไม่ใช่กดแล้วกางออกมาว่างเปล่า
  const dis = await p.$$eval(".ghead[disabled]", (b) => b.length);
  ok("หมวดที่ไม่มีข่าวกดไม่ได้", dis === gs.filter((g) => !g.n).length, String(dis));

  // ── กางทีละหมวด + ดูเพิ่ม ── (หมวดแรกมี 31 ใบ → วาด 25 แล้วมีปุ่ม "ดูอีก 6 ใบ")
  const heads = await p.$$(".ghead");
  await heads[0].click();
  await p.waitForTimeout(250);
  gs = await groupsOf(p);
  ok("กดหัวข้อเดียวกางเฉพาะหมวดนั้น", gs[0].open && gs.slice(1).every((g) => !g.open),
     JSON.stringify(gs.map((g) => g.open)));
  ok("หมวดใหญ่วาดทีละ 25 ใบ ไม่เทหมดทีเดียว", gs[0].items.length === 25, String(gs[0].items.length));

  ok("มีปุ่มดูอีกของหมวดนั้น", !!(await p.$("[data-gmore]")));
  await p.click("[data-gmore]");
  await p.waitForTimeout(250);
  gs = await groupsOf(p);
  ok("กดดูอีกแล้วได้ครบทั้งหมวด", gs[0].items.length === gs[0].n, `${gs[0].items.length} / ${gs[0].n}`);
  ok("ครบแล้วปุ่มดูอีกหายไป", !(await p.$("[data-gmore]")));

  (await p.$$(".ghead"))[0].click();
  await p.waitForTimeout(250);
  gs = await groupsOf(p);
  ok("กดหัวข้อแล้วพับลงได้", !gs[0].open && gs[0].items.length === 0);
  await ctx.close();
}

// ── [3] ค้นแล้วต้องไม่กางเอง ──────────────────────────────────────
console.log("\n[3] 🚫 ค้นแล้วต้องไม่กางหมวดให้เอง");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  await fakeArchive(p, "data-blackchin");
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  await p.fill("#q", "ศาลอุทธรณ์");
  await p.press("#q", "Enter");
  await p.waitForTimeout(400);

  let gs = await groupsOf(p);
  // 🚫 "ปิดทุกอัน" ครอบทุกกรณี รวมถึงหลังค้น — ไม่มีข้อยกเว้น
  ok("ค้นแล้วยังพับทุกหมวด", gs.every((g) => !g.open), JSON.stringify(gs.map((g) => g.open)));
  // ที่ไม่หลงทางเพราะเลขบนหัวข้อบอกอยู่แล้วว่าผลอยู่หมวดไหน
  ok("เลขบนหัวข้อเปลี่ยนตามผลค้น", gs.reduce((a, g) => a + g.n, 0) < CASES.length + FILLER,
     JSON.stringify(gs.map((g) => g.n)));
  ok("หมวดที่ไม่มีผลเหลือ 0 และกดไม่ได้",
     (await p.$$eval(".ghead[disabled]", (b) => b.length)) === gs.filter((g) => !g.n).length);

  await openAll(p);
  gs = await groupsOf(p);
  ok("กดเปิดทั้งหมดแล้วเห็นผลค้น", gs.filter((g) => g.n).every((g) => g.items.length > 0));
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
  // กางทุกหมวดก่อน — ค่าตั้งต้นพับหมด ถ้าไม่กางจะไม่มีการ์ดให้วัดเลย
  await openAll(p);
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

  // 🚫 ห้ามเอาการกางอัตโนมัติกลับมา (เจ้าของสั่ง "defualt คือ ปิดทุกอัน")
  //    ของเดิมมี `let gInit` กางหมวดแรก และ `searching` กางทุกหมวดที่มีผล — ถอดออกทั้งคู่แล้ว
  ok("🚫 ไม่มีตัวกางหมวดแรกให้เองตอนเปิดหน้า", !/\bgInit\b/.test(APP));
  ok("🚫 ตัวตัดสินว่ากางไหม ดูจากที่ผู้ใช้กดอย่างเดียว",
     /const open = list\.length && openG\.has\(i\);/.test(APP), "เจอเงื่อนไขอื่นปนใน `open`");
  // 🔘 ปุ่มต้องเป็น 2 ช่อง ไม่ใช่ปุ่มใบเดียวที่กดแล้วสลับ — เจ้าของบอกเองว่า "คนจะไม่รู้ซิว่ากดได้"
  ok("ปุ่มเปิด/ปิดทั้งหมดเป็น 2 ช่องแยกกัน",
     /data-gall="open"/.test(APP) && /data-gall="close"/.test(APP));
  // เปิด/ปิดทั้งหมดต้องล้างตัวนับ "แสดงไปแล้วกี่ใบ" ด้วย ไม่งั้นกางใหม่แล้วเจอรายการยาวค้างจากรอบก่อน
  ok("เปิด/ปิดทั้งหมดล้างตัวนับของทุกหมวด", /openG\.clear\(\);[\s\S]{0,200}shownG\.clear\(\)/.test(APP));
}

await browser.close();
console.log(`\n${fail ? "❌ ตก" : "✅ ผ่านหมด"} — ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
