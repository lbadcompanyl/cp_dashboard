// /issue/trends.html — กราฟ Google Trends ขึ้น "Oops! Something went wrong."
// เปิดจริงด้วย Chromium · ตัว embed ของ Google โหลดไม่ได้จากเครื่องนี้ (เน็ตขาออกถูกบล็อก)
// จึงเทสต์เฉพาะ "สิ่งที่เราคุมได้": คำที่ส่งให้ Google · ลิงก์ทางออก · ไม่มี JS error
import { chromium } from "playwright";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
// ตัด Google ออก — เครื่องนี้ยิงไม่ถึงอยู่แล้ว จะได้ไม่ต้องรอ timeout
await page.route("**://ssl.gstatic.com/**", (r) => r.abort());
await page.route("**://trends.google.com/**", (r) => r.abort());
await page.route("**/api/**", (r) => r.fulfill({ json: { sources: {} } }));

await page.goto("http://127.0.0.1:8899/issue/trends.html", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(600);

console.log("\n[1] เปิดหน้าเทรนด์ได้");
await page.locator('.pgtab', { hasText: "เทรนด์" }).click();
await page.waitForTimeout(300);
ok("หน้าเทรนด์แสดงผล", await page.locator("#tsSub").isVisible());
ok("ไม่มี JS error", errs.length === 0, errs.join(" | "));

console.log("\n[2] คำที่ส่งให้ Google ต้องไม่ซ้ำความหมาย");
// สร้างกลุ่มใหม่ที่มี pm 2.5 กับ pm2.5 (เคสจริงในรูป)
const combined = await page.evaluate(() => {
  const g = { name: "pm 2.5", keywords: ["pm 2.5", "pm2.5"] };
  return { out: combinedKeyword(g), first: firstKeyword(g) };
});
ok("pm 2.5 + pm2.5 → เหลือคำเดียว", combined.out === "pm 2.5", combined.out);
ok("firstKeyword ยังเป็นคำแรกตามเดิม", combined.first === "pm 2.5", combined.first);
const multi = await page.evaluate(() => combinedKeyword({ name: "x", keywords: ["ฝุ่นพิษ", "หมอกควัน"] }));
ok("คำที่ต่างกันจริง ยังส่งครบ", multi === "ฝุ่นพิษ + หมอกควัน", multi);

console.log("\n[3] ช่วงเวลาแบบกำหนดเอง ต้องถูก encode");
const q = await page.evaluate(() => {
  const saved = state.period;
  state.period = "3y";
  const u = exploreUrl("pm 2.5");
  const cfg = configFor("pm 2.5");
  state.period = saved;
  return { url: u, eq: cfg.opts.exploreQuery, time: cfg.common.comparisonItem[0].time };
});
ok("3 ปี = ช่วงวันที่กำหนดเอง", /^\d{4}-\d{2}-\d{2} \d{4}-\d{2}-\d{2}$/.test(q.time), q.time);
ok("exploreQuery ไม่มีช่องว่างดิบ", !/date=[^&]*\s/.test(q.eq), q.eq);
ok("ลิงก์ทางออกก็ encode เหมือนกัน", !/date=[^&]*\s/.test(q.url), q.url.slice(0, 90));
ok("ยังส่ง geo/q ครบ", q.eq.includes("geo=TH") && q.eq.includes("q="), q.eq);

console.log("\n[4] มีทางออกเมื่อ Google ไม่ยอมตอบ");
const ts = page.locator("#tsOpen");
ok("มีลิงก์ ↗ เปิดใน Google Trends ใต้กราฟ", await ts.isVisible());
const href = await ts.getAttribute("href");
ok("ลิงก์ชี้ไป trends.google.com/explore", (href || "").startsWith("https://trends.google.com/trends/explore?"), href);
ok("ลิงก์พา keyword ของกลุ่มที่เลือกอยู่ไปด้วย", (href || "").includes("q="), href);
ok("เปิดแท็บใหม่ + rel=noopener",
  (await ts.getAttribute("target")) === "_blank" && (await ts.getAttribute("rel")) === "noopener");
ok("อธิบายว่า Oops แปลว่าอะไร", (await page.locator(".wfoot").first().innerText()).includes("Oops"));
ok("คำค้นที่เกี่ยวข้องก็มีลิงก์", await page.locator("#rqOpen").isVisible());

console.log("\n[5] สลับกลุ่ม/ช่วงเวลาแล้วลิงก์ตามไปด้วย");
const before = await page.locator("#tsOpen").getAttribute("href");
// จอกว้าง = กล่องตั้งค่ากางอยู่แล้ว (ไม่มีปุ่มให้กด) · จอแคบต้องกางก่อน
if (await page.locator("#tbBody").isHidden()) await page.locator("#tbToggle").click();
await page.selectOption("#period", "5y");
await page.waitForTimeout(200);
const after = await page.locator("#tsOpen").getAttribute("href");
ok("เปลี่ยนช่วงเวลาแล้วลิงก์เปลี่ยนตาม", before !== after, after?.slice(0, 70));
ok("ยังไม่มี JS error หลังกดใช้งาน", errs.length === 0, errs.join(" | "));

console.log("\n[6] มือถือ — ห้ามล้นแนวนอน");
await page.setViewportSize({ width: 390, height: 780 });
await page.waitForTimeout(300);
const m = await page.evaluate(() => ({
  sw: document.scrollingElement.scrollWidth,
  iw: window.innerWidth,
  wide: [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length,
}));
ok("ไม่มี scroll แนวนอน (" + m.sw + " ≤ " + m.iw + ")", m.sw <= m.iw + 1);
ok("ไม่มีอะไรล้นขอบขวา", m.wide === 0, "ล้น " + m.wide + " ชิ้น");

await browser.close();
console.log("\n" + (fail ? "❌" : "✅") + " ผ่าน " + pass + " · ตก " + fail + "\n");
process.exit(fail ? 1 : 0);
