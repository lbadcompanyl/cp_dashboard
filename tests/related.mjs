/* ✂️ บล็อก "ข่าวที่เกี่ยวข้อง" ต้องไม่ถูกนับเป็นเนื้อข่าว
 *
 * เจ้าของแจ้ง 29 ส.ค. 2026 พร้อมภาพจากหน้า /admin/:
 *   "ข่าวผิดจาก alert เยอะมาก ทั้งขายของ, keyword อยู่หลังคำว่า ข่าวที่เกี่ยวข้อง"
 *
 * Google Alert เห็นคำที่ไหนก็ได้ในหน้า รวมถึงลิสต์ข่าวแนะนำท้ายบทความ ซึ่งไม่ใช่เนื้อข่าวใบนั้น
 * ข่าวคนละเรื่องจึงไหลเข้าคอลัมน์ CP ทั้งที่ในบทความจริงไม่มีชื่อเครือสักคำ
 *
 * รันด้วย: node related.mjs
 */
import fs from "node:fs";
import { cutRelated, htmlToText, stripBoilerplateHtml, noiseReason, cpEvidence, CP_MODEL_RE, PAGED_RE } from "../functions/api/_lib/noise.js";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const body = (s) => s.toLowerCase();

console.log("\n[1] บล็อกท้ายบทความ — คำอยู่หลัง 'ข่าวที่เกี่ยวข้อง' เท่านั้น = ไม่นับ");
{
  const art = "นายกฯ แถลงคดีฮั้ว สว. ที่รัฐสภาวันนี้ ".repeat(15);
  const page = art + " ข่าวที่เกี่ยวข้อง ซีพี ออลล์ เปิดสาขาใหม่ 100 แห่ง · เครือซีพี ลงทุนเพิ่มในอีอีซี";
  ok("ก่อนตัด: หน้าเว็บมีคำว่า ซีพี อยู่จริง", body(page).includes("ซีพี"));
  ok("🎯 หลังตัด: ไม่เหลือคำว่า ซีพี แล้ว", !body(cutRelated(page)).includes("ซีพี"),
    cutRelated(page).slice(-70));
  ok("เนื้อข่าวจริงยังอยู่ครบ", cutRelated(page).includes("คดีฮั้ว สว."));

  // คำอื่นที่เว็บไทยใช้เรียกบล็อกเดียวกัน
  for (const mk of ["ข่าวแนะนำ", "ข่าวอื่นที่น่าสนใจ", "เรื่องที่เกี่ยวข้อง", "อ่านข่าวต้นฉบับ",
                    "ข่าวยอดนิยม", "Related News", "You may also like", "Read more"]) {
    const p = art + ` ${mk} ซีพีเอฟ แจ้งผลประกอบการ`;
    ok(`จับคำว่า "${mk}"`, !body(cutRelated(p)).includes("ซีพีเอฟ"));
  }
}

console.log("\n[2] 🚫 แทรกกลางบทความ — ห้ามตัดเนื้อข่าวจริงที่อยู่ต่อจากนั้นทิ้ง");
{
  // เว็บข่าวไทยชอบแทรกกล่อง "ข่าวที่เกี่ยวข้อง" ไว้กลางบทความแล้วเขียนเนื้อข่าวต่อ
  // 🚫 เคยลองตัดเป็นช่วงความยาวตายตัว (700 ตัวอักษร) แล้วมันกินเนื้อข่าวจริงไปด้วย
  //    ตอนนี้ marker ที่อยู่ก่อน 60% ของความยาว = **ไม่แตะเลย**
  //    (ยอมปล่อยขยะผ่านดีกว่าตัดข่าวจริงหายเงียบ — หลักเดิมของหน้านี้)
  const head = "เปิดแผนลงทุนใหม่ของกลุ่มธุรกิจอาหาร ".repeat(8);
  const block = "ข่าวที่เกี่ยวข้อง " + "พาดหัวข่าวอื่นที่เว็บแนะนำ ".repeat(12);
  const rest = " กลับเข้าเนื้อข่าวจริง ซีพีเอฟ ประกาศตั้งโรงงานใหม่ที่ระยอง " + "รายละเอียดเพิ่มเติม ".repeat(30);
  const out = cutRelated(head + block + rest);
  ok("🎯 เนื้อข่าวจริงหลังกล่องแทรก ยังอยู่ครบ", out.includes("ซีพีเอฟ ประกาศตั้งโรงงานใหม่"), out.slice(-90));
  ok("ต้นบทความยังอยู่", out.includes("เปิดแผนลงทุนใหม่"));
  ok("marker กลางบทความไม่ถูกแตะ (ยอมปล่อยผ่านดีกว่าตัดข่าวจริงทิ้ง)", out === head + block + rest);
}

