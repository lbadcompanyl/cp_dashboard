/* 👥 GET /api/followers — ยอดผู้ติดตามของบัญชีโซเชียล (YouTube · TikTok · Instagram · X · Facebook)
 * ==================================================================================
 * ใช้ยังไง
 *   /api/followers?key=<กุญแจ>                          → ทุกบัญชีที่เปิดไว้ใน followers.config.js
 *   /api/followers?key=…&accounts=yt-cpfnews,tt-cpf     → เฉพาะบัญชีที่เลือก
 *   /api/followers?key=…&platform=tiktok&handle=xxx     → บัญชีนอกลิสต์ (ใช้ส่องคู่แข่งได้)
 *   /api/followers?key=…&provider=apify                 → บังคับใช้เจ้าไหน (ค่าตั้งต้น: ลอง 2 เจ้า)
 *   /api/followers?key=…&refresh=1                      → ไม่เอาของใน cache
 *
 * 🔑 **ต้องมีกุญแจเสมอ ไม่มีกุญแจ = ไม่ทำงาน** (`FOLLOWERS_TOKEN` ใน Cloudflare Secret)
 *    `/api/*` เอาเข้า Cloudflare Access ไม่ได้ (แดชบอร์ดสาธารณะใช้ร่วมกันอยู่)
 *    ปล่อยเปิดโล่ง = ใครก็ยิงได้ = **เผาเครดิต ScrapeCreators/Apify ที่จ่ายเงิน**
 *    ซึ่งเป็นเรื่องเดียวกับที่ `GET /debugmeta` เคยทำมาแล้ว (ดู CLAUDE.md กฎเหล็กข้อ 2)
 *    ยังไม่ตั้ง `FOLLOWERS_TOKEN` → ตอบ 503 ไม่ยิงต้นทางเลยสักครั้ง (fail closed)
 *
 * 💧 งบ KV: อ่าน 0-1 ครั้ง · เขียน 0-1 ครั้งต่อ request และ **เฉพาะตอน cache หมดอายุ**
 *    ประวัติเก็บใน blob เดียว (`followers:history`) วันละ 1 จุดต่อบัญชี ไม่ใช่ key ต่อรายการ
 *    cache 6 ชม. → build ได้สูงสุด 4 ครั้ง/วัน → เขียน KV ไม่เกิน 4 ครั้ง/วัน
 */

import accountsConfig from "../../../followers.config.js";
import { startLog, finishLog, resetLog } from "../_lib/syslog.js";
import {
  fetchFollowers, scrapeCreatorsCredits,
  normPlatform, normHandle, profileUrl, PLATFORMS,
} from "./_lib/providers.js";

const CACHE_VER = "1";              // ⚠️ แก้โครงข้อมูลที่ตอบกลับเมื่อไหร่ ต้องบวกเลขนี้ด้วย
const EDGE_TTL = 6 * 3600;          // 6 ชม. — ยอดผู้ติดตามขยับเป็นวัน ไม่ต้องสดกว่านี้
const MAX_ACCOUNTS = 12;            // กันคนสั่งยิงทีละร้อยบัญชี (1 บัญชี = 1 เครดิต)
const HIST_KEY = "followers:history";
const HIST_DAYS = 400;              // เก็บย้อนหลังต่อบัญชี (jsonpoint ละ ~20 byte)

