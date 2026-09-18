/* 💬 คลังปลาหมอคางดำ — ตัวกรอง "ข่าว / Social"
 *
 * เจ้าของสั่ง 18 ก.ย. 2026: **"ในคลังข่าวปลาหมอ เพิ่ม filter แยก ข่าว กับ social"**
 * แล้วเลือกเองอีก 2 ข้อ:
 *   · แถวที่คอลัมน์ `Channel` เว้นว่าง → **เดาจากลิงก์ก่อน ไม่เข้าก็เป็นข่าว** (ไม่มีถัง "ไม่ระบุ")
 *   · วางตัวกรองไว้ **ในแถบหมวดเดียวกับ 10 หมวด**
 *
 * สิ่งที่เทสต์นี้คุม
 *   [1] แยกฝั่งถูก — คอลัมน์ `Channel` ชนะการเดาจากลิงก์เสมอ · ชิพอยู่ในแถบเดียวกับหมวด
 *   [3] **2 มิติตัดกัน** — เปิดหมวด + เปิดช่องทางพร้อมกันได้ · เลขของแต่ละฝั่งนับจากกองที่ถูก
 *   [5] เข้า URL (`?ch=`) · กดซ้ำ = ปิด · กด back ย้อนได้
 *   [6] 🚫 **หน้าคลังหลักต้องไม่มีชิพนี้เลย** (ไม่ได้โหลด channels.config.js)
 *   [7] ด่านระดับโค้ด
 *
 * ⚠️ ปลอมไฟล์คลังด้วย page.route — ที่วัดคือ "โค้ดแยกฝั่ง/วาด/นับถูกไหม"
 *    ไม่ใช่ "ข่าวจริงในชีตอยู่ฝั่งถูกไหม"
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
const CH = fs.readFileSync(new URL("../archives/channels.config.js", import.meta.url), "utf8");
const BC = fs.readFileSync(new URL("../archives/blackchin.html", import.meta.url), "utf8");
const IDX = fs.readFileSync(new URL("../archives/index.html", import.meta.url), "utf8");
const BUILD = fs.readFileSync(new URL("../tools/build-archives.mjs", import.meta.url), "utf8");
const OUT = fs.readFileSync(new URL("../archives/outlets.config.js", import.meta.url), "utf8");
const BUILDMOD = await import("../tools/build-archives.mjs");

/* คลังปลอม — [ค่าในคอลัมน์ Channel, ลิงก์, ฝั่งที่ควรได้, เลขหมวดที่ติ๊ก, พาดหัว]
 *
 * ⚠️ **พาดหัวต้องต่างกันจริงๆ ทุกใบ** — `groupStories()` รวมข่าว "เรื่องเดียวกัน"
 *    ที่หลายสำนักลงเป็นการ์ดใบเดียว ถ้าพาดหัวคล้ายกัน (เช่น "รายการทดสอบ 1/2/3")
 *    ทั้ง 6 ใบจะยุบเหลือการ์ดเดียว แล้วเทสต์ที่นับ `.item` จะตกทั้งที่โค้ดถูก
 *    (เจอจริงตอนเขียนเทสต์นี้รอบแรก — ตก 6 ข้อ)
 */
const CASES = [
  ["Website",  "https://www.thairath.co.th/news/1",         "news",   ["1"], "ศาลปกครองสูงสุดนัดฟังคำสั่งคดีปลาหมอคางดำเดือนหน้า"],
  ["Facebook", "https://www.matichon.co.th/local/2",         "social", ["1"], "เพจดังโพสต์คลิปชาวประมงลากอวนได้ปลาหมอคางดำเต็มลำ"],
  // 🥇 ใบนี้คือเหตุผลทั้งหมดที่คอลัมน์ `Channel` ต้องชนะการเดาจากลิงก์
  //    ชีตจริงมีแถวแบบนี้: ติ๊ก TikTok ไว้ แต่ลิงก์เป็นหน้าคลิปสั้นของเว็บข่าว
  ["TikTok",   "https://www.thairath.co.th/video/shorts/3",  "social", ["4"], "คลิปสั้นอธิบายผลตรวจดีเอ็นเอปลาหมอคางดำแบบเข้าใจง่าย"],
  ["",         "https://www.facebook.com/watch/?v=4",        "social", ["1"], "ไลฟ์สดจากศาลากลางจังหวัด ชาวบ้านยื่นหนังสือเรียกค่าเสียหาย"],
  ["",         "https://www.youtu.be/abcd5",                 "social", ["4"], "สารคดีสั้น ตามนักวิจัยลงเรือเก็บตัวอย่างน้ำกลางอ่าว"],
  ["",         "https://www.dailynews.co.th/news/6",         "news",   ["1"], "ทนายความยืนยันเดินหน้าฟ้องแบบกลุ่มต่อไปแม้ถูกคัดค้าน"],
];

