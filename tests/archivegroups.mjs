/* 🗂 คลังปลาหมอคางดำ — แท็บหมวด + ค้นแยกรายหมวด + รูปเล็กหน้าข่าว
 *
 * เจ้าของสั่ง 17 ก.ย. 2026: **"ข่าวต้องแยกเป็นหมวด … ต้องมี thumbnail เล็กหน้าข่าวแต่ละข่าว"**
 * แล้วสั่งเปลี่ยนวิธี 18 ก.ย. 2026: **"การค้นให้ค้นแยกแต่ละหมวด … เอาเป็น tab แยกในหน้าเดียว"**
 * (ของเดิมเป็น accordion กางทีละหมวด — ถอดออกแล้ว)
 *
 * สิ่งที่เทสต์นี้คุม
 *   [1] จัดหมวดถูกตามคำในพาดหัว · **1 ข่าว = 1 หมวด** (ผลรวมของทุกแท็บ = จำนวนข่าวทั้งหมด)
 *   [2] แท็บทำงาน — กดแล้วเหลือเฉพาะหมวดนั้น · เข้า URL (`?g=`) · กด back ย้อนได้
 *   [3] **ค้นแยกรายหมวด** และกับดักที่มากับมัน: ค้นแล้วหมวดนี้ไม่มี ต้องบอกว่า
 *       **หมวดอื่นมีกี่ใบ** + ปุ่มค้นทุกหมวด · 🚫 ห้ามขึ้นว่า "ไม่มีคำนี้ในคลังเลย" ทั้งที่มี
 *   [4] มีรูปเล็กทุกใบ และ **ยึดเว็บที่ข่าวอยู่ ไม่ใช่คอลัมน์สำนักข่าวในชีต**
 *   [5] 🚫 **หน้าคลังหลักต้องไม่เปลี่ยน** — ไม่มีแท็บหมวด ไม่มีรูปเล็ก
 *   [6] 📱 จอแคบ — แท็บ **ห้ามตกบรรทัด** และต้องเหลือที่อ่านข่าวอย่างน้อย ⅓ จอ
 *   [7] ด่านระดับโค้ด
 *
 * ⚠️ ปลอมไฟล์คลังด้วย page.route — ที่วัดคือ "โค้ดจัดหมวด/วาดถูกไหม" ไม่ใช่ "ข่าวจริงอยู่หมวดถูกไหม"
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
const CSS = fs.readFileSync(new URL("../archives/styles.css", import.meta.url), "utf8");
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

const FILLER = 30;   // ข่าวคดีเติมให้หมวดแรกเกินเพดานหน้าละ 50 ใบ

/** คลังปลอม — ใบละคนละเว็บ จะได้เช็คว่ารูปเล็กยึดเว็บจริง */
function fakeArchive(page, dir) {
  const hosts = ["thairath.co.th", "matichon.co.th", "dailynews.co.th", "posttoday.com",
                 "khaosod.co.th", "bangkokbiznews.com", "prachachat.net", "thaipbs.or.th", "naewna.com"];
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

/** แท็บทุกอันบนหน้า — ชื่อ · เลข · เลือกอยู่ไหม */
const tabsOf = (p) => p.$$eval(".gtab", (bs) => bs.map((b) => ({
  name: b.querySelector(".gtname")?.textContent.trim(),
  n: +(b.querySelector(".gtn")?.textContent.replace(/\D/g, "") || 0),
  on: b.classList.contains("on"),
  id: b.dataset.gt,
})));

const titlesOf = (p) => p.$$eval(".item a.t", (a) => a.map((x) => x.textContent.replace(/\s+/g, " ").trim()));

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

  const ts = await tabsOf(p);
  ok("มีแท็บ 'ทั้งหมด' + ครบ 9 หมวด", ts.length === 10 && ts[0].id === "", String(ts.length));
  ok("แท็บแรกคือ 'ทั้งหมด' และเลือกอยู่ตอนเปิดหน้า", ts[0].name === "ทั้งหมด" && ts[0].on,
     JSON.stringify(ts[0]));
  ok("แท็บสุดท้ายคือถังรับของที่ไม่เข้าหมวดไหน", ts.at(-1)?.name === "อื่น ๆ", String(ts.at(-1)?.name));

  const total = CASES.length + FILLER;
  ok("เลขบนแท็บ 'ทั้งหมด' = จำนวนข่าวทั้งคลัง", ts[0].n === total, `${ts[0].n} ≠ ${total}`);
  // ผลรวมต้องเท่าจำนวนข่าว — ถ้าใบเดียวเข้าหลายหมวด ตัวเลขบนแท็บจะรวมกันเกิน อ่านแล้วงง
  const sum = ts.slice(1).reduce((a, t) => a + t.n, 0);
  ok("ผลรวมทุกหมวด = จำนวนข่าวทั้งหมด (1 ข่าว = 1 หมวด)", sum === total, `${sum} ≠ ${total}`);

  // ไล่ดูว่าแต่ละพาดหัวไปอยู่หมวดที่ควรอยู่ไหม — กดเข้าไปดูทีละแท็บ
  const where = new Map();
  for (const t of ts.slice(1)) {
    if (!t.n) continue;
    await p.click(`.gtab[data-gt="${t.id}"]`);
    await p.waitForTimeout(150);
    for (const title of await titlesOf(p)) where.set(title, t.name);
  }
  for (const [title, want] of CASES) {
    ok(`"${title.slice(0, 26)}…" → ${want}`, where.get(title) === want, String(where.get(title)));
  }
  ok("🚫 ไม่มี error หลุดออกมา", errs.length === 0, JSON.stringify(errs));
  await ctx.close();
}

