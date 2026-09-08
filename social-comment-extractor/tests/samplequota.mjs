/**
 * samplequota.mjs — 📐 ช่องที่สัดส่วนเยอะ ได้ตัวอย่างเยอะขึ้น
 *
 * เจ้าของสั่ง 4 ก.ย. 2026 (ดูหน้าจอโพส บวก 51% · กลาง 41% · ลบ 8%):
 *   "ถ้า positive มีมาก หรือ negative มีมาก ให้เพิ่มได้ max 4 row"
 *
 * กฎ: ≥50% → 4 ใบ · ≥30% → 3 ใบ · ที่เหลือ → 2 ใบ (เท่าของเดิม)
 *
 * 🚫 [3] คือข้อที่ห้ามพัง — **ขั้นต่ำ 2 เสมอ**
 *    ช่องลบ 8% คือช่องที่ต้องอ่านที่สุดในงาน PR ถ้าลดตามสัดส่วนจนเหลือใบเดียว
 *    ความเห็นของคนคนเดียวจะดูเหมือนตัวแทนของทั้งกลุ่ม
 *
 * 💰 [5] คุมราคา — เพดานรวมคือ 9 ใบ ไม่ใช่ 12
 *    (จะได้ 4 ต้องมีสัดส่วน ≥50% ซึ่งเป็นไปได้ช่องเดียว)
 */
import { analyze, sampleQuota, SAMPLE_MIN, SAMPLE_MAX } from "./w.mjs";

let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

/* ── [1] ตารางโควตา — ตรวจที่ตัวฟังก์ชันตรงๆ ─────────────────── */
const quota = (dist, g) => sampleQuota(g, [], dist);
const D = (p, nu, ng) => ({ positive: p, neutral: nu, negative: ng });

/* สัดส่วนจริงจากหน้าจอของเจ้าของ: บวก 48 · กลาง 39 · ลบ 7 (= 51% / 41% / 8%) */
const REAL = D(48, 39, 7);
ok("[1] บวก 51% → 4 ใบ", quota(REAL, "positive") === 4, `ได้ ${quota(REAL, "positive")}`);
ok("[1b] กลาง 41% → 3 ใบ", quota(REAL, "neutral") === 3, `ได้ ${quota(REAL, "neutral")}`);
ok("[1c] ลบ 8% → 2 ใบ (ขั้นต่ำ)", quota(REAL, "negative") === 2, `ได้ ${quota(REAL, "negative")}`);

/* ── [2] เส้นแบ่งต้องคมพอดี ไม่เลื่อน ─────────────────────────── */
ok("[2] 50% พอดี → 4 ใบ", quota(D(50, 50, 0), "positive") === 4);
ok("[2b] 49% → 3 ใบ (ยังไม่ถึงเส้น)", quota(D(49, 51, 0), "positive") === 3);
ok("[2c] 30% พอดี → 3 ใบ", quota(D(30, 70, 0), "positive") === 3);
ok("[2d] 29% → 2 ใบ", quota(D(29, 71, 0), "positive") === 2);

/* ── [3] 🚫 ขั้นต่ำ 2 เสมอ ห้ามลดตามสัดส่วน ────────────────────
   ช่องลบที่มีแค่ 1% ก็ยังต้องได้ 2 ใบ — เป็นช่องที่คนอ่านรายงานสนใจที่สุด */
ok("[3] 🚫 ลบ 1% ก็ยังได้ 2 ใบ", quota(D(98, 1, 1), "negative") === SAMPLE_MIN);
ok("[3b] 🚫 ช่องที่ไม่มีคอมเมนต์เลย ก็ยังคืน 2 (ไปตัดที่ pickBy แทน)", quota(D(100, 0, 0), "negative") === SAMPLE_MIN);
ok("[3c] 🚫 ไม่มีคอมเมนต์เลยทั้งโพส → ไม่หารด้วยศูนย์", quota(D(0, 0, 0), "positive") === SAMPLE_MIN);
ok("[3d] เพดานคือ 4 ห้ามเกิน", quota(D(100, 0, 0), "positive") === SAMPLE_MAX && SAMPLE_MAX === 4);

