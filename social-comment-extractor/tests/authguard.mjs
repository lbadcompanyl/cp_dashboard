/**
 * authguard.mjs — 🔐 กันคนนอกยิงเข้า worker
 *
 * เจ้าของ + ห้อง Zocial ถาม 3 ก.ย. 2026:
 *   "comment-sentiment.*.workers.dev ตอนนี้มีอะไรกันไม่ให้คนนอกยิงเข้ามาหรือยัง?"
 * คำตอบตอนนั้น: **ยังไม่มีเลย** ยกเว้น GET /feedback
 * เจ้าของสั่ง: "ต้องเพิ่ม shared secret ก่อนที่ห้อง Zocial จะเริ่มเรียก"
 *
 * precedent ที่ทำให้ต้องมี: `/debugmeta` ที่เคยหลุด production แล้วเปิดให้ใครก็ได้ยิง
 * จนเผาเครดิต ScrapeCreators ที่จ่ายเงิน (กฎเหล็กข้อ 2 ใน CLAUDE.md)
 *
 * [1] และ [4] คือข้อสำคัญที่สุด
 *   [1] ไม่ตั้งกุญแจ = **ปิด** ไม่ใช่เปิดให้ทุกคน (ลืมตั้งแล้วต้องไม่หลุด)
 *   [4] 🚫 ห้ามเอากุญแจไปบังคับกับ endpoint ที่หน้าเว็บเรียก — จะพังทันทีและกุญแจก็ไม่ลับอยู่ดี
 */
import worker from "./w.mjs";

let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

const KEY = "s3cr3t-for-test";
const ENV = { ANTHROPIC_API_KEY: "k", SCRAPECREATORS_API_KEY: "s" };
const post = (path, env = ENV, headers = {}, body = { texts: ["ทดสอบ"] }) =>
  worker.fetch(new Request("https://w.dev" + path, {
    method: "POST", headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }), env, {});

/* AI ไม่ถูกเรียกในเทสต์นี้ — ถ้าโค้ดเผลอเรียกแปลว่าด่านกุญแจไม่ทำงาน */
let aiCalls = 0;
globalThis.fetch = async () => { aiCalls++; throw new Error("ไม่ควรมีการยิงออกไปข้างนอก"); };

/* ── [1] ⚠️ ไม่ตั้ง WORKER_KEY = ปิด ไม่ใช่เปิดให้ทุกคน ────────── */
let r = await post("/sentiment", ENV);
let j = await r.json();
ok("[1] ⚠️ ไม่ตั้ง WORKER_KEY → /sentiment ปิด (403)", r.status === 403 && j.error === "endpoint_disabled",
   `${r.status} ${j.error}`);
ok("[1b] และไม่ได้ยิงออกไปข้างนอกเลย (ไม่เผาเงิน)", aiCalls === 0, `ยิงไป ${aiCalls} ครั้ง`);

/* ── [2] ตั้งกุญแจแล้ว แต่ไม่ส่งมา / ส่งผิด → 403 ─────────────── */
const E2 = { ...ENV, WORKER_KEY: KEY };
r = await post("/sentiment", E2); j = await r.json();
ok("[2] ตั้งกุญแจแล้วแต่ไม่ส่งมา → 403", r.status === 403 && j.error === "bad_key", `${r.status} ${j.error}`);
r = await post("/sentiment", E2, { "x-worker-key": "wrong-key" }); j = await r.json();
ok("[2b] ส่งกุญแจผิด → 403", r.status === 403 && j.error === "bad_key");
ok("[2c] ยังไม่ยิงออกไปข้างนอกเลยสักครั้ง", aiCalls === 0, `ยิงไป ${aiCalls} ครั้ง`);

/* ── [3] กุญแจถูก → ผ่านด่าน (ไปต่อจนถึงขั้นเรียก AI) ─────────── */
r = await post("/sentiment", E2, { "x-worker-key": KEY }, { texts: ["ทดสอบ"], profile: "cp_comment" });
ok("[3] กุญแจถูก → ผ่านด่าน ไม่ใช่ 403", r.status !== 403, `status ${r.status}`);
ok("[3b] ส่งทาง ?key= ก็ได้", (await (await worker.fetch(new Request(
   "https://w.dev/sentiment?key=" + KEY, { method: "POST",
   headers: { "content-type": "application/json" }, body: JSON.stringify({ texts: ["x"] }) }),
   E2, {})).json()).error !== "bad_key");

/* ── [4] 💰 endpoint ที่เผาเงิน ต้องปิดจากข้างนอกทุกตัว (เจ้าของสั่ง 4 ก.ย. 2026) ──
   🔴 ของเดิมกันแค่ /sentiment ตัวเดียว อีก 6 ตัวเปิดให้ใครก็ยิงได้
      /analyze ยิงทีเดียวได้ถึง 2,000 คอมเมนต์ = เผาทั้งเครดิต ScrapeCreators และค่า Claude */
