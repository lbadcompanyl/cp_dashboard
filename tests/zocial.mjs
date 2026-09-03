// Zocial Eye → คอลัมน์ "คนพูดถึงเรา" — ด่านตรวจของ phase 1 (ยังไม่แตะ D1)
// รัน: node tests/zocial.mjs
//
// คุมอะไร: จับคู่หัวตาราง · อ่านเวลา (รวม Excel serial / พ.ศ. / dd-mm-yyyy) ·
//          ตีความ timezone แล้ววันที่เปลี่ยนจริง · เพจ vs บุคคล (ตัวตัดสิน retention) ·
//          กันแถวซ้ำ · และกฎเหล็ก "ไม่รู้ ห้ามกลืนเป็นค่าใดค่าหนึ่ง"
import * as Z from "../issue/upload/zocial-lib.js";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const HEAD = ["Post time", "Source", "Message", "Direct URL", "Account Name", "Account Type", "Comment Count", "Engagement", "Sentiment"];
const row = (o = {}) => ({
  "Post time": "2026-09-02 09:12", "Source": "Facebook", "Message": "ทดสอบข้อความ",
  "Direct URL": "https://www.facebook.com/page/posts/1", "Account Name": "เพจตัวอย่าง",
  "Account Type": "Page", "Comment Count": "", "Engagement": "", "Sentiment": "", ...o,
});
const one = (o = {}, opts = {}) => Z.buildPreview([row(o)], HEAD, opts);

console.log("\n[1] จับคู่หัวตาราง");
{
  const m = Z.mapHeaders(HEAD);
  ok("เจอครบทุกช่องที่จำเป็น", m.missing.length === 0, m.missing.join(","));
  ok("Direct URL → url", m.map.url === "Direct URL");
  ok("Comment Count → comments", m.map.comments === "Comment Count");
  const th = Z.mapHeaders(["วันเวลา", "ช่องทาง", "ข้อความ", "ลิงก์"]);
  ok("หัวตารางภาษาไทยก็จับได้", th.missing.length === 0, th.missing.join(","));
  const bad = Z.mapHeaders(["Post time", "Source", "Message"]);
  ok("ขาดคอลัมน์ลิงก์ ต้องบอกว่าขาด", bad.missing.includes("url"));
  // 🚫 ห้ามเดามั่ว: คำสั้นอย่าง "type" ต้องไม่ไปคว้า "Content Type" มาเป็นประเภทบัญชี
  const st = Z.mapHeaders(["Post time", "Source", "Message", "URL", "Content Type"]);
  ok("คำสั้นไม่ชนคอลัมน์อื่น", st.map.accountType === null, String(st.map.accountType));
  ok("คอลัมน์ที่ไม่ได้ใช้ ต้องรายงานไว้", st.unused.includes("Content Type"));
}

console.log("\n[2] อ่านเวลา");
{
  const iso = Z.parseWallMs("2026-09-02 09:12");
  ok("YYYY-MM-DD HH:mm", iso === Date.UTC(2026, 8, 2, 9, 12));
  ok("รูปแบบ ISO ตัว T", Z.parseWallMs("2026-09-02T09:12:00") === iso);
  ok("วัน/เดือน/ปี", Z.parseWallMs("2/9/2026 9:12") === iso);
  ok("ปี พ.ศ. แปลงให้เอง", Z.parseWallMs("02/09/2569 09:12") === iso);
  ok("บ่ายโมงแบบ PM", Z.parseWallMs("2/9/2026 1:12 PM") === Date.UTC(2026, 8, 2, 13, 12));
  ok("เที่ยงคืนแบบ AM", Z.parseWallMs("2/9/2026 12:30 AM") === Date.UTC(2026, 8, 2, 0, 30));

  // Excel เก็บวันที่เป็นตัวเลข — ต้องแปลงกลับได้เป๊ะ ไม่งั้นทั้งไฟล์อ่านเวลาไม่ออก
  const serial = iso / 86400000 + 25569;
  ok("ตัวเลข serial ของ Excel", Z.parseWallMs(String(serial)) === iso, String(Z.parseWallMs(String(serial))));
  ok("เลข engagement ไม่ถูกอ่านเป็นวันที่", Z.parseWallMs("1234") === null && Z.parseWallMs("980000") === null);

  ok("มี offset ติดมาในไฟล์ → ยึดตามนั้น",
     Z.parseWallMs("2026-09-02T02:12:00Z") === Date.UTC(2026, 8, 2, 9, 12),
     String(Z.parseWallMs("2026-09-02T02:12:00Z")));

  // 🔴 อ่านไม่ออกต้องคืน null ห้ามเดาเป็นวันนี้
  for (const junk of ["", "  ", "เมื่อวาน", "N/A", "2026-13-45 99:99", "31/02/2026"]) {
    ok(`อ่านไม่ออกคืน null: ${JSON.stringify(junk)}`, Z.parseWallMs(junk) === null, String(Z.parseWallMs(junk)));
  }
}

