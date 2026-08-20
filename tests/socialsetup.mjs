// หน้าติดตั้งของแดชบอร์ดโซเชียล — คุมเรื่อง "ความลับต้องไม่รั่ว" เป็นหลัก
//
// /social/api/connect โชว์ refresh token ได้ = เป็นประตูที่อันตรายที่สุดในโปรเจกต์นี้
// เทสต์นี้บังคับว่า: ไม่ตั้ง SETUP_KEY ต้องปิดสนิท · กุญแจผิดต้องไม่ผ่าน ·
// ห้ามขอสิทธิ์ที่เขียนข้อมูลได้ · ห้ามมี secret โผล่ในหน้า HTML
//
// ตรรกะล้วน ไม่ต้องเปิดเบราว์เซอร์ ไม่ต้องมีเซิร์ฟเวอร์

import { onRequest as connect } from "../functions/social/api/connect.js";
import { onRequest as status } from "../functions/social/api/status.js";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log("  ✅ " + m)) : (fail++, console.log("  ❌ " + m)); };

const KEY = "setup-key-ยาวๆ-เดาไม่ได้-12345";
const SECRET = "tiktok-client-secret-ห้ามหลุด";

const ctx = (env, url = "https://x.pages.dev/social/api/connect") => ({
  env, request: new Request(url),
});

/* ⚠️ ตอนนี้ connect รองรับ 2 เจ้า (TikTok · Google) เปิดด้วย key เฉยๆ จะได้ "หน้าเลือก"
   ต้องระบุ &p= ถึงจะเข้าขั้นตอนของเจ้านั้นจริงๆ */
