/**
 * feedback.mjs — กองรอตรวจ (ชั้น ② ของระบบเรียนรู้)
 * วัดว่า: ทำความสะอาดข้อมูลถูก · เขียน KV ครั้งเดียว · ไม่มี KV ต้องบอกตรงๆ ·
 *         อ่านกองต้องมีกุญแจ · ส่งซ้ำไม่ทำให้กองบวม · เกินเพดานตัดตัวเก่า
 *
 * ⚠️ ข้อสำคัญที่สุดคือ [6] — "ไม่มี KV ต้องตอบ ok:false"
 *    ถ้าตอบ ok เฉยๆ หน้าเว็บจะขึ้นว่าส่งสำเร็จทั้งที่ไม่มีอะไรถูกเก็บ
 *    เป็นกับดักเดียวกับที่ CLAUDE.md เตือนไว้: "ไม่รู้" ห้ามกลืนเป็นค่าใดค่าหนึ่ง
 */
import { feedbackRoute, fbClean, FB_MAX, FB_MAX_PER_REQ, FB_MAX_TEXT } from "./w.mjs";

let fail = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) fail++;
};

/** KV ปลอม — นับจำนวนครั้งที่อ่าน/เขียน เพื่อคุมกฎ KV ของโปรเจกต์ */
function fakeKV(initial = []) {
  const store = { [`sentiment:feedback`]: JSON.stringify(initial) };
  const n = { get: 0, put: 0 };
  return {
    n,
    get: async (k) => { n.get++; return store[k] ?? null; },
    put: async (k, v) => { n.put++; store[k] = v; },
    dump: () => JSON.parse(store["sentiment:feedback"]),
  };
}
const post = (items) => new Request("https://x/feedback", {
  method: "POST", body: JSON.stringify({ items }),
});
const call = async (req, env, qs = "") =>
  feedbackRoute(req, new URL("https://x/feedback" + qs), env);
const body = async (r) => JSON.parse(await r.text());

const good = { text: "ดูยังไม่จบก็ตำหนิแล้ว", was: "negative", now: "positive", target: "overall" };

/* ── [1] ทำความสะอาดข้อมูล ───────────────────────────────── */
ok("[1a] รายการปกติผ่าน", !!fbClean(good));
ok("[1b] ไม่มีข้อความ = ทิ้ง", fbClean({ ...good, text: "  " }) === null);
ok("[1c] ป้ายที่ไม่รู้จัก = ทิ้ง", fbClean({ ...good, now: "หมูกรอบ" }) === null);
ok("[1d] แก้แล้วได้ป้ายเดิม = ทิ้ง", fbClean({ ...good, was: "positive", now: "positive" }) === null);
ok("[1e] ข้อความยาวถูกตัด", fbClean({ ...good, text: "ก".repeat(9999) }).text.length === FB_MAX_TEXT);
ok("[1f] target แปลกๆ ตกเป็น overall", fbClean({ ...good, target: "???" }).target === "overall");

/* 🔒 ห้ามหลุดชื่อ/ลิงก์เข้ากอง แม้หน้าเว็บจะเผลอส่งมา */
const dirty = fbClean({ ...good, name: "สมชาย ใจดี", url: "https://facebook.com/reel/123", user_id: "u1" });
ok("[2] ไม่เก็บชื่อ/ลิงก์ แม้ถูกส่งมาด้วย",
   !("name" in dirty) && !("url" in dirty) && !("user_id" in dirty),
   "คีย์ที่เก็บ: " + Object.keys(dirty).join(","));

/* ── [3] เขียน KV ครั้งเดียวต่อคำขอ ──────────────────────── */
{
  const kv = fakeKV();
  const r = await body(await call(post([good, { ...good, text: "อีกใบ", now: "neutral" }]), { FEEDBACK_KV: kv }));
  ok("[3] เขียน KV ครั้งเดียวต่อคำขอ", kv.n.put === 1 && kv.n.get === 1,
     `อ่าน ${kv.n.get} · เขียน ${kv.n.put} · เก็บได้ ${r.added} ใบ`);
}

/* ── [4] ส่งซ้ำไม่ทำให้กองบวม และไม่เขียน KV ฟรี ─────────── */
{
  const kv = fakeKV();
  await call(post([good]), { FEEDBACK_KV: kv });
  const putAfterFirst = kv.n.put;
  const r = await body(await call(post([good]), { FEEDBACK_KV: kv }));
  ok("[4a] ส่งซ้ำไม่เพิ่มรายการ", kv.dump().length === 1, `ในกอง ${kv.dump().length} ใบ · added=${r.added}`);
  ok("[4b] ไม่มีของใหม่ = ไม่เขียน KV เลย", kv.n.put === putAfterFirst, `เขียนไป ${kv.n.put} ครั้ง`);
}

/* ── [5] เกินเพดานตัดตัวเก่าสุดทิ้ง ─────────────────────── */
{
  const old = Array.from({ length: FB_MAX }, (_, i) => ({ ...good, text: "เก่า" + i }));
  const kv = fakeKV(old);
  await call(post([{ ...good, text: "ใบใหม่ล่าสุด" }]), { FEEDBACK_KV: kv });
  const q = kv.dump();
  ok("[5] เกินเพดานตัดตัวเก่าสุด",
     q.length === FB_MAX && q[q.length - 1].text === "ใบใหม่ล่าสุด" && q[0].text === "เก่า1",
     `กองมี ${q.length} · ตัวแรก "${q[0].text}" · ตัวท้าย "${q[q.length - 1].text}"`);
}

