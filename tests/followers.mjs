// 👥 ตัวดึงยอดผู้ติดตาม (YouTube · TikTok · Instagram · X · Facebook)
// รันโค้ดจริงจาก functions/api/followers/* — ปลอมแค่ "คำตอบของต้นทาง" กับ KV
//
// ⚠️ ที่วัดคือ **โค้ดเดินทางถูกไหมเมื่อได้คำตอบแบบนั้น** ไม่ใช่ "endpoint ของ ScrapeCreators
//    ชื่อนี้จริงไหม" — sandbox ยิงออกเน็ตไม่ได้ (403) ยืนยันของจริงต้องให้เจ้าของลองเอง
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const P = await import("../functions/api/followers/_lib/providers.js");
const EP = await import("../functions/api/followers/index.js");
const MCP = await import("../functions/api/followers/mcp.js");

// Workers มี caches เป็น global — Node ไม่มี ต้องปลอมให้
let cacheStore = new Map();
globalThis.caches = {
  default: {
    async match(req) { return cacheStore.get(req.url) || null; },
    async put(req, res) { cacheStore.set(req.url, res); },
  },
};

// KV ปลอม — นับจำนวนอ่าน/เขียนไว้ตรวจกฎโควตา
function fakeKV(seed = {}) {
  const store = new Map(Object.entries(seed));
  return { reads: 0, writes: 0,
    async get(k) { this.reads++; return store.get(k) ?? null; },
    async put(k, v) { this.writes++; store.set(k, v); },
    _dump: () => Object.fromEntries(store) };
}

// ── [1] แปลงชื่อแพลตฟอร์ม / handle ──────────────────────────────────────
console.log("\n[1] รับชื่อแพลตฟอร์มและ handle ได้หลายแบบ");
{
  ok("twitter = x", P.normPlatform("twitter") === "x");
  ok("IG = instagram", P.normPlatform("IG") === "instagram");
  ok("ไม่รู้จัก → ว่าง", P.normPlatform("linkedin") === "");
  ok("ตัด @ ออก", P.normHandle("@CPFNews") === "CPFNews");
  ok("แกะ handle จากลิงก์ tiktok", P.normHandle("https://www.tiktok.com/@cpf?lang=th") === "cpf");
  ok("แกะ handle จากลิงก์ youtube /channel/", P.normHandle("https://youtube.com/channel/UC123") === "UC123");
  ok("แกะ handle จากลิงก์ facebook", P.normHandle("https://www.facebook.com/CPFworldwide/") === "CPFworldwide");
  ok("สร้างลิงก์โปรไฟล์ x", P.profileUrl("x", "@abc") === "https://x.com/abc");
}

// ── [2] อ่านตัวเลขที่เขียนมาหลายแบบ ─────────────────────────────────────
console.log("\n[2] อ่านตัวเลขผู้ติดตามที่เขียนมาหลายแบบ");
{
  ok('"1.2M" = 1200000', P.parseCount("1.2M") === 1200000);
  ok('"12.3K" = 12300', P.parseCount("12.3K") === 12300);
  ok('"1,234,567" = 1234567', P.parseCount("1,234,567") === 1234567);
  ok('"1.5 ล้าน" = 1500000', P.parseCount("1.5 ล้าน") === 1500000);
  ok("ตัวเลขล้วนก็ได้", P.parseCount(4321) === 4321);
  ok("อ่านไม่ออก = null ไม่ใช่ 0", P.parseCount("ไม่มีข้อมูล") === null);
}

