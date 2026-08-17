// Social Dashboard — คุมเรื่อง: เปิดมาต้องขึ้นไอคอนหมุน · ยังไม่เชื่อมต่อต้องบอกว่าขาดอะไร ·
// token ตายต้องไม่เงียบ · null ห้ามกลายเป็น 0 · จอแคบต้องไม่ล้น
//
// ⚠️ ยิงเน็ตออกนอกไม่ได้ — ปลอม /social/api/* เอาเองด้วย page.route ทุกเคส
// ต้องมีเซิร์ฟเวอร์ static ที่พอร์ต 8899 ก่อน:  python3 -m http.server 8899 --directory ..

import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8899";
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log("  ✅ " + m)) : (fail++, console.log("  ❌ " + m)); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

/** เปิดหน้า /social/ โดยปลอมคำตอบของ API ตามที่กำหนด */
async function open(reply, { viewport = { width: 1280, height: 900 }, hold = 0 } = {}) {
  const pg = await browser.newPage({ viewport });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.route("**/social/api/**", async (route) => {
    const key = new URL(route.request().url()).pathname.split("/").pop();
    if (hold) await new Promise((r) => setTimeout(r, hold));
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(reply(key)),
    });
  });
  await pg.goto(BASE + "/social/", { waitUntil: "domcontentloaded" });
  return { pg, errs };
}

