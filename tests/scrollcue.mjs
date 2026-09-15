/* ⏱ ปุ่มลอย "▼ เลื่อนเพื่อดู Trend · X · YouTube" ต้องจางหายเองใน 5 วิ
 *
 * เจ้าของสั่ง 14 ก.ย. 2026 (10 วิ) · ปรับเป็น 7.5 แล้วเป็น 5 วิ 15 ก.ย. 2026
 * — มันแค่ชี้ทาง ไม่ได้มาถาม จึงไม่ควรค้างอยู่ตลอด
 * (กฎเดียวกับแถบชวนติดตั้ง: "แถบหายเอง ห้ามบังคับให้กด")
 *
 * 🚫 ข้อที่พลาดง่ายที่สุด: จางแล้วแต่ **ยังกดโดน** — `opacity:0` อย่างเดียว
 *    ปุ่มยังรับคลิกอยู่ กลายเป็นปุ่มล่องหนขวางของที่อยู่ข้างหลัง
 *    จึงต้องวัด `elementFromPoint` ตรงกลางปุ่มด้วย ไม่ใช่วัดแค่ opacity
 *
 * ⚠️ ปุ่มโผล่เฉพาะตอน "คอลัมน์ Google Trends ยังไม่อยู่ในจอ และหน้าเลื่อนลงได้"
 *    จอสูง 700px คอลัมน์นั้นอยู่ในจอแล้ว (วัดได้ top=433) ปุ่มจึงไม่ขึ้นเลย
 *    → เทสต์ต้องใช้ **จอเตี้ย** ไม่งั้นวัดไม่โดน (ผ่านตลอดโดยไม่ได้ทดสอบอะไร)
 * ⚠️ และต้องกว้าง > 640px — จอแคบกว่านั้นเป็น carousel ปุ่มนี้ถูกซ่อนด้วย CSS
 */
import fs from "node:fs";
import { launch } from "./browser.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8899";
const SHORT = { width: 1400, height: 380 };   // เตี้ยพอให้ปุ่มโผล่จริง

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra ? " → " + extra : "")); }
};

const browser = await launch();

/** อ่านสภาพปุ่ม + เช็คว่า "คลิกตรงกลางปุ่ม" ไปโดนอะไร */
const cueState = (p) => p.$eval("#scrollcue", (el) => {
  const c = getComputedStyle(el), r = el.getBoundingClientRect();
  const hit = el.hidden ? "—" : (() => {
    const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return e && e.closest("#scrollcue") ? "cue" : (e ? e.tagName : "—");
  })();
  return { hidden: el.hidden, opacity: +c.opacity, pointer: c.pointerEvents, hit };
});

console.log("\n[1] /trend/ — ปุ่มโผล่ก่อน แล้วจางหายเองใน 5 วิ");
{
  const ctx = await browser.newContext({ viewport: SHORT });
  await ctx.route("**/api/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"sources":{},"items":[],"trends":[]}' }));
  const p = await ctx.newPage();
  await p.goto(BASE + "/trend/", { waitUntil: "load" });

  await p.waitForTimeout(1000);
  let s = await cueState(p);
  ok("แรกเข้า: ปุ่มโผล่", s.hidden === false, JSON.stringify(s));
  ok("แรกเข้า: กดได้จริง", s.hit === "cue", JSON.stringify(s));

  await p.waitForTimeout(2500);
  s = await cueState(p);
  ok("~3.5 วิ ยังอยู่ (ห้ามหายก่อนเวลา)", s.hidden === false && s.opacity === 1, JSON.stringify(s));

  await p.waitForTimeout(3500);            // ผ่าน 5 วิ + เผื่อเวลาจาง
  s = await cueState(p);
  ok("~7 วิ: จางหายแล้ว", s.hidden === true || s.opacity === 0, JSON.stringify(s));
  ok("🚫 จางแล้วต้องกดไม่โดน", s.hit !== "cue", JSON.stringify(s));

  // 🚫 หายแล้วต้องไม่กลับมา — ไม่งั้นเลื่อนขึ้นลงทีไรก็เด้งใหม่ทุกที
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(700);
  s = await cueState(p);
  ok("🚫 เลื่อนขึ้นบนสุดแล้วต้องไม่กลับมา", s.hidden === true || s.opacity === 0, JSON.stringify(s));
  await ctx.close();
}

// ── [2] ด่านระดับโค้ด — กันไม่ให้ใครลบตัวจับเวลาหรือ pointer-events ออกเงียบๆ ──
console.log("\n[2] ด่านระดับโค้ด");
{
  const js = fs.readFileSync(new URL("../trend/app.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../trend/styles.css", import.meta.url), "utf8");
  const block = js.slice(js.indexOf("function setupScrollCue"), js.indexOf("function setupScrollCue") + 1400);

  ok("มีตัวจับเวลา 5 วิ", /FADE_MS\s*=\s*5000/.test(block), "ไม่เจอ FADE_MS = 5000");
  ok("จางแล้วตั้ง hidden ด้วย (ไม่ใช่แค่ opacity)", /cue\.hidden\s*=\s*true/.test(block));
  ok("จางแล้วไม่กลับมา (มีธงกัน)", /if\s*\(faded\)\s*return/.test(block));
  ok("CSS: .cuegone ปิดการกดด้วย", /#scrollcue\.cuegone[^}]*pointer-events:\s*none/.test(css));
  ok("CSS: มี transition ของ opacity", /#scrollcue\s*\{[^}]*transition:[^;]*opacity/.test(css));
}

await browser.close();
console.log(`\n${fail ? "❌ ตก" : "✅ ผ่านหมด"} — ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
