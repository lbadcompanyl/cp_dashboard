// หน้าต่าง 🔤 ดู keyword ต้องมีครบทุกคอลัมน์ Alert ของทุกแดชบอร์ด
// และต้องโชว์คำชุดปัจจุบันจริง (ยึด query สดของฟีดถ้าได้คำมากกว่าที่ฝังไว้ในโค้ด)
import { chromium } from "playwright";

let pass = 0, fail = 0;
const ok = (c, m, x = "") => { c ? (pass++, console.log("  ✅ " + m)) : (fail++, console.log("  ❌ " + m + (x ? " → " + x : ""))); };

const S = (items = [], queries) => ({ label: "x", feedCount: 1, items, ...(queries ? { queries } : {}) });
// query สดจากฟีด — ต้องยาวกว่าที่ฝังไว้ในโค้ด (74/123 คำ) ระบบถึงจะยึดอันนี้
// กฎคือ "ฝั่งไหนได้คำมากกว่าใช้ฝั่งนั้น" เพราะ Google ตัด title ให้สั้นเมื่อ query ยาว
const LIVE_A2 = [`"คำสดจากฟีด" OR ` + Array.from({ length: 200 }, (_, i) => `"สดที่${i}"`).join(" OR ")];
const LIVE_A1 = [`"cp" -tower OR "ซีพี" OR "เซเว่น"`];

const FEEDS = { generatedAt: new Date().toISOString(), errors: [], sources: {
  news: S(), gnews: S(), newsth: S(), newsintl: S(),
  alert1: S([], LIVE_A1), alert2: S([], LIVE_A2), trends: { label: "t", items: [] } } };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
for (const [name, path] of [["trend", "/trend/"], ["ir", "/ir/"], ["issue", "/issue/"]]) {
  console.log(`\n--- ${name} ---`);
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e.message)));
  await p.route("**/api/**", (r) => r.request().url().includes("/feeds")
    ? r.fulfill({ json: FEEDS }) : r.fulfill({ json: { items: [], configured: false } }));
  await p.goto("http://127.0.0.1:8899" + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  ok(errs.length === 0, "ไม่มี JS error" + (errs.length ? " → " + errs[0] : ""));

  const alerts = await p.$$eval(".panel[data-source]", (ps) =>
    ps.map((e) => e.dataset.source).filter((s) => s.startsWith("alert")));
  ok(alerts.length >= 2, `มีคอลัมน์ Alert ${alerts.length} คอลัมน์`);

  for (const src of alerts) {
    const btn = p.locator(`.panel[data-source="${src}"] .flg-view-btn`);
    // คอลัมน์ CP (alert1) เจ้าของสั่งไม่ต้องมีปุ่มนี้ — query มีไม่กี่คำ เปิดดูแล้วไม่ได้อะไร
    if (src === "alert1") { ok(await btn.count() === 0, "alert1 (CP): ไม่มีปุ่ม 🔤 ตามที่สั่ง"); continue; }
    ok(await btn.count() === 1, `${src}: มีปุ่ม 🔤 ดู keyword`);
    if (!(await btn.count())) continue;
    await btn.click();
    await p.waitForTimeout(300);
    const box = p.locator(".flg-catpick");
    const txt = await box.innerText();
    ok(txt.includes("keyword ที่ track อยู่"), `${src}: กดแล้วเปิดหน้าต่างดู keyword`);
    ok(!txt.includes("ยังไม่ได้ตั้งรายการ"), `${src}: มีรายการคำ ไม่ใช่ว่างเปล่า`);
    const chips = await p.$$eval(".flg-catpick .flg-mchip", (els) => els.map((e) => e.textContent.trim()));
    ok(chips.length > 0, `${src}: โชว์คำ ${chips.length} คำ`);
    if (src === "alert2") {
      ok(chips.includes("คำสดจากฟีด") && chips.length > 150,
         `alert2: query สดยาวกว่า → ยึดของสด (${chips.length} คำ)`, chips.slice(0, 5).join(","));
      ok(!chips.some((c) => c.startsWith("-")), "alert2: ไม่เอาคำ -ไม่เอา มาโชว์เป็น keyword", chips.join(","));
    }
    await p.click(".flg-catpick [data-catclose]");
    await p.waitForTimeout(200);
  }
  await ctx.close();
}
await b.close();
console.log(`\n${fail ? "❌" : "✅"} ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
