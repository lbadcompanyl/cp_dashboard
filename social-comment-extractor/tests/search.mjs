/**
 * search.mjs — ตัวหาโพสด้วยคำ (`/search`)
 *
 * เจ้าของสั่ง 18 ก.ย. 2026: "หา content ที่มี engagement ดี และเป็นข่าวด้านดี
 * เกี่ยวกับปลาหมอคางดำ" → จำกัดขอบเขตต่อว่า "ไม่เอาคอมเมน เอาแค่โพส กับ link"
 *
 * 💰 **[3] คือข้อสำคัญที่สุด — ด่านกันเครดิตรั่ว**
 *    ทุกคำขอที่ยิงออกไปคือเงินจริง ถ้าเพดานพัง เครดิตหมดโดยไม่มีอะไรเตือน
 *    (เคยมีบทเรียนแล้วกับ /debugmeta ที่หลุดขึ้น production แล้วเผาเครดิต)
 *
 * 🔴 [5] "ไม่รู้" ห้ามกลายเป็น 0 — ยอดที่ขอไม่สำเร็จต้องเป็น null และห้ามถูกตัดทิ้งเงียบ
 */
import { searchRoute, engOf, SEARCH_MAX_PAGES, SEARCH_MAX_ENRICH } from "./w.mjs";

let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

/* ── ปลอมต้นทาง ScrapeCreators แล้วนับว่าถูกยิงกี่ครั้ง ───────────── */
let calls = [];
let enriched = [];   // ลิงก์ที่ "จ่ายเครดิตไปขอยอด" จริง — ไว้พิสูจน์ว่าไม่ได้จ่ายให้หน้าเพจ
const DAY = 86400000;
const secs = (msAgo) => Math.floor((Date.now() - msAgo) / 1000);

function ttItem(id, likes, comments, shares, views, ageDays, desc) {
  return { aweme_info: { aweme_id: String(id), desc, create_time: secs(ageDays * DAY),
    author: { unique_id: "u" + id, nickname: "คุณ" + id },
    share_url: `https://www.tiktok.com/@u${id}/video/${id}`,
    statistics: { digg_count: likes, comment_count: comments, share_count: shares, play_count: views } } };
}

globalThis.fetch = async (u) => {
  const url = new URL(String(u));
  calls.push(url.pathname);
  if (url.pathname === "/v1/facebook/post") enriched.push(url.searchParams.get("url"));
  const send = (o) => ({ ok: true, json: async () => ({ success: true, credits_charged: 1, ...o }) });

  if (url.pathname === "/v1/tiktok/search/keyword") {
    /* 🔑 ต้นทางปลอมนี้ **ไม่มีวันหมด** โดยตั้งใจ — ถ้าให้มันหมดเอง เทสต์เพดาน [3]
       จะผ่านทั้งที่มีและไม่มีเพดาน (เจอตอนลองถอดเพดานออกแล้วเทสต์ยังเขียว) */
    const cur = Number(url.searchParams.get("cursor") || 0);
    return send({ cursor: cur + 10, has_more: true, search_item_list: [
      ttItem(100 + cur, 5000, 300, 200, 900000, 10, "ปลาหมอคางดำแปรรูปขายได้จริง"),
      ttItem(200 + cur, 50, 3, 1, 4000, 10, "คลิปยอดน้อย"),
      ttItem(300 + cur, 9000, 500, 400, 20000, 900, "คลิปเก่ามาก เกิน 1 ปี"),
    ] });
  }
  if (url.pathname === "/v1/google/search") {
    const page = Number(url.searchParams.get("page") || 1);
    /* คืนลิงก์โพสเยอะกว่าเพดาน enrich โดยตั้งใจ — ไม่งั้นเทสต์ [3b] วัดอะไรไม่ได้ */
    const many = Array.from({ length: 50 }, (_, i) =>
      ({ url: `https://www.facebook.com/p${page}/posts/${page}${i}`, title: "ข่าวปลาหมอคางดำ", description: "ก" }));
    return send({ results: [
      { url: "https://www.facebook.com/page1/posts/111", title: "ข่าวปลาหมอคางดำ", description: "ก" },
      { url: "https://www.facebook.com/reel/222", title: "รีลปลาหมอคางดำ", description: "ข" },
      /* 🚫 หน้าเพจเปล่าๆ — ห้ามเอาไปจ่ายเครดิตขอยอด */
      { url: "https://www.facebook.com/somepage", title: "เพจอะไรสักอย่าง", description: "ค" },
      { url: "https://www.facebook.com/page3/posts/333", title: "โพสที่ขอยอดไม่ได้", description: "ง" },
    ].concat(page === 1 ? many : []) });
  }
  if (url.pathname === "/v1/facebook/post") {
    const link = url.searchParams.get("url");
    if (link.includes("333")) return { ok: false, json: async () => ({ error: "not found" }) };
    return send({ like_count: 2000, comment_count: 150, share_count: 300, view_count: 88000,
      description: "โพสเฟซเรื่องปลาหมอคางดำ", creation_time: secs(20 * DAY),
      author: { name: "เพจทดสอบ" } });
  }
  throw new Error("เส้นทางที่ไม่ได้เตรียมไว้: " + url.pathname);
};

