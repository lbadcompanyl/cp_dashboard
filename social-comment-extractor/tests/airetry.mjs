/**
 * airetry.mjs — ต้นทาง Claude ล่มชั่วคราว ต้องลองใหม่ให้เอง
 *
 * 🐞 เจ้าของเจอ 2 ก.ย. 2026 — กดปุ่ม "🔄 สรุปใหม่" แล้วได้
 *      "สรุปใหม่ไม่สำเร็จ: Claude API 529 overloaded_error: Overloaded"
 *    529 คือต้นทางโหลดเต็มชั่วคราว หายเองในไม่กี่วินาที
 *    ให้คนมานั่งกดซ้ำเองไม่มีเหตุผล
 *
 * 🚫 แต่ห้ามลองใหม่กับทุก error — 400/401/403 ลองกี่ครั้งก็เหมือนเดิม
 *    เปลืองเวลาผู้ใช้เปล่าๆ (และถ้าโดนจำกัดอัตราอยู่ ยิ่งยิงยิ่งแย่)
 *
 * [1] และ [3] คือข้อสำคัญที่สุด
 */
import { analyze } from "./w.mjs";

let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

const COMMENTS = [{ text: "ดีมากครับ", likes: 3 }, { text: "แพงไป", likes: 1 }];
let plan = [], calls = 0, waited = [];

/* ดัก setTimeout เพื่อวัดว่ารอจริงกี่มิลลิวินาที โดยไม่ต้องรอจริง */
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => { waited.push(ms); return realTimeout(fn, 0); };

globalThis.fetch = async (u, o) => {
  const url = String(u);
  const res = (j, init = {}) => ({
    ok: init.status ? init.status < 400 : true,
    status: init.status || 200,
    headers: { get: (k) => (init.headers || {})[k] ?? null },
    json: async () => j,
  });
  if (url.includes("scrapecreators")) {
    if (url.includes("/comments")) return res({ comments: COMMENTS, credits_remaining: 9 });
    return res({});
  }
  if (url.includes("anthropic")) {
    const step = plan[Math.min(calls, plan.length - 1)];
    calls++;
    if (step && step.status) {
      return res({ error: { type: step.type || "overloaded_error", message: step.msg || "Overloaded" } },
                 { status: step.status, headers: step.headers || {} });
    }
    const ut = JSON.parse(o.body).messages[0].content;
    if (ut.includes("คอมเมนต์:\n")) {
      const lines = ut.split("คอมเมนต์:\n")[1].split("\n").filter(Boolean);
      return res({ content: [{ text: JSON.stringify(lines.map((_, i) => ({ i: i + 1, cp: "Positive", oc: "Positive", s: 0 }))) }],
                   usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
    }
    return res({ content: [{ text: JSON.stringify({ summary: "สรุปจริง", keywords: [], samples: [] }) }],
                 usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
  }
  return res({});
};
const run = async (steps) => {
  plan = steps; calls = 0; waited = [];
  try {
    const r = await analyze({ url: "https://www.facebook.com/reel/1", target: "overall" },
      { ANTHROPIC_API_KEY: "k", CLAUDE_MODEL: "claude-opus-5", SCRAPECREATORS_API_KEY: "s" });
    return { ok: true, r };
  } catch (e) { return { ok: false, msg: String(e && e.message || e) }; }
};

/* ── [1] ⚠️ 529 ครั้งแรก → ลองใหม่แล้วผ่าน ผู้ใช้ไม่ต้องรู้เลย ─── */
let out = await run([{ status: 529 }, {}]);
ok("[1] ⚠️ 529 แล้วลองใหม่ผ่าน — ผู้ใช้ไม่เห็น error", out.ok, out.ok ? "สำเร็จ" : out.msg);
ok("[1b] ยิงจริง 2 ครั้ง (ครั้งแรกล่ม ครั้งที่สองผ่าน)", calls >= 2, `ยิง ${calls} ครั้ง`);
ok("[1c] รอก่อนลองใหม่ ไม่ยิงรัวทันที", waited.length > 0 && waited[0] >= 1000, JSON.stringify(waited));

/* ── [2] 429 ก็ลองใหม่ · และเคารพ retry-after ที่ต้นทางบอก ──── */
out = await run([{ status: 429, type: "rate_limit_error", headers: { "retry-after": "3" } }, {}]);
ok("[2] 429 ก็ลองใหม่", out.ok, out.ok ? "สำเร็จ" : out.msg);
ok("[2b] รอตามที่ต้นทางบอก (retry-after 3 วิ)", waited[0] === 3000, JSON.stringify(waited));

/* ── [3] 🚫 403 ห้ามลองใหม่ — ลองกี่ครั้งก็เหมือนเดิม ───────── */
out = await run([{ status: 403, type: "permission_error", msg: "Request not allowed" }]);
ok("[3] 🚫 403 ไม่ลองใหม่ ยิงครั้งเดียวแล้วบอกเลย", calls === 1, `ยิง ${calls} ครั้ง`);
ok("[3b] และไม่รอเสียเวลาเปล่า", waited.length === 0, JSON.stringify(waited));
ok("[3c] ข้อความยังบอกเลขสถานะครบ", !out.ok && /403/.test(out.msg), out.msg);

out = await run([{ status: 401, type: "authentication_error", msg: "invalid key" }]);
ok("[3d] 🚫 401 ก็ไม่ลองใหม่", calls === 1, `ยิง ${calls} ครั้ง`);

/* ── [4] ล่มยาว → เลิกลอง แล้วบอกตรงๆ ห้ามวนไม่รู้จบ ────────── */
out = await run([{ status: 529 }]);
ok("[4] ล่มยาว → ลองไม่เกิน 3 ครั้ง (ต้นฉบับ + ลองใหม่ 2)", calls === 3, `ยิง ${calls} ครั้ง`);
ok("[4b] แล้วบอกผู้ใช้ตรงๆ ไม่เงียบ", !out.ok && /529/.test(out.msg), out.msg);
ok("[4c] เวลารอเพิ่มขึ้นแบบถอยหลัง (1s → 2s)",
   waited.length === 2 && waited[1] > waited[0], JSON.stringify(waited));

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