export async function onRequest(context) {
  const { request, env = {} } = context;
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  // ── กุญแจ ───────────────────────────────────────────────────────────────
  const gate = checkToken(request, url, env);
  if (gate) return cors(json(gate.body, gate.status));

  // ── อ่านพารามิเตอร์ ─────────────────────────────────────────────────────
  let targets, err;
  try { targets = pickTargets(url); } catch (e) { err = String(e.message || e); }
  if (err) return cors(json({ error: err }, 400));
  if (!targets.length) {
    return cors(json({
      error: "ยังไม่มีบัญชีให้ดึง — เปิดบัญชีใน followers.config.js (ลบ off: true) " +
             "หรือส่ง ?platform=…&handle=… มาโดยตรง",
      platforms: PLATFORMS,
    }, 400));
  }

  const provider = (url.searchParams.get("provider") || "auto").toLowerCase();
  const refresh = url.searchParams.has("refresh");

  // ── edge cache ─────────────────────────────────────────────────────────
  // ⚠️ **ห้ามเอากุญแจใส่ใน cache key** — ของที่ตอบเหมือนกันจะกลายเป็นคนละก้อนต่อกุญแจ
  const sig = targets.map(t => `${t.platform}:${t.handle}`).sort().join(",");
  const cache = caches.default;
  const ckey = new Request(
    `${url.origin}/api/followers?_v=${CACHE_VER}&p=${provider}&t=${encodeURIComponent(sig)}`,
    { method: "GET" }
  );
  if (!refresh) {
    const hit = await cache.match(ckey);
    // ⚠️ cache hit ต้อง return ก่อนบรรทัด startLog เสมอ ไม่งั้นทุกคำขอกินโควตา KV
    if (hit) return cors(browserCopy(hit, "hit"));
  }

  resetLog();
  const L = startLog("followers");
  L.cache = refresh ? "rebuild" : "miss";

  // ── ยิงจริง ────────────────────────────────────────────────────────────
  const results = await Promise.all(targets.map(async (t) => {
    const r = await fetchFollowers(t.platform, t.handle, env, { provider });
    if (!r.ok) L.fail(`${t.platform}:${t.handle}`, r.error);
    return {
      id: t.id, platform: t.platform, handle: t.handle,
      label: t.label || `${t.handle} (${t.platform})`,
      url: profileUrl(t.platform, t.handle),
      followers: r.ok ? r.followers : null,
      // ⚠️ facebook เพจเก่าบางหน้ามีแต่ยอดไลก์ — ต้องบอกว่าเป็นคนละตัวกับผู้ติดตาม
      metric: r.ok ? (r.isLikes ? "likes" : "followers") : null,
      provider: r.ok ? r.provider : null,
      field: r.ok ? r.field : null,
      error: r.ok ? null : r.error,
    };
  }));

  const okCount = results.filter(a => a.followers != null).length;
  L.count("accounts", results.length);
  L.count("ok", okCount);
  if (!okCount) L.warn("ดึงไม่สำเร็จสักบัญชี");
  else if (okCount < results.length) L.warn(`ดึงได้ ${okCount} จาก ${results.length} บัญชี`);

  // ── ประวัติ + ส่วนต่าง (ไม่มี KV ก็ยังใช้ได้ แค่ไม่มีส่วนต่าง) ───────────
  let history = null;
  try { history = await applyHistory(env, results, L); }
  catch (e) { L.warn("ประวัติใช้ไม่ได้: " + String(e.message || e)); }

  const out = {
    at: new Date().toISOString(),
    day: bkkDay(),
    accounts: results,
    credits: { scrapecreators: await scrapeCreatorsCredits(env) },
    history: history ? { days: HIST_DAYS, stored: true } : { stored: false },
    // 🚫 **ไม่คืน response ดิบของต้นทางเด็ดขาด** — บทเรียนจาก /debugmeta
    //    ที่คืนได้มีแค่ "เอาตัวเลขมาจากฟิลด์ชื่ออะไร" ซึ่งพอสำหรับไล่ปัญหาแล้ว
  };

  await finishLog(env, L, { err: okCount ? "" : "ดึงยอดผู้ติดตามไม่สำเร็จทุกบัญชี" });

  const res = json(out);
  res.headers.set("cache-control", `public, max-age=300, s-maxage=${EDGE_TTL}`);
  context.waitUntil(cache.put(ckey, res.clone()));
  return cors(browserCopy(res, refresh ? "rebuild" : "miss"));
}

/* ---------- กุญแจ ---------- */
function checkToken(request, url, env) {
  const want = env.FOLLOWERS_TOKEN;
  if (!want) {
    return { status: 503, body: {
      error: "ยังไม่ได้เปิดใช้งาน — ต้องตั้ง FOLLOWERS_TOKEN ใน Cloudflare ก่อน (Settings → Variables and Secrets → Secret)",
      hint: "ตั้งทั้ง Production และ Preview แล้วกด Retry deployment",
    } };
  }
  const auth = request.headers.get("authorization") || "";
  const got = auth.replace(/^Bearer\s+/i, "").trim() || url.searchParams.get("key") || "";
  if (!safeEqual(got, want)) return { status: 401, body: { error: "กุญแจไม่ถูกต้อง" } };
  return null;
}

