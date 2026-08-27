/**
 * Comment Sentiment — Cloudflare Worker (backend)
 * ------------------------------------------------
 * รับลิงก์โพส → ดึงคอมเมนต์ → ตี sentiment ด้วย Claude → ส่งกลับเป็น aggregate
 *
 * แหล่งดึงคอมเมนต์ (adapter):
 *   - YouTube : YouTube Data API v3 (ฟรี, ทางการ)          env: YOUTUBE_API_KEY
 *   - Facebook: ScrapeCreators /v1/facebook/post/comments   env: SCRAPECREATORS_API_KEY
 *   - TikTok  : ScrapeCreators /v1/tiktok/video/comments     env: SCRAPECREATORS_API_KEY
 *
 * Sentiment : Claude Messages API                            env: ANTHROPIC_API_KEY
 *   default model = claude-haiku-4-5 (เหมาะกับงานจัดหมวดจำนวนมาก + ประหยัด)
 *   ตั้ง env CLAUDE_MODEL=claude-opus-5 เพื่อความแม่นสูงสุด (แพงกว่า)
 *
 * ออกแบบ aggregate-first: Worker ไม่จัดเก็บ (persist) อะไรทั้งสิ้น —
 * ดึง → วิเคราะห์ในหน่วยความจำ → คืนเฉพาะภาพรวม (ชื่อผู้คอมเมนต์ถูกตัดออกโดย default)
 */

/* เลขเวอร์ชันของ Worker — ไว้ตรวจว่า "โค้ดที่ deploy ไปแล้วเป็นตัวไหน"
   เปิด GET / แล้วดูค่า ver · แก้โค้ดในไฟล์นี้ทีไร **บวกเลขนี้ด้วยทุกครั้ง**
   (เหตุผลเดียวกับป้ายเลขเวอร์ชันของหน้าเว็บใน CLAUDE.md — เลิกเดาว่า deploy ถึงหรือยัง) */
const WORKER_VER = 10;

const DEFAULT_MODEL = "claude-haiku-4-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CHUNK = 40;            // จำนวนคอมเมนต์ต่อ 1 คำขอ Claude (ตี sentiment)
const SYNTH_SAMPLE = 120;    // จำนวนคอมเมนต์ที่ส่งให้ Claude สรุป/หา keyword

/* ============================================================
 * 🎓 ตัวอย่างสอน AI สำหรับโหมด "วัดต่อ CP" (few-shot)
 * ------------------------------------------------------------
 * เกณฑ์เต็มอยู่ที่ RUBRIC-CP.md — ตรงนี้คือตัวอย่างที่ส่งให้ AI ดูทุกครั้ง
 *
 * ✏️ วิธีเพิ่ม: label คอมเมนต์จริงใน Excel (ปุ่ม audit) แล้วเอาเคสที่ AI เคยตอบผิด
 *    มาใส่ที่นี่ — เน้นเคสยาก (ประชด/ชื่อลวง/ด่าปลาไม่ได้ด่า CP) ไม่ต้องใส่เคสง่าย
 * ⚠️ ควรคละป้ายให้ครบทั้ง 4 แบบ ถ้าใส่แต่ negative โมเดลจะเอนไปตอบ negative รัว
 * ⚠️ อย่าใส่เยอะเกิน ~40 อัน (เปลืองโทเคนทุก batch) — เอาเฉพาะที่สอนอะไรใหม่จริงๆ
 * ============================================================ */
const CP_EXAMPLES = [
  { t: "ขอบคุณ CP มากที่เอาปลามาแจกให้ทั้งประเทศ 🙏😂", a: "negative" },   // ประชด
  { t: "ปลาหมอคางดำมันร้ายมาก ต้องเร่งกำจัดให้หมด", a: "not_related" },    // ด่าปลา ไม่ได้ด่า CP
  { t: "รัฐทำงานช้ามาก ปล่อยให้ลามขนาดนี้", a: "not_related" },            // ด่ารัฐ
  { t: "CP ต้องออกมารับผิดชอบกับสิ่งที่ทำ", a: "negative" },
  { t: "โทษเขาไม่ได้หรอก ปลามันเข้ามาหลายทาง", a: "positive" },            // ปกป้อง
  { t: "CP ออกแถลงการณ์ชี้แจงแล้วนะครับ", a: "neutral" },                  // ข้อเท็จจริง
  { t: "CP เกี่ยวข้องยังไงเหรอครับ ใครพอทราบบ้าง", a: "neutral" },          // ถาม
  { t: "เลิกซื้อของเซเว่นกันเถอะ", a: "negative" },                        // แบรนด์ในเครือ
  { t: "ชื่นชมทีมที่ลงพื้นที่ช่วยชาวบ้านจริงจัง ขอบคุณ CP", a: "positive" },
  { t: "เมื่อวานไปเดินซีพีเอ็นมา คนเยอะมาก", a: "not_related" },            // ชื่อลวง (Central)
  { t: "สงสารชาวบ้านมาก เดือดร้อนกันทั้งชุมชน", a: "not_related" },
  { t: "😡😡😡", a: "not_related" },                                        // ไม่มีเนื้อหา
  // ── ข้อที่เจ้าของเคาะ 24 ส.ค. 2026 (ดู RUBRIC-CP.md ข้อ 8) ──
  { t: "ควรตรวจสอบให้ชัดเจนว่า CP เกี่ยวข้องจริงไหม", a: "negative" },       // ตั้งข้อสงสัย = ลบ
  { t: "ไก่ CP อร่อยดีนะ ซื้อประจำ", a: "positive" },                       // ชมสินค้า = บวก
  { t: "เจ้าสัวรวยขึ้นทุกปี แต่ชาวบ้านรับกรรม", a: "negative" },             // ไม่เอ่ยชื่อ แต่บริบทชี้ชัด
];

/* ============================================================
 * 🎯 ตัวจัดหมวด "2 แกน" — rubric ฉบับที่เจ้าของเคาะ 26 ส.ค. 2026
 * ------------------------------------------------------------
 *   แกน 1 sentiment_cp  = รู้สึกยังไงกับแบรนด์ CP โดยเฉพาะ
 *   แกน 2 overall_cred  = อารมณ์รวม + ความน่าเชื่อของเนื้อข่าว
 *   is_sarcasm          = 1 เมื่อใช้คำบวกแต่ความหมายด่า
 *
 * 🚫 **ไม่มี not_related แล้ว** — "ไม่แตะ CP" = Neutral ของแกน 1
 *    (นิยามใหม่ตกลงแล้ว ห้ามเปลี่ยนเอง — ดู README ของชุด dataset)
 *
 * ⚠️ ตัวอย่าง few-shot ทุกข้อ **ต้องไม่อยู่ใน eval set** ไม่งั้นเป็นข้อสอบรั่ว
 *    ตัวเลขวัดผลจะสวยเกินจริง · รอบแรกเคยรั่ว 5 จาก 14 ข้อ (ตรงเป๊ะ 1 + แก้คำนิดหน่อย 4)
 *    ทั้ง 5 ข้อถูกเปลี่ยนเป็นเคสจาก split=train + source=real แล้ว
 * 🚫 ห้ามใช้ข้อที่ source=synthetic เป็นตัวอย่างหลัก — โมเดลจะจำสำนวนที่ถูก generate มา
 * ============================================================ */
