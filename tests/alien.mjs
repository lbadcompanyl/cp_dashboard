// "alien species" เก็บทั้งหมวด ไม่ใช่เฉพาะคำว่า alien species
// เช็ค 3 ชั้น: (1) ลิสต์ตรงกันระหว่าง config กับ archive  (2) จับข่าวชนิดพันธุ์ต่างถิ่นได้
// (3) ไม่ไปดูดข่าวแรงงานต่างถิ่น/ข่าวสงคราม/หนังเอเลี่ยนเข้ามา
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const ROOT = new URL("../", import.meta.url).pathname; // รากของโปรเจกต์ (เทสต์อยู่ใน tests/)
const cfg = await import(ROOT + "trend-feeds.config.js");
const feeds = cfg.feeds || cfg.default;
const alert2 = feeds.find((f) => f.source === "alert2");

// ---- โหลดตัวจับหัวข้อจาก archive.js ของจริง ----
const asrc = fs.readFileSync(ROOT + "functions/api/trend/archive.js", "utf8");
const grab = (re, n) => { const m = asrc.match(re); if (!m) throw new Error("หา " + n + " ไม่เจอใน archive.js"); return m[0]; };
const mod = await import("data:text/javascript;charset=utf-8," + encodeURIComponent([
  grab(/^const TOPICS = \[[\s\S]*?^\];$/m, "TOPICS"),
  grab(/^const LATIN_TERM = .*$/m, "LATIN_TERM"),
  grab(/^function termRe\(t\) \{[\s\S]*?^\}$/m, "termRe"),
  grab(/^const TOPIC_RE = .*$/m, "TOPIC_RE"),
  grab(/^function topicsOf\(text\) \{[\s\S]*?^\}$/m, "topicsOf"),
  "export { TOPICS, topicsOf };",
].join("\n")));
const keysOf = (t) => mod.topicsOf(t).map((x) => x.key);

console.log("\n[1] ลิสต์ต้องตรงกัน — ไม่งั้นข่าวเข้าคอลัมน์แต่ไม่เข้าชีต");
const alienTerms = mod.TOPICS.find((t) => t.key === "alien").terms.map((s) => s.toLowerCase());
const extra = (alert2.extraTerms || []).map((s) => s.toLowerCase());
ok("config มี extraTerms", extra.length >= 5, "ได้ " + extra.length);
// คำในหมวด alien ที่ไม่ได้อยู่ใน extraTerms = ข่าวจะไม่ถูกดึงเข้าคอลัมน์ → ไม่มีวันถึงชีต
// (ยกเว้นคำที่อยู่ใน query ของ Google Alert อยู่แล้ว)
const inAlertQuery = alert2.query.toLowerCase();
const orphan = alienTerms.filter((t) => !extra.includes(t) && !inAlertQuery.includes(t));
ok("ทุกคำในหมวด alien มีทางเข้าคอลัมน์", orphan.length === 0, orphan.join(", "));

console.log("\n[2] เอาแค่คำว่า alien species (ไทย+อังกฤษ) กับ สัตว์ต่างถิ่น");
for (const [name, title] of [
  ["ชนิดพันธุ์ต่างถิ่น", "กรมประมงเร่งกำจัดชนิดพันธุ์ต่างถิ่นในแหล่งน้ำธรรมชาติ"],
  ["สัตว์ต่างถิ่น", "เตือนภัยสัตว์ต่างถิ่นบุกแหล่งน้ำ กระทบระบบนิเวศ"],
  ["เอเลี่ยนสปีชีส์", "เอเลี่ยนสปีชีส์คืออะไร ทำไมต้องกำจัด"],
  ["เอเลียนสปีชีส์ (สะกดอีกแบบ)", "เอเลียนสปีชีส์บุกแหล่งน้ำไทย"],
  ["เอเลี่ยน สปีชีส์ (เว้นวรรค)", "รู้จักเอเลี่ยน สปีชีส์ ภัยเงียบของแม่น้ำไทย"],
  ["invasive species", "Thailand steps up fight against invasive species in rivers"],
  ["alien species", "Experts warn of alien species spreading in Thai waterways"],
]) ok(name, keysOf(title).includes("alien"), JSON.stringify(keysOf(title)));