console.log("\n[3] ไม่มีบล็อกแนะนำ = ห้ามแตะอะไรเลย");
{
  const plain = "ซีพีเอฟ แจ้งผลประกอบการไตรมาส 2 กำไรโต 30% จากธุรกิจอาหารสัตว์และอาหารสำเร็จรูป";
  ok("คืนของเดิมทั้งดุ้น", cutRelated(plain) === plain);
  ok("ข้อความว่างไม่พัง", cutRelated("") === "" && cutRelated(null) === "" && cutRelated(undefined) === "");
}

console.log("\n[4] 🎸 รหัสรุ่นสินค้าที่ขึ้นต้นด้วย CP ไม่ใช่ชื่อเครือ");
{
  // เคสจริงจากภาพที่เจ้าของส่งมา
  for (const t of ["Musedo CP-60G Guitar Pickup ปิ๊กอัพ กีตาร์", "Boss CP-1X Compressor เอฟเฟคกีต้าร์",
                   "Yamaha CP88 Stage Piano", "เครื่องพิมพ์ CP-1300 รุ่นใหม่"]) {
    ok(`ไม่นับเป็นหลักฐาน CP: ${t.slice(0, 34)}`, cpEvidence(t) === "", cpEvidence(t));
  }
  // ⚠️ ห้ามเผลอตัดชื่อจริงของเครือทิ้ง
  for (const t of ["ซีพีเอฟ กำไรโต 30%", "เครือซีพี ลงทุนเพิ่มในอีอีซี", "CP AXTRA เปิดตัว HAPPITAT",
                   "ซีพี ออลล์ เปิดสาขาใหม่"]) {
    ok(`ยังเป็นข่าวเครือ: ${t.slice(0, 30)}`, cpEvidence(t) === "strong", cpEvidence(t));
  }
  ok("🚫 CP- เฉยๆ ไม่มีตัวเลขต่อท้าย ไม่นับเป็นรหัสรุ่น", !CP_MODEL_RE.test("cp-meiji"));
}

console.log("\n[5] 👕🎮 ชื่อลวงใหม่ — แบรนด์เสื้อผ้า / ค่าพลังโปเกม่อน");
{
  const drop = (t, u = "https://example.com/a") => noiseReason({ title: t, link: u, snippet: "" }, t.toLowerCase(), "alert1");
  ok("Cp Company (แบรนด์เสื้อผ้าอิตาลี) ไม่ใช่เครือ",
    cpEvidence("Cp Company Undersixteen Blue Boys Nylon Mix Overhead Hoody") === "",
    cpEvidence("Cp Company Undersixteen Blue Boys Nylon Mix Overhead Hoody"));
  ok("Snorlax Pokemon Go CP Explained ถูกตัด", drop("Snorlax Pokemon Go CP Explained - Facebook") === "false-cp",
    String(drop("Snorlax Pokemon Go CP Explained - Facebook")));
  // ⚠️ ห้ามไปโดนข่าวจริงที่มีคำว่า company
  ok("🚫 CP Foods Company ยังเป็นข่าวเครือ", cpEvidence("CP Foods reports Q2 profit") === "strong");
}

console.log("\n[6] 📄 หน้ารวมรายการแบบแบ่งหน้า ไม่ใช่ข่าว");
{
  const drop = (t, u = "https://www.thaipr.net/tag/cp-axtra/page/6") =>
    noiseReason({ title: t, link: u, snippet: "" }, t.toLowerCase(), "alert1");
  ok("CP AXTRA | Page 6 of 6 ถูกตัด", drop("CP AXTRA | Page 6 of 6 - ThaiPR.NET") === "paged-list",
    String(drop("CP AXTRA | Page 6 of 6 - ThaiPR.NET")));
  ok("หน้า 2 จาก 5 (ภาษาไทย) ก็จับ", PAGED_RE.test("รวมข่าวซีพี หน้า 2 จาก 5"));
  // ⚠️ ห้ามไปโดนพาดหัวข่าวจริงที่บังเอิญมีเลข
  for (const t of ["ซีพีเอฟ กำไรไตรมาส 2 โต 30%", "เปิด 6 มาตรการรับมือฝุ่น PM 2.5",
                   "ราคาหมู 3 เดือนติด", "CP ลงทุน 5 พันล้าน"]) {
    ok(`🚫 ไม่ตัดข่าวจริง: ${t.slice(0, 30)}`, !PAGED_RE.test(t));
  }
}

