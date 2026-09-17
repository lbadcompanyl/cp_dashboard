/* 🔖 คลังข่าว 2 แท็บ — "ทั้งหมด" กับ "ปลาหมอคางดำ" (เจ้าของสั่ง 16 ก.ย. 2026)
 *
 * เจ้าของสั่ง 2 ท่อน: "ทำแยกหน้า เป็นอีก tab นึงชื่อ ปลาหมอคางดำ และ lock ไว้ด้วย"
 * แล้วต่อด้วย "ใช้ database เป็นอันนี้แทน" + ลิงก์ชีตใหม่
 * → หน้าใหม่เป็น **คลังคนละก้อน** (`archives/data-blackchin/`) ไม่ใช่การกรองหมวดจากคลังเดิม
 *
 * 3 เรื่องที่เทสต์นี้คุม
 *   [1] แต่ละหน้าอ่าน "โฟลเดอร์ของตัวเอง" — สลับกันเมื่อไหร่ = ข่าวของหน้าที่ล็อกไว้ไปโผล่หน้าสาธารณะ
 *   [2] แถบแท็บเขียนซ้ำ 2 ไฟล์ ต้องตรงกัน (กับดักเดิมของ /issue/ ที่แถบแท็บอยู่ 3 ไฟล์แล้วตกหล่น)
 *   [3] ป้าย 🔒 อยู่ที่ **การ์ดคลังข่าวบนหน้าแรก** ที่เดียว (ล็อกทั้ง /archives/ ด้วย Access ตัวเดียว)
 *       และเป็นไอคอนล้วน → ต้องมี title + aria-label ไม่งั้นคนใช้ screen reader ไม่รู้ว่าต่างยังไง
 *
 * ⚠️ **ปลอมไฟล์คลังด้วย page.route ทั้งหมด** — ตั้งใจให้เทสต์ผ่านได้โดยที่ `data-blackchin/`
 *    ยังไม่มีอยู่จริงใน repo (ยังรอ CSV จากเจ้าของ) · ที่วัดคือ "หน้าเว็บไปขอไฟล์ถูกที่ไหม"
 *    ไม่ใช่ "ข้อมูลในไฟล์ถูกไหม"
 */
import fs from "node:fs";
import { launch } from "./browser.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8899";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra ? " → " + extra : "")); }
};

const html = (f) => fs.readFileSync(new URL(`../archives/${f}`, import.meta.url), "utf8");
const IDX = html("index.html");
const BC = html("blackchin.html");
const APP = fs.readFileSync(new URL("../archives/app.js", import.meta.url), "utf8");