const ENV = { SCRAPECREATORS_API_KEY: "test-key" };
const run = async (qs) => {
  calls = []; enriched = [];
  const r = await searchRoute(new URL("https://x/search?" + qs), ENV);
  return await r.json();
};

/* ── [1] ต้องมีคำค้น และต้องมีกุญแจ ───────────────────────────────── */
ok("[1] ไม่ใส่คำค้น → บอกเป็นภาษาคน", (await (await searchRoute(new URL("https://x/search"), ENV)).json()).error?.includes("คำค้น"));
ok("[1b] ไม่มีกุญแจ → บอกว่าต้องตั้งที่ Cloudflare",
   (await (await searchRoute(new URL("https://x/search?q=ก"), {})).json()).error?.includes("SCRAPECREATORS"));
ok("[1c] 🚫 ไม่มีกุญแจต้องไม่ยิงออกไปเลยสักครั้ง", calls.length === 0, `ยิงไป ${calls.length} ครั้ง`);

/* ── [2] ยอดมีส่วนร่วม = ไลก์+คอมเมนต์+แชร์ · ห้ามรวมวิว ───────────── */
ok("[2] 🚫 ยอดวิวต้องไม่ถูกนับรวม",
   engOf({ likes: 10, comments: 5, shares: 2, views: 999999 }) === 17, String(engOf({ likes:10, comments:5, shares:2, views:999999 })));

/* ── [3] 💰 ด่านกันเครดิตรั่ว — ข้อสำคัญที่สุด ─────────────────────── */
let d = await run("q=ปลาหมอคางดำ&platform=tiktok&pages=999");
const ttCalls = calls.filter(c => c.includes("/tiktok/search")).length;
ok("[3] 💰 ขอ 999 หน้า ต้องหยุดที่เพดานพอดี", ttCalls === SEARCH_MAX_PAGES, `ยิงจริง ${ttCalls} ครั้ง (เพดาน ${SEARCH_MAX_PAGES})`);

d = await run("q=ก&platform=facebook&enrich=999");
const fbCalls = calls.filter(c => c === "/v1/facebook/post").length;
ok("[3b] 💰 ขอยอด FB 999 ใบ ต้องหยุดที่เพดานพอดี", fbCalls === SEARCH_MAX_ENRICH, `ยิงจริง ${fbCalls} ครั้ง (เพดาน ${SEARCH_MAX_ENRICH})`);
ok("[3c] 💰 บอกบิลกลับมาทุกครั้ง", typeof d.credits_used === "number" && d.credits_used > 0, `${d.credits_used} เครดิต`);
ok("[3d] 🚫 ลิงก์ที่เป็นหน้าเพจ (ไม่ใช่โพส) ต้องไม่ถูกเอาไปจ่ายเครดิต",
   !enriched.some(u => u.endsWith("/somepage")) && !d.posts.some(p => p.url.endsWith("/somepage")),
   `จ่ายขอยอดไป ${enriched.length} ใบ ไม่มีหน้าเพจปน`);