console.log("\n[8] 🧱 ตัดที่ HTML — กล่องที่แทรก 'กลางบทความ' ก็ตัดได้ เนื้อข่าวไม่หาย");
{
  // เจ้าของถาม 29 ส.ค. 2026: "บางข่าว related news แทรกกลางจะแก้ยังไง?"
  // ในข้อความล้วนไม่รู้ว่ากล่องจบตรงไหน แต่ใน HTML กล่องมีขอบเขตของตัวเอง → ตัดทั้ง element
  const page = `<article>
    <h1>เกาะประเด็นการเมือง คดีฮั้ว สว.</h1>
    <p>วันนี้ที่รัฐสภา มีการประชุมเรื่องคดีฮั้ว สว. โดยมีตัวแทนจากหลายฝ่ายเข้าร่วมประชุมกันอย่างพร้อมเพรียง</p>
    <div class="related-news"><h3>ข่าวที่เกี่ยวข้อง</h3>
      <ul><li>ซีพี ออลล์ เปิดสาขาใหม่ 100 แห่ง</li><li>เครือซีพี ลงทุนเพิ่มในอีอีซี</li></ul>
    </div>
    <p>ต่อมาในช่วงบ่าย ที่ประชุมได้ข้อสรุปว่าจะตั้งคณะกรรมการสอบเพิ่มเติมอีกชุดหนึ่ง</p>
    <p>ปิดท้ายด้วยการแถลงข่าวร่วมกันที่ห้องประชุมชั้นสอง</p>
  </article>
  <aside class="sidebar"><h3>ข่าวยอดนิยม</h3><ul><li>ซีพีเอฟ กำไรโต 30%</li></ul></aside>
  <nav><a href="/cp">หมวดซีพี</a></nav>
  <footer>ติดตามข่าวสารเพิ่มเติมได้ที่ เครือซีพี</footer>`;
  const out = htmlToText(page);
  ok("ก่อนตัด หน้าเว็บมีคำว่า ซีพี จริง", /ซีพี/.test(page));
  ok("🎯 กล่องที่แทรกกลางบทความถูกตัด — ไม่เหลือคำว่า ซีพี", !/ซีพี/.test(out), out.slice(0, 120));
  ok("เนื้อข่าวที่อยู่ 'ต่อจาก' กล่องแทรก ยังอยู่", out.includes("ตั้งคณะกรรมการสอบเพิ่มเติม"), out);
  ok("ย่อหน้าสุดท้ายยังอยู่", out.includes("ห้องประชุมชั้นสอง"));
  ok("ต้นบทความยังอยู่", out.includes("วันนี้ที่รัฐสภา"));

  // 🚫 ห้ามตัด div เปล่าๆ ที่ห่อเนื้อข่าวจริงอยู่
  const plain = `<div class="content"><p>ซีพีเอฟ แจ้งผลประกอบการไตรมาส 2 กำไรโต 30%</p></div>`;
  ok("🚫 div ที่ไม่ได้ชื่อว่ากล่องแนะนำ ห้ามตัด", htmlToText(plain).includes("ซีพีเอฟ"), htmlToText(plain));
  ok("script/style ถูกตัดทิ้ง", !stripBoilerplateHtml(`<script>var cp="ซีพี"</script><p>ข่าว</p>`).includes("ซีพี"));
  ok("ข้อความว่างไม่พัง", htmlToText("") === "" && htmlToText(null) === "");
}

console.log("\n[9] 🧱 เว็บที่ไม่มี JSON-LD — ต้องอ่านเนื้อข่าวได้แล้ว ไม่ใช่โยนให้ AI เดา");
{
  for (const f of ["trend", "ir"]) {
    const src = fs.readFileSync(new URL(`../functions/api/${f}/feeds.js`, import.meta.url), "utf8");
    ok(`${f}: มีทางสำรองอ่าน HTML เมื่อไม่มี JSON-LD`, /htmlToText\(html\)/.test(src));
    // ⚠️ เศษข้อความสั้นๆ ห้ามเอามาตัดสิน ต้องคืนค่าว่าง = "ตัดสินไม่ได้" เหมือนเดิม
    ok(`${f}: ข้อความสั้นเกินไปยังถือว่าตัดสินไม่ได้`, /txt\.length >= 400/.test(src));
  }
}

