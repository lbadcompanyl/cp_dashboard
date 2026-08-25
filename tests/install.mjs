/* แถบชวนติดตั้งเป็นแอป (/installprompt.js) — ทุกหน้า
 *
 * 🎯 เจ้าของสั่ง 21 ส.ค. 2026: เปิดครั้งแรกทั้งมือถือและเดสก์ท็อป ให้เด้งถามเลย
 *
 * ⚠️ **2 ทางที่ต่างกันสิ้นเชิง ต้องคุมทั้งคู่**
 *    Chrome/Edge = มี beforeinstallprompt สั่งติดตั้งได้จริง
 *    iOS         = ไม่มี event ใดๆ ทำได้แค่บอกวิธี (แชร์ → เพิ่มไปยังหน้าจอโฮม)
 *
 * ⚠️ **ทดสอบ WebKit ที่นี่ไม่ได้ มีแต่ Chromium** — ทางฝั่ง iOS จึงทดสอบได้แค่
 *    "เลือกทางถูกไหมเมื่อเจอ UA ของ iPhone" ส่วนพฤติกรรมจริงบน Safari
 *    ต้องให้เจ้าของเปิดบนเครื่องยืนยันเอง
 */
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:8899";
const CHROME = "/opt/pw-browsers/chromium";
const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra ? " → " + extra : "")); }
};

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
async function open(o = {}) {
  const ctx = await browser.newContext({ viewport: o.vp || { width: 390, height: 780 }, userAgent: o.ua });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ sources: {}, items: [], configured: true, records: [], kw: {} }) }));
  if (o.init) await ctx.addInitScript(o.init);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(BASE + (o.path || "/trend/"), { waitUntil: "load" });
  return { ctx, p, errs };
}
// headless ไม่ยิง beforeinstallprompt ให้ ต้องยิงเอง
const fire = (p, outcome = "accepted") => p.evaluate((oc) => {
  const e = new Event("beforeinstallprompt");
  e.prompt = () => { window.__prompted = true; };
  e.userChoice = Promise.resolve({ outcome: oc });
  window.dispatchEvent(e);
}, outcome);
const WAIT = 4200; // แถบหน่วง 3.5 วิ ไม่ให้เด้งทับตอนหน้ากำลังโหลด

