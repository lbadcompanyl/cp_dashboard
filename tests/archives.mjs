/* คลังข่าว (/archives/) — เปิดหน้าจริงใน Chromium แล้วกดใช้งานจริง
 *
 *   python3 -m http.server 8899 --directory .. &
 *   node archives.mjs
 *
 * คุมอะไร:
 *   [1] ค้นภาษาไทยแบบ substring — "กุ้ง" ต้องเจอ "โรคกุ้ง" / "ผลผลิตกุ้งทะเล"
 *       (ข้อห้ามข้อใหญ่ที่สุดของหน้านี้: ห้ามใช้ search library ที่ตัดคำด้วยช่องว่าง)
 *   [2] ไฮไลต์ทุกตำแหน่งที่ตรง รวมกลางคำ และห้ามทำพาดหัวเพี้ยน
 *   [3] หมวดเป็น array ไม่ใช่สตริงเดียว
 *   [4] หางพาดหัวถูกตัดตอนแสดง แต่ยังค้นเจอ
 *   [5] ตัวกรอง 3 ตัว (วันที่ · หมวด · สำนักข่าว) + ล้างทั้งหมด
 *   [6] URL เก็บสถานะครบ · ก๊อปแล้วเปิดได้ผลเดิม · ปุ่ม back ย้อนได้
 *   [7] ว่าง 2 แบบต้องพูดคนละอย่าง
 *   [8] โหลดทีละ 50 + ปุ่มโหลดเพิ่ม
 *   [9] เลือกวันที่ย้อนไปปีเก่า → โหลดปีนั้นให้เอง
 *  [10] มือถือ: กล่องตัวกรองซ้อนแนวตั้ง ไม่ล้นจอ
 */
import { launch } from "./browser.mjs";
import { mockTable, buildRows, packYear } from "../tools/build-archives.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8899";

// ⚠️ **เทสต์สร้างข้อมูลของตัวเอง ไม่ได้อ่าน archives/data/ ที่ commit ไว้**
//    ของที่ commit เป็นข่าวจริงจากชีต ซึ่งเปลี่ยนทุกครั้งที่สร้างใหม่ (ตอนนี้มีปีเดียว)
//    ถ้าเทสต์ไปผูกกับมัน พอเจ้าของอัปข้อมูล เทสต์จะตกเองทั้งที่โค้ดไม่ได้พัง
//    ที่นี่จึงปลอมไฟล์ด้วย page.route แบบเดียวกับที่เทสต์ตัวอื่นปลอม API
const FIX = (() => {
  const rows = buildRows(mockTable(18000));
  const byYear = new Map();
  for (const r of rows) {
    const y = r.d.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(r);
  }
  const years = [...byYear.keys()].sort().reverse();
  const files = { "index.json": JSON.stringify({
    generatedAt: "2026-08-19T00:00:00.000Z",
    total: rows.length, noDate: 0,
    years: years.map((y) => ({ y: +y, n: byYear.get(y).length })),
  }) };
  for (const y of years) files[y + ".json"] = JSON.stringify(packYear(byYear.get(y)));
  return files;
})();

async function fakeData(ctx) {
  await ctx.route("**/archives/data/*.json", (route) => {
    const name = route.request().url().split("/").pop().split("?")[0];
    const body = FIX[name];
    if (!body) return route.fulfill({ status: 404, body: "no fixture: " + name });
    route.fulfill({ status: 200, contentType: "application/json", body });
  });
}
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✅", name); }
  else { fail++; console.log("  ❌", name, extra); }
};

// 🤖 **หน้านี้มีโหมดเดียวคือถาม AI** (เจ้าของสั่ง 26 ส.ค. 2026 — "ให้มีโหมดเดียวพอ")
//    พิมพ์เฉยๆ ไม่ค้นแล้ว ต้องกด Enter หรือปุ่มถาม
//
// ⚠️ เทสต์ชุดนี้ **ไม่ได้ปลอม `/api/archives/ask`** ไว้ → คำขอไปไม่ถึงไหน
//    หน้าเว็บจึงตกไปใช้ "คำที่พิมพ์ตรงๆ" ซึ่งเป็นพฤติกรรมเดียวกับตอนยังไม่มี AI
//    → เรื่องการค้น/ไฮไลต์/ตัวกรอง ยังวัดได้เหมือนเดิมทุกข้อ
//    (ฝั่ง AI มีเทสต์ของตัวเองที่ archivesai.mjs)
async function ask(p, text) {
  if (!text) {                       // ล้างคำถาม = กดปุ่ม ✕ (กด Enter ตอนช่องว่างไม่ทำอะไร)
    const x = await p.$("#qclear");
    if (x && !(await x.isHidden())) await x.click();
    else await p.fill("#q", "");
    await p.waitForTimeout(120);
    return;
  }
  await p.fill("#q", text);
  await p.press("#q", "Enter");
  await p.waitForFunction(() => !document.querySelector("#askbar .loading"), null, { timeout: 15000 });
  await p.waitForTimeout(80);
}

const browser = await launch();

