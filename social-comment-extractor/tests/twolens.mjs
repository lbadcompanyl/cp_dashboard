import { classifyTwoLens, normLens, systemTwoLens, TWO_LENS_SHOTS } from "./w.mjs";
let fail = 0;
const ok = (c, m) => { console.log((c ? "✅" : "❌") + " " + m); if (!c) fail++; };

// [1] ค่าที่โมเดลตอบเพี้ยน ต้องไม่กลายเป็น Negative
ok(normLens("negative") === "Negative" && normLens("POSITIVE") === "Positive"
   && normLens("") === "Neutral" && normLens("ไม่รู้") === "Neutral" && normLens(null) === "Neutral",
   "ค่าเพี้ยน/ว่าง → Neutral ไม่ใช่ Negative (ไม่เดาเป็นลบ)");

// ยิง callClaude ปลอมโดยแทน global fetch
const mk = (payload) => { globalThis.fetch = async () => ({
  ok: true, headers: { get: () => null },
  json: async () => ({ content: [{ text: JSON.stringify(payload) }], usage: { input_tokens: 1, output_tokens: 1 } }),
}); };
const env = { ANTHROPIC_API_KEY: "x" };
const texts = ["ก", "ข", "ค", "ง"];

// [2] โมเดลตอบสลับลำดับ → ต้องเรียงกลับตาม i
mk([{ i: 3, cp: "Negative", oc: "Neutral", s: 0 }, { i: 1, cp: "Positive", oc: "Neutral", s: 0 },
    { i: 4, cp: "Neutral", oc: "Neutral", s: 1 }, { i: 2, cp: "Neutral", oc: "Negative", s: 0 }]);
let r = await classifyTwoLens(texts, env, null);
ok(r[0].sentiment_cp === "Positive" && r[2].sentiment_cp === "Negative" && r[3].is_sarcasm === 1,
   "โมเดลตอบสลับลำดับ → เรียงกลับถูกตาม i");

// [3] โมเดลตอบไม่ครบ → ความยาวต้องเท่าเดิม และข้อที่ขาดติดธง missing
mk([{ i: 1, cp: "Negative", oc: "Negative", s: 0 }, { i: 2, cp: "Neutral", oc: "Neutral", s: 0 }]);
r = await classifyTwoLens(texts, env, null);
ok(r.length === 4, "ตอบไม่ครบ → ความยาวยังเท่าจำนวนคอมเมนต์ (ไม่เลื่อนทั้งชุด)");
ok(r[2].missing === true && r[3].missing === true, "ข้อที่โมเดลไม่ตอบ ติดธง missing ไว้");

// [4] โมเดลตอบเป็นขยะ → ต้องไม่ throw
mk({ ไม่ใช่: "array" });
r = await classifyTwoLens(texts, env, null);
ok(r.length === 4 && r.every(x => x.sentiment_cp === "Neutral"), "ตอบเป็นขยะ → ไม่พัง คืน Neutral ทั้งชุด");

// [5] prompt ต้องไม่มี not_related หลงเหลือ + มี few-shot ครบ
const sys = systemTwoLens();
ok(!/not_related/.test(sys), "prompt ไม่มี not_related หลงเหลือ");
ok(TWO_LENS_SHOTS.length === 20, "few-shot 20 ข้อ");
const sar = TWO_LENS_SHOTS.filter(s => s.s === 1).length;
ok(sar === 3, "มีตัวอย่างประชด " + sar + " ข้อ");
const cps = new Set(TWO_LENS_SHOTS.map(s => s.cp));
ok(cps.size === 3, "ตัวอย่างคละครบทั้ง 3 ป้าย (ไม่เอนไปทางเดียว)");

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
