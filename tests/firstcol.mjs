/* คอลัมน์แรกต้องมาก่อน — โดยเฉพาะบนมือถือที่เห็นทีละคอลัมน์
 *
 * 🎯 เจ้าของสั่ง 25 ส.ค. 2026: "mobile ควรโหลด column แรกก่อนเป็นอันดับแรก"
 *
 * ที่วัดเจอตอนนั้น (Performance API ของจริง ไม่ใช่ประมาณเอา):
 *    44 ms  /api/flags       ← สถานะปุ่ม ⚑/🗂 ไม่มีใครนั่งรอ แต่ออกตัวก่อน
 *    99 ms  /api/trend/feeds ← ข่าวของคอลัมน์แรก คือของที่ผู้ใช้จ้องอยู่
 * แก้ 2 จุด: ยิง feeds ตั้งแต่ใน <head> · ให้ flags รอ feeds ออกตัวไปก่อน
 *
 * ⚠️ ตัวที่ยิงไว้ล่วงหน้าใน <head> **ล้มเหลวได้** ต้องมีทางถอยเสมอ ไม่งั้นพิมพ์ URL
 *    ผิดที่เดียวในไฟล์ HTML จะทำให้ทั้งหน้าขึ้น "ดึงข้อมูลไม่สำเร็จ" โดยไม่เคยลองยิงเอง
 */
import fs from "node:fs";
import { launch } from "./browser.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8899";
const MOBILE = { width: 390, height: 780 };

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra ? " → " + extra : "")); }
};

const PAGES = [
  { path: "/trend/", feeds: "/api/trend/feeds", first: "news" },
  { path: "/ir/",    feeds: "/api/ir/feeds",    first: "newsth" },
  { path: "/issue/", feeds: "/api/trend/feeds", first: "news" },
];

const body = (extra = {}) => JSON.stringify({
  sources: {
    news:   { items: [{ id: "1", title: "ข่าวคอลัมน์แรก", link: "https://a/1", at: new Date().toISOString() }] },
    newsth: { items: [{ id: "1", title: "ข่าวคอลัมน์แรก", link: "https://a/1", at: new Date().toISOString() }] },
    alert1: { items: [] }, alert2: { items: [] },
  },
  items: [], trends: [], generatedAt: Date.now(), ...extra,
});

const browser = await launch();