console.log("\n[7] ต่อสายในโค้ดจริง + หน้า admin แปลเหตุผลแล้ว");
{
  for (const f of ["trend", "ir"]) {
    const src = fs.readFileSync(new URL(`../functions/api/${f}/feeds.js`, import.meta.url), "utf8");
    ok(`${f}: อ่านเนื้อข่าวแล้วตัดบล็อกแนะนำก่อนเสมอ`, /return cutRelated\(/.test(src));
    ok(`${f}: import มาจากไลบรารีกลาง ไม่ได้ก๊อปมาวาง`, /cutRelated,?/.test(src.slice(0, 2000)));
    // ⚠️ แก้ตรรกะการตัดแล้วต้องบวกเลขรุ่น ไม่งั้นของเก่าใน KV/edge ถูกเสิร์ฟต่อ
    const cv = src.match(/const CACHE_VER = "(\d+)"/);
    const vv = src.match(/const VFY_VER = (\d+)/);
    ok(`${f}: บวก CACHE_VER แล้ว`, cv && Number(cv[1]) >= (f === "trend" ? 82 : 76), cv ? cv[1] : "-");
    ok(`${f}: บวก VFY_VER แล้ว (สั่งตรวจของเก่าใหม่ทั้งคลัง)`, vv && Number(vv[1]) >= 6, vv ? vv[1] : "-");
  }
  // ⚠️ เพิ่มเหตุผลใหม่ทีไร ต้องเติมคำแปลไทยใน WHY_TH ไม่งั้นเจ้าของเห็นรหัสดิบ
  const adm = fs.readFileSync(new URL("../admin/app.js", import.meta.url), "utf8");
  ok("หน้า admin แปล paged-list เป็นภาษาคนแล้ว", /"paged-list":\s*"[^"]*[ก-๙]/.test(adm));
}

console.log("\n[11] 🔴 สรุปที่ขึ้นต้นด้วย 'ข่าวที่เกี่ยวข้อง' = บล็อกแนะนำ ไม่ใช่สรุปของข่าวใบนี้");
{
  // เจ้าของส่งภาพมา 29 ส.ค. 2026: การ์ดข่าววอลเลย์บอล "สาวไทยผงาดแชมป์เอเชีย AVC 2026"
  // มีสรุปว่า "ข่าวที่เกี่ยวข้อง · ซีพี–ทรู เปิดดูฟรี ไทย-เวียดนาม …" → คำว่า ซีพี อยู่ในบล็อกแนะนำล้วนๆ
  // ⚠️ ตัวจับเดิมดูสัญญาณ "วันที่" ซึ่งบล็อกนี้ไม่มีเลย จึงหลุดมาตลอด
  const { looksLikeListing } = await import("../functions/api/trend/_lib/parser.js");
  const REAL = [
    "ข่าวที่เกี่ยวข้อง &middot; ซีพี–ทรู เปิดดูฟรี ไทย-เวียดนาม นัดชิง ASEAN Championship 2026",
    "ข่าวที่เกี่ยวข้อง · ซีพี ออลล์ เปิดสาขาใหม่ 100 แห่ง",
    "ข่าวแนะนำ ซีพีเอฟ กำไรโต 30%",
    "เรื่องที่น่าสนใจ · เครือซีพี ลงทุนเพิ่ม",
  ];
  for (const t of REAL) ok(`ตัดสรุปทิ้ง: ${t.slice(0, 40)}`, looksLikeListing(t), "ไม่ถูกจับ");
  // 🚫 "ที่เกี่ยวข้อง" กลางประโยคโผล่ในสรุปข่าวจริงได้ ตัดเพลินจะกินสรุปจริง
  const KEEP = [
    "ซีพีเอฟ แจ้งผลประกอบการไตรมาส 2 กำไรโต 30% จากธุรกิจอาหารสัตว์",
    "หน่วยงานที่เกี่ยวข้องเร่งตรวจสอบโรงงานที่ปล่อยน้ำเสียลงคลอง",
    "กรมประมงและหน่วยงานที่เกี่ยวข้อง ลงพื้นที่สำรวจปลาหมอคางดำ",
  ];
  for (const t of KEEP) ok(`🚫 ห้ามตัดสรุปจริง: ${t.slice(0, 38)}`, !looksLikeListing(t), "ถูกตัดผิด");
}

