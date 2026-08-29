import { classifyTwoLens } from "./w.mjs";
let fail = 0;
const ok = (c, m) => { console.log((c ? "✅" : "❌") + " " + m); if (!c) fail++; };
const texts = ["ก","ข","ค","ง","จ","ฉ"];
const good = [1,2,3,4,5,6].map(i => ({ i, cp: "Negative", oc: "Negative", s: 0 }));

// [1] ครั้งแรกถูกตัด ครั้งที่สองผ่าน → ต้องได้ผลจริง ไม่ใช่ error
let calls = [];
globalThis.fetch = async (u, init) => {
  const body = JSON.parse(init.body); calls.push(body.max_tokens);
  const truncated = calls.length === 1;
  return { ok: true, headers: { get: () => null }, json: async () => ({
    content: [{ text: truncated ? '[{"i":1,"cp":"Neg' : JSON.stringify(good) }],
    stop_reason: truncated ? "max_tokens" : "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }) };
};
let r = await classifyTwoLens(texts, { ANTHROPIC_API_KEY: "x" }, {});
ok(r.length === 6 && r[0].sentiment_cp === "Negative", "ถูกตัดครั้งแรก → ลองใหม่แล้วได้ผลจริง");
ok(calls.length === 2 && calls[1] === calls[0] * 2, `ลองใหม่ด้วยเพดาน 2 เท่า (${calls[0]} → ${calls[1]})`);

// [2] ถูกตัดทั้ง 2 ครั้ง → ต้องโยน error ห้ามคืน Neutral เงียบๆ
calls = [];
globalThis.fetch = async (u, init) => {
  calls.push(JSON.parse(init.body).max_tokens);
  return { ok: true, headers: { get: () => null }, json: async () => ({
    content: [{ text: '[{"i":1,"cp":"Neg' }], stop_reason: "max_tokens", usage: {} }) };
};
let threw = null;
try { await classifyTwoLens(texts, { ANTHROPIC_API_KEY: "x" }, {}); } catch (e) { threw = e.message; }
ok(threw !== null, "ถูกตัดทั้ง 2 ครั้ง → โยน error (ไม่คืน Neutral ทั้งชุด)");
ok(/ขยายเพดาน/.test(threw || ""), "ข้อความ error บอกว่าขยายเพดานแล้วยังไม่พอ: " + (threw||"").slice(0,60));
ok(calls.length === 2, "ลองใหม่แค่ครั้งเดียว ไม่วนไม่จบ");

// [3] เพดานตั้งต้นต้องเผื่อส่วนที่ไม่ใช่คำตอบ (เคส opus)
ok(calls[0] >= 4000, `เพดานตั้งต้นของก้อน 6 ข้อ = ${calls[0]} (ต้อง >= 4000 เพราะเคยพังที่ 1140)`);

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
