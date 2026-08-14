// กด ⚑ ที่แดชบอร์ดไหน ข่าวใบนั้นต้องหายจาก "ทุก" แดชบอร์ด
// (เจ้าของแจ้ง 13 ส.ค. 2026: หน้า AQI ของ iqair ตัดที่หนึ่งแล้วยังอยู่อีกที่)
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const LIB = "../functions/api/_lib/noise.js";
const { noiseReason, setAllowed, setBlocked, isBlocked, DATAPAGE_HOSTS } = await import(LIB);
const { allowKey, readDecisions, onRequest } = await import("../functions/api/allow.js");

const item = { link: "https://www.iqair.com/th/usa/california/bieber", title: "Bieber ดัชนีคุณภาพอากาศ (AQI) และ USA มลพิษทางอากาศ | IQAir ประเทศไทย", snippet: "PM2.5" };
const why = (it, src = "alert2") => noiseReason(it, String(it.title).toLowerCase(), src);

console.log("\n[1] หน้าข้อมูลค่าฝุ่นรายเมือง ไม่ใช่ข่าว — ตัดด้วยโดเมน");
setAllowed({}); setBlocked({});
ok("iqair โดนตัดทุกคอลัมน์", why(item) === "datapage", String(why(item)));
ok("ตัดที่ alert1 ด้วย", why(item, "alert1") === "datapage", String(why(item, "alert1")));
ok("ข่าว PM2.5 จากสำนักข่าวจริงไม่โดนตัดไปด้วย",
   why({ link: "https://www.thairath.co.th/news/1", title: "ค่าฝุ่น PM2.5 กรุงเทพวันนี้พุ่ง", snippet: "" }) === null);

console.log("\n[2] กด ⚑ = ตัดทุกแดชบอร์ด (ไม่ผูกกับคอลัมน์/แดชบอร์ดที่กด)");
const other = { link: "https://www.example.com/news/9", title: "ข่าวธรรมดาที่เจ้าของไม่อยากเห็น", snippet: "" };
setBlocked({});
ok("ก่อนกด — ไม่โดนตัด", why(other) === null, String(why(other)));
setBlocked({ [allowKey(other.link)]: { link: other.link } });
ok("หลังกด — คอลัมน์ alert2 ตัด", why(other) === "by-owner", String(why(other)));
ok("หลังกด — คอลัมน์ alert1 ก็ตัด", why(other, "alert1") === "by-owner", String(why(other, "alert1")));
ok("ลิงก์พ่วง ?utm ก็นับเป็นใบเดียวกัน",
   why({ ...other, link: other.link + "?utm_source=x" }) === "by-owner");
ok("ข่าวอื่นไม่โดนหางเลข", why({ link: "https://www.example.com/news/10", title: "อีกข่าว", snippet: "" }) === null);

console.log("\n[3] ↩ เอากลับ ต้องชนะคำสั่งตัด");
setAllowed({ [allowKey(other.link)]: { link: other.link } });
ok("กดเอากลับแล้วไม่โดนตัด", why(other) === null, String(why(other)));
setAllowed({});

console.log("\n[4] ที่เก็บ — allow กับ block อยู่ blob เดียว อ่าน KV ครั้งเดียว");
{
  let store = {}, writes = 0;
  const env = { FLAGS_KV: {
    get: async (k) => store[k] ?? null,
    put: async (k, v) => { writes++; store[k] = v; },
  } };
  const post = (body) => onRequest({ request: new Request("https://x/api/allow", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env });

  let r = await (await post({ mode: "block", link: item.link, title: item.title, on: true })).json();
  ok("บันทึกคำสั่งตัดสำเร็จ", r.ok === true && r.mode === "block", JSON.stringify(r));
  ok("เขียน KV ครั้งเดียวต่อการกด 1 ครั้ง", writes === 1, String(writes));
  let d = await readDecisions(env);
  ok("อ่านครั้งเดียวได้ทั้งสองรายการ", Object.keys(d.blocked).length === 1 && Object.keys(d.allowed).length === 0);
  ok("เก็บใน blob เดียว ไม่แตก key ใหม่", Object.keys(store).length === 1, JSON.stringify(Object.keys(store)));

  // กด ↩ เอากลับ ต้องถอดออกจากรายการสั่งตัด — อยู่สองฝั่งพร้อมกันไม่ได้
  await post({ link: item.link, title: item.title, on: true });
  d = await readDecisions(env);
  ok("กดเอากลับแล้วหลุดจากรายการสั่งตัด", Object.keys(d.blocked).length === 0, JSON.stringify(d.blocked));
  ok("และเข้าไปอยู่ในรายการเอากลับแทน", Object.keys(d.allowed).length === 1);

  // กดสั่งตัดอีกครั้ง ต้องหลุดจากรายการเอากลับ
  await post({ mode: "block", link: item.link, on: true });
  d = await readDecisions(env);
  ok("สั่งตัดอีกครั้ง หลุดจากรายการเอากลับ", Object.keys(d.allowed).length === 0 && Object.keys(d.blocked).length === 1);

  // ยกเลิกคำสั่งตัด
  await post({ mode: "block", link: item.link, on: false });
  d = await readDecisions(env);
  ok("ยกเลิกคำสั่งตัดได้", Object.keys(d.blocked).length === 0);

  // blob รุ่นเก่าที่มีแต่ items ต้องอ่านได้เหมือนเดิม
  store["noise:allow"] = JSON.stringify({ items: { "a.com/x": { link: "https://a.com/x" } } });
  d = await readDecisions(env);
  ok("blob รุ่นเก่า (มีแต่ items) ยังอ่านได้", Object.keys(d.allowed).length === 1 && Object.keys(d.blocked).length === 0);
}

console.log("\n[5] ฝั่งหน้าเว็บ — ปุ่ม ⚑ ต้องยิงคำสั่งไปที่ส่วนกลาง");
{
  const src = fs.readFileSync(new URL("../flags.js", import.meta.url), "utf8");
  ok("กด ⚑ แล้วส่งคำสั่งตัด", /pushCut\(rec, true\)/.test(src));
  ok("กดเลิก/เอากลับ แล้วยกเลิกคำสั่งตัด", (src.match(/pushCut\(\{ link \}, false\)/g) || []).length >= 2);
  ok('ยิงด้วย mode "block"', /mode: "block"/.test(src));
  ok("ยิงไปที่ /api/allow", /fetch\("\/api\/allow"/.test(src));
  ok("บอกผู้ใช้ว่าตัดทุกแดชบอร์ด", /ตัดออกทุกแดชบอร์ดแล้ว/.test(src));
}

console.log("\n[6] แดชบอร์ดทุกตัวต้องโหลดคำสั่งตัดตอน build");
for (const [name, f] of [["trend", "../functions/api/trend/feeds.js"], ["ir", "../functions/api/ir/feeds.js"]]) {
  const src = fs.readFileSync(f, "utf8");
  ok(`${name}: อ่านทั้งสองรายการด้วย readDecisions`, /readDecisions\(env\)/.test(src));
  ok(`${name}: ตั้งค่า setBlocked ใหม่ทุก build`, /setBlocked\(d\.blocked\)/.test(src));
  ok(`${name}: ล้มก็ต้องล้างของเก่า`, /catch \{ setAllowed\(\{\}\); setBlocked\(\{\}\); \}/.test(src));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
