/* 🔖 คลังข่าว 2 แท็บ — "ทั้งหมด" กับ "ปลาหมอคางดำ" (เจ้าของสั่ง 16 ก.ย. 2026)
 *
 * เจ้าของสั่ง 2 ท่อน: "ทำแยกหน้า เป็นอีก tab นึงชื่อ ปลาหมอคางดำ และ lock ไว้ด้วย"
 * แล้วต่อด้วย "ใช้ database เป็นอันนี้แทน" + ลิงก์ชีตใหม่
 * → หน้าใหม่เป็น **คลังคนละก้อน** (`archives/data-blackchin/`) ไม่ใช่การกรองหมวดจากคลังเดิม
 *
 * 3 เรื่องที่เทสต์นี้คุม
 *   [1] แต่ละหน้าอ่าน "โฟลเดอร์ของตัวเอง" — สลับกันเมื่อไหร่ = ข่าวของหน้าที่ล็อกไว้ไปโผล่หน้าสาธารณะ
 *   [2] แถบแท็บเขียนซ้ำ 2 ไฟล์ ต้องตรงกัน (กับดักเดิมของ /issue/ ที่แถบแท็บอยู่ 3 ไฟล์แล้วตกหล่น)
 *   [3] 🔒 เป็นไอคอนล้วน → ต้องมี title + aria-label ไม่งั้นคนใช้ screen reader ไม่รู้ว่าต่างยังไง
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

// ── [3] 🔒 ไอคอนล้วน ต้องมีคำอธิบายเสมอ ───────────────────────────
console.log("\n[3] ป้าย 🔒 ต้องอ่านออกด้วยเสียง");
{
  for (const [label, s] of [["index.html", IDX], ["blackchin.html", BC]]) {
    const locks = [...s.matchAll(/<span class="lock"[^>]*>/g)].map((m) => m[0]);
    ok(`${label}: มีป้าย 🔒`, locks.length > 0);
    ok(`${label}: ทุกป้ายมี title + aria-label`,
       locks.length > 0 && locks.every((t) => t.includes("title=") && t.includes("aria-label=")),
       JSON.stringify(locks));
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

await browser.close();
console.log(`\n${fail ? "❌ ตก" : "✅ ผ่านหมด"} — ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
