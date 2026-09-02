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
 *   default model = claude-opus-5 (ตัวเดียวที่ผ่านเกณฑ์ความแม่น — ดู BASELINE.md)
 *   ตั้ง env CLAUDE_MODEL=claude-haiku-4-5 ถ้าต้องการประหยัดและยอมรับความแม่นที่ต่ำลง
 *
 * ออกแบบ aggregate-first: Worker ไม่จัดเก็บ (persist) อะไรทั้งสิ้น —
 * ดึง → วิเคราะห์ในหน่วยความจำ → คืนเฉพาะภาพรวม (ชื่อผู้คอมเมนต์ถูกตัดออกโดย default)
 */

/* เลขเวอร์ชันของ Worker — ไว้ตรวจว่า "โค้ดที่ deploy ไปแล้วเป็นตัวไหน"
   เปิด GET / แล้วดูค่า ver · แก้โค้ดในไฟล์นี้ทีไร **บวกเลขนี้ด้วยทุกครั้ง**
   (เหตุผลเดียวกับป้ายเลขเวอร์ชันของหน้าเว็บใน CLAUDE.md — เลิกเดาว่า deploy ถึงหรือยัง) */
const WORKER_VER = 27;

/* โมเดลที่ใช้จริงตอนวิเคราะห์โพส
   เลือก opus เพราะเป็นตัวเดียวที่ผ่านเกณฑ์ Negative recall 85%
   วัดจริง 6 รอบกับชุดเฉลย 475 ข้อ: opus 91.1-94.0% · haiku 65.1-79.5% (ดู BASELINE.md)
   ⚠️ ต้นทุน ~$0.36 ต่อ 100 คอมเมนต์ (haiku ~$0.07) — แพงกว่า 5 เท่า แต่ haiku ไม่ผ่านเกณฑ์ */
const DEFAULT_MODEL = "claude-opus-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CHUNK = 40;            // จำนวนคอมเมนต์ต่อ 1 คำขอ Claude (ตี sentiment)

/* ============================================================
 * 🚫 นับเฉพาะ "คอมเมนต์บนสุด" ไม่เอา reply — เจ้าของเคาะ 29 ส.ค. 2026
 * ------------------------------------------------------------
 * เหตุผลที่เจ้าของให้ไว้ตรงจุด: **คน reply สื่อถึงคอมเมนต์ ไม่ได้สื่อถึงโพส**
 * เอามารวมเป็น % เมื่อไหร่ ตัวเลขหลักจะแปลไม่ได้ทันที —
 * โพสที่คนเถียงกันดุเดือดจะดู "ลบ" เยอะ ทั้งที่เถียงกันเอง ไม่ได้ด่า CP
 *
 *   คอมเมนต์บนสุด → พูดกับโพส/แบรนด์      = สิ่งที่เครื่องมือนี้วัด
 *   reply         → พูดกับคนคอมเมนต์ด้วยกัน = คนละคำถาม
 *
 * 🐞 ก่อนหน้านี้เปิดไว้ แล้วเกิดปัญหาที่แย่กว่าไม่มี: **แต่ละแพลตฟอร์มนับไม่เหมือนกัน**
 *    YouTube ส่ง reply มาให้ในคำตอบเดียวกัน → ตัวเลขรวม reply
 *    Facebook ไม่ส่งมา (ยืนยันจากการใช้จริง 29 ส.ค.) → ตัวเลขไม่รวม
 *    = เอา % ของ 2 แพลตฟอร์มมาเทียบกันไม่ได้ โดยไม่มีอะไรบอกเลย
 *
 * ⚠️ อยากได้ reply จริงๆ **ห้ามแค่เปลี่ยนค่านี้เป็น true**
 *    ต้องแยกเป็นตัวเลขคนละก้อน ไม่ใช่รวมเข้า % เดิม (เจ้าของสั่งไว้)
 *    และ Facebook ต้องยิง /v1/facebook/post/comment/replies แยกต่อคอมเมนต์ 1 ใบ
 *    = เปลืองเครดิตที่จ่ายเงินราว 30 เท่า
 * ============================================================ */
const INCLUDE_REPLIES = false;
const SYNTH_SAMPLE = 120;    // จำนวนคอมเมนต์ที่ส่งให้ Claude สรุป/หา keyword

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
const RUBRIC_VER = "v6";
const CLASSIFY_MAX = 50;     // จำนวนคอมเมนต์สูงสุดต่อ 1 คำขอ /classify (หน้าเว็บเป็นคนวนเอง)

/* โมเดลที่หน้าวัดผลเลือกได้ — 🚫 **ต้องเป็นรายชื่อตายตัวเท่านั้น**
   /classify เปิดให้ยิงได้จากหน้าเว็บ ถ้ารับชื่อโมเดลอะไรก็ได้ ใครก็สั่งใช้ตัวแพงสุดรัวๆ ได้ */
const MODEL_CHOICES = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"];

/* ⚙️ ระดับการคิดของโมเดล — วัดแล้วพบว่าโทเคนส่วนใหญ่หมดไปกับ "การคิด" ไม่ใช่คำตอบ
   วัดจริง 31 ส.ค. 2026 (475 ใบ): คำตอบที่ต้องเขียนจริงราว 25 โทเคน/ใบ แต่ใช้จริง
   opus 105 · sonnet 224 → ส่วนเกินคือการคิด (sonnet คิดเยอะกว่า opus ~2.5 เท่า)
   ไม่ส่งค่านี้ = ใช้ค่าตั้งต้นของโมเดล ซึ่งคือคิดเต็มที่ (high)

   🚫 **haiku ไม่รองรับ ส่งไปแล้วตอบ error** จึงมีรายชื่อรุ่นที่ส่งได้แยกไว้
   ⚠️ ค่าตั้งต้นของระบบยัง **ไม่ส่ง** — ห้ามเปลี่ยนจนกว่าจะวัดกับชุดเฉลย 475 ใบแล้วเทียบ
      ทั้ง 3 อย่าง: ความแม่น · ราคา · **เวลา** (เจ้าของสั่ง 31 ส.ค.: ช้าเกินไปก็ไม่เอา
      ยกเว้นว่าลดแล้วความแม่นตก) */
const EFFORT_CHOICES = ["low", "medium", "high", "xhigh", "max"];
const EFFORT_MODELS = ["claude-opus-5", "claude-sonnet-5"];

