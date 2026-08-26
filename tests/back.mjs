// /admin/ — ✂️ ข่าวที่ระบบตัดทิ้ง + ปุ่ม ↩ เอากลับ · และลำดับคอลัมน์ของ /trend/
import { launch } from "./browser.mjs";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const feeds = {
  sources: {},
  alertVerify: { dropped: [
    { src: "alert1", why: "job", title: "รับสมัครพนักงาน CPF", link: "https://th.jobsdb.com/j/1" },
    { src: "alert2", why: "pr", title: "ข่าวจริงที่ตัดพลาด", link: "https://www.newswit.com/x" },
  ] },
  swept: { dropped: [{ src: "alert2", why: "vendor", title: "ขายเครื่องกรองน้ำ", link: "https://epower.test/2" }] },
};

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
const posted = [];
await page.route("**/api/**", (r) => r.fulfill({ json: {} }));
await page.route("**/api/trend/feeds*", (r) => r.fulfill({ json: feeds }));
await page.route("**/api/ir/feeds*", (r) => r.fulfill({ json: feeds }));
let allowItems = {};
await page.route("**/api/allow", (r) => {
  if (r.request().method() === "POST") {
    const b = JSON.parse(r.request().postData() || "{}");
    posted.push(b);
    allowItems[b.link] = { link: b.link, title: b.title, why: b.why };
    return r.fulfill({ json: { ok: true, count: Object.keys(allowItems).length } });
  }
  r.fulfill({ json: { count: Object.keys(allowItems).length, items: allowItems } });
});

await page.goto("http://127.0.0.1:8899/admin/", { waitUntil: "networkidle" });
await page.waitForSelector("#admDrop .dropgrp", { timeout: 5000 });

console.log("\n[1] กล่องกลับมาแล้ว");
ok("มีหัวข้อ ✂️ ข่าวที่ระบบตัดทิ้ง", await page.locator("h2", { hasText: "ข่าวที่ระบบตัดทิ้ง" }).isVisible());
ok("ตัดทิ้ง 3 ข่าว", (await page.locator("#admDrop .dropsum").innerText()).includes("3"));
ok("ไม่มี JS error", errs.length === 0, errs.join(" | "));

console.log("\n[2] ทุกแถวมีปุ่ม ↩ เอากลับ");
await page.locator("#admDrop .dropgrp").first().locator("summary").click();
const li = page.locator("#admDrop .dropgrp").first().locator(".droplist li").first();
const btn = li.locator(".dropback");
ok("มีปุ่ม", await btn.isVisible());
ok("เขียนว่า เอากลับ", (await btn.innerText()).includes("เอากลับ"));

console.log("\n[3] กดแล้วส่งไปบันทึกที่เซิร์ฟเวอร์");
await btn.click();
await page.waitForTimeout(400);
ok("ยิงไป /api/allow 1 ครั้ง", posted.length === 1, JSON.stringify(posted));
ok("ส่งลิงก์ข่าวไปด้วย", posted[0]?.link === "https://th.jobsdb.com/j/1", JSON.stringify(posted[0]));
ok("ส่งพาดหัว + เหตุผลไปด้วย", !!posted[0]?.title && !!posted[0]?.why, JSON.stringify(posted[0]));
ok("สั่งเปิด (on:true)", posted[0]?.on === true);
ok("ปุ่มเปลี่ยนเป็น เอากลับแล้ว", (await btn.innerText()).includes("เอากลับแล้ว"));
ok("กดซ้ำไม่ได้", await btn.isDisabled());
await btn.click({ force: true });
await page.waitForTimeout(200);
ok("กดซ้ำแล้วไม่ยิงเพิ่ม", posted.length === 1, "ยิง " + posted.length);

