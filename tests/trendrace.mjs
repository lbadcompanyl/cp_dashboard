/* 🔥 คอลัมน์ Google Trends หมุนค้าง เพราะ load() ทับผลที่ดึงมาได้
 *
 * เจ้าของแจ้ง 14 ก.ย. 2026: "Google trend โหลดไม่ขึ้นบ่อย และ โหลดซ้ำ"
 * ภาพที่ส่งมา: ป้าย "0 คำ" + ข้อความ "กรุณารอซักครู่" ค้างอยู่
 *
 * ต้นเหตุ: `/api/trend/feeds` ส่ง `sources.trends` เป็นก้อนว่างกลับมา **เสมอ**
 * ({label, items: [], feedCount: 0} — ไม่มีฟีดที่ source=trends อยู่แล้ว)
 * ส่วนคอลัมน์นี้มี endpoint ของตัวเอง (`/api/trend/trending`) และโหลดแยก
 *
 *   reloadTrends() เสร็จ → เขียน bucket ที่มีข่าว + ธง loaded:true
 *   load()        เสร็จ → **ทับ** ด้วยก้อนว่างจาก feeds ที่ไม่มีธง loaded
 *                         → หน้าเว็บอ่านว่า "ยังโหลดไม่เสร็จ" → หมุนค้าง
 *
 * ⚠️ เป็นการแย่งกันเขียน ใครเสร็จทีหลังชนะ → **เป็นบางครั้ง ไม่ใช่ทุกครั้ง**
 *    จึงต้องทดสอบด้วยการ **หน่วง /feeds ให้มาช้ากว่า /trending** ถึงจะจับได้
 *
 * 🚫 ห้ามแก้ด้วยการให้ feeds เลิกส่ง key `trends` — ฝั่งเซิร์ฟเวอร์ใช้นับ feedCount อยู่
 *    ✅ ให้ load() ข้ามคีย์ของคอลัมน์ที่โหลดเองแทน (SELF_LOADING / LAZY_COLS)
 */
import fs from "node:fs";
import { launch } from "./browser.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8899";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra ? " → " + extra : "")); }
};

const browser = await launch();

/** เปิดหน้าโดยหน่วง /feeds ให้มาช้ากว่า /trending แล้วอ่านสภาพคอลัมน์ Google Trends */
async function trendsColumn(path, feedsDelayMs) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route("**/api/**", async (r) => {
    const u = new URL(r.request().url()).pathname;
    if (u.includes("/trend/trending")) {
      return r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ source: "trendingnow",
          items: [{ title: "เทรนด์ที่ดึงมาได้", related: [], newsIds: [] }] }) });
    }
    if (u.includes("/feeds")) {
      await new Promise((s) => setTimeout(s, feedsDelayMs));
      return r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({
          generatedAt: Date.now(), items: [], trends: [], errors: [],
          sources: {
            news: { label: "News", items: [] },
            alert1: { label: "CP", items: [] },
            alert2: { label: "จับตา", items: [] },
            // 👇 ก้อนว่างที่เซิร์ฟเวอร์ส่งมาเสมอ — ตัวที่เคยไปทับผลจริง
            trends: { label: "Google Trends", items: [], feedCount: 0 },
          },
        }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  const p = await ctx.newPage();
  await p.goto(BASE + path, { waitUntil: "load" });
  await p.waitForTimeout(feedsDelayMs + 1500);
  const out = await p.$eval('.panel[data-source="trends"]', (el) => ({
    count: el.querySelector("[data-count]").textContent.trim(),
    body: el.querySelector("[data-list]").textContent.trim(),
  }));
  await ctx.close();
  return out;
}

for (const path of ["/trend/", "/issue/"]) {
  console.log(`\n[1] ${path} — ข่าวมาช้ากว่าเทรนด์ (จังหวะที่เคยพัง)`);
  {
    const r = await trendsColumn(path, 900);
    ok("เทรนด์ที่ดึงมาได้ต้องไม่ถูกทับ", r.body.includes("เทรนด์ที่ดึงมาได้"),
      `ป้าย "${r.count}" · "${r.body.slice(0, 40)}"`);
    ok("🚫 ห้ามหมุนค้าง", !r.body.includes("กรุณารอซักครู่"), r.body.slice(0, 40));
    ok("ป้ายต้องไม่เป็น 0 คำ", !/^0\s/.test(r.count), r.count);
  }

  console.log(`[2] ${path} — ข่าวมาก่อนเทรนด์ (จังหวะที่ไม่เคยพัง ต้องไม่เสียไปด้วย)`);
  {
    const r = await trendsColumn(path, 0);
    ok("ยังขึ้นเทรนด์ตามปกติ", r.body.includes("เทรนด์ที่ดึงมาได้"),
      `ป้าย "${r.count}" · "${r.body.slice(0, 40)}"`);
  }
}

// ── [3] ด่านระดับโค้ด — กันไม่ให้ใครลบการป้องกันออกเงียบๆ ───────────────────
console.log("\n[3] ด่านระดับโค้ด — load() ต้องข้ามคีย์ของคอลัมน์ที่โหลดเอง");
{
  const trend = fs.readFileSync(new URL("../trend/app.js", import.meta.url), "utf8");
  const issue = fs.readFileSync(new URL("../issue/app.js", import.meta.url), "utf8");
  // เอาเฉพาะบรรทัดที่ก๊อป feeds.sources ลง state มาดู
  const copyLine = (s) => {
    const i = s.indexOf("Object.keys(feeds.sources");
    return i < 0 ? "" : s.slice(Math.max(0, i - 120), i + 120);
  };
  ok("trend/app.js ข้ามคอลัมน์ที่โหลดเอง",
    /SELF_LOADING\.has\(k\)/.test(copyLine(trend)), copyLine(trend).slice(-80));
  ok("issue/app.js ข้ามคอลัมน์ที่โหลดเอง",
    /LAZY_COLS\[k\]/.test(copyLine(issue)), copyLine(issue).slice(-80));
  ok("trend: คอลัมน์ trends อยู่ในชุดที่ต้องข้าม", /SELF_LOADING = new Set\([^)]*"trends"/.test(trend));
  ok("issue: คอลัมน์ trends อยู่ใน LAZY_COLS", /LAZY_COLS = \{[^}]*trends/.test(issue));
}

await browser.close();
console.log(`\n${fail ? "❌ ตก" : "✅ ผ่านหมด"} — ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