async function open(ctx, qs = "") {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/archives/${qs}`, { waitUntil: "load" });
  await page.waitForSelector("#list .item, #list .empty", { timeout: 15000 });
  return page;
}

// กล่องตัวกรองพับไว้เป็นค่าตั้งต้น — เทสต์ที่จะไปกดตัวกรองต้องกางก่อน
async function openFilters(p) {
  if (await p.$eval("#filters", (e) => e.hidden)) await p.click("#ftoggle");
  await p.waitForTimeout(80);
}

const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
await fakeData(ctx);
const page = await open(ctx);

// ── [1] ค้นภาษาไทยแบบ substring ────────────────────────────────────────
console.log("\n[1] ค้นภาษาไทยกลางคำ");
{
  // ⚠️ ข้อพิสูจน์ที่ตรงที่สุด: เอาพาดหัวจริงมาแล้ว **ตัดชิ้นกลางๆ ออกมาเป็นคำค้น**
  //    ชิ้นแบบนี้คร่อมกลางคำและไม่มีช่องว่างติดมาเลย
  //    ตัวค้นหาที่ตัดคำด้วยช่องว่าง (Lunr/Fuse/…) จะหาไม่เจอสักใบ
  const titles = await page.$$eval("#list .item a.t", (els) => els.map((e) => e.textContent.trim()));
  let midOK = 0, midTried = 0;
  for (const t of titles.slice(0, 8)) {
    const piece = t.slice(4, 9);
    if (piece.length < 5 || /\s/.test(piece)) continue;   // เอาเฉพาะชิ้นที่คร่อมกลางคำจริงๆ
    midTried++;
    await ask(page, piece);
    const hits = await page.$$eval("#list .item a.t", (els) => els.map((e) => e.textContent));
    if (hits.length && hits.every((h) => h.includes(piece))) midOK++;
  }
  ok("ตัดชิ้นกลางพาดหัวมาค้น เจอครบทุกชิ้น", midTried > 0 && midOK === midTried, `${midOK}/${midTried}`);

  // เคสที่เจ้าของยกมาเอง
  for (const kw of ["กุ้ง", "ปลา", "ซีพี"]) {
    await ask(page, kw);
    const hits = await page.$$eval("#list .item a.t", (els) => els.map((e) => e.textContent));
    ok(`ค้น "${kw}" มีผลลัพธ์`, hits.length > 0, `เจอ ${hits.length}`);
    const wrong = hits.find((h) => !h.includes(kw));
    ok(`ค้น "${kw}" ทุกใบมีคำนั้นจริง`, !wrong, wrong || "");
  }

  // ⚠️ เคสที่เจ้าของยกมาตรงๆ: "กุ้ง" ต้องเจอ "โรคกุ้ง" กับ "ผลผลิตกุ้งทะเล" ด้วย
  //    ดูจากผลลัพธ์ทั้งชุด ไม่ใช่แค่ 50 ใบแรก (ใบแรกๆ จะเป็นอันไหนขึ้นกับวันที่ล้วนๆ)
  await ask(page, "กุ้ง");
  const shrimp = await page.evaluate(async () => {
    const idx = await fetch("data/index.json").then((r) => r.json());
    const y = idx.years.map((x) => x.y).sort((a, b) => b - a)[0];
    const pack = await fetch(`data/${y}.json`).then((r) => r.json());
    return pack.r.map((r) => r[0]).filter((t) => t.includes("กุ้ง"));
  });
  ok('ในข้อมูลมีพาดหัวที่ "กุ้ง" ฝังอยู่กลางคำอื่น', shrimp.some((t) => t.indexOf("กุ้ง") > 0),
    JSON.stringify(shrimp.slice(0, 2)));
  const shown = await page.$eval("#count", (e) => e.textContent);
  ok('ค้น "กุ้ง" นับได้เท่ากับที่มีอยู่จริงในข้อมูล',
    shown.includes(shrimp.length.toLocaleString("th-TH")), `${shown} · ในข้อมูล ${shrimp.length}`);
}

// ── [1b] เว้นวรรค = ต้องมีครบทุกคำ (AND) แต่ไม่ต้องติดกัน ──────────────
console.log("\n[1b] เว้นวรรค = ต้องมีครบทุกคำ");
{
  const only = async (q) => {
    await ask(page, q);
    // ⚠️ อ่านเฉพาะเลขหลังคำว่า "พบ" — ในบรรทัดเดียวกันมีเลขปีอยู่ด้วย
    const n = await page.$eval("#count", (e) => {
      const m = e.textContent.match(/พบ\s*([\d,]+)/);
      return m ? +m[1].replace(/,/g, "") : -1;
    });
    const hits = await page.$$eval("#list .item a.t", (els) => els.map((e) => e.textContent));
    return { n, hits };
  };
  const a = await only("กุ้ง");
  const b = await only("ราคา");
  const both = await only("กุ้ง ราคา");
  ok("พิมพ์ 2 คำคั่นช่องว่าง = ต้องมีครบทั้งคู่ (ผลต้องแคบลง ไม่ใช่กว้างขึ้น)",
    both.n > 0 && both.n <= Math.min(a.n, b.n), `กุ้ง ${a.n} · ราคา ${b.n} · ทั้งคู่ ${both.n}`);
  ok("ทุกใบมีครบทั้ง 2 คำจริง",
    both.hits.every((h) => h.includes("กุ้ง") && h.includes("ราคา")),
    JSON.stringify(both.hits.filter((h) => !(h.includes("กุ้ง") && h.includes("ราคา"))).slice(0, 2)));
  ok("ไม่ใช่ 'หรือ' — ผลต้องน้อยกว่าคำเดียวเสมอ", both.n < Math.max(a.n, b.n),
    `ทั้งคู่ ${both.n} · มากสุดของคำเดียว ${Math.max(a.n, b.n)}`);

  // ⚠️ หัวใจของสิ่งที่เจ้าของสั่ง: **ไม่ต้องอยู่ติดกัน**
  //    ในข้อมูลมีพาดหัว "ราคาหมู | เกาะติดสถานการณ์ ราคาสินค้าเกษตร - ข่าวสด"
  //    2 คำนี้อยู่คนละที่ในพาดหัว ถ้าเทียบเป็นสตริงเดียวที่มีช่องว่างตรงกลางจะไม่เจอเลย
  const apart = await only("ราคาหมู เกษตร");
  ok("คำที่อยู่ห่างกันในพาดหัวก็ต้องเจอ (ไม่ต้องติดกัน)", apart.n > 0, `เจอ ${apart.n}`);
  ok("ใบที่เจอมีครบทั้ง 2 คำจริง",
    apart.hits.every((h) => h.includes("ราคาหมู") && h.includes("เกษตร")));

  // สลับลำดับคำแล้วต้องได้เท่าเดิม
  const swapped = await only("เกษตร ราคาหมู");
  ok("สลับลำดับคำแล้วได้ผลเท่าเดิม", swapped.n === apart.n, `${swapped.n} vs ${apart.n}`);

  // เครื่องหมายคำพูด = ต้องติดกันเป๊ะ
  const exact = await only('"ราคาหมู เกษตร"');
  ok("ใส่เครื่องหมายคำพูด = ต้องเรียงติดกัน ผลจึงแคบกว่า",
    exact.n < apart.n, `เป็นวลี ${exact.n} · แยกคำ ${apart.n}`);

  // ไฮไลต์หลายคำ ห้ามซ้อนกัน
  await ask(page, "กุ้ง ผลผลิตกุ้ง");
  const nested = await page.$$eval("#list .item a.t", (els) =>
    els.filter((e) => e.querySelector("mark mark")).length);
  ok("คำที่คลุมกันเองต้องไม่ทำให้ไฮไลต์ซ้อนกัน", nested === 0, `ซ้อน ${nested} ใบ`);
  const intact = await page.$$eval("#list .item a.t", (els) =>
    els.every((e) => e.textContent.includes("กุ้ง")));
  ok("ไฮไลต์หลายคำแล้วพาดหัวยังไม่เพี้ยน", intact);
}

// ── [2] ไฮไลต์ ─────────────────────────────────────────────────────────
console.log("\n[2] ไฮไลต์");
{
  await ask(page, "กุ้ง");
  const first = await page.$("#list .item a.t");
  const html = await first.evaluate((e) => e.innerHTML);
  const text = await first.evaluate((e) => e.textContent);
  const marks = await first.$$eval("mark", (m) => m.map((x) => x.textContent));
  ok("มี <mark> ครอบคำที่ค้น", marks.length > 0 && marks.every((m) => m === "กุ้ง"), JSON.stringify(marks));
  ok("จำนวน mark เท่ากับจำนวนครั้งที่คำนั้นอยู่ในพาดหัว",
    marks.length === text.split("กุ้ง").length - 1, `${marks.length} vs ${text.split("กุ้ง").length - 1}`);
  ok("ข้อความหลังไฮไลต์ไม่เพี้ยน (ยังมีคำค้นอยู่ครบ)", text.includes("กุ้ง"), text);
  ok("ไม่ใส่แท็กมั่วลงในพาดหัว", !/<(?!\/?mark\b)[a-z]/i.test(html), html.slice(0, 120));
}

// ── [3] หมวดเป็น array ─────────────────────────────────────────────────
console.log("\n[3] หมวดหลายค่า");
{
  await ask(page, "");
  const tagCounts = await page.$$eval("#list .item", (els) =>
    els.map((e) => e.querySelectorAll(".tag").length));
  ok("มีข่าวที่ติดหมวดมากกว่า 1 หมวด (ไม่ได้เก็บเป็นสตริงเดียว)",
    tagCounts.some((n) => n > 1), JSON.stringify(tagCounts.slice(0, 10)));
  const withComma = await page.$$eval("#list .tag", (els) =>
    els.map((e) => e.textContent).filter((t) => t.includes(",")));
  ok("ไม่มีชิพหมวดที่ยังมีจุลภาคค้างอยู่", withComma.length === 0, JSON.stringify(withComma.slice(0, 3)));
}

// ── [4] หางพาดหัว ──────────────────────────────────────────────────────
console.log("\n[4] ตัดหางพาดหัวตอนแสดง แต่ยังค้นเจอ");
{
  // หาสำนักข่าวที่โผล่เป็นหางพาดหัวในข้อมูลจำลอง
  const tailWord = "ข่าวสด";
  await ask(page, tailWord);
  const shown = await page.$$eval("#list .item a.t", (els) => els.map((e) => e.textContent.trim()));
  ok(`ค้น "${tailWord}" ที่อยู่ในหางพาดหัว ยังเจอ`, shown.length > 0, `เจอ ${shown.length}`);
  const stillTailed = shown.filter((t) => new RegExp(`\\s+[-|–—·]\\s+${tailWord}$`).test(t));
  ok("หางถูกตัดออกจากที่แสดงผลแล้ว", stillTailed.length === 0, JSON.stringify(stillTailed.slice(0, 2)));
  const empty = shown.filter((t) => t.length < 10);
  ok("ไม่มีพาดหัวที่ถูกตัดจนสั้นผิดปกติ", empty.length === 0, JSON.stringify(empty.slice(0, 3)));

  // ⚠️ หางมีทั้ง "ชื่อคอลัมน์" และ "ชื่อสำนัก" ต่อกัน 2 ชั้น — ต้องตัดให้หมดทั้งสองชั้น
  //    (เคสที่เจ้าของยกมา: "… - เทคโนโลยีชาวบ้าน - ข่าวสด")
  const stillSection = shown.filter((t) => /เทคโนโลยีชาวบ้าน\s*$/.test(t));
  ok("ตัดชื่อคอลัมน์ที่อยู่หน้าชื่อสำนักด้วย ไม่ใช่ตัดแค่ชั้นเดียว",
    stillSection.length === 0, JSON.stringify(stillSection.slice(0, 2)));

  // ห้ามตัดจนพาดหัวเพี้ยน — ที่แสดงต้องเป็น "ต้นของ" พาดหัวจริงเสมอ
  const bad = await page.evaluate(async () => {
    const idx = await fetch("data/index.json").then((r) => r.json());
    const y = idx.years.map((x) => x.y).sort((a, b) => b - a)[0];
    const pack = await fetch(`data/${y}.json`).then((r) => r.json());
    const orig = new Set(pack.r.map((r) => String(r[0]).replace(/\s+/g, " ").trim()));
    const out = [];
    for (const el of document.querySelectorAll("#list .item a.t")) {
      const s = el.textContent.trim();
      let hit = false;
      for (const o of orig) if (o === s || o.startsWith(s)) { hit = true; break; }
      if (!hit) out.push(s);
    }
    return out;
  });
  ok("ที่แสดงเป็นต้นของพาดหัวจริงทุกใบ (ไม่ได้ตัดกลาง)", bad.length === 0, JSON.stringify(bad.slice(0, 2)));

  // ⚠️ พาดหัวที่มีตัวคั่นอยู่ข้างในเอง — ตัดหางแล้วตัวคั่นข้างในต้องไม่ถูกเขียนใหม่
  await ask(page, "เกาะติดสถานการณ์");
  const mixed = await page.$$eval("#list .item a.t", (els) => els.map((e) => e.textContent.trim()));
  ok("พาดหัวที่มีตัวคั่นข้างในยังหาเจอ", mixed.length > 0, `เจอ ${mixed.length}`);
  ok("ตัดหางแล้วตัวคั่นข้างในไม่ถูกเปลี่ยน (| ต้องยังเป็น |)",
    mixed.every((t) => t.includes("|")) && mixed.every((t) => !/ข่าวสด$/.test(t)),
    JSON.stringify(mixed.slice(0, 2)));
}

// ── [5] ตัวกรอง ────────────────────────────────────────────────────────
console.log("\n[5] ตัวกรอง");
{
  await openFilters(page);
  await ask(page, "");
  const all = await page.$eval("#count", (e) => e.textContent);

  // หมวด
  const cat = await page.$eval("#cats .ch", (b) => b.dataset.cat);
  await page.click(`#cats [data-cat="${cat}"]`);
  await page.waitForTimeout(150);
  const catOnly = await page.$$eval("#list .item", (els) =>
    els.map((e) => [...e.querySelectorAll(".tag")].map((t) => t.textContent)));
  ok(`เลือกหมวด "${cat}" แล้วทุกใบมีหมวดนั้น`, catOnly.every((c) => c.includes(cat)),
    JSON.stringify(catOnly.slice(0, 2)));

  // เลือก 2 หมวด = เจอหมวดใดหมวดหนึ่งก็นับ (OR)
  const cat2 = await page.$$eval("#cats .ch", (bs) => bs[1].dataset.cat);
  await page.click(`#cats [data-cat="${cat2}"]`);
  await page.waitForTimeout(150);
  const both = await page.$$eval("#list .item", (els) =>
    els.map((e) => [...e.querySelectorAll(".tag")].map((t) => t.textContent)));
  ok("เลือก 2 หมวดเป็นแบบ OR", both.every((c) => c.includes(cat) || c.includes(cat2)));
  ok("เลือก 2 หมวดได้ผลไม่น้อยกว่าเลือกหมวดเดียว",
    (await page.$$eval("#list .item", (e) => e.length)) >= catOnly.length);

  // ล้างทั้งหมด
  const clearVisible = await page.$eval("#clearall", (b) => !b.hidden);
  ok("ปุ่มล้างตัวกรองขึ้นเมื่อมีตัวกรอง", clearVisible);
  await page.click("#clearall");
  await page.waitForTimeout(150);
  ok("ล้างแล้วกลับมาเท่าเดิม", (await page.$eval("#count", (e) => e.textContent)) === all);
  ok("ล้างแล้วปุ่มล้างหายไป", await page.$eval("#clearall", (b) => b.hidden));

  // สำนักข่าว — ค้นในรายการได้ · เรียงมากไปน้อย
  const counts = await page.$$eval("#srcs .src .n", (els) =>
    els.map((e) => +e.textContent.replace(/[^\d]/g, "")));
  ok("รายชื่อสำนักข่าวเรียงจากข่าวมากไปน้อย",
    counts.every((n, i) => i === 0 || counts[i - 1] >= n), JSON.stringify(counts.slice(0, 6)));
  const src = await page.$eval("#srcs .src", (b) => b.dataset.src);
  await page.fill("#srcq", src.slice(0, 3));
  await page.waitForTimeout(150);
  const listed = await page.$$eval("#srcs .src .nm", (els) => els.map((e) => e.textContent));
  ok("พิมพ์ค้นในรายชื่อสำนักข่าวได้", listed.length > 0 && listed.length < counts.length,
    `${listed.length} / ${counts.length}`);
  await page.click(`#srcs [data-src="${src}"]`);
  await page.waitForTimeout(150);
  const outlets = await page.$$eval("#list .meta .o", (els) => [...new Set(els.map((e) => e.textContent))]);
  ok(`เลือกสำนัก "${src}" แล้วเหลือเจ้าเดียว`, outlets.length === 1 && outlets[0] === src, JSON.stringify(outlets));
  await page.click("#clearall");
  await page.fill("#srcq", "");
  await page.waitForTimeout(150);
}