const RUBRIC_VER = "v5";
const CLASSIFY_MAX = 50;     // จำนวนคอมเมนต์สูงสุดต่อ 1 คำขอ /classify (หน้าเว็บเป็นคนวนเอง)

/* โมเดลที่หน้าวัดผลเลือกได้ — 🚫 **ต้องเป็นรายชื่อตายตัวเท่านั้น**
   /classify เปิดให้ยิงได้จากหน้าเว็บ ถ้ารับชื่อโมเดลอะไรก็ได้ ใครก็สั่งใช้ตัวแพงสุดรัวๆ ได้ */
const MODEL_CHOICES = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"];

const TWO_LENS_SHOTS = [
  // ── ด่ารัฐ / ต่างชาติ / วิกฤตลอยๆ — ไม่แตะ CP: แกน 1 ต้องเป็น Neutral เสมอ ──
  { t: "ข้าราชการถ้าใช้สติปัญญาในทางที่ชอบ ประเทศชาติจะเจริญ ไม่ไหวแล้ววว", cp: "Neutral", oc: "Negative", s: 0 },
  { t: "ทั่วโลกแตกตื่น แต่หน่วยงานราชการไทย บอกว่าอย่าแตกตื่น นั่งกระดิกตีนรองบ", cp: "Neutral", oc: "Negative", s: 0 },
  { t: "ไร้คุณภาพ ของจีนอันตรายต่อสัตว์เลี้ยง อาหารปลอมมีเยอะ", cp: "Neutral", oc: "Negative", s: 0 },
  // ── ประชด — ตีตามความหมายจริง ไม่ใช่ตามคำ ──
  { t: "ต้องขอบคุณคนนำเข้าปลาหมอคางดำ ทำให้คลองมีแต่ปลาหมอคางดำ กำจัดยังไงก็ไม่หมด", cp: "Negative", oc: "Negative", s: 1 },
  { t: "มีงนี่สุดยอด ❌ผลตรวจ ✅สรรหาคำแก้ตัวให้นายทุน", cp: "Negative", oc: "Negative", s: 1 },
  { t: "มีอะไรอีกเยอะ รัฐบาลชุดนี้ ดีย์ๆๆทั้งนั้น", cp: "Neutral", oc: "Negative", s: 1 },
  { t: "ฟอกขาวชัดๆ เอาข่าวดีมากลบความผิด", cp: "Negative", oc: "Negative", s: 0 },
  // ── เชียร์ / ปกป้อง ──
  { t: "ต้อง CP เท่านั้นค่ะ ซื้อเจ้าอื่นแล้วไม่โอเค", cp: "Positive", oc: "Positive", s: 0 },
  { t: "ขอบคุณเจ้าสัว CPF ที่มีส่วนในวงการกุ้ง", cp: "Positive", oc: "Positive", s: 0 },
  { t: "ไส้กรอก CP อร่อยดีนะ แต่ราคาขึ้นเยอะ", cp: "Positive", oc: "Positive", s: 0 },
  { t: "เจ้าสัวแค่รับซื้อ ชาวบ้านต่างหากคือคนเผาคนปลูก", cp: "Positive", oc: "Neutral", s: 0 },
  // ── สินค้า: ตำหนิเล็กน้อย ≠ ลบ · ถามเฉยๆ ≠ ลบ · ถามเชิงกล่าวหา = ลบ ──
  /* ถอด "อร่อยนะ แต่เค็มไปนิด" ออก — เป็นสำนวนเดียวกับ eval id 312 (ข้อสอบรั่ว)
     กฎเรื่องนี้อยู่ในกฎร่วมข้อ 3 อยู่แล้ว ไม่ต้องมีตัวอย่างซ้ำ */
  { t: "รับซื้อกิโลละเท่าไรครับ", cp: "Neutral", oc: "Neutral", s: 0 },
  { t: "ปลาหมอคางดำใครนำเข้ามา ใครรับผิดชอบ", cp: "Negative", oc: "Negative", s: 0 },
  /* ── เพิ่มรอบ 3: ไม่เอ่ยชื่อ CP แต่พูดถึงสิ่งที่โพสนำเสนอ (ข้อ ก.) ──
     รอบ 2 พลาดกลุ่มนี้มากที่สุด — ชมโครงการ/สินค้าแล้วถูกตีเป็น Neutral */
  { t: "สนับสนุนตรงจุด ชาวบ้านอุ่นใจ ลูกหลานปลอดภัย ธรรมชาติยั่งยืน", cp: "Positive", oc: "Positive", s: 0 },
  { t: "ดีมากเลยครับ จับมือกัน ร่วมมือกัน ชูเทคโนโลยี AI ได้ลดต้นทุน", cp: "Positive", oc: "Positive", s: 0 },
  /* ── เพิ่มรอบ 3: พูดถึงมาตรการ/กฎหมายลอยๆ ไม่ได้ชี้ตัวใคร = Neutral ของแกน 1 ── */
  { t: "มันอยู่ในอำนาจและหน้าที่ตามกฎหมายของ อย. อาหารที่นำเข้าต้องตรวจให้ครบ", cp: "Neutral", oc: "Neutral", s: 0 },
  { t: "น้ำปลาที่กินทุกวันนี้ตรวจสอบกันมั่งรึป่าว มันเอาคางดำมาหมักใครจะรู้", cp: "Neutral", oc: "Negative", s: 0 },
  /* ── เพิ่มรอบ 4: ด่ารัฐ "ที่เอื้อนายทุน" ยังเป็น Negative ต่อ CP ──
     รอบ 3 พลาดกลุ่มนี้ 6 ใน 14 ข้อ เพราะกฎ "ด่ารัฐ ≠ ด่า CP" ดูดไปเป็น Neutral หมด */
  { t: "รัฐให้ความร่วมมือกับนายทุน เพื่อมาทำลายประชาชนในช่วงข้าวยากหมากแพง", cp: "Negative", oc: "Negative", s: 0 },
  { t: "มีหน่วยราชการไหนหรือรัฐบาลชุดไหน กล้างัดข้อ กับ บริษัทผู้นำเข้ามาแล้วปล่อยทิ้ง", cp: "Negative", oc: "Negative", s: 0 },
  /* ── เพิ่มรอบ 4: เสนอความเห็นว่าควรทำอะไร ≠ ชม CP (กัน ก. ยิงเกิน) ── */
  { t: "น่าจะเอาไปทำอาหารกุ้ง อาหารปู อาหารปลา อาหารสัตว์ต่างๆ", cp: "Neutral", oc: "Neutral", s: 0 },
];