// ── [3] หาตัวเลขในก้อน JSON ที่ไม่รู้รูปร่างล่วงหน้า ─────────────────────
// 🎯 ข้อนี้คือหัวใจ — ต้นทางแต่ละเจ้าคนละรูป และเปลี่ยนได้โดยไม่บอก
console.log("\n[3] หาตัวเลขผู้ติดตามในคำตอบรูปร่างต่างๆ");
{
  const shapes = [
    ["tiktok แบบ stats", { data: { user: { stats: { followerCount: 98765 } } } }, 98765],
    ["instagram แบบ edge", { data: { user: { edge_followed_by: { count: 4321 } } } }, 4321],
    ["x แบบ legacy", { data: { legacy: { followers_count: 555 } } }, 555],
    ["youtube แบบ string", { channel: { subscriberCount: "1.2M" } }, 1200000],
    ["apify คืนมาเป็น array", [{ username: "a", followersCount: 777 }], 777],
    ["ซ้อนลึกหลายชั้น", { a: { b: { c: { d: { subscribers: 12 } } } } }, 12],
  ];
  for (const [name, obj, want] of shapes) {
    const hit = P.findFollowers(obj);
    ok(name + " → " + want, hit && hit.value === want, hit ? "ได้ " + hit.value : "หาไม่เจอ");
  }
  ok("ไม่มีตัวเลขเลย = null (ไม่ใช่ 0)", P.findFollowers({ name: "abc", bio: "x" }) === null);

  // ⚠️ facebook บางเพจให้แต่ยอดไลก์ — ต้องบอกว่าเป็นคนละตัวกับผู้ติดตาม
  const likeOnly = P.findFollowers({ page: { likes: 1000 } });
  ok("เจอแต่ยอดไลก์ → ติดธงบอกว่าเป็นไลก์", likeOnly && likeOnly.value === 1000 && likeOnly.isLikes === true);
  const both = P.findFollowers({ page: { likes: 1000, followers: 1200 } });
  ok("มีทั้งไลก์และผู้ติดตาม → เอาผู้ติดตาม", both && both.value === 1200 && both.isLikes === false,
     both ? "ได้ " + both.value : "หาไม่เจอ");
}

// ── [4] ต้นทางตอบไม่ตรงที่เดา → ต้องลองตัวถัดไป ไม่ใช่ยอมแพ้ ─────────────
console.log("\n[4] เดา endpoint ผิด/ต้นทางล่ม → ตกไปตัวถัดไปเอง");
{
  // ScrapeCreators: route แรก 404 → ต้องลอง route ที่สองของ youtube
  let calls = [];
  const stub = async (u) => {
    calls.push(u);
    if (calls.length === 1) return { ok: false, status: 404, json: async () => ({ error: "not found" }) };
    return { ok: true, status: 200, json: async () => ({ subscriberCount: 5000, credits_remaining: 940 }) };
  };
  const r = await P.scrapeCreators("youtube", "@x", { SCRAPECREATORS_API_KEY: "k" }, stub);
  ok("route แรกพัง → ลองตัวถัดไปจนได้ค่า", r.ok && r.followers === 5000, JSON.stringify(r));
  ok("เก็บเครดิตคงเหลือมาด้วย", r.credits === 940);
  ok("ยิงไป 2 ครั้งจริง", calls.length === 2, "ยิง " + calls.length);

  // ไม่มีกุญแจ = ต้องไม่ยิงเลย
  let n = 0;
  const counter = async () => { n++; return { ok: true, status: 200, json: async () => ({}) }; };
  const noKey = await P.scrapeCreators("tiktok", "a", {}, counter);
  ok("ไม่มี key = ไม่ยิงต้นทางสักครั้ง", !noKey.ok && n === 0, "ยิง " + n);

  // ScrapeCreators ล้มทั้งหมด → ตกไป Apify
  const seq = [];
  const both = async (u, init) => {
    seq.push(u.includes("scrapecreators") ? "sc" : "apify");
    if (u.includes("scrapecreators")) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ([{ fansCount: 314 }]) };
  };
  const f = await P.fetchFollowers("tiktok", "a",
    { SCRAPECREATORS_API_KEY: "k", APIFY_TOKEN: "t" }, { fetchImpl: both });
  ok("SC ล่ม → ใช้ Apify แทนได้", f.ok && f.followers === 314 && f.provider === "apify", JSON.stringify(f));
  ok("ลองตามลำดับ SC ก่อน Apify", seq[0] === "sc" && seq.includes("apify"), seq.join(","));

  // บังคับเจ้าเดียวได้
  const seq2 = [];
  await P.fetchFollowers("tiktok", "a", { SCRAPECREATORS_API_KEY: "k", APIFY_TOKEN: "t" },
    { provider: "apify", fetchImpl: async (u) => { seq2.push(u.includes("apify") ? "apify" : "sc"); return { ok: true, status: 200, json: async () => ([{ followers: 1 }]) }; } });
  ok("?provider=apify แล้วไม่แตะ ScrapeCreators เลย", seq2.join(",") === "apify", seq2.join(","));

  ok("ชื่อ actor ของ Apify ตั้งทับได้จาก env",
     P.apifyActor("tiktok", { APIFY_ACTOR_TIKTOK: "me~my-actor" }) === "me~my-actor");
}