/* ============================================================
 * 📥 กองรอตรวจ (feedback queue) — ชั้น ② ของระบบเรียนรู้
 * ------------------------------------------------------------
 * เจ้าของเคาะดีไซน์ 3 ชั้น 29 ส.ค. 2026:
 *   ① กดแก้ป้ายบนหน้าเว็บ  → แก้รายงานใบนั้นทันที (ไม่ผ่านที่นี่เลย)
 *   ② ส่งเข้ากองรอตรวจ     → **ที่นี่** เก็บไว้เฉยๆ ยังไม่มีผลกับใคร
 *   ③ เอาไปวัดกับชุดสอบ    → ผ่านเกณฑ์ค่อยกลายเป็นกฎจริงในโค้ด (คนทำ ไม่ใช่เครื่อง)
 *
 * 🚫 **ห้ามเอาของในกองนี้ไปสอน AI อัตโนมัติเด็ดขาด** — เจ้าของสั่งไว้ชัด
 *    ถ้าสอนเอง ความแม่นจะเปลี่ยนทุกวันโดยไม่มีใครวัดสักครั้ง แล้ววันหนึ่งจะพบว่าแย่ลง
 *    มานานโดยไม่รู้ว่าตั้งแต่เมื่อไหร่ (ขัดกฎ "ตัวเลขต้องมาจากผลรันจริง" ของ CLAUDE.md)
 *    นี่คือ **ตัวกันคนยิงขยะเข้ามาสอนระบบ** ด้วย — POST เปิดไว้ได้เพราะของในกองไม่มีผลกับใคร
 *
 * 🔒 ไม่เก็บชื่อ · ไม่เก็บลิงก์โพส — เก็บแค่ข้อความ + ป้ายเดิม/ป้ายใหม่ (เจ้าของเคาะ 29 ส.ค.)
 * 💧 กฎ KV ของโปรเจกต์: **blob เดียว อ่าน 1 เขียน 1 ต่อคำขอ** ห้ามแตกเป็น key รายใบ
 * ============================================================ */