function systemTwoLens() {
  const ex = TWO_LENS_SHOTS
    .map(e => `"${e.t}"\n→ {"cp":"${e.cp}","oc":"${e.oc}","s":${e.s}}`)
    .join("\n");
  return [
    "คุณคือระบบวิเคราะห์ sentiment คอมเมนต์ภาษาไทยเกี่ยวกับเครือ CP / CPF",
    "วิเคราะห์ทุกคอมเมนต์ตาม 2 แกนพร้อมกัน ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น",
    "",
    "═══ แกน 1: cp (ความรู้สึกต่อแบรนด์ CP โดยเฉพาะ) ═══",
    "• Positive = เชียร์/ปกป้อง/ชม CP หรือสินค้า CP · แก้ต่างให้ CP (โยนผิดให้คนอื่น)",
    "• Negative = โจมตี/ตำหนิ CP, นายทุน, เจ้าสัว, ต้นตอ, ฟอกขาว, บอยคอต, บ่นราคา/บริการ CP",
    "• Neutral  = ไม่แตะ CP โดยตรง · ด่ารัฐ/นักการเมือง/ต่างด้าว/จีน · ถามข้อมูล · พูดวิกฤตลอยๆ",
    "⚠️ ด่ารัฐ ≠ ด่า CP",
    "",
    "─── เมื่อคอมเมนต์ไม่ได้เอ่ยชื่อ CP ให้ดู 2 ข้อนี้ต่อ ───",
    "ก. **ชม/ตำหนิ สิ่งที่เจ้าของโพสทำหรือขาย หรือเปล่า** (โครงการ · สินค้า · กิจกรรมของเขา)",
    "   ถ้าใช่ ท่าทีต่อสิ่งนั้น = ท่าทีต่อ CP",
    '   ชม → Positive ("โครงการดีมากค่ะ" · "ขอให้โครงการนี้ยั่งยืน" · "อร่อยมาก")',
    "   ⚠️ **เฉพาะการชมสิ่งที่เขาทำเท่านั้น** — ถ้าเป็นการ**เสนอความเห็นว่าควรทำอะไร**",
    "      หรือชมสิ่งอื่นในข่าวที่ไม่ใช่ผลงานของเขา ให้ Neutral",
    '      ("น่าจะเอาปลามาแปรรูปขาย" · "ส่งเข้าโรงงานสร้างรายได้สิ" · "ปลานี่ก็กินได้นะ อร่อย")',
    "",
    "ข. **ชี้ตัวคนทำหรือเปล่า** — ผู้นำเข้า · ต้นตอ · คนปล่อยปลา · เจ้าสัว · นายทุน · บริษัทที่นำเข้า",
    "   ถ้าใช่ → **Negative** (คอมเมนต์เหล่านี้อยู่ใต้ข่าวที่เครือถูกกล่าวหาอยู่แล้ว)",
    '   ("ไอ้ตัวต้นเหตุเงียบกริบ" · "คนที่นำเข้ามาลอยตัว" · "ใครนำเข้ามา ใครรับผิดชอบ")',
    "   ⚠️ **ด่ารัฐไปพร้อมกันด้วย ก็ยังเป็น Negative** ถ้าประโยคชี้ว่ารัฐ",
    "      เอื้อ/อุ้ม/ปกป้อง/ไม่กล้าแตะ นายทุนหรือผู้นำเข้า",
    '      ("รัฐกลัวนายทุน" · "ราชการช่วยนายทุน" · "ไม่มีใครกล้างัดข้อกับบริษัทผู้นำเข้า")',
    '      กฎ "ด่ารัฐ ≠ ด่า CP" ใช้กับประโยคที่**ด่ารัฐล้วนๆ ไม่มีนายทุนอยู่ในนั้น**เท่านั้น',
    "",
    "⚠️ ไม่เข้าทั้ง ก. และ ข. ให้ Neutral — อย่าเดาเอาเอง โดยเฉพาะ:",
    '   พูดถึงมาตรการ/กฎหมาย/การตรวจสอบลอยๆ ("ยึดใบประกอบโรงงานสั่งปิดไปเลย" · "ตรวจสารพิษหรือยัง")',
    '   ด่าโรงงาน/ทุน/ความโลภแบบทั่วไปที่ไม่ได้ชี้ว่าใคร ("ควรมีกฎหมายควบคุมผลกำไร")',
    "   → พวกนี้เป็น Neutral ของแกน 1 (แต่แกน 2 มักเป็น Negative)",
    "",
    "═══ แกน 2: oc (อารมณ์รวม + ความน่าเชื่อของ narrative) ═══",
    "• พื้นฐาน = อารมณ์รวม (โกรธ/ไม่พอใจ=Negative, ชอบ/เห็นด้วย=Positive, เฉย/ถาม=Neutral)",
    "• กฎพิเศษ: ถ้าสงสัยความน่าเชื่อ / ไม่เชื่อข้อมูล / มองว่าฟอกข่าว / บอกว่าข้อมูลผิด → บังคับ Negative",
    "",
    "═══ กฎร่วม ═══",
    '1. ตี "ความหมายจริง" ไม่ใช่คำผิวเผิน — ประชด ให้ s=1 และตีป้ายตามความหมายจริง',
    "   ⚠️ ประชด = **ใช้ถ้อยคำเชิงบวกแต่ความหมายด่า** เท่านั้น",
    '   ด่าตรงๆ · เยาะเย้ย · 🤣😂 · "5555" · น้ำเสียงหมั่นไส้ **ไม่ใช่ประชด** ให้ s=0',
    '   ("ประกาศจับเจ้าสัวดีกว่า🤣" = ด่าตรงๆ s=0 · "ขอบคุณที่เอาปลามาแจก" = ประชด s=1)',
    "   ⚠️ s เป็นแค่ธงกำกับ **ห้ามให้ s ไปเปลี่ยนป้ายของ 2 แกน** ตัดสิน 2 แกนจากความหมายเสมอ",
    '2. กำกวม / อวยแยกไม่ออก / เงื่อนไข "ถ้า…ก็ดี" = Neutral (ไม่เดา)',
    "3. สินค้า: อร่อยแต่ตำหนิเล็กน้อย (เค็ม/เลี่ยน) = Neutral · แต่ปนเปื้อน/ชำรุด/เน่าเสีย = Negative",
    '4. คำถามเชิงกล่าวหา ("เจ้าสัวไหนรับซื้อ", "ใครนำเข้า") = Negative',
    "5. สงสัยความปลอดภัยสินค้า: ระบุ CP ชัด → cp=Negative · ไม่ระบุ CP → cp=Neutral แต่ oc=Negative",
    "",
    "═══ ตัวอย่างเคสจริง (โดยเฉพาะที่ 2 แกนให้ค่าต่างกัน) ═══",
    ex,
    "",
    "═══ รูปแบบคำตอบ ═══",
    'ตอบเป็น JSON array ล้วน เรียงตามลำดับคอมเมนต์ที่ให้มา ความยาวต้องเท่ากับจำนวนคอมเมนต์',
    '[{"i":1,"cp":"Neutral","oc":"Negative","s":0}, ...]',
    'cp และ oc ใช้ได้เฉพาะ "Positive" "Negative" "Neutral" · s เป็น 0 หรือ 1 เท่านั้น',
  ].join("\n");
}

