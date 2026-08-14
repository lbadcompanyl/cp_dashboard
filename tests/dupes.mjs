// ข่าวซ้ำในชีต + พาดหัวถูกตัดสั้น — ต้นเหตุเดียวกันคือฟีดข่าวของ Bing
//   1. ลิงก์ Bing มี tid= ที่เปลี่ยนทุกรอบ → คลังข่าวมองเป็นข่าวคนละใบ → ซ้ำ 27 แถว
//   2. Bing ส่งพาดหัวมาแบบตัดท้ายด้วย "…" → ต้องไปอ่านพาดหัวเต็มจากหน้าข่าวจริง
import fs from "node:fs";
// ตัวกรองย้ายไป functions/api/_lib/noise.js แล้ว — หาในไฟล์ feeds.js ไม่เจอให้ไปหาต่อในไลบรารี
const LIB_SRC = fs.readFileSync(new URL("../functions/api/_lib/noise.js", import.meta.url), "utf8").replace(/^export /gm, "");
import vm from "node:vm";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const ROOT = new URL("../", import.meta.url).pathname; // รากของโปรเจกต์ (เทสต์อยู่ใน tests/)
const { unwrapRedirect, parseGeneric } = await import(ROOT + "functions/api/trend/_lib/parser.js");

const REAL = "https://www.dailynews.co.th/news/5252525/";
const bing = (tid) =>
  "https://www.bing.com/news/apiclick.aspx?ref=FexRss&aid=&tid=" + tid +
  "&url=" + encodeURIComponent(REAL) + "&c=&mkt=th-th";

console.log("\n[1] แกะลิงก์ตัวเปลี่ยนทาง");
ok("Bing → ลิงก์ข่าวจริง", unwrapRedirect(bing("AAA")) === REAL, unwrapRedirect(bing("AAA")));
ok("tid ต่างกันก็ได้ลิงก์เดียวกัน", unwrapRedirect(bing("AAA")) === unwrapRedirect(bing("ZZZ")));
ok("Google Alert ยังแกะได้เหมือนเดิม",
  unwrapRedirect("https://www.google.com/url?rct=j&url=" + encodeURIComponent(REAL) + "&ct=ga") === REAL);
// เว็บข่าวที่บังเอิญมีพารามิเตอร์ชื่อ url= ของตัวเอง ห้ามโดนแกะ
const own = "https://www.matichon.co.th/share?url=" + encodeURIComponent("https://evil.example/x");
ok("เว็บข่าวทั่วไปไม่โดนแกะ", unwrapRedirect(own) === own);
ok("ลิงก์ว่าง/พังไม่ทำให้ล้ม", unwrapRedirect("") === "" && unwrapRedirect("ไม่ใช่ url") === "ไม่ใช่ url");
ok("ค่า url= ที่ไม่ใช่ http ไม่เอา",
  unwrapRedirect("https://www.bing.com/news/apiclick.aspx?url=javascript%3Aalert(1)").includes("bing.com"));

console.log("\n[2] คอลัมน์ข่าว (ไม่ใช่แค่ alert) ต้องถูกแกะด้วย — ต้นเหตุที่ซ้ำ");
const rss = (tid, title) => `<rss><channel>
  <item><title>${title}</title><link>${bing(tid)}</link>
  <pubDate>Thu, 07 Aug 2026 02:21:00 GMT</pubDate><description>สรุปข่าว</description></item>
</channel></rss>`;
const a = parseGeneric(rss("AAA", "ข่าวหนึ่ง"), "news")[0];
const b = parseGeneric(rss("ZZZ", "ข่าวหนึ่ง"), "news")[0];
ok("source=news ก็แกะลิงก์", a.link === REAL, a.link);
ok("ดึงคนละรอบได้ลิงก์ตรงกัน", a.link === b.link);
ok("id เท่ากัน = คลังข่าวยุบเป็นใบเดียว", a.id === b.id, a.id + " / " + b.id);

console.log("\n[3] เติมพาดหัวที่ถูกตัดสั้น");
const fsrc = fs.readFileSync(ROOT + "functions/api/trend/feeds.js", "utf8");
const grab = (re, n) => { const m = fsrc.match(re) || LIB_SRC.match(re); if (!m) throw new Error("หา " + n + " ไม่เจอ"); return m[0]; };
const mod = await import("data:text/javascript;charset=utf-8," + encodeURIComponent([
  grab(/^const CLIPPED_RE = .*$/m, "CLIPPED_RE"),
  grab(/^const stripMarks = .*$/m, "stripMarks"),
  grab(/^const CLIP_LEN = .*$/m, "CLIP_LEN"),
  grab(/^function looksClipped\(title\) \{[\s\S]*?^\}$/m, "looksClipped"),
  grab(/^function trimSiteSuffix\(full, head\) \{[\s\S]*?^\}$/m, "trimSiteSuffix"),
  grab(/^function decodeEntities\(s\) \{[\s\S]*?^\}$/m, "decodeEntities"),
  grab(/^function headlineFromHtml\(html\) \{[\s\S]*?^\}$/m, "headlineFromHtml"),
  "export { CLIPPED_RE, looksClipped, trimSiteSuffix, headlineFromHtml, decodeEntities };",
].join("\n")));

