// /api/allow — จำข่าวที่เจ้าของกด "↩ เอากลับ" แล้วต้องไม่โดนตัดอีก
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const mod = await import("../functions/api/allow.js");
const mkKV = (init = {}) => {
  const store = { ...init };
  let writes = 0;
  return { store, writes: () => writes, get: async (k) => store[k] ?? null, put: async (k, v) => { writes++; store[k] = v; } };
};
const post = (body) => new Request("https://x/api/allow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

console.log("\n[1] กุญแจของลิงก์ — ต้องเทียบแบบเดียวกับที่คลังข่าวใช้");
ok("ตัด www + query + / ท้าย",
  mod.allowKey("https://www.thairath.co.th/news/1/?utm_source=x") === "thairath.co.th/news/1",
  mod.allowKey("https://www.thairath.co.th/news/1/?utm_source=x"));
ok("ลิงก์เดียวกันคนละพารามิเตอร์ = กุญแจเดียวกัน",
  mod.allowKey("https://thairath.co.th/news/1") === mod.allowKey("https://www.thairath.co.th/news/1?a=2"));
ok("คนละข่าว = คนละกุญแจ", mod.allowKey("https://a.com/1") !== mod.allowKey("https://a.com/2"));

console.log("\n[2] กดคืน แล้วจำได้");
{
  const kv = mkKV();
  const res = await mod.onRequest({ request: post({ link: "https://www.thairath.co.th/news/1", title: "ข่าวจริง", why: "pr" }), env: { FLAGS_KV: kv } });
  const j = await res.json();
  ok("ตอบ ok", j.ok === true, JSON.stringify(j));
  ok("เขียน KV ครั้งเดียว", kv.writes() === 1, "เขียน " + kv.writes() + " ครั้ง");
  const saved = await mod.readAllow({ FLAGS_KV: kv });
  ok("จำลิงก์ไว้แล้ว", !!saved["thairath.co.th/news/1"], JSON.stringify(Object.keys(saved)));
  ok("เก็บพาดหัว + เหตุผลไว้ด้วย", saved["thairath.co.th/news/1"].title === "ข่าวจริง" && saved["thairath.co.th/news/1"].why === "pr");
}

console.log("\n[3] สั่งยกเลิกได้");
{
  const kv = mkKV();
  const env = { FLAGS_KV: kv };
  await mod.onRequest({ request: post({ link: "https://a.com/1" }), env });
  await mod.onRequest({ request: post({ link: "https://a.com/1", on: false }), env });
  ok("ลบออกแล้ว", Object.keys(await mod.readAllow(env)).length === 0);
}

console.log("\n[4] ของพัง ต้องไม่ล้ม");
{
  const kv = mkKV();
  ok("ไม่มี link → 400", (await mod.onRequest({ request: post({}), env: { FLAGS_KV: kv } })).status === 400);
  ok("ไม่ได้ผูก KV → 503", (await mod.onRequest({ request: post({ link: "https://a.com/1" }), env: {} })).status === 503);
  ok("GET คืนรายการได้", (await (await mod.onRequest({ request: new Request("https://x/api/allow"), env: { FLAGS_KV: kv } })).json()).count === 0);
  const bad = mkKV({ "noise:allow": "ไม่ใช่ json" });
  ok("KV พัง → คืนว่าง ไม่ throw", Object.keys(await mod.readAllow({ FLAGS_KV: bad })).length === 0);
}

console.log("\n[5] ฝั่ง feeds — ข่าวที่สั่งคืนต้องรอดทุกด่าน");
for (const [tag, file] of [["trend", "../functions/api/trend/feeds.js"], ["ir", "../functions/api/ir/feeds.js"]]) {
  const src = fs.readFileSync(file, "utf8");
  console.log("  -- " + tag + " --");
  // ⚠️ รายชื่อ "เอากลับ" ย้ายไปอยู่ใน _lib/noise.js ชุดเดียวแล้ว (13 ส.ค. 2026)
  // แดชบอร์ดมีหน้าที่แค่ "ตั้งค่าใหม่ทุกครั้งที่ build" เท่านั้น
  // ทั้ง "เอากลับ" และ "สั่งตัด" อ่านมาด้วย KV ครั้งเดียว (readDecisions)
  ok("โหลดรายชื่อตอนเริ่ม build", /readDecisions\(env\)[\s\S]{0,80}setAllowed\(d\.allowed\)/.test(src));
  ok("ล้มก็ต้องล้างของเก่า ไม่ค้างข้าม request", /catch \{ setAllowed\(\{\}\); setBlocked\(\{\}\); \}/.test(src));
  ok("ด่านตรวจ related-block ปล่อยผ่าน", /if \(isAllowed\(it\)\) return \{ ok: true, mark: true \};/.test(src));
  ok("import isAllowed จากไลบรารีกลาง", /isAllowed[\s\S]{0,400}from "\.\.\/_lib\/noise\.js"/.test(src));
}

console.log("\n[5b] ไลบรารีกลาง — ตัวจริงที่เก็บรายชื่อและใช้ตัดสิน");
{
  const lib = fs.readFileSync(new URL("../functions/api/_lib/noise.js", import.meta.url), "utf8");
  ok("มี setAllowed ให้แดชบอร์ดเรียก", /export function setAllowed/.test(lib));
  ok("noiseReason ปล่อยผ่านข่าวที่เอากลับ", /if \(isAllowed\(it\)\) return null;/.test(lib));
  ok("เทียบด้วย allowKey ตัวเดียวกับ /api/allow", /ALLOWED\[allowKey\(it\.link\)\]/.test(lib));
}

console.log("\n[6] กันไม่ให้ blob โตไม่มีที่สิ้นสุด");
ok("มีเพดานจำนวนรายการ", /const MAX = \d+/.test(fs.readFileSync(new URL("../functions/api/allow.js", import.meta.url), "utf8")));

console.log("\n" + (fail ? "❌" : "✅") + " ผ่าน " + pass + " · ตก " + fail + "\n");
process.exit(fail ? 1 : 0);