/** บังคับให้ค่าที่โมเดลตอบกลับมาอยู่ในชุดที่ใช้ได้เสมอ */
function normLens(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s.startsWith("pos")) return "Positive";
  if (s.startsWith("neg")) return "Negative";
  return "Neutral";               // ตอบเพี้ยน/ว่าง = Neutral (ไม่เดาเป็นลบ)
}

/**
 * ตี 2 แกนให้คอมเมนต์ชุดหนึ่ง — คืน array ยาวเท่า texts เสมอ
 * ⚠️ ห้ามให้ความยาวไม่ตรง ไม่งั้นผลจะเลื่อนไปทั้งชุดแล้วตัวเลขวัดผลผิดโดยไม่มีอะไรเตือน
 */
async function classifyTwoLens(texts, env, acc, context) {
  const numbered = texts
    .map((t, i) => `${i + 1}. ${String(t).replace(/\s+/g, " ").slice(0, 400)}`)
    .join("\n");
  const ctx = context ? `บริบทโพสต์: "${String(context).replace(/\s+/g, " ").slice(0, 300)}"\n\n` : "";
  /* เพดานโทเคนต้องโตตามจำนวนข้อ — ตั้งไว้ตายตัวแล้วโมเดลที่เขียนยาวกว่าจะถูกตัดกลางคัน
     ⚠️ เจอจริง 27 ส.ค. 2026: opus โดนตัดที่ 2,600 → JSON พัง → ตกไปเป็น Neutral ทั้งชุด
        แล้วรายงานออกมาเป็น "ความแม่น 10%" ทั้งที่โมเดลไม่ได้ตอบผิดสักข้อ */
  const budget = Math.min(8000, 90 * texts.length + 600);
  const acc2 = acc || {};
  const out = await callClaude(env, systemTwoLens(), ctx + "คอมเมนต์:\n" + numbered, budget, acc2);

  if (acc2.stop_reason === "max_tokens") {
    throw new Error(`คำตอบถูกตัดกลางคัน (max_tokens ${budget}) — ลดจำนวนข้อต่อก้อน`);
  }

  let arr = [];
  try { arr = extractJson(out); } catch (e) { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  /* 🚫 แกะไม่ได้เลย = ต้องโยน error ห้ามคืน Neutral ทั้งชุด
     "ไม่รู้" กับ "กลาง" ไม่ใช่เรื่องเดียวกัน — คืน Neutral จะกลายเป็นตัวเลขที่ดูเหมือนผลจริง */
  if (!arr.length) {
    throw new Error("แกะคำตอบของโมเดลไม่ได้: " + String(out).slice(0, 160));
  }

  // เรียงตาม i ที่โมเดลตอบมา ถ้ามี — กันกรณีสลับลำดับ
  const byIdx = new Map();
  for (const o of arr) {
    if (o && typeof o === "object" && Number.isFinite(+o.i)) byIdx.set(+o.i, o);
  }
  return texts.map((_, i) => {
    const o = byIdx.get(i + 1) || arr[i] || {};
    return {
      sentiment_cp: normLens(o.cp ?? o.sentiment_cp),
      overall_cred: normLens(o.oc ?? o.overall_cred),
      is_sarcasm: (o.s ?? o.is_sarcasm) ? 1 : 0,
      missing: byIdx.has(i + 1) || arr[i] ? undefined : true,   // โมเดลไม่ได้ตอบข้อนี้
    };
  });
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || "*";
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), origin);

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return cors(json({ ok: true, service: "comment-sentiment", ver: WORKER_VER, rubric: RUBRIC_VER, models: MODEL_CHOICES, model: env.CLAUDE_MODEL || DEFAULT_MODEL }), origin);
    }
    if (request.method === "GET" && url.pathname === "/credits") {
      return cors(json(await creditBalance(env)), origin);
    }

    /* ตี 2 แกนให้ข้อความดิบที่ส่งมาตรงๆ — ใช้โดยหน้าวัดความแม่น (/issue/sentiment-eval.html)
       ⚠️ ไม่แตะ ScrapeCreators เลย จึงไม่กินเครดิตที่จ่ายเงิน · ใช้แต่โควตา Claude
       ⚠️ หน้าเว็บเป็นคนวนทีละก้อน ที่นี่รับได้ครั้งละไม่เกิน CLASSIFY_MAX
          (ถ้าให้ Worker วนเองทั้ง 475 ข้อจะชนเพดานเวลาของ Cloudflare) */
    if (request.method === "POST" && url.pathname === "/classify") {
      let body;
      try { body = await request.json(); } catch (e) { return cors(json({ error: "bad_json" }, 400), origin); }
      const texts = Array.isArray(body?.texts) ? body.texts : null;
      if (!texts || !texts.length) return cors(json({ error: "no_texts" }, 400), origin);
      if (texts.length > CLASSIFY_MAX) {
        return cors(json({ error: "too_many", max: CLASSIFY_MAX, got: texts.length }, 400), origin);
      }
      if (!env.ANTHROPIC_API_KEY) return cors(json({ error: "no_claude_key" }, 500), origin);
      const acc = { input: 0, output: 0 };
      try {
        const model = MODEL_CHOICES.includes(body.model) ? body.model : (env.CLAUDE_MODEL || DEFAULT_MODEL);
        const results = await classifyTwoLens(texts, { ...env, CLAUDE_MODEL: model }, acc, body.context);
        const missing = results.filter(r => r.missing).length;
        return cors(json({ ok: true, ver: WORKER_VER, rubric: RUBRIC_VER, model, missing, results, tokens: acc }), origin);
      } catch (e) {
        return cors(json({ error: "classify_failed", detail: String(e && e.message || e) }, 502), origin);
      }
    }
    /* 🚫 เคยมี `/debugmeta` ตรงนี้ — ถอดออกทั้งเส้นทางและฟังก์ชันแล้ว (เจ้าของสั่ง 20 ส.ค. 2026)
       ตอนนั้นทำไว้ไล่ปัญหาเรื่อง map field รูปปก ซึ่งแก้จบไปแล้ว
       ⚠️ ห้ามเอากลับมาแบบเปิดค้างไว้ ไม่ว่ากรณีใด — ไม่มีการตรวจสิทธิ์เลย
          ใครรู้ URL ก็ยิงได้ แล้วมัน **เผาเครดิต ScrapeCreators ที่จ่ายเงิน** ทีละครั้ง
          พร้อมคืน response ดิบของต้นทางออกมาทั้งก้อน (กฎเหล็กข้อ 2 ใน CLAUDE.md)
       ✅ ต้องไล่ปัญหาแบบนั้นอีก ให้เขียนขึ้นใหม่ตอนรันในเครื่อง แล้วอย่า commit */
    if (request.method !== "POST" || url.pathname !== "/analyze") {
      return cors(json({ error: "ไม่พบ endpoint (ใช้ POST /analyze)" }, 404), origin);
    }

    try {
      const body = await request.json();
      const result = await analyze(body, env);
      return cors(json(result), origin);
    } catch (e) {
      return cors(json({ error: String(e && e.message || e) }, 500), origin);
    }
  },
};