console.log("\n[1] Chrome/Edge — กดแล้วต้องเรียกกล่องติดตั้งของจริง");
{
  const { ctx, p, errs } = await open({ vp: { width: 1400, height: 900 } });
  await p.waitForTimeout(300);
  await fire(p);
  await p.waitForTimeout(WAIT);

  const txt = await p.$eval("#installbar", (e) => e.textContent.replace(/\s+/g, " ")).catch(() => "");
  ok("แถบขึ้นบนเดสก์ท็อป", !!txt, txt.slice(0, 40));
  ok("ถามเป็นภาษาคน ไม่ใช่ศัพท์เทคนิค", txt.includes("ติดตั้งเป็นแอป") && !/PWA|manifest/i.test(txt), txt.slice(0, 60));
  ok("มีปุ่มติดตั้ง", !!(await p.$(".ib-yes")));
  ok("มีทางปฏิเสธ", !!(await p.$(".ib-no")));
  ok("ไม่ทำให้หน้าล้นแนวนอน", await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth));

  await p.click(".ib-yes");
  await p.waitForTimeout(500);
  ok("กดติดตั้ง → เรียก prompt() ของเบราว์เซอร์จริง", await p.evaluate(() => !!window.__prompted));
  ok("กดแล้วแถบหายไป", (await p.$("#installbar")) === null);
  ok("ติดตั้งสำเร็จ = เลิกชวนถาวร", (await p.evaluate(() => localStorage.getItem("installPromptDone"))) === "1");
  ok("ไม่มี JS error", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

console.log("\n[2] iOS — ไม่มี event ให้เรียก ต้องบอกวิธีแทน");
{
  const { ctx, p, errs } = await open({ ua: IOS_UA });
  await p.waitForTimeout(WAIT);
  const txt = await p.$eval("#installbar", (e) => e.textContent.replace(/\s+/g, " ")).catch(() => "");
  ok("แถบขึ้นเองโดยไม่ต้องรอ event", !!txt, txt.slice(0, 40));
  ok("บอกวิธีทำจริง (ปุ่มแชร์ → เพิ่มไปยังหน้าจอโฮม)",
     txt.includes("แชร์") && txt.includes("เพิ่มไปยังหน้าจอโฮม"), txt.slice(0, 90));
  // ⚠️ ห้ามมีปุ่ม "ติดตั้ง" บน iOS — กดแล้วไม่มีอะไรเกิดขึ้น ผู้ใช้จะนึกว่าเว็บพัง
  ok("ไม่มีปุ่มติดตั้งปลอมให้กด", (await p.$(".ib-yes")) === null);
  ok("ไม่ทำให้หน้าล้นแนวนอน", await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth));
  await p.click(".ib-no");
  await p.waitForTimeout(400);
  ok("บอกวิธีไปแล้ว = ไม่ต้องบอกซ้ำอีก", (await p.evaluate(() => localStorage.getItem("installPromptDone"))) === "1");
  ok("ไม่มี JS error", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

console.log("\n[3] ห้ามกวน");
{
  // ติดตั้งไปแล้ว (เปิดจากไอคอนบนหน้าจอ) ต้องไม่ชวนอีก
  const { ctx, p } = await open({ init: () => {
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => String(q).includes("standalone")
      ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
      : mm(q);
  } });
  await fire(p);
  await p.waitForTimeout(WAIT);
  ok("เปิดจากแอปที่ติดตั้งแล้ว ไม่ชวนซ้ำ", (await p.$("#installbar")) === null);
  await ctx.close();

  // กด "ไว้ก่อน" แล้วเปิดหน้าอื่นในเว็บเดียวกัน ต้องไม่เด้งใหม่
  const s = await open({});
  await fire(s.p, "dismissed");
  await s.p.waitForTimeout(WAIT);
  await s.p.click(".ib-no");
  await s.p.waitForTimeout(300);
  await s.p.goto(BASE + "/ir/", { waitUntil: "load" });
  await fire(s.p, "dismissed");
  await s.p.waitForTimeout(WAIT);
  ok("กด 'ไว้ก่อน' แล้วเปิดหน้าอื่นก็ไม่เด้งซ้ำ", (await s.p.$("#installbar")) === null);
  await s.ctx.close();
}

console.log("\n[4] ครบทุกหน้า + ไม่ชนกับแถบ 'มีเวอร์ชันใหม่'");
{
  // ⚠️ เพิ่มหน้าใหม่เมื่อไหร่ ต้องมาเติมที่นี่ด้วย · ไม่รวม /admin/ (เครื่องมือเจ้าของ) และ /social/ (session อื่นดูแล)
  for (const f of ["index.html", "trend/index.html", "ir/index.html", "issue/index.html",
                   "issue/trends.html", "issue/three.html", "archives/index.html", "sd.html"]) {
    const html = fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
    ok(`${f} โหลด installprompt`, /installprompt\.js/.test(html) && /installprompt\.css/.test(html));
  }
  // ⚠️ แถบ "มีเวอร์ชันใหม่" (#updbar) สำคัญกว่า — ห้ามขึ้นทับกัน
  const js = fs.readFileSync(new URL("../installprompt.js", import.meta.url), "utf8");
  ok("หลบแถบ 'มีเวอร์ชันใหม่'", /getElementById\("updbar"\)/.test(js));
  const css = fs.readFileSync(new URL("../installprompt.css", import.meta.url), "utf8");
  ok("z-index ต่ำกว่า #updbar (9999)", /z-index:\s*9998/.test(css));
  ok("เว้นขอบล่างเผื่อ safe-area ของ iPhone", /safe-area-inset-bottom/.test(css));
  ok("มีสีของตัวเองทั้งโหมดสว่างและมืด", /prefers-color-scheme:\s*dark/.test(css));
}

console.log("\n" + (fail ? "❌ ตก" : "✅ ผ่านหมด") + " — ผ่าน " + pass + " · ตก " + fail + "\n");
await browser.close();
process.exit(fail ? 1 : 0);