// ── [2] แท็บทำงาน + เข้า URL + กด back ────────────────────────────
console.log("\n[2] กดแท็บ · ลิงก์ส่งต่อ · กด back");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  await fakeArchive(p, "data-blackchin");
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);

  ok("เปิดหน้ามาเห็นข่าวทันที ไม่ต้องกดอะไรก่อน", (await p.$$eval(".item", (n) => n.length)) > 0);

  await p.click('.gtab[data-gt="dna"]');
  await p.waitForTimeout(250);
  let ts = await tabsOf(p);
  const dna = ts.find((t) => t.id === "dna");
  ok("กดแท็บแล้วแท็บนั้นถูกเลือก", dna.on && !ts[0].on, JSON.stringify(ts.map((t) => t.on)));
  ok("รายการเหลือเฉพาะหมวดนั้น", (await p.$$eval(".item", (n) => n.length)) === dna.n,
     `${await p.$$eval(".item", (n) => n.length)} ≠ ${dna.n}`);
  ok("บรรทัดนับบอกว่ากำลังดูหมวดไหน",
     /งานวิจัย DNA/.test(await p.$eval("#count", (e) => e.textContent)),
     await p.$eval("#count", (e) => e.textContent.trim()));
  ok("หมวดเข้า URL ด้วย (ส่งลิงก์ตรงหมวดได้)", /[?&]g=dna\b/.test(await p.evaluate(() => location.search)),
     await p.evaluate(() => location.search));
  // 🚫 เลขบนแท็บอื่นต้องไม่กลายเป็น 0 ตอนเปิดหมวดใดหมวดหนึ่ง — ไม่งั้นหาของที่เหลือไม่เจอ
  ok("เลขบนแท็บอื่นยังอยู่ครบ ไม่ถูกหมวดที่เปิดอยู่ตัดทิ้ง",
     ts.filter((t) => t.n > 0).length > 1, JSON.stringify(ts.map((t) => t.n)));

  await p.goBack();
  await p.waitForTimeout(300);
  ts = await tabsOf(p);
  ok("กด back แล้วกลับไป 'ทั้งหมด'", ts[0].on, JSON.stringify(ts.map((t) => t.on)));

  // เปิดจากลิงก์ตรงๆ
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw&g=trade`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  ts = await tabsOf(p);
  ok("เปิดจากลิงก์ที่มีหมวดติดมา ได้หมวดนั้นเลย", ts.find((t) => t.id === "trade")?.on === true);

  // หมวดที่ไม่มีอยู่จริง (config เปลี่ยนไปแล้ว) ต้องตกกลับไปที่ทั้งหมด ไม่ใช่หน้าว่าง
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw&g=ไม่มีหมวดนี้`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  ts = await tabsOf(p);
  ok("หมวดที่ไม่มีอยู่จริง → ตกกลับไปที่ 'ทั้งหมด' ไม่ใช่หน้าว่าง",
     ts[0].on && (await p.$$eval(".item", (n) => n.length)) > 0);
  await ctx.close();
}