async function analyze(opts, env) {
  const url = (opts.url || "").trim();
  const platform = opts.platform || detectPlatform(url);
  const limit = Math.max(10, Math.min(2000, +opts.limit || 200));
  const anonymize = opts.anonymize !== false;
  const wantSamples = opts.samples !== false;
  const target = opts.target === "cp" ? "cp" : "general";   // "cp" = วัดท่าทีต่อเครือ CP

  if (!url || !platform) throw new Error("ลิงก์ไม่ถูกต้อง หรือไม่รองรับแพลตฟอร์มนี้");
  if (!env.ANTHROPIC_API_KEY) throw new Error("ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY");

  // log การทำงาน (เปิดดูได้ในหน้าเว็บ)
  const t0 = Date.now();
  const log = [];
  const logLine = m => log.push(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
  logLine(`เริ่ม · แพลตฟอร์ม = ${platform} · ขอสูงสุด ${limit} คอมเมนต์`);

  // 1) ดึงคอมเมนต์ตามแพลตฟอร์ม
  let collected;
  if (platform === "youtube") collected = await fetchYouTube(url, limit, env);
  else if (platform === "facebook") collected = await fetchScrapeCreators("facebook", url, limit, env);
  else if (platform === "tiktok") collected = await fetchScrapeCreators("tiktok", url, limit, env);
  else throw new Error("ไม่รองรับแพลตฟอร์ม: " + platform);

  const comments = collected.comments;
  if (!comments.length) throw new Error("ไม่พบคอมเมนต์ (โพสอาจปิดคอมเมนต์ หรือดึงไม่ได้)");
  logLine(`ดึงคอมเมนต์สำเร็จ ${comments.length} รายการ`);
  if (collected.credits_remaining != null) logLine(`ScrapeCreators credits คงเหลือ ${collected.credits_remaining}`);

  const texts = comments.map(c => c.text).filter(Boolean);

  // ตัวสะสมการใช้ token ของ Claude
  const tokens = { input: 0, output: 0, rate_remaining: null };

  // 2) ตี sentiment ทีละ chunk ด้วย Claude
  logLine(`ตี sentiment (${target === "cp" ? "ท่าทีต่อเครือ CP" : "อารมณ์รวม"}) ด้วย ${env.CLAUDE_MODEL || DEFAULT_MODEL} · ${Math.ceil(texts.length / CHUNK)} batch (batch ละ ${CHUNK})`);
  const labels = await classifySentiment(texts, env, tokens, logLine, target);
  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  let not_related = 0;
  for (const l of labels) { if (l === "not_related") not_related++; else if (sentiment[l] != null) sentiment[l]++; }
  logLine(`รวมผล → บวก ${sentiment.positive} · กลาง ${sentiment.neutral} · ลบ ${sentiment.negative}` +
    (target === "cp" ? ` · ไม่เกี่ยวกับ CP ${not_related}` : ""));

  // audit รายคอมเมนต์ (ข้อความ + ผล) สำหรับตรวจความถูกต้องบนจอ — ไม่รวมชื่อผู้คอมเมนต์
  const audit = texts.map((t, i) => ({ text: String(t).replace(/\s+/g, " ").slice(0, 220), sentiment: labels[i] }));

  // 3) สรุป + keyword + ตัวอย่าง (ถอดความ)
  // โหมด CP: สรุปจากเฉพาะคอมเมนต์ที่เกี่ยวกับ CP (ไม่งั้นสรุปจะกลายเป็นเรื่องปลา/รัฐ)
  const synthPool = target === "cp"
    ? texts.filter((_, i) => labels[i] !== "not_related")
    : texts;
  if (target === "cp") logLine(`สรุปจากคอมเมนต์ที่เกี่ยวกับ CP ${synthPool.length} รายการ`);
  const synth = synthPool.length
    ? await synthesize(synthPool.slice(0, SYNTH_SAMPLE), wantSamples, env, tokens, target)
    : { summary: "ไม่มีคอมเมนต์ที่พูดถึงเครือ CP ในโพสนี้", keywords: [], samples: [] };
  logLine(`สรุป+keyword: ${(synth.keywords || []).length} คำ · ตัวอย่าง ${(synth.samples || []).length} รายการ`);
  logLine(`Claude tokens: input ${tokens.input.toLocaleString()} + output ${tokens.output.toLocaleString()} = ${(tokens.input + tokens.output).toLocaleString()}`);

  // 4) รวมเป็น aggregate (ไม่คืน raw รายบุคคล / ชื่อถูกตัดออก)
  const engagement = aggregateEngagement(comments);
  const time_range = aggregateTime(comments);
  logLine(`เสร็จสิ้น (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  return {
    platform,
    source_url: url,
    post_title: collected.post_title || "",
    post_thumb: collected.post_thumb || "",
    fetched_count: comments.length,
    analyzed_count: labels.length,
    target,
    not_related,
    sentiment,
    engagement: anonymize ? { ...engagement } : engagement,
    time_range,
    keywords: synth.keywords || [],
    summary: synth.summary || "",
    samples: wantSamples ? (synth.samples || []) : [],
    credits_remaining: collected.credits_remaining ?? null,
    claude_usage: { input: tokens.input, output: tokens.output, total: tokens.input + tokens.output },
    claude_rate_remaining: tokens.rate_remaining,
    log,
    audit,
    model: env.CLAUDE_MODEL || DEFAULT_MODEL,
  };
}

/** ดึงเครดิตคงเหลือของ ScrapeCreators */
async function creditBalance(env) {
  if (!env.SCRAPECREATORS_API_KEY) return { error: "ยังไม่ได้ตั้งค่า SCRAPECREATORS_API_KEY" };
  const r = await fetch("https://api.scrapecreators.com/v1/account/credit-balance", {
    headers: { "x-api-key": env.SCRAPECREATORS_API_KEY },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { error: "ScrapeCreators: " + (data?.error || data?.message || ("HTTP " + r.status)) };
  return { credits_remaining: findCredits(data), raw: data };
}

/** หาเลขเครดิตจาก response ของ ScrapeCreators ไม่ว่าจะใช้ชื่อ field แบบไหน */
function findCredits(obj) {
  if (obj == null || typeof obj !== "object") return null;
  const keys = ["credits_remaining", "creditsRemaining", "creditCount", "credit_count", "credits", "credit",
    "credit_balance", "creditBalance", "balance", "remaining", "available", "credits_left", "creditsLeft"];
  for (const k of keys) if (typeof obj[k] === "number") return obj[k];
  for (const v of Object.values(obj)) if (v && typeof v === "object") { const n = findCredits(v); if (n != null) return n; }
  for (const v of Object.values(obj)) if (typeof v === "number") return v; // เผื่อ response เป็น {something: N} ล้วน
  return null;
}

/* ---------------- collectors ---------------- */

function detectPlatform(u) {
  u = (u || "").toLowerCase();
  if (/youtube\.com|youtu\.be/.test(u)) return "youtube";
  if (/tiktok\.com/.test(u)) return "tiktok";
  if (/facebook\.com|fb\.watch|fb\.com/.test(u)) return "facebook";
  return null;
}

function youtubeVideoId(url) {
  const m1 = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (m1) return m1[1];
  const m2 = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (m2) return m2[1];
  const m3 = url.match(/\/(shorts|live|embed)\/([a-zA-Z0-9_-]{11})/);
  if (m3) return m3[2];
  return null;
}

async function fetchYouTube(url, limit, env) {
  if (!env.YOUTUBE_API_KEY) throw new Error("ยังไม่ได้ตั้งค่า YOUTUBE_API_KEY");
  const vid = youtubeVideoId(url);
  if (!vid) throw new Error("แยก video id จากลิงก์ YouTube ไม่ได้");

  const out = [];
  let pageToken = "";
  while (out.length < limit) {
    const api = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
    api.searchParams.set("part", "snippet");
    api.searchParams.set("videoId", vid);
    api.searchParams.set("maxResults", "100");
    api.searchParams.set("order", "relevance");
    api.searchParams.set("textFormat", "plainText");
    api.searchParams.set("key", env.YOUTUBE_API_KEY);
    if (pageToken) api.searchParams.set("pageToken", pageToken);

    const r = await fetch(api.toString());
    const data = await r.json();
    if (!r.ok) {
      const reason = data?.error?.errors?.[0]?.reason || data?.error?.message || ("HTTP " + r.status);
      if (reason === "commentsDisabled") throw new Error("วิดีโอนี้ปิดคอมเมนต์");
      throw new Error("YouTube API: " + reason);
    }
    for (const item of data.items || []) {
      const s = item.snippet?.topLevelComment?.snippet;
      if (!s) continue;
      out.push({
        text: s.textDisplay || "",
        author: s.authorDisplayName || "",
        likes: s.likeCount || 0,
        replies: item.snippet?.totalReplyCount || 0,
        time: s.publishedAt || "",
      });
      if (out.length >= limit) break;
    }
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }

  // ดึงหัวข้อ + รูปปกของคลิป (สำหรับใส่ในรายงาน) — base64 กัน CORS ตอนวาดลง canvas
  let post_title = "", post_thumb = "";
  try {
    const metaApi = new URL("https://www.googleapis.com/youtube/v3/videos");
    metaApi.searchParams.set("part", "snippet");
    metaApi.searchParams.set("id", vid);
    metaApi.searchParams.set("key", env.YOUTUBE_API_KEY);
    const mr = await fetch(metaApi.toString());
    const md = await mr.json();
    const sn = md.items && md.items[0] && md.items[0].snippet;
    if (sn) {
      post_title = sn.title || "";
      const th = sn.thumbnails || {};
      const turl = (th.medium || th.high || th.default || {}).url;
      if (turl) {
        const ir = await fetch(turl);
        if (ir.ok) {
          const buf = new Uint8Array(await ir.arrayBuffer());
          post_thumb = "data:" + (ir.headers.get("content-type") || "image/jpeg") + ";base64," + toB64(buf);
        }
      }
    }
  } catch (e) { /* รูป/หัวข้อไม่มาก็ไม่เป็นไร */ }

  return { comments: out, post_title, post_thumb };
}

function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/**
 * ScrapeCreators — FB & TikTok comments.
 * หมายเหตุ: โครงสร้าง response อาจต่างกันเล็กน้อยตามเวอร์ชัน API —
 * pickField() ออกแบบให้ยืดหยุ่น ถ้า field ไม่ตรงให้ปรับ mapping ตรงนี้
 * (อ้างอิง docs.scrapecreators.com — comments คืนเป็น array + cursor สำหรับหน้าถัดไป)
 */
async function fetchScrapeCreators(kind, url, limit, env) {
  if (!env.SCRAPECREATORS_API_KEY) throw new Error("ยังไม่ได้ตั้งค่า SCRAPECREATORS_API_KEY");
  const endpoint = kind === "facebook"
    ? "https://api.scrapecreators.com/v1/facebook/post/comments"
    : "https://api.scrapecreators.com/v1/tiktok/video/comments";

  const out = [];
  let cursor = "";
  let guard = 0;
  let credits_remaining = null;
  while (out.length < limit && guard < 60) {
    guard++;
    const api = new URL(endpoint);
    api.searchParams.set("url", url);
    if (cursor) api.searchParams.set("cursor", cursor);

    const r = await fetch(api.toString(), { headers: { "x-api-key": env.SCRAPECREATORS_API_KEY } });
    const data = await r.json();
    if (!r.ok) throw new Error("ScrapeCreators: " + (data?.error || data?.message || ("HTTP " + r.status)));
    if (data.credits_remaining != null) credits_remaining = data.credits_remaining;

    const list = data.comments || data.data || data.results || [];
    if (!Array.isArray(list) || !list.length) break;

    for (const c of list) {
      out.push({
        text: pickField(c, ["text", "comment", "content", "body", "message"]) || "",
        author: pickField(c, ["author", "username", "user", "name", "nickname"]) || "",
        likes: +pickField(c, ["likes", "like_count", "likeCount", "digg_count"]) || 0,
        replies: +pickField(c, ["replies", "reply_count", "replyCount", "comment_count"]) || 0,
        time: pickField(c, ["time", "created_at", "createdAt", "timestamp", "create_time"]) || "",
      });
      if (out.length >= limit) break;
    }
    cursor = data.cursor || data.next_cursor || data.nextCursor || data.next_page_id || "";
    if (!cursor) break;
  }

  // หัวข้อ + รูปปกของโพส (best-effort, +1 credit) — เผื่อ field ต่างกันจึงค้นแบบยืดหยุ่น
  let post_title = "", post_thumb = "";
  try {
    const metaEp = kind === "facebook"
      ? "https://api.scrapecreators.com/v1/facebook/post"
      : "https://api.scrapecreators.com/v2/tiktok/video";
    const mApi = new URL(metaEp);
    mApi.searchParams.set("url", url);
    const mr = await fetch(mApi.toString(), { headers: { "x-api-key": env.SCRAPECREATORS_API_KEY } });
    if (mr.ok) {
      const md = await mr.json();
      const c2 = findCredits(md); if (c2 != null) credits_remaining = c2;
      post_title = String(deepFindStr(md, ["desc", "message", "title", "caption", "text", "content", "description"]) || "").slice(0, 300);
      const turl = deepFindUrl(md, ["cover", "origin_cover", "dynamic_cover", "thumbnail", "full_picture", "picture", "photo", "image", "display_url"]);
      if (turl) {
        const ir = await fetch(turl);
        if (ir.ok) {
          const buf = new Uint8Array(await ir.arrayBuffer());
          if (buf.length < 3_000_000) post_thumb = "data:" + (ir.headers.get("content-type") || "image/jpeg") + ";base64," + toB64(buf);
        }
      }
    }
  } catch (e) { /* meta ไม่มาก็ไม่เป็นไร */ }

  return { comments: out, credits_remaining, post_title, post_thumb };
}

/** ค้นหาสตริง (หัวข้อ) จาก response ที่ไม่รู้โครงสร้างแน่ชัด */
function deepFindStr(obj, names, depth = 0) {
  if (obj == null || depth > 6 || typeof obj !== "object") return "";
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v.trim().length > 3 && names.includes(k.toLowerCase())) return v;
  }
  for (const v of Object.values(obj)) { if (v && typeof v === "object") { const r = deepFindStr(v, names, depth + 1); if (r) return r; } }
  return "";
}
/** ค้นหา URL รูปจาก field ที่ชื่อเข้าเค้า (รองรับ url_list array แบบ TikTok) */
function deepFindUrl(obj, hints, depth = 0) {
  if (obj == null || depth > 6 || typeof obj !== "object") return "";
  for (const [k, v] of Object.entries(obj)) {
    if (hints.some(h => k.toLowerCase().includes(h))) {
      if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
      if (Array.isArray(v)) { const u = v.find(x => typeof x === "string" && /^https?:\/\//.test(x)); if (u) return u; }
      if (v && typeof v === "object") {
        if (Array.isArray(v.url_list)) { const u = v.url_list.find(x => typeof x === "string" && /^https?:\/\//.test(x)); if (u) return u; }
        if (typeof v.url === "string" && /^https?:\/\//.test(v.url)) return v.url;
        if (typeof v.uri === "string" && /^https?:\/\//.test(v.uri)) return v.uri;
      }
    }
  }
  for (const v of Object.values(obj)) { if (v && typeof v === "object") { const r = deepFindUrl(v, hints, depth + 1); if (r) return r; } }
  return "";
}

function pickField(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") {
      // author อาจเป็น object { name / nickname / unique_id }
      if (typeof obj[k] === "object") return obj[k].name || obj[k].nickname || obj[k].unique_id || "";
      return obj[k];
    }
  }
  return "";
}

/* ---------------- aggregation ---------------- */

function aggregateEngagement(comments) {
  let likes = 0, replies = 0;
  const authors = new Set();
  for (const c of comments) {
    likes += c.likes || 0;
    replies += c.replies || 0;
    if (c.author) authors.add(c.author.toLowerCase());
  }
  return { total_likes: likes, total_replies: replies, unique_commenters: authors.size || comments.length };
}

function aggregateTime(comments) {
  const times = comments.map(c => c.time).filter(Boolean).map(t => String(t)).sort();
  if (!times.length) return { earliest: "", latest: "" };
  const fmt = t => (t.length >= 10 && t.includes("-")) ? t.slice(0, 10) : t;
  return { earliest: fmt(times[0]), latest: fmt(times[times.length - 1]) };
}

/* ---------------- Claude sentiment ---------------- */

async function callClaude(env, system, userText, maxTokens, acc) {
  const model = env.CLAUDE_MODEL || DEFAULT_MODEL;
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error("Claude API: " + (data?.error?.message || ("HTTP " + r.status)));
  if (acc) {
    if (data.usage) { acc.input += data.usage.input_tokens || 0; acc.output += data.usage.output_tokens || 0; }
    const rr = r.headers.get("anthropic-ratelimit-tokens-remaining");
    if (rr != null) acc.rate_remaining = +rr;
    /* ⚠️ "max_tokens" = โมเดลพูดไม่จบ คำตอบถูกตัดกลางคัน → JSON พัง
       ต้องเก็บไว้ให้ผู้เรียกรู้ ไม่งั้นจะกลายเป็น "ตอบไม่ได้" แบบเงียบๆ */
    acc.stop_reason = data.stop_reason || null;
  }
  return (data.content || []).map(b => b.text || "").join("").trim();
}

function extractJson(s) {
  // เผื่อโมเดลใส่ ```json ... ``` หรือข้อความห่อ
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1];
  const start = s.search(/[\[{]/);
  if (start > 0) s = s.slice(start);
  return JSON.parse(s);
}

/** system prompt สำหรับโหมด "อารมณ์รวม" (ค่าเริ่มต้น) */
function systemGeneral() {
  return "คุณเป็นตัวจำแนกอารมณ์ (sentiment) ของคอมเมนต์โซเชียลภาษาไทย/อังกฤษ " +
    "จำแนกแต่ละคอมเมนต์เป็น positive, neutral หรือ negative โดยพิจารณาบริบท ประชด และภาษาวิบัติ " +
    'ตอบกลับเป็น JSON array ของสตริงเท่านั้น เช่น ["positive","negative",...] ' +
    "ความยาว array ต้องเท่ากับจำนวนคอมเมนต์ ห้ามมีข้อความอื่น";
}

/** system prompt สำหรับโหมด "ท่าทีต่อเครือ CP" (aspect-based) — อิง RUBRIC-CP.md */
function systemCP() {
  const ex = CP_EXAMPLES.map(e => `"${e.t}" → ${e.a}`).join("\n");
  return [
    "คุณเป็นนักวิเคราะห์ social listening ภาษาไทย หน้าที่คือตัดสิน **ท่าทีของผู้เขียนที่มีต่อเครือเจริญโภคภัณฑ์ (CP)** เท่านั้น",
    "⚠️ ไม่ใช่อารมณ์รวมของคอมเมนต์ — ให้ดูเฉพาะว่าเขารู้สึกอย่างไรกับ CP",
    "",
    "ป้ายที่ใช้ได้ 4 แบบ:",
    "- positive = ชื่นชม สนับสนุน ปกป้อง เห็นใจ CP หรือชมสินค้า/บริการในเครือ",
    "- neutral = เอ่ยถึง CP แบบข้อเท็จจริง หรือถามข้อมูล ไม่แสดงท่าที",
    "- negative = ตำหนิ กล่าวหา ประชด เรียกร้องให้ CP รับผิดชอบ ตั้งข้อสงสัยว่า CP เกี่ยวข้อง หรือชวนแบน/ฟ้อง",
    "- not_related = ไม่ได้พูดถึง CP เลย (พูดถึงปลา รัฐ ชาวบ้าน เรื่องอื่น) หรือไม่มีเนื้อหา",
    "",
    "นับเป็น CP: ซีพี, CP, เจริญโภคภัณฑ์, Charoen Pokphand, เจียรวนนท์, ซีพีเอฟ/CPF, ซีพี ออลล์, ซีพีแรม, ซีพี แอ็กซ์ตร้า, เซเว่น/7-11, แม็คโคร, โลตัส, ทรู",
    "ไม่นับ (ชื่อลวง): บีแอลซีพี/BLCP, ซีพีเอ็น/CPN (Central Pattana), บีซีพีจี/บีซีพี (บางจาก), ทรูดิจิทัล พาร์ค, ทรูธโซเชียล/Truth Social",
    "",
    "กฎสำคัญ:",
    "1. ประชด/แดกดันให้ตอบตามเจตนา ไม่ใช่ตามคำ (เช่น ขอบคุณเกินจริง + 😂🙏 ในบริบทวิกฤต = negative)",
    "2. ด่าปลา ด่ารัฐ หรือให้กำลังใจชาวบ้าน โดยไม่เอ่ยถึง CP = not_related",
    "3. พูดถึงบริษัทในเครือ (เซเว่น แม็คโคร โลตัส ทรู) ถือว่าพูดถึง CP",
    "4. ถ้าคอมเมนต์มีทั้งบวกและลบต่อ CP ให้ยึดท่าทีที่เด่นกว่า ถ้าพอกันให้ตอบ neutral",
    "5. ไม่แน่ใจว่าเป็นลบหรือไม่ ให้ตอบ neutral (อย่าเดาเป็น negative)",
    "6. โพสนี้เป็นข่าวที่เกี่ยวกับ CP อยู่แล้ว ดังนั้นคำเรียกแทนอย่าง \"เจ้าสัว\" \"นายทุนใหญ่\" \"บริษัทยักษ์ใหญ่ที่นำเข้ามา\" ให้ถือว่าหมายถึง CP",
    "",
    "ตัวอย่างที่ตัดสินไว้แล้ว (ใช้เป็นแนวทาง):",
    ex,
    "",
    'ตอบกลับเป็น JSON array ของสตริงเท่านั้น เช่น ["negative","not_related",...] ' +
    "ความยาว array ต้องเท่ากับจำนวนคอมเมนต์ ห้ามมีข้อความอื่น",
  ].join("\n");
}

function normLabel(v, target) {
  const s = String(v || "").toLowerCase();
  if (target === "cp" && (s.includes("not_related") || s.includes("unrelated") || s === "none")) return "not_related";
  if (s.startsWith("pos")) return "positive";
  if (s.startsWith("neg")) return "negative";
  return "neutral";
}

async function classifySentiment(texts, env, acc, logLine, target) {
  const isCP = target === "cp";
  const labels = [];
  const nBatch = Math.ceil(texts.length / CHUNK);
  const system = isCP ? systemCP() : systemGeneral();
  for (let i = 0; i < texts.length; i += CHUNK) {
    const batch = texts.slice(i, i + CHUNK);
    const numbered = batch.map((t, j) => `${j + 1}. ${String(t).replace(/\s+/g, " ").slice(0, 400)}`).join("\n");
    const out = await callClaude(env, system, "คอมเมนต์:\n" + numbered, 1500, acc);
    let arr;
    try { arr = extractJson(out); } catch (e) { arr = []; }
    const b = { positive: 0, neutral: 0, negative: 0, not_related: 0 };
    for (let j = 0; j < batch.length; j++) {
      const label = normLabel(arr[j], target);
      labels.push(label); b[label]++;
    }
    if (logLine) logLine(`  batch ${i / CHUNK + 1}/${nBatch}: บวก ${b.positive} · กลาง ${b.neutral} · ลบ ${b.negative}` +
      (isCP ? ` · ไม่เกี่ยว ${b.not_related}` : "") + ` (${batch.length} คอมเมนต์)`);
  }
  return labels;
}

async function synthesize(sampleTexts, wantSamples, env, acc, target) {
  const joined = sampleTexts.map((t, i) => `${i + 1}. ${String(t).replace(/\s+/g, " ").slice(0, 300)}`).join("\n");
  const focus = target === "cp"
    ? "คอมเมนต์เหล่านี้คัดมาเฉพาะที่พูดถึงเครือเจริญโภคภัณฑ์ (CP) — ให้สรุปและหา keyword โดยโฟกัสที่ **ท่าทีและประเด็นที่คนพูดถึง CP** เท่านั้น "
    : "";
  const system =
    "คุณเป็นนักวิเคราะห์ social listening ภาษาไทย วิเคราะห์คอมเมนต์ที่ให้มาแล้วตอบเป็น JSON object เท่านั้น " +
    focus +
    "โครงสร้าง: {" +
    '"summary": "สรุปภาพรวมกระแส 2-3 ประโยค ภาษาไทย", ' +
    '"keywords": [{"term":"คำ/หัวข้อ","count":จำนวนโดยประมาณ}], (8-12 รายการ เรียงจากมากไปน้อย) ' +
    (wantSamples
      ? '"samples": [{"sentiment":"positive|negative","text":"ถอดความคอมเมนต์ตัวแทน ตัดข้อมูลระบุตัวตนออก"}] ' +
        '(2-4 รายการ ต้องมี positive อย่างน้อย 1 และ negative อย่างน้อย 1 ถ้ามีในข้อมูล ไม่ต้องมี neutral)'
      : '"samples": []') +
    "} ห้ามมีข้อความนอก JSON และห้ามคัดลอกข้อความต้นฉบับตรงๆ ในตัวอย่าง (ให้ถอดความ)";
  const out = await callClaude(env, system, "คอมเมนต์ (ตัวอย่าง):\n" + joined, 1500, acc);
  try {
    const obj = extractJson(out);
    return {
      summary: obj.summary || "",
      keywords: Array.isArray(obj.keywords) ? obj.keywords.slice(0, 12).map(k => ({ term: String(k.term || "").slice(0, 40), count: +k.count || 0 })) : [],
      samples: Array.isArray(obj.samples) ? obj.samples.slice(0, 5).map(s => ({ sentiment: String(s.sentiment || "neutral").toLowerCase(), text: String(s.text || "").slice(0, 300) })) : [],
    };
  } catch (e) {
    return { summary: "", keywords: [], samples: [] };
  }
}

/* ---------------- http helpers ---------------- */

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
function cors(resp, origin) {
  const h = new Headers(resp.headers);
  h.set("Access-Control-Allow-Origin", origin);
  h.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(resp.body, { status: resp.status, headers: h });
}
