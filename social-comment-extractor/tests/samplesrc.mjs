/**
 * samplesrc.mjs — ตัวอย่างคอมเมนต์ต้องผูกกับใบต้นทางเสมอ (worker v25)
 *
 * 🐞 v24 ให้ AI เลือกใบตัวอย่างเอง แล้วสั่งให้ตอบ "เลขข้อ" กลับมาด้วย
 *    ถ้า AI ไม่ตอบเลข → ผูกไม่ได้ → ตัวอย่างไม่ย้ายตามป้ายที่ผู้ใช้แก้
 *    เจ้าของเจอจริง: "เปลี่ยนแล้วก็ไม่อัพเดทอยู่ดี"
 *
 * ✅ v25 **เราเลือกใบเอง** AI มีหน้าที่ถอดความอย่างเดียว จับคู่ด้วยลำดับ
 *    → src ถูกต้องเสมอ ไม่ว่า AI จะตอบรูปแบบไหน
 *
 * [2] คือข้อสำคัญที่สุด — AI ตอบแบบไหนก็ต้องผูกได้
 */
import { analyze } from "./w.mjs";

let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

const COMMENTS = [
  { text: "อร่อยมากครับ ชอบ", likes: 5 },      // บวก · ถูกใจเยอะสุด
  { text: "ดีจังเลย", likes: 1 },              // บวก
  { text: "เฉยๆ นะ", likes: 0 },               // บวก (ถูกใจน้อยสุด — ไม่ควรถูกเลือก)
  { text: "แพงเกินไปมาก", likes: 9 },          // ลบ · ถูกใจเยอะสุด
  { text: "ไม่ชอบเลย", likes: 2 },             // ลบ
];
const LABEL = ["Positive", "Positive", "Positive", "Negative", "Negative"];