console.log("\n[4] แถวอื่นยังกดได้");
// ปุ่มที่เหลืออยู่ในกลุ่มที่ยังพับอยู่ — ต้องกางก่อน
for (const d of await page.locator("#admDrop .dropgrp").all()) await d.locator("summary").click();
const other = page.locator("#admDrop .dropback:not(.done)").first();
await other.click();
await page.waitForTimeout(400);
ok("ยิงครั้งที่ 2 ได้", posted.length === 2, "ยิง " + posted.length);
ok("เป็นคนละลิงก์", posted[1]?.link !== posted[0]?.link, JSON.stringify(posted.map((p) => p.link)));

console.log("\n[5] มือถือ — ห้ามล้นแนวนอน");
await page.setViewportSize({ width: 390, height: 780 });
await page.waitForTimeout(250);
const m = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: window.innerWidth,
  wide: [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length }));
ok("ไม่มี scroll แนวนอน (" + m.sw + " ≤ " + m.iw + ")", m.sw <= m.iw + 1);
ok("ไม่มีอะไรล้นขอบขวา", m.wide === 0, "ล้น " + m.wide + " ชิ้น");

console.log("\n[6] /trend/ — สลับ YouTube มาก่อน X");
const p2 = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await p2.route("**/api/**", (r) => r.fulfill({ json: { sources: {} } }));
await p2.goto("http://127.0.0.1:8899/trend/", { waitUntil: "domcontentloaded" });
await p2.waitForTimeout(600);
const order = await p2.evaluate(() => [...document.querySelectorAll(".panel[data-source]")].map((p) => p.dataset.source));
const iy = order.indexOf("yttrends"), ix = order.indexOf("xtrends");
ok("YouTube อยู่ก่อน X", iy >= 0 && ix >= 0 && iy < ix, order.join(" · "));
ok("คอลัมน์อื่นยังอยู่ครบ", order.length >= 5, order.join(" · "));
ok("หัวคอลัมน์ตรงกับเนื้อใน", await p2.evaluate(() => {
  const y = document.querySelector('.panel[data-source="yttrends"]');
  const x = document.querySelector('.panel[data-source="xtrends"]');
  return y.textContent.includes("YouTube") && x.textContent.includes("X") && !!y.querySelector("[data-ytgeo]") && !!x.querySelector("[data-xgeo]");
}));


console.log("\n[7] สรุปว่ากฎไหนตัดพลาดบ่อย");
{
  await page.waitForTimeout(400);
  const t = await page.locator("#admBack").innerText();
  ok("มีกล่อง ↩ ข่าวที่เอากลับ", await page.locator("h2", { hasText: "ข่าวที่เอากลับ" }).isVisible());
  ok("นับข่าวที่กดคืนไปแล้ว 2 ใบ", t.includes("2"), t.split("\n")[0]);
  ok("บอกเป็นชื่อกฎภาษาคน ไม่ใช่รหัสดิบ", t.includes("ประกาศหางาน") && !t.includes("job"), t);
  ok("บอกว่ากดคืนแก้ได้แค่ใบเดียว ให้ไปแก้ตัวกรอง", /แก้.*ตัวกรอง/.test(t), t);
}

console.log("\n[8] กฎที่ถูกกดคืนบ่อย ต้องเตือน");
{
  // ยัด 3 ใบเหตุผลเดียวกัน แล้วโหลดใหม่
  await page.evaluate(async () => {
    for (const n of [1, 2, 3]) {
      await fetch("/api/allow", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ link: "https://th.jobsdb.com/many/" + n, title: "x", why: "job", on: true }) });
    }
    await loadReturned();
  });
  await page.waitForTimeout(400);
  const t = await page.locator("#admBack").innerText();
  ok("เตือนว่ากฎกว้างเกินไป", t.includes("กว้างเกินไป"), t.slice(-160));
  ok("บอกชื่อกฎที่มีปัญหา", t.includes("ประกาศหางาน"), t.slice(-160));
}

await browser.close();
console.log("\n" + (fail ? "❌" : "✅") + " ผ่าน " + pass + " · ตก " + fail + "\n");
process.exit(fail ? 1 : 0);
