/* 🎨 คลังข่าวปลาหมอคางดำ — หน้าตาใหม่ (เจ้าของสั่ง 18 ก.ย. 2026 พร้อม mockup)
 *
 * 🚫 **"เฉพาะปลาหมอ"** — หน้าคลังหลักต้องไม่เปลี่ยนแม้แต่นิดเดียว (ข้อ [7])
 *
 * สิ่งที่เทสต์นี้คุม
 *   [1] โครงหน้า — dropdown เลือกคลัง · แถบซ้าย · บรรทัดแนะนำ · ปุ่มเรียงลำดับ · ตรึงโหมดสว่าง
 *   [2] การ์ด 3 ปุ่ม (คัดลอกลิงก์ / พิมพ์ / อ่านข่าว) — **ทุกปุ่มเปิดแท็บใหม่** และปุ่มไอคอนมี aria-label
 *   [3] คัดลอกลิงก์ → ขึ้นแถบแจ้ง "คัดลอกแล้ว"
 *   [4] เรียงลำดับสลับได้ และเข้า URL
 *   [5] 🔗 **รวมข่าวเรื่องเดียวกันที่หลายสำนักลง** + 2 กับดักที่ห้ามพลาด
 *   [6] 📱 จอแคบ — ชิปแถวเดียว · แผ่นตัวกรองล่าง · เหลือที่อ่าน ≥ ⅓ จอ · ปุ่ม ≥44px
 *   [7] 🚫 หน้าคลังหลักต้องไม่เปลี่ยน
 *   [8] ด่านระดับโค้ด
 *
 * ⚠️ ปลอมไฟล์คลังด้วย page.route — ที่วัดคือ "โค้ดวาด/รวมถูกไหม" ไม่ใช่ "ข่าวจริงรวมถูกไหม"
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
const V2CSS = fs.readFileSync(new URL("../archives/v2.css", import.meta.url), "utf8");
const BC = fs.readFileSync(new URL("../archives/blackchin.html", import.meta.url), "utf8");
const IDX = fs.readFileSync(new URL("../archives/index.html", import.meta.url), "utf8");

const DAY = 864e5;
const T0 = Date.parse("2026-09-17T10:00:00+07:00");

/** คลังปลอม — rows = [{t, o, u, ts}] · ts เป็นมิลลิวินาที */
function fake(page, rows) {
  const outs = [...new Set(rows.map((r) => r.o))];
  return page.route("**/archives/data-blackchin/*.json", (route) => {
    const u = route.request().url();
    const body = u.endsWith("index.json")
      ? { generatedAt: "2026-09-18T00:00:00.000Z", total: rows.length, noDate: 0, years: [{ y: 2026, n: rows.length }] }
      : {
          o: outs, c: [],
          r: rows.map((r) => [r.t, r.u, Math.round(r.ts / 1000), outs.indexOf(r.o), []]),
        };
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

/** ข่าว 1 ใบแบบสั้นๆ */
const N = (t, o, ts, u) => ({ t, o, ts, u: u || `https://www.${o}.example/news/${encodeURIComponent(t.slice(0, 8))}` });

const open = async (browser, rows, { w = 1280, h = 950, qs = "?mode=kw" } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await fake(p, rows);
  await p.goto(`${BASE}/archives/blackchin.html${qs}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(450);
  return { ctx, p, errs };
};

const PLAIN = [
  N("ศาลอุทธรณ์รับฟ้องคดีปลาหมอคางดำเป็นคดีแบบกลุ่ม นัดพิจารณาต่อเดือนหน้า", "thairath", T0),
  N("กรมประมงเปิดจุดรับซื้อปลาหมอคางดำเพิ่มอีกสามจังหวัดริมอ่าวไทย", "matichon", T0 - DAY),
  N("นักวิจัยจุฬาเผยผลตรวจดีเอ็นเอปลาหมอคางดำจากตัวอย่างปลาดองปีล่าสุด", "dailynews", T0 - 2 * DAY),
];

const browser = await launch();

// ── [1] โครงหน้า ──────────────────────────────────────────────────
console.log("\n[1] โครงหน้าใหม่");
{
  const { ctx, p, errs } = await open(browser, PLAIN);
  ok("มี dropdown เลือกคลังในหัวหน้า", await p.$("#corpus") !== null);
  ok("มีป้ายบอกที่มาข้อมูล", /เฉพาะข่าวเชิงบวก/.test(await p.$eval(".vnote", (e) => e.textContent)));
  ok("มีบรรทัดแนะนำวิธีใช้ (คลิกหัวข่าว / ปุ่มพิมพ์)",
     /อ่านข่าว/.test(await p.$eval(".vtip", (e) => e.textContent)) &&
     /Ctrl\+P/.test(await p.$eval(".vtip", (e) => e.textContent)));
  ok("มีปุ่มเรียงลำดับ และตั้งต้นเป็น 'ล่าสุด'",
     /ล่าสุด/.test(await p.$eval("#sortbtn", (e) => e.textContent)), await p.$eval("#sortbtn", (e) => e.textContent));
  // 🖥 จอกว้าง: หมวดกับตัวกรองอยู่คอลัมน์ซ้าย · ปุ่มตัวกรองไม่ต้องมี
  const lay = await p.evaluate(() => {
    const g = document.querySelector("#gtabs").getBoundingClientRect();
    const m = document.querySelector(".vmain").getBoundingClientRect();
    return { gRight: Math.round(g.right), mLeft: Math.round(m.left),
             ftoggle: getComputedStyle(document.querySelector("#ftoggle")).display,
             filters: getComputedStyle(document.querySelector("#filters")).display };
  });
  ok("จอกว้าง: หมวดอยู่ซ้ายของเนื้อหา", lay.gRight <= lay.mLeft, JSON.stringify(lay));
  ok("จอกว้าง: ตัวกรองกางอยู่ในแถบซ้าย ไม่ต้องกดปุ่ม", lay.filters !== "none" && lay.ftoggle === "none",
     JSON.stringify(lay));
  ok("จัดกลุ่มตามวันที่", (await p.$$eval(".daygroup", (n) => n.length)) === 3,
     String(await p.$$eval(".daygroup", (n) => n.length)));
  // 🔒 ตรึงโหมดสว่าง — เจ้าของเลือกเอง (ชุดสีที่ให้มามีแต่ชุดสว่าง)
  const dark = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
  const dp = await dark.newPage();
  await fake(dp, PLAIN);
  await dp.goto(`${BASE}/archives/blackchin.html?mode=kw`, { waitUntil: "networkidle" });
  await dp.waitForTimeout(300);
  const bg = await dp.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok("เครื่องตั้งโหมดมืด หน้านี้ยังสว่าง", bg === "rgb(244, 245, 247)", bg);
  await dark.close();
  ok("🚫 ไม่มี error หลุดออกมา", errs.length === 0, JSON.stringify(errs));
  await ctx.close();
}

// ── [2] ปุ่มบนการ์ด ───────────────────────────────────────────────
console.log("\n[2] การ์ด 3 ปุ่ม");
{
  const { ctx, p } = await open(browser, PLAIN);
  const acts = await p.$$eval(".item:first-of-type .acts > *", (n) => n.map((e) => ({
    tag: e.tagName, txt: e.textContent.trim(), href: e.getAttribute("href") || "",
    target: e.getAttribute("target") || "", rel: e.getAttribute("rel") || "",
    aria: e.getAttribute("aria-label") || "",
  })));
  ok("มี 3 ปุ่มต่อการ์ด", acts.length === 3, JSON.stringify(acts.map((a) => a.txt)));
  ok("ปุ่มคัดลอกลิงก์เป็น <button> และมี aria-label",
     acts[0].tag === "BUTTON" && acts[0].aria === "คัดลอกลิงก์", JSON.stringify(acts[0]));
  // 🖨 สั่ง print หน้าเว็บของสื่ออื่นไม่ได้ (ข้ามโดเมน) — จึงเปิดแท็บใหม่อย่างเดียว
  ok("ปุ่มพิมพ์เปิดแท็บใหม่เท่านั้น มี aria-label",
     acts[1].tag === "A" && acts[1].target === "_blank" && /noopener/.test(acts[1].rel) && acts[1].aria === "พิมพ์",
     JSON.stringify(acts[1]));
  ok("ปุ่มอ่านข่าวเปิดแท็บใหม่", acts[2].txt === "อ่านข่าว" && acts[2].target === "_blank" && /noopener/.test(acts[2].rel),
     JSON.stringify(acts[2]));
  ok("หัวข่าวก็เปิดแท็บใหม่",
     await p.$eval(".item a.t", (e) => e.target === "_blank" && /noopener/.test(e.rel)));
  ok("🚫 ไม่มีการโหลดรูปจากเว็บนอก (หน้านี้อยู่หลังล็อกอิน)",
     (await p.$$eval(".item img", (n) => n.length)) === 0);
  ok("ยังมีรูปเล็กประจำเว็บเหมือนเดิม (เจ้าของสั่งให้เก็บไว้)",
     (await p.$$eval(".item .thumb", (n) => n.length)) === 3);
  // ⚠️ วันที่ต้องไม่มีเวลา
  ok("วันที่บนการ์ดไม่มีเวลา", !/\d{2}:\d{2}/.test(await p.$eval(".item .dt", (e) => e.textContent)),
     await p.$eval(".item .dt", (e) => e.textContent));
  const small = await p.$$eval(".acts > *, #sortbtn, .vsel select", (n) => n
    .map((e) => ({ c: e.className, r: e.getBoundingClientRect() }))
    .filter((x) => x.r.width && (x.r.width < 44 || x.r.height < 44))
    .map((x) => `${x.c}:${Math.round(x.r.width)}x${Math.round(x.r.height)}`));
  ok("ทุกปุ่มไม่เล็กกว่า 44×44px", small.length === 0, JSON.stringify(small));
  await ctx.close();
}

// ── [3] คัดลอกลิงก์ → แถบแจ้ง ─────────────────────────────────────
console.log("\n[3] คัดลอกลิงก์");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 },
    permissions: ["clipboard-read", "clipboard-write"] });
  const p = await ctx.newPage();
  await fake(p, PLAIN);
  await p.goto(`${BASE}/archives/blackchin.html?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  ok("ยังไม่กด แถบแจ้งต้องซ่อนอยู่", await p.$eval("#toast", (e) => e.hidden));
  await p.click(".item:first-of-type .acts .copy");
  await p.waitForTimeout(250);
  ok("กดแล้วขึ้นว่า 'คัดลอกแล้ว'",
     !(await p.$eval("#toast", (e) => e.hidden)) && /คัดลอกแล้ว/.test(await p.$eval("#toast", (e) => e.textContent)),
     await p.$eval("#toast", (e) => e.textContent));
  // ♿ คนใช้ screen reader ต้องได้ยินด้วย
  ok("แถบแจ้งประกาศให้ screen reader", await p.$eval("#toast", (e) => e.getAttribute("aria-live") === "polite"));
  ok("คัดลอกได้ค่าที่ถูกต้องจริง",
     (await p.evaluate(() => navigator.clipboard.readText())) === PLAIN[0].u);
  await ctx.close();
}

// ── [4] เรียงลำดับ ────────────────────────────────────────────────
console.log("\n[4] เรียงลำดับ");
{
  const { ctx, p } = await open(browser, PLAIN);
  const first = () => p.$eval(".item a.t", (e) => e.textContent.trim());
  ok("ตั้งต้นล่าสุดก่อน", (await first()).includes("ศาลอุทธรณ์รับฟ้อง"), await first());
  await p.click("#sortbtn");
  await p.waitForTimeout(250);
  ok("กดแล้วเก่าสุดขึ้นก่อน", (await first()).includes("นักวิจัยจุฬา"), await first());
  ok("ปุ่มเปลี่ยนคำตาม", /เก่าสุด/.test(await p.$eval("#sortbtn", (e) => e.textContent)));
  ok("เข้า URL ด้วย (ส่งลิงก์ต่อได้)", /[?&]sort=old\b/.test(await p.evaluate(() => location.search)),
     await p.evaluate(() => location.search));
  await p.goBack();
  await p.waitForTimeout(300);
  ok("กด back แล้วกลับไปล่าสุดก่อน", (await first()).includes("ศาลอุทธรณ์รับฟ้อง"), await first());
  await ctx.close();
}

/* ── [5] 🔗 รวมข่าวเรื่องเดียวกันที่หลายสำนักลง ────────────────────
 *
 * เจ้าของสั่ง 18 ก.ย. 2026: **"ถ้าเป็นข่าวเดียวกันหลายสำนัก ให้ทำเป็นรวมกันแบบในรูป"**
 * ⚠️ ชีตยังไม่มีคอลัมน์ "ประเด็น" จึงต้องเดาจากพาดหัว — เจ้าของอนุมัติแล้ว
 *
 * 2 กับดักที่ต้องคุมไว้ตลอด (เจอจริงตอนวัดกับข่าว 365 ใบ)
 *   ก. **พาดหัวสั้นกลืนพาดหัวยาว** — "ศูนย์แก้ไขปัญหาปลาหมอคางดำ" เคยดูดข่าวคนละเรื่อง 7 ใบเข้ามา
 *   ข. **คนละวันห้ามรวม** — พาดหัวคล้ายกันข้ามสัปดาห์มักเป็นคนละเหตุการณ์
 */
console.log("\n[5] รวมข่าวเรื่องเดียวกัน");
{
  const rows = [
    N("สุริยะตั้งศูนย์อำนวยการแก้ปัญหาปลาหมอคางดำ ยกเป็นวาระแห่งชาติเร่งด่วน", "thairath", T0),
    N("สุริยะ ตั้งศูนย์อำนวยการแก้ปัญหาปลาหมอคางดำ ยกเป็นวาระแห่งชาติ เร่งด่วน", "matichon", T0 - 3600e3),
    N("'สุริยะ'ตั้งศูนย์อำนวยการฯแก้ปัญหาปลาหมอคางดำ ยกเป็นวาระแห่งชาติเร่งด่วน", "dailynews", T0 - 7200e3),
    // ก. พาดหัวสั้นที่เป็นชิ้นส่วนของอันบน — **ห้ามถูกยุบรวม**
    N("ศูนย์อำนวยการแก้ปัญหาปลาหมอคางดำ", "khaosod", T0 - 5400e3),
    // ข. พาดหัวเหมือนกันเป๊ะแต่ห่างกัน 6 วัน — **ห้ามรวม**
    N("สุริยะตั้งศูนย์อำนวยการแก้ปัญหาปลาหมอคางดำ ยกเป็นวาระแห่งชาติเร่งด่วน", "posttoday", T0 - 6 * DAY),
  ];
  const { ctx, p, errs } = await open(browser, rows);

  const cards = await p.$$eval(".item", (n) => n.length);
  const same = await p.$$eval(".same", (n) => n.map((x) => ({
    outs: [...x.querySelectorAll("a")].map((a) => a.textContent.trim()),
    hrefs: [...x.querySelectorAll("a")].map((a) => a.getAttribute("href")),
    target: [...x.querySelectorAll("a")].every((a) => a.target === "_blank"),
    tips: [...x.querySelectorAll("a")].map((a) => a.getAttribute("title") || ""),
  })));
  ok("3 สำนักลงเรื่องเดียวกัน → เหลือการ์ดเดียว", cards === 3, `การ์ด ${cards} ใบ`);
  ok("มีบรรทัด 'ข่าวเดียวกับ' 1 ที่", same.length === 1, JSON.stringify(same));
  ok("บรรทัดนั้นขึ้นชื่อสำนักครบทั้ง 2 เจ้าที่ถูกยุบ",
     same[0] && same[0].outs.length === 2, JSON.stringify(same[0]?.outs));
  /* 🚫 **ห้ามซ่อนข่าวที่ถูกยุบแบบไม่มีร่องรอย** — ทุกชื่อต้องกดไปอ่านได้จริง
     นี่คือเหตุผลเดียวที่ยอมให้เดาจากพาดหัวทั้งที่ชีตยังไม่มีคอลัมน์ "ประเด็น" */
  ok("ทุกชื่อสำนักกดไปอ่านข่าวนั้นได้จริง",
     same[0] && same[0].hrefs.every((h) => rows.some((r) => r.u === h)) && same[0].target,
     JSON.stringify(same[0]?.hrefs));
  ok("เอาเมาส์ชี้แล้วเห็นพาดหัวของสำนักนั้น", same[0] && same[0].tips.every((t) => t.length > 10),
     JSON.stringify(same[0]?.tips));
  const titles = await p.$$eval(".item a.t", (n) => n.map((e) => e.textContent.trim()));
  ok("ก. 🚫 พาดหัวสั้นไม่ถูกกลืนหายไป",
     titles.some((t) => t === "ศูนย์อำนวยการแก้ปัญหาปลาหมอคางดำ"), JSON.stringify(titles));
  ok("ข. 🚫 พาดหัวเดียวกันแต่คนละสัปดาห์ ไม่ถูกรวม",
     titles.filter((t) => t.includes("ยกเป็นวาระแห่งชาติ")).length === 2, JSON.stringify(titles));
  ok("บรรทัดนับบอกว่ารวมแล้วเหลือกี่เรื่อง",
     /รวมข่าวเนื้อหาซ้ำแล้วเหลือ 3 เรื่อง/.test(await p.$eval("#count", (e) => e.textContent)),
     (await p.$eval("#count", (e) => e.textContent)).trim());
  ok("🚫 ไม่มี error หลุดออกมา", errs.length === 0, JSON.stringify(errs));
  await ctx.close();
}

// ── [6] 📱 จอแคบ ──────────────────────────────────────────────────
console.log("\n[6] 📱 จอแคบ");
{
  const { ctx, p } = await open(browser, PLAIN, { w: 390, h: 780 });
  const m = await p.evaluate(() => {
    const bar = document.querySelector("#gtabs"), one = document.querySelector(".gtab");
    const list = document.querySelector("#list").getBoundingClientRect();
    return {
      barH: Math.round(bar.getBoundingClientRect().height),
      tabH: Math.round(one.getBoundingClientRect().height),
      scrollable: bar.scrollWidth > bar.clientWidth,
      wide: document.scrollingElement.scrollWidth > innerWidth,
      read: Math.round(innerHeight - list.top), vh: innerHeight,
      ftoggle: getComputedStyle(document.querySelector("#ftoggle")).display,
      sheetHidden: document.querySelector("#filters").hidden,
    };
  });
  ok("หมวดเป็นชิปแถวเดียว ไม่ตกบรรทัด", m.barH <= m.tabH + 14, `แถบ ${m.barH} · ชิป ${m.tabH}`);
  ok("เลื่อนชิปซ้ายขวาได้", m.scrollable);
  ok("🚫 หน้าไม่กว้างเกินจอ", !m.wide);
  ok("เหลือที่อ่านข่าว ≥ ⅓ จอ", m.read >= m.vh / 3, `${m.read} / ${m.vh}`);
  // 🚫 ตัวกรองต้องพับไว้เสมอตอนเปิดหน้า (กฎเดิมของหน้านี้ ยังใช้อยู่บนจอแคบ)
  ok("เปิดหน้ามาตัวกรองพับไว้ และมีปุ่มเปิด", m.sheetHidden && m.ftoggle !== "none", JSON.stringify(m));

  await p.click("#ftoggle");
  await p.waitForTimeout(300);
  const sheet = await p.evaluate(() => {
    const f = document.querySelector("#filters"), r = f.getBoundingClientRect();
    return { pos: getComputedStyle(f).position, bottom: Math.round(r.bottom), vh: innerHeight,
             h: Math.round(r.height) };
  });
  ok("กดแล้วเป็นแผ่นเลื่อนขึ้นจากล่าง", sheet.pos === "fixed" && sheet.bottom >= sheet.vh - 2, JSON.stringify(sheet));
  ok("แผ่นไม่กินจอทั้งหน้า", sheet.h <= sheet.vh * 0.8, `${sheet.h} / ${sheet.vh}`);
  await p.click("#fclose");
  await p.waitForTimeout(250);
  ok("กดปิดแล้วพับกลับ", await p.$eval("#filters", (e) => e.hidden));
  // 📱 ปุ่มคัดลอก/พิมพ์เหลือแต่ไอคอน — **ต้องมี aria-label** ไม่งั้นคนใช้ screen reader ไม่รู้ว่าปุ่มอะไร
  const icons = await p.$$eval(".item:first-of-type .acts .ico", (n) => n.map((e) => ({
    shown: e.textContent.replace(/\s/g, ""), aria: e.getAttribute("aria-label") || "",
    lbl: getComputedStyle(e.querySelector(".lbl")).display,
  })));
  ok("ปุ่มไอคอนซ่อนคำกำกับแต่ยังมี aria-label ครบ",
     icons.length === 2 && icons.every((i) => i.lbl === "none" && i.aria.length > 2), JSON.stringify(icons));
  await ctx.close();
}

// ── [7] 🚫 หน้าคลังหลักต้องไม่เปลี่ยน ─────────────────────────────
console.log("\n[7] 🚫 หน้าคลังหลักต้องไม่เปลี่ยน");
{
  ok("index.html ไม่โหลด v2.css", !/v2\.css/.test(IDX));
  ok("index.html ไม่ติดคลาส v2", !/<body class="v2"/.test(IDX));
  ok("index.html ยังใช้แถบแท็บเดิม ไม่มี dropdown", /class="pgtabs"/.test(IDX) && !/id="corpus"/.test(IDX));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  await p.route("**/archives/data/*.json", (route) => {
    const u = route.request().url();
    const body = u.endsWith("index.json")
      ? { generatedAt: "2026-09-18T00:00:00.000Z", total: 1, noDate: 0, years: [{ y: 2026, n: 1 }] }
      : { o: ["ไทยรัฐ"], c: [], r: [["ข่าวทดสอบหน้าคลังหลัก", "https://x.co/1", Math.round(T0 / 1000), 0, []]] };
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await p.goto(`${BASE}/archives/?mode=kw`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  ok("หน้าคลังหลักไม่มีแถบซ้าย/ปุ่ม 3 ปุ่ม/แถบแจ้ง",
     (await p.$$eval(".acts, .daygroup, #toast, #sortbtn, #corpus", (n) => n.length)) === 0);
  ok("หน้าคลังหลักยังใช้ปุ่ม 'คัดลอก' แบบเดิม",
     (await p.$$eval(".item .copy", (n) => n.length)) === 1);
  ok("หน้าคลังหลักไม่รวมข่าวซ้ำ", (await p.$$eval(".same", (n) => n.length)) === 0);
  await ctx.close();
}

// ── [8] ด่านระดับโค้ด ─────────────────────────────────────────────
console.log("\n[8] ด่านระดับโค้ด");
{
  ok("หน้าตาใหม่เปิดด้วยคลาส v2 เท่านั้น", /const V2 = document\.body\.classList\.contains\("v2"\)/.test(APP));
  ok("blackchin.html โหลด v2.css", /v2\.css/.test(BC) && /<body class="v2">/.test(BC));
  /* 🚫 **ห้ามก๊อป app.js ไปเป็นไฟล์ที่สอง** — กฎเดิมของหน้านี้ (แก้ที่เดียวได้ทั้ง 2 หน้า) */
  ok("🚫 ยังใช้ app.js ไฟล์เดียวทั้ง 2 หน้า",
     /src="app\.js\?v=\d+"/.test(BC) && /src="app\.js\?v=\d+"/.test(IDX) &&
     !fs.existsSync(new URL("../archives/app2.js", import.meta.url)));
  // 🐞 กับดักที่เจอจริง: พาดหัวสั้นกลืนพาดหัวยาว ถ้าไม่มี 2 ด่านนี้
  ok("มีด่านกันพาดหัวสั้นกลืนพาดหัวยาว",
     /small\.size < SAME_MIN_GRAMS/.test(APP) && /small\.size \/ big\.size < SAME_RATIO/.test(APP));
  ok("รวมข่าวเฉพาะที่วันใกล้กัน", /SAME_DAYS \* 864e5\) break/.test(APP));
  /* 🧭 renderTabs เลื่อนแท็บด้วย offsetLeft — แถบต้องเป็น position:relative ไม่งั้นเลื่อนผิดที่ */
  ok("แถบชิปหมวดเป็น position:relative", /body\.v2 #gtabs \{[^}]*position:relative/.test(V2CSS));
  // 🔒 ตรึงสว่าง — ต้องประกาศซ้ำในบล็อกโหมดมืดด้วย ไม่งั้น styles.css ชนะ
  ok("ตรึงโหมดสว่างไว้ในบล็อก prefers-color-scheme: dark ด้วย",
     /@media \(prefers-color-scheme: dark\) \{\s*:root \{[^}]*--plane:#F4F5F7/.test(V2CSS));
  ok("🚫 แผ่นตัวกรองตกบรรทัดไม่ได้บนจอแคบ (ต้องเป็น fixed)",
     /@media \(max-width:767\.98px\) \{[\s\S]*?body\.v2 \.filters \{[^}]*position:fixed/.test(V2CSS));
  ok("แบ่งหน้านับเป็น 'เรื่อง' ไม่ใช่ 'ใบ' เมื่อรวมข่าวแล้ว",
     /state\.shown >= \(V2 && groups \? groups\.length : filtered\.length\)/.test(APP));
}

await browser.close();
console.log(`\n${fail ? "❌ ตก" : "✅ ผ่านหมด"} — ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