const FB_KEY = "sentiment:feedback";
const FB_MAX = 500;          // เพดานรายการในกอง — เกินแล้วตัดตัวเก่าสุดทิ้ง
const FB_MAX_PER_REQ = 60;   // ส่งได้ครั้งละไม่เกินเท่านี้ (กันยิงก้อนใหญ่ถล่ม KV)
const FB_MAX_TEXT = 400;     // ตัดข้อความยาวๆ ทิ้ง — ตัวอย่างสอน AI ไม่ควรยาวกว่านี้
const FB_LABELS = ["positive", "neutral", "negative"];

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
  /* ── เพิ่มรอบ 5 (เจ้าของเจอจากโพสจริง 28 ส.ค. 2026): ด่า "คนคอมเมนต์ด้วยกัน" ที่มาว่า CP
     = แก้ต่างให้ CP → Positive · โมเดลเห็นคำดุแล้วตีเป็น Negative เพราะไม่ได้ดูว่าด่าใคร */
  { t: "แค่ 395 มึงไม่ดูกันก่อนค่อยเม้นท์แหะเขาวะ", cp: "Positive", oc: "Neutral", s: 0 },
  { t: "ฟังคลิปให้จบก่อน", cp: "Positive", oc: "Neutral", s: 0 },
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
    "ค. **เป้าของคอมเมนต์คือ \"คนคอมเมนต์ด้วยกัน\" หรือเปล่า** — ไม่ใช่ CP และไม่ใช่รัฐ",
    "   ถ้าใช่ ให้ดูว่าเขาเข้าข้างฝั่งไหน แล้วตีตามฝั่งนั้น:",
    "   • ตำหนิคนที่มาด่าโดยยังไม่ดู/ไม่ฟังให้จบ · บอกให้ไปดูคลิปก่อนค่อยเม้นท์",
    "     · เถียงแทน CP · หาว่าคนอื่นเข้าใจผิด → **Positive** (เป็นการแก้ต่างให้ CP)",
    "   • เชียร์คนที่ด่า CP · เสริมคนที่โจมตี → Negative",
    '   ⚠️ **คำหยาบ/น้ำเสียงดุ ไม่ได้แปลว่า Negative ต่อ CP** — ต้องดูว่า "ด่าใคร"',
    '     ("แค่ 395 มึงไม่ดูกันก่อนค่อยเม้นท์" = ดุใส่คนคอมเมนต์ที่ยังไม่ดูคลิป → Positive)',
    '     ("ฟังคลิปให้จบก่อน" = บอกคนอื่นให้ดูให้จบก่อนตัดสิน → Positive)',
    "",
    "⚠️ ไม่เข้าทั้ง ก. ข. และ ค. ให้ Neutral — อย่าเดาเอาเอง โดยเฉพาะ:",
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
async function classifyTwoLens(texts, env, acc, context, effort) {
  const numbered = texts
    .map((t, i) => `${i + 1}. ${String(t).replace(/\s+/g, " ").slice(0, 400)}`)
    .join("\n");
  const ctx = context ? `บริบทโพสต์: "${String(context).replace(/\s+/g, " ").slice(0, 300)}"\n\n` : "";
  /* เพดานโทเคนต้องโตตามจำนวนข้อ — ตั้งไว้ตายตัวแล้วโมเดลที่เขียนยาวกว่าจะถูกตัดกลางคัน
     ⚠️ เจอจริง 27 ส.ค. 2026: opus โดนตัดที่ 2,600 → JSON พัง → ตกไปเป็น Neutral ทั้งชุด
        แล้วรายงานออกมาเป็น "ความแม่น 10%" ทั้งที่โมเดลไม่ได้ตอบผิดสักข้อ */
  /* ⚠️ เพดานต้องเผื่อ "ส่วนที่ไม่ใช่คำตอบ" ด้วย — วัดจริง 27 ส.ค. 2026:
     ก้อน 6 ข้อ ต้องการ JSON จริงแค่ ~150 โทเคน แต่เพดาน 1,140 ยังไม่พอ
     แปลว่าโมเดลบางตัว (opus) เขียนความคิด/คำนำก่อนถึง JSON ซึ่ง haiku/sonnet ไม่ทำ
     จึงต้องมีส่วนเผื่อคงที่ก้อนใหญ่ ไม่ใช่คิดตามจำนวนข้ออย่างเดียว */
  const acc2 = acc || {};
  const prompt = ctx + "คอมเมนต์:\n" + numbered;
  const sys = systemTwoLens();
  let budget = Math.min(12000, 60 * texts.length + 4000);
  let out = await callClaude(env, sys, prompt, budget, acc2, { effort });

  /* ถูกตัดกลางคัน = ลองใหม่อีกครั้งด้วยเพดาน 2 เท่า ก่อนจะยอมแพ้
     ดีกว่าโยน error ทันที เพราะความยาวของคำนำเดาไม่ได้และต่างกันไปในแต่ละก้อน */
  if (acc2.stop_reason === "max_tokens") {
    budget = Math.min(20000, budget * 2);
    out = await callClaude(env, sys, prompt, budget, acc2, { effort });
  }
  if (acc2.stop_reason === "max_tokens") {
    throw new Error(`คำตอบถูกตัดกลางคันแม้ขยายเพดานเป็น ${budget} แล้ว — ลดจำนวนข้อต่อก้อน`);
  }

  const arr = extractJsonArray(out) || [];
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

/** ทำความสะอาด 1 รายการที่ส่งเข้ากอง — ไม่ผ่านเกณฑ์คืน null (ทิ้งเงียบ ไม่ใช่เก็บของเสีย) */
function fbClean(o) {
  if (!o || typeof o !== "object") return null;
  const text = String(o.text || "").replace(/\s+/g, " ").trim().slice(0, FB_MAX_TEXT);
  const was = String(o.was || "").toLowerCase();
  const now = String(o.now || "").toLowerCase();
  if (!text) return null;
  if (!FB_LABELS.includes(was) || !FB_LABELS.includes(now)) return null;
  if (was === now) return null;                                  // ไม่ได้แก้อะไร ไม่ต้องเก็บ
  return {
    text, was, now,
    target: o.target === "cp" ? "cp" : "overall",                // แก้แกนไหน
    model: String(o.model || "").slice(0, 40),
    ver: Number.isFinite(+o.ver) ? +o.ver : null,
    rubric: String(o.rubric || "").slice(0, 10),
    at: new Date().toISOString().slice(0, 10),                   // วันที่พอ ไม่ต้องละเอียดถึงวินาที
  };
}

/** POST /feedback — ต่อของใหม่เข้ากอง · GET /feedback?key=… — อ่านกอง (ต้องมีกุญแจ) */
async function feedbackRoute(request, url, env) {
  const kv = env.FEEDBACK_KV;

  if (request.method === "GET") {
    /* 🔒 อ่านกอง = เห็นข้อความคอมเมนต์ที่สะสมไว้ทั้งหมด จึงต้องมีกุญแจเสมอ
       ⚠️ ไม่ได้ตั้ง FEEDBACK_KEY ไว้ = **ปิด** ไม่ใช่เปิดให้ทุกคน
          (ค่าปริยายที่ปลอดภัยกว่า — ลืมตั้งแล้วข้อมูลหลุดเป็นเรื่องที่กู้ไม่ได้) */
    if (!env.FEEDBACK_KEY) return json({ error: "read_disabled", detail: "ยังไม่ได้ตั้ง FEEDBACK_KEY ที่ Cloudflare" }, 403);
    const given = url.searchParams.get("key") || request.headers.get("x-fb-key") || "";
    if (given !== env.FEEDBACK_KEY) return json({ error: "bad_key" }, 403);
    if (!kv) return json({ ok: true, stored: false, reason: "no_kv", items: [] });
    const items = JSON.parse((await kv.get(FB_KEY)) || "[]");
    if (url.searchParams.get("clear") === "1") {
      await kv.put(FB_KEY, "[]");
      return json({ ok: true, cleared: items.length, items: [] });
    }
    return json({ ok: true, ver: WORKER_VER, count: items.length, max: FB_MAX, items });
  }

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  const raw = Array.isArray(body?.items) ? body.items.slice(0, FB_MAX_PER_REQ) : [];
  const incoming = raw.map(fbClean).filter(Boolean);
  if (!incoming.length) return json({ error: "no_items" }, 400);

  /* ไม่มี KV = บอกตรงๆ ว่าไม่ได้เก็บ **ห้ามตอบ ok เฉยๆ**
     ไม่งั้นหน้าเว็บจะขึ้นว่า "ส่งแล้ว" ทั้งที่ไม่มีอะไรถูกเก็บเลย (กับดัก "ไม่รู้ ≠ สำเร็จ") */
  if (!kv) return json({ ok: false, stored: false, reason: "no_kv", detail: "ยังไม่ได้ผูก KV (FEEDBACK_KV) ที่ Cloudflare" }, 200);

  const cur = JSON.parse((await kv.get(FB_KEY)) || "[]");        // อ่าน 1 ครั้ง
  const seen = new Set(cur.map(x => x.target + "\n" + x.text));
  let added = 0;
  for (const it of incoming) {
    const k = it.target + "\n" + it.text;
    if (seen.has(k)) continue;                                   // ส่งซ้ำไม่ทำให้กองบวม
    seen.add(k); cur.push(it); added++;
  }
  const kept = cur.slice(-FB_MAX);                               // เกินเพดาน = ตัดตัวเก่าสุดทิ้ง
  if (added) await kv.put(FB_KEY, JSON.stringify(kept));         // เขียน 1 ครั้ง (ไม่มีของใหม่ = ไม่เขียนเลย)
  return json({ ok: true, stored: true, added, skipped: incoming.length - added, total: kept.length });
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

    /* ชั้น ② ของระบบเรียนรู้ — เก็บที่คนแก้ป้ายไว้ ยังไม่มีผลกับการตัดสินของ AI
       ดูกฎทั้งหมดที่หัวข้อ FB_KEY ข้างบน และที่ FEEDBACK.md */
    if (url.pathname === "/feedback" && (request.method === "POST" || request.method === "GET")) {
      try {
        return cors(await feedbackRoute(request, url, env), origin);
      } catch (e) {
        return cors(json({ error: "feedback_failed", detail: String(e && e.message || e) }, 500), origin);
      }
    }

    /* ดึงคอมเมนต์ออกมาเฉยๆ ไม่ตี sentiment — ไว้เอาไป label เพิ่มเป็นชุดวัดผล
       ⚠️ กินเครดิต ScrapeCreators (ของที่จ่ายเงิน) แต่ **ไม่แตะโควตา Claude เลย**
       🔒 ไม่คืนชื่อผู้คอมเมนต์ — ตัดออกตั้งแต่ที่นี่ ไม่ใช่ไปตัดที่หน้าเว็บ */
    if (request.method === "POST" && url.pathname === "/comments") {
      let body;
      try { body = await request.json(); } catch (e) { return cors(json({ error: "bad_json" }, 400), origin); }
      const link = String(body?.url || "").trim();
      const platform = detectPlatform(link);
      if (!link || !platform) return cors(json({ error: "bad_url" }, 400), origin);
      const limit = Math.max(10, Math.min(2000, +body.limit || 500));
      try {
        const got = platform === "youtube"
          ? await fetchYouTube(link, limit, env)
          : await fetchScrapeCreators(platform, link, limit, env);
        return cors(json({
          ok: true, ver: WORKER_VER, platform,
          post_title: got.post_title || "",
          count: got.comments.length,
          reply_count: got.comments.filter(c => c.is_reply).length,
          credits_remaining: got.credits_remaining ?? null,
          comments: got.comments.map(c => ({
            text: String(c.text || "").replace(/\s+/g, " ").trim(),
            likes: c.likes || 0, replies: c.replies || 0, time: c.time || "",
            is_reply: c.is_reply ? 1 : 0,
          })).filter(c => c.text),
        }), origin);
      } catch (e) {
        return cors(json({ error: "fetch_failed", detail: String(e && e.message || e) }, 502), origin);
      }
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
        const effort = EFFORT_CHOICES.includes(body.effort) ? body.effort : null;
        const results = await classifyTwoLens(texts, { ...env, CLAUDE_MODEL: model }, acc, body.context, effort);
        const missing = results.filter(r => r.missing).length;
        return cors(json({ ok: true, ver: WORKER_VER, rubric: RUBRIC_VER, model, effort, missing, results, tokens: acc }), origin);
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
  const reply_count = comments.filter(c => c.is_reply).length;
  logLine(`ดึงคอมเมนต์สำเร็จ ${comments.length} รายการ` +
    (reply_count ? ` (เป็น reply ${reply_count})` : " (นับเฉพาะคอมเมนต์บนสุด ไม่รวม reply)"));
  if (collected.credits_remaining != null) logLine(`ScrapeCreators credits คงเหลือ ${collected.credits_remaining}`);

  /* คอมเมนต์ที่เป็นสติกเกอร์ / GIF / รูปล้วน — ไม่มีตัวอักษรให้ AI อ่าน
     ✅ เจ้าของสั่ง 31 ส.ค. 2026: **ไม่ตัดทิ้ง ให้นับเป็น "กลาง"** จำนวนจะได้ตรงกับที่ดึงมา
        (ของเดิมคัดทิ้ง แล้วเลขบนจอไม่ตรงกับจำนวนคอมเมนต์จริง ทำให้เข้าใจผิด)

     ⚠️ แต่ยังต้องนับแยกและติดธงไว้ทุกใบ — "กลาง" ตรงนี้แปลว่า **ไม่มีอะไรให้อ่าน**
        ไม่ใช่ "AI อ่านแล้วเห็นว่าเป็นกลาง" · คนละเรื่องกันสิ้นเชิง
        ถ้าไม่แยก วันหนึ่งโพสที่มีแต่สติกเกอร์จะรายงานว่า "กลาง 100%" อย่างมั่นใจ
        ทั้งที่ไม่ได้อ่านอะไรเลยสักใบ (กฎ "ไม่รู้ ≠ ค่าใดค่าหนึ่ง" ใน CLAUDE.md)

     🚫 ห้ามส่งใบพวกนี้ไปให้ AI — ข้อความว่างเปล่าไม่มีอะไรให้ตัดสิน เปลืองโทเคนฟรี */
  /* ⚠️ ต้อง trim ก่อนเสมอ — "   " (ช่องว่างล้วน) ไม่ใช่ข้อความ แต่ผ่านเงื่อนไข if(t) ได้
     เจอจริงตอนเขียนเทสต์ 31 ส.ค. 2026: ส่งบรรทัดว่างไปให้ AI แล้วมันตอบมั่วให้ 1 ใบ */
  const texts = comments.map(c => String(c.text || "").trim());
  const askIdx = [];                                  // ตำแหน่งของใบที่มีข้อความจริง
  texts.forEach((t, i) => { if (t) askIdx.push(i); });
  const skipped_no_text = texts.length - askIdx.length;
  if (skipped_no_text) logLine(`ไม่มีข้อความ ${skipped_no_text} รายการ (สติกเกอร์/รูป) — นับเป็นกลาง ไม่ส่งให้ AI`);
  if (!askIdx.length) throw new Error("คอมเมนต์ทั้งหมดเป็นสติกเกอร์/รูป ไม่มีข้อความให้วิเคราะห์");

  // ตัวสะสมการใช้ token ของ Claude
  const tokens = { input: 0, output: 0, rate_remaining: null };

  /* 2) ตี sentiment ด้วยตัวจัดหมวด 2 แกน (rubric v5 — วัดได้ 94% กับ opus)
        ⚠️ ตัวเดียวกับที่หน้าวัดความแม่นใช้ ห้ามแยกเป็นคนละชุด ไม่งั้นตัวเลขที่วัดไว้ใช้อ้างอิงไม่ได้ */
  const modelUsed = env.CLAUDE_MODEL || DEFAULT_MODEL;
  const nBatch = Math.ceil(askIdx.length / CHUNK);
  logLine(`ตี sentiment 2 แกน ด้วย ${modelUsed} · ${nBatch} batch (batch ละ ${CHUNK})`);
  const asked = [];
  for (let i = 0; i < askIdx.length; i += CHUNK) {
    const batch = askIdx.slice(i, i + CHUNK).map(j => texts[j]);
    const part = await classifyTwoLens(batch, env, tokens, opts.post_context || collected.post_title || "");
    asked.push(...part);
    logLine(`  batch ${Math.floor(i / CHUNK) + 1}/${nBatch} เสร็จ (${batch.length} คอมเมนต์)`);
  }

  /* เอาคำตอบกลับเข้าตำแหน่งเดิม แล้วเติมใบที่ไม่มีข้อความเป็น "กลาง" พร้อมติดธง
     ⚠️ ต้องคืนตำแหน่งตามลำดับเดิม ไม่งั้นข้อความในรายการตรวจกับป้ายจะสลับกันทั้งกระดาน */
  const two = texts.map(() => null);
  askIdx.forEach((j, k) => { two[j] = asked[k]; });
  for (let i = 0; i < two.length; i++) {
    if (!two[i]) two[i] = { sentiment_cp: "Neutral", overall_cred: "Neutral", is_sarcasm: 0, no_text: 1 };
  }

  const count = (key) => {
    const c = { positive: 0, neutral: 0, negative: 0 };
    for (const r of two) {
      const k = String(r[key] || "").toLowerCase();
      if (c[k] != null) c[k]++;
    }
    return c;
  };
  const lenses = { cp: count("sentiment_cp"), overall: count("overall_cred") };
  const sarcasm_count = two.filter(r => r.is_sarcasm === 1).length;

  /* คงรูปแบบเดิมไว้ด้วย เพื่อให้หน้าเว็บรุ่นก่อนที่ยังอยู่บน production ไม่พัง
     🚫 ไม่มี not_related อีกแล้ว (นิยามใหม่: ไม่แตะ CP = Neutral) จึงคืน 0 เสมอ */
  /* 🐞 แถบสรุปกับรายการ audit ต้องมาจาก "แกนเดียวกัน" เสมอ
     เจอจริง 28 ส.ค. 2026: โหมดอารมณ์รวมโชว์ ลบ 20 แต่รายการข้างล่างมี ลบ 7
     เพราะแถบสรุปใช้ overall_cred ส่วน audit ฮาร์ดโค้ดไว้ที่ sentiment_cp
     → ต้องเลือก key ที่เดียว แล้วใช้ตัวนั้นทั้งคู่ */
  const LENS_KEY = target === "cp" ? "sentiment_cp" : "overall_cred";
  const sentiment = target === "cp" ? lenses.cp : lenses.overall;
  const not_related = 0;
  logLine(`แกนต่อ CP → บวก ${lenses.cp.positive} · กลาง ${lenses.cp.neutral} · ลบ ${lenses.cp.negative}`);
  logLine(`แกนอารมณ์รวม → บวก ${lenses.overall.positive} · กลาง ${lenses.overall.neutral} · ลบ ${lenses.overall.negative}`);
  logLine(`ประชด ${sarcasm_count} รายการ`);

  // audit รายคอมเมนต์ (ข้อความ + ผลทั้ง 2 แกน) สำหรับตรวจบนจอ — ไม่รวมชื่อผู้คอมเมนต์
  const labels = two.map(r => String(r[LENS_KEY] || "neutral").toLowerCase());
  const audit = texts.map((t, i) => ({
    text: String(t).replace(/\s+/g, " ").slice(0, 220),
    sentiment: labels[i],                                   // ของเดิม (หน้าเก่ายังอ่านคีย์นี้)
    sentiment_cp: two[i]?.sentiment_cp,
    overall_cred: two[i]?.overall_cred,
    is_sarcasm: two[i]?.is_sarcasm ? 1 : 0,
    /* 🏷 ธงบอกว่าใบนี้ "ไม่มีข้อความให้อ่าน" ไม่ใช่ "AI อ่านแล้วเห็นว่ากลาง"
       หน้าเว็บต้องเอาไปแสดงให้ต่างกัน ไม่งั้นดูเหมือน AI ตัดสินมาแล้วทั้งที่ไม่ได้อ่าน */
    no_text: two[i]?.no_text ? 1 : 0,
  }));

  /* 3) สรุป + keyword + ตัวอย่าง
        โหมด CP: สรุปจากคอมเมนต์ที่มีท่าทีต่อ CP จริงๆ (ตัด Neutral ที่ไม่ได้แตะ CP ออก)
        ไม่งั้นสรุปจะกลายเป็นเรื่องปลา/รัฐ ซึ่งไม่ใช่สิ่งที่คอลัมน์นี้ต้องการ */
  /* ⚠️ ใบที่ไม่มีข้อความต้องไม่เข้ากองสรุปทุกกรณี — ส่งสตริงว่างไปให้ AI สรุป
        ได้แต่ทำให้สรุปเพี้ยนกับเปลืองโทเคน (โหมดอารมณ์รวมของเดิมส่ง texts ทั้งก้อน) */
  const synthIdx = [];
  texts.forEach((t, i) => {
    if (!t) return;
    if (target !== "cp" || labels[i] === "positive" || labels[i] === "negative") synthIdx.push(i);
  });
  const synthPool = synthIdx.map(i => texts[i]);
  if (target === "cp") logLine(`สรุปจากคอมเมนต์ที่แสดงท่าทีต่อ CP ${synthPool.length} รายการ`);

  /* 🎯 **เราเลือกใบตัวอย่างเอง ไม่ให้ AI เลือก** (แก้ 31 ส.ค. 2026 รอบสอง)
     ของเดิมให้ AI เลือกเองแล้วสั่งให้ตอบเลขข้อกลับมาด้วย — ถ้ามันไม่ตอบเลข
     ตัวอย่างจะย้ายตามป้ายที่ผู้ใช้แก้ไม่ได้ **และไม่มีอะไรบอกว่าเพราะอะไร**
     เจ้าของเจอเองว่า "เปลี่ยนแล้วก็ไม่อัพเดทอยู่ดี"
     ตอนนี้ฝั่งเราชี้เลยว่าเอาใบไหน AI มีหน้าที่ถอดความอย่างเดียว
     → รู้แน่นอนว่าตัวอย่างแต่ละอันมาจากคอมเมนต์ใบไหน ไม่ต้องเชื่อ AI

     เกณฑ์เลือก: ถูกใจเยอะสุดก่อน แล้วค่อยยาวสุด (ตัวแทนที่คนเห็นด้วยมากที่สุด)
     ⚠️ ต้องเรียงแบบตายตัว ไม่งั้นวิเคราะห์โพสเดิมซ้ำแล้วได้ตัวอย่างคนละใบทุกครั้ง */
  const pickBy = (want, n) => synthIdx
    .filter(i => labels[i] === want)
    .sort((x, y) => (comments[y].likes || 0) - (comments[x].likes || 0) ||
                    texts[y].length - texts[x].length || x - y)
    .slice(0, n);
  const pickIdx = wantSamples ? [...pickBy("positive", 2), ...pickBy("negative", 2)] : [];
  if (pickIdx.length) logLine(`เลือกใบตัวอย่างเอง ${pickIdx.length} ใบ (ถูกใจเยอะสุดของแต่ละกลุ่ม)`);

  const synth = synthPool.length
    ? await synthesize(synthPool.slice(0, SYNTH_SAMPLE), wantSamples, env, tokens, target,
                       pickIdx, pickIdx.map(i => texts[i]), pickIdx.map(i => labels[i]),
                       /* สัดส่วนจริงทั้งโพส — ให้สรุปสะท้อนของจริง ไม่ใช่สะท้อนแค่กองที่ส่งไปอ่าน */
                       { ...sentiment, total: texts.length },
                       /* นับ keyword จาก **คอมเมนต์ทุกใบ** ไม่ใช่แค่กองที่ส่งให้ AI อ่าน */
                       texts.filter(Boolean))
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
    reply_count,
    no_text_count: skipped_no_text,   // สติกเกอร์/รูป — นับเป็นกลางแล้ว แต่ต้องบอกผู้ใช้ว่ามีกี่ใบ
    /* 📋 สรุปมาจากคอมเมนต์กี่ใบจากทั้งหมดกี่ใบ — หน้าเว็บต้องเขียนให้ตรง
       ⚠️ ของเดิมหน้าเว็บเขียนว่า "สรุปโดย Claude จากคอมเมนต์ทั้งหมด" ซึ่ง **ไม่จริง**
          โหมด CP สรุปจากเฉพาะใบที่แสดงท่าทีต่อ CP (ตัดกลางออก) และตัดที่ SYNTH_SAMPLE ด้วย
          พอไม่บอก ผู้ใช้อ่านแล้วงงว่าทำไมสรุปดุเดือดทั้งที่ส่วนใหญ่เป็นกลาง */
    summary_from: Math.min(synthPool.length, SYNTH_SAMPLE),
    summary_of: texts.length,
    skipped_no_text: 0,               // ไม่ได้คัดทิ้งแล้ว (คงคีย์ไว้ให้หน้าเว็บรุ่นก่อนไม่พัง)
    analyzed_count: two.length,
    target,
    not_related,
    sentiment,
    lenses,
    sarcasm_count,
    /* 🔢 เลขเวอร์ชันหลังบ้าน — **ต้องติดมากับผลวิเคราะห์ทุกครั้ง**
       ของเดิมส่งเฉพาะที่ endpoint สุขภาพ (`/`) ผลคือบันทึกการแก้ป้ายที่ส่งเข้าคิวรีวิว
       เก็บ ver เป็น null ทุกใบ → ย้อนดูไม่ได้ว่าที่แก้มาจากหลังบ้านรุ่นไหน
       และเวลาไล่ปัญหา "ตัวอย่างไม่ย้าย" ก็แยกไม่ออกว่าหลังบ้านเก่าหรือหน้าเว็บเก่า
       (เจ้าของเจอจริง 2 ก.ย. 2026 — ต้นเหตุจริงคือหน้าเว็บรุ่น 10 ไม่ใช่หลังบ้าน) */
    ver: WORKER_VER,
    rubric: RUBRIC_VER,
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

async function fetchYouTube(url, limit, env, includeReplies = INCLUDE_REPLIES) {
  if (!env.YOUTUBE_API_KEY) throw new Error("ยังไม่ได้ตั้งค่า YOUTUBE_API_KEY");
  const vid = youtubeVideoId(url);
  if (!vid) throw new Error("แยก video id จากลิงก์ YouTube ไม่ได้");

  const out = [];
  let pageToken = "";
  while (out.length < limit) {
    const api = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
    /* ขอ replies มาด้วย — YouTube แถมมาให้สูงสุด 5 อันต่อกระทู้ในคำขอเดียว ไม่เปลืองโควตาเพิ่ม
       ⚠️ กระทู้ที่มี reply เกิน 5 จะได้ไม่ครบ (ต้องยิง /comments?parentId= แยกอีกที ซึ่งเปลืองโควตา) */
    api.searchParams.set("part", "snippet,replies");
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
        is_reply: 0,
      });
      if (out.length >= limit) break;

      /* reply นับเป็นคอมเมนต์เต็มใบ — ในกระทู้ที่คนเถียงกัน ความเห็นที่แรงที่สุดมักอยู่ใน reply
         ไม่ใช่คอมเมนต์บนสุด ถ้าไม่นับจะได้ภาพที่อ่อนกว่าความจริง */
      if (includeReplies) {
        for (const rep of item.replies?.comments || []) {
          const rs = rep.snippet;
          if (!rs?.textDisplay) continue;
          out.push({
            text: rs.textDisplay, author: rs.authorDisplayName || "",
            likes: rs.likeCount || 0, replies: 0, time: rs.publishedAt || "", is_reply: 1,
          });
          if (out.length >= limit) break;
        }
        if (out.length >= limit) break;
      }
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
/** แปลง 1 คอมเมนต์จาก ScrapeCreators เป็นรูปแบบภายในของเรา */
function scComment(c, is_reply) {
  const rawReplies = pickField(c, ["reply_count", "replyCount", "comment_count"]);
  return {
    text: pickField(c, ["text", "comment", "content", "body", "message"]) || "",
    author: pickField(c, ["author", "username", "user", "name", "nickname"]) || "",
    likes: +pickField(c, ["likes", "like_count", "likeCount", "digg_count"]) || 0,
    replies: +rawReplies || 0,
    time: pickField(c, ["time", "created_at", "createdAt", "timestamp", "create_time"]) || "",
    is_reply,
  };
}

/**
 * หา reply ที่ซ้อนอยู่ในคอมเมนต์ 1 ใบ
 * ⚠️ คีย์ `replies` เป็นได้ทั้ง "จำนวน" (ตัวเลข) และ "รายการ" (array) แล้วแต่ต้นทาง
 *    ต้องเช็คชนิดก่อนเสมอ — เอา array ไปบวกเลขจะได้ NaN แล้วจำนวน reply กลายเป็น 0 เงียบๆ
 */
function nestedReplies(c) {
  for (const k of ["replies", "reply_list", "children", "sub_comments", "comments"]) {
    const v = c && c[k];
    if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
  }
  return [];
}

async function fetchScrapeCreators(kind, url, limit, env, includeReplies = INCLUDE_REPLIES) {
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
      out.push(scComment(c, 0));
      if (out.length >= limit) break;
      /* reply ที่ซ้อนมาใน response — แตกออกมาเป็นคอมเมนต์เต็มใบ
         ⚠️ ยังไม่ยืนยันว่า ScrapeCreators ส่ง reply ซ้อนมาให้ทุกแพลตฟอร์มหรือเปล่า
            ถ้าไม่ส่งมา ตรงนี้จะไม่ทำอะไรเลย (ไม่พัง) และจำนวนที่ได้จะเท่าเดิม */
      if (includeReplies) {
        for (const rep of nestedReplies(c)) {
          out.push(scComment(rep, 1));
          if (out.length >= limit) break;
        }
        if (out.length >= limit) break;
      }
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

async function callClaude(env, system, userText, maxTokens, acc, opts = {}) {
  const model = env.CLAUDE_MODEL || DEFAULT_MODEL;
  const body = {
    model,
    max_tokens: maxTokens,
    /* 💾 คำสั่ง + ตัวอย่าง 22 ข้อ ยาว ~5,800 ตัวอักษร และ **เหมือนกันทุกครั้ง**
       (systemTwoLens() ไม่รับพารามิเตอร์เลย · บริบทโพสอยู่ในข้อความของผู้ใช้ ไม่ได้อยู่ตรงนี้)
       ของเดิมส่งซ้ำทุกก้อน — วิเคราะห์ 475 ใบ = ส่งคำสั่งชุดเดิมซ้ำ 12 รอบ
       ทำเครื่องหมายให้ฝั่ง Anthropic เก็บไว้ใช้ซ้ำ → รอบถัดๆ ไปคิดถูกลงมาก
       ⚠️ **ห้ามเอาอะไรที่เปลี่ยนทุกรอบมาใส่ใน system เด็ดขาด** (เวลา · ชื่อโพส · เลขรัน)
          เปลี่ยนแม้แต่ตัวอักษรเดียว = แคชพังทั้งก้อน แล้วจะกลับไปจ่ายเต็มโดยไม่มีอะไรบอก
          วิธีตรวจ: ดู cache_read ในผลลัพธ์ ถ้าเป็น 0 ตลอด แปลว่าแคชไม่ทำงาน */
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userText }],
  };
  /* ระดับการคิด — ไม่ส่ง = ใช้ค่าตั้งต้นของโมเดล (คิดเต็มที่)
     🚫 haiku ไม่รองรับ ส่งไปแล้วตอบ error — ต้องกันไว้ ไม่ใช่ปล่อยให้พังตอนรัน */
  if (opts.effort && EFFORT_MODELS.includes(model)) {
    body.output_config = { effort: opts.effort };
  }
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error("Claude API: " + (data?.error?.message || ("HTTP " + r.status)));
  if (acc) {
    if (data.usage) {
      acc.input += data.usage.input_tokens || 0;
      acc.output += data.usage.output_tokens || 0;
      /* แยกนับโทเคนที่ "เขียนแคช" กับ "อ่านแคช" — คนละราคากัน
         เขียน 1.25 เท่าของปกติ · อ่าน 0.1 เท่า · เอาไปรวมกับ input เฉยๆ จะคิดเงินผิด */
      acc.cache_write = (acc.cache_write || 0) + (data.usage.cache_creation_input_tokens || 0);
      acc.cache_read = (acc.cache_read || 0) + (data.usage.cache_read_input_tokens || 0);
    }
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

/**
 * หา "JSON array" ก้อนแรกที่แกะได้จริงในข้อความ
 *
 * ⚠️ ทำไมต้องมีตัวนี้แยกจาก extractJson (เจอจริง 28 ส.ค. 2026):
 *    opus บางครั้งตอบ object เดี่ยวก่อน แล้วค่อยแก้ตัวเองเป็น array ที่ถูกต้อง เช่น
 *      {"cp":"Negative","oc":"Negative","s":0} Wait—must output array. [{"i":1,...}, ...]
 *    extractJson หยิบก้อนแรก ({...}) ไปแล้วได้ของที่ไม่ใช่ array → ทิ้งทั้งก้อนทั้งที่คำตอบจริงอยู่ถัดไป
 *    ตัวนี้จึงไล่หาทุกตำแหน่งที่ขึ้นต้นด้วย [ แล้วนับวงเล็บให้สมดุล (ข้ามวงเล็บที่อยู่ในสตริง)
 */
function extractJsonArray(text) {
  let s = String(text);
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1];

  for (let i = s.indexOf("["); i !== -1; i = s.indexOf("[", i + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < s.length; j++) {
      const ch = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          try {
            const v = JSON.parse(s.slice(i, j + 1));
            if (Array.isArray(v) && v.length) return v;
          } catch (e) { /* ก้อนนี้ไม่ใช่ ลองก้อนถัดไป */ }
          break;
        }
      }
    }
  }
  return null;
}

/** สรุปภาพรวม + keyword + ตัวอย่างคอมเมนต์ (ถอดความ) */
/**
 * นับว่าแต่ละคำโผล่ในคอมเมนต์กี่ใบจริงๆ — **ไม่เอาเลขที่ AI เดามา**
 * 🐞 เจ้าของเจอ 31 ส.ค. 2026: แถบ "คำที่พูดถึงบ่อย" มีเลข 24/20/12 ซึ่ง AI แต่งขึ้นทั้งหมด
 *    (prompt เดิมสั่งว่า "count: จำนวนโดยประมาณ") ดูเหมือนตัวเลขที่นับมา แต่ไม่ใช่
 *    และคำที่ได้เป็นประโยคยาวๆ ไม่ใช่คำ
 *
 * ⚠️ ใช้ includes() ตรงๆ ห้ามตัดคำด้วยช่องว่าง — ภาษาไทยไม่มีช่องว่างคั่นคำ
 *    (กฎเดียวกับหน้า /archives/ ใน CLAUDE.md)
 * ⚠️ คำที่นับได้ 0 = AI แต่งขึ้นเอง **ต้องตัดทิ้ง** ไม่ใช่โชว์เลข 0 ให้ดูเหมือนมีข้อมูล
 */
function countTerms(terms, texts) {
  if (!Array.isArray(terms) || !texts || !texts.length) return [];
  const low = texts.map(t => String(t).toLowerCase());
  const seen = new Set();
  const out = [];
  for (const raw of terms.slice(0, 20)) {
    const term = String(typeof raw === "string" ? raw : (raw && raw.term) || "").trim().slice(0, 40);
    const q = term.toLowerCase();
    if (q.length < 2 || seen.has(q)) continue;
    seen.add(q);
    let n = 0;
    for (const t of low) if (t.includes(q)) n++;
    if (n > 0) out.push({ term, count: n });
  }
  return out.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term)).slice(0, 12);
}

