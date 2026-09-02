/**
 * keywords.mjs — ตัวเลข "คำที่พูดถึงบ่อย" ต้องนับจากของจริง + สรุปต้องรู้สัดส่วนจริง
 *
 * 🐞 เจ้าของเจอ 31 ส.ค. 2026 (โพส 942 คอมเมนต์ · กลาง 86%)
 *    "สรุปมั่วไปเลย ทั้งที่ sentiment ส่วนใหญ่เป็นกลาง" · "[keyword] ตรงนี้ก็มั่ว"
 *
 * ต้นเหตุ 2 อัน
 *  A. prompt เดิมสั่งว่า "count: จำนวนโดยประมาณ" → **AI แต่งตัวเลขขึ้นมา**
 *     แล้วหน้าเว็บวาดเป็นแถบพร้อมเลข ดูเหมือนของที่นับมาจริง
 *  B. โหมด CP สรุปจากเฉพาะใบที่พูดถึง CP (ตัดกลางออก) แต่ AI ไม่รู้สัดส่วนจริง
 *     เลยเขียนสรุปเหมือนทั้งโพสเป็นแบบนั้น
 *
 * [1] และ [4] คือข้อสำคัญที่สุด
 */
import { analyze } from "./w.mjs";

let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

/* 10 ใบ: 3 พูดถึง CP (บวก 1 ลบ 2) · 7 ไม่พูดถึง (กลาง) — เลียนแบบโพสจริงที่กลางท่วม */
const COMMENTS = [
  { text: "ซีพี ทำดีมากครับ ชอบ", likes: 3 },
  { text: "ซีพี ผูกขาดจริง", likes: 8 },
  { text: "ซีพี แพงเกินไป ผูกขาด", likes: 5 },
  { text: "ปลาหมอคางดำระบาดหนัก", likes: 1 },
  { text: "ปลาหมอคางดำเยอะมาก", likes: 0 },
  { text: "รัฐบาลไม่ทำอะไรเลย", likes: 2 },
  { text: "ปลาหมอคางดำ กินได้ไหม", likes: 0 },
  { text: "สงสารชาวบ้าน", likes: 0 },
  { text: "ข่าวนี้จริงไหม", likes: 0 },
  { text: "ดูจบแล้ว", likes: 0 },
];
const LABEL = ["Positive", "Negative", "Negative", "Neutral", "Neutral", "Neutral", "Neutral", "Neutral", "Neutral", "Neutral"];

let synthPrompt = "", aiKeywords = null;
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
    if (ut.includes("คอมเมนต์:\n")) {
      const lines = ut.split("คอมเมนต์:\n")[1].split("\n").filter(Boolean);
      return res({ content: [{ text: JSON.stringify(lines.map((_, i) => ({ i: i + 1, cp: LABEL[i], oc: LABEL[i], s: 0 }))) }],
                   usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
    }
    synthPrompt = body.system[0].text + "\n---\n" + ut;
    return res({ content: [{ text: JSON.stringify({ summary: "สรุปทดสอบ", keywords: aiKeywords, samples: [] }) }],
                 usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
  }
  return res({});
};
const run = (target = "cp") => analyze({ url: "https://www.facebook.com/reel/1", target, samples: false },
  { ANTHROPIC_API_KEY: "k", CLAUDE_MODEL: "claude-opus-5", SCRAPECREATORS_API_KEY: "s" });

/* ── [1] ⚠️ ตัวเลขต้องนับจากข้อความจริง ไม่ใช่ที่ AI ให้มา ───── */
aiKeywords = ["ซีพี", "ปลาหมอคางดำ", "ผูกขาด"];
let r = await run("cp");
const kw = Object.fromEntries(r.keywords.map(k => [k.term, k.count]));
ok("[1] นับ 'ซีพี' ได้ 3 ใบ (นับจริงจากทุกคอมเมนต์)", kw["ซีพี"] === 3, JSON.stringify(kw));
ok("[1b] นับ 'ปลาหมอคางดำ' ได้ 3 ใบ", kw["ปลาหมอคางดำ"] === 3);
ok("[1c] นับ 'ผูกขาด' ได้ 2 ใบ", kw["ผูกขาด"] === 2);
ok("[1d] ⚠️ นับจาก **ทุกใบ** ไม่ใช่แค่กองที่ส่งให้ AI อ่าน (โหมด CP ส่งไปแค่ 3 ใบ)",
   kw["ปลาหมอคางดำ"] === 3, "ถ้านับจากกองที่ส่งไปจะได้ 0");

/* ── [2] 🚫 คำที่ AI แต่งขึ้นเอง (ไม่โผล่จริง) ต้องถูกตัดทิ้ง ── */
aiKeywords = ["ซีพี", "คำที่ไม่มีอยู่จริงเลย", "เรียกร้องให้ CP รับผิดชอบต่อระบบนิเวศ"];
r = await run("cp");
ok("[2] คำที่ไม่โผล่จริงถูกตัดทิ้ง ไม่โชว์เลข 0",
   r.keywords.every(k => k.count > 0) && !r.keywords.some(k => k.term.includes("ไม่มีอยู่จริง")),
   JSON.stringify(r.keywords));

/* ── [3] เรียงจากมากไปน้อย และไม่ซ้ำ ───────────────────────── */
aiKeywords = ["ปลาหมอคางดำ", "ซีพี", "ซีพี", "ผูกขาด"];
r = await run("cp");
ok("[3] เรียงมากไปน้อย", r.keywords.every((k, i, a) => i === 0 || a[i - 1].count >= k.count),
   r.keywords.map(k => `${k.term}=${k.count}`).join(" · "));
ok("[3b] คำซ้ำถูกยุบ", r.keywords.filter(k => k.term === "ซีพี").length === 1);

/* ── [4] ⚠️ prompt ต้องบอกสัดส่วนจริงของทั้งโพสให้ AI รู้ ───── */
aiKeywords = ["ซีพี"];
r = await run("cp");
ok("[4] บอกจำนวนคอมเมนต์ทั้งโพสใน prompt", /ทั้งโพส 10 ใบ/.test(synthPrompt),
   (synthPrompt.match(/สัดส่วนจริง[^\n]*/) || ["ไม่มีเลย"])[0]);
ok("[4b] บอกสัดส่วน บวก/กลาง/ลบ จริง", /บวก 1 · กลาง 7 · ลบ 2/.test(synthPrompt));
ok("[4c] ⚠️ สั่งไม่ให้เขียนเหมือนทั้งโพสเป็นแบบที่อ่านมา",
   /สรุปต้องสะท้อนสัดส่วนจริง/.test(synthPrompt));
ok("[4d] บอกว่าที่ให้อ่านมีแค่กี่ใบ", /ให้อ่านด้านล่างมีแค่ 3 ใบ/.test(synthPrompt),
   (synthPrompt.match(/ให้อ่านด้านล่าง[^·]*/) || ["ไม่มี"])[0]);

/* ── [5] หน้าเว็บต้องรู้ว่าสรุปมาจากกี่ใบจากทั้งหมดกี่ใบ ────── */
ok("[5] คืน summary_from / summary_of", r.summary_from === 3 && r.summary_of === 10,
   `สรุปจาก ${r.summary_from} ใบ จากทั้งหมด ${r.summary_of} ใบ`);

/* ── [6] โหมดอารมณ์รวม: สรุปจากทุกใบ ตัวเลขต้องเท่ากัน ────── */
r = await run("overall");
ok("[6] โหมดอารมณ์รวมสรุปจากทุกใบ", r.summary_from === 10 && r.summary_of === 10,
   `${r.summary_from}/${r.summary_of}`);

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