/* ── [4] ไม่มี dist ส่งมา → นับจาก labels เอง ห้ามคืน 0 ───────── */
const L = ["positive", "positive", "positive", "neutral", "negative", "negative"];
ok("[4] ไม่มี dist → นับจาก labels (บวก 3/6 = 50% → 4)", sampleQuota("positive", L, null) === 4,
   `ได้ ${sampleQuota("positive", L, null)}`);
ok("[4b] labels ว่างก็ยังคืนขั้นต่ำ", sampleQuota("positive", [], null) === SAMPLE_MIN);

/* ── [5] 💰 ต่อสายกับ analyze จริง — วัดว่าส่งไปถอดความกี่ใบ ──── */
/* บวก 6 (55%) · กลาง 3 (27%) · ลบ 2 (18%) → ควรได้ 4 + 2 + 2 = 8 */
const COMMENTS = [
  ...Array.from({ length: 6 }, (_, i) => ({ text: `ชอบมากครับ ใบที่ ${i}`, likes: 10 - i })),
  ...Array.from({ length: 3 }, (_, i) => ({ text: `ถามว่าเริ่มขายเมื่อไหร่ ใบที่ ${i}`, likes: 3 - i })),
  ...Array.from({ length: 2 }, (_, i) => ({ text: `แพงเกินไปมาก ใบที่ ${i}`, likes: 2 - i })),
];
const LABEL = [...Array(6).fill("Positive"), ...Array(3).fill("Neutral"), ...Array(2).fill("Negative")];

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
    const n = +((ut.match(/ต้องถอดความ \((\d+) ข้อ/) || [])[1] || 0);
    return res({ content: [{ text: JSON.stringify({ summary: "-", keywords: [],
                   samples: Array.from({ length: n }, (_, k) => "ถอดความ " + (k + 1)) }) }],
                 usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
  }
  return res({});
};

const r = await analyze({ url: "https://www.facebook.com/reel/1", target: "overall", samples: true },
  { ANTHROPIC_API_KEY: "k", CLAUDE_MODEL: "claude-opus-5", SCRAPECREATORS_API_KEY: "s" });
const by = (s) => r.samples.filter(x => x.sentiment === s).length;
console.log(`   ได้จริง: บวก ${by("positive")} · กลาง ${by("neutral")} · ลบ ${by("negative")}`);
ok("[5] บวก 55% ได้ 4 ใบ (ของเดิมได้ 2)", by("positive") === 4, `ได้ ${by("positive")}`);
ok("[5b] กลาง 27% ได้ 2 ใบ", by("neutral") === 2, `ได้ ${by("neutral")}`);
ok("[5c] ลบ 18% ได้ 2 ใบ", by("negative") === 2, `ได้ ${by("negative")}`);
const asked = +((synthPrompt.match(/ต้องถอดความ \((\d+) ข้อ/) || [])[1] || 0);
ok("[5d] 💰 ส่งไปถอดความ 8 ใบ ไม่เกินเพดาน 9", asked === 8, `ส่งไป ${asked} ใบ`);

/* ── [6] ⚠️ ใบที่เพิ่มมาต้องเป็นใบ "ถูกใจเยอะสุด" ถัดไป ไม่ใช่สุ่ม ──
   ไม่งั้นวิเคราะห์โพสเดิมซ้ำแล้วได้คนละใบทุกครั้ง (ดู samplesrc.mjs) */
const posSrc = r.samples.filter(x => x.sentiment === "positive").map(x => x.src);
ok("[6] ⚠️ 4 ใบบวกคือใบถูกใจเยอะสุด 4 ใบแรก เรียงตายตัว",
   JSON.stringify(posSrc) === JSON.stringify([0, 1, 2, 3]), JSON.stringify(posSrc));

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
