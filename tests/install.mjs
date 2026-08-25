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
import { launch } from "./browser.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8899";
const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra ? " → " + extra : "")); }
};

const browser = await launch();
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
  // ⏱ ห้ามบังคับให้กด — ต้องมี ✕ ให้ปิดเดี๋ยวนี้ได้ และต้องหายเองด้วย
  ok("มี ✕ ให้ปิดเดี๋ยวนี้", !!(await p.$(".ib-x")));
  ok("🚫 ไม่มีปุ่มที่ต้องกดเพื่อรับทราบ", (await p.$(".ib-no")) === null);
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
  await p.click(".ib-x");
  await p.waitForTimeout(400);
  ok("กด ✕ แล้วแถบหายไป", (await p.$("#installbar")) === null);
  // ⚠️ ปิดแถบ ≠ ไม่เอาถาวร — เขาอาจแค่ปัดออกไปก่อน ยังไม่ทันอ่านจบด้วยซ้ำ
  ok("ปิดแถบไม่นับว่าไม่เอาถาวร (เงียบตามรอบ 30 วันพอ)",
     (await p.evaluate(() => localStorage.getItem("installPromptDone"))) === null);
  ok("จำว่าถามไปแล้วรอบหนึ่ง", !!(await p.evaluate(() => localStorage.getItem("installPromptAt"))));
  ok("ไม่มี JS error", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

console.log("\n[2b] เปิดจากในแอปแชต — ติดตั้งไม่ได้ ต้องบอกให้ออกไปเบราว์เซอร์ก่อน");
{
  // ⚠️ เจ้าของถาม 25 ส.ค. 2026: "เปิดผ่านไลน์ก็ไม่ได้ซิ เพราะต้องกด open on browser อีกที"
  //    ถูกต้อง — และของเดิมยังบอกให้ "แตะปุ่มแชร์ด้านล่างของ Safari" ทั้งที่ผู้ใช้อยู่ในไลน์
  //    ปุ่มนั้นไม่มีอยู่จริงในนั้น = สั่งให้ทำสิ่งที่ทำไม่ได้
  const LINE_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.5.0/IAB";
  const LINE_AND = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Line/14.5.0/IAB";
  for (const [label, ua] of [["iPhone", LINE_IOS], ["Android", LINE_AND]]) {
    const { ctx, p, errs } = await open({ ua });
    await p.waitForTimeout(WAIT);
    const txt = await p.$eval("#installbar", (e) => e.textContent.replace(/\s+/g, " ")).catch(() => "");
    ok(`ไลน์/${label} ขึ้นแถบบอกทาง`, !!txt, txt.slice(0, 50));
    ok(`ไลน์/${label} บอกให้เปิดในเบราว์เซอร์ก่อน`, /เปิดในเบราว์เซอร์/.test(txt), txt.slice(0, 90));
    ok(`ไลน์/${label} เรียกชื่อแอปถูก`, txt.includes("ไลน์"), txt.slice(0, 90));
    // 🚫 ห้ามบอกวิธีของ Safari ทั้งที่อยู่ในไลน์ — ปุ่มนั้นไม่มีให้กด
    ok(`ไลน์/${label} ไม่บอกวิธีที่ทำตามไม่ได้`, !/เพิ่มไปยังหน้าจอโฮม/.test(txt), txt.slice(0, 90));
    ok(`ไลน์/${label} ไม่มีปุ่มติดตั้งปลอม`, (await p.$(".ib-yes")) === null);
    ok(`ไลน์/${label} ไม่มีปุ่มที่ต้องกดเพื่อรับทราบ`, (await p.$(".ib-no")) === null);
    ok(`ไลน์/${label} ไม่มี JS error`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ⚠️ ถ้าเบราว์เซอร์ในแอปดันติดตั้งได้จริง (ยิง event มา) ต้องขึ้นปุ่มติดตั้ง ไม่ใช่ไล่ออกไปข้างนอก
  const { ctx, p } = await open({ ua: LINE_AND });
  await p.waitForTimeout(300);
  await fire(p);
  await p.waitForTimeout(WAIT);
  const txt = await p.$eval("#installbar", (e) => e.textContent.replace(/\s+/g, " ")).catch(() => "");
  ok("ในแอปที่ติดตั้งได้จริง → ขึ้นปุ่มติดตั้ง ไม่ใช่ไล่ออกไปเบราว์เซอร์",
     !!(await p.$(".ib-yes")) && !/เปิดในเบราว์เซอร์/.test(txt), txt.slice(0, 80));
  await ctx.close();
}

console.log("\n[2c] iOS — บอกตำแหน่งปุ่มแชร์ให้ตรงเครื่อง");
{
  const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const CRIOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1";
  const cases = [
    ["iPhone + Safari", IOS_UA, /ด้านล่างของ Safari/],
    ["iPad + Safari",   IPAD,   /ด้านบนของ Safari/],   // iPad ปุ่มแชร์อยู่ด้านบน บอกล่างคือหาไม่เจอ
    ["iPhone + Chrome", CRIOS,  /ของเบราว์เซอร์/],      // ไม่ใช่ Safari ห้ามเรียกว่า Safari
  ];
  for (const [label, ua, want] of cases) {
    const { ctx, p } = await open({ ua });
    await p.waitForTimeout(WAIT);
    const txt = await p.$eval("#installbar", (e) => e.textContent.replace(/\s+/g, " ")).catch(() => "");
    ok(`${label} บอกตำแหน่งถูก`, want.test(txt), txt.slice(0, 90));
    ok(`${label} ยังบอกปลายทางว่าเพิ่มไปหน้าจอโฮม`, /เพิ่มไปยังหน้าจอโฮม/.test(txt), txt.slice(0, 90));
    await ctx.close();
  }
}

console.log("\n[2d] ⏱ ต้องหายเอง ไม่ต้องให้ใครกด");
{
  // 🎯 เจ้าของสั่ง 25 ส.ค. 2026: "[เข้าใจแล้ว] ต้องกด? ไม่เอา bad user experience"
  //    แถบนี้มาบอกข้อมูล ไม่ใช่มาถามคำถาม จึงห้ามค้างรอจนกว่าจะมีคนกด
  const { ctx, p, errs } = await open({ ua: IOS_UA });
  await p.waitForTimeout(WAIT);
  ok("ตอนแรกแถบขึ้นอยู่", !!(await p.$("#installbar")));
  // ⏱ เจ้าของกำหนด 6 วินาที — ห้ามวูบหายก่อนหน้านั้น และห้ามค้างเกิน
  await p.waitForTimeout(3000);
  ok("ผ่านไป 3 วิ ยังอยู่ (ห้ามวูบหาย)", !!(await p.$("#installbar")));
  await p.waitForTimeout(4500);
  ok("ครบ 6 วิ หายเอง โดยไม่มีใครกดอะไรเลย", (await p.$("#installbar")) === null);
  ok("หายเองไม่นับว่าไม่เอาถาวร (เขาอาจยังไม่ทันอ่าน)",
     (await p.evaluate(() => localStorage.getItem("installPromptDone"))) === null);
  ok("ไม่มี JS error", errs.length === 0, errs.join(" | "));
  await ctx.close();

  // ฝั่งที่มีปุ่มติดตั้งให้กด ก็ต้องหายเองเหมือนกัน
  const d = await open({ vp: { width: 1400, height: 900 } });
  await d.p.waitForTimeout(300);
  await fire(d.p);
  await d.p.waitForTimeout(WAIT);
  ok("เดสก์ท็อป: ตอนแรกแถบขึ้นอยู่", !!(await d.p.$("#installbar")));
  await d.p.waitForTimeout(6500); // นับจากตอนแถบโผล่ ไม่ใช่ตอนเปิดหน้า
  ok("เดสก์ท็อป: หายเองใน 6 วิเหมือนกัน", (await d.p.$("#installbar")) === null);
  await d.ctx.close();
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
  await s.p.click(".ib-x");
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
  ok("ตั้งเวลาหายเองไว้ 6 วินาทีตามที่เจ้าของกำหนด", /AUTO_HIDE_MS\s*=\s*6000/.test(js));
  const css = fs.readFileSync(new URL("../installprompt.css", import.meta.url), "utf8");
  ok("z-index ต่ำกว่า #updbar (9999)", /z-index:\s*9998/.test(css));
  ok("เว้นขอบล่างเผื่อ safe-area ของ iPhone", /safe-area-inset-bottom/.test(css));
  ok("มีสีของตัวเองทั้งโหมดสว่างและมืด", /prefers-color-scheme:\s*dark/.test(css));
}

console.log("\n[5] 🔑 service worker — ไม่มี fetch handler = Chrome/Edge ไม่ให้ติดตั้งเลย");
{
  // เจ้าของแจ้ง 25 ส.ค. 2026: "desktop ไม่ขึ้นอะไรเลย"
  // Chrome/Edge ไม่ยิง beforeinstallprompt ถ้า service worker ไม่มีตัวดัก fetch
  // → แถบของเราไม่มีวันขึ้นบนเดสก์ท็อป/Android ทั้งที่โค้ดฝั่งหน้าเว็บถูกหมด
  const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const code = sw.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  ok("sw.js มี fetch handler (เงื่อนไขที่เบราว์เซอร์บังคับ)", /addEventListener\(\s*["']fetch["']/.test(code));
  // 🚫 กฎข้อ 0 ของ sw.js — ดักแล้ว respondWith เคยทำให้ทั้งหน้าเปิดไม่ขึ้น (ERR_FAILED)
  ok("🚫 sw.js ห้ามเรียก respondWith เด็ดขาด", !/respondWith/.test(code), "เจอ respondWith ใน sw.js");
  const ver = (code.match(/SW_VERSION\s*=\s*(\d+)/) || [])[1];
  ok("bump SW_VERSION แล้ว (ไม่งั้นเบราว์เซอร์ไม่ติดตั้งตัวใหม่)", Number(ver) >= 6, "SW_VERSION=" + ver);

  // manifest ต้องครบตามที่เบราว์เซอร์บังคับ ไม่งั้นก็ไม่ให้ติดตั้งเหมือนกัน
  const mf = JSON.parse(fs.readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
  ok("manifest: มี name + start_url + display standalone",
     !!mf.name && !!mf.start_url && /standalone|fullscreen|minimal-ui/.test(mf.display || ""));
  for (const size of ["192x192", "512x512"]) {
    ok(`manifest: มีไอคอน ${size}`, (mf.icons || []).some((i) => (i.sizes || "").includes(size)));
  }
  for (const f of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
    ok(`มีไฟล์ ${f} จริง`, fs.existsSync(new URL("../" + f, import.meta.url)));
  }
}

console.log("\n" + (fail ? "❌ ตก" : "✅ ผ่านหมด") + " — ผ่าน " + pass + " · ตก " + fail + "\n");
await browser.close();
process.exit(fail ? 1 : 0);
