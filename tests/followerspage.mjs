// 👥 หน้า /followers/ — หน้าทดสอบตัวดึงผู้ติดตาม
//
// 🎯 หน้านี้มีไว้พิสูจน์ว่า "endpoint ที่เดาไว้มีจริงไหม" เพราะ sandbox ยิงออกเน็ตไม่ได้
//    ถ้ามันรายงานผิด/พังเงียบ จะแย่กว่าไม่มีหน้านี้ — เทสต์จึงปลอมของพังแล้ววัดว่าจับได้จริง
//    (เหตุผลเดียวกับที่ selftest.mjs มีอยู่)
import fs from "node:fs";
import { launch } from "./browser.mjs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const BASE = "http://localhost:8899/followers/";
const browser = await launch();

// เปิดหน้าใหม่ทุกครั้ง + ปลอมคำตอบของ API ตามที่แต่ละข้อต้องการ
async function open({ api, mcp, key = "test-key", viewport } = {}) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1100, height: 900 } });
  const calls = [];
  await ctx.route("**/api/followers/mcp*", async (r) => {
    calls.push("mcp");
    const body = JSON.parse(r.request().postData() || "{}");
    const res = mcp ? mcp(body) : { status: 200, json: { jsonrpc: "2.0", id: body.id, result: {} } };
    await r.fulfill({ status: res.status, contentType: res.contentType || "application/json",
                      body: res.body != null ? res.body : JSON.stringify(res.json) });
  });
  await ctx.route("**/api/followers?*", async (r) => {
    calls.push(r.request().url());
    const res = api ? api(r.request().url()) : { status: 200, json: { accounts: [] } };
    await r.fulfill({
      status: res.status, contentType: res.contentType || "application/json",
      headers: res.cache ? { "x-followers-cache": res.cache } : {},
      body: res.body != null ? res.body : JSON.stringify(res.json),
    });
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(BASE);
  if (key !== null) { await p.fill("#key", key); }
  return { p, ctx, calls, errs };
}
const textOf = (p) => p.$eval("body", (e) => e.innerText);

// ── [1] 🔑 ไม่มีกุญแจ = ต้องไม่ยิง API เลย ────────────────────────────────
console.log("\n[1] ไม่ใส่กุญแจ → บอกให้ใส่ และห้ามยิง API");
{
  const { p, ctx, calls } = await open({ key: null });
  await p.click("#runcfg");
  await p.waitForTimeout(300);
  const t = await textOf(p);
  ok("บอกว่ายังไม่ได้ใส่กุญแจ", /ยังไม่ได้ใส่กุญแจ/.test(t), t.slice(0, 200));
  ok("ไม่ยิง API สักครั้ง (ไม่เผาเครดิต)", calls.length === 0, calls.join(","));
  await p.click(".plat button");
  await p.waitForTimeout(200);
  ok("ปุ่มรายแพลตฟอร์มก็ต้องกันไว้เหมือนกัน", calls.length === 0, calls.join(","));
  await ctx.close();
}

// ── [2] กุญแจถูกจำไว้ในเครื่อง ไม่ได้อยู่ในโค้ด ──────────────────────────
console.log("\n[2] กุญแจอยู่ในเครื่องเท่านั้น");
{
  const { p, ctx } = await open({ key: "my-secret-key" });
  await p.waitForTimeout(150);
  const saved = await p.evaluate(() => localStorage.getItem("followersKey"));
  ok("จำกุญแจไว้ใน localStorage", saved === "my-secret-key", String(saved));
  await p.reload();
  ok("เปิดใหม่แล้วไม่ต้องพิมพ์ซ้ำ", (await p.$eval("#key", (e) => e.value)) === "my-secret-key");
  ok("ช่องกุญแจซ่อนตัวอักษร", (await p.$eval("#key", (e) => e.type)) === "password");
  await ctx.close();

  const html = fs.readFileSync("../followers/index.html", "utf8");
  ok("ไม่มีกุญแจฝังอยู่ในไฟล์ (repo เป็น public)",
     !/FOLLOWERS_TOKEN\s*=\s*["'][^"']+["']/.test(html) && !/(sk-|apify_api_)/i.test(html));
}

// ── [3] ยังไม่ได้ตั้ง env / กุญแจผิด → ต้องบอกวิธีแก้ ไม่ใช่ "ผิดพลาด" ลอยๆ ──
console.log("\n[3] แปล HTTP status เป็นภาษาคน + บอกว่าต้องไปทำอะไร");
{
  for (const [status, want, why] of [
    [503, /FOLLOWERS_TOKEN[\s\S]*Retry deployment/, "ยังไม่ได้ตั้ง secret"],
    [401, /กุญแจไม่ตรง/, "กุญแจผิด"],
  ]) {
    const { p, ctx } = await open({ api: () => ({ status, json: { error: "x" } }) });
    await p.click("#runcfg");
    await p.waitForTimeout(400);
    const t = await textOf(p);
    ok(`HTTP ${status} → บอกวิธีแก้ (${why})`, want.test(t), t.slice(0, 260));
    ok(`HTTP ${status} → สรุปบนหัวเป็นสีแดง`, /❌/.test(await p.$eval("#sum", (e) => e.textContent)));
    await ctx.close();
  }
}

// ── [4] 🎯 ข้อสำคัญที่สุด — ดึงไม่สำเร็จต้องบอกว่าลอง endpoint ไหนแล้วได้อะไร ──
// นี่คือข้อมูลชิ้นเดียวที่ใช้แก้ได้ ถ้าหน้านี้กลืนมันไป หน้านี้ก็ไม่มีประโยชน์
console.log("\n[4] ดึงไม่สำเร็จ → ต้องเห็นชื่อ endpoint ที่ลองไปแล้ว");
{
  const errText = "ScrapeCreators: /v1/tiktok/profile → HTTP 404 | Apify (clockworks~tiktok-profile-scraper): HTTP 404";
  const { p, ctx } = await open({
    api: () => ({ status: 200, json: { day: "2026-08-28", accounts: [
      { id: "tt", label: "CPF (TikTok)", platform: "tiktok", followers: null, error: errText },
    ], credits: { scrapecreators: 900 } } }),
  });
  await p.click("#runcfg");
  await p.waitForTimeout(400);
  const t = await textOf(p);
  ok("เห็นชื่อ endpoint ที่ลองไปแล้วครบ", t.includes("/v1/tiktok/profile") && t.includes("clockworks~tiktok-profile-scraper"),
     t.slice(0, 300));
  ok("เห็นรหัสที่ต้นทางตอบกลับ", /HTTP 404/.test(t));
  ok("นับเป็นข้อที่ไม่ผ่าน", /❌/.test(await p.$eval("#sum", (e) => e.textContent)));
  await ctx.close();
}

// ── [5] ดึงสำเร็จ → ต้องบอกด้วยว่าเอาตัวเลขมาจากไหน ──────────────────────
console.log("\n[5] ดึงสำเร็จ → บอกตัวเลข · ใครดึง · ฟิลด์อะไร · cache หรือดึงใหม่");
{
  const { p, ctx } = await open({
    api: () => ({ status: 200, cache: "miss", json: { day: "2026-08-28", accounts: [
      { id: "yt", label: "CPF News (YouTube)", platform: "youtube", followers: 124300,
        metric: "followers", provider: "scrapecreators", field: "subscriberCount",
        delta: 180, deltaDays: 1, error: null },
    ], credits: { scrapecreators: 940 } } }),
  });
  await p.click("#runcfg");
  await p.waitForTimeout(400);
  const t = await textOf(p);
  ok("แสดงตัวเลขแบบมีคอมมา อ่านง่าย", t.includes("124,300"), t.slice(0, 200));
  ok("บอกว่าใครเป็นคนดึงให้", /scrapecreators/.test(t));
  ok("บอกว่าตัวเลขอยู่ในฟิลด์ไหน (ไว้แก้เวลาเจ้าอื่นเปลี่ยนรูป)", /subscriberCount/.test(t));
  ok("บอกส่วนต่างจากครั้งก่อน", /\+180 จาก 1 วันก่อน/.test(t));
  ok("บอกว่าดึงใหม่ (เสียเครดิต)", /ดึงใหม่/.test(t));
  ok("บอกเครดิตคงเหลือ", /940/.test(t));
  await ctx.close();
}

// ── [5b] cache hit ต้องบอกว่าไม่เสียเครดิต ──────────────────────────────
console.log("\n[5b] ผลจาก cache ต้องบอกให้รู้");
{
  const { p, ctx } = await open({
    api: () => ({ status: 200, cache: "hit", json: { accounts: [
      { label: "A", followers: 5, metric: "followers", provider: "scrapecreators", field: "f", delta: null }
    ], credits: { scrapecreators: 1 } } }),
  });
  await p.click("#runcfg");
  await p.waitForTimeout(400);
  ok("บอกว่ามาจาก cache และไม่เสียเครดิต", /จาก cache \(ไม่เสียเครดิต\)/.test(await textOf(p)));
  await ctx.close();
}

// ── [6] ⚠️ ยอดไลก์ ≠ ผู้ติดตาม — ห้ามขึ้นเขียวเหมือนกัน ────────────────
console.log("\n[6] เจอแต่ยอดไลก์ → เตือน ไม่ใช่ผ่านเฉยๆ");
{
  const { p, ctx } = await open({
    api: () => ({ status: 200, json: { accounts: [
      { label: "CPF (Facebook)", followers: 50000, metric: "likes", provider: "scrapecreators",
        field: "likes", delta: null },
    ], credits: { scrapecreators: 1 } } }),
  });
  await p.click("#runcfg");
  await p.waitForTimeout(400);
  const t = await textOf(p);
  ok("บอกตรงๆ ว่าเป็นยอดไลก์ ไม่ใช่ผู้ติดตาม", /ยอดไลก์/.test(t), t.slice(0, 200));
  ok("ขึ้นเป็นข้อที่ควรดู ไม่ใช่ผ่านสนิท", /⚠️/.test(await p.$eval("#sum", (e) => e.textContent)));
  await ctx.close();
}

// ── [7] คำตอบไม่ใช่ JSON → ห้ามพังเงียบ ────────────────────────────────
// ⚠️ พิมพ์ URL ผิด/หน้าไม่มีจริง จะได้ HTML กลับมา เอาไป .json() จะพังแล้วรายงานผิดทาง
console.log("\n[7] เซิร์ฟเวอร์ตอบ HTML แทน JSON → ต้องบอกตรงๆ");
{
  const { p, ctx, errs } = await open({
    api: () => ({ status: 404, contentType: "text/html", body: "<!DOCTYPE html><h1>Not Found</h1>" }),
  });
  await p.click("#runcfg");
  await p.waitForTimeout(400);
  const t = await textOf(p);
  ok("บอกว่าคำตอบไม่ใช่ JSON", /ไม่ใช่ JSON/.test(t), t.slice(0, 220));
  ok("ไม่มี JS error หลุดออกมา", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ── [8] ทดสอบทีละแพลตฟอร์ม ─────────────────────────────────────────────
console.log("\n[8] ทดสอบทีละแพลตฟอร์ม");
{
  const { p, ctx, calls } = await open({
    api: () => ({ status: 200, json: { accounts: [
      { label: "x", followers: 1, metric: "followers", provider: "apify", field: "followers", delta: null }
    ], credits: {} } }),
  });
  await p.fill("#h-tiktok", "https://www.tiktok.com/@rival");
  await p.click('.plat button[data-p="tiktok"]');
  await p.waitForTimeout(400);
  const url = calls.find(c => c.includes("platform=tiktok")) || "";
  ok("ส่ง platform กับ handle ไปตามที่กรอก", /platform=tiktok/.test(url) && /handle=/.test(url), url);

  // ช่องว่าง = ต้องข้าม ไม่ใช่ยิงไปด้วย handle ว่าง
  calls.length = 0;
  await p.fill("#h-tiktok", "");
  await p.fill("#h-youtube", "");
  await p.fill("#h-x", "abc");
  await p.click("#runall");
  await p.waitForTimeout(700);
  ok("ช่องที่ไม่ได้กรอก ข้ามไปเลย ไม่ยิงเปล่า", calls.length === 1 && calls[0].includes("platform=x"),
     calls.length + " ครั้ง: " + calls.join(" , "));
  ok("และบอกว่าข้ามเพราะอะไร", /ข้ามไป — ยังไม่ได้ใส่ชื่อบัญชี/.test(await textOf(p)));
  await ctx.close();
}

// ── [9] ⚡ บังคับดึงใหม่ ต้องส่ง refresh=1 และเตือนว่าเสียเครดิต ─────────
console.log("\n[9] บังคับดึงใหม่");
{
  const { p, ctx, calls } = await open({
    api: () => ({ status: 200, json: { accounts: [], credits: {} } }),
  });
  await p.click("#runcfg");
  await p.waitForTimeout(300);
  ok("ปกติไม่ส่ง refresh (ใช้ cache · ไม่เสียเครดิต)", !calls[0].includes("refresh"), calls[0]);
  calls.length = 0;
  await p.check("#fresh");
  await p.click("#runcfg");
  await p.waitForTimeout(300);
  ok("ติ๊กแล้วส่ง refresh=1", calls[0].includes("refresh=1"), calls[0]);
  ok("มีคำเตือนว่าเสียเครดิตทุกครั้ง", /เสียเครดิตทุกครั้งที่กด/.test(await textOf(p)));
  await ctx.close();
}

// ── [10] 🔌 ทดสอบฝั่งแชท (MCP) ─────────────────────────────────────────
console.log("\n[10] ปุ่มทดสอบเครื่องมือแชท");
{
  const good = (b) => {
    if (b.method === "initialize") return { status: 200, json: { jsonrpc: "2.0", id: b.id, result: {
      protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "cp-followers", version: "1.0.0" } } } };
    if (b.method === "tools/list") return { status: 200, json: { jsonrpc: "2.0", id: b.id, result: {
      tools: [{ name: "get_followers" }, { name: "list_accounts" }, { name: "get_follower_history" }] } } };
    return { status: 200, json: { jsonrpc: "2.0", id: b.id, result: {
      content: [{ type: "text", text: "บัญชีที่ตั้งไว้:\n▶ เปิดอยู่ · yt-cpfnews · youtube · @CPFNews" }] } } };
  };
  const { p, ctx } = await open({ mcp: good });
  await p.click("#runmcp");
  await p.waitForTimeout(600);
  const t = await textOf(p);
  ok("เชื่อมต่อได้และบอกชื่อเซิร์ฟเวอร์", /cp-followers v1\.0\.0/.test(t), t.slice(0, 250));
  ok("นับเครื่องมือได้ครบ 3 ตัว", /เครื่องมือที่แชทเรียกได้ 3 ตัว/.test(t));
  ok("เรียกเครื่องมือจริงแล้วได้คำตอบ", /yt-cpfnews/.test(t));
  ok("บอก URL ที่ต้องเอาไปใส่เป็น Connector", /\/api\/followers\/mcp\?key=/.test(t));
  ok("สรุปบนหัวเป็นผ่าน", /✅/.test(await p.$eval("#sum", (e) => e.textContent)));
  await ctx.close();

  // ฝั่งแชทพัง = ต้องบอก ไม่ใช่ค้างเงียบ
  const { p: p2, ctx: c2, errs } = await open({
    mcp: () => ({ status: 500, contentType: "text/html", body: "<h1>error</h1>" }),
  });
  await p2.click("#runmcp");
  await p2.waitForTimeout(600);
  ok("MCP พัง → บอกว่าฝั่งแชทใช้ไม่ได้", /ฝั่งแชทใช้ไม่ได้/.test(await textOf(p2)));
  ok("และไม่มี JS error หลุด", errs.length === 0, errs.join(" | "));
  await c2.close();
}

// ── [11] 🔑 ปุ่มคัดลอก — กุญแจต้องไม่ติดไปด้วย ─────────────────────────
console.log("\n[11] คัดลอกผล — ต้องมีของที่ใช้แก้ได้ และห้ามมีกุญแจ");
{
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.route("**/api/followers?*", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ accounts: [{ label: "CPF (TikTok)", followers: null,
      error: "ScrapeCreators: /v1/tiktok/profile → HTTP 404" }], credits: {} }) }));
  const p = await ctx.newPage();
  await p.goto(BASE);
  await p.fill("#key", "SUPER-SECRET-123");
  await p.click("#runcfg");
  await p.waitForTimeout(400);
  await p.click("#copy");
  await p.waitForTimeout(300);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  ok("มีชื่อ endpoint ที่ลองไปแล้วในข้อความที่คัดลอก", clip.includes("/v1/tiktok/profile"), clip.slice(0, 200));
  ok("มีคำว่า FAIL ให้อ่านง่าย", /FAIL/.test(clip));
  ok("🔑 ไม่มีกุญแจติดไปด้วย", !clip.includes("SUPER-SECRET-123"), clip.slice(0, 300));
  ok("ปุ่มเปลี่ยนเป็นบอกว่าคัดลอกแล้ว", /คัดลอกแล้ว/.test(await p.$eval("#copy", (e) => e.textContent)));
  await ctx.close();
}