/** เปิดหน้าแล้วคืนลำดับคำขอ /api/ ที่วัดได้จริงจาก Performance API */
async function timeline(path, o = {}) {
  const ctx = await browser.newContext({ viewport: o.vp || MOBILE });
  const hits = [];
  await ctx.route("**/api/**", async (r) => {
    const u = new URL(r.request().url()).pathname;
    hits.push(u);
    if (o.failFeeds && u.includes("feeds") && hits.filter((h) => h === u).length === 1) {
      return r.fulfill({ status: 500, contentType: "text/plain", body: "boom" });
    }
    await new Promise((res) => setTimeout(res, o.delay ?? 400));
    r.fulfill({ status: 200, contentType: "application/json", body: body() });
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(BASE + path, { waitUntil: "load" });
  await p.waitForTimeout(o.wait ?? 3000);
  const marks = await p.evaluate(() =>
    performance.getEntriesByType("resource")
      .filter((e) => e.name.includes("/api/"))
      .map((e) => ({ n: new URL(e.name).pathname, start: Math.round(e.startTime), end: Math.round(e.responseEnd) }))
      .sort((a, b) => a.start - b.start));
  // เวลาที่ HTML อ่านจบ — ใช้เป็นเส้นแบ่งว่า "ยิงตั้งแต่ใน <head>" หรือ "ยิงหลัง app.js ทำงาน"
  const domReady = await p.evaluate(() =>
    Math.round(performance.getEntriesByType("navigation")[0].domContentLoadedEventStart));
  return { ctx, p, marks, hits, errs, domReady };
}

console.log("\n[1] มือถือ — คำขอของคอลัมน์แรกต้องออกตัวก่อนเสมอ");
for (const g of PAGES) {
  const { ctx, marks, errs, domReady } = await timeline(g.path);
  const feeds = marks.find((m) => m.n === g.feeds);
  const flags = marks.find((m) => m.n === "/api/flags");
  ok(`${g.path} ยิงคำขอของคอลัมน์แรกจริง`, !!feeds, JSON.stringify(marks));
  // ⚠️ หัวใจของข้อนี้: ห้ามมีคำขออื่นออกตัวก่อนคอลัมน์แรก
  ok(`${g.path} คอลัมน์แรกออกตัวเป็นคำขอแรกสุด`,
     !!feeds && marks[0].n === g.feeds, marks.map((m) => `${m.start}ms ${m.n}`).join(" · "));
  // ⚠️ แค่ "ออกตัวทีหลัง" ยังไม่พอ — ต้องไม่แย่งเน็ตกันด้วย
  //    คำขอ flags ต้องรอจน feeds ได้ข้อมูลกลับมาแล้ว (after: bootFeeds)
  //    ถ้าถอด after ออก flags จะออกตัวตอน Flags.init() คือ "ระหว่างที่ feeds ยังบินอยู่"
  ok(`${g.path} สถานะปุ่ม (flags) ไม่แย่งเน็ตระหว่างที่คอลัมน์แรกยังโหลดอยู่`,
     !!flags && flags.start >= feeds.end - 5,
     `feeds ${feeds && feeds.start}→${feeds && feeds.end}ms · flags เริ่ม ${flags && flags.start}ms`);
  // ⚠️ **ห้ามวัดด้วยตัวเลขตายตัว** (เคยตั้ง < 60ms แล้วตกตอนเครื่องโหลดหนัก — 87ms ทั้งที่ถูกต้อง)
  //    สิ่งที่ตั้งใจวัดจริงๆ คือ "ยิงตั้งแต่ตอน HTML ยังอ่านไม่จบ" ไม่ใช่ "ยิงภายในกี่มิลลิวินาที"
  //    สคริปต์ใน <head> ทำงานระหว่าง parse · app.js อยู่ท้าย body ทำงานหลัง DOMContentLoaded
  //    เทียบกับเส้นนี้จึงถูกต้องเสมอไม่ว่าเครื่องจะเร็วหรือช้า
  ok(`${g.path} ยิงตั้งแต่ HTML ยังอ่านไม่จบ (ไม่ได้รอ app.js)`,
     feeds.start < domReady, `feeds ${feeds.start}ms · HTML อ่านจบ ${domReady}ms`);
  ok(`${g.path} ไม่มี JS error`, errs.length === 0, errs.join(" | "));
  await ctx.close();
}

console.log("\n[2] คอลัมน์แรกต้องมีข่าวจริง ไม่ใช่ค้างไอคอนหมุน");
for (const g of PAGES) {
  const { ctx, p, errs } = await timeline(g.path, { delay: 200, wait: 2500 });
  const txt = await p.$eval(`.panel[data-source="${g.first}"] [data-list]`, (e) => e.textContent).catch(() => "");
  ok(`${g.path} คอลัมน์แรกมีข่าว`, txt.includes("ข่าวคอลัมน์แรก"), txt.slice(0, 60));
  ok(`${g.path} ไม่ค้างข้อความรอ`, !/กำลังดึงข้อมูล/.test(txt), txt.slice(0, 60));
  ok(`${g.path} ไม่มี JS error`, errs.length === 0, errs.join(" | "));
  await ctx.close();
}

console.log("\n[3] ⚠️ คำขอที่ยิงล่วงหน้าล้มเหลว ต้องยิงใหม่ ห้ามยอมแพ้");
for (const g of PAGES) {
  // รอบแรกตอบ 500 (จำลอง URL ใน HTML ไม่ตรง / เน็ตสะดุด) — app.js ต้องยิงเองอีกรอบ
  const { ctx, p, hits, errs } = await timeline(g.path, { failFeeds: true, delay: 150, wait: 3000 });
  const n = hits.filter((h) => h === g.feeds).length;
  ok(`${g.path} ยิงซ้ำเองหลังรอบแรกพัง`, n >= 2, "ยิงไป " + n + " ครั้ง");
  const txt = await p.$eval(`.panel[data-source="${g.first}"] [data-list]`, (e) => e.textContent).catch(() => "");
  ok(`${g.path} สุดท้ายได้ข่าวจริง ไม่ใช่ "ดึงข้อมูลไม่สำเร็จ"`, txt.includes("ข่าวคอลัมน์แรก"), txt.slice(0, 70));
  ok(`${g.path} ไม่มี JS error`, errs.length === 0, errs.join(" | "));
  await ctx.close();
}

console.log("\n[4] กดปุ่ม 🔄 ต้องได้ของใหม่ ไม่ใช่ของที่ยิงไว้ตอนเปิดหน้า");
{
  const g = PAGES[0];
  const ctx = await browser.newContext({ viewport: MOBILE });
  let round = 0;
  await ctx.route("**/api/**", async (r) => {
    const u = new URL(r.request().url()).pathname;
    if (u !== g.feeds) return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    round++;
    const t = round === 1 ? "ข่าวรอบแรก" : "ข่าวรอบใหม่";
    await new Promise((res) => setTimeout(res, 120));
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ sources: { news: { items: [{ id: String(round), title: t, link: "https://a/" + round, at: new Date().toISOString() }] },
        alert1: { items: [] }, alert2: { items: [] } }, items: [], trends: [], generatedAt: Date.now() }) });
  });
  const p = await ctx.newPage();
  await p.goto(BASE + g.path, { waitUntil: "load" });
  await p.waitForTimeout(1200);
  await p.click("#refresh");
  await p.waitForTimeout(1500);
  const txt = await p.$eval('.panel[data-source="news"] [data-list]', (e) => e.textContent);
  ok("กดรีเฟรชแล้วได้ข้อมูลรอบใหม่", txt.includes("ข่าวรอบใหม่"), txt.slice(0, 60));
  ok("ยิง feeds มากกว่า 1 ครั้ง (ไม่ได้ใช้ของเก่าซ้ำ)", round >= 2, "ยิงไป " + round + " ครั้ง");
  await ctx.close();
}