// ── [5] 🔑 กุญแจ — ข้อที่พลาดไม่ได้ ─────────────────────────────────────
// `/api/*` เข้า Cloudflare Access ไม่ได้ ถ้าไม่มีกุญแจ = ใครก็ยิงเผาเครดิตที่จ่ายเงินได้
console.log("\n[5] ไม่มีกุญแจ = ไม่ยิงต้นทางเลยสักครั้ง");
{
  const call = async (qs, env) => {
    let hits = 0;
    globalThis.fetch = async () => { hits++; return { ok: true, status: 200, json: async () => ({ followers: 1 }) }; };
    const req = new Request("https://x.test/api/followers" + qs);
    const res = await EP.onRequest({ request: req, env, waitUntil: () => {} });
    return { res, body: await res.json(), hits };
  };

  const a = await call("", { SCRAPECREATORS_API_KEY: "k" });                       // ยังไม่ตั้ง FOLLOWERS_TOKEN
  ok("ยังไม่ตั้ง FOLLOWERS_TOKEN → 503 (fail closed)", a.res.status === 503, "ได้ " + a.res.status);
  ok("และไม่ยิงต้นทางเลย", a.hits === 0, "ยิง " + a.hits);
  ok("บอกวิธีแก้เป็นภาษาคน", /FOLLOWERS_TOKEN/.test(a.body.error || ""));

  const b = await call("?key=wrong-key", { FOLLOWERS_TOKEN: "good-key", SCRAPECREATORS_API_KEY: "k" });
  ok("กุญแจผิด → 401", b.res.status === 401, "ได้ " + b.res.status);
  ok("กุญแจผิดก็ไม่ยิงต้นทาง", b.hits === 0, "ยิง " + b.hits);

  const c = await call("?key=good-key&platform=tiktok&handle=abc",
                       { FOLLOWERS_TOKEN: "good-key", SCRAPECREATORS_API_KEY: "k" });
  ok("กุญแจถูก → ทำงาน", c.res.status === 200 && c.hits > 0, "status " + c.res.status + " ยิง " + c.hits);

  // กุญแจส่งทาง Authorization header ก็ได้
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ followers: 9 }) });
  const res2 = await EP.onRequest({
    request: new Request("https://x.test/api/followers?platform=x&handle=a&refresh=1",
      { headers: { authorization: "Bearer good-key" } }),
    env: { FOLLOWERS_TOKEN: "good-key", SCRAPECREATORS_API_KEY: "k" }, waitUntil: () => {},
  });
  ok("ส่งกุญแจทาง Authorization ก็ได้", res2.status === 200, "ได้ " + res2.status);
}

