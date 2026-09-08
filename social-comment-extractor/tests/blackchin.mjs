/**
 * blackchin.mjs — profile `cp_blackchin` (ประเด็นปลาหมอคางดำ)
 *
 * เจ้าของสั่งแยก 4 ก.ย. 2026:
 *   "แยกดีกว่า เพราะเผาข้าวโพด ถ้าไม่ได้เอ่ยถึงตัวบริษัทโดยตรงก็อาจหมายถึงชาวสวน"
 *
 * เหตุผลที่แยกจริงๆ: **ประเด็นปลาหมอคางดำ CP ถูกชี้ว่าเป็นต้นตอโดยตรง**
 * คอมเมนต์จึงสะท้อนถึง CP ได้แม้ไม่เอ่ยชื่อ · ประเด็นอื่นใช้กฎนี้ไม่ได้
 *
 * 🔒 [1] คือข้อสำคัญที่สุด — **`cp_comment` ต้องไม่ขยับแม้แต่ตัวอักษรเดียว**
 *    ถ้าขยับ ตัวเลข 92.8% ที่วัดไว้ใช้อ้างอิงไม่ได้อีก และจะไม่มีอะไรเตือน
 *
 * 🔴 [5] ยังไม่เคยวัดความแม่นของ profile นี้ — ต้องบอกผู้ใช้เสมอ
 */
import { createHash } from "node:crypto";
import { PROFILES, getProfile, systemTwoLens, TWO_LENS_SHOTS } from "./w.mjs";

let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };
const sha = (v) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");

/* ── [1] 🔒 เพิ่ม profile ใหม่แล้ว cp_comment ต้องเหมือนเดิมเป๊ะ ────── */
const SNAP = { system: "0ed2decf1508fe617855f292c779f9923d5d3bf67520559a83d3576609661559",
               shots: "31ff3033edb9110dfd302f305c71f60b12ef8d68f03682f46e8a54c69977ab9b" };
const cp = getProfile("cp_comment");
ok("[1] 🔒 prompt ของ cp_comment ไม่ขยับ (sha256 ตรงกับตอนวัด 92.8%)", sha(cp.system()) === SNAP.system);
ok("[1b] 🔒 few-shot ของ cp_comment ไม่ขยับ", sha(cp.shots()) === SNAP.shots);
ok("[1c] และยังชี้ไปที่ของเดิมตัวเดียวกัน",
   cp.system() === systemTwoLens() && cp.shots() === TWO_LENS_SHOTS);

/* ── [2] profile ใหม่มีอยู่จริงและแยกขาดจากตัวเดิม ─────────────────── */
const bc = getProfile("cp_blackchin");
ok("[2] มี profile cp_blackchin", !!bc);
ok("[2b] rubric_version แยกของตัวเอง", bc.rubric_version === "blackchin-v1" &&
   bc.rubric_version !== cp.rubric_version, `${bc.rubric_version} vs ${cp.rubric_version}`);
ok("[2c] 🚫 prompt ต้องไม่ใช่ก้อนเดียวกับ cp_comment", bc.system() !== cp.system());
ok("[2d] 🚫 few-shot ก็ต้องคนละชุด", bc.shots() !== cp.shots());
ok("[2e] ยังวัด 2 แกนเหมือนเดิม แกนหลักคือ cp", bc.lenses.join() === "cp,overall" && bc.default_lens === "cp");

/* ── [3] 🎯 กฎที่ "ต่างจากตัวเดิม" ต้องอยู่ใน prompt จริง ─────────────
   จุดที่ขัดกันชัดที่สุด: prompt ของ cp_comment สั่งว่า "ปลานี่ก็กินได้นะ อร่อย" = Neutral
   ซึ่งเจ้าของแก้เป็น Positive ไป 45 ใบ */
const sys = bc.system();
ok("[3] 🎯 บอกว่าประเด็นนี้ CP คือผู้ถูกกล่าวหา", /ผู้นำเข้า|ถูกกล่าวหา|ถูกชี้ว่าเป็น/.test(sys));
ok("[3b] 🎯 สอนว่า 'กินได้/อร่อย' = Positive (ต่างจาก cp_comment)",
   /กินได้/.test(sys) && /Positive/.test(sys));
ok("[3c] 🎯 สอนว่า 'ระบบนิเวศพัง' = Negative", /ระบบนิเวศ/.test(sys));
ok("[3d] ⚠️ ยังคงกฎ 'ด่ารัฐ ≠ ด่า CP' ไว้", /ด่ารัฐ\s*≠\s*ด่า CP/.test(sys));
/* prompt ของ cp_comment สั่งตรงข้าม — ต้องไม่ติดมาด้วย */
ok("[3e] 🚫 ไม่มีบรรทัดเดิมที่สั่งให้ 'ปลานี่ก็กินได้นะ อร่อย' เป็น Neutral ติดมา",
   !sys.includes("ปลานี่ก็กินได้นะ อร่อย"));

/* ── [4] ตัวอย่างสอน — ต้องคละป้าย และไม่มีใบซ้ำ ──────────────────
   กฎข้อ 2 ของ FEEDBACK.md: เห็นแต่ป้ายเดียวโมเดลจะตอบป้ายนั้นรัว */
const shots = bc.shots();
const byLab = shots.reduce((m, s) => (m[s.cp] = (m[s.cp] || 0) + 1, m), {});
ok("[4] คละครบ 3 ป้าย", ["Positive", "Neutral", "Negative"].every(l => byLab[l] >= 5), JSON.stringify(byLab));
ok("[4b] ไม่มีใบซ้ำ", new Set(shots.map(s => s.t)).size === shots.length);
/* กฎข้อ 6: ตัวอย่างถูกส่งไป **ทุกครั้งที่เรียก** = จ่ายเพิ่มตลอดไป */
const chars = shots.reduce((n, s) => n + s.t.length, 0);
ok("[4c] 💰 ไม่เกิน 40 ใบ (เพดานของ FEEDBACK.md)", shots.length <= 40, `${shots.length} ใบ · ${chars} ตัวอักษร`);
/* ที่มาต้องติดมาด้วย — ไว้ไล่ตอนเช็คข้อสอบรั่ว */
ok("[4d] ทุกใบบอกที่มา (syn = AI แต่ง · real = คอมเมนต์จริง)",
   shots.every(s => s.src === "syn" || s.src === "real"));
ok("[4e] ⚠️ มีคอมเมนต์จริงปนอยู่ด้วย ไม่ใช่ของแต่งล้วน",
   shots.filter(s => s.src === "real").length >= 5,
   `ของจริง ${shots.filter(s => s.src === "real").length} ใบ`);

/* ── [5] 🔴 ต้องประกาศว่ายังไม่ได้วัดความแม่น ──────────────────────
   ห้ามให้ใครอ่านตัวเลขแล้วนึกว่าเชื่อได้เท่า cp_comment ที่วัดมาแล้ว 92.8% */
ok("[5] 🔴 cp_blackchin ติดธงว่ายังไม่ได้วัด", bc.measured === false);
ok("[5b] cp_comment ไม่ได้ติดธงนั้น (วัดแล้ว)", cp.measured !== false);

/* ── [6] 🚫 ชื่อที่ไม่รู้จักยังต้องเป็น null เหมือนเดิม ───────────── */
ok("[6] 🚫 ชื่อมั่ว → null", getProfile("cp_pm25") === null && getProfile("blackchin") === null);

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