const CLIPPED = "เปลี่ยนเชื้อไฟเป็นพลังงาน ชุมชนลำพูนผนึก CPF–แม่โจ้ จัดการชั่ว …";
ok("รู้ว่าพาดหัวถูกตัด", mod.CLIPPED_RE.test(CLIPPED));
// ⚠️ บางฟีดตัดโดยไม่ใส่ … เลย — เจอจริงในชีต จบห้วนๆ กลางประโยค
const NOMARK = "กมธ.เตรียมชงรัฐบาลปฏิรูปกลไกจัดการไฟป่า-ฝุ่น PM 2.5 ทั้งประเทศ ดันกระทรวง อว.เป็นกลไกหลักด้าน";
ok("จับพาดหัวที่ตัดโดยไม่มี … ได้", mod.looksClipped(NOMARK), String(NOMARK.length));
ok("พาดหัวสั้นปกติ ไม่ถูกสงสัย", !mod.looksClipped("ซีพีเอฟ แจ้งผลประกอบการไตรมาส 2"));
ok("ยาวแต่จบด้วยเครื่องหมายจบประโยค ไม่ถูกสงสัย",
  !mod.looksClipped("นักวิชาการชี้ปัญหาฝุ่น PM2.5 ในภาคเหนือยังไม่ดีขึ้น แม้ผ่านมาแล้วหลายปีเต็ม ทั้งที่มีงบประมาณ."));
ok("พาดหัวว่าง ไม่ถูกสงสัย", !mod.looksClipped(""));
ok("ตัดชื่อเว็บท้ายพาดหัว", mod.trimSiteSuffix("พาดหัวข่าวยาวพอสมควรที่นี่ - INN News", "พาดหัวข่าวยาว") === "พาดหัวข่าวยาวพอสมควรที่นี่");
ok("ตัดชื่อเว็บที่คั่นด้วย |", mod.trimSiteSuffix("พาดหัวข่าวยาวพอสมควรที่นี่ | เดลินิวส์", "พาดหัวข่าวยาว") === "พาดหัวข่าวยาวพอสมควรที่นี่");
ok("ขีดกลางที่เป็นส่วนหนึ่งของพาดหัว ไม่โดนตัด",
  mod.trimSiteSuffix("ไฟป่า-ฝุ่นควันภาคเหนือ วิกฤตหนักสุดในรอบสิบปี ชาวบ้านเดือดร้อนหนัก", "ไฟป่า-ฝุ่นควัน")
    === "ไฟป่า-ฝุ่นควันภาคเหนือ วิกฤตหนักสุดในรอบสิบปี ชาวบ้านเดือดร้อนหนัก");
ok("พาดหัวปกติไม่ถูกมองว่าถูกตัด", !mod.CLIPPED_RE.test("ซีพีเอฟ แจ้งผลประกอบการไตรมาส 2"));
ok("จุดไข่ปลาแบบ ... ก็จับได้", mod.CLIPPED_RE.test("ข่าวหนึ่ง ..."));
const FULL = "เปลี่ยนเชื้อไฟเป็นพลังงาน ชุมชนลำพูนผนึก CPF–แม่โจ้ จัดการชั่วโมงวิกฤตหมอกควัน";
ok("อ่าน og:title ได้", mod.headlineFromHtml(
  `<html><head><meta property="og:title" content="${FULL}"><title>เดลินิวส์</title></head></html>`) === FULL);
ok("สลับลำดับ attribute ก็อ่านได้", mod.headlineFromHtml(
  `<meta content="${FULL}" property="og:title">`) === FULL);
ok("ไม่มี og ก็ถอย h1", mod.headlineFromHtml(`<h1 class="t">${FULL}</h1>`) === FULL);
ok("ถอย <title> เป็นทางสุดท้าย", mod.headlineFromHtml(`<title>${FULL}</title>`) === FULL);
ok("แปลง &amp; กลับเป็น &", mod.headlineFromHtml('<title>A &amp; B</title>') === "A & B");
ok("ไม่มีอะไรเลย ได้ค่าว่าง", mod.headlineFromHtml("<html></html>") === "");