// ── [3] ค้นแยกรายหมวด + กับดักที่มากับมัน ─────────────────────────
console.log("\n[3] ค้นแยกรายหมวด");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  await fakeArchive(p, "data-blackchin");
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw&g=dna`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);

  // ค้นคำที่มีอยู่ในหมวดที่เปิดอยู่
  await p.fill("#q", "DNA");
  await p.press("#q", "Enter");
  await p.waitForTimeout(400);
  ok("ค้นแล้วได้เฉพาะข่าวในหมวดที่เปิดอยู่",
     (await titlesOf(p)).every((t) => /dna/i.test(t)), JSON.stringify(await titlesOf(p)));

  // 🐞 ค้นคำที่อยู่คนละหมวด — นี่คือกับดักหลักของการค้นแยกหมวด
  await p.fill("#q", "ศาลอุทธรณ์");
  await p.press("#q", "Enter");
  await p.waitForTimeout(500);
  const box = await p.$eval("#list", (e) => e.textContent.replace(/\s+/g, " ").trim());
  const ts = await tabsOf(p);
  ok("บอกว่าไม่เจอ 'ในหมวดนี้' พร้อมชื่อหมวด", /ไม่เจอ/.test(box) && /งานวิจัย DNA/.test(box), box.slice(0, 120));
  ok("บอกด้วยว่าหมวดอื่นมีกี่ใบ", /หมวดอื่นรวมกันมี/.test(box) && /31/.test(box), box.slice(0, 160));
  ok("มีปุ่ม 'ค้นทุกหมวด' ให้กด", !!(await p.$('#list [data-gt=""]')));
  // 🚫 ข้อห้ามข้อใหญ่: ห้ามสรุปว่าคลังไม่มีคำนี้ ทั้งที่มีอยู่คนละหมวด
  const ask = await p.$eval("#askbar", (e) => e.textContent.replace(/\s+/g, " ").trim()).catch(() => "");
  ok("🚫 ไม่โกหกว่า 'ไม่มีคำนี้ในคลังเลย'", !/ไม่มีข่าวที่มีคำว่า/.test(ask + box), (ask + " ‖ " + box).slice(0, 150));
  ok("🚫 ไม่บอกให้ลดตัวกรอง ทั้งที่ไม่ได้ตั้งตัวกรองอะไร", !/ลดตัวกรอง/.test(box), box.slice(0, 120));
  ok("เลขบนแท็บยังชี้ว่าผลไปกองที่หมวดไหน",
     ts.find((t) => t.id === "court")?.n === 31 && ts.find((t) => t.id === "dna")?.n === 0,
     JSON.stringify(ts.map((t) => [t.id, t.n])));

  await p.click('#list [data-gt=""]');
  await p.waitForTimeout(400);
  ok("กดค้นทุกหมวดแล้วเจอของที่มีอยู่จริง", (await p.$$eval(".item", (n) => n.length)) > 0);
  ok("กดแล้วหมวดหลุดออกจาก URL", !/[?&]g=/.test(await p.evaluate(() => location.search)),
     await p.evaluate(() => location.search));
  ok("คำค้นยังอยู่ ไม่ได้ถูกล้างไปด้วย", (await p.$eval("#q", (e) => e.value)) === "ศาลอุทธรณ์");
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
    tabs: document.querySelectorAll(".gtab").length,
    bar: document.querySelectorAll("#gtabs").length,
    thumbs: document.querySelectorAll(".thumb").length,
    items: document.querySelectorAll(".item").length,
  }));
  ok("ไม่มีแท็บหมวด", o.tabs === 0 && o.bar === 0, JSON.stringify(o));
  ok("ไม่มีรูปเล็ก", o.thumbs === 0, String(o.thumbs));
  ok("ยังวาดข่าวเป็นรายการเรียงวันที่เหมือนเดิม", o.items > 0, String(o.items));
  await ctx.close();
}

// ── [6] จอแคบ ─────────────────────────────────────────────────────
console.log("\n[6] 📱 จอแคบ");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const p = await ctx.newPage();
  await fakeArchive(p, "data-blackchin");
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  const m = await p.evaluate(() => {
    const bar = document.querySelector("#gtabs").getBoundingClientRect();
    const sticky = document.querySelector(".sticky").getBoundingClientRect();
    const one = document.querySelector(".gtab").getBoundingClientRect();
    return {
      barH: Math.round(bar.height), tabH: Math.round(one.height),
      read: Math.round(innerHeight - sticky.bottom), vh: innerHeight,
      wide: document.scrollingElement.scrollWidth > innerWidth,
      scrollable: document.querySelector("#gtabs").scrollWidth > document.querySelector("#gtabs").clientWidth,
    };
  });
  // 🚫 9 หมวดตกบรรทัดบนจอแคบ = กินจอ 3-4 แถว เหลือที่อ่านข่าวไม่ถึงครึ่ง
  ok("แท็บไม่ตกบรรทัด (สูงเท่าแท็บเดียว)", m.barH <= m.tabH + 14, `แถบ ${m.barH} · แท็บ ${m.tabH}`);
  ok("เลื่อนซ้ายขวาได้ (ไม่ได้ถูกบีบจนอ่านไม่ออก)", m.scrollable);
  ok("🚫 หน้าไม่กว้างเกินจอ", !m.wide);
  ok("ยังเหลือที่อ่านข่าว ≥ ⅓ จอ", m.read >= m.vh / 3, `${m.read} / ${m.vh}`);

  // แท็บที่เลือกอยู่ต้องถูกเลื่อนมาให้เห็น ไม่ใช่ซ่อนอยู่นอกจอ
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw&g=etc`, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  const seen = await p.evaluate(() => {
    const bar = document.querySelector("#gtabs"), on = bar.querySelector(".gtab.on");
    return on.offsetLeft >= bar.scrollLeft - 1 &&
           on.offsetLeft + on.offsetWidth <= bar.scrollLeft + bar.clientWidth + 1;
  });
  ok("เปิดจากลิงก์แล้วแท็บที่เลือกถูกเลื่อนมาให้เห็น", seen);
  await ctx.close();
}

