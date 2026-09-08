/**
 * profiles.mjs — profile-based rubric · และ **cp_comment ต้องไม่ขยับแม้แต่ตัวอักษรเดียว**
 *
 * เจ้าของเคาะ 3 ก.ย. 2026 (หลังห้อง Zocial ถามเรื่องใช้ worker ร่วมกัน):
 *   "ใช้ตัวเดียวกัน แต่แยกเป็น profile (ไม่ใช่ rubric รวมก้อนเดียว และไม่ใช่แยก worker)"
 *   เงื่อนไข: **profile cp_comment ต้องให้ผลเหมือนเดิมเป๊ะ**
 *
 * 🔒 [1] คือด่านที่สำคัญที่สุด — เก็บ sha256 ของ system prompt กับ few-shot ไว้
 *    ตัวเลขความแม่น 92.8% ที่วัดไว้ใน BASELINE.md **ผูกกับ prompt ชุดนี้**
 *    ขยับ prompt = ตัวเลขนั้นใช้อ้างอิงไม่ได้อีกต่อไป โดยไม่มีอะไรบอก
 *
 * 📌 hash เก็บตอน worker v34 (ก่อน refactor เป็น profile) — ยืนยันว่า refactor
 *    ไม่ได้แตะเนื้อ prompt เลย
 *
 * ⚠️ **ถ้าตกเพราะตั้งใจแก้เกณฑ์จริงๆ** ให้ทำ 3 อย่างพร้อมกัน:
 *    1. bump `rubric_version` ของ profile นั้น   2. วัดใหม่แล้วจดลง BASELINE.md
 *    3. ค่อยมาอัปเดต hash ที่นี่ — **ห้ามอัปเดต hash เฉยๆ ให้เทสต์ผ่าน**
 */
import { createHash } from "node:crypto";
import { systemTwoLens, TWO_LENS_SHOTS, PROFILES, getProfile, DEFAULT_PROFILE } from "./w.mjs";

let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };
const sha = (v) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");

/* ── [1] 🔒 REGRESSION — prompt ของ cp_comment ต้องเหมือน v34 เป๊ะ ───── */
const SNAP = {
  system: "0ed2decf1508fe617855f292c779f9923d5d3bf67520559a83d3576609661559",
  shots:  "31ff3033edb9110dfd302f305c71f60b12ef8d68f03682f46e8a54c69977ab9b",
  len: 5773, nshots: 22,
};
const p = getProfile("cp_comment");
const sysNow = p.system(), shotsNow = p.shots();
ok("[1] 🔒 system prompt ของ cp_comment ไม่ขยับเลย (sha256 ตรงกับ v34)",
   sha(sysNow) === SNAP.system, `ยาว ${sysNow.length} (เดิม ${SNAP.len})`);
ok("[1b] 🔒 few-shot ไม่ขยับเลย", sha(shotsNow) === SNAP.shots, `${shotsNow.length} ข้อ (เดิม ${SNAP.nshots})`);
ok("[1c] profile ชี้ไปที่ prompt ตัวเดียวกับที่โค้ดเดิมใช้",
   sysNow === systemTwoLens() && shotsNow === TWO_LENS_SHOTS);

/* ── [2] contract ที่เจ้าของกำหนด ────────────────────────────────── */
ok("[2] มี rubric_version ติดทุก profile", Object.values(PROFILES).every(v => !!v.rubric_version),
   Object.entries(PROFILES).map(([k, v]) => `${k}=${v.rubric_version}`).join(" · "));
ok("[2b] cp_comment มี 2 แกน และแกนหลักคือ cp",
   p.lenses.join(",") === "cp,overall" && p.default_lens === "cp");
ok("[2c] ชี้ไปที่เอกสารเกณฑ์ของตัวเอง", p.doc === "RUBRIC-CP.md");
ok("[2d] บอกว่ารับ input แบบไหน (คนละอย่างกับ news_post ที่จะมาทีหลัง)", p.input === "comment");

/* ── [3] 🚫 ชื่อ profile ที่ไม่รู้จัก ห้ามตกกลับไปตัวปริยายเงียบๆ ─────
   ถ้าตกกลับเงียบ ห้องอื่นพิมพ์ผิดแล้วจะได้ผลจาก rubric คนละตัวโดยไม่มีใครรู้ */
ok("[3] 🚫 profile ที่ไม่รู้จัก → null ไม่ใช่ตัวปริยาย", getProfile("news_post") === null);
ok("[3b] 🚫 ชื่อมั่วก็ต้อง null", getProfile("มั่ว") === null && getProfile("") !== null);
ok("[3c] ไม่ส่งชื่อมา = ใช้ตัวปริยาย (cp_comment)", getProfile().id === DEFAULT_PROFILE);

/* ── [4] news_post ยังไม่มี — ตั้งใจ ─────────────────────────────
   เจ้าของสั่ง: รอห้อง Zocial ตั้งต้น rubric แล้วส่งมา review ก่อน
   ด่านนี้กันไม่ให้ใครใส่เกณฑ์เดาเอาเองไปก่อน */
ok("[4] 🚧 ยังไม่มี profile news_post (รอ rubric จากห้อง Zocial)",
   !PROFILES.news_post, Object.keys(PROFILES).join(","));

/* ── [5] 🚫 เกณฑ์ของงานใหม่ห้ามปนเข้ามาใน prompt ของ cp_comment ─────
   prompt นี้เขียนมาสำหรับ "คอมเมนต์" ถ้ามีใครยัดกฎเรื่องโพสข่าวเข้าไป
   ทั้ง 2 งานจะเบลอพร้อมกัน — ซึ่งเป็นเหตุผลที่เจ้าของเลือกแยก profile */
const banned = ["โพสข่าว", "news_post", "พาดหัวข่าว", "สำนักข่าว"];
const hit = banned.filter(w => sysNow.includes(w));
ok("[5] 🚫 prompt ของ cp_comment ไม่มีเกณฑ์ของงานโพสข่าวปนอยู่", hit.length === 0, hit.join(","));

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด — cp_comment ไม่ขยับ");
process.exit(fail ? 1 : 0);
