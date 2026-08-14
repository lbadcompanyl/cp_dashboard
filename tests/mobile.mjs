// วัดเลย์เอาต์มือถือของจริงด้วย Chromium — ไม่เดาจาก CSS
import { chromium } from "playwright";

const PAGES = ["/trend/", "/ir/", "/issue/"];
const VIEWPORTS = [
  { name: "iPhone 12 (390×844)", width: 390, height: 844 },
  { name: "Galaxy (412×915)", width: 412, height: 915 },
  { name: "iPhone SE (360×667)", width: 360, height: 667 },
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let fail = 0, pass = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log("    ✅ " + n); } else { fail++; console.log("    ❌ " + n + (x ? "  → " + x : "")); } };

let NO_DVH = false;
async function runMobile() {
for (const path of PAGES) {
  console.log("\n=== " + path + (NO_DVH ? "  [จำลองไม่รู้จัก dvh]" : "") + " ===");
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("    ⚠️ JS error: " + e.message));
    // จำลองเบราว์เซอร์ที่ยังไม่รู้จัก dvh (Safari ก่อน 15.4) — ทับด้วย 100vh
    // ซึ่งคือค่าที่ engine แบบนั้นจะคำนวณได้จากบรรทัดสำรองในไฟล์จริง
    if (NO_DVH) await page.addStyleTag({ content: "@media (max-width: 640px){ body { height: 100vh; } }" });
    await page.goto("http://127.0.0.1:8899" + path, { waitUntil: "load" });
    if (NO_DVH) await page.addStyleTag({ content: "@media (max-width: 640px){ body { height: 100vh; } }" });
    await page.waitForTimeout(700);

    const m = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const box = (el) => (el ? el.getBoundingClientRect() : null);
      const board = q(".board"), gs = q(".gsearch"), tb = q(".topbar");
      const panel = q(".panel");
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        docScrollW: document.scrollingElement.scrollWidth,
        docScrollH: document.scrollingElement.scrollHeight,
        boardW: board ? board.getBoundingClientRect().width : -1,
        boardBottom: board ? board.getBoundingClientRect().bottom : -1,
        boardScrollW: board ? board.scrollWidth : -1,
        gsW: gs ? gs.getBoundingClientRect().width : -1,
        gsLeft: gs ? gs.getBoundingClientRect().left : -1,
        tbW: tb ? tb.getBoundingClientRect().width : -1,
        panelW: panel ? panel.getBoundingClientRect().width : -1,
        panels: document.querySelectorAll(".panel").length,
        // ลูกของ body ที่อยู่ใน flow ทุกตัวต้องกว้างเต็มจอและชิดซ้าย
        // (auto margin บนแกนขวางของ flex ทำให้ตัวไหนก็ตามหดเป็นเท่าเนื้อหาได้)
        badKids: [...document.body.children]
          .filter((el) => getComputedStyle(el).position === "static" && el.offsetHeight > 0)
          .map((el) => ({ n: el.tagName + "." + (el.className || el.id || "?"), w: Math.round(el.getBoundingClientRect().width), l: Math.round(el.getBoundingClientRect().left) }))
          .filter((k) => Math.abs(k.w - window.innerWidth) > 1 || Math.abs(k.l) > 1),
      };
    });

    console.log(`  ${vp.name}`);
    ok("หน้าไม่กว้างเกินจอ (ไม่มี scroll แนวนอนทั้งหน้า)", m.docScrollW <= m.vw + 1, `scrollW ${m.docScrollW} vs vw ${m.vw}`);
    ok("บอร์ดกว้างเท่าจอพอดี", Math.abs(m.boardW - m.vw) <= 1, `boardW ${Math.round(m.boardW)} vs vw ${m.vw}`);
    ok("แถบค้นหากว้างเต็มจอ", Math.abs(m.gsW - m.vw) <= 1, `gsW ${Math.round(m.gsW)} vs vw ${m.vw}`);
    ok("แถบค้นหาชิดซ้ายสุด ไม่ถูกจับกลาง", Math.abs(m.gsLeft) <= 1, `left ${Math.round(m.gsLeft)}`);
    ok("topbar เต็มจอ", Math.abs(m.tbW - m.vw) <= 1, `tbW ${Math.round(m.tbW)}`);
    ok("คอลัมน์กว้างราว 92% ของจอ", m.panelW > m.vw * 0.85 && m.panelW < m.vw * 0.98, `panelW ${Math.round(m.panelW)} vs vw ${m.vw}`);
    ok("ขอบล่างบอร์ดชนขอบจอพอดี", Math.abs(m.boardBottom - m.vh) <= 2, `bottom ${Math.round(m.boardBottom)} vs vh ${m.vh}`);
    ok("หน้าไม่เลื่อนแนวตั้ง (คอลัมน์เลื่อนในตัวเอง)", m.docScrollH <= m.vh + 1, `scrollH ${m.docScrollH} vs vh ${m.vh}`);
    ok("ลูกของ body ทุกตัวกว้างเต็มจอและชิดซ้าย", m.badKids.length === 0, JSON.stringify(m.badKids));

    await ctx.close();
  }
}
}