/* ── [6] ไม่มี KV ต้องบอกตรงๆ ห้ามตอบว่าสำเร็จ ⚠️ สำคัญสุด ── */
{
  const r = await call(post([good]), {});
  const b = await body(r);
  ok("[6] ไม่มี KV → ok:false + บอกเหตุผล", b.ok === false && b.stored === false && b.reason === "no_kv",
     JSON.stringify(b));
}

/* ── [7] อ่านกองต้องมีกุญแจ ─────────────────────────────── */
{
  const kv = fakeKV([good]);
  const get = () => new Request("https://x/feedback");
  const noKey = await body(await call(get(), { FEEDBACK_KV: kv }));
  ok("[7a] ยังไม่ตั้งกุญแจ = ปิด ไม่ใช่เปิดให้ทุกคน", noKey.error === "read_disabled", JSON.stringify(noKey));

  const wrong = await body(await call(get(), { FEEDBACK_KV: kv, FEEDBACK_KEY: "s3cret" }, "?key=มั่ว"));
  ok("[7b] กุญแจผิด = ไม่ให้อ่าน", wrong.error === "bad_key" && !wrong.items);

  const right = await body(await call(get(), { FEEDBACK_KV: kv, FEEDBACK_KEY: "s3cret" }, "?key=s3cret"));
  ok("[7c] กุญแจถูก = อ่านได้", right.ok === true && right.items.length === 1);

  const hdr = new Request("https://x/feedback", { headers: { "x-fb-key": "s3cret" } });
  ok("[7d] ส่งกุญแจทาง header ก็ได้", (await body(await call(hdr, { FEEDBACK_KV: kv, FEEDBACK_KEY: "s3cret" }))).ok === true);
}

/* ── [8] ส่งก้อนใหญ่เกินไปต้องถูกตัด ───────────────────── */
{
  const kv = fakeKV();
  const many = Array.from({ length: FB_MAX_PER_REQ + 40 }, (_, i) => ({ ...good, text: "ใบที่ " + i }));
  const r = await body(await call(post(many), { FEEDBACK_KV: kv }));
  ok("[8] ส่งเกินโควตาต่อครั้งถูกตัด", r.added === FB_MAX_PER_REQ, `ส่ง ${many.length} เก็บ ${r.added}`);
}

/* ── [9] ของเสียล้วน = ไม่เขียน KV เลย ─────────────────── */
{
  const kv = fakeKV();
  const r = await call(post([{ text: "", was: "x", now: "y" }]), { FEEDBACK_KV: kv });
  ok("[9] ส่งแต่ของเสีย → 400 และไม่แตะ KV", r.status === 400 && kv.n.put === 0 && kv.n.get === 0);
}


/* ══════════════════════════════════════════════════════════════
 * 🏷 ป้ายจากต้นทางอื่น (Zocial Eye) — เจ้าของสั่ง 3 ก.ย. 2026
 *    "ต้องให้จำ pattern ที่ social มันจะผิดด้วย"
 *    ห้องใหม่ (news feed จาก Zocial) จะยืม /feedback ตัวนี้ไปใช้
 *    ไม่มีช่องนี้ = รู้แค่ว่า AI ผิด แต่ไม่รู้ว่าต้นทางผิดแบบไหน
 * ══════════════════════════════════════════════════════════════ */
{
  const keep = fbClean({ text: "ขอบคุณที่ดูแลผืนป่าให้พวกเรา", was: "neutral", now: "positive",
                         from: "neutral", src: "zocial", model: "zocial", target: "overall" });
  ok("[10] เก็บป้ายเดิมของ Zocial (from) ไว้ด้วย", keep && keep.from === "neutral", JSON.stringify(keep));
  ok("[10b] เก็บว่าแก้มาจากชั้นไหน (src)", keep && keep.src === "zocial");

  /* 🚫 ห้ามเชื่อค่าดิบ — ค่าที่ไม่รู้จักต้องถูกทิ้ง ไม่ใช่เก็บลง KV ทั้งดุ้น */
  const bad = fbClean({ text: "ทดสอบ", was: "neutral", now: "positive",
                        from: "<script>", src: "อะไรก็ไม่รู้" });
  ok("[10c] 🚫 ค่า from/src ที่ไม่รู้จักถูกตัดทิ้ง ไม่เก็บลง KV",
     bad && bad.from === undefined && bad.src === undefined, JSON.stringify(bad));

  /* ของเดิมที่ไม่ส่ง from/src มา ต้องยังใช้ได้เหมือนเดิม */
  const old = fbClean({ text: "ทดสอบเก่า", was: "negative", now: "positive", target: "cp" });
  ok("[10d] ผู้เรียกรุ่นเก่า (ไม่ส่ง from/src) ต้องไม่พัง",
     old && old.now === "positive" && old.from === undefined);
}

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