const before4 = aiCalls;   /* ⚠️ [3] ยิงออกไปแล้วโดยตั้งใจ (กุญแจถูก) — ต้องวัดเฉพาะช่วงนี้ */
for (const ep of ["/analyze", "/resynth", "/paraphrase", "/comments", "/classify"]) {
  const rr = await post(ep, E2, {}, { url: "https://www.facebook.com/reel/1", texts: ["x"], items: [{ text: "x" }] });
  const jj = await rr.json().catch(() => ({}));
  ok(`[4] 💰 ${ep} ยิงจากข้างนอกโดยไม่มีกุญแจ → 403`,
     rr.status === 403 && jj.error === "bad_key", `${rr.status} ${jj.error || ""}`);
}
ok("[4b] 💰 ถูกปฏิเสธก่อนยิงออกไปข้างนอก (ไม่เผาเงินสักบาท)", aiCalls === before4, `ยิงเพิ่ม ${aiCalls - before4} ครั้ง`);

/* ── [4c] 🔓 แต่ถ้ามาทาง /issue/api/sentiment/* (ผ่าน Cloudflare Access แล้ว) ต้องผ่าน ──
   ธง INTERNAL ถูกตั้งใน [[route]].js ฝั่งเซิร์ฟเวอร์ที่เดียว **ผู้เรียกยัดเข้ามาเองไม่ได้**
   เพราะมันอยู่ใน env ไม่ใช่ header/query */
for (const ep of ["/analyze", "/classify"]) {
  const rr = await post(ep, { ...E2, INTERNAL: true }, {},
    { url: "https://www.facebook.com/reel/1", texts: ["x"], items: [{ text: "x" }] });
  const jj = await rr.json().catch(() => ({}));
  ok(`[4c] 🔓 ${ep} มาจากข้างใน (หลัง Access) → ผ่านด่านกุญแจ`,
     jj.error !== "bad_key" && jj.error !== "endpoint_disabled", `${rr.status} ${jj.error || ""}`);
}

/* ── [4d] 🚫 ห้ามรับธง INTERNAL จาก header/query ของผู้เรียก ────────────
   ถ้ารับ ใครก็ปลอมเป็น "มาจากข้างใน" ได้ = ด่านทั้งหมดไร้ความหมาย */
let rr = await post("/analyze", E2, { "x-internal": "1", INTERNAL: "true" },
  { url: "https://www.facebook.com/reel/1" });
let jj = await rr.json().catch(() => ({}));
ok("[4d] 🚫 ปลอม header INTERNAL ไม่ได้", rr.status === 403 && jj.error === "bad_key",
   `${rr.status} ${jj.error || ""}`);
rr = await worker.fetch(new Request("https://w.dev/analyze?INTERNAL=true", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: "https://www.facebook.com/reel/1" }) }), E2, {});
jj = await rr.json().catch(() => ({}));
ok("[4e] 🚫 ปลอมผ่าน query string ก็ไม่ได้", rr.status === 403 && jj.error === "bad_key",
   `${rr.status} ${jj.error || ""}`);

/* ── [5] 🌐 ALLOW_ORIGIN ต้องบล็อกจริง ไม่ใช่แค่ตั้ง header ────── */
const E3 = { ...ENV, WORKER_KEY: KEY, ALLOW_ORIGIN: "https://cp-dashboard-680.pages.dev" };
r = await post("/sentiment", E3, { "x-worker-key": KEY, Origin: "https://evil.example" });
j = await r.json();
ok("[5] 🌐 Origin แปลกปลอม → 403 (ของเดิมตอบปกติแล้วเผาเงินไปแล้ว)",
   r.status === 403 && j.error === "origin_not_allowed", `${r.status} ${j.error}`);
r = await post("/sentiment", E3, { "x-worker-key": KEY, Origin: "https://cp-dashboard-680.pages.dev" });
ok("[5b] Origin ของเราเอง → ผ่าน", r.status !== 403 || (await r.json()).error !== "origin_not_allowed");
/* ⚠️ ไม่มี Origin (server-to-server / curl) ต้องผ่าน ไม่งั้นห้องอื่นเรียกไม่ได้เลย
   ตัวที่กันสคริปต์คือ WORKER_KEY ไม่ใช่ Origin */
r = await post("/sentiment", E3, { "x-worker-key": KEY });
ok("[5c] ⚠️ ไม่มี Origin (server-to-server) → ต้องผ่าน", r.status !== 403 || (await r.json()).error !== "origin_not_allowed");

/* ── [6] ไม่ตั้ง ALLOW_ORIGIN → ไม่บล็อกใคร (ของเดิมทำงานเหมือนเดิม) ── */
r = await post("/sentiment", E2, { "x-worker-key": KEY, Origin: "https://evil.example" });
ok("[6] ไม่ตั้ง ALLOW_ORIGIN → ไม่บล็อก (backward compatible)",
   r.status !== 403 || (await r.json()).error !== "origin_not_allowed");

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
