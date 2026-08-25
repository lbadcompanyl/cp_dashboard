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
import { launch } from "./browser.mjs";
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
  const browser = await launch();
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
  // ⚠️ ต้องเป็นชื่อภาษาคน ไม่ใช่ path ของโค้ด (กฎเดียวกับ WHY_TH ของรายการข่าวที่ถูกตัด)
  ok("บอกว่ามาจากช่องไหน เป็นภาษาคน ไม่ใช่ path ดิบ",
     rows[0].includes("ข่าว PR") && !rows[0].includes("trend/feeds"), rows[0].slice(0, 80));
  ok("แปลรหัสเหตุผลเป็นภาษาคน ไม่ใช่รหัสดิบ",
    rows[0].includes("หน้ารวมบทความ") || !rows[0].includes("archive-page"), rows[0].slice(0, 160));
  ok("บอกจำนวนข่าวที่ได้", rows[0].includes("News 40"), rows[0].slice(0, 120));
  ok("บอกว่าถาม AI กี่ครั้ง", rows[0].includes("4"));

  const cls = await p.$$eval(".loglist > li", (els) => els.map((e) => e.className));
  ok("แถวที่พังขึ้นสีต่างจากแถวปกติ", cls.some((c) => c.includes("lv-fail")), JSON.stringify(cls));
  ok("แถวที่ต้นทางล่มขึ้นเป็นคำเตือน", cls.some((c) => c.includes("lv-warn")), JSON.stringify(cls));
  ok("แถวปกติไม่ถูกทำเป็นสีเตือน", cls.some((c) => c.includes("lv-ok")), JSON.stringify(cls));
  ok("แถวที่พังบอกเหตุผลด้วย", (await p.$$eval(".lognote", (e) => e.map((x) => x.textContent))).some((t) => t.includes("quota")));

  // กรองตามแดชบอร์ด
  await p.selectOption("#logSrc", "ir/feeds");
  await p.waitForTimeout(400);
  const only = await p.$$eval(".loglist .logsrc", (els) => [...new Set(els.map((e) => e.textContent))]);
  ok("กรองตามแดชบอร์ดได้", only.length === 1 && only[0] === "ข่าว IR", JSON.stringify(only));

  // ว่างต้องอธิบายว่าทำไมถึงว่าง ไม่ใช่ปล่อยหน้าเปล่า
  await ctx.route("**/api/log*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) }));
  await p.click("#logReload");
  await p.waitForTimeout(400);
  const empty = await p.$eval("#admLog", (e) => e.textContent);
  ok("ว่างแล้วบอกเหตุผล ไม่ใช่หน้าเปล่า", /ตัวกรอง|rebuild/.test(await p.$eval("#admLog", (e) => e.textContent)));

  await p.click('#ptabs button[data-page="manage"]');
  await p.waitForTimeout(200);
  ok("กดกลับมาแท็บจัดการข่าวได้", !(await p.$eval("#pgManage", (e) => e.hidden)) && !(await p.$eval("#scopes", (e) => e.hidden)));
  ok("ไม่มี JS error", errs.length === 0, errs.join(" | "));

  await browser.close();
}