const WANT_NEWS = CASES.filter((c) => c[2] === "news").length;
const WANT_SOCIAL = CASES.filter((c) => c[2] === "social").length;

function fakeArchive(page, dir) {
  const chList = ["Website", "Facebook", "TikTok"];
  const cList = ["1", "4"];
  return page.route(`**/archives/${dir}/*.json`, (route) => {
    const u = route.request().url();
    const body = u.endsWith("index.json")
      ? { generatedAt: "2026-09-18T00:00:00.000Z", total: CASES.length, noDate: 0, years: [{ y: 2026, n: CASES.length }] }
      : {
          o: ["หัวข้อที่จับตามอง"],
          c: cList,
          ch: chList,
          // ⚠️ ช่องที่ 6 (ช่องทาง) **ต่อท้าย** · แถวที่ไม่ได้กรอกจะสั้นกว่า — เหมือนของจริง
          r: CASES.map(([ch, url, , cats, t], i) => {
            const row = [t, url, 1789600000 - i * 3600, 0, cats.map((c) => cList.indexOf(c))];
            if (ch) row.push(chList.indexOf(ch));
            return row;
          }),
        };
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

const tabsOf = (p) => p.$$eval("#gtabs .gtab", (bs) => bs.map((b) => ({
  name: b.querySelector(".gtname")?.textContent.trim(),
  n: +(b.querySelector(".gtn")?.textContent.replace(/\D/g, "") || 0),
  on: b.classList.contains("on"),
  g: b.dataset.gt,
  ch: b.dataset.ch,
})));
const titlesOf = (p) => p.$$eval(".item a.t", (a) => a.map((x) => x.textContent.replace(/\s+/g, " ").trim()));

const browser = await launch();

// ── [1] แยกฝั่งถูก + ชิพอยู่ในแถบเดียวกับหมวด ──────────────────────
console.log("\n[1] แยก ข่าว / Social");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await fakeArchive(p, "data-blackchin");
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);

  const ts = await tabsOf(p);
  const chips = ts.filter((t) => t.ch);
  ok("ชิพช่องทางอยู่ใน #gtabs แถบเดียวกับหมวด (เจ้าของเลือกเอง)", chips.length === 2,
     `เจอ ${chips.length} ชิพ`);
  ok("ชิพเรียง ข่าว → Social", chips[0]?.name === "ข่าว" && chips[1]?.name === "Social",
     JSON.stringify(chips.map((c) => c.name)));
  ok("ชิพอยู่ท้ายแถบ ต่อจากหมวดทั้งหมด", ts.slice(-2).every((t) => t.ch),
     JSON.stringify(ts.slice(-3).map((t) => t.name)));
  ok("มีเส้นคั่นกั้นชิพออกจากหมวด", (await p.$$("#gtabs .gsep")).length === 1);
  ok("ตอนเปิดหน้า ยังไม่ได้เลือกช่องทางไหน", chips.every((c) => !c.on));

  ok(`เลขบนชิพ "ข่าว" = ${WANT_NEWS}`, chips[0]?.n === WANT_NEWS, String(chips[0]?.n));
  ok(`เลขบนชิพ "Social" = ${WANT_SOCIAL}`, chips[1]?.n === WANT_SOCIAL, String(chips[1]?.n));

  // 🥇 ใบที่ติ๊ก TikTok แต่ลิงก์เป็นเว็บข่าว ต้องอยู่ฝั่ง Social
  await p.click('#gtabs .gtab[data-ch="social"]');
  await p.waitForTimeout(200);
  const soc = await titlesOf(p);
  for (const [, , want, , t] of CASES) {
    if (want !== "social") continue;
    ok(`"${t.slice(0, 22)}…" → Social`, soc.includes(t), JSON.stringify(soc));
  }
  ok("ใบที่ลิงก์เป็นเว็บข่าวและไม่ได้ติ๊ก ไม่หลุดมาฝั่ง Social",
     !soc.includes(CASES[5][4]) && !soc.includes(CASES[0][4]));
  ok("🚫 ไม่มี error หลุดออกมา", errs.length === 0, JSON.stringify(errs));
  await ctx.close();
}

// ── [2] ยุบชื่อช่อง social เหลือชื่อแพลตฟอร์ม ──────────────────────
/* เจ้าของสั่ง 18 ก.ย. 2026: "social แยกเป็น channel พอ ไม่ต้องแยกเป็นชื่อช่อง"
   ในชีตเขียนเป็นชื่อบัญชี (`TikTok (sgethai)`) ซึ่งแตกเป็นตัวเลือกละบรรทัดในตัวกรอง */
console.log("\n[2] ยุบชื่อช่อง social ในตัวกรองสำนักข่าว");
{
  const NAMES = [
    ["TikTok (sgethai)", "TikTok"],
    ["TikTok (katecalissa)", "TikTok"],
    ["YouTube (beartai)", "YouTube"],
    ["Facebook Reel", "Facebook"],
    ["Instagram Reels", "Instagram"],
    // 🚫 ชื่อที่มีสำนักข่าวติดอยู่ ห้ามยุบ — ยุบแล้วสำนักข่าวนั้นหายจากตัวกรองทั้งเจ้า
    ["TNN ผ่าน LINE TODAY", "TNN ผ่าน LINE TODAY"],
    ["INN News Facebook", "INN News Facebook"],
    // 🚫 มีวงเล็บแต่ไม่มีชื่อแพลตฟอร์ม = ไม่ใช่ social ห้ามแตะ
    ["สยามรัฐ (archive)", "สยามรัฐ (archive)"],
    ["ไทยรัฐ", "ไทยรัฐ"],
  ];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  await p.route("**/archives/data-blackchin/*.json", (route) => {
    const u = route.request().url();
    const body = u.endsWith("index.json")
      ? { generatedAt: "2026-09-18T00:00:00.000Z", total: NAMES.length, noDate: 0, years: [{ y: 2026, n: NAMES.length }] }
      : {
          o: NAMES.map(([raw]) => raw),
          c: ["1"],
          r: NAMES.map(([, , ], i) => [
            `ข่าวทดสอบชื่อสำนักข่าวลำดับที่ ${i + 1} เรื่องปลาหมอคางดำในพื้นที่ต่างจังหวัด`,
            `https://example.com/n/${i}`, 1789600000 - i * 3600, i, [0]]),
        };
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);

  const shown = await p.$$eval("#srcs .src", (bs) => bs.map((x) => x.querySelector(".nm").textContent.trim()));
  for (const [raw, want] of NAMES) {
    ok(`"${raw}" → ${want}`, shown.includes(want), JSON.stringify(shown));
  }
  ok("🚫 ไม่มีชื่อบัญชีในวงเล็บหลงเหลือในตัวกรอง",
     !shown.some((s) => /^(TikTok|YouTube|Facebook|Instagram)\s*\(/i.test(s)), JSON.stringify(shown));
  ok("TikTok 2 บัญชียุบเหลือบรรทัดเดียว",
     shown.filter((s) => /^TikTok/i.test(s)).length === 1, JSON.stringify(shown));

  // รายชื่อแพลตฟอร์มอยู่ใน config ไม่ได้ฝังในโค้ด
  ok("รายชื่อแพลตฟอร์มอยู่ใน outlets.config.js",
     /ARCHIVE_SOCIAL_OUTLETS\s*=/.test(OUT) && /window\.ARCHIVE_SOCIAL_OUTLETS/.test(APP));
  // 🐞 ด่านนี้เกิดจากบั๊กจริง: เขียนเช็คด้วย \p{L} แล้วคำไทยที่มีวรรณยุกต์ตกด่านทุกคำ
  ok("🚫 foldSocial ไม่ได้เช็คตัวอักษรด้วย \\p{L} (วรรณยุกต์ไทยเป็น \\p{M} จะตกด่าน)",
     !/function foldSocial[\s\S]*?\n\}/.exec(APP)?.[0].includes("\\p{L}"),
     "เจอ \\p{L} ใน foldSocial");
  await ctx.close();
}

// ── [3] หมวด × ช่องทาง ตัดกัน ────────────────────────────────────
console.log("\n[3] เปิดหมวดกับช่องทางพร้อมกัน");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  await fakeArchive(p, "data-blackchin");
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);

  // หมวด 1 (ศาล/คดีความ) มี 4 ใบ — social 2 · news 2
  await p.click('#gtabs .gtab[data-gt="court"]');
  await p.waitForTimeout(200);
  let ts = await tabsOf(p);
  ok("เปิดหมวดแล้ว แท็บหมวดนั้นถูกเลือก", ts.find((t) => t.g === "court")?.on === true);
  ok("ก่อนกรองช่องทาง หมวดศาล/คดีความมี 4 ใบ", ts.find((t) => t.g === "court")?.n === 4,
     String(ts.find((t) => t.g === "court")?.n));
  const chips1 = ts.filter((t) => t.ch);
  ok("เลขบนชิพขยับตามหมวดที่เปิด (ข่าว 2 · Social 2)",
     chips1[0].n === 2 && chips1[1].n === 2, JSON.stringify(chips1.map((c) => c.n)));

  await p.click('#gtabs .gtab[data-ch="social"]');
  await p.waitForTimeout(200);
  ts = await tabsOf(p);
  ok("🚫 กดชิพช่องทางแล้ว หมวดที่เปิดอยู่ต้องไม่ถูกล้าง",
     ts.find((t) => t.g === "court")?.on === true, "หมวดหลุด");
  ok("ชิพที่กดถูกระบายว่าเลือกอยู่", ts.find((t) => t.ch === "social")?.on === true);
  const shown = await titlesOf(p);
  ok("เหลือเฉพาะข่าวที่เข้าทั้ง 2 เงื่อนไข (2 ใบ)", shown.length === 2, JSON.stringify(shown));

  /* ⚠️ กับดักการนับที่ต้องคุมไว้:
     · เลขบนชิพต้องนับจากกอง "กรองหมวดแล้ว แต่ยังไม่กรองช่องทาง" → ชิพ "ข่าว" ต้องยังเป็น 2
       ถ้านับจากกองที่กรองช่องทางไปแล้ว มันจะกลายเป็น 0 แล้วผู้ใช้จะนึกว่าไม่มีของฝั่งนั้น
     · เลขบนแท็บหมวดต้องนับจากกอง "กรองช่องทางแล้ว แต่ยังไม่กรองหมวด" → หมวด 4 ต้องเป็น 1 */
  ts = await tabsOf(p);
  ok('เลขชิพ "ข่าว" ยังเป็น 2 ตอนเลือก Social อยู่ (ห้ามเป็น 0)',
     ts.find((t) => t.ch === "news")?.n === 2, String(ts.find((t) => t.ch === "news")?.n));
  ok("เลขบนแท็บหมวดนับเฉพาะ Social แล้ว (ศาล/คดีความ 4 → 2)",
     ts.find((t) => t.g === "court")?.n === 2, String(ts.find((t) => t.g === "court")?.n));
  ok("บรรทัดนับบอกว่ากรองช่องทางอะไรอยู่",
     (await p.textContent("#count")).includes("Social"), await p.textContent("#count"));
  await ctx.close();
}

