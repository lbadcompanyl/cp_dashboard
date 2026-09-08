/**
 * samplemid.mjs — ช่อง "กลาง" ต้องมีตัวอย่างของตัวเองด้วย
 *
 * 🐞 เจ้าของเจอ 2 ก.ย. 2026 (โพส 23 คอมเมนต์ · กลาง 20 ใบ = 87%)
 *      "แล้วคอมเมนต์อื่นๆ ก็หายหมด เอาแต่ตัวที่ย้ายมาแสดง"
 *
 *    ช่องกลางขึ้นว่า 20 คอมเมนต์ แต่มีตัวอย่างใบเดียว — ซึ่งเป็นใบที่เจ้าของ
 *    ย้ายเข้ามาเอง อีก 19 ใบไม่มีอะไรให้ดูเลย
 *
 *    ต้นเหตุ: `pickBy` เลือกจาก `synthIdx` ซึ่งโหมด CP **ตัดใบกลางทิ้งไปแล้ว**
 *    และถึงโหมดอารมณ์รวมก็เลือกแค่ `positive` 2 + `negative` 2 — ไม่มีกลางเลย
 *
 * ✅ ตอนนี้เลือกจากทุกใบที่มีข้อความ ครบทั้ง 3 ช่อง ช่องละ 2 ใบ
 *
 * [1] และ [3] คือข้อสำคัญที่สุด — โพสจริงส่วนใหญ่เป็นกลางท่วม
 */
import { analyze } from "./w.mjs";

let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

/* เลียนแบบโพสจริงของเจ้าของ: กลางท่วม · บวก 1 · ลบ 2 */
const COMMENTS = [
  { text: "ซีพี ทำดีมากครับ", likes: 4 },              // 0 บวก
  { text: "แซวว่าขนาดเท่านี้ยังไม่ถึงขั้นสัตว์ประหลาด", likes: 9 },  // 1 กลาง · ถูกใจเยอะสุด
  { text: "ปลาชนิดนี้มาจากไหน", likes: 3 },            // 2 กลาง
  { text: "ดูจบแล้ว", likes: 0 },                      // 3 กลาง · ถูกใจน้อยสุด
  { text: "ไม่เอาสม่ำจริงๆ", likes: 6 },                // 4 ลบ
  { text: "มีแต่คลิปเก่าๆ", likes: 1 },                 // 5 ลบ
  { text: "เกี่ยวอะไรกับ CP", likes: 0 },              // 6 ไม่เกี่ยว — ห้ามถูกเลือก
];
const LABEL = ["Positive", "Neutral", "Neutral", "Neutral", "Negative", "Negative", "not_related"];

