/**
 * dupes.mjs — 🔁 คอมเมนต์ใบเดียวกันห้ามถูกนับ 2 ครั้ง
 *
 * 🐞 เจ้าของเจอ 4 ก.ย. 2026: "ดูว่าทำไมมี comment ซ้ำในเครื่องตรวจ sentiment"
 *    ไล่โค้ดแล้วพบว่า **ไม่มีการกันซ้ำเลยสักจุด** ทั้ง ScrapeCreators และ YouTube
 *
 * เสียหาย 3 ชั้น ไม่ใช่แค่ "อ่านแล้วรก"
 *   1. % ของ sentiment เพี้ยน — ใบที่ซ้ำถูกนับ 2 ครั้ง
 *   2. จ่ายค่า AI ซ้ำฟรีๆ (ตีใบเดิม 2 รอบ)
 *   3. ใบซ้ำมีสิทธิ์ถูกเลือกเป็น "ตัวอย่าง" ทั้งคู่ → การ์ด 2 ใบข้อความเหมือนกัน
 *
 * 🚫 [4] คือข้อที่ห้ามพัง — **ตัดสินไม่ได้ ต้องเก็บไว้ ไม่ใช่ตัดทิ้ง**
 *    คนละคนพิมพ์ "ครับ" เหมือนกันได้ ตัดทิ้ง = คอมเมนต์หายเงียบ
 */
import { analyze } from "./w.mjs";

let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

const ENV = { ANTHROPIC_API_KEY: "k", CLAUDE_MODEL: "claude-opus-5",
              SCRAPECREATORS_API_KEY: "s", YOUTUBE_API_KEY: "y" };