// ── [6] URL + ปุ่ม back ────────────────────────────────────────────────
console.log("\n[6] URL เก็บสถานะ");
{
  await openFilters(page);
  await ask(page, "ซีพี");
  const cat = await page.$eval("#cats .ch", (b) => b.dataset.cat);
  await page.click(`#cats [data-cat="${cat}"]`);
  await page.waitForTimeout(200);
  const url = page.url();
  ok("URL มีคำค้น", url.includes("q="), url);
  ok("URL มีหมวด", url.includes("cat="), url);
  const before = await page.$eval("#count", (e) => e.textContent);

  const page2 = await ctx.newPage();
  await page2.goto(url, { waitUntil: "load" });
  await page2.waitForSelector("#list .item, #list .empty", { timeout: 15000 });
  await page2.waitForTimeout(200);
  ok("ก๊อป URL ไปเปิดใหม่ได้ผลเดิม", (await page2.$eval("#count", (e) => e.textContent)) === before,
    `${await page2.$eval("#count", (e) => e.textContent)} vs ${before}`);
  ok("ช่องค้นหาถูกเติมกลับจาก URL", (await page2.inputValue("#q")) === "ซีพี");
  ok("ชิพหมวดถูกกดค้างไว้จาก URL", await page2.$eval(`#cats [data-cat="${cat}"]`, (b) => b.classList.contains("on")));
  await page2.close();

  await page.goBack();
  await page.waitForTimeout(300);
  ok("กด back แล้วชิพหมวดหลุดออก", !page.url().includes("cat="), page.url());
  ok("กด back แล้วคำค้นยังอยู่ (พิมพ์ไม่สร้างประวัติทีละตัวอักษร)", page.url().includes("q="), page.url());
  ok("กด back แล้วหน้าจอตามไปด้วย", !(await page.$eval(`#cats [data-cat="${cat}"]`, (b) => b.classList.contains("on"))));
}