const U = (key, p) => "https://x.pages.dev/social/api/connect?key=" + encodeURIComponent(key) +
  (p ? "&p=" + p : "");

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[1] ไม่ได้ตั้ง SETUP_KEY → ต้องปิดสนิท (ค่าปริยายต้องปลอดภัย)");
{
  for (const env of [{}, { SETUP_KEY: "" }, { SETUP_KEY: "   " }]) {
    const r = await connect(ctx(env));
    ok(r.status === 403, `ไม่มี/ว่าง → 403 (ได้ ${r.status})`);
  }
  // เผลอเปิดโล่งเพราะ "ไม่มี key เลยไม่ต้องเช็ค" คือบั๊กคลาสสิก — ต้องไม่เกิด
  const r = await connect(ctx({ TIKTOK_CLIENT_KEY: "k", TIKTOK_CLIENT_SECRET: SECRET }));
  ok(r.status === 403, "มี client key ครบแต่ไม่มี SETUP_KEY ก็ยังต้องปิด");
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[2] กุญแจผิด → ต้องไม่ผ่าน");
{
  const env = { SETUP_KEY: KEY, TIKTOK_CLIENT_KEY: "k", TIKTOK_CLIENT_SECRET: SECRET };
  for (const bad of ["", "ผิด", KEY.slice(0, -1), KEY + "x", KEY.toUpperCase()]) {
    const r = await connect(ctx(env, U(bad, "tiktok")));
    ok(r.status === 403, `กุญแจ "${bad.slice(0, 12)}…" → 403`);
  }
  const r = await connect(ctx(env, U(KEY, "tiktok")));
  ok(r.status === 200, "กุญแจถูก → ผ่าน");
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[3] ยังไม่มี client key → บอกว่าขาดอะไร ไม่ใช่พังเฉยๆ");
{
  const r = await connect(ctx({ SETUP_KEY: KEY }, U(KEY, "tiktok")));
  const h = await r.text();
  ok(r.status === 400, "ตอบ 400");
  ok(h.includes("TIKTOK_CLIENT_KEY") && h.includes("TIKTOK_CLIENT_SECRET"), "บอกชื่อ env ที่ขาดครบ");
  ok(/sandbox/.test(h), "เตือนว่า sandbox กับ production ใช้คนละชุด");
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[4] ขอสิทธิ์อ่านอย่างเดียว — ห้ามขอสิทธิ์ที่แก้ช่องได้");
{
  const env = { SETUP_KEY: KEY, TIKTOK_CLIENT_KEY: "client-abc", TIKTOK_CLIENT_SECRET: SECRET };
  const r = await connect(ctx(env, U(KEY, "tiktok")));
  const h = await r.text();
  const m = h.match(/https:\/\/www\.tiktok\.com\/v2\/auth\/authorize\/[^"]+/);
  ok(!!m, "มีลิงก์ไปหน้าอนุญาตของ TikTok");

  const auth = new URL(m[0].replace(/&amp;/g, "&"));
  const scope = auth.searchParams.get("scope") || "";
  ok(scope.includes("user.info.stats"), "ขอ user.info.stats (ยอดผู้ติดตาม)");
  ok(scope.includes("video.list"), "ขอ video.list (ยอดวิวรายคลิป)");

  // ⚠️ ด่านสำคัญ: หลุด scope เขียนเข้ามาเมื่อไหร่ = token ที่หลุดไปแก้ช่องได้
  const writeScopes = ["video.publish", "video.upload", "video.delete", "user.info.write", "share"];
  const bad = writeScopes.filter((s) => scope.includes(s));
  ok(bad.length === 0, "ไม่มี scope ที่เขียน/ลบข้อมูลได้ (เจอ: " + (bad.join(",") || "ไม่มี") + ")");

  ok(auth.searchParams.get("redirect_uri") === "https://x.pages.dev/social/api/connect", "redirect_uri ชี้กลับมาที่เดิม");
  ok(auth.searchParams.get("client_key") === "client-abc", "ส่ง client_key ไปถูกตัว");
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[5] client secret ห้ามโผล่ในหน้า HTML เด็ดขาด");
{
  const env = { SETUP_KEY: KEY, TIKTOK_CLIENT_KEY: "client-abc", TIKTOK_CLIENT_SECRET: SECRET };
  for (const u of [
    U(KEY, "tiktok"),
    U(KEY, "tiktok") + "&error=access_denied",
  ]) {
    const h = await (await connect(ctx(env, u))).text();
    ok(!h.includes(SECRET), "ไม่มี client secret ในหน้า (" + (u.includes("error") ? "หน้าปฏิเสธ" : "หน้าเริ่ม") + ")");
  }
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[6] /status บอกว่าใส่ครบหรือยัง แต่ห้ามคืนค่าจริง");
{
  const env = {
    YT_API_KEY: "yt-secret-value", YT_CHANNEL_HANDLE: "@somechannel",
    FB_PAGE_ID: "12345", FB_PAGE_TOKEN: "fb-secret-value",
    CF_PAGES_BRANCH: "dev",
  };
  const j = JSON.parse(await (await status(ctx(env, "https://x.pages.dev/social/api/status"))).text());

  const raw = JSON.stringify(j);
  ok(!raw.includes("yt-secret-value"), "ไม่คืนค่า YT_API_KEY");
  ok(!raw.includes("fb-secret-value"), "ไม่คืนค่า FB_PAGE_TOKEN");

  const yt = j.groups.find((g) => g.key === "youtube");
  const fb = j.groups.find((g) => g.key === "facebook");
  const tt = j.groups.find((g) => g.key === "tiktok");
  ok(yt.ready === true, "YouTube: ครบแล้ว");
  ok(fb.ready === true, "Facebook: ครบแล้ว");
  ok(tt.ready === false, "TikTok: ยังไม่ครบ");
  ok(tt.missing.length === 3, "บอกครบว่า TikTok ขาด 3 ตัว");
  ok(j.allReady === false, "สรุปว่ายังไม่ครบทุกช่อง");
  ok(j.branch === "dev", "บอก branch ที่กำลังดูอยู่ (env ของ Preview กับ Production คนละชุด)");
  ok(j.setupOpen === false, "บอกว่าประตูติดตั้งปิดอยู่");
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[7] ใส่ YT_CHANNEL_ID แทน handle ก็ต้องนับว่าครบ");
{
  const j = JSON.parse(await (await status(ctx({ YT_API_KEY: "k", YT_CHANNEL_ID: "UC123" }))).text());
  ok(j.groups.find((g) => g.key === "youtube").ready === true, "ใส่ ID แทน handle ก็ผ่าน");

  const j2 = JSON.parse(await (await status(ctx({ YT_API_KEY: "k" }))).text());
  ok(j2.groups.find((g) => g.key === "youtube").ready === false, "มีแต่ key ไม่มีช่อง = ยังไม่ครบ");
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[8] เปิดโหมดติดตั้งค้างไว้ ต้องมองเห็นได้จาก /status");
{
  const j = JSON.parse(await (await status(ctx({ SETUP_KEY: KEY }))).text());
  ok(j.setupOpen === true, "บอกว่า SETUP_KEY ยังเปิดอยู่ (ต้องลบทิ้งหลังใช้เสร็จ)");
  ok(!JSON.stringify(j).includes(KEY), "แต่ไม่บอกว่ากุญแจคืออะไร");
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[6] 🔴 YouTube Analytics — ขอสิทธิ์ผ่าน Google OAuth");
{
  // เปิดด้วยกุญแจเฉยๆ = หน้าเลือกว่าจะเชื่อมเจ้าไหน
  const menu = await connect(ctx({ SETUP_KEY: KEY }, U(KEY)));
  const mh = await menu.text();
  ok(menu.status === 200, "เปิดด้วยกุญแจเฉยๆ ได้หน้าเลือก");
  ok(/p=google/.test(mh) && /p=tiktok/.test(mh), "มีให้เลือกทั้ง YouTube และ TikTok");
  ok(/\/social\/api\/connect/.test(mh), "บอก Redirect URI ไว้ให้เอาไปใส่");

  // ยังไม่ได้ใส่ client id/secret → ต้องบอกชื่อ env ที่ขาด ไม่ใช่พังเฉยๆ
  const miss = await connect(ctx({ SETUP_KEY: KEY }, U(KEY, "google")));
  const mm = await miss.text();
  ok(miss.status === 400, "ยังไม่มี client id → ตอบ 400");
  ok(/GOOGLE_CLIENT_ID/.test(mm) && /GOOGLE_CLIENT_SECRET/.test(mm), "บอกชื่อ env ที่ขาดครบ");
  ok(/Google Cloud Console/.test(mm), "บอกว่าไปเอาค่ามาจากไหน");

  const env = { SETUP_KEY: KEY, GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: SECRET };
  const r = await connect(ctx(env, U(KEY, "google")));
  const h = await r.text();
  const m = h.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth[^"]+/);
  ok(!!m, "มีลิงก์ไปหน้าอนุญาตของ Google");

  const auth = new URL(m[0].replace(/&amp;/g, "&"));
  const scope = auth.searchParams.get("scope") || "";
  ok(scope.includes("yt-analytics.readonly"), "ขอ yt-analytics.readonly (รายงานสถิติของช่อง)");

  /* ⚠️ ด่านสำคัญ: หลุด scope เขียนเข้ามาเมื่อไหร่ = token ที่หลุดไปแก้ช่องได้
     ชื่อ scope ของ Google ที่เขียนได้จะไม่ลงท้ายด้วย .readonly */
  ok(/\.readonly$/.test(scope.trim().split(/\s+/).pop()), "ทุก scope เป็นแบบอ่านอย่างเดียว");
  const bad = ["youtube.upload", "youtube.force-ssl", "youtubepartner", "drive"].filter((x) => scope.includes(x));
  ok(bad.length === 0, "ไม่มี scope ที่เขียน/ลบข้อมูลได้ (เจอ: " + (bad.join(",") || "ไม่มี") + ")");

  /* 🔴 ไม่มี 2 ตัวนี้ Google จะไม่ให้ refresh token เลย — ให้แต่ access token อายุ 1 ชม.
     แล้วแดชบอร์ดจะใช้ได้ชั่วโมงเดียวแล้วตายเงียบๆ โดยไม่มีอะไรบอก */
  ok(auth.searchParams.get("access_type") === "offline", "ขอแบบ offline (ถึงจะได้ refresh token)");
  ok(auth.searchParams.get("prompt") === "consent", "บังคับถามใหม่ทุกครั้ง (กดซ้ำแล้วยังได้ refresh token)");
  ok(auth.searchParams.get("redirect_uri") === "https://x.pages.dev/social/api/connect", "redirect_uri ตรงกับที่โชว์ไว้");
  ok(auth.searchParams.get("client_id") === "cid.apps.googleusercontent.com", "Google ใช้ client_id ไม่ใช่ client_key");

  /* ⚠️ ตอนกลับมาจากหน้าอนุญาต ทั้ง 2 เจ้าใช้ redirect URI เดียวกัน
     ถ้าจำไม่ได้ว่ากำลังทำเจ้าไหน จะเอา code ของ Google ไปแลกที่ TikTok */
  const state = auth.searchParams.get("state") || "";
  ok(state.startsWith("google|"), `state พาไว้ว่ากำลังทำเจ้าไหน (${state.slice(0, 12)}…)`);
  ok(state.endsWith(KEY), "state ยังพากุญแจไปด้วยเหมือนเดิม");

  // ⚠️ ความลับห้ามโผล่ในหน้า HTML เด็ดขาด
  ok(!h.includes(SECRET), "client secret ไม่โผล่ในหน้า");
  ok(!mh.includes(SECRET) && !mm.includes(SECRET), "หน้าเลือก/หน้าบอกค่าที่ขาด ก็ไม่มี secret");

  // เตือนเรื่อง Brand Account — กดผิดบัญชีจะได้รายงานของช่องส่วนตัวโดยไม่มีอะไรบอก
  ok(/Brand Account/i.test(h), "เตือนเรื่องช่องที่เป็น Brand Account");
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[7] state รุ่นเก่าที่ไม่มีชื่อเจ้า ต้องยังอ่านได้ (ของที่ค้างอยู่ห้ามพัง)");
{
  const env = { SETUP_KEY: KEY, TIKTOK_CLIENT_KEY: "k", TIKTOK_CLIENT_SECRET: SECRET };
  // ของเดิมส่ง state เป็นกุญแจล้วน — ต้องยังถือว่าเป็น TikTok
  const r = await connect(ctx(env,
    "https://x.pages.dev/social/api/connect?error=access_denied&state=" + encodeURIComponent(KEY)));
  const h = await r.text();
  ok(r.status === 400, "state รุ่นเก่ายังผ่านด่านกุญแจได้");
  ok(/TikTok/.test(h), "ตีความว่าเป็น TikTok ตามเดิม");
}

console.log(`\n${fail ? "❌" : "✅"} ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