// ── [7] ครอบทุกช่อง ไม่ใช่แค่ข่าว 2 ช่อง ────────────────────────────────
// เจ้าของสั่ง: "log activities ต่างๆ ไว้แก้ปัญหา" — ของเดิมบันทึกแค่ trend/feeds กับ ir/feeds
// ซึ่งเป็น 2 จุดจาก 20 จุด และไม่ใช่จุดที่พังบ่อยที่สุด (X/YouTube พึ่งเซิร์ฟเวอร์อาสาสมัคร)
console.log("\n[7] บันทึกครอบทุกช่อง และทุกชื่อต้องแปลเป็นภาษาคนได้");
{
  const admin = fs.readFileSync("../admin/app.js", "utf8");
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = d + "/" + e.name;
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith(".js")) files.push(f);
    }
  })("../functions");

  const sources = new Set();
  const builtTrue = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/startLog\("([^"]+)"\)/g)) sources.add(m[1]);
    // ตัวไลบรารีเองมีคำนี้ในคอมเมนต์/ค่าปริยาย ไม่นับ — ดูเฉพาะ endpoint ที่เรียกใช้
    if (!f.includes("_lib/") && /built:\s*true/.test(src)) builtTrue.add(f.replace("../functions/", ""));
  }

  // ช่องที่พังบ่อยที่สุดต้องอยู่ในนั้นแน่ๆ
  for (const need of ["trend/feeds", "ir/feeds", "trend/trending", "trend/xtrends",
                      "trend/yttrends", "trend/kwcheck", "trend/archive", "sd/news",
                      "api/allow", "api/flags"]) {
    ok(`บันทึกช่อง ${need} ด้วย`, sources.has(need));
  }

  // ⚠️ ทุกชื่อที่บันทึกได้ ต้องมีคำแปลไทย ไม่งั้นเจ้าของเห็นเป็น path ของโค้ด
  for (const s2 of [...sources].sort()) {
    ok(`แปลชื่อ "${s2}" เป็นภาษาคนได้`, admin.includes(`"${s2}":`));
  }

  // ⚠️ กฎโควตา: `built: true` ใช้ได้เฉพาะ endpoint ที่มี cache key เดียว (ข่าว PR / ข่าว IR)
  //    endpoint ที่ cache key แตกตามพารามิเตอร์ ถ้าส่ง built:true จะเขียน KV ทุก build = โควตาหมด
  ok("มีแค่ข่าว PR/IR ที่บันทึกทุก build (ที่เหลือบันทึกเฉพาะตอนผิดปกติ)",
     [...builtTrue].sort().join(",") === "api/ir/feeds.js,api/trend/feeds.js",
     [...builtTrue].join(","));

  // ⚠️ ตัวกันเขียนซ้ำ — ถ้าต้นทางล่มยาว ทุก request จะเป็น build ที่ error
  const lib = fs.readFileSync("../functions/api/_lib/syslog.js", "utf8");
  ok("มีตัวกันเขียนซ้ำเรื่องเดิมรัวๆ", /throttled\(/.test(lib) && /caches\.default/.test(lib));
  ok("ตัวกันเขียนซ้ำใช้กับของที่ไม่ใช่ build ปกติเท่านั้น", /if \(!built\)[\s\S]{0,200}?throttled\(/.test(lib));

  // ⚠️ cache hit ห้ามเขียน log — ต้อง return ออกก่อนถึง startLog เสมอ
  for (const f of ["api/trend/trending.js", "api/trend/xtrends.js", "api/trend/yttrends.js",
                   "api/trend/kwcheck.js", "api/sd/news.js"]) {
    const src = fs.readFileSync("../functions/" + f, "utf8");
    const hitAt = src.search(/if \(hit\) return/);
    const logAt = src.indexOf("startLog(");
    ok(`${f}: cache hit ออกก่อนบรรทัด log`, hitAt !== -1 && logAt > hitAt);
  }
}

// ── [8] ใช้ไล่ปัญหาได้จริง — 6 ข้อที่เจ้าของทักไว้ (21 ส.ค. 2026) ──────────
console.log("\n[8] drill-down · delta · ระดับความรุนแรง · เวลา · 2 โซน · ตัวกรอง");
{
  const now = Date.now();
  const mk = (o) => ({ at: new Date(o.t).toISOString(), env: "prod", ok: true, ms: 0,
    counts: {}, drops: {}, upstream: [], ai: 0, kvWrites: 0, cache: "", note: "", ...o });
  const rows = [
    mk({ t: now - 1e3, src: "trend/feeds", ms: 8412, cache: "build+verify",
         counts: { news: 309, alert1: 272, alert2: 166, pruned: 4 },
         drops: { "false-cp": 2, pruned: 4, "by-owner": 1 }, ai: 6, kvWrites: 1, dropped: 7,
         items: [{ why: "false-cp", t: "ทรูธโซเชียล ขาดทุนหนัก", u: "https://a/1", c: "alert1" },
                 { why: "pruned", t: "7 ยักษ์ลุย เทเลฟาร์มาซี", u: "https://a/2", c: "alert1" },
                 { why: "by-owner", t: "เอรียา ลุยสะวิงซีพีเคซี", u: "https://a/3", c: "alert1" }] }),
    mk({ t: now - 36e5, src: "trend/feeds", ms: 7100, cache: "build",
         counts: { news: 310, alert1: 270, alert2: 168, pruned: 0 }, kvWrites: 1 }),
    mk({ t: now - 2e5, src: "trend/yttrends", ms: 8402, counts: { items: 0 },
         upstream: [{ host: "invidious.io", err: "timeout" }],
         note: "ต้นทางล่มทั้งหมด — เสิร์ฟของเก่าที่เก็บไว้" }),
    mk({ t: now - 3e5, src: "ir/feeds", ok: false, ms: 4200, counts: { news: 0 },
         note: "KV put failed: quota exceeded" }),
    mk({ t: now - 40 * 864e5, src: "trend/feeds", ms: 5000, counts: { news: 300 },
         drops: { pruned: 9 }, trimmed: true }),
  ];

  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.route("**/api/log*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: rows, total: rows.length }) }));
  // ปลอม API อื่นที่หน้า admin เรียกด้วย — sandbox ยิงเน็ตออกไม่ได้
  await ctx.route("**/api/**", (r) => {
    if (/\/api\/log/.test(r.request().url())) return r.fallback();
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sources: {}, alertVerify: {}, swept: {}, items: [] }) });
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`${BASE}/admin/`, { waitUntil: "load" });
  await p.click('#ptabs button[data-page="log"]');
  await p.waitForTimeout(500);
  await p.selectOption("#logDays", "0");
  await p.waitForTimeout(250);

  // [1] drill-down — จำนวนอย่างเดียว audit ไม่ได้ ต้องกดดูได้ว่าข่าวชิ้นไหน
  ok("มีปุ่มกดดูรายการ", (await p.$$(".logmore")).length > 0);
  await p.click(".loglist > li:first-child .logmore");
  await p.waitForTimeout(200);
  const drill = await p.$$eval("#drill0 li", (els) => els.filter((e) => !e.hidden).map((e) => e.textContent.replace(/\s+/g, " ").trim()));
  ok("กางแล้วเห็นพาดหัวข่าวที่ถูกตัดจริง", drill.length === 3 && drill.some((t) => t.includes("ทรูธโซเชียล")), JSON.stringify(drill));
  ok("มีลิงก์ให้กดไปดูข่าวต้นทาง", (await p.$$("#drill0 a[href]")).length === 3);
  // กดที่ป้ายเหตุผล = เห็นเฉพาะข่าวที่ถูกตัดด้วยเหตุผลนั้น
  await p.click(".loglist > li:first-child .logchip.cut");
  await p.waitForTimeout(200);
  const one = await p.$$eval("#drill0 li", (els) => els.filter((e) => !e.hidden).length);
  ok("กดป้ายเหตุผลแล้วกรองเหลือเฉพาะเหตุผลนั้น", one === 1, String(one));

  // [2] delta — ยอดสะสมล้วนๆ ทำให้ "ข่าวหายไป 5 ชิ้น" จมอยู่ในความปกติ
  const nums = await p.$eval(".loglist > li .logbody.nums", (e) => e.textContent.replace(/\s+/g, " ").trim());
  ok("แสดงส่วนต่างจากรอบก่อน", /\(-1\)/.test(nums) && /\(\+2\)/.test(nums), nums);
  ok("ส่วนต่างมีวงเล็บ ไม่ให้อ่านติดกับยอดสะสม", !/309-1/.test(nums), nums);

  // [3] 3 ระดับ — จุดเขียวทุกแถวแปลว่าไม่มีทางรู้ว่ารอบไหนพัง
  const lv = await p.$$eval(".loglist > li", (els) => els.map((e) => e.className));
  ok("รอบที่ error = ล้มเหลว", lv.filter((c) => c.includes("lv-fail")).length === 1, JSON.stringify(lv));
  ok("รอบที่ต้นทางล่ม/ได้ 0 รายการ = ผิดสังเกต", lv.filter((c) => c.includes("lv-warn")).length === 1, JSON.stringify(lv));
  ok("รอบปกติไม่ถูกทำเป็นสีเตือน", lv.filter((c) => c.includes("lv-ok")).length === 3, JSON.stringify(lv));
  ok("สรุปด้านบนบอกจำนวนรอบที่มีปัญหา",
     /ล้มเหลว 1/.test(await p.$eval("#logMeta", (e) => e.textContent)) &&
     /ผิดสังเกต 1/.test(await p.$eval("#logMeta", (e) => e.textContent)));
  ok("รอบที่ล้มเหลวเก็บรายละเอียด error ไว้ด้วย",
     (await p.$$eval(".lognote", (e) => e.map((x) => x.textContent))).some((t) => t.includes("quota")));

  // [4] เวลา — 0 ms ไม่มีทางเป็นเวลาจริงของงาน build
  const ms = await p.$$eval(".logms", (els) => els.map((e) => e.textContent.trim()));
  ok("แสดงเวลาที่วัดได้จริง ไม่ใช่ 0 ms", ms.every((t) => !/\b0 ms/.test(t)), JSON.stringify(ms));
  ok("เวลานานๆ อ่านเป็นวินาที", ms.some((t) => t.includes("8.4 วิ")), JSON.stringify(ms));

  // [5] แยกโซนตัวเลขกับโซนเหตุผล
  const first = await p.$eval(".loglist > li", (e) => ({
    nums: e.querySelector(".logbody.nums")?.textContent || "",
    whys: e.querySelector(".logbody.whys")?.textContent || "",
  }));
  ok("โซนตัวเลขกับโซนเหตุผลแยกคนละบรรทัด", !!first.nums && !!first.whys);
  ok("ตัวเลข pipeline ไม่ปนอยู่ในโซนเหตุผล", !first.whys.includes("News"), first.whys.slice(0, 60));
  ok("เหตุผลไม่ปนอยู่ในโซนตัวเลข", !first.nums.includes("✂"), first.nums.slice(0, 60));
  // ⚠️ เหตุผลต้องเป็นภาษาคน ไม่ใช่รหัสดิบ (กฎเดียวกับ WHY_TH)
  ok("แปลเหตุผลเป็นภาษาคนครบ รวม pruned", !first.whys.includes("pruned"), first.whys.slice(0, 80));

  // [6] ตัวกรอง — log โตเป็นร้อยแถวภายในเดือนเดียว
  await p.fill("#logQ", "เทเลฟาร์มาซี");
  await p.waitForTimeout(250);
  ok("ค้นหาถึงพาดหัวข่าวที่อยู่ในรายละเอียด", (await p.$$(".loglist > li")).length === 1);
  await p.fill("#logQ", "");
  await p.selectOption("#logWhy", "pruned");
  await p.waitForTimeout(250);
  ok("กรองตามเหตุผลการตัดได้", (await p.$$(".loglist > li")).length === 2);
  await p.selectOption("#logWhy", "");
  await p.selectOption("#logDays", "7");
  await p.waitForTimeout(250);
  ok("กรองตามช่วงวันที่ได้", (await p.$$(".loglist > li")).length === 4);
  await p.selectOption("#logSrc", "trend/feeds");
  await p.waitForTimeout(250);
  ok("กรองตามช่องได้ (ใช้ร่วมกับตัวกรองอื่น)", (await p.$$(".loglist > li")).length === 2);

  // นโยบายเก็บ: แถวเก่าไม่มีรายละเอียดแล้ว ต้องบอกว่าทำไม ไม่ใช่กางแล้วเจอว่าง
  await p.selectOption("#logSrc", "");
  await p.selectOption("#logDays", "0");
  await p.waitForTimeout(250);
  await p.click(".loglist > li:nth-child(5) .logmore");
  await p.waitForTimeout(200);
  ok("แถวเก่าที่ถอดรายละเอียดออกแล้ว บอกเหตุผลให้ผู้ใช้รู้",
     /เก่าเกิน 30 วัน/.test(await p.$eval("#drill4", (e) => e.textContent)));

  ok("ไม่มี JS error", errs.length === 0, errs.join(" | "));
  await browser.close();
}