// ── [7] ว่าง 2 แบบ ─────────────────────────────────────────────────────
console.log("\n[7] สถานะว่าง");
{
  const p = await open(ctx);
  const n = await p.$$eval("#list .item", (e) => e.length);
  ok("ยังไม่ได้พิมพ์อะไร = โชว์ข่าวล่าสุด ไม่ใช่หน้าว่าง", n > 0, `เจอ ${n}`);

  await ask(p, "ไม่มีทางมีคำนี้อยู่จริงหรอกนะจ๊ะ");
  const txt = await p.$eval("#list", (e) => e.textContent);
  ok("กรองแล้วไม่พบ = บอกให้ชัด", /ไม่พบ/.test(txt), txt.slice(0, 80));
  ok("กรองแล้วไม่พบ = มีปุ่มล้างตัวกรองให้กด", !!(await p.$("#list [data-clear]")));
  await p.click("#list [data-clear]");
  await p.waitForTimeout(200);
  ok("กดล้างจากหน้าว่างแล้วข่าวกลับมา", (await p.$$eval("#list .item", (e) => e.length)) > 0);
  ok("กดล้างแล้วช่องค้นหาว่างจริง", (await p.inputValue("#q")) === "");
  await p.close();
}

// ── [8] โหลดทีละ 50 ────────────────────────────────────────────────────
console.log("\n[8] แบ่งหน้า");
{
  const p = await open(ctx);
  ok("รอบแรกแสดง 50 ใบ", (await p.$$eval("#list .item", (e) => e.length)) === 50);
  ok("มีปุ่มโหลดเพิ่ม", !!(await p.$("#more [data-more]")));
  await p.click("#more [data-more]");
  await p.waitForTimeout(200);
  const n2 = await p.$$eval("#list .item", (e) => e.length);
  ok("กดโหลดเพิ่มแล้วได้ 100 ใบ", n2 === 100, `ได้ ${n2}`);

  const ts = await p.$$eval("#list .meta .dt", (els) => els.map((e) => e.textContent.trim()));
  const toNum = (s) => { const [d, t] = s.split(" "); const [D, M, Y] = d.split("/"); return `${Y}${M}${D}${t.replace(":", "")}`; };
  const nums = ts.map(toNum);
  ok("เรียงข่าวใหม่ไปเก่า", nums.every((v, i) => i === 0 || nums[i - 1] >= v), JSON.stringify(nums.slice(0, 4)));

  const link = await p.$eval("#list .item a.t", (a) => [a.target, a.rel]);
  ok("พาดหัวเปิดแท็บใหม่ + rel=noopener", link[0] === "_blank" && link[1].includes("noopener"), JSON.stringify(link));
  ok("ทุกใบมีปุ่มคัดลอกลิงก์", (await p.$$eval("#list .copy", (e) => e.length)) === 100);
  await p.close();
}