/** คลังปลอม 1 ใบ ที่พาดหัวบอกว่ามาจากโฟลเดอร์ไหน — จะได้รู้ว่าหน้าไหนอ่านของใคร */
function fakeArchive(page, dir, headline) {
  return page.route(`**/archives/${dir}/*.json`, (route) => {
    const u = route.request().url();
    const body = u.endsWith("index.json")
      ? { generatedAt: "2026-09-16T00:00:00.000Z", total: 1, noDate: 0, years: [{ y: 2026, n: 1 }] }
      : { o: ["สำนักข่าวทดสอบ"], c: ["ปลาหมอคางดำ"], r: [[headline, "https://example.com/a", 1757980800, 0, [0]]] };
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

const browser = await launch();

// ── [1] แต่ละหน้าอ่านคลังของตัวเอง ────────────────────────────────
console.log("\n[1] แต่ละหน้าอ่านคลังของตัวเอง");
{
  for (const [label, url, wantDir, wantHead, banDir] of [
    ["หน้าหลัก", "/archives/", "data", "ข่าวของคลังกลาง", "data-blackchin"],
    ["ปลาหมอคางดำ", "/archives/blackchin.html", "data-blackchin", "ข่าวของคลังปลาหมอคางดำ", "data"],
  ]) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    const asked = [];
    p.on("request", (r) => {
      const m = r.url().match(/\/archives\/(data[\w-]*)\/[^/]+\.json/);
      if (m) asked.push(m[1]);
    });
    await fakeArchive(p, "data", "ข่าวของคลังกลาง");
    await fakeArchive(p, "data-blackchin", "ข่าวของคลังปลาหมอคางดำ");
    await p.goto(BASE + url, { waitUntil: "networkidle" });
    await p.waitForTimeout(400);

    // 📭 หน้าที่แยกหมวด (blackchin) เปิดมาพับทุกหมวด — ต้องกด "เปิดทั้งหมด" ก่อนถึงเห็นพาดหัว
    //    (ดูหัวข้อ 🗂 ใน CLAUDE.md · เทสต์ที่วัดเนื้อรายการของหน้านั้นต้องกางก่อนเสมอ)
    const all = await p.$('.gseg [data-gall="open"]');
    if (all) { await all.click(); await p.waitForTimeout(250); }

    const txt = await p.$eval("#list", (el) => el.textContent);
    ok(`${label}: ขอไฟล์จาก ${wantDir}/`, asked.length > 0 && asked.every((d) => d === wantDir), JSON.stringify(asked));
    ok(`${label}: 🚫 ไม่แตะ ${banDir}/ เลย`, !asked.includes(banDir), JSON.stringify(asked));
    ok(`${label}: วาดข่าวของคลังที่ถูก`, txt.includes(wantHead), txt.trim().slice(0, 60));
    await ctx.close();
  }
}

// ── [2] แถบแท็บ 2 ไฟล์ต้องตรงกัน ──────────────────────────────────
console.log("\n[2] แถบแท็บเขียนซ้ำ 2 ไฟล์ — ต้องตรงกัน");
{
  // ชื่อแท็บ = ข้อความในลิงก์ หลังถอด tag ย่อยออก
  const tabs = (s) => [...s.matchAll(/<a class="pgtab[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => [m[1], m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()]);
  const a = tabs(IDX), b = tabs(BC);

  ok("หน้าหลักมี 2 แท็บ", a.length === 2, JSON.stringify(a));
  ok("หน้าปลาหมอคางดำมี 2 แท็บ", b.length === 2, JSON.stringify(b));
  ok("ชื่อ+ลิงก์ของแท็บตรงกันทั้ง 2 ไฟล์", JSON.stringify(a) === JSON.stringify(b),
     `\n     index.html    = ${JSON.stringify(a)}\n     blackchin.html = ${JSON.stringify(b)}`);
  ok("ชื่อแท็บมีคำว่า ปลาหมอคางดำ", a.some(([, t]) => t.includes("ปลาหมอคางดำ")), JSON.stringify(a));

  // แท็บที่ active ต้องเป็นของหน้านั้นเอง ไม่งั้นอ่านแล้วไม่รู้ว่าอยู่หน้าไหน
  const onOf = (s) => (s.match(/<a class="pgtab on"[^>]*href="([^"]+)"/) || [])[1];
  ok("หน้าหลัก: แท็บที่เน้นคือ ./", onOf(IDX) === "./", String(onOf(IDX)));
  ok("หน้าปลาหมอคางดำ: แท็บที่เน้นคือ blackchin.html", onOf(BC) === "blackchin.html", String(onOf(BC)));
  ok("แท็บที่เน้นมี aria-current ทั้ง 2 ไฟล์",
     /pgtab on[^>]*aria-current="page"/.test(IDX) && /pgtab on[^>]*aria-current="page"/.test(BC));
}

// ── [3] ป้าย 🔒 อยู่ที่การ์ดหน้าแรกที่เดียว ────────────────────────
//   เจ้าของสั่ง 17 ก.ย. 2026: "access จริงๆ lock ทั้งคลังข่าวเลยง่ายกว่า"
//   → ล็อกทั้ง /archives/ ด้วยนโยบายเดียว **ทั้ง 2 แท็บอยู่หลังล็อกอินเท่ากัน**
//   ติดป้ายที่แท็บใดแท็บหนึ่ง = อ่านเป็น "อีกแท็บเปิดสาธารณะ" ซึ่งไม่จริง
console.log("\n[3] ป้าย 🔒 อยู่ที่การ์ดหน้าแรกที่เดียว");
{
  const LANDING = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  // การ์ดคลังข่าว = ก้อน <a …href="archives/"> ถึง </a>
  const card = (LANDING.match(/<a class="[^"]*card[^"]*"[^>]*href="archives\/"[\s\S]*?<\/a>/) || [])[0] || "";
  ok("หน้าแรกมีการ์ดคลังข่าว", !!card);
  ok("การ์ดคลังข่าวติดป้าย 🔒", /class="lock-badge"/.test(card), card.slice(0, 120));
  const badge = (card.match(/<span class="lock-badge"[^>]*>/) || [])[0] || "";
  ok("ป้าย 🔒 มี title + aria-label (ไอคอนล้วน ต้องอ่านออกด้วยเสียง)",
     badge.includes("title=") && badge.includes("aria-label="), JSON.stringify(badge));

  for (const [label, s] of [["index.html", IDX], ["blackchin.html", BC]]) {
    ok(`${label}: แถบแท็บไม่มีป้าย 🔒 ติดที่แท็บใดแท็บหนึ่ง`,
       !/<span class="lock"/.test(s) && !/pgtab[^>]*>[^<]*🔒/.test(s));
  }
}

// ── [4] ด่านระดับโค้ด — กันไม่ให้ใครถอดกลไกออกเงียบๆ ───────────────
console.log("\n[4] ด่านระดับโค้ด");
{
  ok("app.js อ่านโฟลเดอร์คลังจาก meta data-dir", /meta\[name="data-dir"\]/.test(APP));
  ok("ไม่มี path 'data/' ฝังตายในโค้ดอีก",
     !/fetch\(\s*[`"']data\//.test(APP), "ยังเจอ fetch(\"data/…\") อยู่");
  ok("ทั้ง index.json และ <ปี>.json ยิงผ่าน DATA_DIR",
     (APP.match(/\$\{DATA_DIR\}\//g) || []).length >= 2);
  ok("blackchin.html ชี้ไปที่ data-blackchin", /<meta name="data-dir" content="data-blackchin"/.test(BC));
  ok("index.html ไม่มี data-dir (ใช้ค่าตั้งต้น data)", !/name="data-dir"/.test(IDX));

  // 🚫 repo เป็น public — sheet id ห้ามหลุดเข้ามาไม่ว่าทางไหน
  const SHEET_ID_RE = /[a-zA-Z0-9_-]{40,}/;
  for (const [label, s] of [["index.html", IDX], ["blackchin.html", BC], ["app.js", APP]])
    ok(`${label}: ไม่มี sheet id ปนมา`, !SHEET_ID_RE.test(s.replace(/data:image\/[^"']+/g, "")),
       (s.replace(/data:image\/[^"']+/g, "").match(SHEET_ID_RE) || [""])[0].slice(0, 20));

  const TOOL = fs.readFileSync(new URL("../tools/build-archives.mjs", import.meta.url), "utf8");
  ok("ตัวสร้างไฟล์รับ --out", /--out/.test(TOOL));
  ok("--out กันชื่อโฟลเดอร์แผลงๆ (ลบไฟล์ผิดที่ได้)", /\^\[a-z0-9\]\[a-z0-9_-\]\*\$/i.test(TOOL));
}

// ── [5] คลังยังไม่มีไฟล์ / เซสชันหมดอายุ — ต้องพูดคนละเรื่อง และห้ามโชว์ศัพท์ในโค้ด ──
console.log("\n[5] โหลดคลังไม่ได้ — ต้องบอกให้ถูกเรื่อง");
{
  /* 🐞 เคสจากภาพที่เจ้าของส่งมา 16 ก.ย. 2026:
     Cloudflare ตอบ **หน้า HTML พร้อมสถานะ 200** (หน้า 404 ของมันเอง) ไม่ใช่ 404 เปล่าๆ
     ของเดิม r.ok ผ่าน → r.json() พัง → «Unexpected token '<', "<!DOCTYPE "…» หลุดไปหน้าเจ้าของ */
  const CASES = [
    ["Cloudflare ตอบ HTML พร้อม 200 (เคสจากภาพ)",
     (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!DOCTYPE html><title>404</title>" }),
     { want: "ยังไม่มีข้อมูลในคลังนี้", btn: false }],
    ["ไฟล์ไม่มีจริงๆ (404)",
     (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "not found" }),
     { want: "ยังไม่มีข้อมูลในคลังนี้", btn: false }],
    ["เซสชัน Access หมดอายุ (เด้งไปหน้าล็อกอิน)",
     (route) => route.fulfill({ status: 403, contentType: "text/html", body: "<!DOCTYPE html>login" }),
     { want: "ต้องเข้าสู่ระบบก่อน", btn: true }],
  ];

  for (const [label, handler, exp] of CASES) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.route("**/archives/data-blackchin/*.json", handler);
    await p.goto(BASE + "/archives/blackchin.html", { waitUntil: "networkidle" });
    await p.waitForTimeout(300);
    const o = await p.evaluate(() => ({
      txt: document.querySelector("#list")?.textContent || "",
      btn: !!document.querySelector("#list [data-relogin]"),
    }));
    ok(`${label}: บอกถูกเรื่อง`, o.txt.includes(exp.want), JSON.stringify(o.txt.trim().slice(0, 80)));
    ok(`${label}: ${exp.btn ? "มี" : "ไม่มี"}ปุ่มให้กดต่อ`, o.btn === exp.btn);
    // 🚫 ศัพท์ในโค้ดห้ามหลุดไปหน้าเจ้าของ (กฎข้อ 2 ของ "วิธีคุยกับเจ้าของ")
    ok(`${label}: 🚫 ไม่มีศัพท์ในโค้ดหลุดออกมา`,
       !/Unexpected token|DOCTYPE|is not valid JSON|SyntaxError|undefined/i.test(o.txt),
       JSON.stringify(o.txt.trim().slice(0, 80)));
    await ctx.close();
  }

  const APPJS = fs.readFileSync(new URL("../archives/app.js", import.meta.url), "utf8");
  ok("app.js เช็ค content-type ก่อนแกะ JSON เสมอ", /content-type[\s\S]{0,80}includes\("json"\)/.test(APPJS));
  ok("🚫 ไม่มี fetch ที่ .json() ตรงๆ โดยไม่ผ่านด่าน",
     !/fetch\([^)]*\)[\s\S]{0,40}\.json\(\)/.test(APPJS.replace(/async function fetchArchiveJSON[\s\S]*?\n}/, "")),
     "ยังมี fetch(...).json() ที่ข้ามด่าน");
}

// ── [6] ค้นไม่เจอ ต้องบอกให้ถูกเรื่อง — "คำค้น" ไม่ใช่ "ตัวกรอง" ────
//   🚫 ข้อห้ามของหน้านี้: ห้ามบอกให้ "ลองลดตัวกรองลง" ตอนที่ยังไม่ได้ตั้งตัวกรองอะไรเลย
//   เจอจริง 17 ก.ย. 2026 ตอนลองกับข้อมูลจริง — `hasFilter()` นับคำค้นเป็นตัวกรองด้วย
//   จึงขึ้นกล่อง "ไม่พบข่าวที่ตรงกับที่กรองไว้ · ล้างตัวกรองทั้งหมด" ทั้งที่ไม่มีอะไรให้ลด
console.log("\n[6] ค้นไม่เจอ — ต้องแยก \"คำค้น\" ออกจาก \"ตัวกรอง\"");
{
  for (const [label, url, dir] of [
    ["หน้าหลัก", "/archives/", "data"],
    ["ปลาหมอคางดำ", "/archives/blackchin.html", "data-blackchin"],
  ]) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await fakeArchive(p, dir, "ข่าวทดสอบเรื่องปลาหมอคางดำ");
    await p.goto(`${BASE}${url}?mode=kw`, { waitUntil: "networkidle" });
    await p.waitForTimeout(400);

    // ① พิมพ์คำที่ไม่มีในคลัง โดยไม่ได้ตั้งตัวกรองอะไรเลย
    await p.fill("#q", "zzzไม่มีคำนี้");
    await p.press("#q", "Enter");
    await p.waitForTimeout(400);
    const a = await p.evaluate(() => ({
      txt: (document.querySelector("#list .empty")?.textContent || "").replace(/\s+/g, " ").trim(),
      btn: (document.querySelector("#list .empty .btn")?.textContent || "").trim(),
    }));
    ok(`${label}: 🚫 ไม่บอกให้ลดตัวกรองทั้งที่ไม่ได้กรองอะไร`, !/ลดตัวกรอง|กรองไว้/.test(a.txt), JSON.stringify(a.txt));
    ok(`${label}: บอกว่าไม่เจอคำที่ค้น พร้อมคำนั้น`, a.txt.includes("zzzไม่มีคำนี้"), JSON.stringify(a.txt));
    ok(`${label}: ปุ่มเป็น "ล้างคำค้น" ไม่ใช่ล้างตัวกรอง`, a.btn === "ล้างคำค้น", JSON.stringify(a.btn));

    // ② กดปุ่มแล้วต้องได้ข่าวกลับมา
    await p.click("#list .empty .btn");
    await p.waitForTimeout(400);
    // หน้าที่แยกหมวดต้องกางก่อนถึงนับการ์ดได้ (ค่าตั้งต้นพับทุกหมวด)
    const all2 = await p.$('.gseg [data-gall="open"]');
    if (all2) { await all2.click(); await p.waitForTimeout(250); }
    const back = await p.evaluate(() => ({
      q: document.querySelector("#q").value,
      rows: document.querySelectorAll("#list .item").length,
    }));
    ok(`${label}: กดล้างคำค้นแล้วช่องว่าง + ข่าวกลับมา`, back.q === "" && back.rows > 0, JSON.stringify(back));

    // ③ ตั้งตัวกรองจริงแล้วไม่เจอ → ต้องได้ข้อความของตัวกรองเหมือนเดิม
    await p.evaluate(() => {
      for (const [id, v] of [["#from", "1999-01-01"], ["#to", "1999-01-02"]]) {
        const el = document.querySelector(id);
        el.value = v; el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await p.waitForTimeout(400);
    const c = await p.evaluate(() => ({
      txt: (document.querySelector("#list .empty")?.textContent || "").replace(/\s+/g, " ").trim(),
      btn: (document.querySelector("#list .empty .btn")?.textContent || "").trim(),
    }));
    ok(`${label}: กรองจริงแล้วไม่เจอ ยังบอกเรื่องตัวกรองเหมือนเดิม`,
       /กรองไว้/.test(c.txt) && c.btn === "ล้างตัวกรองทั้งหมด", JSON.stringify(c));
    await ctx.close();
  }

  // ด่านระดับโค้ด — กันไม่ให้ใครเอา hasFilter() (ที่นับคำค้นด้วย) กลับมาใช้ตัดสินกล่องนี้
  ok("กล่องว่างตัดสินด้วย hasBoxFilter (ไม่นับคำค้น)", /hasBoxFilter\(\)\s*\n?\s*\?/.test(APP) || /box\.innerHTML = hasBoxFilter\(\)/.test(APP));
  ok("hasBoxFilter ไม่มี state.q / state.judge อยู่ข้างใน",
     /const hasBoxFilter = \(\) => !!\(([^)]*)\)/.test(APP) && !/const hasBoxFilter = \(\) => !!\([^)]*state\.(q|judge)/.test(APP));
}

await browser.close();
console.log(`\n${fail ? "❌ ตก" : "✅ ผ่านหมด"} — ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