await runMobile();
// Safari ก่อน 15.4 ไม่รู้จัก dvh — ต้องได้เลย์เอาต์ที่ใช้งานได้เหมือนกันจากบรรทัดสำรอง 100vh
console.log("\n\n########  รอบที่ 2: เบราว์เซอร์ที่ไม่รู้จัก dvh  ########");
NO_DVH = true;
await runMobile();
NO_DVH = false;

// แท็บเล็ต — ต้องไม่ตกลงไปใช้เลย์เอาต์ carousel ของมือถือ
console.log("\n=== แท็บเล็ต (iPad) ===");
for (const vp of [{ name: "iPad Air (820×1180)", width: 820, height: 1180 }, { name: "iPad mini (768×1024)", width: 768, height: 1024 }]) {
  const c = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await c.newPage();
  await pg.goto("http://127.0.0.1:8899/trend/", { waitUntil: "load" });
  await pg.waitForTimeout(500);
  const t = await pg.evaluate(() => ({
    bodyDisplay: getComputedStyle(document.body).display,
    bodyOverflow: getComputedStyle(document.body).overflow,
    boardDisplay: getComputedStyle(document.querySelector(".board")).display,
    docScrollW: document.scrollingElement.scrollWidth,
    vw: innerWidth,
  }));
  console.log("  " + vp.name);
  ok("ไม่โดน flex ของมือถือ (body ยังเป็น block)", t.bodyDisplay === "block", t.bodyDisplay);
  ok("หน้ายังเลื่อนได้ ไม่ถูกล็อกความสูง", t.bodyOverflow === "visible", t.bodyOverflow);
  ok("บอร์ดยังเป็น grid ไม่ใช่ carousel", t.boardDisplay === "grid", t.boardDisplay);
  ok("ไม่มี scroll แนวนอน", t.docScrollW <= t.vw + 1, `${t.docScrollW} vs ${t.vw}`);
  await c.close();
}

// เดสก์ท็อปต้องไม่พังตาม
console.log("\n=== เดสก์ท็อป 1440×900 (ต้องไม่กระทบ) ===");
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:8899/trend/", { waitUntil: "load" });
await page.waitForTimeout(500);
const d = await page.evaluate(() => {
  const b = document.querySelector(".board");
  return {
    display: getComputedStyle(b).display,
    cols: getComputedStyle(b).gridTemplateColumns.split(" ").length,
    bodyDisplay: getComputedStyle(document.body).display,
    bodyOverflow: getComputedStyle(document.body).overflow,
    docScrollW: document.scrollingElement.scrollWidth,
    vw: innerWidth,
  };
});
ok("บอร์ดยังเป็น grid 3 คอลัมน์", d.display === "grid" && d.cols === 3, JSON.stringify(d));
ok("body ยังเป็น block ไม่โดน flex ของมือถือ", d.bodyDisplay === "block", d.bodyDisplay);
ok("body ยังเลื่อนได้ปกติ", d.bodyOverflow === "visible", d.bodyOverflow);
ok("ไม่มี scroll แนวนอน", d.docScrollW <= d.vw + 1, `${d.docScrollW} vs ${d.vw}`);
await ctx.close();

await browser.close();
console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