function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- เลือกว่าจะดึงบัญชีไหน ---------- */
export function pickTargets(url, config = accountsConfig) {
  const platform = normPlatform(url.searchParams.get("platform") || "");
  const handleRaw = url.searchParams.get("handle") || "";

  // 1) ระบุมาตรงๆ — ไม่ต้องอยู่ในลิสต์ (ผู้ถามมีกุญแจแล้ว)
  if (handleRaw) {
    if (!platform) throw new Error("ต้องระบุ platform ด้วย (" + PLATFORMS.join(" · ") + ")");
    const handle = normHandle(handleRaw);
    if (!handle) throw new Error("handle ไม่ถูกต้อง");
    return [{ id: `${platform}:${handle}`, platform, handle, label: "" }];
  }
  if (platform && !handleRaw) {
    // ระบุแค่แพลตฟอร์ม = เอาทุกบัญชีของแพลตฟอร์มนั้นในลิสต์
    return usable(config).filter(a => a.platform === platform).slice(0, MAX_ACCOUNTS);
  }

  // 2) เลือกจากลิสต์ด้วย id
  const want = (url.searchParams.get("accounts") || "").split(",").map(s => s.trim()).filter(Boolean);
  const all = usable(config);
  if (!want.length) return all.slice(0, MAX_ACCOUNTS);

  const byId = new Map(all.map(a => [a.id, a]));
  const picked = [];
  for (const id of want) {
    const a = byId.get(id);
    if (!a) throw new Error(`ไม่รู้จักบัญชี "${id}" — มีให้เลือก: ${[...byId.keys()].join(", ") || "(ยังไม่มี)"}`);
    picked.push(a);
  }
  return picked.slice(0, MAX_ACCOUNTS);
}

function usable(config) {
  return (Array.isArray(config) ? config : [])
    .filter(a => a && !a.off && normPlatform(a.platform) && normHandle(a.handle))
    .map(a => ({
      id: a.id || `${normPlatform(a.platform)}:${normHandle(a.handle)}`,
      platform: normPlatform(a.platform),
      handle: normHandle(a.handle),
      label: a.label || "",
    }));
}

/* ---------- ประวัติรายวัน (blob เดียว เขียนวันละครั้ง) ---------- */
export async function applyHistory(env, results, L) {
  const kv = env && env.FLAGS_KV;
  if (!kv) return null;

  const raw = await kv.get(HIST_KEY);                      // KV read #1 (ครั้งเดียว)
  const hist = raw ? safeParse(raw) : {};
  const today = bkkDay();
  let changed = false;

  for (const a of results) {
    const series = Array.isArray(hist[a.id]) ? hist[a.id] : [];
    // จุดก่อนหน้า = จุดล่าสุดที่ "ไม่ใช่วันนี้" — ไม่งั้นเทียบกับตัวเองได้ 0 ตลอด
    const prev = [...series].reverse().find(p => p && p.d && p.d !== today) || null;
    if (prev) {
      a.prev = { day: prev.d, followers: prev.n };
      a.delta = a.followers != null ? a.followers - prev.n : null;
      a.deltaDays = daysBetween(prev.d, today);
    } else {
      a.prev = null; a.delta = null; a.deltaDays = null;
    }

    if (a.followers == null) continue;
    const last = series[series.length - 1];
    if (last && last.d === today) {
      if (last.n !== a.followers) { last.n = a.followers; changed = true; }
    } else {
      series.push({ d: today, n: a.followers });
      changed = true;
    }
    hist[a.id] = series.slice(-HIST_DAYS);
  }

  if (changed) {
    try {
      await kv.put(HIST_KEY, JSON.stringify(hist));        // KV write #1 (ครั้งเดียว)
      if (L) L.kvWrites = (L.kvWrites || 0) + 1;
    } catch (e) {
      L && L.warn && L.warn("เขียนประวัติไม่สำเร็จ: " + String(e.message || e));
    }
  }
  return hist;
}

export async function readHistory(env) {
  const kv = env && env.FLAGS_KV;
  if (!kv) return {};
  const raw = await kv.get(HIST_KEY);
  return raw ? safeParse(raw) : {};
}

function safeParse(s) { try { const v = JSON.parse(s); return v && typeof v === "object" ? v : {}; } catch { return {}; } }

/* ---------- วันที่แบบไทย ----------
 * ⚠️ Workers รันด้วย UTC — ใช้ toISOString() ตรงๆ ช่วงหัวค่ำจะได้วันของเมื่อวาน
 *    แล้วประวัติจะบันทึกผิดวันทุกเย็น (บทเรียนเดียวกับ todayTH() ของ /archives/)
 */
export function bkkDay(d = new Date()) {
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  const t = (s) => Date.parse(s + "T00:00:00Z");
  const n = Math.round((t(b) - t(a)) / 864e5);
  return Number.isFinite(n) ? n : null;
}

/* ---------- ตอบกลับ ---------- */
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "content-type": "application/json; charset=utf-8" },
  });
}
function browserCopy(res, cacheState) {
  const r = new Response(res.body, res);
  r.headers.set("x-followers-cache", cacheState);
  return r;
}
function cors(res) {
  res.headers.set("access-control-allow-origin", "*");
  res.headers.set("access-control-allow-headers", "authorization, content-type");
  res.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  return res;
}