// ── [6] เลือกบัญชีที่จะดึง ──────────────────────────────────────────────
console.log("\n[6] เลือกบัญชี — ปิดไว้ต้องไม่ถูกดึง");
{
  const cfg = [
    { id: "yt1", platform: "youtube", handle: "@a", label: "A" },
    { id: "tt1", platform: "tiktok", handle: "b", label: "B", off: true },
    { id: "x1", platform: "twitter", handle: "@c", label: "C" },
  ];
  const t = (qs) => EP.pickTargets(new URL("https://x.test/api/followers" + qs), cfg);

  ok("ไม่ระบุอะไร = เอาเฉพาะบัญชีที่เปิดอยู่", t("").map(a => a.id).join(",") === "yt1,x1", t("").map(a => a.id).join(","));
  ok("บัญชีที่ off ไม่ถูกดึง", !t("").some(a => a.id === "tt1"));
  ok("twitter ในคอนฟิกถูกแปลงเป็น x", t("").find(a => a.id === "x1").platform === "x");
  ok("เลือกด้วย id ได้", t("?accounts=yt1").map(a => a.id).join(",") === "yt1");
  ok("เลือกเฉพาะแพลตฟอร์มได้", t("?platform=youtube").map(a => a.id).join(",") === "yt1");
  ok("ถามบัญชีนอกลิสต์ได้ (ส่องคู่แข่ง)",
     t("?platform=tiktok&handle=@rival")[0].handle === "rival");

  let threw = "";
  try { t("?accounts=ไม่มีจริง"); } catch (e) { threw = e.message; }
  ok("id ที่ไม่มีจริง → บอกว่ามีอะไรให้เลือกบ้าง", /ไม่รู้จักบัญชี/.test(threw) && /yt1/.test(threw), threw);

  threw = "";
  try { t("?handle=abc"); } catch (e) { threw = e.message; }
  ok("ใส่ handle แต่ไม่ใส่ platform → บอกให้ใส่", /platform/.test(threw), threw);

  const many = Array.from({ length: 30 }, (_, i) => ({ id: "a" + i, platform: "x", handle: "h" + i }));
  ok("จำกัดจำนวนบัญชีต่อคำขอ (กันเผาเครดิต)",
     EP.pickTargets(new URL("https://x.test/api/followers"), many).length <= 12,
     String(EP.pickTargets(new URL("https://x.test/api/followers"), many).length));
}

// ── [7] วันที่ต้องเป็นเวลาไทย ───────────────────────────────────────────
// ⚠️ Workers รันด้วย UTC — ใช้ตรงๆ ประวัติจะบันทึกผิดวันทุกช่วงหัวค่ำ
console.log("\n[7] วันที่ใช้เวลาไทย ไม่ใช่ UTC");
{
  ok("หัวค่ำไทย (18:00 = 11:00Z) ยังเป็นวันเดิม",
     EP.bkkDay(new Date("2026-08-28T11:00:00Z")) === "2026-08-28");
  ok("ห้าทุ่มไทย (23:00 = 16:00Z) ต้องเป็นวันที่ 28 ไม่ใช่ 28 ของ UTC ที่ยังไม่ข้าม",
     EP.bkkDay(new Date("2026-08-28T16:00:00Z")) === "2026-08-28");
  ok("ตี 1 ไทย (18:00Z ของเมื่อวาน) = ข้ามวันแล้ว",
     EP.bkkDay(new Date("2026-08-27T18:00:00Z")) === "2026-08-28");
}