// กฎกันเขียนทับผิด: ต้องยาวกว่าเดิม ไม่ถูกตัด และขึ้นต้นเหมือนกัน
const accept = (bare, full) => {
  if (!full || mod.CLIPPED_RE.test(full) || full.length <= bare.length) return false;
  const head = bare.replace(mod.CLIPPED_RE, "").trim().slice(0, 12);
  return !(head && !full.includes(head));
};
ok("รับพาดหัวเต็มที่ตรงกัน", accept(CLIPPED, FULL));
ok("ไม่รับชื่อเว็บที่ไม่ใช่พาดหัว", !accept(CLIPPED, "เดลินิวส์ - อ่านข่าวออนไลน์ ข่าวด่วนทันเหตุการณ์ทุกวัน"));
ok("ไม่รับของที่ยังถูกตัดอยู่", !accept(CLIPPED, CLIPPED + "โมงวิกฤต …"));
ok("ไม่รับของที่สั้นกว่าเดิม", !accept(CLIPPED, "CPF"));

console.log("\n[4] คลังข่าวต้องยุบซ้ำด้วย normLink หลังแกะแล้ว");
ok("mergeArchives แกะลิงก์ก่อน dedupe", /it\.link = unwrapRedirect\(it\.link\)/.test(fsrc));
ok("ใช้ normLink เป็น key", /byLink\.set\(normLink\(it\.link\), it\)/.test(fsrc));
ok("ยิงเน็ตเฉพาะตอนทำงานเบื้องหลัง", /fillClippedTitles\(cache, sources, archiveOut, titles, allowVerify\)/.test(fsrc));
ok("จำกัดจำนวนที่ยิงต่อรอบ", /TITLE_FETCH_MAX = \d+/.test(fsrc));
// ธง tfix — ถ้าไม่มี ข่าวที่เช็คแล้วว่าถูกอยู่แล้วจะกินคิว 20 ใบทุกรอบ ของที่ขาดจริงไม่ได้คิว
ok("ติดธงว่าเช็คแล้ว กันเช็คซ้ำทุกรอบ", /it\.tfix = 1/.test(fsrc) && /!it\.tfix && looksClipped/.test(fsrc));

// ⚠️ ลำดับสำคัญมาก — เคยพลาดมาแล้ว: เติมพาดหัวก่อน merge แปลว่าแตะได้แต่ของสด
// พาดหัวเก่าที่ค้างใน KV จึงขาดอยู่ตลอด ผู้ใช้เห็นว่า "ยังมาไม่ครบ" หลัง release
const iMerge = fsrc.indexOf("mergeArchives(env, sources, archive)");
const iFill = fsrc.indexOf("fillClippedTitles(cache, sources, archiveOut");
const iSave = fsrc.indexOf("saveArchives(env, archiveOut, archive)");
ok("merge → เติมพาดหัว → ค่อยเขียน KV", iMerge > 0 && iMerge < iFill && iFill < iSave,
  `merge=${iMerge} fill=${iFill} save=${iSave}`);
ok("เติมพาดหัวเห็นของเก่าในคลังด้วย ไม่ใช่แค่ของสด", /archived \? \["alert1", "alert2"\]/.test(fsrc));
ok("mergeArchives ไม่เขียน KV เองแล้ว", !/^async function mergeArchives[\s\S]*?kv\.put/m.test(
  fsrc.slice(fsrc.indexOf("async function mergeArchives"), fsrc.indexOf("async function saveArchives"))));