// ── [9] โหลดปีเก่าเอง ──────────────────────────────────────────────────
console.log("\n[9] ขยายช่วงวันที่ย้อนไปปีเก่า");
{
  const p = await open(ctx);
  await openFilters(p);
  const idx = await p.evaluate(() => fetch("data/index.json").then((r) => r.json()));
  const years = idx.years.map((x) => x.y).sort((a, b) => b - a);
  ok("index.json แยกไฟล์ตามปี", years.length > 1, JSON.stringify(years));

  const before = await p.$eval("#count", (e) => e.textContent);
  ok("ตอนเปิดหน้าโหลดแค่ปีล่าสุด", before.includes(String(years[0])) && before.includes("ยังไม่รวม"), before);

  const oldest = years[years.length - 1];
  await p.fill("#from", `${oldest}-01-01`);
  await p.dispatchEvent("#from", "change");
  await p.waitForTimeout(1500);
  const after = await p.$eval("#count", (e) => e.textContent);
  ok(`เลือกวันที่ย้อนถึงปี ${oldest} แล้วโหลดปีนั้นให้เอง`, after.includes(String(oldest)) && !after.includes("ยังไม่รวม"), after);

  const dates = await p.$$eval("#list .meta .dt", (els) => els.map((e) => e.textContent.trim()));
  const yearOf = (d) => +d.split("/")[2].slice(0, 4);
  ok("ผลลัพธ์ยังอยู่ในช่วงวันที่ที่เลือก", dates.every((d) => yearOf(d) >= oldest), JSON.stringify(dates.slice(0, 3)));
  await p.close();
}