let synthPrompt = "";
globalThis.fetch = async (u, o) => {
  const url = String(u);
  const res = (j) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => j });
  if (url.includes("scrapecreators")) {
    if (url.includes("/comments")) return res({ comments: COMMENTS, credits_remaining: 9 });
    return res({});
  }
  if (url.includes("anthropic")) {
    const ut = JSON.parse(o.body).messages[0].content;
    if (ut.includes("คอมเมนต์:\n")) {
      const lines = ut.split("คอมเมนต์:\n")[1].split("\n").filter(Boolean);
      return res({ content: [{ text: JSON.stringify(lines.map((_, i) => ({ i: i + 1, cp: LABEL[i], oc: LABEL[i], s: 0 }))) }],
                   usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
    }
    synthPrompt = ut;
    const n = (ut.match(/ต้องถอดความ \((\d+) ข้อ/) || [])[1] || 0;
    return res({ content: [{ text: JSON.stringify({ summary: "-", keywords: [],
                   samples: Array.from({ length: +n }, (_, k) => "ถอดความ " + (k + 1)) }) }],
                 usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
  }
  return res({});
};
const run = (target) => analyze({ url: "https://www.facebook.com/reel/1", target, samples: true },
  { ANTHROPIC_API_KEY: "k", CLAUDE_MODEL: "claude-opus-5", SCRAPECREATORS_API_KEY: "s" });

/* ── [1] ⚠️ โหมดอารมณ์รวม: ต้องมีตัวอย่างครบทั้ง 3 ช่อง ───── */
let r = await run("overall");
const bySent = (s) => r.samples.filter(x => x.sentiment === s);
console.log("   ตัวอย่างที่ได้: " + r.samples.map(x => `${x.sentiment}#${x.src}`).join(" · "));
ok("[1] ⚠️ ช่องกลางมีตัวอย่างของตัวเอง", bySent("neutral").length > 0,
   `บวก ${bySent("positive").length} · กลาง ${bySent("neutral").length} · ลบ ${bySent("negative").length}`);
ok("[1b] ครบทั้ง 3 ช่อง", bySent("positive").length && bySent("neutral").length && bySent("negative").length);
/* ⚠️ ตั้งแต่ 4 ก.ย. 2026 จำนวนใบต่อช่องขึ้นกับสัดส่วน (2–4 ใบ · ดู `samplequota.mjs`)
   ชุดนี้กลาง 3 จาก 6 = 50% → ได้โควตา 4 แต่มีจริงแค่ 3 ใบ · ที่ต้องคุมคือ "ไม่ใช่ใบเดียว" */
ok("[1c] ช่องกลางได้อย่างน้อย 2 ใบ (ไม่ใช่ใบเดียว)", bySent("neutral").length >= 2,
   `ได้ ${bySent("neutral").length} ใบ`);

/* ── [2] เลือกใบถูกใจเยอะสุดของช่องกลาง ไม่ใช่สุ่ม ───────── */
ok("[2] ใบกลางที่ถูกใจเยอะสุด (#1) ถูกเลือก", bySent("neutral").some(x => x.src === 1),
   JSON.stringify(bySent("neutral").map(x => x.src)));
/* ⚠️ ชุดนี้กลางมี 4 ใบ (#1 #2 #3 #6 — #6 คือใบที่ไม่แตะ CP ซึ่งนับเป็นกลางตามนิยามใหม่)
   สัดส่วนกลาง 4/7 = 57% → โควตา 4 = เอาครบทุกใบ ข้อนี้จึงวัดอะไรไม่ได้แล้ว
   ตัวที่คุมเรื่อง "ห้ามเอาใบถูกใจน้อยสุด" ย้ายไปอยู่ที่ `samplesrc.mjs` [1c] ซึ่งใบเยอะกว่าโควตา */
ok("[2b] เรียงตามถูกใจเยอะ→น้อย (ใบ #1 มาก่อน #3)",
   bySent("neutral").findIndex(x => x.src === 1) < bySent("neutral").findIndex(x => x.src === 3),
   JSON.stringify(bySent("neutral").map(x => x.src)));

/* ── [3] ⚠️ โหมด CP ก็ต้องมีตัวอย่างกลาง ────────────────────
   synthIdx ของโหมด CP ตัดใบกลางทิ้ง — ถ้า pickBy ยังผูกกับ synthIdx อยู่ ข้อนี้จะตก */
r = await run("cp");
const cpNeu = r.samples.filter(x => x.sentiment === "neutral");
console.log("   โหมด CP: " + r.samples.map(x => `${x.sentiment}#${x.src}`).join(" · "));
ok("[3] ⚠️ โหมด CP ช่องกลางก็มีตัวอย่าง (ห้ามผูกกับ synthIdx)", cpNeu.length > 0,
   `ได้ ${cpNeu.length} ใบ`);

/* ── [4] 🚫 ใบที่ "ไม่แตะ CP" ห้ามเข้ากองที่เอาไปสรุป ─────────
   🔴 แก้ความเข้าใจผิดของเทสต์เดิม (4 ก.ย. 2026) — ของเดิมเขียนว่า "ใบ not_related ห้ามถูกเลือก"
      ซึ่ง **ตกยุคไปแล้ว** ป้าย `not_related` เลิกใช้ 26 ส.ค. 2026 นิยามใหม่คือ
      "ไม่แตะเรื่องนั้น = กลาง" (ดู `shared/sentiment/labels.md`) ใบนี้จึงเป็น **คอมเมนต์กลางปกติ**
      และการเอามาเป็นตัวอย่างของช่องกลางคือสิ่งที่ถูกต้อง
      · ของเดิมผ่านมาตลอดเพราะโควตาเป็น 2 ใบเลยไม่ถึงคิวมัน ไม่ใช่เพราะมีด่านกันจริง
   ✅ สิ่งที่ยังต้องคุมจริงๆ คือ **มันต้องไม่เข้ากองที่ AI เอาไปเขียนสรุป**
      โหมด CP สรุปจากใบที่แสดงท่าทีต่อ CP เท่านั้น (ตัดกลางออก) */
const synthPart = synthPrompt.split("คอมเมนต์ที่ต้องถอดความ")[0];
ok("[4] 🚫 ใบที่ไม่แตะ CP ไม่เข้ากองสรุปของโหมด CP", !/เกี่ยวอะไรกับ CP/.test(synthPart),
   synthPart.slice(-120));
ok("[4b] ✅ แต่เป็นตัวอย่างของช่องกลางได้ (นิยามใหม่: ไม่แตะ = กลาง)",
   r.samples.some(x => x.src === 6 && x.sentiment === "neutral"),
   JSON.stringify(r.samples.map(x => `${x.sentiment}#${x.src}`)));

/* ── [5] จำนวนใบที่ส่งไปถอดความ — คุมราคาไว้ ────────────── */
const asked = +((synthPrompt.match(/ต้องถอดความ \((\d+) ข้อ/) || [])[1] || 0);
/* เพดานรวมคือ 9 ไม่ใช่ 12 — จะได้ 4 ใบต้องมีสัดส่วน ≥50% ซึ่งมีได้ช่องเดียว (4+3+2) */
ok("[5] ส่งไปถอดความไม่เกิน 9 ใบ (เพดานรวมของกฎใหม่)", asked > 0 && asked <= 9, `ส่งไป ${asked} ใบ`);

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