// ── [4] คลังเล็กโหลดทุกปีตั้งแต่เปิดหน้า ────────────────────────
/* เจ้าของถาม 18 ก.ย. 2026: "อันนี้คืออะไร ? ทำไมไม่โหลด ทุกปีไปเลย ???"
   (บรรทัด "ยังไม่โหลด: 2025, 2024, …") · คลังจริง 338 แถว = 93 KB ทุกปีรวมกัน */
console.log("\n[4] คลังเล็กโหลดทุกปีเลย");
{
  const YEARS = [2026, 2025, 2024, 2023];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  const got = [];
  await p.route("**/archives/data-blackchin/*.json", (route) => {
    const u = route.request().url();
    if (u.endsWith("index.json")) {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        generatedAt: "2026-09-18T00:00:00.000Z", total: YEARS.length, noDate: 0,
        years: YEARS.map((y) => ({ y, n: 1 })) }) });
      return;
    }
    const y = +(u.match(/(\d{4})\.json/) || [0, 0])[1];
    got.push(y);
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      o: ["ไทยรัฐ"], c: ["1"],
      r: [[`ข่าวปลาหมอคางดำประจำปี ${y} รายงานสถานการณ์ในพื้นที่ภาคกลางและภาคตะวันออก`,
           `https://example.com/y/${y}`, Math.floor(Date.UTC(y, 5, 1) / 1000), 0, [0]]] }) });
  });
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(900);

  ok("โหลดครบทุกปีตั้งแต่เปิดหน้า", YEARS.every((y) => got.includes(y)), JSON.stringify(got));
  ok("🥇 ปีล่าสุดยังถูกขอเป็นอันดับแรกเสมอ", got[0] === 2026, JSON.stringify(got));
  const count = (await p.textContent("#count")).replace(/\s+/g, " ");
  ok("🚫 ไม่มีข้อความ 'ยังไม่รวม <ปี>' อีกแล้ว", !/ยังไม่รวม/.test(count), count);
  ok("นับข่าวครบทุกปี", /พบ\s*4\s*ข่าว/.test(count.replace(/<[^>]*>/g, "")), count);
  const note = await p.textContent("#loadednote");
  ok("🚫 ไม่มีข้อความ 'ยังไม่โหลด' ใต้ช่องวันที่", !/ยังไม่โหลด/.test(note), note);

  // 🚫 เพดานต้องยังอยู่ — คลังหลักออกแบบเผื่อ 20,000 แถว โหลดทีเดียวไม่ไหว
  ok("ยังมีเพดานกันคลังใหญ่ (ALL_YEARS_MAX)",
     /const ALL_YEARS_MAX = \d+;/.test(APP) && /INDEX\.total \|\| 0\) <= ALL_YEARS_MAX/.test(APP));
  await ctx.close();
}

