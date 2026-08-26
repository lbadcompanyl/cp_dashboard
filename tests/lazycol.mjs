/* โหลดทีละคอลัมน์ (lazy) — /trend/ /ir/ /issue/
 *
 * 🎯 ข้อสำคัญที่สุด: **บนมือถือ เปิดหน้ามาต้องยิงคำขอเดียว ไม่ใช่ 4 คำขอ**
 *    แดชบอร์ดเป็น carousel เห็นทีละคอลัมน์ คอลัมน์ที่ยังปัดไปไม่ถึงไม่ควรแย่งเน็ต
 *
 * ⚠️ และห้ามทำให้เดสก์ท็อปแย่ลง — เดสก์ท็อปเห็นทุกคอลัมน์พร้อมกัน ต้องโหลดครบเหมือนเดิม
 *    และต้องยิง **คอลัมน์ละครั้งเดียว** (เคยพลาดเป็น 2 ครั้งเพราะ reveal กับ load() ยิงซ้อนกัน)
 */
import fs from "node:fs";
import { launch } from "./browser.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8899";
const MOBILE = { width: 390, height: 780 };
const DESKTOP = { width: 1400, height: 900 };

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra ? " → " + extra : "")); }
};

const mkItems = (n, p) => Array.from({ length: n }, (_, i) => ({
  id: p + i, title: p + " " + i, link: "https://" + p + "/" + i,
  snippet: "x", sourceLabel: "ทดสอบ", publishedAt: new Date().toISOString(),
}));
const trendFeeds = { generatedAt: new Date().toISOString(), errors: [], sources: {
  news: { label: "News", items: mkItems(50, "n") },
  alert1: { label: "CP", items: mkItems(30, "a") },
  alert2: { label: "จับตา", items: mkItems(20, "b") },
} };
const irFeeds = { generatedAt: new Date().toISOString(), errors: [], sources: {
  newsth: { label: "ไทย", items: mkItems(40, "t") },
  newsintl: { label: "ต่างประเทศ", items: mkItems(40, "i") },
  alert1: { label: "CP", items: mkItems(20, "c") },
  alert2: { label: "ปศุสัตว์", items: mkItems(20, "d") },
} };

