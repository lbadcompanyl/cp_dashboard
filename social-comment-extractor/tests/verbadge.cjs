/**
 * verbadge.cjs — ป้ายเวอร์ชันต้องบอก **ทั้งเลขหน้าเว็บและเลขหลังบ้าน**
 *
 * 🐞 เจ้าของเจอ 2 ก.ย. 2026 — "ตัวอย่างไม่อัพเดทอยู่ดี" (แจ้ง 4 รอบ)
 *    ป้ายบนหน้าเขียนว่า "⚙️ v25 · opus 5" = หลังบ้านใหม่แล้ว ถูกต้องแล้ว
 *    เลยไล่ผิดทางว่าเป็นที่หลังบ้าน แก้ v24 → v25 → v26 ก็ยังไม่หาย
 *
 *    ต้นเหตุจริง: **หน้าเว็บที่เครื่องเจ้าของค้างอยู่ที่รุ่น 10**
 *    ซึ่งเป็นรุ่นก่อนที่โค้ดย้ายกลุ่มตัวอย่างจะถูกเขียนขึ้นด้วยซ้ำ
 *    (ยืนยันจาก `git log -S'content="10"'` → ถูกแทนใน commit ที่เพิ่มฟีเจอร์นี้พอดี)
 *
 *    ป้ายไม่เคยบอกเลขฝั่งหน้าเว็บเลย จึงแยกไม่ออกว่า "ฝั่งไหนค้าง"
 *
 * [1] และ [3] คือข้อสำคัญที่สุด — ถอดเลขฝั่งไหนออกก็ตกทันที
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const HTML = fs.readFileSync(path.join(ROOT, "issue", "sentiment.html"), "utf8");
const WORKER = fs.readFileSync(path.join(ROOT, "social-comment-extractor", "worker", "worker.js"), "utf8");

const PAGE_VER = (HTML.match(/<meta name="page-ver" content="(\d+)"/) || [])[1];
const WVER = (WORKER.match(/^const WORKER_VER = (\d+);/m) || [])[1];

(async () => {
  let fail = 0;
  const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

  /* ── [3] หลังบ้านต้องติดเลขเวอร์ชันมากับ **ผลวิเคราะห์** ─────
     ไม่ใช่แค่ที่ endpoint สุขภาพ — บันทึกการแก้ป้ายที่เข้าคิวรีวิวอ่านจาก
     ผลวิเคราะห์ ถ้าไม่มีจะเก็บเป็น null ทุกใบ ย้อนดูไม่ได้ว่ามาจากรุ่นไหน
     (ผลรันจริงคุมโดย samplesrc.mjs [8] — ที่นี่เช็คว่ายังอยู่ในโค้ด) */
  const ret = WORKER.split("async function analyze(")[1] || "";
  ok("[3] ⚠️ ผลวิเคราะห์แนบ ver: WORKER_VER มาด้วย", /\bver:\s*WORKER_VER\s*,/.test(ret),
     `WORKER_VER ในไฟล์ = ${WVER}`);

  /* ── ป้ายบนหน้าเว็บ ─────────────────────────────────────── */
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));

  await page.route("**/comment-sentiment.s3445028.workers.dev/**", async (route) => {
    const u = route.request().url();
    const send = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.endsWith("/credits")) return send({ credits_remaining: 7000 });
    if (u.endsWith("/")) return send({ ok: true, ver: 25, rubric: "v6", model: "claude-opus-5" });
    return send({});
  });

  await page.goto("http://localhost:8899/issue/sentiment.html");
  await page.waitForFunction(() => /\d/.test(document.querySelector("#verBadge")?.textContent || ""), null, { timeout: 8000 });
  const txt = (await page.locator("#verBadge").textContent()).trim();
  const tip = await page.locator("#verBadge").getAttribute("title");
  console.log("   ป้ายที่ขึ้นจริง: " + txt);

  ok("[1] ⚠️ ป้ายมีเลข **หน้าเว็บ** ด้วย", txt.includes(PAGE_VER), `หน้าเว็บควรเป็น ${PAGE_VER}`);
  ok("[2] ป้ายมีเลข **หลังบ้าน** ด้วย", txt.includes("25"));
  ok("[2b] แยกออกว่าเลขไหนคือฝั่งไหน", /น\s*\d/.test(txt) && /ล\s*\d/.test(txt), txt);
  ok("[2c] คำเต็มอยู่ใน tooltip", /หน้าเว็บ/.test(tip) && /Worker/.test(tip));

  /* ── [4] ต่อหลังบ้านไม่ได้ ก็ยังต้องบอกเลขหน้าเว็บ ─────────
     จังหวะที่หลังบ้านล่มคือจังหวะที่ต้องรู้ให้ได้ว่าหน้าเว็บเป็นรุ่นไหน */
  await page.unroute("**/comment-sentiment.s3445028.workers.dev/**");
  await page.route("**/comment-sentiment.s3445028.workers.dev/**", (route) => route.abort());
  await page.reload();
  await page.waitForFunction(() => /ต่อหลังบ้านไม่ได้/.test(document.querySelector("#verBadge")?.textContent || ""), null, { timeout: 8000 });
  const bad = (await page.locator("#verBadge").textContent()).trim();
  ok("[4] หลังบ้านล่ม → ยังบอกเลขหน้าเว็บอยู่", bad.includes(PAGE_VER), bad);

  console.log(errs.length ? "❌ JS error: " + errs.join(";") : "✅ ไม่มี JS error");
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
