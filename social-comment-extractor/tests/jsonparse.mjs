import { extractJsonArray, classifyTwoLens } from "./w.mjs";
let fail = 0; const ok = (c, m) => { console.log((c ? "✅" : "❌") + " " + m); if (!c) fail++; };

// เคสจริงที่เจอกับ opus 28 ส.ค. 2026
const real1 = '{"cp":"Negative","oc":"Negative","s":0} Wait—must output array. [{"i":1,"cp":"Negative","oc":"Negative","s":0},{"i":2,"cp":"Positive","oc":"Positive","s":0}]';
const real2 = '{"i":1,"cp":"Neutral","oc":"Neutral","s":0} [{"i":1,"cp":"Neutral","oc":"Neutral","s":0},{"i":2,"cp":"Neutral","oc":"Neutral","s":0}]';
let a = extractJsonArray(real1);
ok(Array.isArray(a) && a.length === 2 && a[1].cp === "Positive", "เคสจริง 1: ตอบ object ก่อนแล้วแก้ตัวเป็น array → หยิบ array ได้");
a = extractJsonArray(real2);
ok(Array.isArray(a) && a.length === 2, "เคสจริง 2: object นำหน้า array → หยิบ array ได้");

ok(extractJsonArray('```json\n[{"i":1}]\n```')?.length === 1, "ห่อด้วย ```json``` ก็ยังแกะได้");
ok(extractJsonArray('[{"i":1,"t":"ข้อความมี ] อยู่ข้างใน"}]')?.[0].t.includes("]"), "วงเล็บที่อยู่ในสตริงไม่ทำให้หลุด");
ok(extractJsonArray('ไม่มี json เลย') === null, "ไม่มี array เลย → คืน null (ให้ผู้เรียกโยน error)");
ok(extractJsonArray('[] แล้วก็ [{"i":1}]')?.length === 1, "array ว่างถูกข้าม ไปเอาก้อนที่มีของ");

// ต่อกับ classifyTwoLens จริง
globalThis.fetch = async () => ({ ok: true, headers: { get: () => null },
  json: async () => ({ content: [{ text: real1 }], stop_reason: "end_turn", usage: {} }) });
const r = await classifyTwoLens(["ก","ข"], { ANTHROPIC_API_KEY: "x" }, {});
ok(r.length === 2 && r[0].sentiment_cp === "Negative" && r[1].sentiment_cp === "Positive",
   "คำตอบแบบเคสจริง → ได้ผลครบ 2 ข้อ ไม่ต้องทิ้งทั้งก้อน");

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
