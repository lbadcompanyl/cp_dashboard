/**
 * cache.mjs — แคชคำสั่ง + ระดับการคิด (worker v22)
 *
 * ที่มา: วัดจริง 31 ส.ค. 2026 พบว่าโทเคนส่วนใหญ่หมดไปกับ "การคิด" ไม่ใช่คำตอบ
 *   คำตอบจริงราว 25 โทเคน/ใบ · ใช้จริง opus 105 · sonnet 224
 * และคำสั่ง ~5,800 ตัวอักษร ถูกส่งซ้ำทุกก้อน (475 ใบ = ซ้ำ 12 รอบ)
 *
 * ข้อที่สำคัญที่สุด
 *  [2] คำสั่งต้องเหมือนกันทุกครั้ง — เปลี่ยนแม้แต่ตัวอักษรเดียว แคชพังเงียบ
 *  [5] haiku ไม่รองรับระดับการคิด ส่งไปแล้ว error — ต้องกันไว้
 *  [6] ต้องแยกนับโทเคนแคช ไม่งั้นคิดเงินผิด (เขียน 1.25 เท่า · อ่าน 0.1 เท่า)
 */
import { classifyTwoLens, systemTwoLens } from "./w.mjs";

let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

/** ดัก fetch แล้วเก็บ body ที่ส่งไปจริง */
function spy(reply) {
  const sent = [];
  globalThis.fetch = async (_u, o) => {
    sent.push(JSON.parse(o.body));
    return {
      ok: true,
      headers: { get: () => null },
      json: async () => reply(sent.length),
    };
  };
  return sent;
}
const answer = (n) => ({
  content: [{ text: JSON.stringify(Array.from({ length: n }, (_, i) => ({ i: i + 1, cp: "Neutral", oc: "Neutral", s: 0 }))) }],
  usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 3000, cache_read_input_tokens: 0 },
  stop_reason: "end_turn",
});
const env = (model) => ({ ANTHROPIC_API_KEY: "k", CLAUDE_MODEL: model });
const TEXTS = ["อร่อยมาก", "แย่มาก", "ราคาเท่าไหร่"];

/* ── [1] system ต้องถูกทำเครื่องหมายให้แคช ─────────────────── */
{
  const sent = spy(() => answer(3));
  await classifyTwoLens(TEXTS, env("claude-opus-5"), {});
  const sys = sent[0].system;
  ok("[1] system ส่งเป็นบล็อกที่มีเครื่องหมายแคช",
     Array.isArray(sys) && sys[0]?.cache_control?.type === "ephemeral",
     JSON.stringify(sys?.[0]?.cache_control));
  ok("[1b] เนื้อคำสั่งยังครบเหมือนเดิม", sys[0].text === systemTwoLens());
}

/* ── [2] ⚠️ คำสั่งต้องเหมือนกันเป๊ะทุกครั้ง ไม่งั้นแคชพังเงียบ ── */
{
  const a = systemTwoLens(), b = systemTwoLens();
  ok("[2] เรียกคำสั่งซ้ำได้ข้อความเดิมเป๊ะ", a === b, `ยาว ${a.length} ตัวอักษร`);
  ok("[2b] ไม่มีวันที่/เวลา/เลขสุ่มปนอยู่ในคำสั่ง",
     !/\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}/.test(a));

  // ยิง 2 ก้อนคนละเนื้อหา — system ต้องยังเหมือนกัน
  const sent = spy(() => answer(3));
  await classifyTwoLens(TEXTS, env("claude-opus-5"), {}, "โพส ก");
  await classifyTwoLens(["คนละก้อน", "ข้อความอื่น", "อีกอัน"], env("claude-opus-5"), {}, "โพส ข");
  ok("[2c] บริบทโพสต่างกัน แต่ system ยังเหมือนเดิม (แคชไม่พัง)",
     sent[0].system[0].text === sent[1].system[0].text);
  ok("[2d] บริบทโพสอยู่ในข้อความผู้ใช้ ไม่ใช่ใน system",
     sent[0].messages[0].content.includes("โพส ก") && !sent[0].system[0].text.includes("โพส ก"));
}

/* ── [3] ไม่สั่งระดับการคิด = ไม่ส่งฟิลด์นั้นเลย (ของเดิมไม่เปลี่ยน) ── */
{
  const sent = spy(() => answer(3));
  await classifyTwoLens(TEXTS, env("claude-opus-5"), {});
  ok("[3] ไม่ได้สั่ง = ไม่ส่ง output_config", sent[0].output_config === undefined);
}

/* ── [4] สั่งแล้วต้องส่งไปจริง ─────────────────────────────── */
{
  const sent = spy(() => answer(3));
  await classifyTwoLens(TEXTS, env("claude-opus-5"), {}, "", "low");
  ok("[4] สั่ง low → ส่ง output_config.effort", sent[0].output_config?.effort === "low",
     JSON.stringify(sent[0].output_config));
  const s2 = spy(() => answer(3));
  await classifyTwoLens(TEXTS, env("claude-sonnet-5"), {}, "", "xhigh");
  ok("[4b] sonnet รับได้เหมือนกัน", s2[0].output_config?.effort === "xhigh");
}

/* ── [5] 🚫 haiku ห้ามส่ง — ส่งไปแล้ว API ตอบ error ────────── */
{
  const sent = spy(() => answer(3));
  await classifyTwoLens(TEXTS, env("claude-haiku-4-5"), {}, "", "low");
  ok("[5] haiku สั่งระดับการคิดไม่ได้ → ต้องไม่ส่งฟิลด์นั้น",
     sent[0].output_config === undefined,
     JSON.stringify(sent[0].output_config));
  ok("[5b] แต่ haiku ยังใช้แคชได้ตามปกติ",
     sent[0].system?.[0]?.cache_control?.type === "ephemeral");
}

/* ── [6] แยกนับโทเคนแคช ไม่เอาไปรวมกับ input ──────────────── */
{
  spy((n) => ({
    content: [{ text: JSON.stringify([{ i: 1, cp: "Neutral", oc: "Neutral", s: 0 }, { i: 2, cp: "Neutral", oc: "Neutral", s: 0 }, { i: 3, cp: "Neutral", oc: "Neutral", s: 0 }]) }],
    usage: n === 1
      ? { input_tokens: 120, output_tokens: 50, cache_creation_input_tokens: 3000, cache_read_input_tokens: 0 }
      : { input_tokens: 120, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 3000 },
    stop_reason: "end_turn",
  }));
  const acc = { input: 0, output: 0 };
  await classifyTwoLens(TEXTS, env("claude-opus-5"), acc);   // ก้อนแรก = เขียนแคช
  await classifyTwoLens(TEXTS, env("claude-opus-5"), acc);   // ก้อนสอง = อ่านแคช
  ok("[6] นับโทเคนเขียนแคชแยก", acc.cache_write === 3000, `cache_write=${acc.cache_write}`);
  ok("[6b] นับโทเคนอ่านแคชแยก", acc.cache_read === 3000, `cache_read=${acc.cache_read}`);
  ok("[6c] ⚠️ ไม่เอาไปบวกรวมกับ input (คนละราคากัน)", acc.input === 240, `input=${acc.input}`);
}

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
