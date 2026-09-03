/**
 * synthbudget.mjs — สรุปพังต้องไม่หายเงียบ + เพดานคำตอบต้องพอ
 *
 * 🐞 เจ้าของเจอ 2 ก.ย. 2026 — กดปุ่ม "🔄 สรุปใหม่" แล้ว
 *      "ไม่สรุปใหม่ใช้อันเดิมเป๊ะๆ · comment ตัวอย่างหายหมด · คำที่พูดถึงบ่อยหายหมด"
 *    แต่หน้าเว็บขึ้นว่า **"สรุปใหม่แล้ว ✓"**
 *
 * ต้นเหตุ 2 ชั้นซ้อนกัน
 *   1. เพดานคำตอบตั้งตายตัวที่ 1,500 — พอเพิ่มใบถอดความจาก 4 เป็น 6 ใบ
 *      คำตอบถูกตัดกลางคัน → JSON พัง
 *      ⚠️ เผื่อน้อยไม่ได้เพราะ **opus เขียนความคิดก่อนตอบ** กินโทเคนก่อนถึง JSON
 *         (BASELINE.md: ก้อน 6 ข้อ ต้องการ JSON จริง ~150 แต่เพดาน 1,140 ยังไม่พอ)
 *   2. `catch` คืน { summary:"", keywords:[], samples:[] } **เงียบๆ**
 *      หน้าเว็บเอา [] ไปทับของเดิม → คำกับตัวอย่างหายเกลี้ยง
 *      ส่วนสรุปคงของเก่าไว้เพราะ "" ถูกมองว่า "ไม่มีค่า"
 *
 * 📏 กับดัก "ไม่รู้ ≠ ค่าใดค่าหนึ่ง" ตรงๆ — บทเรียนเดียวกับที่ classifyTwoLens
 *    แก้ไปแล้วตั้งนานแต่ synthesize ไม่เคยได้รับการแก้เลย
 *
 * [2] และ [3] คือข้อสำคัญที่สุด
 */
import { analyze } from "./w.mjs";

let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

const COMMENTS = [
  { text: "ซีพี ทำดีมากครับ", likes: 4 },
  { text: "เฉยๆ นะ", likes: 9 },
  { text: "ไม่ชอบเลย แพงไป", likes: 6 },
  { text: "ดีจัง", likes: 2 },
  { text: "ปลาหมอคางดำระบาด", likes: 1 },
  { text: "แย่มาก", likes: 0 },
];
const LABEL = ["Positive", "Neutral", "Negative", "Positive", "Neutral", "Negative"];

let synthMode = "ok", budgets = [];
globalThis.fetch = async (u, o) => {
  const url = String(u);
  const res = (j) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => j });
  if (url.includes("scrapecreators")) {
    if (url.includes("/comments")) return res({ comments: COMMENTS, credits_remaining: 9 });
    return res({});
  }
  if (url.includes("anthropic")) {
    const b = JSON.parse(o.body), ut = b.messages[0].content;
    if (ut.includes("คอมเมนต์:\n")) {
      const lines = ut.split("คอมเมนต์:\n")[1].split("\n").filter(Boolean);
      return res({ content: [{ text: JSON.stringify(lines.map((_, i) => ({ i: i + 1, cp: LABEL[i], oc: LABEL[i], s: 0 }))) }],
                   usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
    }
    budgets.push(b.max_tokens);
    if (synthMode === "truncated") {
      /* เคสจริงของเจ้าของ: คำตอบถูกตัดกลางคัน JSON ไม่ปิด */
      return res({ content: [{ text: '{"summary":"คอมเมนต์ส่วนใหญ่ในโพส (39 จาก 41 ใบ) เป็นกลาง คือพูดกันเรื่องนิเวศ' }],
                   usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "max_tokens" });
    }
    if (synthMode === "junk") {
      return res({ content: [{ text: "ขอโทษครับ ผมไม่สามารถตอบเป็น JSON ได้" }],
                   usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
    }
    return res({ content: [{ text: JSON.stringify({ summary: "สรุปจริง", keywords: ["ซีพี"],
                   samples: ["a", "b", "c", "d", "e", "f"] }) }],
                 usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
  }
  return res({});
};
const run = () => analyze({ url: "https://www.facebook.com/reel/1", target: "overall", samples: true },
  { ANTHROPIC_API_KEY: "k", CLAUDE_MODEL: "claude-opus-5", SCRAPECREATORS_API_KEY: "s" });

/* ── [1] เพดานคำตอบต้องคิดตามจำนวนใบที่ถอดความ ไม่ใช่ตายตัว ── */
budgets = [];
let r = await run();
const synthBudget = budgets[0];
console.log("   เพดานที่ให้รอบสรุป: " + synthBudget + " (ถอดความ 6 ใบ)");
ok("[1] ⚠️ เพดานมากกว่า 1,500 ที่เคยตั้งตายตัวไว้", synthBudget > 1500, String(synthBudget));
ok("[1b] เผื่อพอสำหรับถอดความ 6 ใบ (≥ 4,000)", synthBudget >= 4000, String(synthBudget));
ok("[1c] สรุปปกติยังทำงาน", r.summary === "สรุปจริง" && r.keywords.length > 0 && r.samples.length > 0);
ok("[1d] ไม่ติดธงว่าพัง", !r.synth_failed);

/* ── [2] ⚠️ ถูกตัดกลางคัน → ลองใหม่ด้วยเพดาน 2 เท่า แล้วค่อยยอมแพ้ ── */
synthMode = "truncated"; budgets = [];
r = await run();
console.log("   เพดานที่ลองไป: " + budgets.join(" → "));
ok("[2] ⚠️ ลองใหม่ด้วยเพดานใหญ่ขึ้น ก่อนยอมแพ้", budgets.length === 2 && budgets[1] > budgets[0],
   budgets.join(" → "));
ok("[2b] 🚫 ยังพัง → **ต้องติดธงบอก** ห้ามเงียบ", !!r.synth_failed, String(r.synth_failed).slice(0, 70));
ok("[2c] ข้อความบอกว่าถูกตัดกลางคัน (ไล่ปัญหาต่อได้)", /ตัดกลางคัน/.test(String(r.synth_failed)));
ok("[2d] ⚠️ ตัวเลข/audit ยังใช้ได้ ไม่พังทั้งการวิเคราะห์",
   r.audit.length === 6 && r.sentiment.positive === 2, JSON.stringify(r.sentiment));

/* ── [3] ⚠️ แกะ JSON ไม่ได้เลย → ติดธง ห้ามคืนของว่างเงียบ ──── */
synthMode = "junk"; budgets = [];
r = await run();
ok("[3] ⚠️ แกะไม่ได้ → ติดธงบอก", !!r.synth_failed, String(r.synth_failed).slice(0, 70));
ok("[3b] ข้อความติดคำตอบดิบมาด้วย (ไล่ปัญหาต่อได้)", /ไม่สามารถตอบเป็น JSON/.test(String(r.synth_failed)));
ok("[3c] 🚫 ไม่ลองใหม่ (ไม่ได้ถูกตัด — ลองไปก็ได้เหมือนเดิม เปลืองเปล่า)", budgets.length === 1,
   budgets.join(" → "));

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