/* คำตอบของ AI ปลอม — ตอบ Neutral ทุกใบ เท่ากับจำนวนที่ส่งมา */
const fakeAI = (ut, res) => {
  if (ut.includes("คอมเมนต์:\n")) {
    const lines = ut.split("คอมเมนต์:\n")[1].split("\n").filter(Boolean);
    return res({ content: [{ text: JSON.stringify(lines.map((_, i) => ({ i: i + 1, cp: "Neutral", oc: "Neutral", s: 0 }))) }],
                 usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
  }
  const n = +((ut.match(/ต้องถอดความ \((\d+) ข้อ/) || [])[1] || 0);
  return res({ content: [{ text: JSON.stringify({ summary: "-", keywords: [],
                 samples: Array.from({ length: n }, (_, k) => "ถอดความ " + (k + 1)) }) }],
               usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
};

const mount = (handler) => {
  globalThis.fetch = async (u, o) => {
    const url = String(u);
    const res = (j) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => j });
    if (url.includes("anthropic")) return fakeAI(JSON.parse(o.body).messages[0].content, res);
    return handler(url, res);
  };
};
const run = (target = "overall") =>
  analyze({ url: "https://www.facebook.com/reel/1", target, samples: true }, ENV);

/* ── [1] 🔴 ต้นทางส่ง cursor เดิมกลับมา = วนดึงหน้าเดิมซ้ำ ───────────
   ของเดิมวนได้ถึง 60 รอบ → ได้คอมเมนต์ชุดเดิมซ้ำเป็นสิบรอบจนครบ limit */
let calls = 0;
const PAGE = [
  { id: "c1", text: "ปลาหมอคางดำระบาดหนัก", author: "A", likes: 5 },
  { id: "c2", text: "แก้ปัญหากันเอาเองนะ", author: "B", likes: 3 },
];
mount((url, res) => {
  if (url.includes("/comments")) { calls++; return res({ comments: PAGE, cursor: "SAME" }); }
  return res({});
});
let r = await run();
console.log(`   ยิงไปหาต้นทาง ${calls} ครั้ง · ได้คอมเมนต์ ${r.fetched_count} ใบ`);
/* ⚠️ 2 ครั้งคือ "น้อยที่สุดที่เป็นไปได้" ไม่ใช่ 1 — จะรู้ว่า cursor ซ้ำ ต้องลองใช้มันก่อน
   ของเดิมไม่มีด่านนี้เลย จะวนจนครบ limit หรือชน guard 60 รอบ = ยิงต้นทางฟรีๆ 60 ครั้ง */
ok("[1] 🔴 cursor เดิมซ้ำ → หยุดทันที ไม่วนต่อ", calls === 2, `ยิงไป ${calls} ครั้ง`);
ok("[1b] ได้ 2 ใบตามจริง ไม่ใช่ซ้ำเป็นสิบ", r.fetched_count === 2, `ได้ ${r.fetched_count}`);
ok("[1c] 💰 และไม่ยิงต้นทางรัวจนชน guard 60 รอบ", calls < 5, `ยิงไป ${calls} ครั้ง`);

/* ── [2] ใบเดียวกันโผล่ 2 หน้า (id ตรงกัน) ────────────────────────── */
let page = 0;
mount((url, res) => {
  if (url.includes("/comments")) {
    page++;
    return page === 1
      ? res({ comments: PAGE, cursor: "P2" })
      : res({ comments: [PAGE[1], { id: "c3", text: "ปลานิลก็ไม่ใช่สัตว์พื้นถิ่น", author: "C" }], cursor: "" });
  }
  return res({});
});
r = await run();
console.log("   ได้: " + r.audit.map(a => a.text.slice(0, 18)).join(" · "));
ok("[2] ใบที่ id ซ้ำถูกตัดออก (ได้ 3 ไม่ใช่ 4)", r.fetched_count === 3, `ได้ ${r.fetched_count}`);
ok("[2b] ⚠️ และบอกจำนวนที่ตัดไป ห้ามตัดเงียบ", r.dupe_count === 1, `dupe_count = ${r.dupe_count}`);
ok("[2c] ใบที่เหลือไม่ซ้ำกันเลย",
   new Set(r.audit.map(a => a.text)).size === r.audit.length,
   JSON.stringify(r.audit.map(a => a.text)));

/* ── [3] ใบเดียวโผล่ทั้งใน list และในกอง reply ที่ซ้อนมา ───────────── */
mount((url, res) => {
  if (url.includes("/comments")) return res({
    comments: [
      { id: "t1", text: "โพสนี้ดีมาก", author: "A",
        replies: [{ id: "r1", text: "เห็นด้วยครับ", author: "B" }] },
      { id: "r1", text: "เห็นด้วยครับ", author: "B" },   // ← ใบเดียวกับ reply ข้างบน
    ], cursor: "" });
  return res({});
});
r = await run();
ok("[3] reply ที่ซ้อนมา + โผล่ใน list ด้วย นับครั้งเดียว", r.fetched_count === 2, `ได้ ${r.fetched_count}`);

/* ── [4] 🚫 ไม่มีรหัส และไม่มีทั้งชื่อทั้งเวลา = **เก็บไว้** ─────────────
   คนละคนพิมพ์ข้อความสั้นเหมือนกันได้ · ตัดทิ้ง = คอมเมนต์หายเงียบ
   (หลักเดียวกับทั้งโปรเจกต์: ตัดพลาดแย่กว่าปล่อยผ่าน) */
mount((url, res) => {
  if (url.includes("/comments")) return res({
    comments: [{ text: "ครับ" }, { text: "ครับ" }, { text: "ครับ" }], cursor: "" });
  return res({});
});
r = await run();
ok("[4] 🚫 ตัดสินไม่ได้ (ไม่มีรหัส/ชื่อ/เวลา) → เก็บครบ 3 ใบ", r.fetched_count === 3, `ได้ ${r.fetched_count}`);
ok("[4b] และไม่รายงานว่าตัดอะไรไป", (r.dupe_count || 0) === 0, `dupe_count = ${r.dupe_count}`);

/* ── [5] ⚠️ คนละคน ข้อความเหมือนกัน = **คนละใบ** ห้ามยุบ ────────────
   ใต้โพสไวรัลมีคนพิมพ์เหมือนกันเป็นสิบ ยุบทิ้ง = ตัวเลขต่ำกว่าจริง */
mount((url, res) => {
  if (url.includes("/comments")) return res({
    comments: [
      { text: "เห็นด้วยครับ", author: "A", time: "2026-09-01T10:00:00Z" },
      { text: "เห็นด้วยครับ", author: "B", time: "2026-09-01T10:05:00Z" },
    ], cursor: "" });
  return res({});
});
r = await run();
ok("[5] ⚠️ คนละคนพิมพ์เหมือนกัน = คนละใบ (ได้ 2)", r.fetched_count === 2, `ได้ ${r.fetched_count}`);

/* ── [6] คนเดิม ข้อความเดิม เวลาเดิม = ใบเดียวกันแน่นอน ────────────── */
mount((url, res) => {
  if (url.includes("/comments")) return res({
    comments: [
      { text: "เห็นด้วยครับ", author: "A", time: "2026-09-01T10:00:00Z" },
      { text: "เห็นด้วยครับ", author: "A", time: "2026-09-01T10:00:00Z" },
    ], cursor: "" });
  return res({});
});
r = await run();
ok("[6] คนเดิม+เวลาเดิม+ข้อความเดิม = ใบเดียว", r.fetched_count === 1, `ได้ ${r.fetched_count}`);

/* ── [7] 💰 ใบที่ซ้ำต้องไม่ถูกส่งไปให้ AI ตี (จ่ายซ้ำฟรีๆ) ──────────── */
let sentToAI = 0;
globalThis.fetch = async (u, o) => {
  const url = String(u);
  const res = (j) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => j });
  if (url.includes("anthropic")) {
    const ut = JSON.parse(o.body).messages[0].content;
    if (ut.includes("คอมเมนต์:\n")) sentToAI += ut.split("คอมเมนต์:\n")[1].split("\n").filter(Boolean).length;
    return fakeAI(ut, res);
  }
  if (url.includes("/comments")) return res({
    comments: [PAGE[0], PAGE[0], PAGE[0], PAGE[1]], cursor: "" });
  return res({});
};
r = await run();
ok("[7] 💰 ส่งให้ AI ตีแค่ 2 ใบ ไม่ใช่ 4", sentToAI === 2, `ส่งไป ${sentToAI} ใบ`);

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