let synthPrompt = "", aiSamples = null;
globalThis.fetch = async (u, o) => {
  const url = String(u);
  const res = (j) => ({ ok: true, headers: { get: () => null }, json: async () => j });
  if (url.includes("scrapecreators")) {
    if (url.includes("/comments")) return res({ comments: COMMENTS, credits_remaining: 9 });
    return res({});
  }
  if (url.includes("anthropic")) {
    const body = JSON.parse(o.body);
    const ut = body.messages[0].content;
    if (ut.includes("คอมเมนต์:\n")) {          // ตี sentiment
      const lines = ut.split("คอมเมนต์:\n")[1].split("\n").filter(Boolean);
      return res({ content: [{ text: JSON.stringify(lines.map((_, i) => ({ i: i + 1, cp: LABEL[i], oc: LABEL[i], s: 0 }))) }],
                   usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
    }
    synthPrompt = ut;                          // สรุป + ถอดความ
    return res({ content: [{ text: JSON.stringify({ summary: "-", keywords: [], samples: aiSamples }) }],
                 usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
  }
  return res({});
};
const run = () => analyze({ url: "https://www.facebook.com/reel/1", target: "overall", samples: true },
                          { ANTHROPIC_API_KEY: "k", CLAUDE_MODEL: "claude-opus-5", SCRAPECREATORS_API_KEY: "s" });

/* ── [1] เราเป็นคนเลือกใบ และเลือกตามเกณฑ์ที่ตั้งไว้ ───────── */
aiSamples = ["ถอดความ A", "ถอดความ B", "ถอดความ C", "ถอดความ D"];
let r = await run();
ok("[1] ส่งรายการที่ต้องถอดความไปให้ AI ชัดเจน", /คอมเมนต์ที่ต้องถอดความ/.test(synthPrompt));
ok("[1b] เลือกใบที่ถูกใจเยอะสุดของแต่ละกลุ่มขึ้นก่อน",
   /1\. อร่อยมากครับ ชอบ/.test(synthPrompt) && /3\. แพงเกินไปมาก/.test(synthPrompt),
   (synthPrompt.split("เรียงตามนี้):\n")[1] || "").split("\n").join(" · "));
ok("[1c] ไม่เอาใบที่ถูกใจน้อยสุดมาเป็นตัวอย่าง", !/เฉยๆ นะ/.test(synthPrompt.split("ต้องถอดความ")[1] || ""));

/* ── [2] ⚠️ ผูกกับใบต้นทางได้เสมอ ไม่ว่า AI ตอบแบบไหน ────── */
ok("[2] ทุกตัวอย่างมี src", r.samples.length > 0 && r.samples.every(x => x.src != null),
   JSON.stringify(r.samples.map(x => ({ src: x.src, s: x.sentiment }))));
ok("[2b] src ชี้ไปที่ใบที่ถูกต้อง (ลำดับตรงกัน)",
   r.samples[0].src === 0 && r.samples[0].text === "ถอดความ A" &&
   r.samples[2].src === 3 && r.samples[2].text === "ถอดความ C",
   `[0]→${r.samples[0].src} [2]→${r.samples[2].src}`);
ok("[2c] ป้ายมาจากผลตี sentiment ของเรา ไม่ใช่ที่ AI บอก",
   r.samples[0].sentiment === "positive" && r.samples[2].sentiment === "negative");

/* ── [3] AI ตอบเป็น object แทนสตริง → ยังต้องผูกได้ ───────── */
aiSamples = [{ text: "obj A" }, { text: "obj B" }, { text: "obj C" }, { text: "obj D" }];
r = await run();
ok("[3] AI ตอบเป็น object ก็ยังผูกได้", r.samples.every(x => x.src != null) && r.samples[0].text === "obj A");

/* ── [4] AI ตอบไม่ครบ → เอาเท่าที่จับคู่ได้ ห้ามเดา ───────── */
aiSamples = ["มาแค่อันเดียว"];
r = await run();
ok("[4] AI ตอบไม่ครบ → ได้เท่าที่ตอบ และยังผูกถูก",
   r.samples.length === 1 && r.samples[0].src === 0, JSON.stringify(r.samples));

/* ── [5] AI ตอบข้อความว่าง → ตัดทิ้ง ไม่โชว์ช่องว่าง ──────── */
aiSamples = ["", "  ", "ของจริง", ""];
r = await run();
ok("[5] ตัวอย่างว่างถูกตัดทิ้ง", r.samples.length === 1 && r.samples[0].text === "ของจริง",
   JSON.stringify(r.samples.map(x => x.text)));

/* ── [6] AI ไม่ตอบ samples เลย → ไม่พัง ─────────────────── */
aiSamples = null;
r = await run();
ok("[6] AI ไม่ตอบ samples → ไม่พัง คืนรายการว่าง", Array.isArray(r.samples) && r.samples.length === 0);

/* ── [7] วิเคราะห์โพสเดิมซ้ำ ต้องได้ใบเดิม ไม่สุ่มไปมา ───── */
aiSamples = ["A", "B", "C", "D"];
const a = await run(), b2 = await run();
ok("[7] รันซ้ำได้ใบเดิม (เลือกแบบตายตัว ไม่สุ่ม)",
   JSON.stringify(a.samples.map(x => x.src)) === JSON.stringify(b2.samples.map(x => x.src)),
   JSON.stringify(a.samples.map(x => x.src)));

/* ── [8] ผลวิเคราะห์ต้องบอกเลขเวอร์ชันหลังบ้าน ───────────────
   บันทึกการแก้ป้ายที่ส่งเข้าคิวรีวิวอ่าน ver จากตรงนี้ ไม่มี = เก็บ null ทุกใบ
   และเวลาไล่ปัญหา แยกไม่ออกว่าหลังบ้านเก่าหรือหน้าเว็บเก่า
   (เจ้าของเสียเวลาไล่ 4 รอบเพราะเรื่องนี้ 2 ก.ย. 2026) */
ok("[8] ผลวิเคราะห์แนบเลขเวอร์ชันหลังบ้านมาด้วย", typeof r.ver === "number" && r.ver > 0, `ver = ${r.ver}`);

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