// ── [9b] กล่องตัวกรองพับได้ ────────────────────────────────────────────
console.log("\n[9b] กล่องตัวกรองพับได้");
{
  // ⚠️ ต้องใช้ context ใหม่ — เทสต์ก่อนหน้ากางกล่องไว้ แล้วสถานะถูกจำใน localStorage
  //    ถ้าใช้ context เดิมจะวัด "ค่าตั้งต้น" ไม่ได้เลย
  const fresh = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await fakeData(fresh);
  const p = await open(fresh);
  ok("เปิดหน้ามาตัวกรองพับอยู่", await p.$eval("#filters", (e) => e.hidden));
  ok("ยังไม่ได้กรอง = ไม่มีป้ายบอกอะไรให้รก",
    (await p.$eval("#fsum", (e) => e.hidden)) && (await p.$eval("#fbadge", (e) => e.hidden)));
  ok("มีปุ่มกางให้เห็น", await p.$eval("#ftoggle", (e) => e.offsetHeight > 0));

  await p.click("#ftoggle");
  await p.waitForTimeout(100);
  ok("กดแล้วกางออก", !(await p.$eval("#filters", (e) => e.hidden)));
  ok("กางแล้วเห็นชิพหมวดจริง", (await p.$$eval("#cats .ch", (e) => e.length)) > 0);

  // เลือกตัวกรองแล้วหัวกล่องต้องสรุปให้อ่านได้โดยไม่ต้องกาง
  const cat = await p.$eval("#cats .ch", (b) => b.dataset.cat);
  await p.click(`#cats [data-cat="${cat}"]`);
  await p.waitForTimeout(120);
  ok("สรุปบอกหมวดที่เลือกไว้", (await p.$eval("#fsum", (e) => e.textContent)).includes(cat),
    await p.$eval("#fsum", (e) => e.textContent));
  ok("ปุ่มตัวกรองขึ้นเลขบอกว่ากรองอยู่กี่อย่าง",
    (await p.$eval("#fbadge", (e) => e.textContent)) === "1");

  await p.click("#ftoggle");
  await p.waitForTimeout(100);
  ok("กดอีกทีพับกลับ", await p.$eval("#filters", (e) => e.hidden));
  ok("พับแล้วยังอ่านออกว่ากรองอะไรอยู่",
    !(await p.$eval("#fsum", (e) => e.hidden)) && (await p.$eval("#fsum", (e) => e.textContent)).includes(cat));

  // ⚠️ จำสถานะไว้ ไม่ใช่กางใหม่ทุกครั้งที่เปิดหน้า
  await p.click("#ftoggle");
  await p.waitForTimeout(100);
  const p2 = await open(fresh);
  ok("จำไว้ว่ากางค้างไว้ (เปิดหน้าใหม่ยังกางอยู่)", !(await p2.$eval("#filters", (e) => e.hidden)));
  await p2.close();

  // เปิด URL ที่มีตัวกรองติดมา ต้องกางให้เห็นว่ากรองด้วยอะไร
  await p.click("#ftoggle");                       // พับกลับ + จำว่าพับ
  await p.waitForTimeout(100);
  const p3 = await open(fresh, `?cat=${encodeURIComponent(cat)}`);
  ok("เปิดลิงก์ที่มีตัวกรองติดมา = กางให้เอง", !(await p3.$eval("#filters", (e) => e.hidden)));
  await p3.close();
  await p.close();
  await fresh.close();
}