// ⚠️ sandbox ยิงเน็ตออกไม่ได้ — ต้องปลอม API ทุกตัวที่หน้าเรียก
async function stub(ctx, feeds) {
  const hits = [];
  await ctx.route("**/api/**", (r) => {
    const u = new URL(r.request().url()).pathname;
    hits.push(u);
    const body = u.includes("feeds") ? feeds
      : u.includes("/trending") ? { items: [{ title: "เทรนด์", traffic: "1K+" }], source: "trendingnow" }
      : u.includes("/xtrends") ? { trends: [{ name: "#t", rank: 1 }] }
      : u.includes("/yttrends") ? { items: [{ id: "v", title: "คลิป", views: 1 }] }
      : { configured: true, records: [], kw: {}, items: {}, blocked: {} };
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return hits;
}
const count = (hits, s) => hits.filter((h) => h.includes(s)).length;
// คอลัมน์ไหนวาดแล้ว (ตัวเลข = จำนวนการ์ด) · "รอ" = ยังเป็นไอคอนหมุน
const cols = (p) => p.$$eval(".panel", (els) => {
  const o = {};
  els.forEach((e) => { o[e.dataset.source] = e.querySelector("[data-list] .waiting") ? "รอ" : e.querySelectorAll("[data-list] > *").length; });
  return o;
});

const browser = await launch();

// ── [1] มือถือ: เปิดหน้ามายิงคำขอเดียว ────────────────────────────────────
console.log("\n[1] มือถือ — เปิดหน้ามาต้องยิงแค่คำขอเดียว");
{
  const ctx = await browser.newContext({ viewport: MOBILE });
  const hits = await stub(ctx, trendFeeds);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`${BASE}/trend/`, { waitUntil: "load" });
  await p.waitForTimeout(1200);

  ok("ยิงข่าว 1 ครั้ง", count(hits, "/trend/feeds") === 1, String(count(hits, "/trend/feeds")));
  ok("ยังไม่ยิง Google Trends", count(hits, "/trending") === 0, String(count(hits, "/trending")));
  ok("ยังไม่ยิง X", count(hits, "/xtrends") === 0, String(count(hits, "/xtrends")));
  ok("ยังไม่ยิง YouTube", count(hits, "/yttrends") === 0, String(count(hits, "/yttrends")));

  const c = await cols(p);
  ok("คอลัมน์แรกวาดข่าวครบ", c.news === 50, JSON.stringify(c.news));
  ok("คอลัมน์ที่มี endpoint ของตัวเองยังไม่ถูกดึง", c.xtrends === "รอ" && c.trends === "รอ", JSON.stringify(c));
  // ⚠️ ข้อนี้วัด "ประหยัดแรงวาด" — alert2 มีข้อมูลอยู่ในมือแล้ว (มากับคำขอเดียวกับข่าว)
  //    แต่ยังปัดไปไม่ถึง จึงต้องไม่เสียแรงสร้าง HTML ให้ · ถ้าข้อนี้ผ่านตลอดแม้ปิด lazy
  //    แปลว่าเทสต์วัดไม่โดน (เคยเป็นมาแล้ว: ไปวัดคอลัมน์ที่ยังไงก็ไม่มีข้อมูล)
  ok("คอลัมน์ที่ยังปัดไปไม่ถึงต้องไม่ถูกวาด แม้ข้อมูลจะมาถึงแล้ว", c.alert2 === "รอ", JSON.stringify(c));

  // ⚠️ ไอคอนหมุนของคอลัมน์ที่ยังไม่เปิด = "กำลังมา" ยังจริงอยู่ เพราะปัดถึงแล้วโหลดทันที
  await p.evaluate(() => document.querySelectorAll(".panel")[3].scrollIntoView({ inline: "center", block: "nearest" }));
  await p.waitForTimeout(900);
  ok("ปัดถึงแล้วยิง Google Trends ให้", count(hits, "/trending") === 1, String(count(hits, "/trending")));
  const c2 = await cols(p);
  ok("ปัดถึงแล้ววาดคอลัมน์นั้นจริง", c2.trends === 1, JSON.stringify(c2.trends));
  ok("คอลัมน์ที่ยังไม่ถึงยังไม่โหลด", count(hits, "/xtrends") === 0, String(count(hits, "/xtrends")));
  ok("หน้าไม่ล้นแนวนอน", JSON.stringify(await p.evaluate(() => [document.scrollingElement.scrollWidth, innerWidth])).match(/\[(\d+),(\d+)\]/) && (await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth)));
  ok("ไม่มี JS error", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ── [2] เดสก์ท็อปต้องไม่แย่ลง ────────────────────────────────────────────
console.log("\n[2] เดสก์ท็อป — เห็นทุกคอลัมน์ ต้องโหลดครบ และยิงคอลัมน์ละครั้งเดียว");
{
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const hits = await stub(ctx, trendFeeds);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`${BASE}/trend/`, { waitUntil: "load" });
  await p.waitForTimeout(1500);

  const c = await cols(p);
  ok("ทุกคอลัมน์วาดครบ ไม่มีคอลัมน์ไหนค้างเป็นไอคอนหมุน",
     !Object.values(c).some((v) => v === "รอ"), JSON.stringify(c));
  // 🐞 เคยพลาด: reveal ยิงรอบหนึ่ง แล้ว load() ยิงซ้ำอีกรอบทันที
  ok("Google Trends ยิงครั้งเดียว", count(hits, "/trending") === 1, String(count(hits, "/trending")));
  ok("X ยิงครั้งเดียว", count(hits, "/xtrends") === 1, String(count(hits, "/xtrends")));
  ok("YouTube ยิงครั้งเดียว", count(hits, "/yttrends") === 1, String(count(hits, "/yttrends")));

  // 🐞 เคยพลาด: load() สร้าง sources ก้อนใหม่ทับ ทำให้ผลที่คอลัมน์ lazy เพิ่งเขียนหายไป
  //    อาการคือ "ยิงสำเร็จแล้วแต่คอลัมน์ยังขึ้นไอคอนหมุน" และผลต่างกันทุกครั้งตามว่าใครเสร็จก่อน
  ok("ผลของคอลัมน์ที่โหลดแยกไม่ถูกข่าวเขียนทับ", c.trends === 1 && c.xtrends === 1 && c.yttrends === 1, JSON.stringify(c));

  // กดปุ่มรีเฟรช = ต้องดึงใหม่ทั้งข่าวและคอลัมน์ที่เปิดดูแล้ว
  await p.click("#refresh");
  await p.waitForTimeout(1200);
  ok("กด 🔄 แล้วดึงข่าวใหม่", count(hits, "/trend/feeds") === 2, String(count(hits, "/trend/feeds")));
  ok("กด 🔄 แล้วดึงคอลัมน์ที่เปิดดูแล้วด้วย", count(hits, "/trending") === 2, String(count(hits, "/trending")));
  const c3 = await cols(p);
  ok("หลังรีเฟรชยังวาดครบเหมือนเดิม", !Object.values(c3).some((v) => v === "รอ"), JSON.stringify(c3));
  ok("ไม่มี JS error", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ── [3] /ir/ — ทุกคอลัมน์มาจากคำขอเดียว จึงประหยัดได้แค่ "แรงวาด" ─────────
console.log("\n[3] /ir/ มือถือ — ประหยัดแรงวาด (คำขอเดียวเหมือนเดิม)");
{
  const ctx = await browser.newContext({ viewport: MOBILE });
  const hits = await stub(ctx, irFeeds);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`${BASE}/ir/`, { waitUntil: "load" });
  await p.waitForTimeout(1000);

  ok("ยังยิงข่าวคำขอเดียวเหมือนเดิม", count(hits, "/ir/feeds") === 1, String(count(hits, "/ir/feeds")));
  const c = await cols(p);
  ok("คอลัมน์ที่ปัดไปไม่ถึงยังไม่ถูกวาด", c.alert2 === "รอ", JSON.stringify(c));
  await p.evaluate(() => document.querySelectorAll(".panel")[3].scrollIntoView({ inline: "center", block: "nearest" }));
  await p.waitForTimeout(700);
  const c2 = await cols(p);
  ok("ปัดถึงแล้ววาดให้", c2.alert2 === 20, JSON.stringify(c2.alert2));
  ok("ไม่มี JS error", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ── [4] ตาข่ายกันเหนียว: ไม่มี lazycol.js ต้องยังใช้ได้ครบ ────────────────
// ⚠️ ทดสอบ Safari เก่า (ไม่มี IntersectionObserver) ที่นี่ไม่ได้ — มีแต่ Chromium
//    จึงจำลองด้วย "โหลดไฟล์ช่วยไม่สำเร็จ" ซึ่งเดินโค้ดเส้นทางเดียวกัน (โหลดหมดทุกคอลัมน์)
console.log("\n[4] โหลด lazycol.js ไม่สำเร็จ — ต้องกลับไปโหลดหมดเหมือนเดิม ไม่ใช่หน้าว่าง");
{
  const ctx = await browser.newContext({ viewport: MOBILE });
  const hits = await stub(ctx, trendFeeds);
  await ctx.route("**/lazycol.js*", (r) => r.fulfill({ status: 404, body: "" }));
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`${BASE}/trend/`, { waitUntil: "load" });
  await p.waitForTimeout(1500);

  const c = await cols(p);
  ok("ทุกคอลัมน์ยังวาดครบ", !Object.values(c).some((v) => v === "รอ"), JSON.stringify(c));
  ok("ยังยิงครบทุกต้นทาง",
     count(hits, "/trending") === 1 && count(hits, "/xtrends") === 1 && count(hits, "/yttrends") === 1,
     JSON.stringify({ t: count(hits, "/trending"), x: count(hits, "/xtrends"), y: count(hits, "/yttrends") }));
  ok("ไม่มี JS error", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ── [5] ด่านระดับโค้ด ─────────────────────────────────────────────────────
console.log("\n[5] ด่านกันเขียนผิดแบบเดิมซ้ำ");
{
  // 🐞 `state.data.sources.X = await ...` — JS หา object ปลายทางก่อน await
  //    ถ้าระหว่างรอมีใครสลับ sources ก้อนใหม่ ค่าจะไปตกในก้อนเก่าที่ไม่มีใครอ่าน
  //    อาการ: ยิงสำเร็จแล้วแต่คอลัมน์ค้างเป็นไอคอนหมุน (วัดเจอจริงตอนทำ lazy loading)
  for (const f of ["trend/app.js", "issue/app.js", "ir/app.js"]) {
    // ตัดคอมเมนต์ทิ้งก่อน — ตัวอธิบายกับดักเองก็มีข้อความนี้อยู่ (จะจับตัวเองตก)
    const src = fs.readFileSync(new URL("../" + f, import.meta.url), "utf8")
      .split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    ok(`${f}: ไม่เขียน state.data.sources.X = await ตรงๆ`,
       !/state\.data\.sources\.\w+\s*=\s*await/.test(src));
  }
  // คอลัมน์ที่มี endpoint ของตัวเองต้องอยู่ใน LAZY_COLS ไม่งั้นไม่มีใครโหลดให้
  const trend = fs.readFileSync(new URL("../trend/app.js", import.meta.url), "utf8");
  for (const k of ["trends", "xtrends", "yttrends"]) {
    ok(`trend: ${k} อยู่ใน LAZY_COLS`, new RegExp(`LAZY_COLS[\\s\\S]{0,400}?\\b${k}:`).test(trend));
  }
  ok("trend: คอลัมน์ lazy อยู่ใน SELF_LOADING ด้วย (load() ห้ามเหวี่ยง error ใส่)",
     /SELF_LOADING = new Set\(\[[^\]]*"trends"[^\]]*"xtrends"/.test(trend) ||
     /SELF_LOADING = new Set\(\[[^\]]*"xtrends"[^\]]*"trends"/.test(trend));

  // ทุกหน้าต้องโหลดไฟล์ช่วย ไม่งั้น lazy ไม่ทำงาน (ตกไปโหลดหมดเงียบๆ)
  for (const f of ["trend", "ir", "issue"]) {
    const html = fs.readFileSync(new URL(`../${f}/index.html`, import.meta.url), "utf8");
    ok(`${f}/index.html โหลด lazycol.js`, /lazycol\.js/.test(html));
  }
}

console.log("\n" + (fail ? "❌ ตก" : "✅ ผ่านหมด") + " — ผ่าน " + pass + " · ตก " + fail + "\n");
await browser.close();
process.exit(fail ? 1 : 0);