// ── [8] ประวัติ + ส่วนต่าง — และกฎโควตา KV ──────────────────────────────
console.log("\n[8] ประวัติรายวัน · ส่วนต่าง · เขียน KV ไม่เกิน 1 ครั้ง");
{
  const today = EP.bkkDay();
  const kv = fakeKV({ "followers:history": JSON.stringify({ yt1: [{ d: "2026-01-01", n: 1000 }] }) });
  const rows = [{ id: "yt1", followers: 1080 }];
  await EP.applyHistory({ FLAGS_KV: kv }, rows, null);

  ok("เทียบกับจุดก่อนหน้าได้", rows[0].delta === 80, String(rows[0].delta));
  ok("บอกด้วยว่าห่างกันกี่วัน", rows[0].deltaDays > 0, String(rows[0].deltaDays));
  ok("อ่าน KV ครั้งเดียว", kv.reads === 1, String(kv.reads));
  ok("เขียน KV ครั้งเดียว", kv.writes === 1, String(kv.writes));

  // เรียกซ้ำวันเดียวกัน ค่าเท่าเดิม = ห้ามเขียนซ้ำ
  const before = kv.writes;
  await EP.applyHistory({ FLAGS_KV: kv }, [{ id: "yt1", followers: 1080 }], null);
  ok("ค่าเท่าเดิมในวันเดียวกัน → ไม่เขียน KV ซ้ำ", kv.writes === before, String(kv.writes));

  // ⚠️ จุดก่อนหน้าต้องไม่ใช่ "ของวันนี้เอง" ไม่งั้นส่วนต่างจะเป็น 0 ตลอด
  const rows2 = [{ id: "yt1", followers: 1090 }];
  await EP.applyHistory({ FLAGS_KV: kv }, rows2, null);
  ok("เทียบกับวันก่อน ไม่ใช่กับตัวเองของวันนี้", rows2[0].delta === 90, String(rows2[0].delta));
  const stored = JSON.parse(kv._dump()["followers:history"]).yt1;
  ok("วันเดียวกันเก็บจุดเดียว ไม่พอกทุกครั้งที่เรียก",
     stored.filter(p => p.d === today).length === 1, JSON.stringify(stored));

  // ไม่มี KV ก็ต้องยังใช้ได้ แค่ไม่มีส่วนต่าง
  const rows3 = [{ id: "a", followers: 5 }];
  const got = await EP.applyHistory({}, rows3, null);
  ok("ไม่มี KV = ไม่พัง (แค่ไม่มีส่วนต่าง)", got === null && rows3[0].followers === 5);
}

// ── [9] คำตอบที่ส่งกลับ ─────────────────────────────────────────────────
console.log("\n[9] คำตอบที่ส่งกลับต้องบอกที่มา และห้ามมีของดิบจากต้นทาง");
{
  cacheStore = new Map();
  globalThis.fetch = async (u) => {
    if (String(u).includes("credit-balance")) return { ok: true, status: 200, json: async () => ({ credits_remaining: 500 }) };
    return { ok: true, status: 200, json: async () => ({ secretInternalField: "ห้ามหลุด", data: { user: { stats: { followerCount: 4242 } } } }) };
  };
  const res = await EP.onRequest({
    request: new Request("https://x.test/api/followers?key=t&platform=tiktok&handle=abc"),
    env: { FOLLOWERS_TOKEN: "t", SCRAPECREATORS_API_KEY: "k" }, waitUntil: () => {},
  });
  const body = await res.json();
  const a = body.accounts[0];
  ok("ได้ยอดผู้ติดตาม", a.followers === 4242, JSON.stringify(a));
  ok("บอกว่าใครเป็นคนดึงให้", a.provider === "scrapecreators");
  ok("บอกว่าเอาตัวเลขมาจากฟิลด์ไหน (ไว้ไล่ปัญหา)", a.field === "followerCount", String(a.field));
  ok("แยกให้ออกว่าเป็นผู้ติดตาม ไม่ใช่ยอดไลก์", a.metric === "followers");
  ok("มีลิงก์โปรไฟล์ให้กดดู", /tiktok\.com/.test(a.url));
  ok("บอกเครดิตคงเหลือ", body.credits.scrapecreators === 500, JSON.stringify(body.credits));

  // 🚫 บทเรียนจาก /debugmeta — ห้ามคืน response ดิบของต้นทางออกไป
  ok("ไม่มีของดิบจากต้นทางหลุดออกมา", !JSON.stringify(body).includes("ห้ามหลุด"));

  // cache: ยิงซ้ำต้องไม่แตะต้นทางอีก
  let hits = 0;
  globalThis.fetch = async () => { hits++; return { ok: true, status: 200, json: async () => ({ followerCount: 1 }) }; };
  const again = await EP.onRequest({
    request: new Request("https://x.test/api/followers?key=t&platform=tiktok&handle=abc"),
    env: { FOLLOWERS_TOKEN: "t", SCRAPECREATORS_API_KEY: "k" }, waitUntil: () => {},
  });
  ok("ถามซ้ำ = ใช้ของใน cache ไม่ยิงต้นทางใหม่", hits === 0 && again.headers.get("x-followers-cache") === "hit",
     "ยิง " + hits + " · " + again.headers.get("x-followers-cache"));
}

