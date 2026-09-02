/**
 * imports.mjs — ไฟล์ใน functions/ ต้อง "ประกอบขึ้นจริง" ได้ทุกไฟล์
 *
 * 🔥 บทเรียนที่แพงที่สุดเรื่องหนึ่ง (2 ก.ย. 2026)
 *    จุลภาคเกินมา 1 ตัวในบรรทัด import ของ trend/feeds.js กับ ir/feeds.js
 *
 *        WEAK_TERMS, ROUNDUP_RE, hlWrap,,
 *                                       ↑ ตัวนี้
 *
 *    Cloudflare Pages รวมทุกไฟล์ใน functions/ เป็นก้อนเดียวก่อน deploy
 *    **ไฟล์เดียวพัง = ทั้งโปรเจกต์ deploy ไม่ได้** ไม่ใช่แค่ endpoint นั้น
 *    ผลคือทุกอย่างที่ push ตั้งแต่วันก่อน — ทั้ง main และทุก branch ของทุก session —
 *    ไม่เคยขึ้นเว็บเลยสักอัน เว็บจริงค้างอยู่ที่ของเมื่อ 2 วันก่อน
 *    **และไม่มีอะไรแจ้งเตือน** ต้องบังเอิญไปเปิดหน้า Deployments ถึงจะเห็น
 *
 * 🚫 ทำไม `node --check` จับไม่ได้ — มันตรวจ syntax แบบสคริปต์ ไม่ได้ประกอบ import จริง
 *    รันแล้วผ่านทั้ง 2 ไฟล์ ทั้งที่พัง · **ห้ามใช้ node --check เป็นด่านเดียว**
 *
 * ✅ ท่าที่จับได้จริง: `import()` ไฟล์นั้นตรงๆ แล้วดูว่า link ผ่านไหม
 *    จับได้ทั้ง syntax พัง · import ชื่อที่ไม่มี export · import ไฟล์ที่ไม่มีอยู่
 *
 * รัน: node tests/imports.mjs
 */
import { readdirSync, statSync, mkdtempSync, cpSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
};

/* ต้องก๊อปไปที่อื่นแล้วใส่ package.json {"type":"module"} ก่อน
   ไม่งั้น node มองไฟล์ .js เป็น CommonJS แล้วบ่นเรื่อง import ทุกไฟล์ (ผลลวง)
   ⚠️ ต้องเอา *-feeds.config.js ที่รากไปด้วย — feeds.js import ข้ามขึ้นไปหามัน */
const tmp = mkdtempSync(join(tmpdir(), "impchk-"));
cpSync(join(ROOT, "functions"), join(tmp, "functions"), { recursive: true });
for (const f of readdirSync(ROOT)) {
  if (/-feeds\.config\.js$/.test(f)) cpSync(join(ROOT, f), join(tmp, f));
}
writeFileSync(join(tmp, "package.json"), '{"type":"module"}\n');

const files = walk(join(tmp, "functions"));
let fail = 0;
for (const f of files.sort()) {
  const rel = f.slice(tmp.length + 1);
  try {
    await import(pathToFileURL(f).href);
  } catch (e) {
    /* ยอมให้พังได้เฉพาะตอนโค้ดในไฟล์ "รัน" แล้วต้องการของที่ไม่มีใน Node
       (env ของ Cloudflare · caches · KV) — นั่นไม่ใช่ปัญหาตอน bundle
       สิ่งที่ห้ามคือ **ประกอบไม่ขึ้น**: syntax พัง · ชื่อที่ import ไม่มี export · หาไฟล์ไม่เจอ */
    const m = String(e && e.message || e);
    const linkErr = e instanceof SyntaxError
      || /does not provide an export|Cannot find module|ERR_MODULE_NOT_FOUND/.test(m);
    if (linkErr) { console.log(`❌ ${rel}\n     ${m.split("\n")[0]}`); fail++; }
    else console.log(`⚠️  ${rel} — ประกอบขึ้นได้ แต่รันไม่ผ่านใน Node (ไม่นับว่าตก): ${m.split("\n")[0]}`);
  }
}
rmSync(tmp, { recursive: true, force: true });

console.log(`\nประกอบ functions/ ทั้งหมด ${files.length} ไฟล์ · ผ่าน ${files.length - fail} · ตก ${fail}`);
if (fail) console.log("🔥 ตกแม้แต่ไฟล์เดียว = Cloudflare สร้างเว็บไม่ได้ทั้งโปรเจกต์ ห้าม push");

/* ── ด่านที่ 2: จับ ",," ในวงเล็บ import ตรงๆ ─────────────────
   ด่านบนจับได้อยู่แล้ว แต่ข้อความ error ของ Node ("Unexpected token ','")
   ไม่ได้บอกว่าอยู่ไฟล์ไหนบรรทัดไหนแบบอ่านง่าย ด่านนี้ชี้ให้เห็นทันที */
let dup = 0;
for (const f of walk(join(ROOT, "functions"))) {
  const src = (await import("node:fs")).readFileSync(f, "utf8");
  const rx = /import\s*\{[^}]*\}/gs;
  for (const m of src.match(rx) || []) {
    if (/,\s*,/.test(m)) {
      console.log(`❌ ${f.slice(ROOT.length + 1)} — มีจุลภาคซ้อนในวงเล็บ import`);
      dup++;
    }
  }
}
console.log(dup ? `❌ เจอจุลภาคซ้อน ${dup} จุด` : "✅ ไม่มีจุลภาคซ้อนในบรรทัด import");

process.exit(fail || dup ? 1 : 0);
