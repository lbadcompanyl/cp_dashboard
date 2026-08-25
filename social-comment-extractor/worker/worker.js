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

export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || "*";
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), origin);

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return cors(json({ ok: true, service: "comment-sentiment", model: env.CLAUDE_MODEL || DEFAULT_MODEL }), origin);
    }
    if (request.method === "GET" && url.pathname === "/credits") {
      return cors(json(await creditBalance(env)), origin);
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