// ── [10] ดึงไม่สำเร็จ ต้องบอกตรงๆ ห้ามได้ 0 ────────────────────────────
// 🔴 0 กับ "ดึงไม่ได้" คนละเรื่องกัน — รายงานเป็น 0 คือโกหกว่าไม่มีคนติดตาม
console.log("\n[10] ดึงไม่สำเร็จ → บอกว่าไม่สำเร็จ ไม่ใช่ตอบ 0");
{
  cacheStore = new Map();
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: "ต้นทางล่ม" }) });
  const res = await EP.onRequest({
    request: new Request("https://x.test/api/followers?key=t&platform=x&handle=zz"),
    env: { FOLLOWERS_TOKEN: "t", SCRAPECREATORS_API_KEY: "k" }, waitUntil: () => {},
  });
  const a = (await res.json()).accounts[0];
  ok("followers เป็น null ไม่ใช่ 0", a.followers === null, String(a.followers));
  ok("มีข้อความบอกว่าพังเพราะอะไร", !!a.error && /500/.test(a.error), String(a.error));
}

// ── [11] ต่อกับแชทผ่าน MCP ──────────────────────────────────────────────
console.log("\n[11] MCP — ต่อกับแชทได้จริง");
{
  const rpc = async (body, env = { FOLLOWERS_TOKEN: "t", SCRAPECREATORS_API_KEY: "k" }) => {
    const res = await MCP.onRequest({
      request: new Request("https://x.test/api/followers/mcp?key=t",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      env, waitUntil: () => {},
    });
    return { status: res.status, body: res.status === 202 ? null : await res.json() };
  };

  const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  ok("initialize ตอบชื่อเซิร์ฟเวอร์กลับมา", init.body.result.serverInfo.name === "cp-followers", JSON.stringify(init.body));
  ok("บอกว่ามีเครื่องมือให้ใช้", !!init.body.result.capabilities.tools);

  const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = list.body.result.tools.map(t => t.name);
  ok("มีเครื่องมือครบ 3 ตัว", names.join(",") === "get_followers,list_accounts,get_follower_history", names.join(","));
  ok("ทุกเครื่องมือมีคำอธิบายภาษาไทย", list.body.result.tools.every(t => /[ก-๙]/.test(t.description)));

  const noti = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
  ok("notification ไม่ต้องตอบกลับ (202)", noti.status === 202, String(noti.status));

  cacheStore = new Map();
  globalThis.fetch = async (u) => {
    if (String(u).includes("credit-balance")) return { ok: true, status: 200, json: async () => ({ credits_remaining: 88 }) };
    return { ok: true, status: 200, json: async () => ({ data: { user: { stats: { followerCount: 12345 } } } }) };
  };
  const call = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "get_followers", arguments: { platform: "tiktok", handle: "abc" } } });
  const text = call.body.result.content[0].text;
  ok("เรียกเครื่องมือแล้วได้ตัวเลขกลับมา", /12,345/.test(text), text.slice(0, 200));
  ok("อ่านรู้เรื่องเป็นภาษาคน ไม่ใช่ JSON ล้วน", /ผู้ติดตาม/.test(text));
  ok("แนบ JSON มาด้วยเผื่อต้องใช้ค่าเป๊ะ", /JSON:/.test(text));

  const ls = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_accounts", arguments: {} } });
  ok("list_accounts บอกได้ว่าบัญชีไหนเปิด/ปิด", /เปิดอยู่|ปิดอยู่/.test(ls.body.result.content[0].text));

  // ไม่มีกุญแจ = เครื่องมือต้องไม่ทำงาน
  cacheStore = new Map();
  let hits = 0;
  globalThis.fetch = async () => { hits++; return { ok: true, status: 200, json: async () => ({ followers: 1 }) }; };
  const noKey = await rpc({ jsonrpc: "2.0", id: 5, method: "tools/call",
    params: { name: "get_followers", arguments: { platform: "tiktok", handle: "abc" } } }, { SCRAPECREATORS_API_KEY: "k" });
  ok("MCP ก็ต้องผ่านด่านกุญแจ ไม่ยิงต้นทาง", hits === 0, "ยิง " + hits);
  ok("และบอกเหตุผลกลับไปในแชท", /FOLLOWERS_TOKEN/.test(noKey.body.result.content[0].text),
     noKey.body.result.content[0].text.slice(0, 120));

  const bad = await rpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "ไม่มีจริง" } });
  ok("เรียกเครื่องมือที่ไม่มี → error ของ JSON-RPC", bad.body.error && bad.body.error.code === -32602);
}