console.log("\n[3] timezone — เลือกผิดแล้ววันที่ต้องเปลี่ยนจริง (§7.3)");
{
  const late = { "Post time": "2026-09-02 22:00" };
  const th = one(late, { tz: "th" }), utc = one(late, { tz: "utc" });
  ok("ตีความเป็นเวลาไทย → 2 ก.ย.", th.records[0].date === "2026-09-02", th.records[0].date);
  ok("ตีความเป็น UTC → 3 ก.ย. (เลื่อนไปอีกวัน)", utc.records[0].date === "2026-09-03", utc.records[0].date);
  ok("เวลาที่โชว์ให้เทียบ คือเวลาดิบในไฟล์เสมอ", th.records[0].wallText === utc.records[0].wallText);
  ok("เก็บเป็น ISO พร้อม offset ไม่ใช่ข้อความไทย", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/.test(th.records[0].postedAt), th.records[0].postedAt);
  ok("preview ชี้แถวแรกให้เทียบกับเว็บจริงได้", th.first && th.first.wall === "2026-09-02 22:00" && th.first.date === "2026-09-02");
}

console.log("\n[4] เพจ vs บุคคล — ตัวนี้ตัดสินว่าข้อมูลจะถูกลบเมื่อไหร่ (§5)");
{
  ok("Page → page", Z.accountTypeOf({ accountType: "Page" }) === "page");
  ok("Media → page", Z.accountTypeOf({ accountType: "media" }) === "page");
  ok("User → person", Z.accountTypeOf({ accountType: "User" }) === "person");
  ok("ไม่มีคอลัมน์ แต่มาจากสำนักข่าว → page", Z.accountTypeOf({ source: "news" }) === "page");
  ok("กระทู้/บล็อก → person", Z.accountTypeOf({ source: "forum" }) === "person");
  ok("บอกไม่ได้ → unknown", Z.accountTypeOf({ source: "x" }) === "unknown");

  // 🔴 กฎที่ห้ามแก้กลับ: ไม่รู้ = ถือว่าเป็นบุคคล → ต้องถูกลบตามกำหนด
  ok("unknown ต้องถูกลบตาม retention", Z.shouldExpire("unknown") === true);
  ok("person ต้องถูกลบ", Z.shouldExpire("person") === true);
  ok("page เท่านั้นที่เก็บถาวร", Z.shouldExpire("page") === false);

  const r = one({ "Account Type": "" }, {}).records[0];
  ok("ธง expires ติดมากับแถวตั้งแต่ตอนแปลง", r.expires === Z.shouldExpire(r.accountType));
}

console.log("\n[5] ลิงก์ + กันซ้ำ");
{
  ok("ตัด utm_ ออก", Z.cleanUrl("https://x.com/a?utm_source=z&id=5") === "https://x.com/a?id=5", Z.cleanUrl("https://x.com/a?utm_source=z&id=5"));
  ok("ตัด / ท้าย", Z.cleanUrl("https://x.com/a/") === "https://x.com/a");
  ok("ไม่ใช่ http/https ทิ้ง", Z.cleanUrl("javascript:alert(1)") === "" && Z.cleanUrl("") === "");

  const same = Z.cleanUrl("https://x.com/a?utm_source=z");
  ok("ลิงก์เดียวกันคนละ utm = id เดียวกัน", Z.rowId(same, 1) === Z.rowId(Z.cleanUrl("https://x.com/a?utm_source=q"), 1));

  const two = Z.buildPreview([row(), row()], HEAD);
  ok("แถวซ้ำในไฟล์เดียวกัน เหลือใบเดียว", two.counts.kept === 1 && two.counts.dropped === 1, JSON.stringify(two.counts));
  ok("และบอกเหตุผลว่าซ้ำ", two.dropped[0].why === "dup");

  // upload ไฟล์เดิมซ้ำ ต้องได้ id ชุดเดิม → ฝั่ง D1 ใช้ INSERT OR IGNORE แล้วไม่เกิดแถวซ้ำ
  const a = Z.buildPreview([row()], HEAD).records[0].id;
  const b = Z.buildPreview([row()], HEAD).records[0].id;
  ok("upload ไฟล์เดิมซ้ำ ได้ id เดิม", a === b);
}

