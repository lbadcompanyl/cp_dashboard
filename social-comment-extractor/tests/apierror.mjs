/**
 * apierror.mjs — ข้อความ error จาก Claude API ต้องบอก "เลขสถานะ + ชนิด" เสมอ
 *
 * 🐞 เจ้าของเจอ 2 ก.ย. 2026 — หน้าเว็บขึ้นแค่
 *      "วิเคราะห์ไม่สำเร็จ: Claude API: Request not allowed"
 *    ประโยคเดียวโดดๆ **แยกไม่ออกเลย** ว่าเป็นอะไรใน 4 อย่างนี้
 *      กุญแจผิด (401) · สิทธิ์ไม่ถึง/ถูกบล็อก (403) · คำขอผิดรูป (400) · ยิงถี่ (429)
 *    ทั้งที่ต้นทางส่ง status กับ error.type มาให้แล้ว — โค้ดเราโยนทิ้งเอง
 *
 * 📏 บทเรียนเดียวกับกฎ "ไม่รู้ ≠ ค่าใดค่าหนึ่ง" แต่กลับด้าน:
 *    **เรารู้อยู่แล้ว แต่ไม่บอก** → ไล่ปัญหาต่อไม่ได้ เสียเวลาเดา
 *
 * [1] คือข้อสำคัญที่สุด
 */
import { analyze } from "./w.mjs";

let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

let apiFail = null;
globalThis.fetch = async (u, o) => {
  const url = String(u);
  const res = (j, init = {}) => ({ ok: init.ok !== false, status: init.status || 200,
    headers: { get: () => null }, json: async () => j });
  if (url.includes("scrapecreators")) {
    if (url.includes("/comments")) return res({ comments: [{ text: "ดีมาก", likes: 1 }], credits_remaining: 5 });
    return res({});
  }
  if (url.includes("anthropic")) {
    if (apiFail) return res(apiFail.body, { ok: false, status: apiFail.status });
    const ut = JSON.parse(o.body).messages[0].content;
    if (ut.includes("คอมเมนต์:\n"))
      return res({ content: [{ text: JSON.stringify([{ i: 1, cp: "Neutral", oc: "Positive", s: 0 }]) }],
                   usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
    return res({ content: [{ text: JSON.stringify({ summary: "-", keywords: [], samples: [] }) }],
                 usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
  }
  return res({});
};
const run = () => analyze({ url: "https://www.facebook.com/reel/1", target: "overall" },
  { ANTHROPIC_API_KEY: "k", CLAUDE_MODEL: "claude-opus-5", SCRAPECREATORS_API_KEY: "s" })
  .then(() => null, e => String(e.message || e));

/* ── [1] ⚠️ เคสจริงที่เจ้าของเจอ ─────────────────────────────── */
apiFail = { status: 403, body: { error: { type: "permission_error", message: "Request not allowed" } } };
let m = await run();
console.log("   ข้อความที่ผู้ใช้จะเห็น: " + m);
ok("[1] ⚠️ บอกเลขสถานะ (403)", /403/.test(m), m);
ok("[1b] บอกชนิดของ error", /permission_error/.test(m));
ok("[1c] ยังมีประโยคจากต้นทางอยู่", /Request not allowed/.test(m));
ok("[1d] บอกทางไล่ต่อเป็นภาษาคน (403 = สิทธิ์ของกุญแจ)", /สิทธิ|โมเดล/.test(m));
ok("[1e] บอกด้วยว่าโมเดลไหน (ไล่ต่อได้ว่ากุญแจใช้รุ่นนี้ไม่ได้หรือเปล่า)", /claude-opus-5/.test(m));

/* ── [2] กุญแจผิด — ต้องอ่านออกว่าคนละเรื่องกับ 403 ────────── */
apiFail = { status: 401, body: { error: { type: "authentication_error", message: "invalid x-api-key" } } };
m = await run();
console.log("   401: " + m);
ok("[2] 401 บอกว่าเป็นเรื่องกุญแจ", /401/.test(m) && /ANTHROPIC_API_KEY/.test(m), m);
ok("[2b] 🚫 ห้ามพูดถึงสิทธิ์โมเดล (คนละเรื่อง จะพาไปไล่ผิดทาง)", !/องค์กรจำกัดสิทธิ/.test(m));

/* ── [3] ยิงถี่เกิน — ต้องไม่ปนกับ 2 อันบน ─────────────────── */
apiFail = { status: 429, body: { error: { type: "rate_limit_error", message: "rate limited" } } };
m = await run();
ok("[3] 429 อ่านออกว่าเป็นคนละเรื่อง", /429/.test(m) && /rate_limit_error/.test(m), m);

/* ── [4] ต้นทางไม่ส่งอะไรกลับมาเลย → ห้ามพัง ห้ามเงียบ ────── */
apiFail = { status: 500, body: null };
m = await run();
ok("[4] ต้นทางไม่บอกเหตุผล → ยังได้เลขสถานะ ไม่พังเปล่าๆ",
   /500/.test(m) && /ไม่ได้บอกเหตุผล/.test(m), m);

/* ── [5] คำตอบไม่ใช่ JSON เลย (หน้า error ของ proxy) → ห้ามพัง ─ */
globalThis.fetch = (u) => String(u).includes("anthropic")
  ? { ok: false, status: 502, headers: { get: () => null }, json: async () => { throw new Error("not json"); } }
  : { ok: true, status: 200, headers: { get: () => null },
      json: async () => String(u).includes("/comments")
        ? { comments: [{ text: "ดีมาก", likes: 1 }], credits_remaining: 5 } : {} };
m = await run();
ok("[5] คำตอบไม่ใช่ JSON → ยังบอกเลขสถานะได้ ไม่โยน 'not json' ให้ผู้ใช้อ่าน",
   /502/.test(m) && !/not json/.test(m), m);

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
