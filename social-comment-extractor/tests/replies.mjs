/**
 * replies.mjs — การจัดการ reply
 *
 * ⚠️ ตั้งแต่ 29 ส.ค. 2026 **ค่าตั้งต้นคือไม่เอา reply** (INCLUDE_REPLIES = false)
 *    เจ้าของสั่ง: คน reply สื่อถึงคอมเมนต์ ไม่ได้สื่อถึงโพส เอามารวมเป็น % แล้วตัวเลขแปลไม่ได้
 *    ข้อ [6] คุมไว้ว่า **ทุกแพลตฟอร์มต้องนับเหมือนกัน** — ของเดิม YouTube รวม reply
 *    แต่ Facebook ไม่รวม แล้วเอา % มาเทียบข้ามแพลตฟอร์มไม่ได้โดยไม่มีอะไรบอก
 *
 * ตรรกะแตก reply ยังอยู่ครบและยังเทสต์อยู่ (ข้อ 1-5) เพราะวันหนึ่งอาจเอากลับมาใช้
 * แบบ "แยกเป็นตัวเลขคนละก้อน" — แต่ต้องสั่งเปิดเองเท่านั้น ไม่ใช่ค่าตั้งต้น
 */
import { nestedReplies, scComment, fetchYouTube, INCLUDE_REPLIES } from "./w.mjs";
let fail = 0; const ok = (c, m) => { console.log((c ? "✅" : "❌") + " " + m); if (!c) fail++; };

// [1] คีย์ replies เป็น "จำนวน" — ห้ามเข้าใจผิดว่าเป็นรายการ
ok(nestedReplies({ replies: 7 }).length === 0, "replies เป็นตัวเลข → ไม่ใช่รายการ reply");
ok(scComment({ text: "ก", replies: 7, reply_count: 7 }, 0).replies === 7, "จำนวน reply ยังอ่านได้ถูก");

// [2] คีย์ replies เป็น "รายการ" — ต้องแตกออกมาได้ และจำนวนต้องไม่กลายเป็น NaN
const withList = { text: "หลัก", replies: [{ text: "ตอบ1" }, { text: "ตอบ2" }] };
ok(nestedReplies(withList).length === 2, "replies เป็น array → แตกออกมาได้ 2 อัน");
const c = scComment(withList, 0);
ok(c.replies === 0 && !Number.isNaN(c.replies), "array ไม่ทำให้จำนวนกลายเป็น NaN (บั๊กที่เคยจะเกิด)");

// [3] ชื่อคีย์อื่นที่ต้นทางอาจใช้
ok(nestedReplies({ sub_comments: [{ text: "ก" }] }).length === 1, "รองรับคีย์ sub_comments");
ok(nestedReplies({ children: [{ text: "ก" }] }).length === 1, "รองรับคีย์ children");
ok(nestedReplies({ replies: ["ไม่ใช่ object"] }).length === 0, "array ของสตริง ไม่นับเป็น reply");
ok(nestedReplies({}).length === 0 && nestedReplies(null).length === 0, "ไม่มี reply / ค่าว่าง → ไม่พัง");

// [4] YouTube: **สั่งเปิดเอง** ต้องขอ part=snippet,replies และแตก reply ออกมาเป็นคอมเมนต์เต็มใบ
const askedUrls = [];   // เก็บทุก URL — ตัวแปรเดี่ยวถูกคำขอ meta ทับทีหลัง
globalThis.fetch = async (u) => {
  const askedUrl = String(u);
  askedUrls.push(askedUrl);
  if (askedUrl.includes("commentThreads")) return { ok: true, json: async () => ({ items: [{
    snippet: { topLevelComment: { snippet: { textDisplay: "คอมเมนต์บนสุด", likeCount: 3, publishedAt: "t" } }, totalReplyCount: 2 },
    replies: { comments: [
      { snippet: { textDisplay: "reply หนึ่ง", likeCount: 1, publishedAt: "t" } },
      { snippet: { textDisplay: "reply สอง", likeCount: 0, publishedAt: "t" } } ] },
  }] }) };
  return { ok: true, json: async () => ({ items: [] }) };
};
const got = await fetchYouTube("https://www.youtube.com/watch?v=abc12345678", 50, { YOUTUBE_API_KEY: "k" }, true);
const threads = got.comments;
ok(threads.length === 3, `ได้ 3 ใบ (บนสุด 1 + reply 2) — ได้จริง ${threads.length}`);
ok(threads[1].is_reply === 1 && threads[2].is_reply === 1, "reply ติดธง is_reply ไว้");
ok(threads[0].is_reply === 0, "คอมเมนต์บนสุดไม่ติดธง");
ok(askedUrls.some(u => /commentThreads/.test(u) && /part=snippet%2Creplies/.test(u)), "ขอ part=snippet,replies ไปที่ YouTube จริง (ไม่งั้นไม่มี reply ติดมา)");

// [5] ปิด reply ได้
const off = await fetchYouTube("https://www.youtube.com/watch?v=abc12345678", 50, { YOUTUBE_API_KEY: "k" }, false);
ok(off.comments.length === 1, "สั่งปิด reply → ได้เฉพาะคอมเมนต์บนสุด");

/* [6] ⚠️ ข้อสำคัญที่สุดของไฟล์นี้ — ค่าตั้งต้นต้องเป็น "ไม่เอา reply"
   ไม่งั้นแต่ละแพลตฟอร์มนับไม่เหมือนกัน แล้วเอา % มาเทียบข้ามแพลตฟอร์มไม่ได้เงียบๆ */
ok(INCLUDE_REPLIES === false, "ค่าตั้งต้นคือไม่เอา reply (คน reply สื่อถึงคอมเมนต์ ไม่ใช่โพส)");
const dflt = await fetchYouTube("https://www.youtube.com/watch?v=abc12345678", 50, { YOUTUBE_API_KEY: "k" });
ok(dflt.comments.length === 1,
   `ไม่ได้สั่งอะไร → YouTube ต้องได้เฉพาะคอมเมนต์บนสุด — ได้จริง ${dflt.comments.length} ใบ`);
ok(dflt.comments.every(c => !c.is_reply), "ไม่มีใบไหนเป็น reply ปนมา");

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