console.log("\n[10] 🔒 การ์ด Issue บนหน้ารวม ต้องมีป้ายบอกว่าต้องเข้าสู่ระบบ");
{
  // เจ้าของสั่ง 29 ส.ค. 2026: "อยาก lock issue dashboard และเพิ่มไอคอน lock เล็กๆ ในหน้ารวม"
  // ⚠️ ป้ายนี้ **ไม่ได้ล็อกอะไรเลย** — ตัวล็อกจริงคือ Cloudflare Access ที่เจ้าของตั้งเอง
  //    ป้ายทำหน้าที่เดียวคือบอกล่วงหน้าว่ากดแล้วจะเจอหน้าล็อกอิน
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const at = html.indexOf('href="issue/"');
  const card = html.slice(at, at + 1400);
  ok("การ์ด Issue มีป้าย 🔒", /class="lock-badge"[^>]*>🔒</.test(card), card.slice(0, 200));
  // เจ้าของสั่ง 29 ส.ค. 2026: "เปลี่ยนเป็นตัว lock อย่างเดียว ไม่ต้องมี text"
  ok("ป้ายมีแต่ไอคอน ไม่มีข้อความ", /class="lock-badge"[^>]*>🔒<\/span>/.test(card));
  // ⚠️ ไม่มีข้อความแล้ว ต้องมีคำอธิบายให้คนที่ไม่เข้าใจไอคอน + screen reader
  ok("มีคำอธิบายตอนเอาเมาส์ชี้", /class="lock-badge"[^>]*title="[^"]*เข้าสู่ระบบ/.test(card));
  ok("คนใช้ screen reader ก็รู้", /class="lock-badge"[^>]*aria-label="[^"]*เข้าสู่ระบบ/.test(card));
  ok("มีกุญแจที่มุมไอคอนด้วย", /class="lock-corner"[^>]*>🔒</.test(card));
  // เจ้าของสั่ง 29 ส.ค. 2026: "เอา under construct ออกและเอารูป Lock ไปไว้แทน"
  ok("🚫 ไม่มี Under Construction บนการ์ดนี้แล้ว", !/wip-badge|wip-corner|card wip/.test(card), card.slice(0, 200));
  ok("มีสไตล์ของ .lock-badge", /\.lock-badge \{[^}]*position:absolute/.test(html));
  ok("กุญแจมุมไอคอนใหญ่กว่า 🚧 เดิม (18px)", (() => {
    const m = html.match(/\.lock-corner \{[^}]*font-size:(\d+)px/);
    return m && Number(m[1]) > 18;
  })(), (html.match(/\.lock-corner \{[^}]*font-size:(\d+)px/) || [])[1]);
  // 🚫 การ์ดอื่นยังไม่ได้ล็อก ห้ามติดป้ายมั่ว
  ok("🚫 มีป้ายล็อกใบเดียว (การ์ดอื่นยังเปิดอยู่)", (html.match(/class="lock-badge"/g) || []).length === 1,
    String((html.match(/class="lock-badge"/g) || []).length));
  const v = html.match(/name="page-ver" content="(\d+)"/);
  ok("bump page-ver ของหน้ารวมแล้ว", v && Number(v[1]) >= 25, v ? v[1] : "-");
}

