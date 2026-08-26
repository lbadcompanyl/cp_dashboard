/* หน้า /selftest/ — เครื่องมือให้เจ้าของเปิดบน iPhone จริงแล้วอ่านผล
 *
 * 🎯 เจ้าของถาม 25 ส.ค. 2026: "มีวิธีทำระบบ test ของ ios mobile เองไหม?" + "มีแต่ใช้ไม่สะดวก"
 *    เทสต์อัตโนมัติบน WebKit (ดู .github/workflows/tests.yml) จับได้แต่เรื่องหน้าตา/โค้ด
 *    เรื่องที่มีแต่เครื่องจริงตอบได้ → หน้านี้ทำให้เหลือ "เปิด 1 หน้า อ่านผล"
 *
 * ⚠️ ตัวหน้าเองก็ต้องมีคนคุม — ถ้ามันพังเงียบ เจ้าของจะเข้าใจว่า "ทุกอย่างปกติ"
 *    ทั้งที่จริงมันไม่ได้ตรวจอะไรเลย ซึ่งแย่กว่าไม่มีหน้านี้
 */
import fs from "node:fs";
import { launch } from "./browser.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8899";
const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const LINE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.5.0/IAB";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra ? " → " + extra : "")); }
};

const browser = await launch();
async function open(o = {}) {
  const ctx = await browser.newContext({ viewport: o.vp || { width: 390, height: 844 }, userAgent: o.ua });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  if (o.route) await ctx.route(o.route[0], o.route[1]);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(BASE + "/selftest/", { waitUntil: "load" });
  await p.waitForFunction(() => !/กำลังตรวจ/.test(document.getElementById("sum").textContent), null, { timeout: 20000 })
    .catch(() => {});
  return { ctx, p, errs };
}
const textOf = (p) => p.$eval("#out", (e) => e.innerText);

console.log("\n[1] เปิดบน iPhone แล้วต้องตรวจจนจบ ไม่ค้าง");
{
  const { ctx, p, errs } = await open({ ua: IOS_UA });
  const sum = await p.$eval("#sum", (e) => e.textContent);
  ok("ตรวจจนจบ (ไม่ค้างที่ 'กำลังตรวจ')", !/กำลังตรวจ/.test(sum), sum);
  const t = await textOf(p);
  // ⚠️ ถ้าหมวดไหนหายไป แปลว่ามันพังกลางทางแล้วเงียบ — อันตรายกว่าไม่มีหน้านี้
  for (const g of ["เครื่องนี้คืออะไร", "เงื่อนไขการติดตั้ง", "แถบชวนติดตั้ง", "หน้าตาบนเครื่องนี้", "ข้อมูลยังมาไหม"])
    ok(`ตรวจหมวด "${g}" ครบ`, t.includes(g), t.slice(0, 80));
  ok("รู้ว่าเป็น iPhone", /iPhone/.test(t));
  ok("บอกตำแหน่งปุ่มแชร์ให้ตรงเครื่อง", /ด้านล่างของ Safari/.test(t), t.slice(0, 100));
  ok("ไม่ล้นแนวนอนบนจอ 390", await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1));
  ok("ไม่มี JS error", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

console.log("\n[2] เปิดจากในไลน์ ต้องรู้ตัวและบอกให้ถูก");
{
  const { ctx, p } = await open({ ua: LINE_UA });
  const t = await textOf(p);
  ok("รู้ว่าเปิดจากในไลน์", /ไลน์/.test(t), t.slice(0, 100));
  ok("บอกว่าติดตั้งจากตรงนี้ไม่ได้", /ติดตั้งไม่ได้จากตรงนี้/.test(t), t.slice(0, 120));
  await ctx.close();
}

console.log("\n[3] ต้องจับของที่พังได้จริง ไม่ใช่ขึ้นเขียวตลอด");
{
  // ⚠️ ข้อสำคัญที่สุดของไฟล์นี้ — หน้าที่ขึ้น ✅ ตลอดไม่ว่าอะไรจะพัง = หลอกเจ้าของ
  //    จำลอง Cloudflare Access หมดอายุ: API ตอบหน้าล็อกอินเป็น HTML แทน JSON
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IOS_UA });
  await ctx.route("**/api/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/html", body: "<html>เข้าสู่ระบบ</html>" }));
  const p = await ctx.newPage();
  await p.goto(BASE + "/selftest/", { waitUntil: "load" });
  await p.waitForFunction(() => !/กำลังตรวจ/.test(document.getElementById("sum").textContent), null, { timeout: 20000 }).catch(() => {});
  const sum = await p.$eval("#sum", (e) => e.textContent);
  const t = await p.$eval("#out", (e) => e.innerText);
  ok("จับได้ว่า API ไม่ได้ตอบเป็นข้อมูล", /ไม่ได้ตอบเป็นข้อมูล/.test(t), t.slice(-160));
  ok("สรุปบนสุดบอกว่าไม่ผ่าน", /ไม่ผ่าน/.test(sum), sum);
  await ctx.close();

  // manifest พัง ก็ต้องจับได้
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IOS_UA });
  await c2.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await c2.route("**/manifest.webmanifest", (r) => r.fulfill({ status: 404, body: "no" }));
  const p2 = await c2.newPage();
  await p2.goto(BASE + "/selftest/", { waitUntil: "load" });
  await p2.waitForFunction(() => !/กำลังตรวจ/.test(document.getElementById("sum").textContent), null, { timeout: 20000 }).catch(() => {});
  ok("จับได้ว่าโหลด manifest ไม่ได้", /โหลด manifest ไม่ได้/.test(await p2.$eval("#out", (e) => e.innerText)));
  await c2.close();
}

