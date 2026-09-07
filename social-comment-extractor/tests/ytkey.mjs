/**
 * ytkey.mjs — 🔑 กุญแจ YouTube รับได้ทั้ง 2 ชื่อ
 *
 * เจ้าของแจ้ง 4 ก.ย. 2026 ตอนย้าย API มาอยู่ที่ Pages:
 *   "มีครบแล้วแต่ Youtube api ใช้คนละชื่อ"
 *
 * ที่ Pages มีกุญแจนี้อยู่แล้วในชื่อ `YT_API_KEY` (ของหน้า /social/)
 * ส่วนโค้ดนี้เขียนไว้ว่า `YOUTUBE_API_KEY` มาแต่แรก
 *
 * ✅ รับทั้ง 2 ชื่อ ดีกว่าให้เจ้าของเอากุญแจมาวางซ้ำอีกตัวแปร
 *    · เป็นกุญแจ Google ตัวเดียวกัน โควตาคิดต่อโปรเจกต์อยู่แล้ว ไม่ได้แยกตามชื่อตัวแปร
 *    · กุญแจวางซ้ำหลายที่ = วันหน้าเปลี่ยนแล้วลืมแก้ให้ครบ
 *
 * 🚫 [3] คือข้อที่ห้ามพัง — ไม่มีสักชื่อ ต้องบอกให้ชัดว่าต้องไปตั้งอะไร
 *    **ห้ามยิงออกไปหา Google ด้วย key=undefined** แล้วไปตายที่ปลายทาง
 *    ข้อความ error จะกลายเป็นเรื่องของ Google ซึ่งพาไปไล่ผิดทาง
 */
import { fetchYouTube } from "./w.mjs";

let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

let sentKeys = [];
globalThis.fetch = async (u) => {
  const url = new URL(String(u));
  sentKeys.push(url.searchParams.get("key"));
  return { ok: true, status: 200, headers: { get: () => null },
           json: async () => ({ items: [], nextPageToken: "" }) };
};
const URL_ = "https://www.youtube.com/watch?v=abcdefghijk";
const run = async (env) => { sentKeys = []; await fetchYouTube(URL_, 10, env); return sentKeys; };

/* ── [1] ชื่อเดิม `YOUTUBE_API_KEY` ต้องยังใช้ได้ ─────────────────── */
let keys = await run({ YOUTUBE_API_KEY: "AAA" });
ok("[1] ชื่อเดิม YOUTUBE_API_KEY ยังใช้ได้", keys.length > 0 && keys.every(k => k === "AAA"),
   JSON.stringify(keys));

/* ── [2] ชื่อที่ Pages มีอยู่แล้ว `YT_API_KEY` ก็ต้องใช้ได้ ────────── */
keys = await run({ YT_API_KEY: "BBB" });
ok("[2] YT_API_KEY (ตัวที่มีอยู่แล้วที่ Pages) ใช้ได้", keys.length > 0 && keys.every(k => k === "BBB"),
   JSON.stringify(keys));

/* ── [2b] มีทั้งคู่ → ยึด YOUTUBE_API_KEY ก่อน (ชื่อของงานนี้เอง) ──── */
keys = await run({ YOUTUBE_API_KEY: "AAA", YT_API_KEY: "BBB" });
ok("[2b] มีทั้งคู่ → ใช้ YOUTUBE_API_KEY ก่อน", keys.every(k => k === "AAA"), JSON.stringify(keys));

/* ── [3] 🚫 ไม่มีสักชื่อ = โยน error บอกชื่อตัวแปรทั้ง 2 ตัว ──────────
   และ **ห้ามยิงออกไปหา Google เลยสักครั้ง** */
sentKeys = [];
let msg = "";
try { await fetchYouTube(URL_, 10, {}); } catch (e) { msg = String(e.message || e); }
ok("[3] 🚫 ไม่มีกุญแจ → โยน error", !!msg, msg);
ok("[3b] ⚠️ บอกชื่อตัวแปรทั้ง 2 ตัว (จะได้ไม่ต้องเดาว่าต้องตั้งอันไหน)",
   /YOUTUBE_API_KEY/.test(msg) && /YT_API_KEY/.test(msg), msg);
ok("[3c] 🚫 และไม่ยิงออกไปหา Google เลย (ไม่ไปตายที่ปลายทาง)", sentKeys.length === 0,
   `ยิงไป ${sentKeys.length} ครั้ง`);

/* ── [4] 🚫 ค่าว่างต้องนับว่า "ไม่มี" ไม่ใช่ยิงด้วยกุญแจว่าง ──────────
   Cloudflare ตั้งตัวแปรทิ้งไว้เป็นค่าว่างได้ ถ้าไม่ดักจะยิงด้วย key= เปล่าๆ */
sentKeys = []; msg = "";
try { await fetchYouTube(URL_, 10, { YOUTUBE_API_KEY: "", YT_API_KEY: "" }); }
catch (e) { msg = String(e.message || e); }
ok("[4] 🚫 ตั้งไว้เป็นค่าว่าง = ถือว่าไม่มี", !!msg && sentKeys.length === 0, msg || `ยิงไป ${sentKeys.length}`);

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านหมด");
process.exit(fail ? 1 : 0);