async function synthesize(sampleTexts, wantSamples, env, acc, target, pickIdx, pickTexts, pickLabels, dist, allTexts) {
  const joined = sampleTexts.map((t, i) => `${i + 1}. ${String(t).replace(/\s+/g, " ").slice(0, 300)}`).join("\n");
  const focus = target === "cp"
    ? "คอมเมนต์เหล่านี้คัดมาเฉพาะที่พูดถึงเครือเจริญโภคภัณฑ์ (CP) — ให้สรุปและหา keyword โดยโฟกัสที่ **ท่าทีและประเด็นที่คนพูดถึง CP** เท่านั้น "
    : "";
  /* 📊 บอกสัดส่วนจริงให้โมเดลรู้ ไม่งั้นมันสรุปจากกองที่ส่งไปอย่างเดียว
     แล้วได้สรุปที่ฟังดูดุเดือดทั้งที่ภาพรวมส่วนใหญ่เป็นกลาง
     (เจ้าของแจ้ง 31 ส.ค. 2026: "สรุปมั่วไปเลย ทั้งที่ sentiment ส่วนใหญ่เป็นกลาง") */
  const share = dist
    ? `\n\nสัดส่วนจริงของ**คอมเมนต์ทั้งโพส ${dist.total} ใบ**: ` +
      `บวก ${dist.positive} · กลาง ${dist.neutral} · ลบ ${dist.negative}` +
      (target === "cp" ? " (กลาง = ไม่ได้พูดถึง CP โดยตรง)" : "") +
      `\nแต่ข้อความที่ให้อ่านด้านล่างมีแค่ ${sampleTexts.length} ใบ` +
      (target === "cp" ? " (เฉพาะที่แสดงท่าทีต่อ CP)" : " (บางส่วน)") + " · " +
      "⚠️ **สรุปต้องสะท้อนสัดส่วนจริงข้างบน** ห้ามเขียนเหมือนว่าทั้งโพสเป็นแบบที่อ่านมา " +
      "ถ้าส่วนใหญ่เป็นกลาง ต้องบอกไว้ในประโยคแรก"
    : "";
  const system =
    "คุณเป็นนักวิเคราะห์ social listening ภาษาไทย วิเคราะห์คอมเมนต์ที่ให้มาแล้วตอบเป็น JSON object เท่านั้น " +
    focus +
    "โครงสร้าง: {" +
    '"summary": "สรุปภาพรวมกระแส 2-3 ประโยค ภาษาไทย", ' +
    /* 🚫 ไม่ขอให้ AI นับให้ — เลขที่มันเดาดูเหมือนของจริงแต่ไม่ใช่ (เจ้าของเจอ 31 ส.ค. 2026)
       เราไปนับเองจากข้อความจริงทีหลัง · ที่นี่ขอแค่ "คำ" ที่โผล่จริงในคอมเมนต์ */
    '"keywords": ["คำสั้นๆ", ...] (10-14 คำ) ' +
    '⚠️ keywords เป็น array ของ **สตริงสั้นๆ** เท่านั้น (1-3 คำ ไม่เกิน 20 ตัวอักษร) ' +
    'ต้องเป็นคำที่ **ปรากฏอยู่จริงในคอมเมนต์แบบตรงตัวอักษร** ห้ามแต่งวลีขึ้นมาเอง ' +
    'ห้ามเป็นประโยคหรือหัวข้อยาวๆ ห้ามใส่ตัวเลข ' +
    (wantSamples
      ? '"samples": ["ถอดความข้อที่ 1", "ถอดความข้อที่ 2", ...] ' +
        '⚠️ samples เป็น array ของ **สตริง** เท่านั้น · ' +
        'ถอดความ "คอมเมนต์ที่ต้องถอดความ" ด้านล่างทีละข้อ **เรียงตามลำดับเดิม จำนวนต้องเท่ากันเป๊ะ** · ' +
        'ห้ามสลับ ห้ามข้าม ห้ามรวบหลายข้อเป็นข้อเดียว ห้ามเพิ่มข้อใหม่'
      : '"samples": []') +
    "} ห้ามมีข้อความนอก JSON และห้ามคัดลอกข้อความต้นฉบับตรงๆ ในตัวอย่าง (ให้ถอดความ)";
  /* รายการที่ต้องถอดความส่งแยกจากกองที่ใช้สรุป — จะได้จับคู่กลับได้แน่นอน */
  const toPara = (pickTexts && pickTexts.length)
    ? "\n\nคอมเมนต์ที่ต้องถอดความ (" + pickTexts.length + " ข้อ เรียงตามนี้):\n" +
      pickTexts.map((t, i) => `${i + 1}. ${String(t).replace(/\s+/g, " ").slice(0, 300)}`).join("\n")
    : "";
  const out = await callClaude(env, system, "คอมเมนต์ (ตัวอย่าง):\n" + joined + share + toPara, 1500, acc);
  try {
    const obj = extractJson(out);
    return {
      summary: obj.summary || "",
      keywords: countTerms(obj.keywords, allTexts || sampleTexts),
      /* 🔗 src = ตำแหน่งคอมเมนต์ต้นทางในรายการเต็ม — ผูกไว้เพื่อให้หน้าเว็บย้ายตัวอย่าง
            ตามป้ายที่ผู้ใช้แก้เองได้ (เจ้าของแจ้ง 31 ส.ค. 2026: "ตัวอย่างไม่ปรับตามที่กดเปลี่ยน")
         ⚠️ ตัวอย่างยังเป็นข้อความ **ถอดความ** เหมือนเดิม ไม่ได้เอาต้นฉบับมาแสดง
            (PRIVACY_NOTE ข้อ 4 — ตัวอย่างไปอยู่ในรายงานที่แชร์กันได้)
         ⚠️ AI ไม่ตอบ i มา / ตอบเลขนอกช่วง = ปล่อย src เป็น null แล้วใช้ป้ายที่ AI ให้มาแทน
            ห้ามเดาตำแหน่ง ไม่งั้นตัวอย่างจะไปโผล่ผิดกลุ่มแบบเงียบๆ */
      /* 🔗 จับคู่ด้วย "ลำดับ" ล้วนๆ — ข้อที่ i ของคำตอบ = ใบที่ i ที่เราเลือกส่งไป
         ป้ายก็ใช้ของเราเอง ไม่ใช่ที่ AI บอก → ตัวอย่างจึงย้ายตามป้ายที่ผู้ใช้แก้ได้เสมอ
         ⚠️ AI ตอบมาไม่ครบ/เกิน = เอาเท่าที่จับคู่ได้ ไม่เดาว่าตัวไหนคู่กับตัวไหน */
      samples: (Array.isArray(obj.samples) && pickIdx && pickIdx.length)
        ? obj.samples.slice(0, pickIdx.length).map((s, k) => ({
            sentiment: pickLabels[k],
            /* ⚠️ trim ก่อนเสมอ — "  " เป็นสตริงที่ truthy ผ่าน filter ไปได้
               แล้วจะโชว์เป็นกล่องตัวอย่างว่างเปล่าบนจอ (บั๊กตระกูลเดียวกับสติกเกอร์) */
            text: String(typeof s === "string" ? s : (s && s.text) || "").trim().slice(0, 300),
            src: pickIdx[k],
          })).filter(x => x.text)
        : [],
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