console.log("\n[12] 🔁 สรุปที่เอาข้อความก้อนเดิมมาซ้ำในตัวเอง = ลิสต์ข่าว ไม่ใช่สรุป");
{
  // เจ้าของส่งภาพมา 31 ส.ค. 2026: การ์ด "หวยออนไลน์พ่นพิษทำแม่ค้าเร่งขึ้ใจ …" (ข่าวหวย)
  // อยู่ในคอลัมน์ "หัวข้อที่จับตามอง" เพราะสรุปเป็นบล็อกข่าวปลาหมอคางดำที่ซ้ำกัน 2 ครั้ง
  const { looksLikeListing, decodeForTest } = await import("../functions/api/trend/_lib/parser.js");
  const REAL_CASE =
    '"ปลาหมอคางดำ" บุกทะเลระยอง! ชาวบ้านหวั่นระบบนิเวศถูก สังหลด &middot; ' +
    '"ปลาหมอคางดำ" บุกทะเลระยอง! ชาวบ้านหวั...';
  ok("🎯 เคสจริงจากภาพ: ถูกจับเป็นลิสต์แล้ว", looksLikeListing(REAL_CASE), "ยังหลุด");
  ok("แบบคั่นด้วย · ที่ถอดรหัสแล้ว ก็จับได้", looksLikeListing(
    'ซีพี ออลล์ เปิดสาขาใหม่ 100 แห่งทั่วประเทศในปีนี้ · ซีพี ออลล์ เปิดสาขาใหม่ 100 แห่ง…'));
  ok("แบบคั่นด้วย | ก็จับได้", looksLikeListing(
    'กรมประมงลงพื้นที่สำรวจปลาหมอคางดำ 4 จังหวัด | กรมประมงลงพื้นที่สำรวจปลาหมอคางดำ 4 จ…'));

  // 🚫 ฝั่งที่ห้ามตัด — สรุปข่าวจริงที่มีตัวคั่นอยู่ข้างใน หรือมีคำซ้ำสั้นๆ
  const KEEP12 = [
    // มีตัวคั่นแต่แต่ละท่อนคนละเรื่อง = สรุปจริงของข่าวเดียว
    "ซีพีเอฟ แจ้งผลประกอบการไตรมาส 2 · กำไรสุทธิ 8,900 ล้านบาท เพิ่มขึ้นจากปีก่อน 30%",
    // คำซ้ำแต่สั้นกว่า 30 ตัวอักษร — ย่อหน้าจริงซ้ำคำแบบนี้ได้ปกติ
    "ราคาน้ำมัน วันนี้ · ราคาน้ำมัน พรุ่งนี้ · ราคาทองคำล่าสุด",
    "กรมประมงและหน่วยงานที่เกี่ยวข้อง ลงพื้นที่สำรวจปลาหมอคางดำในคลองสายหลัก 4 จังหวัด",
  ];
  for (const t of KEEP12) ok(`🚫 ห้ามตัดสรุปจริง: ${t.slice(0, 38)}`, !looksLikeListing(t), "ถูกตัดผิด");

  // ⚠️ &middot; ต้องถูกแปลงเป็น · ไม่งั้นผู้ใช้เห็นโค้ดดิบบนการ์ด (เจ้าของเห็นในภาพ)
  //    และตัวจับที่ดูตัวคั่น (SEP_DATE_RE ใช้ [·|]) ก็มองไม่เห็น
  const parserSrc = fs.readFileSync(
    new URL("../functions/api/trend/_lib/parser.js", import.meta.url), "utf8");
  ok("decode() รู้จัก &middot; แล้ว", /middot:\s*"·"/.test(parserSrc));
  ok("และ regex ของ decode ก็ครอบ middot ด้วย",
    /replace\(\/&\([^)]*middot[^)]*\);\/g/.test(parserSrc), "regex ยังไม่ครอบ");

  // กวาดของเก่าในคลัง — ของที่เก็บไว้ก่อนมีกฎนี้ต้องหายด้วย ไม่ใช่รอ 90 วัน
  const { dropListingSnippets } = await import("../functions/api/_lib/noise.js");
  const sources = { alert2: { items: [
    { title: "หวยออนไลน์พ่นพิษทำแม่ค้าเร่งขึ้ใจ", link: "https://ch3plus.com/a", snippet: REAL_CASE },
    { title: "กรมประมงลงพื้นที่", link: "https://x.com/b",
      snippet: "กรมประมงและหน่วยงานที่เกี่ยวข้อง ลงพื้นที่สำรวจปลาหมอคางดำในคลอง 4 จังหวัด" },
  ] } };
  const n = dropListingSnippets(sources, {});
  ok("กวาดคลัง: สรุปปลอมถูกตัด", sources.alert2.items[0].snippet === "" && n === 1, "n=" + n);
  ok("🚫 กวาดคลัง: สรุปจริงยังอยู่ครบ", sources.alert2.items[1].snippet.length > 0);
  ok("ติดธงไว้ให้ไล่ปัญหาได้", sources.alert2.items[0].listingSnip === true);

  // ⚠️ ต้องเรียกทั้ง 2 จังหวะเหมือน dropSharedSnippets (ก่อน merge · หลังดึงคลัง)
  for (const f of ["trend", "ir"]) {
    const src = fs.readFileSync(
      new URL(`../functions/api/${f}/feeds.js`, import.meta.url), "utf8");
    ok(`${f}/feeds.js เรียก dropListingSnippets ครบ 2 จังหวะ`,
      (src.match(/dropListingSnippets\(sources/g) || []).length === 2,
      String((src.match(/dropListingSnippets\(sources/g) || []).length));
    const m = src.match(/const CACHE_VER = "(\d+)"/);
    ok(`${f}/feeds.js bump CACHE_VER แล้ว`, m && Number(m[1]) >= (f === "trend" ? 84 : 78), m ? m[1] : "-");
  }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
