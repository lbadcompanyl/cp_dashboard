// Google Trends widget: ต้องทยอยโหลด · นอกจอไม่โหลด · มีปุ่มโหลดใหม่รายกล่อง
// (embed จริงยิงไม่ได้จาก sandbox — ปลอม window.trends แล้วนับว่า "ถูกเรียกกี่ครั้ง เมื่อไหร่")
import { launch } from "./browser.mjs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const PAGES = [
  { name: "issue", url: "http://127.0.0.1:8899/issue/trends.html", tab: "เทรนด์", boxes: ["w-ts", "w-rq"] },
  { name: "sd", url: "http://127.0.0.1:8899/sd.html", tab: null, boxes: ["w-ts", "w-geo", "w-rq"] },
];

const browser = await launch();

// ปลอม embed_loader ของ Google — บันทึกทุกครั้งที่หน้าเว็บสั่งวาด widget
const STUB = `
window.__calls = [];
window.trends = { embed: { renderExploreWidgetTo: function(box, type, common, opts){
  window.__calls.push({ id: box.id, type: type, at: Date.now() });
  box.innerHTML = '<div class="stub">' + type + '</div>';
} } };
window.__t0 = Date.now();
`;

const setup = async (P, viewport) => {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.route("**://ssl.gstatic.com/**", (r) => r.abort());
  await page.route("**://trends.google.com/**", (r) => r.abort());
  await page.route("**/api/**", (r) => r.fulfill({ json: { sources: {} } }));
  await page.addInitScript(STUB);
  await page.goto(P.url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  if (P.tab) { await page.locator(".pgtab", { hasText: P.tab }).click(); await page.waitForTimeout(300); }
  return { ctx, page, errs };
};
const calls = (page) => page.evaluate(() => window.__calls.map((c) => ({ id: c.id, type: c.type, at: c.at - window.__t0 })));

for (const P of PAGES) {
  console.log(`\n════════ ${P.name} ════════`);

  // ---- [1] มือถือ: กล่องล่างอยู่นอกจอ ต้องยังไม่โหลด ----
  {
    console.log("\n[1] จอแคบ — กล่องที่อยู่นอกจอต้องยังไม่ถูกสั่งวาด");
    const { ctx, page, errs } = await setup(P, { width: 390, height: 780 });
    await page.waitForTimeout(2000);
    const c = await calls(page);
    ok("ไม่มี error ตอนโหลดหน้า", errs.length === 0, errs[0]);
    ok("กราฟหลักถูกวาด", c.some((x) => x.id === "w-ts"), JSON.stringify(c));
    for (const id of P.boxes.slice(1)) {
      ok(`${id} ยังไม่ถูกวาด (อยู่นอกจอ)`, !c.some((x) => x.id === id), JSON.stringify(c));
      ok(`${id} บอกผู้ใช้ว่ารออยู่ พร้อมไอคอนหมุน`, await page.locator(`#${id} .widget-loading .spin`).count() === 1);
    }

    console.log("\n[2] เลื่อนลงไปหา → ค่อยโหลด");
    await page.locator(`#${P.boxes[1]}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(3000);
    const c2 = await calls(page);
    ok(`${P.boxes[1]} ถูกวาดหลังเลื่อนไปถึง`, c2.some((x) => x.id === P.boxes[1]), JSON.stringify(c2));
    await ctx.close();
  }

  // ---- [3] เดสก์ท็อปจอสูง: เห็นทุกกล่อง ต้องเว้นระยะ ไม่ยิงพร้อมกัน ----
  {
    console.log("\n[3] จอสูง — เห็นทุกกล่อง แต่ต้องทยอยยิง ไม่พร้อมกัน");
    const { ctx, page, errs } = await setup(P, { width: 1400, height: 2600 });
    await page.waitForTimeout(P.boxes.length * 2600);
    const c = await calls(page);
    ok("ไม่มี error", errs.length === 0, errs[0]);
    ok(`วาดครบ ${P.boxes.length} กล่อง`, P.boxes.every((id) => c.some((x) => x.id === id)), JSON.stringify(c));
    ok("ไม่วาดกล่องเดิมซ้ำ", new Set(c.map((x) => x.id)).size === c.length, JSON.stringify(c));
    const sorted = c.map((x) => x.at).sort((a, b) => a - b);
    let minGap = Infinity;
    for (let i = 1; i < sorted.length; i++) minGap = Math.min(minGap, sorted[i] - sorted[i - 1]);
    ok("เว้นระยะระหว่างกล่อง ≥ 2 วินาที", sorted.length < 2 || minGap >= 2000, "ห่างน้อยสุด " + minGap + "ms");
    await ctx.close();
  }

  // ---- [4] เปลี่ยนค่ารัวๆ ต้องยุบเป็นครั้งเดียว (debounce) ----
  {
    console.log("\n[4] เปลี่ยนช่วงเวลารัวๆ — ต้องไม่ยิงทุกครั้งที่กด");
    const { ctx, page } = await setup(P, { width: 1400, height: 900 });
    await page.waitForTimeout(1500);
    // เดสก์ท็อปกางกล่องตั้งค่าไว้ตลอด · จอแคบต้องกดเปิดก่อน — ที่นี่ 1400px จึงกางอยู่แล้ว
    const before = (await calls(page)).length;
    const opts = await page.locator("#period option").evaluateAll((ns) => ns.map((n) => n.value));
    for (const v of opts.slice(0, 4)) { await page.selectOption("#period", v); await page.waitForTimeout(60); }
    await page.waitForTimeout(1200);
    const added = (await calls(page)).length - before;
    ok("กด 4 ครั้งรัวๆ ยิงกราฟหลักครั้งเดียว", added <= 1, "ยิงไป " + added + " ครั้ง");
    await ctx.close();
  }

  // ---- [5] ปุ่มโหลดใหม่รายกล่อง ----
  {
    console.log("\n[5] ปุ่ม 🔄 โหลดเฉพาะกล่องนั้นใหม่");
    const { ctx, page } = await setup(P, { width: 1400, height: 900 });
    await page.waitForTimeout(1500);
    const btn = page.locator('.wretry[data-w="w-ts"]');
    ok("มีปุ่มโหลดใหม่ใต้กราฟหลัก", (await btn.count()) === 1);
    ok("มีลิงก์หนีไปดูบน Google เอง", (await page.locator("#tsOpen").getAttribute("href")).startsWith("https://trends.google.com/trends/explore?"));
    const before = (await calls(page)).filter((x) => x.id === "w-ts").length;
    await btn.click();
    await page.waitForTimeout(300);
    const after = (await calls(page)).filter((x) => x.id === "w-ts").length;
    ok("กดแล้ววาดกราฟหลักใหม่ทันที", after === before + 1, `${before} → ${after}`);
    ok("กล่องอื่นไม่ถูกวาดซ้ำด้วย", (await calls(page)).filter((x) => x.id === P.boxes[1]).length <= 1);
    await ctx.close();
  }
}

await browser.close();
console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