const body = (pg, key) => pg.$eval(`[data-body="${key}"]`, (e) => e.innerHTML);
const text = (pg, key) => pg.$eval(`[data-body="${key}"]`, (e) => e.innerText);

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[1] เปิดหน้ามาต้องเห็นไอคอนหมุน ไม่ใช่หน้าว่าง");
{
  // หน่วง API ไว้ แล้วดูว่าระหว่างรอเห็นอะไร
  const { pg, errs } = await open(() => ({ ok: true, status: "ok", data: {} }), { hold: 1500 });
  await pg.waitForTimeout(400);
  const h = await body(pg, "youtube");
  ok(h.includes("spin"), "ระหว่างรอมีไอคอนหมุน");
  ok(/กำลังดึงข้อมูล/.test(h), "มีข้อความบอกว่ากำลังดึงข้อมูล");
  const all = await Promise.all(["youtube", "facebook", "tiktok"].map((k) => body(pg, k)));
  ok(all.every((x) => x.includes("spin")), "ขึ้นครบทั้ง 3 คอลัมน์");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[2] ยังไม่ได้ใส่ token → ต้องบอกว่าขาด env ตัวไหน ห้ามเงียบ");
{
  const { pg, errs } = await open((key) =>
    key === "tiktok"
      ? { ok: false, status: "not-configured", need: ["TIKTOK_CLIENT_KEY", "TIKTOK_REFRESH_TOKEN"],
          message: "ยังไม่ได้เชื่อมต่อ TikTok" }
      : { ok: true, status: "ok", data: {} });
  await pg.waitForFunction(() => !document.querySelector('[data-body="tiktok"]').innerHTML.includes("spin"));
  const t = await text(pg, "tiktok");
  const h = await body(pg, "tiktok");
  ok(/ยังไม่ได้เชื่อมต่อ/.test(t), "บอกว่ายังไม่ได้เชื่อมต่อ");
  ok(t.includes("TIKTOK_CLIENT_KEY") && t.includes("TIKTOK_REFRESH_TOKEN"), "บอกชื่อ env ที่ขาดครบทุกตัว");
  ok(/Production และ Preview/.test(t), "เตือนเรื่องต้องใส่ทั้ง 2 ที่ (เคยพลาดมาแล้ว)");
  ok(!h.includes("spin"), "หยุดหมุนแล้ว ไม่หมุนค้าง");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[3] token หมดอายุ → ต้องขึ้นเตือน ไม่ใช่คอลัมน์ว่าง");
{
  const { pg } = await open((key) =>
    key === "facebook"
      ? { ok: false, status: "auth-failed", need: [],
          message: "token ของ Facebook หมดอายุหรือถูกถอน — ต้องขอ Page Access Token ใหม่" }
      : { ok: true, status: "ok", data: {} });
  await pg.waitForFunction(() => !document.querySelector('[data-body="facebook"]').innerHTML.includes("spin"));
  const t = await text(pg, "facebook");
  const h = await body(pg, "facebook");
  ok(/หมดอายุ/.test(t), "บอกว่า token หมดอายุ");
  ok(h.includes("note bad"), "ใช้สีเตือนแบบร้ายแรง");
  ok(t.trim().length > 10, "ไม่ใช่กล่องเปล่า");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[4] มีข้อมูลจริง → ตัวเลขและคลิปต้องขึ้นครบ");
{
  const { pg, errs } = await open((key) => {
    if (key === "youtube") return { ok: true, status: "ok", data: {
      channel: { title: "ช่องทดสอบ", url: "https://youtube.com/@x", subs: 125000, views: 48000000, videos: 320 },
      videos: [{ id: "a", title: "คลิปแรก", url: "https://y/a", at: new Date(Date.now() - 3600e3).toISOString(),
                 views: 15200, likes: 430, comments: 21 }],
    } };
    return { ok: true, status: "ok", data: {} };
  });
  await pg.waitForFunction(() => document.querySelector('[data-body="youtube"]').innerText.includes("ผู้ติดตาม"));
  const t = await text(pg, "youtube");
  ok(t.includes("125K"), "ย่อยอดผู้ติดตามเป็น 125K");
  ok(t.includes("48M"), "ย่อยอดวิวเป็น 48M");
  ok(t.includes("320"), "จำนวนคลิปขึ้นเป็นเลขเต็ม");
  ok(t.includes("คลิปแรก"), "พาดหัวคลิปขึ้น");
  ok(/ชม\.ที่แล้ว/.test(t), "บอกอายุคลิปเป็นภาษาคน");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[5] ค่าที่ถูกซ่อนไว้ (null) ห้ามกลายเป็น 0");
{
  const { pg } = await open((key) =>
    key === "youtube"
      ? { ok: true, status: "ok", data: {
          channel: { title: "ช่องซ่อนยอด", subs: null, subsHidden: true, views: 1000, videos: 5 },
          videos: [{ id: "b", title: "คลิป", url: "#", at: "", views: 10, likes: null, comments: null }],
        } }
      : { ok: true, status: "ok", data: {} });
  await pg.waitForFunction(() => document.querySelector('[data-body="youtube"]').innerText.includes("ผู้ติดตาม"));
  const t = await text(pg, "youtube");
  const h = await body(pg, "youtube");
  ok(!/\b0\b\s*ผู้ติดตาม/.test(t), "ไม่โชว์ '0 ผู้ติดตาม' ทั้งที่แค่ถูกซ่อน");
  ok(h.includes("stat na"), "ใช้ช่องแบบ 'ไม่มีข้อมูล' แทน");
  ok(/ซ่อนยอดผู้ติดตาม/.test(t), "อธิบายว่าทำไมถึงไม่มีตัวเลข");
  ok(!/❤\s*0/.test(t), "ไลก์ที่ปิดไว้ไม่กลายเป็น 0");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[6] ต้นทางล่มแต่มีของเก่า → บอกว่าเป็นของเก่า");
{
  const { pg } = await open((key) =>
    key === "tiktok"
      ? { ok: true, status: "ok", stale: true, at: Date.now() - 7200e3,
          message: "ต้นทางไม่ตอบ", data: { account: { name: "บัญชีทดสอบ", followers: 900 }, videos: [] } }
      : { ok: true, status: "ok", data: {} });
  await pg.waitForFunction(() => document.querySelector('[data-body="tiktok"]').innerText.includes("ผู้ติดตาม"));
  const t = await text(pg, "tiktok");
  ok(t.includes("900"), "ยังโชว์ตัวเลขของเก่าให้ดู ดีกว่าไม่มีอะไรเลย");
  ok(/ข้อมูลรอบก่อน/.test(t), "บอกชัดว่าเป็นของรอบก่อน ไม่ปล่อยให้เข้าใจผิดว่าสด");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[7] ห้ามแอบเก็บสำเนาไว้ในเครื่องแล้วเปิดมาโชว์ของเก่า");
{
  const { pg } = await open(() => ({ ok: true, status: "ok", data: { channel: { title: "ช่อง", subs: 5 }, videos: [] } }));
  await pg.waitForFunction(() => document.querySelector('[data-body="youtube"]').innerText.includes("ผู้ติดตาม"));
  const keys = await pg.evaluate(() => Object.keys(localStorage));
  const bad = keys.filter((k) => !/^swChkAt$/.test(k));
  ok(bad.length === 0, "ไม่เก็บสำเนาข้อมูลไว้ใน localStorage (เจอ: " + (bad.join(",") || "ไม่มี") + ")");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[8] จอแคบต้องไม่ล้นแนวนอน");
{
  const { pg, errs } = await open((key) =>
    key === "youtube"
      ? { ok: true, status: "ok", data: {
          channel: { title: "ช่องที่ชื่อยาวมากๆๆๆ เพื่อทดสอบว่าล้นไหม", subs: 1234567, views: 987654321, videos: 1200 },
          videos: [{ id: "c", url: "#", at: new Date().toISOString(), views: 1, likes: 1, comments: 1,
                     title: "พาดหัวคลิปที่ยาวมากจนน่าจะดันคอลัมน์ให้กว้างเกินจอถ้าไม่ได้ตัดบรรทัดไว้ให้ดี" }],
        } }
      : { ok: true, status: "ok", data: {} },
    { viewport: { width: 390, height: 844 } });
  await pg.waitForFunction(() => document.querySelector('[data-body="youtube"]').innerText.includes("ผู้ติดตาม"));
  const m = await pg.evaluate(() => ({
    sw: document.scrollingElement.scrollWidth,
    iw: window.innerWidth,
    over: [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length,
    cols: getComputedStyle(document.querySelector(".board")).gridTemplateColumns.split(" ").length,
  }));
  ok(m.sw <= m.iw + 1, `ไม่มี scroll แนวนอน (${m.sw} ≤ ${m.iw})`);
  ok(m.over === 0, "ไม่มีอะไรล้นขอบขวา");
  ok(m.cols === 1, "จอแคบยุบเหลือคอลัมน์เดียว");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[9] ฟีเจอร์มาตรฐานต้องครบ");
{
  const { pg } = await open(() => ({ ok: true, status: "ok", data: {} }));
  const meta = await pg.evaluate(() => ({
    ver: document.querySelector('meta[name="page-ver"]')?.content || "",
    manifest: !!document.querySelector('link[rel="manifest"]'),
    icon: !!document.querySelector('link[rel="icon"]'),
    touch: !!document.querySelector('link[rel="apple-touch-icon"]'),
    home: [...document.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/"),
    vtag: !!document.getElementById("vtag"),
    noindex: (document.querySelector('meta[name="robots"]')?.content || "").includes("noindex"),
  }));
  ok(!!meta.ver, "มี page-ver (ตัวเช็คเวอร์ชันใหม่)");
  ok(meta.manifest, "มี manifest (ติดตั้งเป็นแอปได้)");
  ok(meta.icon, "มี favicon");
  ok(meta.touch, "มี apple-touch-icon (iOS)");
  ok(meta.home, "มีปุ่มกลับหน้าหลัก");
  ok(meta.vtag, "มีป้ายเลขเวอร์ชัน");
  ok(meta.noindex, "กัน Google เก็บ index (เป็นข้อมูลภายใน)");

  // ⚠️ เลขเวอร์ชันต้องอยู่ที่เดียว — เขียนซ้ำแล้วลืม bump คู่กัน = แถบอัปเดตเด้งไม่หยุด
  const js = await (await fetch(BASE + "/social/app.js")).text();
  ok(!/\b(APP_VER|PAGE_VER)\s*=\s*["']?\d/.test(js), "app.js ไม่เขียนเลขเวอร์ชันซ้ำไว้เอง");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[10] คอลัมน์หนึ่งอืด ต้องไม่ลากอีก 2 คอลัมน์ค้างไปด้วย");
{
  const pg = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await pg.route("**/social/api/**", async (route) => {
    const key = new URL(route.request().url()).pathname.split("/").pop();
    if (key === "tiktok") await new Promise((r) => setTimeout(r, 3000)); // ต้นทางอืด
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, status: "ok", data: { channel: { title: "ช่อง", subs: 10 }, page: { name: "เพจ", followers: 20 }, videos: [], posts: [] } }),
    });
  });
  await pg.goto(BASE + "/social/", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => document.querySelector('[data-body="youtube"]').innerText.includes("ผู้ติดตาม"), null, { timeout: 2500 });
  const tt = await body(pg, "tiktok");
  ok(true, "YouTube วาดเสร็จแล้วทั้งที่ TikTok ยังไม่ตอบ");
  ok(tt.includes("spin"), "TikTok ยังหมุนรออยู่ตามปกติ");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[10b] ยอดผู้ติดตาม YouTube ถูกปัดเศษ — ห้ามโชว์เหมือนเป็นเลขเป๊ะ");
{
  const { pg } = await open((key) =>
    key === "youtube"
      ? { ok: true, status: "ok", data: {
          channel: { title: "ช่อง", subs: 52400, subsApprox: true, views: 100, videos: 5 }, videos: [] } }
      : { ok: true, status: "ok", data: {} });
  await pg.waitForFunction(() => document.querySelector('[data-body="youtube"]').innerText.includes("ผู้ติดตาม"));
  const t = await text(pg, "youtube");
  ok(/ประมาณ/.test(t), "ติดป้ายว่าเป็นตัวเลขโดยประมาณ");
  ok(/เพิ่มกี่คนไม่ได้/.test(t), "เตือนว่าเอาไปนับยอดเพิ่มรายวันไม่ได้");
  await pg.close();

  // ถ้าช่องซ่อนยอดไว้ ต้องไม่ขึ้นป้าย "ประมาณ" ซ้อนกับ "ซ่อนอยู่" ให้งง
  const { pg: pg2 } = await open((key) =>
    key === "youtube"
      ? { ok: true, status: "ok", data: {
          channel: { title: "ช่อง", subs: null, subsHidden: true, subsApprox: false, views: 1, videos: 1 }, videos: [] } }
      : { ok: true, status: "ok", data: {} });
  await pg2.waitForFunction(() => document.querySelector('[data-body="youtube"]').innerText.includes("ผู้ติดตาม"));
  const t2 = await text(pg2, "youtube");
  ok(/ซ่อนยอดผู้ติดตาม/.test(t2) && !/ปัดยอด/.test(t2), "ช่องที่ซ่อนยอด ขึ้นเหตุผลเดียว ไม่ซ้อนกัน");
  await pg2.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[11] โหมดตัวอย่าง — ต้องดูออกทันทีว่าไม่ใช่ของจริง");
{
  const pg = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  // ⚠️ ด่านสำคัญ: โหมดตัวอย่างต้องไม่ยิง API เลยสักครั้ง
  let calls = 0;
  await pg.route("**/social/api/**", async (route) => { calls++; await route.abort(); });
  await pg.goto(BASE + "/social/?demo", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => document.querySelector('[data-body="youtube"]').innerText.includes("ผู้ติดตาม"));

  ok(calls === 0, `ไม่ยิง API เลย (ยิงไป ${calls} ครั้ง)`);

  const bar = await pg.$("#demobar");
  ok(!!bar, "มีแถบเตือนว่าเป็นข้อมูลตัวอย่าง");
  const barTxt = bar ? await bar.innerText() : "";
  ok(/ไม่ใช่ตัวเลขจริง/.test(barTxt), "แถบบอกตรงๆ ว่าไม่ใช่ตัวเลขจริง");
  ok(/[ตัวอย่าง]/.test(await pg.title()), "ชื่อหน้าต่างมีคำว่าตัวอย่าง (แคปหน้าจอแล้วยังรู้)");

  // แถบต้องค้างอยู่แม้เลื่อนหน้าลงไป — sticky ไม่ใช่เลื่อนหายไปกับเนื้อหา
  const stick = await pg.$eval("#demobar", (e) => getComputedStyle(e).position);
  ok(stick === "sticky" || stick === "fixed", "แถบเตือนค้างอยู่บนจอ ไม่เลื่อนหาย");

  // ⚠️ ต่อให้แถบหลุดหาย ตัวข้อมูลเองต้องยังบอกได้ว่าเป็นของสมมติ
  for (const k of ["youtube", "facebook", "tiktok"]) {
    ok(/สมมติ/.test(await text(pg, k)), `${k}: ชื่อช่องบอกว่าเป็นข้อมูลสมมติ`);
  }

  const t = await text(pg, "tiktok");
  ok(t.includes("1.2M") || t.includes("1M"), "ตัวเลขหลักล้านไม่ล้นช่อง");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[12] ไม่ใส่ ?demo ต้องไม่มีอะไรของโหมดตัวอย่างติดมา");
{
  const { pg } = await open(() => ({ ok: true, status: "ok", data: { channel: { title: "ช่องจริง", subs: 7 }, videos: [] } }));
  await pg.waitForFunction(() => document.querySelector('[data-body="youtube"]').innerText.includes("ผู้ติดตาม"));
  ok(!(await pg.$("#demobar")), "ไม่มีแถบตัวอย่างโผล่มาเอง");
  ok(!/ตัวอย่าง/.test(await pg.title()), "ชื่อหน้าต่างปกติ");
  ok(!/สมมติ/.test(await text(pg, "youtube")), "ไม่มีข้อมูลสมมติปนเข้ามา");
  await pg.close();
}

await browser.close();
console.log(`\n${fail ? "❌" : "✅"} ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