console.log("\n[3] ห้ามดูดข่าวที่ไม่เกี่ยวเข้ามา");
for (const [name, title] of [
  ["แรงงานต่างถิ่น", "แรงงานต่างถิ่นทะลักเข้าเมือง เทศบาลเร่งจัดระเบียบ"],
  ["คนต่างถิ่น", "คนต่างถิ่นย้ายเข้าพื้นที่มากขึ้นหลังเปิดนิคม"],
  ["สงคราม", "รัสเซียรุกรานยูเครนต่อเนื่อง ยอดผู้อพยพพุ่ง"],
  ["หนังเอเลี่ยน", "รีวิวหนังเอเลี่ยน ภาคใหม่ ทำรายได้ถล่มทลาย"],
  ["ธุรกิจต่างชาติ", "ทุนต่างชาติรุกรานตลาดค้าปลีกไทย"],
  ["alienation", "Workers report alienation in the new office layout"],
  ["ปลาทั่วไป", "ราคาปลานิลปรับขึ้นรับเทศกาล"],
  // เจ้าของสั่งไม่ให้ไล่ชื่อชนิดพันธุ์ทีละตัว — ข่าวที่ไม่มีคำรวมจึงต้องไม่เข้าหมวด
  ["ชื่อชนิดพันธุ์เดี่ยวๆ", "ระดมเรือกำจัดผักตบชวาแม่น้ำท่าจีน"],
  ["ปลาซัคเกอร์เดี่ยวๆ", "ชาวบ้านช็อก จับปลาซัคเกอร์ได้เต็มบึง"],
]) ok(name, !keysOf(title).includes("alien"), JSON.stringify(keysOf(title)));

console.log("\n[4] หัวข้ออื่นไม่กระทบ");
ok("CPF ยังเข้าหมวด cpf", keysOf("ซีพีเอฟ แจ้งผลประกอบการไตรมาส 2").includes("cpf"));
ok("ปลาหมอคางดำ ยังเป็นหมวดของตัวเอง", keysOf("ปลาหมอคางดำระบาดหนักในสมุทรสงคราม").join() === "blackchin");
ok("PM2.5 ยังเข้าหมวด pm25", keysOf("ค่าฝุ่น PM2.5 เกินมาตรฐาน 40 จังหวัด").includes("pm25"));
ok("ข่าวไม่เกี่ยว ไม่ติดหมวดไหนเลย", keysOf("หุ้นไทยปิดบวก 5 จุด").length === 0);

console.log("\n[5] คำที่ใช้ดึงข่าวเข้าคอลัมน์ = ชุดเดียวกับที่โชว์ในหน้าต่าง 🔤");
const EXCLUDE_RE = /(?:^|\s)-\s*(?:"([^"]*)"|(\S+))/g;
const parseTerms = (q) => {
  const out = new Set();
  for (const part of String(q).replace(EXCLUDE_RE, " ").split(/\bOR\b/i)) {
    const t = part.replace(/["'()]/g, "").trim().toLowerCase();
    if (t.length >= 2 && !t.startsWith("-")) out.add(t);
  }
  return [...out];
};
const serverTerms = new Set([...parseTerms(alert2.query), ...extra]);
for (const p of ["trend/app.js", "issue/app.js"]) {
  const m = fs.readFileSync(ROOT + p, "utf8").match(/alert2: `([^`]*)`/);
  const panel = new Set(parseTerms(m[1]));
  const missing = [...serverTerms].filter((t) => !panel.has(t));
  ok(p + " โชว์ครบทุกคำ (" + panel.size + ")", missing.length === 0, missing.slice(0, 5).join(", "));
  // คำ -ไม่เอา ต้องยังแกะออกได้ ไม่งั้นคำสุดท้ายจะกลายเป็นก้อนเดียวที่ไม่มีวัน match
  const excl = [];
  EXCLUDE_RE.lastIndex = 0;
  let x;
  while ((x = EXCLUDE_RE.exec(m[1]))) excl.push(x[1] || x[2]);
  ok(p + " คำ -ไม่เอา ยังครบ 14 คำ", excl.length === 14, "ได้ " + excl.length);
  ok(p + " ไม่มีคำไหนกลายเป็นก้อนยาว", [...panel].every((t) => t.length < 40));
}

console.log("\n" + (fail ? "❌" : "✅") + " ผ่าน " + pass + " · ตก " + fail + "\n");
process.exit(fail ? 1 : 0);