// กฎ KV: เขียนได้ครั้งเดียวต่อ request — โควตาแผนฟรี 1,000 ครั้ง/วันใช้ร่วมทั้งโปรเจกต์
ok("คลังข่าวยังเขียน KV ครั้งเดียวต่อ request", (fsrc.match(/kv\.put\(envPrefix\(env\) \+ ARCHIVE_KEY/g) || []).length === 1);
// แค่เช็คว่า "ไม่ต่ำกว่าตอนที่เขียนเทสต์นี้" — ปักเลขตายตัวแล้วเทสต์ตกทุกครั้งที่ bump
ok("bump CACHE_VER แล้ว", (+(fsrc.match(/const CACHE_VER = "(\d+)"/) || [])[1] || 0) >= 55,
   (fsrc.match(/const CACHE_VER = "(\d+)"/) || [])[1]);

console.log("\n[5] ฝั่งชีต — กันซ้ำในรอบเดียวกัน + ล้างของเก่า");
const gs = fs.readFileSync(ROOT + "sheet/news-to-sheet.gs", "utf8");
const ctx = { SpreadsheetApp: {}, UrlFetchApp: {}, console };
vm.createContext(ctx);
vm.runInContext(gs, ctx);

ok("ลิงก์ Bing 2 อันของข่าวเดียวกัน ได้กุญแจเดียวกัน",
  ctx.normLink_(bing("AAA")) === ctx.normLink_(bing("ZZZ")));
ok("สำนักข่าว+พาดหัวเดียวกัน = กุญแจเดียวกัน",
  ctx.dupKey_("เดลินิวส์", CLIPPED) === ctx.dupKey_("เดลินิวส์", CLIPPED));
ok("พาดหัวตัวเต็มกับตัวที่ถูกตัด ยังนับเป็นใบเดียวกัน",
  ctx.dupKey_("เดลินิวส์", CLIPPED) === ctx.dupKey_("เดลินิวส์", CLIPPED.replace(/ …$/, "")));
ok("คนละสำนักข่าว = คนละกุญแจ",
  ctx.dupKey_("เดลินิวส์", CLIPPED) !== ctx.dupKey_("ผู้จัดการ", CLIPPED));
ok("พาดหัวว่าง ไม่คืนกุญแจ", ctx.dupKey_("เดลินิวส์", "  ") === "");

// จำลอง syncNews: ข่าวใบเดียวกันมา 27 ใบในรอบเดียว ต้องเขียนแค่แถวเดียว
const dupBatch = Array.from({ length: 27 }, (_, i) => ({
  outlet: "เดลินิวส์", title: CLIPPED, link: bing("T" + i),
  date: "2026-08-07 02:21", topic: "CPF", publishedAt: "2026-08-07T02:21:00Z",
}));
dupBatch.push({ outlet: "ryt9.com", title: "ข่าวอื่น", link: "https://ryt9.com/s/prg/1",
  date: "2026-08-07 06:57", topic: "PM2.5", publishedAt: "2026-08-07T06:57:00Z" });

const written = [];
ctx.SpreadsheetApp.getActiveSpreadsheet = () => ({ toast: () => {} });
ctx.getSheet_ = () => ({
  getLastRow: () => 1,
  insertRowsBefore: () => {},
  getRange: () => ({ setValues: (v) => { written.push(...v); return { setFontWeight: () => {} }; }, getValues: () => [] }),
});
ctx.UrlFetchApp.fetch = () => ({
  getResponseCode: () => 200,
  getContentText: () => JSON.stringify({ rows: dupBatch }),
});
ctx.syncNews();
ok("28 ใบเข้ามา เขียนลงชีต 2 แถว", written.length === 2, "ได้ " + written.length + " แถว");
// ⚠️ ไม่ผูกกับลำดับ — ตั้งแต่ 13 ส.ค. 2026 ข่าวใหม่ถูกแทรกบนสุด แถวแรกจึงเป็นใบใหม่สุด
ok("เก็บไว้ 1 ใบจาก 28 ใบที่ซ้ำกัน ไม่ใช่ทิ้งหมด",
   written.filter((r) => r[0] === "เดลินิวส์").length === 1, JSON.stringify(written.map((r) => r[0])));
ok("ข่าวอื่นไม่โดนลบไปด้วย", written.some((r) => r[0] === "ryt9.com"));

// cleanupDupes: ลบของเก่าที่ค้างอยู่แล้ว เก็บแถวบนสุดไว้
const sheetRows = [
  ["เดลินิวส์", CLIPPED, bing("A"), "2026-08-07 02:21", "CPF"],
  ["เดลินิวส์", CLIPPED, bing("B"), "2026-08-07 02:21", "CPF"],
  ["เดลินิวส์", CLIPPED, bing("C"), "2026-08-07 02:21", "CPF"],
  ["ryt9.com", "ข่าวอื่น", "https://ryt9.com/s/prg/1", "2026-08-07 06:57", "PM2.5"],
];
const deleted = [];
ctx.getSheet_ = () => ({
  getLastRow: () => sheetRows.length + 1,
  getRange: () => ({ getValues: () => sheetRows.map((r) => r.slice(0, 3)) }),
  deleteRow: (n) => deleted.push(n),
});
ctx.cleanupDupes();
ok("ลบซ้ำ 2 แถว", deleted.length === 2, JSON.stringify(deleted));
ok("ลบจากล่างขึ้นบน (ไม่งั้นลบผิดแถว)", deleted.join() === "4,3", deleted.join());
ok("ไม่ลบแถวแรกของข่าวนั้น และไม่แตะข่าวอื่น", !deleted.includes(2) && !deleted.includes(5));

console.log("\n" + (fail ? "❌" : "✅") + " ผ่าน " + pass + " · ตก " + fail + "\n");
process.exit(fail ? 1 : 0);