// ── [5] URL · กดซ้ำ = ปิด · back ────────────────────────────────
console.log("\n[5] URL กับปุ่ม back");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  await fakeArchive(p, "data-blackchin");
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);

  await p.click('#gtabs .gtab[data-ch="social"]');
  await p.waitForTimeout(200);
  ok("กดชิพแล้วเข้า URL (?ch=social)", p.url().includes("ch=social"), p.url());

  await p.click('#gtabs .gtab[data-ch="social"]');
  await p.waitForTimeout(200);
  ok("กดซ้ำที่ชิพเดิม = ปิดตัวกรอง", !p.url().includes("ch="), p.url());
  ok("ปิดแล้วเห็นข่าวครบทุกใบ", (await titlesOf(p)).length === CASES.length);

  await p.goBack();
  await p.waitForTimeout(250);
  ok("กด back ย้อนกลับไปตอนที่กรอง Social อยู่", p.url().includes("ch=social"), p.url());
  ok("back แล้วชิพยังระบายว่าเลือกอยู่",
     (await tabsOf(p)).find((t) => t.ch === "social")?.on === true);

  // เปิดจากลิงก์ตรงๆ — ก๊อปส่งต่อแล้วต้องได้ผลเดิม
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw&ch=social&g=court`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  const ts = await tabsOf(p);
  ok("เปิดจากลิงก์ที่มีทั้ง ?g= และ ?ch= ได้ผลเดิมทั้งคู่",
     ts.find((t) => t.g === "court")?.on === true && ts.find((t) => t.ch === "social")?.on === true);

  // ค่าที่ไม่มีอยู่จริง = ตกกลับไปที่ "ทุกช่องทาง" ไม่ใช่หน้าว่าง
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw&ch=มั่วมาก`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  ok("?ch= ที่ไม่มีอยู่จริง → ตกกลับไปทุกช่องทาง ไม่ใช่หน้าว่าง",
     (await titlesOf(p)).length === CASES.length && (await tabsOf(p)).filter((t) => t.ch && t.on).length === 0);
  await ctx.close();
}