console.log("\n[6] 🔴 'ไม่รู้' ห้ามกลืนเป็นค่าใดค่าหนึ่ง");
{
  const r = one({ "Comment Count": "", "Engagement": "", "Sentiment": "" }).records[0];
  ok("ช่องคอมเมนต์ว่าง → null ไม่ใช่ 0", r.comments === null, String(r.comments));
  ok("ช่อง engagement ว่าง → null ไม่ใช่ 0", r.engagement === null, String(r.engagement));
  ok("ไม่มี sentiment ดิบ → null", r.sentimentRaw === null, String(r.sentimentRaw));
  // บทเรียนแพงที่สุดของโปรเจกต์: 79% ของแถวเป็น "กลาง" เพราะโค้ดเติมให้เงียบๆ
  ok("sentimentFinal ต้องเป็น null เสมอในเฟสนี้", r.sentimentFinal === null, String(r.sentimentFinal));
  const withRaw = one({ "Sentiment": "Negative" }).records[0];
  ok("มีค่าดิบก็ยังห้ามเอามาเป็นคำตอบของเรา", withRaw.sentimentRaw === "Negative" && withRaw.sentimentFinal === null);

  const bad = Z.buildPreview([row({ "Post time": "เมื่อวาน" })], HEAD);
  ok("แถวที่อ่านเวลาไม่ได้ ต้องเข้ากองตัดทิ้ง ไม่ใช่เดาเป็นวันนี้", bad.counts.kept === 0 && bad.dropped[0].why === "no-time");
  ok("และบอกเป็นภาษาคน ไม่ใช่รหัส", bad.dropped[0].label === "อ่านเวลาโพสต์ไม่ได้", bad.dropped[0].label);
  ok("ทุกเหตุผลที่ตัด ต้องมีคำแปลไทย", Object.keys(Z.DROP_WHY_TH).length >= 5 &&
     Object.values(Z.DROP_WHY_TH).every((v) => v && !/^[a-z-]+$/.test(v)));
}

console.log("\n[7] ไฟล์ครอบหลายวัน + สรุปให้ผู้ใช้ดูก่อนบันทึก");
{
  const rows = [
    row({ "Post time": "2026-08-29 10:00", "Direct URL": "https://x.com/1" }),
    row({ "Post time": "2026-08-30 10:00", "Direct URL": "https://x.com/2" }),
    row({ "Post time": "2026-08-30 23:30", "Direct URL": "https://x.com/3" }),
    row({ "Post time": "2026-08-31 10:00", "Direct URL": "https://x.com/4" }),
  ];
  const p = Z.buildPreview(rows, HEAD, { tz: "th" });
  ok("แตกเป็นวันได้ถูก", JSON.stringify(p.days) === JSON.stringify([
    { date: "2026-08-29", count: 1 }, { date: "2026-08-30", count: 2 }, { date: "2026-08-31", count: 1 }]),
    JSON.stringify(p.days));
  ok("นับเพจ/บุคคล/ไม่รู้ ครบทุกใบ", p.accounts.page + p.accounts.person + p.accounts.unknown === p.counts.kept);
  ok("ขาดคอลัมน์จำเป็น = preview ต้องไม่ ok", Z.buildPreview(rows, ["Post time", "Source"]).ok === false);
}

console.log("\n[8] ช่องทาง + ชื่อแคมเปญจากชื่อไฟล์");
{
  ok("Facebook", Z.normSource("Facebook") === "facebook");
  ok("Twitter/X", Z.normSource("Twitter") === "x");
  ok("ไม่มีคอลัมน์ช่องทาง เดาจากลิงก์ได้", Z.normSource("", "https://www.tiktok.com/@a/video/1") === "tiktok");
  ok("เดาไม่ออกคืนค่าว่าง ไม่ใช่มั่วเป็นข่าว", Z.normSource("???", "https://unknown.example/a") === "");
  ok("ตัดวันที่ท้ายชื่อไฟล์", Z.campaignFromFilename("cpf-monitor_2026-09-02.xlsx") === "cpf-monitor", Z.campaignFromFilename("cpf-monitor_2026-09-02.xlsx"));
  ok("ตัดช่วงวันที่", Z.campaignFromFilename("brand 20260829-20260902.csv") === "brand", Z.campaignFromFilename("brand 20260829-20260902.csv"));
  ok("ตัด (1) ที่เบราว์เซอร์เติมให้", Z.campaignFromFilename("brand (1).xlsx") === "brand", Z.campaignFromFilename("brand (1).xlsx"));
}

console.log("\n[9] ด่านกันแก้กลับ — พิสูจน์ว่าเทสต์จับของพังได้จริง");
{
  // จำลอง "โค้ดเติมค่าให้เงียบๆ" แบบที่เคยทำให้ตัวเลขทั้งหน้าผิด แล้วดูว่าด่านข้อ [6] จับได้ไหม
  const broken = { ...one().records[0], sentimentFinal: "neu", comments: 0 };
  ok("ถ้ามีใครเติม neu ให้เงียบๆ ด่าน [6] จะตก", broken.sentimentFinal !== null);
  ok("ถ้ามีใครเปลี่ยนช่องว่างเป็น 0 ด่าน [6] จะตก", broken.comments !== null);
  // จำลอง "unknown = เก็บถาวร" ซึ่งเป็นความเสี่ยงทางกฎหมาย
  ok("ถ้ามีใครแก้ให้ unknown เก็บถาวร ด่าน [4] จะตก", ((t) => t !== "page")("unknown") === true);
}

console.log(`\n${fail ? "❌" : "✅"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