// ── [9c] ลำดับความเด่น ─────────────────────────────────────────────────
// เจ้าของสั่ง 2 รอบ: ช่องค้นหาต้องเป็นพระเอก · แต่ตัวกรอง "ต้องมองเห็น" ไม่ใช่เล็กจนหาไม่เจอ
console.log("\n[9c] ลำดับความเด่น");
{
  for (const [name, w, h] of [["เดสก์ท็อป", 1200, 900], ["มือถือ", 390, 780]]) {
    const c = await browser.newContext({ viewport: { width: w, height: h } });
    await fakeData(c);
    const p = await open(c);
    const m = await p.evaluate(() => {
      const r = (s) => { const b = document.querySelector(s).getBoundingClientRect();
        return { top: b.top, h: b.height, w: b.width, l: b.left, r: b.right, t: b.top, b: b.bottom }; };
      return { q: r("#q"), f: r("#ftoggle"), fs: +getComputedStyle(document.querySelector("#q")).fontSize.replace("px", "") };
    });
    ok(`${name}: ช่องค้นหาสูงกว่าปุ่มตัวกรองชัดเจน (พระเอก)`, m.q.h >= m.f.h * 1.3,
      `ค้นหา ${Math.round(m.q.h)}px · ตัวกรอง ${Math.round(m.f.h)}px`);
    ok(`${name}: ตัวอักษรช่องค้นหาใหญ่กว่าปกติ`, m.fs >= 17, `${m.fs}px`);
    // ⚠️ เคยทำปุ่มตัวกรองเล็กจนเจ้าของมองไม่เห็น — กันไม่ให้เล็กกว่าขนาดที่กดได้จริง
    ok(`${name}: ปุ่มตัวกรองยังกดได้จริง ไม่เล็กจนหาไม่เจอ`, m.f.h >= 30 && m.f.w >= 44,
      `${Math.round(m.f.w)}×${Math.round(m.f.h)}px`);
    ok(`${name}: ช่องค้นหาเว้นที่จากแถบบน ไม่ติดขอบ`, m.q.top >= 70, `${Math.round(m.q.top)}px`);

    // ⚠️ ปุ่มตัวกรองอยู่ "ในช่องค้นหา" มุมขวา — ต้องอยู่ในกรอบจริง ไม่ใช่ลอยข้างนอก
    ok(`${name}: ปุ่มตัวกรองอยู่ในช่องค้นหา`,
      m.f.l > m.q.l && m.f.r <= m.q.r + 1 && m.f.t >= m.q.t - 1 && m.f.b <= m.q.b + 1,
      `ช่อง ${Math.round(m.q.l)}-${Math.round(m.q.r)} · ปุ่ม ${Math.round(m.f.l)}-${Math.round(m.f.r)}`);

    // ⚠️ ข้อความที่พิมพ์ต้องไม่มุดใต้ปุ่ม — ต้องเผื่อ padding ขวาให้พ้นทั้งปุ่มล้างและปุ่มตัวกรอง
    await p.fill("#q", "ปลาหมอคางดำ เชียงใหม่ ฝุ่นพิษ");
    await p.waitForTimeout(300);
    const z = await p.evaluate(() => {
      const q = document.querySelector("#q"), cs = getComputedStyle(q);
      const b = q.getBoundingClientRect();
      const f = document.querySelector("#ftoggle").getBoundingClientRect();
      const c = document.querySelector("#qclear").getBoundingClientRect();
      return { textRight: b.right - parseInt(cs.paddingRight), f: f.left, c: c.left,
               typable: b.width - parseInt(cs.paddingRight) - parseInt(cs.paddingLeft) };
    });
    ok(`${name}: ข้อความที่พิมพ์ไม่มุดใต้ปุ่ม`, z.textRight <= z.c + 1 && z.textRight <= z.f + 1,
      `ข้อความจบ ${Math.round(z.textRight)} · ปุ่มล้าง ${Math.round(z.c)} · ตัวกรอง ${Math.round(z.f)}`);
    ok(`${name}: ยังเหลือที่พิมพ์พอสมควร`, z.typable >= 180, `${Math.round(z.typable)}px`);

    // 🔀 ปุ่มสลับโหมด — เจ้าของแจ้ง 27 ส.ค. 2026 ว่า "คนจะไม่รู้ซิว่ากดได้"
    //    จึงเป็นปุ่ม **2 ช่อง** โชว์ทั้ง 2 ตัวเลือกพร้อมกัน ไม่ใช่ป้ายใบเดียวที่กดแล้วสลับ
    const tg = await p.evaluate(() => {
      const g = document.querySelector("#modeseg");
      if (!g) return null;
      const b = g.getBoundingClientRect();
      const q = document.querySelector("#q"), cs = getComputedStyle(q), qb = q.getBoundingClientRect();
      const row = document.querySelector(".searchrow").getBoundingClientRect();
      const segs = [...g.querySelectorAll(".mseg")];
      return {
        n: segs.length,
        allButtons: segs.every((e) => e.tagName === "BUTTON" && getComputedStyle(e).pointerEvents !== "none"),
        // ⚠️ textContent นับข้อความที่ display:none ด้วย — ต้องอ่านเฉพาะที่มองเห็นจริง
        vis: segs.map((e) => [...e.childNodes]
          .filter((c) => c.nodeType !== 1 || getComputedStyle(c).display !== "none")
          .map((c) => c.textContent).join("")).join(" | ").replace(/\s+/g, " ").trim(),
        onCount: segs.filter((e) => e.classList.contains("on")).length,
        inRow: b.left >= row.left - 1 && b.right <= row.right + 1 && b.bottom <= row.bottom + 1,
        // จอกว้างอยู่ในช่อง (ซ้ายของข้อความ) · จอแคบลงมาอยู่แถวล่าง (ใต้ช่อง) — ถูกทั้งคู่
        clear: b.right <= qb.left + parseFloat(cs.paddingLeft) + 1 || b.top >= qb.bottom - 1,
      };
    });
    ok(`${name}: ปุ่มสลับโหมดโชว์ทั้ง 2 ตัวเลือก`, !!tg && tg.n === 2, tg ? String(tg.n) : "ไม่มี");
    ok(`${name}: ทั้ง 2 ช่องเป็นปุ่มกดได้จริง`, !!tg && tg.allButtons);
    ok(`${name}: เลือกอยู่ช่องเดียว`, !!tg && tg.onCount === 1, tg ? String(tg.onCount) : "-");
    ok(`${name}: อ่านออกว่าเลือกอะไรได้บ้าง (AI / คำ)`,
      !!tg && /AI/i.test(tg.vis) && /คำ/.test(tg.vis), tg ? tg.vis : "-");
    ok(`${name}: อยู่ในกรอบแถวค้นหา ไม่หลุดออกไป`, !!tg && tg.inRow);
    ok(`${name}: ไม่ทับข้อความที่พิมพ์`, !!tg && tg.clear);

    await p.fill("#q", "");
    await p.close();
    await c.close();
  }
}

// ── [9d] ตัวกรองต้องติดบนสุดไปด้วย ────────────────────────────────────
// เจ้าของแจ้ง 28 ส.ค. 2026: "ตัวกรองไม่ float ตาม" — ของเดิมกล่องอยู่นอกแถบที่ติดบนสุด
// พอเลื่อนอ่านข่าว มันจะมุดหายไปใต้แถบทีละครึ่ง ดูเหมือนหน้าพัง และแก้ตัวกรองต่อไม่ได้
console.log("\n[9d] กางตัวกรองแล้วเลื่อนหน้า — กล่องต้องติดตามไปด้วย");
{
  for (const [name, w, h] of [["เดสก์ท็อป", 1200, 900], ["มือถือ", 390, 780]]) {
    const c = await browser.newContext({ viewport: { width: w, height: h } });
    await fakeData(c);
    const p = await open(c);
    await openFilters(p);
    await p.evaluate(() => window.scrollTo(0, 1500));
    await p.waitForTimeout(250);
    const m = await p.evaluate(() => {
      const f = document.querySelector("#filters").getBoundingClientRect();
      const s = document.querySelector(".sticky").getBoundingClientRect();
      const q = document.querySelector("#q").getBoundingClientRect();
      return { fTop: f.top, fBottom: f.bottom, qTop: q.top, sTop: s.top, sBottom: s.bottom,
               ih: innerHeight, scrolled: document.scrollingElement.scrollTop };
    });
    ok(`${name}: เลื่อนหน้าลงไปแล้วจริง`, m.scrolled > 300, String(Math.round(m.scrolled)));
    ok(`${name}: ช่องค้นหายังติดบนสุด`, m.sTop <= 1, String(Math.round(m.sTop)));
    // 🎯 ข้อที่เจ้าของแจ้ง — กล่องตัวกรองต้องยังเห็นอยู่ ไม่ใช่มุดหายไปใต้แถบ
    ok(`${name}: กล่องตัวกรองยังเห็นอยู่ครบ`, m.fTop >= -1 && m.fBottom <= m.ih + 1,
      `บน ${Math.round(m.fTop)} · ล่าง ${Math.round(m.fBottom)} · จอสูง ${m.ih}`);
    ok(`${name}: กล่องอยู่ใต้ช่องค้นหา ไม่ทับกัน`, m.fTop >= m.qTop - 1);
    // ⚠️ แต่ห้ามกินจอจนไม่เหลือที่อ่านข่าว
    ok(`${name}: ยังเหลือที่อ่านข่าวอย่างน้อย 1 ใน 3 ของจอ`, m.ih - m.sBottom >= m.ih / 3,
      `เหลือ ${Math.round(m.ih - m.sBottom)} จาก ${m.ih}`);
    await p.close();
    await c.close();
  }
}