// ── [6] หน้าคลังหลักต้องไม่เปลี่ยน ───────────────────────────────
console.log("\n[6] หน้าคลังหลักไม่โดนด้วย");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  await p.route("**/archives/data/*.json", (route) => {
    const u = route.request().url();
    const body = u.endsWith("index.json")
      ? { generatedAt: "2026-09-18T00:00:00.000Z", total: 1, noDate: 0, years: [{ y: 2026, n: 1 }] }
      : { o: ["ไทยรัฐ"], c: ["ทดสอบ"], r: [["ข่าวหน้าคลังหลัก ไม่ควรมีชิพช่องทาง", "https://www.facebook.com/x/9", 1789600000, 0, [0]]] };
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await p.goto(`${BASE}/archives/?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  ok("🚫 หน้าคลังหลักไม่มีชิพช่องทางเลย", (await p.$$("[data-ch]")).length === 0);
  ok("🚫 และไม่มีแถบแท็บด้วย (ของเดิม)", (await p.$$("#gtabs")).length === 0);
  ok("ข่าวยังขึ้นปกติ", (await titlesOf(p)).length === 1);
  await ctx.close();
}

// ── [7] ด่านระดับโค้ด ────────────────────────────────────────────
console.log("\n[7] ด่านระดับโค้ด");
{
  // 🥇 ลำดับใน channelOf — คอลัมน์ Channel ต้องมาก่อนการเดาจากโดเมน
  const fn = (APP.match(/function channelOf\([^)]*\)\s*\{[\s\S]*?\n\}/) || [""])[0];
  ok("🥇 channelOf ดูคอลัมน์ Channel ก่อน แล้วค่อยเดาจากโดเมน",
     fn.indexOf("CH_MAP[") > 0 && fn.indexOf("CH_MAP[") < fn.indexOf("CH_HOSTS"), fn.slice(0, 90));
  ok("เดาไม่ออก = ถังแรก (ข่าว) ไม่ใช่คืนค่าว่าง", /return CH_BUCKETS\[0\]\?\.id \|\| "news"/.test(fn));

  ok("ตารางคำกับรายชื่อโดเมนอยู่ใน channels.config.js ไม่ได้ฝังใน app.js",
     !/socialHosts\s*:\s*\[/.test(APP) && /socialHosts:/.test(CH));
  // ⚠️ ต้องเฉือนเอาเฉพาะ **เนื้อใน array** มาตรวจ — หมายเหตุข้างบนยกชื่อเว็บข่าวมาเป็น
  //    "ตัวอย่างที่ห้ามใส่" ถ้าค้นทั้งไฟล์จะตกทั้งที่ลิสต์สะอาด (เจอจริงตอนรันรอบแรก)
  const hostsArr = (CH.match(/socialHosts:\s*\[([\s\S]*?)\]/) || ["", ""])[1];
  ok("🚫 ไม่มีโดเมนเว็บข่าวปนใน socialHosts",
     hostsArr.length > 50 && !/thairath|matichon|dailynews|khaosod|bangkokbiznews|prachachat|thaipbs/.test(hostsArr),
     hostsArr.slice(0, 60));
  ok("ครอบคลุมช่องทางที่ชีตจริงใช้อยู่ (Website/Facebook/TikTok/YouTube/Instagram)",
     ["website", "facebook", "tiktok", "youtube", "instagram"].every((k) => new RegExp(`\\b${k}:`).test(CH)));

  ok("🚫 กดชิพช่องทางแล้วห้ามแตะ state.g",
     /const c = e\.target\.closest\("\[data-ch\]"\)[\s\S]{0,400}?state\.ch = state\.ch === id \? "" : id;/.test(APP)
     && !/data-ch[\s\S]{0,400}?state\.g = /.test(APP));

  ok("เลขบนชิพนับจากกองที่ยังไม่ได้กรองช่องทาง (base)",
     /for \(const r of base\) if \(gi < 0 \|\| r\.g\.includes\(gi\)\) if \(r\.ch in chCounts\) chCounts\[r\.ch\]\+\+;/.test(APP));
  ok("เลขบนแท็บหมวดนับจาก scoped ที่กรองช่องทางแล้ว",
     /scoped = chOn \? base\.filter\(\(r\) => r\.ch === chOn\) : base;/.test(APP));

  // 🚫 ช่องที่ 6 ของแถวต้องต่อท้าย ไม่ใช่แทรกกลาง — แทรกกลางแล้วไฟล์เก่าอ่านผิดทั้งก้อน
  ok("🚫 ตัวสร้างไฟล์ต่อช่องทางไว้ท้ายแถว ไม่ได้แทรกกลาง",
     /row\.push\(idx\(x\.ch, chList, chIx\)\)/.test(BUILD) && /\[\s*\n?\s*x\.t,/.test(BUILD));
  ok("ชีตที่ไม่มีคอลัมน์ Channel ยังสร้างไฟล์ได้ (ไม่มีคีย์ ch)",
     /chList\.length \? \{ o: oList, c: cList, ch: chList, r \} : \{ o: oList, c: cList, r \}/.test(BUILD));
  ok("app.js อ่านไฟล์รุ่นเก่าที่ไม่มี ch ได้ (ไม่พัง)", /\(pack\.ch \|\| \[\]\)\[r\[5\]\]/.test(APP));

  /* 🔴 หัวตารางกับช่องติ๊กไม่ได้ตรงกันเสมอ — เจอจริง 18 ก.ย. 2026 รอบสอง
     เจ้าของเพิ่มคอลัมน์ยอดวิว 2 ช่อง → ช่องติ๊กเลื่อนขวา 2 ช่อง แต่หัวตารางอยู่ที่เดิม
     อ่านตามตำแหน่งหัวตาราง = ข่าวศาลกลายเป็นหมวดอื่นทั้งคลัง โดยไม่มี error อะไรบอก */
  {
    const HEAD = ["สำนักข่าว", "พาดหัว", "link", "วันที่", "หมวด", "Channel", "1 ศาล", "2 รัฐ", "3 CPF"];
    const SHIFT = [
      ["ก", "ข่าวศาล", "https://a.com/1", "2026-01-01", "1", "Website", "1.4M", "31K", "TRUE", "FALSE", "FALSE"],
      ["ก", "ข่าว CPF", "https://a.com/2", "2026-01-02", "3", "Website", "", "", "FALSE", "FALSE", "TRUE"],
    ];
    const got = BUILDMOD.tickCols(HEAD, SHIFT).map((t) => `${t.n}@${t.i}`).join(" ");
    ok("🔴 ช่องติ๊กเลื่อนไป 2 ช่อง ยังจับคู่กับหัวหมวดถูก", got === "1@8 2@9 3@10", got);

    const NORMAL = [["ก", "ข", "https://a.com/3", "2026-01-01", "1", "Website", "TRUE", "FALSE", "FALSE"]];
    ok("ชีตที่ไม่เลื่อน ได้ผลเหมือนเดิมทุกอย่าง",
       BUILDMOD.tickCols(HEAD, NORMAL).map((t) => `${t.n}@${t.i}`).join(" ") === "1@6 2@7 3@8");

    // 🚫 จำนวนไม่เท่ากัน = เดาไม่ได้ ต้องหยุด ไม่ใช่สร้างไฟล์ที่ข่าวเข้าหมวดผิด
    let threw = false;
    try { BUILDMOD.tickCols(HEAD, [["ก", "ข", "c", "d", "1", "W", "TRUE", "FALSE"]]); } catch { threw = true; }
    ok("🚫 หัวหมวดกับช่องติ๊กจำนวนไม่เท่ากัน → โยน error ไม่เดา", threw);
  }

  // ☑️ ช่องติ๊กหมวดเป็นความจริง ไม่ใช่คอลัมน์ `หมวด` ที่เป็นสูตร
  ok("☑️ ตัวสร้างไฟล์ยึดช่องติ๊กหมวดก่อนคอลัมน์ `หมวด`",
     /ticks\.length \? ticks\.filter\(\(t\) => isTicked\(r\[t\.i\]\)\)/.test(BUILD));
  ok("🔙 ชีตที่ไม่มีช่องติ๊กเลย ยังอ่านคอลัมน์ `หมวด` ได้เหมือนเดิม",
     /: splitCats\(r\[iCat\]\)/.test(BUILD));

  ok("blackchin.html โหลด channels.config.js", /channels\.config\.js\?v=/.test(BC));
  ok("🚫 หน้าคลังหลักไม่ได้โหลด channels.config.js", !/channels\.config\.js/.test(IDX));
  const ver = (s) => +(s.match(/<meta name="page-ver" content="(\d+)"/) || [0, 0])[1];
  ok("bump page-ver ทั้ง 2 หน้าแล้ว", ver(BC) >= 39 && ver(IDX) >= 36, `${ver(BC)} · ${ver(IDX)}`);
  const av = (s) => +(s.match(/app\.js\?v=(\d+)/) || [0, 0])[1];
  ok("app.js?v= ของ 2 หน้าตรงกัน (ใช้ไฟล์เดียวกัน)", av(BC) === av(IDX) && av(BC) >= 28, `${av(BC)} · ${av(IDX)}`);
}

await browser.close();
console.log(fail ? `\n❌ ตก — ผ่าน ${pass} · ตก ${fail}` : `\n✅ ผ่านหมด — ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
