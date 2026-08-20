/* บันทึกระบบ (📋 แท็บใหม่ในหน้า /admin/)
 *
 *   python3 -m http.server 8899 --directory .. &
 *   node syslog.mjs
 *
 * ⚠️ **ข้อที่สำคัญที่สุดคือเรื่องโควตา KV** — ตัวบันทึก log ที่เขียนทุก request
 *    จะทำโควตา (1,000 ครั้ง/วัน ใช้ร่วมทั้งโปรเจกต์) หมดเอง แล้วพังทั้งระบบ
 *    ซึ่งเป็นอาการเดียวกับที่มันมีไว้ตรวจ — กลายเป็นต้นเหตุเสียเอง
 */
import fs from "node:fs";
import { chromium } from "playwright";
import { startLog, finishLog, resetLog, writeLog, readLog, LOG_KEY } from "../functions/api/_lib/syslog.js";

const BASE = process.env.BASE || "http://127.0.0.1:8899";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

// KV ปลอม — นับจำนวนครั้งที่ "เขียน" เพราะนั่นคือสิ่งที่มีโควตา
function fakeKV() {
  const store = new Map();
  return { store, writes: 0, reads: 0,
    async get(k) { this.reads++; return store.has(k) ? store.get(k) : null; },
    async put(k, v) { this.writes++; store.set(k, v); } };
}
const envOf = (kv, appEnv) => ({ FLAGS_KV: kv, ...(appEnv ? { APP_ENV: appEnv } : {}) });