// ── [7] ด่านระดับโค้ด ─────────────────────────────────────────────
console.log("\n[7] ด่านระดับโค้ด");
{
  ok("หน้าปลาหมอคางดำโหลดไฟล์หมวด", /topics-blackchin\.config\.js/.test(BC));
  ok("🚫 หน้าคลังหลักไม่โหลดไฟล์หมวด", !/topics-[\w-]+\.config\.js/.test(IDX));
  ok("app.js เปิดใช้หมวดจาก window.ARCHIVE_TOPICS เท่านั้น", /window\.ARCHIVE_TOPICS/.test(APP));
  ok("ไฟล์หมวดมีครบ 9 หมวด", (CFG.match(/^\s{2}\{\s*$|^\s{2}\{ id:/gm) || []).length === 9,
     String((CFG.match(/^\s{2}\{\s*$|^\s{2}\{ id:/gm) || []).length));
  ok("ถังรับของที่ไม่เข้าหมวดไหนอยู่ล่างสุดและไม่มีคำของตัวเอง",
     /id: "etc"[\s\S]*any: \[\] \}\s*,?\s*\];\s*$/.test(CFG.trim() + "\n"), "ต้องเป็นตัวสุดท้ายและ any ว่าง");
  // 🚫 หมวดคิดตอนโหลดครั้งเดียว ไม่ใช่ทุกครั้งที่วาด
  ok("คิดหมวดตอนคลี่ข้อมูล ไม่ใช่ตอนวาด", /g: TOPICS \? topicOf\(/.test(APP));

  // 🚫 เลขบนแท็บต้องมาจาก `scoped` (ผ่านทุกเงื่อนไขยกเว้นหมวด) ไม่ใช่ `filtered`
  //    เอามาจาก filtered เมื่อไหร่ แท็บอื่นจะเป็น 0 หมดทันทีที่เปิดหมวดใดหมวดหนึ่ง
  ok("เลขบนแท็บนับจาก scoped", /for \(const r of scoped\) gCounts\[r\.g\]\+\+/.test(APP));
  ok("หมวดถูกกรองทีหลัง แยกจาก scoped", /filtered = scoped\.filter\(\(r\) => r\.g === gi\)/.test(APP));

  // 🚫 ตัวผ่อนเงื่อนไขต้องวัดกับทั้งคลัง ไม่ใช่หมวดที่เปิดอยู่
  //    ไม่งั้นเปิดหมวดเล็กไว้แล้วค้นอะไรก็ "ไม่เจอ" → ไล่ตัดวันที่/ตัดคำทิ้งทั้งที่คลังมีของอยู่
  ok("ตัวผ่อนเงื่อนไขวัดกับทั้งคลัง", /function relaxIfEmpty\(\) \{\n  if \(scoped\.length\) return "";/.test(APP));
  ok('🚫 ไม่มีที่ไหนสรุป "ไม่มีในคลัง" จาก filtered', !/if \(!filtered\.length && !relaxNote\)/.test(APP));

  // 🚫 แท็บที่เหลือ 0 ต้องยังอยู่ที่เดิม — ซ่อนแล้วแท็บกระโดดสลับตำแหน่งทุกครั้งที่พิมพ์
  ok("แท็บที่เหลือ 0 จางลงแต่ไม่ถูกซ่อน", /\.gtab\.zero:not\(\.on\) \{ opacity/.test(CSS) && !/\.gtab\.zero[^{]*\{[^}]*display:\s*none/.test(CSS));
  // 📱 แถบแท็บต้องเลื่อนซ้ายขวา ห้ามตกบรรทัด
  // ⚠️ ต้องจำกัดให้อยู่ใน "ตัวกฎ" เท่านั้น (`[^}]*`) — ใช้ [\s\S]*? จะวิ่งข้ามกฎไปเจอ
  //    flex-wrap ของกฎอื่นที่อยู่ท้ายไฟล์ แล้วตกทั้งที่โค้ดถูก (เจอตอนรันจริง)
  const gtabsRule = (CSS.match(/\.gtabs \{[^}]*\}/) || [""])[0];
  ok("แถบแท็บเลื่อนซ้ายขวา ไม่ใช่ตกบรรทัด",
     /overflow-x:\s*auto/.test(gtabsRule) && !/flex-wrap:\s*wrap/.test(gtabsRule), gtabsRule.slice(0, 80));
  // 🖥 ตกบรรทัดได้เฉพาะจอกว้าง — ต้องอยู่ใน @media (min-width: …) เท่านั้น
  //    ถ้าหลุดออกมาอยู่นอก media query เมื่อไหร่ มือถือจะโดนด้วยทันที
  const wrapRules = [...CSS.matchAll(/\.gtabs \{[^}]*flex-wrap:\s*wrap[^}]*\}/g)].map((m) => m.index);
  ok("ตกบรรทัดได้เฉพาะจอกว้าง (อยู่ใน @media min-width)",
     wrapRules.every((i) => /@media \(min-width:\s*\d+px\)[^{]*\{\s*$/.test(CSS.slice(0, i).split("\n").slice(-2).join("\n").trim() + "\n")
       || /@media \(min-width:/.test(CSS.slice(Math.max(0, i - 220), i))),
     JSON.stringify(wrapRules));

  // 🚫 ของเดิม (accordion) ต้องถูกถอดออกให้หมด ไม่ใช่ทิ้งค้างไว้ให้เข้าใจผิดว่ายังใช้อยู่
  ok("🚫 ไม่เหลือโค้ด accordion ค้างไว้", !/\bopenG\b|\bshownG\b|function renderGroups/.test(APP.replace(/\/\*[\s\S]*?\*\//g, "")));
}

await browser.close();
console.log(`\n${fail ? "❌ ตก" : "✅ ผ่านหมด"} — ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