// ── [9] นโยบายเก็บฝั่งเซิร์ฟเวอร์ ─────────────────────────────────────────
console.log("\n[9] สรุปเก็บยาว รายละเอียดเก็บสั้น");
{
  const kv = fakeKV();
  const detail = () => ({ items: [{ why: "pr", t: "x", u: "https://a", c: "alert1" }], dropped: 1 });
  for (let i = 0; i < 60; i++) { resetLog(); await writeLog(envOf(kv), { src: "s", ...detail() }); }
  const saved = await readLog(envOf(kv));
  const withItems = saved.filter((r) => r.items).length;
  ok("แถวใหม่ๆ ยังมีรายละเอียดรายชิ้น", withItems > 0 && withItems <= 40, String(withItems));
  ok("แถวเก่าถูกถอดรายละเอียดออก แต่แถวสรุปยังอยู่", saved.length === 60 && saved.some((r) => r.trimmed));
  ok("แถวที่ถูกถอดยังมีตัวเลขสรุปครบ", saved.filter((r) => r.trimmed).every((r) => r.src === "s"));

  // เพดานรายชิ้นต่อแถว — กันไม่ให้ blob โตจนอ่าน/เขียนช้า
  resetLog();
  const L = startLog("s");
  for (let i = 0; i < 40; i++) L.item("pr", "หัวข้อ " + i, "https://a/" + i, "alert1");
  ok("เก็บรายชิ้นไม่เกินเพดานต่อแถว", L.items.length === 15, String(L.items.length));
  ok("แต่ยังนับของที่เกินเพดานไว้ บอกได้ว่า 'แสดง 15 จาก 40'", L.dropped === 40, String(L.dropped));
}


console.log("\n" + (fail ? "❌ ตก" : "✅ ผ่านหมด") + " — ผ่าน " + pass + " · ตก " + fail + "\n");
process.exit(fail ? 1 : 0);
