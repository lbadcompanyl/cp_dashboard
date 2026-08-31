/**
 * notext.mjs — คอมเมนต์ที่เป็นสติกเกอร์/รูป (ไม่มีข้อความ)
 *
 * เจ้าของสั่ง 31 ส.ค. 2026: **ไม่ตัดทิ้ง ให้นับเป็น "กลาง"**
 * จำนวนบนจอจะได้ตรงกับที่ดึงมาจริง (ของเดิมคัดทิ้ง แล้วเลขไม่ตรงจนเข้าใจผิด)
 *
 * ข้อที่สำคัญที่สุด
 *  [2] 🚫 ห้ามส่งใบที่ไม่มีข้อความไปให้ AI — ไม่มีอะไรให้ตัดสิน เปลืองโทเคนฟรี
 *  [3] ⚠️ ต้องติดธง no_text ทุกใบ — "กลาง" ตรงนี้แปลว่า *ไม่มีอะไรให้อ่าน*
 *      ไม่ใช่ *AI อ่านแล้วเห็นว่ากลาง* · ไม่แยก = โพสที่มีแต่สติกเกอร์จะรายงาน
 *      "กลาง 100%" อย่างมั่นใจทั้งที่ไม่ได้อ่านอะไรเลย
 *  [4] ลำดับต้องไม่สลับ ไม่งั้นข้อความกับป้ายเพี้ยนทั้งกระดาน
 */
import { analyze } from "./w.mjs";

let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

/* คอมเมนต์ 6 ใบ — ใบที่ 2 กับ 5 เป็นสติกเกอร์ (ไม่มีข้อความ) */
const COMMENTS = [
  { text: "อร่อยมากครับ", likes: 1 },
  { text: "", likes: 0 },                 // สติกเกอร์
  { text: "แย่มาก ไม่ซื้อแล้ว", likes: 2 },
  { text: "ราคาเท่าไหร่", likes: 0 },
  { text: "   ", likes: 0 },              // รูปล้วน (ช่องว่างล้วน)
  { text: "ซีพีช่วยชาวบ้านจริง", likes: 5 },
];
const WANT = ["Positive", "Negative", "Neutral", "Positive"];   // คำตอบสำหรับ 4 ใบที่มีข้อความ

let sentToAI = [];
let FEED = COMMENTS;
/* ปลอมทั้งต้นทางคอมเมนต์ (ScrapeCreators) และ Claude — ไม่ยิงออกเน็ตจริงสักครั้ง */
globalThis.fetch = async (u, o) => {
  const url = String(u);
  const res = (j) => ({ ok: true, headers: { get: () => null }, json: async () => j });
  if (url.includes("scrapecreators")) {
    if (url.includes("/comments")) return res({ comments: FEED, credits_remaining: 999 });
    return res({});                                    // คำขอหัวข้อ/รูปปก
  }
  if (url.includes("anthropic")) {
    const body = JSON.parse(o.body);
    const userText = body.messages[0].content;
    /* คำขอ "สรุป+keyword" เป็นคนละรูปแบบ — ต้องแยกออกก่อน ไม่งั้นแกะพัง
       และห้ามนับรวมเข้า sentToAI ไม่งั้นข้อ [2] จะได้ตัวเลขเกินจริง */
    if (!userText.includes("คอมเมนต์:\n")) {
      return res({ content: [{ text: '{"summary":"-","keywords":[],"samples":[]}' }],
                   usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: "end_turn" });
    }
    const lines = userText.split("คอมเมนต์:\n")[1].split("\n").filter(Boolean);
    lines.forEach(l => sentToAI.push(l.replace(/^\d+\.\s*/, "")));
    return res({
      content: [{ text: JSON.stringify(lines.map((_, i) => ({ i: i + 1, cp: WANT[i], oc: WANT[i], s: 0 }))) }],
      usage: { input_tokens: 100, output_tokens: 50 }, stop_reason: "end_turn",
    });
  }
  return res({});
};

const run = (list) => {
  FEED = list; sentToAI = [];
  return analyze({ url: "https://www.facebook.com/reel/123", target: "cp", samples: false },
                 { ANTHROPIC_API_KEY: "k", CLAUDE_MODEL: "claude-opus-5", SCRAPECREATORS_API_KEY: "s" });
};

const res = await run(COMMENTS);

/* ── [1] จำนวนต้องตรงกับที่ดึงมา ไม่หายไปไหน ─────────────── */
ok("[1] วิเคราะห์ครบทุกใบที่ดึงมา", res.analyzed_count === 6, `ดึงมา 6 · วิเคราะห์ ${res.analyzed_count}`);
const tot = res.sentiment.positive + res.sentiment.neutral + res.sentiment.negative;
ok("[1b] ผลรวมป้ายเท่ากับจำนวนคอมเมนต์", tot === 6, `รวมได้ ${tot}`);
ok("[1c] บอกจำนวนใบที่ไม่มีข้อความ", res.no_text_count === 2, `no_text_count=${res.no_text_count}`);

/* ── [2] 🚫 ห้ามส่งใบที่ไม่มีข้อความไปให้ AI ─────────────── */
ok("[2] ส่งให้ AI เฉพาะใบที่มีข้อความ", sentToAI.length === 4, `ส่งไป ${sentToAI.length} ใบ`);
ok("[2b] ไม่มีบรรทัดว่างถูกส่งไป", sentToAI.every(t => t.trim().length > 0),
   JSON.stringify(sentToAI));

/* ── [3] ⚠️ ติดธงว่าใบไหนไม่มีข้อความ ────────────────────── */
const flagged = res.audit.filter(a => a.no_text);
ok("[3] ใบที่ไม่มีข้อความติดธง no_text", flagged.length === 2, `ติดธง ${flagged.length} ใบ`);
ok("[3b] ใบที่ติดธงถูกนับเป็นกลางทั้ง 2 แกน",
   flagged.every(a => a.sentiment_cp === "Neutral" && a.overall_cred === "Neutral"));
ok("[3c] ใบที่มีข้อความจริงต้องไม่ติดธง",
   res.audit.filter(a => a.text.trim()).every(a => !a.no_text));

/* ── [4] ลำดับต้องไม่สลับ ────────────────────────────────── */
ok("[4] ธงอยู่ตรงตำแหน่งที่ 2 และ 5 (นับจาก 1)",
   res.audit[1].no_text === 1 && res.audit[4].no_text === 1,
   `ตำแหน่งที่ติดธง: ${res.audit.map((a, i) => a.no_text ? i + 1 : null).filter(Boolean).join(",")}`);
ok("[4b] ข้อความกับป้ายยังตรงคู่กัน",
   res.audit[0].text === "อร่อยมากครับ" && res.audit[0].sentiment_cp === "Positive" &&
   res.audit[2].text === "แย่มาก ไม่ซื้อแล้ว" && res.audit[2].sentiment_cp === "Negative",
   `[0] ${res.audit[0].text}=${res.audit[0].sentiment_cp} · [2] ${res.audit[2].text}=${res.audit[2].sentiment_cp}`);

/* ── [5] ทั้งโพสเป็นสติกเกอร์ = บอกตรงๆ ไม่ใช่รายงาน "กลาง 100%" ── */
{
  let threw = "";
  try {
    await run([{ text: "" }, { text: "  " }]);
  } catch (e) { threw = e.message; }
  ok("[5] ทั้งโพสไม่มีข้อความเลย → โยน error บอกเหตุผล", /สติกเกอร์|ไม่มีข้อความ/.test(threw), threw);
}

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