// ── [1] โควตา KV ───────────────────────────────────────────────────────
console.log("\n[1] โควตา KV — ข้อที่พลาดแล้วพังทั้งระบบ");
{
  const kv = fakeKV();
  resetLog();
  await writeLog(envOf(kv), { src: "a" });
  await writeLog(envOf(kv), { src: "b" });
  await writeLog(envOf(kv), { src: "c" });
  ok("1 request เขียนได้ครั้งเดียว แม้เรียกซ้ำ", kv.writes === 1, `เขียน ${kv.writes} ครั้ง`);

  resetLog();
  await writeLog(envOf(kv), { src: "d" });
  ok("รีเซ็ตแล้ว request ถัดไปเขียนได้", kv.writes === 2, `เขียน ${kv.writes} ครั้ง`);

  // ⚠️ Workers ใช้โมดูลเดิมข้าม request — ถ้าลืมรีเซ็ต build รอบ 2 จะเงียบหาย
  const src = fs.readFileSync("../functions/api/trend/feeds.js", "utf8");
  const ir = fs.readFileSync("../functions/api/ir/feeds.js", "utf8");
  ok("trend เรียก resetLog() ต้น buildAndStore", /buildAndStore\([^)]*\)\s*\{[\s\S]{0,400}?resetLog\(\);/.test(src));
  ok("ir เรียก resetLog() ต้น buildAndStore", /buildAndStore\([^)]*\)\s*\{[\s\S]{0,400}?resetLog\(\);/.test(ir));

  // ⚠️ ห้ามย้ายไปไว้ใน onRequest — จะกลายเป็นเขียนทุกครั้งที่มีคนเปิดหน้าเว็บ
  for (const [tag, s] of [["trend", src], ["ir", ir]]) {
    const at = s.indexOf("export async function onRequest");
    const build = s.indexOf("async function buildAndStore");
    const inReq = s.slice(at, build > at ? build : s.length);
    ok(`${tag}: ไม่เขียน log ใน onRequest (เขียนเฉพาะตอน build)`, !/finishLog\(|writeLog\(/.test(inReq));
  }
}

// ── [2] เขียนเฉพาะตอนมีอะไรเกิดขึ้นจริง ────────────────────────────────
console.log("\n[2] cache hit ต้องไม่กินโควตา");
{
  const kv = fakeKV();
  resetLog();
  const L1 = startLog("x");
  ok("ไม่ได้ build + ไม่มี error → ไม่เขียนเลย", (await finishLog(envOf(kv), L1, { built: false })) === false && kv.writes === 0);

  resetLog();
  const L2 = startLog("x");
  await finishLog(envOf(kv), L2, { built: true });
  ok("build จริง → เขียน", kv.writes === 1);

  resetLog();
  const L3 = startLog("x");
  L3.fail("invidious.io", "timeout");
  ok("ไม่ได้ build แต่ต้นทางล่ม → ต้องเขียน (ของแบบนี้ต้องรู้)",
    (await finishLog(envOf(kv), L3, { built: false })) === true && kv.writes === 2);

  resetLog();
  const L4 = startLog("x");
  await finishLog(envOf(kv), L4, { built: false, err: "พัง" });
  ok("มี error → เขียนแม้ไม่ได้ build", kv.writes === 3);
}

// ── [3] วงแหวน + ลำดับ ─────────────────────────────────────────────────
console.log("\n[3] เก็บแบบวงแหวน");
{
  const kv = fakeKV();
  for (let i = 0; i < 320; i++) { resetLog(); await writeLog(envOf(kv), { src: "s" + i }); }
  const list = await readLog(envOf(kv));
  ok("ไม่โตไม่จำกัด (เพดาน 300)", list.length <= 300, `${list.length}`);
  ok("ใหม่สุดอยู่บนสุด", list[0].src === "s319", list[0].src);
  ok("blob เดียว ไม่ใช่ key ต่อรายการ", kv.store.size === 1, `${kv.store.size} key`);
  ok("ทุกแถวมีเวลา", list.every((r) => r.at && !isNaN(new Date(r.at))));

  // แยก prod/dev ไม่ปนกัน
  const kv2 = fakeKV();
  resetLog(); await writeLog(envOf(kv2, "dev"), { src: "a" });
  ok("แยก key ตาม APP_ENV", [...kv2.store.keys()][0] === "dev:" + LOG_KEY, [...kv2.store.keys()][0]);
}

// ── [4] log พังห้ามทำให้ API พัง ────────────────────────────────────────
console.log("\n[4] log พังห้ามลามไปพัง API");
{
  const bad = { FLAGS_KV: { async get() { throw new Error("kv ล่ม"); }, async put() { throw new Error("kv ล่ม"); } } };
  resetLog();
  let threw = false;
  try { await writeLog(bad, { src: "x" }); } catch { threw = true; }
  ok("KV ล่มแล้วไม่โยน error ออกมา", !threw);
  ok("อ่านไม่ได้ก็คืนลิสต์ว่าง ไม่พัง", (await readLog(bad)).length === 0);
  ok("ไม่มี KV เลยก็ไม่พัง", (await writeLog({}, { src: "x" })) === false);
}

// ── [5] endpoint อ่านอย่างเดียว ────────────────────────────────────────
console.log("\n[5] /api/log");
{
  const src = fs.readFileSync("../functions/api/log.js", "utf8");
  // ⚠️ เปิดให้ POST เมื่อไหร่ = ใครก็ยิงเข้ามาเขียน KV ไม่จำกัด โควตาหมดใน 1 นาที
  ok("ไม่รับ POST", /request\.method !== "GET"/.test(src) && !/onRequestPost/.test(src));
  ok("ไม่เขียน KV เลย", !/\.put\(/.test(src));
  ok("ไม่ cache — log ต้องเป็นของสด", /no-store/.test(src));
}

// ── [6] หน้า /admin/ ───────────────────────────────────────────────────
console.log("\n[6] แท็บบนหน้า admin");
{
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });

  const LOG = [
    { at: "2026-08-20T03:00:00.000Z", env: "prod", src: "trend/feeds", ok: true, ms: 1840, cache: "build+verify",
      counts: { news: 40, alert1: 12, alert2: 30, pruned: 2 }, drops: { "archive-page": 3, "ไม่อยู่ในพาดหัว/เนื้อ": 9 },
      upstream: [], ai: 4, kvWrites: 1, note: "" },
    { at: "2026-08-20T02:00:00.000Z", env: "prod", src: "ir/feeds", ok: true, ms: 900, cache: "build",
      counts: { alert1: 5 }, drops: {}, upstream: [{ host: "bing.com", err: "timeout" }], ai: 0, kvWrites: 1, note: "" },
    { at: "2026-08-20T01:00:00.000Z", env: "prod", src: "trend/feeds", ok: false, ms: 300, cache: "build",
      counts: {}, drops: {}, upstream: [], ai: 0, kvWrites: 0, note: "เขียนคลังไม่สำเร็จ: quota" },
  ];
  // ⚠️ ปลอม API ทุกตัวที่หน้า admin เรียก — sandbox ยิงเน็ตออกไม่ได้
  await ctx.route("**/api/log*", (r) => {
    const u = new URL(r.request().url());
    const s = u.searchParams.get("src");
    const items = s ? LOG.filter((x) => x.src === s) : LOG;
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items, total: items.length }) });
  });
  await ctx.route("**/api/**", (r) => {
    if (/\/api\/log/.test(r.request().url())) return r.fallback();
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sources: {}, alertVerify: {}, swept: {}, items: [] }) });
  });

  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(`${BASE}/admin/`, { waitUntil: "load" });
  await p.waitForTimeout(600);

  ok("เปิดมาอยู่แท็บจัดการข่าว", !(await p.$eval("#pgManage", (e) => e.hidden)) && (await p.$eval("#pgLog", (e) => e.hidden)));
  ok("แถบเลือกแดชบอร์ดยังอยู่", !(await p.$eval("#scopes", (e) => e.hidden)));
  // ⚠️ ต้องยังไม่ยิง /api/log ตอนเปิดหน้า — คนส่วนใหญ่มาจัดการข่าว ไม่ได้มาดู log
  ok("ยังไม่โหลด log ตอนเปิดหน้า", (await p.$eval("#admLog", (e) => e.innerHTML.trim())) === "");

  await p.click('#ptabs button[data-page="log"]');
  await p.waitForTimeout(500);
  ok("กดแล้วสลับมาแท็บบันทึก", (await p.$eval("#pgManage", (e) => e.hidden)) && !(await p.$eval("#pgLog", (e) => e.hidden)));
  // log ครอบทุกแดชบอร์ด — โชว์แถบเลือกแดชบอร์ดไว้จะทำให้เข้าใจผิดว่ากรองอยู่
  ok("ซ่อนแถบเลือกแดชบอร์ด", await p.$eval("#scopes", (e) => e.hidden));

  const rows = await p.$$eval(".loglist li", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
  ok("แสดงครบทุกแถว", rows.length === 3, `${rows.length}`);
  ok("บอกว่ามาจากแดชบอร์ดไหน", rows[0].includes("trend/feeds"));
  ok("แปลรหัสเหตุผลเป็นภาษาคน ไม่ใช่รหัสดิบ",
    rows[0].includes("หน้ารวมบทความ") || !rows[0].includes("archive-page"), rows[0].slice(0, 160));
  ok("บอกจำนวนข่าวที่ได้", rows[0].includes("news 40"));
  ok("บอกว่าถาม AI กี่ครั้ง", rows[0].includes("4"));

  const cls = await p.$$eval(".loglist li", (els) => els.map((e) => e.className));
  ok("แถวที่พังขึ้นสีต่างจากแถวปกติ", cls[2] === "bad", JSON.stringify(cls));
  ok("แถวที่ต้นทางล่มขึ้นเป็นคำเตือน", cls[1] === "warn", JSON.stringify(cls));
  ok("แถวปกติไม่ถูกทำเป็นสีเตือน", cls[0] === "");
  ok("แถวที่พังบอกเหตุผลด้วย", (await p.$$eval(".lognote", (e) => e.map((x) => x.textContent))).some((t) => t.includes("quota")));

  // กรองตามแดชบอร์ด
  await p.selectOption("#logSrc", "ir/feeds");
  await p.waitForTimeout(400);
  const only = await p.$$eval(".loglist .logsrc", (els) => [...new Set(els.map((e) => e.textContent))]);
  ok("กรองตามแดชบอร์ดได้", only.length === 1 && only[0] === "ir/feeds", JSON.stringify(only));

  // ว่างต้องอธิบายว่าทำไมถึงว่าง ไม่ใช่ปล่อยหน้าเปล่า
  await ctx.route("**/api/log*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) }));
  await p.click("#logReload");
  await p.waitForTimeout(400);
  const empty = await p.$eval("#admLog", (e) => e.textContent);
  ok("ว่างแล้วบอกเหตุผล ไม่ใช่หน้าเปล่า", /ยังไม่มีบันทึก/.test(empty) && /รอบใหม่/.test(empty), empty.slice(0, 80));

  await p.click('#ptabs button[data-page="manage"]');
  await p.waitForTimeout(200);
  ok("กดกลับมาแท็บจัดการข่าวได้", !(await p.$eval("#pgManage", (e) => e.hidden)) && !(await p.$eval("#scopes", (e) => e.hidden)));
  ok("ไม่มี JS error", errs.length === 0, errs.join(" | "));

  await browser.close();
}

console.log("\n" + (fail ? "❌ ตก" : "✅ ผ่านหมด") + " — ผ่าน " + pass + " · ตก " + fail + "\n");
process.exit(fail ? 1 : 0);