// ── [10] มือถือ ────────────────────────────────────────────────────────
console.log("\n[10] มือถือ");
{
  const m = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  await fakeData(m);
  const p = await open(m);
  const over = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  ok("ไม่มีอะไรล้นออกนอกจอ", over <= 1, `เกิน ${over}px`);

  await openFilters(p);
  const boxes = await p.$$eval(".fbox", (els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return { x: Math.round(r.x), w: Math.round(r.width) };
  }));
  ok("กล่องตัวกรองมี 3 กล่อง", boxes.length === 3, JSON.stringify(boxes));
  ok("จอแคบ = ซ้อนแนวตั้ง (ทุกกล่องชิดซ้ายเท่ากัน)",
    boxes.every((b) => b.x === boxes[0].x), JSON.stringify(boxes));

  // ⚠️ 3 ช่องต้องสูงเท่ากันบนจอกว้าง (เคยเป็นการ์ด 3 ใบ สูงไม่เท่ากันและกินที่)
  //    และของยาวๆ ต้อง "เลื่อนอยู่ข้างใน" ไม่ใช่ถูกตัดหาย
  const wide = await p.$$eval("#list .item, .fbox, #q", (els) =>
    els.filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length);
  ok("ไม่มีการ์ด/กล่องตัวไหนยื่นเลยขอบจอ", wide === 0, `${wide} ตัว`);

  // จอกว้างต้องเรียงแนวนอน
  const p2 = await open(ctx);
  await openFilters(p2);
  const bx = await p2.$$eval(".fbox", (els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
  ok("จอกว้าง = เรียงแนวนอน 3 คอลัมน์", new Set(bx).size === 3, JSON.stringify(bx));

  const hs = await p2.$$eval(".fbox", (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  ok("จอกว้าง = 3 ช่องสูงเท่ากัน", new Set(hs).size === 1, JSON.stringify(hs));
  const box = await p2.evaluate(() => {
    const s = document.querySelector("#srcs");
    return { scrolls: s.scrollHeight > s.clientHeight, h: s.clientHeight,
             n: document.querySelectorAll("#srcs .src").length,
             panel: Math.round(document.querySelector("#filters").getBoundingClientRect().height) };
  });
  // ⚠️ ของยาวต้องเลื่อนได้ ไม่ใช่ถูก overflow:hidden ตัดหายจนกดไม่ถึง
  ok("รายชื่อสำนักข่าวยาวๆ เลื่อนอยู่ข้างในได้", box.n < 5 || box.scrolls, `${box.n} เจ้า · สูง ${box.h}px`);
  ok("รายชื่อสูงพอกดใช้ได้จริง", box.h >= 90, `${box.h}px`);
  ok("แถบตัวกรองไม่สูงจนกินที่", box.panel <= 230, `${box.panel}px`);
  await p2.close();
  await p.close();
  await m.close();
}

// ── [10b] โหมดมืด
console.log("\n[10b] โหมดมืด");
{
  const d = await browser.newContext({ viewport: { width: 1200, height: 900 }, colorScheme: "dark" });
  await fakeData(d);
  const p = await open(d);
  const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok("โหมดมืดเปลี่ยนสีพื้นจริง", bg === "rgb(13, 17, 23)", bg);
  await ask(p, "กุ้ง");
  const m = await p.$eval("#list mark", (e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]);
  ok("ไฮไลต์ในโหมดมืดไม่ใช่ตัวหนังสือดำบนพื้นเหลือง", m[0] !== "rgb(0, 0, 0)" && m[1] !== "rgb(255, 255, 0)", JSON.stringify(m));
  await p.close();
  await d.close();
}

// ── [11] ข้อห้ามเรื่อง search library ──────────────────────────────────
console.log("\n[11] ข้อห้าม");
{
  const src = await (await fetch(`${BASE}/archives/app.js`)).text();
  const banned = ["lunr", "Fuse", "minisearch", "flexsearch"].filter((n) =>
    new RegExp(`\\b${n}\\b`, "i").test(src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")));
  ok("ไม่มี search library ในโค้ด", banned.length === 0, JSON.stringify(banned));
  // (โหมดผ่อนการสะกดเขียนเป็น `(looseMode ? r.ln : r.n).includes(` — ยังเป็น includes() เหมือนเดิม)
  ok("ใช้ includes() ค้นตรงๆ", /r\.n\)\.includes\(|\.n\.includes\(/.test(src));
  const scripts = await page.$$eval("script[src]", (els) => els.map((e) => e.getAttribute("src")));
  ok("ไม่มีสคริปต์จากข้างนอก", scripts.every((s) => !/^https?:|^\/\//.test(s)), JSON.stringify(scripts));
}

await page.close();
await ctx.close();
await browser.close();
console.log(`\n${fail === 0 ? "✅ ผ่านหมด" : "❌ ตก"} — ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