console.log("\n[5] ระดับโค้ด — กฎที่ห้ามหลุด");
{
  for (const g of PAGES) {
    const html = fs.readFileSync(new URL(".." + g.path + "index.html", import.meta.url), "utf8");
    const head = html.slice(0, html.indexOf("</head>"));
    ok(`${g.path} ยิง feeds ตั้งแต่ใน <head>`, head.includes("__bootFeeds") && head.includes(g.feeds));
    // ⚠️ ต้องอยู่ก่อน <script src=...app.js> ไม่งั้นไม่ได้อะไรเลย
    ok(`${g.path} อยู่ก่อน app.js`, html.indexOf("__bootFeeds") < html.indexOf("app.js?v="));
  }
  for (const [f, ep] of [["trend/app.js", "/api/trend/feeds"], ["ir/app.js", "/api/ir/feeds"], ["issue/app.js", "/api/trend/feeds"]]) {
    const js = fs.readFileSync(new URL("../" + f, import.meta.url), "utf8").split("\n")
      .filter((l) => !l.trim().startsWith("//")).join("\n");
    ok(`${f} รับของที่ยิงไว้ใน <head>`, js.includes("window.__bootFeeds"));
    ok(`${f} มีทางถอยเมื่อของที่ยิงล่วงหน้าพัง`, /async function fetchFeeds\(\)[\s\S]{0,300}catch[\s\S]{0,200}fetch\(FEEDS_EP\)/.test(js));
    ok(`${f} URL เขียนที่เดียวใน app.js`, (js.match(new RegExp('fetch\\("' + ep + '"', "g")) || []).length === 0);
    ok(`${f} ให้ flags รอ feeds ก่อน (after:)`, /Flags\.init\(\{[^}]*after: bootFeeds/.test(js));
  }
  // /admin/ ไม่ส่ง after: — ที่นั่น flag คือเนื้อหาของหน้า ต้องยิงทันทีเหมือนเดิม
  const admin = fs.readFileSync(new URL("../admin/app.js", import.meta.url), "utf8");
  ok("/admin/ ยังยิง flags ทันที (ไม่ได้ส่ง after)", !/Flags\.init\(\{[\s\S]{0,300}after:/.test(admin));
  const flags = fs.readFileSync(new URL("../flags.js", import.meta.url), "utf8");
  ok("flags.js: ไม่ส่ง after มา = ยิงทันทีเหมือนเดิม", /else\s*\{\s*syncPull\(\);/.test(flags));
  ok("flags.js: feeds พังก็ต้องยิง flags (ไม่ค้าง)", /opts\.after\.then\(syncPull, syncPull\)/.test(flags));
}

console.log("\n" + (fail ? "❌ ตก" : "✅ ผ่านหมด") + " — ผ่าน " + pass + " · ตก " + fail + "\n");
await browser.close();
process.exit(fail ? 1 : 0);