console.log("\n[4] ระดับไฟล์ — กฎที่ห้ามหลุด");
{
  const html = fs.readFileSync(new URL("../selftest/index.html", import.meta.url), "utf8");
  // ⚠️ ตัดคอมเมนต์ทิ้งก่อนเทียบ ไม่งั้นไปจับข้อความเตือนที่เขียนอธิบายไว้ในไฟล์เอง
  const code = html.replace(/<!--[\s\S]*?-->/g, "");
  // 🚫 แถบชวนติดตั้งจะเด้งทับผลตรวจ และทำให้ค่าที่วัดเพี้ยน
  //    เทียบที่ "โหลดไฟล์จริง" เท่านั้น — เอ่ยชื่อไฟล์ในคอมเมนต์อธิบายได้ตามปกติ
  ok("🚫 ไม่โหลดแถบชวนติดตั้งที่หน้านี้",
     !/(src|href)\s*=\s*["'][^"']*installprompt\.(js|css)/.test(code));
  ok("กัน Google ไม่ให้เก็บหน้านี้", /name="robots"[^>]*noindex/.test(html));
  ok("มีปุ่มคัดลอกผล (เจ้าของจะได้ไม่ต้องพิมพ์เอง)", /id="copy"/.test(html));
  // Safari รุ่นเก่าไม่มี clipboard API — กดแล้วต้องไม่เงียบ
  ok("ปุ่มคัดลอกมีทางถอยเมื่อไม่มี clipboard API", /execCommand\("copy"\)/.test(html));
  ok("มีปุ่มล้างความจำแถบชวนติดตั้ง", /installPromptDone/.test(html) && /id="reset"/.test(html));
  // ตาราง IN_APP ต้องตรงกับตัวจริง ไม่งั้นหน้านี้จะรายงานคนละเรื่องกับที่ผู้ใช้เห็น
  const ip = fs.readFileSync(new URL("../installprompt.js", import.meta.url), "utf8");
  for (const app of ["ไลน์", "เฟซบุ๊ก", "อินสตาแกรม", "วีแชท", "ติ๊กต่อก"])
    ok(`รู้จักแอป "${app}" เหมือน installprompt.js`, html.includes(app) && ip.includes(app));
  // ไม่มีการ์ดบน landing โดยตั้งใจ — เป็นเครื่องมือ ไม่ใช่แดชบอร์ด
  const landing = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  ok("ไม่มีการ์ดบนหน้าแรก (เป็นเครื่องมือ ไม่ใช่แดชบอร์ด)", !/selftest/.test(landing));
}

console.log("\n" + (fail ? "❌ ตก" : "✅ ผ่านหมด") + " — ผ่าน " + pass + " · ตก " + fail + "\n");
await browser.close();
process.exit(fail ? 1 : 0);