/* ── [4] กรองวันที่ + ยอดขั้นต่ำ ──────────────────────────────────── */
d = await run("q=ก&platform=tiktok&days=365&min_eng=1000");
ok("[4] ตัดโพสเก่ากว่าช่วงที่ขอ", !d.posts.some(p => p.text.includes("เก่ามาก")), JSON.stringify(d.note));
ok("[4b] ตัดโพสที่ยอดต่ำกว่าเกณฑ์", !d.posts.some(p => p.text.includes("ยอดน้อย")));
ok("[4c] ใบที่เหลือยอดถึงเกณฑ์จริง", d.posts.length > 0 && d.posts.every(p => p.engagement >= 1000));
ok("[4d] เรียงจากยอดมากไปน้อย",
   d.posts.every((p, i) => i === 0 || d.posts[i - 1].engagement >= p.engagement));
ok("[4e] บอกด้วยว่าตัดอะไรออกไปบ้าง ไม่ใช่ตัดเงียบ", (d.note || []).length > 0, JSON.stringify(d.note));

/* ── [5] 🔴 "ไม่รู้" ห้ามกลายเป็น 0 และห้ามหายเงียบ ────────────────── */
d = await run("q=ก&platform=facebook&min_eng=1000");
const bad = d.posts.find(p => p.url.includes("333"));
ok("[5] 🔴 ใบที่ขอยอดไม่สำเร็จ ยังอยู่ในผล ไม่หายเงียบ", !!bad);
ok("[5b] 🔴 ยอดเป็น null ไม่ใช่ 0", bad && bad.likes === null && bad.engagement === null);
ok("[5c] และบอกเหตุผลติดมาด้วย", bad && !!bad.error, bad?.error);
ok("[5d] 🚫 ใบที่ยอดไม่รู้ ต้องไม่ถูกดันขึ้นบนสุด",
   d.posts[0] && d.posts[0].engagement != null, String(d.posts[0]?.engagement));

/* ── [6] ลิงก์ต้องเปิดได้จริง + ไม่มีใบซ้ำ ─────────────────────────── */
d = await run("q=ก&platform=both&min_eng=0&days=99999");
ok("[6] ทุกใบมีลิงก์ที่เปิดได้", d.posts.every(p => /^https:\/\//.test(p.url)));
ok("[6b] ไม่มีลิงก์ซ้ำ (ต้นทางเตือนเองว่าอาจส่งซ้ำมา)",
   new Set(d.posts.map(p => p.url)).size === d.posts.length);
ok("[6c] ได้ทั้ง 2 แพลตฟอร์มเมื่อขอ both",
   d.posts.some(p => p.platform === "tiktok") && d.posts.some(p => p.platform === "facebook"));

/* ── [7] แพลตฟอร์มหนึ่งล่ม ต้องไม่ลากอีกอันตายไปด้วย ─────────────── */
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => {
  if (String(u).includes("/google/search")) throw new Error("ต้นทางล่ม");
  return realFetch(u);
};
d = await run("q=ก&platform=both&min_eng=0&days=99999");
ok("[7] Google ล่ม → ฝั่ง TikTok ยังได้ผลมา", d.posts.some(p => p.platform === "tiktok"));
ok("[7b] และบอกให้รู้ว่าฝั่งไหนล่ม ไม่ใช่เงียบ",
   (d.errors || []).some(e => e.startsWith("facebook")), JSON.stringify(d.errors));
globalThis.fetch = realFetch;

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