// ── [12] ด่านกันคนแก้ผิดในอนาคต ─────────────────────────────────────────
console.log("\n[12] ด่านกันของเดิมพัง");
{
  const idx = fs.readFileSync("../functions/api/followers/index.js", "utf8");
  const mcp = fs.readFileSync("../functions/api/followers/mcp.js", "utf8");
  const admin = fs.readFileSync("../admin/app.js", "utf8");

  // ⚠️ cache hit ต้อง return ก่อนบรรทัด startLog ไม่งั้นทุกคำขอกินโควตา KV
  const hitAt = idx.search(/if \(hit\) return/);
  ok("cache hit ออกก่อนบรรทัดเขียน log", hitAt !== -1 && idx.indexOf("startLog(") > hitAt);

  // 🚫 endpoint ที่ cache key แตกตามพารามิเตอร์ ห้ามส่ง built: true
  ok("ไม่บันทึก log ทุก build (cache key แตกตามบัญชีที่ถาม)", !/built:\s*true/.test(idx));

  // ⚠️ ชื่อช่อง log ต้องแปลเป็นภาษาคนได้ที่หน้า /admin/
  ok('มีคำแปลไทยของช่อง "followers" ใน admin', admin.includes('"followers":'));

  // 💧 เขียน KV ที่เดียว
  ok("เขียน KV จุดเดียวในไฟล์", (idx.match(/kv\.put\(/g) || []).length === 1,
     String((idx.match(/kv\.put\(/g) || []).length));

  // 🔑 ด่านกุญแจต้องอยู่ก่อนโค้ดที่ยิงต้นทาง
  ok("ตรวจกุญแจก่อนเรียก fetchFollowers", idx.indexOf("checkToken(") < idx.indexOf("fetchFollowers("));
  // MCP ต้องเรียกผ่าน /api/followers เท่านั้น ไม่ยิง scraper เอง
  // (ไม่งั้นจะมี 2 ทางที่ต้องดูแลเรื่องกุญแจ/cache/โควตา แล้วลืมทางใดทางหนึ่งแน่นอน)
  ok("MCP ไม่ยิงต้นทางเอง ใช้ endpoint เดิม",
     !/api\.scrapecreators\.com|api\.apify\.com/i.test(mcp) && /followersRequest\(/.test(mcp));

  // 🚫 ห้ามฝังกุญแจ/โทเคนลงไฟล์ (repo เป็น public)
  const all = idx + mcp + fs.readFileSync("../functions/api/followers/_lib/providers.js", "utf8") +
              fs.readFileSync("../tools/followers-mcp.mjs", "utf8") +
              fs.readFileSync("../followers.config.js", "utf8");
  ok("ไม่มีกุญแจฝังอยู่ในโค้ด", !/(sk-|apify_api_|scrapecreators_[a-z0-9]{8})/i.test(all));
}

console.log(`\nผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