// ── [12] กฎของหน้าเครื่องมือ + จอแคบ ───────────────────────────────────
console.log("\n[12] กฎของหน้าเครื่องมือ · จอแคบ");
{
  const html = fs.readFileSync("../followers/index.html", "utf8");
  // ⚠️ ห้ามใส่แถบชวนติดตั้ง — จะเด้งทับผลตรวจ (กฎเดียวกับ /selftest/)
  // (คำว่า installprompt โผล่ในคอมเมนต์เตือนได้ — ที่ห้ามคือ "โหลดไฟล์นั้นจริง")
  ok("ไม่มีแถบชวนติดตั้งในหน้าเครื่องมือ",
     !/<(script|link)[^>]*installprompt\.(js|css)/.test(html));
  ok("กัน Google ไม่ให้เก็บหน้านี้", /name="robots" content="noindex"/.test(html));
  ok("มีปุ่มกลับหน้าหลัก", /href="\/">🏠/.test(html));
  // ⚠️ ไม่มีการ์ดบน landing โดยตั้งใจ — เป็นเครื่องมือ ไม่ใช่แดชบอร์ด
  ok("ไม่มีการ์ดบนหน้าแรก (ตั้งใจ)", !/followers\//.test(fs.readFileSync("../index.html", "utf8")));

  const { p, ctx } = await open({ viewport: { width: 390, height: 780 },
    api: () => ({ status: 200, json: { accounts: [], credits: {} } }) });
  const m = await p.evaluate(() => ({
    scroll: document.scrollingElement.scrollWidth, win: innerWidth,
    key: document.getElementById("key").getBoundingClientRect().width,
  }));
  ok("จอแคบไม่ล้นออกด้านข้าง", m.scroll <= m.win + 1, `scroll ${m.scroll} · จอ ${m.win}`);
  ok("ช่องกุญแจกว้างพอให้พิมพ์", m.key > 200, String(Math.round(m.key)));
  const btn = await p.evaluate(() => {
    const b = document.querySelector('.plat button[data-p="tiktok"]').getBoundingClientRect();
    const i = document.getElementById("h-tiktok").getBoundingClientRect();
    return { overlap: b.left < i.right && b.top < i.bottom && b.bottom > i.top, inp: i.width };
  });
  ok("ปุ่ม ▶ ไม่ทับช่องพิมพ์บนจอแคบ", !btn.overlap, JSON.stringify(btn));
  await ctx.close();
}

await browser.close();
console.log(`\nผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
