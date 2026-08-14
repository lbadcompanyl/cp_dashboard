// กล่องตั้งค่ากลุ่มคำ ต้องเป็นแบบ "กดแล้วค่อยเปิด" — ทั้ง /issue/trends.html และ /sd.html
import { chromium } from "playwright";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const PAGES = [
  { name: "issue", url: "http://127.0.0.1:8899/issue/trends.html", tab: "เทรนด์" },
  { name: "sd", url: "http://127.0.0.1:8899/sd.html", tab: null },
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

for (const P of PAGES) {
  console.log(`\n──────── ${P.name} ────────`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.route("**://ssl.gstatic.com/**", (r) => r.abort());
  await page.route("**://trends.google.com/**", (r) => r.abort());
  await page.route("**/api/**", (r) => r.fulfill({ json: { sources: {} } }));
  await page.goto(P.url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  if (P.tab) { await page.locator(".pgtab", { hasText: P.tab }).click(); await page.waitForTimeout(300); }

  console.log("\n[1] ปิดอยู่ตั้งแต่เข้ามา");
  ok("มีปุ่มกดเปิด", await page.locator("#tbToggle").isVisible());
  ok("เนื้อในถูกซ่อนไว้", await page.locator("#tbBody").isHidden());
  ok("บอกสถานะให้ตัวอ่านหน้าจอ", (await page.locator("#tbToggle").getAttribute("aria-expanded")) === "false");
  ok("ช่องพิมพ์คำค้นยังไม่โผล่", await page.locator("#grpKws").isHidden());

  console.log("\n[2] สรุปให้อ่านได้โดยไม่ต้องกาง");
  const sum = await page.locator("#tbSum").innerText();
  ok("บอกชื่อกลุ่ม + จำนวนคำ + พื้นที่ + ช่วงเวลา", /· \d+ คำ · .+ · .+/.test(sum), sum);

  console.log("\n[3] กดแล้วเปิด กดอีกทีปิด");
  await page.locator("#tbToggle").click();
  ok("กดแล้วกางออก", await page.locator("#tbBody").isVisible());
  ok("aria-expanded เป็น true", (await page.locator("#tbToggle").getAttribute("aria-expanded")) === "true");
  ok("แก้คำค้นได้จริงหลังกาง", await page.locator("#grpKws").isVisible());
  await page.locator("#tbToggle").click();
  ok("กดซ้ำแล้วยุบกลับ", await page.locator("#tbBody").isHidden());

  console.log("\n[4] จำสถานะไว้ ไม่ใช่เปิดใหม่แล้วลืม");
  await page.locator("#tbToggle").click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  if (P.tab) { await page.locator(".pgtab", { hasText: P.tab }).click(); await page.waitForTimeout(300); }
  ok("เปิดหน้าใหม่แล้วยังกางอยู่", await page.locator("#tbBody").isVisible());
  await page.locator("#tbToggle").click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  if (P.tab) { await page.locator(".pgtab", { hasText: P.tab }).click(); await page.waitForTimeout(300); }
  ok("ปิดไว้แล้วก็ยังปิดอยู่", await page.locator("#tbBody").isHidden());

  console.log("\n[5] กราฟต้องขยับขึ้นมาอยู่ในจอ");
  const top = await page.evaluate(() => {
    const h = [...document.querySelectorAll("h2")].find((x) => x.textContent.includes("ความสนใจตามช่วงเวลา"));
    return h ? Math.round(h.getBoundingClientRect().top) : -1;
  });
  ok("หัวข้อกราฟอยู่ในหน้าจอแรก (" + top + "px)", top > 0 && top < 780, String(top));

  console.log("\n[6] ไม่พังอย่างอื่น");
  ok("เปลี่ยนช่วงเวลาแล้วสรุปเปลี่ยนตาม", await (async () => {
    await page.locator("#tbToggle").click();
    await page.selectOption("#period", "5y");
    await page.waitForTimeout(200);
    return (await page.locator("#tbSum").innerText()).includes("5 ปี");
  })());
  const m = await page.evaluate(() => ({
    sw: document.scrollingElement.scrollWidth,
    iw: window.innerWidth,
    wide: [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length,
  }));
  ok("ไม่มี scroll แนวนอน (" + m.sw + " ≤ " + m.iw + ")", m.sw <= m.iw + 1);
  ok("ไม่มีอะไรล้นขอบขวา", m.wide === 0, "ล้น " + m.wide + " ชิ้น");
  ok("ไม่มี JS error", errs.length === 0, errs.join(" | "));

  console.log("\n[7] เดสก์ท็อป — ไม่ต้องซ่อน (เจ้าของสั่ง)");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(250);
  ok("ไม่มีปุ่มกดเปิดบนจอกว้าง", await page.locator("#tbToggle").isHidden());
  ok("กางไว้ตลอด", await page.locator("#tbBody").isVisible());
  ok("แก้คำค้นได้ทันที ไม่ต้องกดอะไรก่อน", await page.locator("#grpKws").isVisible());
  ok("ช่องเลือกช่วงเวลาก็กดได้เลย", await page.locator("#period").isVisible());
  // ปิดไว้บนมือถือแล้วมาเปิดบนเดสก์ท็อป ต้องยังกางอยู่ (จอกว้างไม่สนใจค่าที่จำไว้)
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(200);
  if (await page.locator("#tbBody").isVisible()) await page.locator("#tbToggle").click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(250);
  ok("มือถือปิดไว้ ก็ไม่ลามมาปิดบนเดสก์ท็อป", await page.locator("#tbBody").isVisible());

  await ctx.close();
}

await browser.close();
console.log("\n" + (fail ? "❌" : "✅") + " ผ่าน " + pass + " · ตก " + fail + "\n");
process.exit(fail ? 1 : 0);
