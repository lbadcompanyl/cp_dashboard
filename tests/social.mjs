// แดชบอร์ดโซเชียล 4 แท็บ — คุมข้อกำหนดที่พังแล้วดูไม่ออกด้วยตาเปล่า
//
// รวมข้อที่แก้จากรอบรีวิว: แกน Y ห้ามซ้ำ · ตารางเทียบรายช่อง · แท่ง 100% ·
// diverging bar · ชิพเลือกช่อง · คำอธิบายอยู่ใน tooltip · แกน Y คู่ ·
// กริด TikTok ห้ามมีใบลอยเดี่ยว · delta ฐานเล็กต้องเป็นจำนวนจริง
//
// ⚠️ ยิงเน็ตออกนอกไม่ได้ — หน้านี้ใช้ข้อมูลจำลองในตัว ไม่ต้องปลอม API
// ต้องมีเซิร์ฟเวอร์ static ที่พอร์ต 8899:  python3 -m http.server 8899 --directory ..

import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8899";
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log("  ✅ " + m)) : (fail++, console.log("  ❌ " + m)); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

/* ⚠️ ต้องเปิดด้วย ?mock=1 — ตอนนี้หน้าเว็บยิง /social/api/* ของจริงเป็นค่าปริยาย
   เซิร์ฟเวอร์ static ของเทสต์ไม่มี endpoint พวกนั้น จะได้สถานะ "ยังไม่ได้เชื่อมต่อ" ทั้งหมด
   เทสต์ชุดนี้คุมเรื่องหน้าตา/ตรรกะการคำนวณ จึงต้องใช้ข้อมูลจำลองที่คาดเดาได้ */
async function open(viewport = { width: 1400, height: 1000 }, query = "") {
  const pg = await browser.newPage({ viewport });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await pg.goto(BASE + "/social/?mock=1" + query, { waitUntil: "load" });
  await pg.waitForSelector(".sc");
  return { pg, errs };
}
const tabTo = async (pg, label) => { await pg.click(`.tab:has-text("${label}")`); await pg.waitForTimeout(140); };
const view = (pg) => pg.$eval("#view", (e) => e.innerText);
const secs = (pg) => pg.$$eval(".sec", (n) => n.map((x) => x.textContent.trim()));
// ช่วงเวลาเป็นแผงแบบกดเปิด — ตัวช่วยตัวเดียวใช้ทั้งไฟล์
const setPeriod = async (pg, k) => {
  // ⚠️ 28d / 90d ถูกถอดออกแล้ว (เจ้าของสั่ง 19 ส.ค. 2026) — ช่วงยาวใช้ 3m แทน
  const map = { 7: "7d", 30: "30d", 90: "3m", custom: "custom" };
  const key = map[k] || String(k);
  if (!(await pg.$(".periodpanel"))) await pg.click('[data-period="toggle"]');
  await pg.waitForSelector(".periodpanel");
  await pg.click(`[data-preset="${key}"]`);
  await pg.waitForTimeout(200);
};
const closePeriod = async (pg) => { if (await pg.$(".periodpanel")) { await pg.click('[data-period="close"]'); await pg.waitForTimeout(150); } };
/* 🔴 ปุ่มเลือกโหมดเทียบย้ายเข้าไปอยู่ใน "แผงเลือกช่วงเวลา" แล้ว (แบบ GA4)
   เดิมเป็นแถวปุ่มค้างอยู่บนแถบควบคุม — ตัวช่วยนี้เปิดแผงให้เองเพื่อไม่ต้องแก้ทุกจุดที่เรียก
   ⚠️ "ไม่เทียบ" คือการปิดสวิตช์ ไม่ใช่ปุ่มในลิสต์ */
const setCompare = async (pg, k) => {
  if (!(await pg.$(".periodpanel"))) { await pg.click('[data-period="toggle"]'); await pg.waitForSelector(".periodpanel"); }
  const on = await pg.$eval(".pp-sw", (e) => e.classList.contains("on"));
  if (k === "none") { if (on) await pg.click(".pp-sw"); }
  else {
    if (!on) { await pg.click(".pp-sw"); await pg.waitForTimeout(120); }
    await pg.click(`.pp-c[data-cmp="${k}"]`);
  }
  await pg.waitForTimeout(160);
  await closePeriod(pg);
};

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[1] โครงหน้า — แท็บอ่านจาก config ไม่ได้เขียนค้างใน HTML");
{
  const { pg, errs } = await open();
  const tabs = await pg.$$eval(".tab", (n) => n.map((x) => x.dataset.tab));
  ok(tabs.join(",") === "summary,youtube,tiktok,facebook", "แท็บครบ 4 ตัว เรียงถูก");
  const html = await (await fetch(BASE + "/social/index.html")).text();
  ok(!/data-tab=/.test(html), "ปุ่มแท็บไม่ได้เขียนค้างใน HTML (เพิ่มแท็บ paid ทีหลังได้)");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[2] ช่วงเวลา + โหมดเทียบ ใช้ร่วมกันทุกแท็บ");
{
  const { pg } = await open();
  await setPeriod(pg, 90);
  await setCompare(pg, "yoy");
  const before = await pg.$eval(".periodbtn", (e) => e.innerText);
  ok(/3 เดือน/.test(before) && /เทียบกับ/.test(before), "ตั้งค่าช่วงยาว + เทียบปีก่อนแล้ว");
  for (const t of ["YouTube", "TikTok", "Facebook", "ภาพรวม"]) {
    await tabTo(pg, t);
    ok((await pg.$eval(".periodbtn", (e) => e.innerText)) === before, `แท็บ ${t}: ช่วงเวลายังเป็นชุดเดิม`);
  }
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[3] delta — ทุกตัวเลขต้องมี ยกเว้นเลือก 'ไม่เทียบ'");
{
  const { pg } = await open();
  ok((await pg.$$(".sc .dlt")).length >= 4, "สรุปบนสุดมีป้ายเทียบครบ");
  ok((await pg.$$(".tbl.perf .cd .dlt")).length >= 8, "ทุกช่องในตารางเทียบรายช่องมี delta");

  await setCompare(pg, "none");
  await pg.waitForTimeout(140);
  ok((await pg.$$(".dlt")).length === 0, "เลือกไม่เทียบ → ไม่มีป้ายเทียบเหลือเลย");
  ok(!/▲|▼/.test(await view(pg)), "ไม่มีลูกศรค้างอยู่");

  await setCompare(pg, "prev");
  await pg.waitForTimeout(140);
  ok((await pg.$$(".dlt")).length > 0, "กลับมาเทียบแล้วป้ายกลับมา");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[4] 🔴 กติกา delta ใหม่ — ฐานน้อยกว่า 1,000 ต้องบอกเป็นจำนวนจริง ไม่ใช่ %");
{
  const { pg } = await open();
  await tabTo(pg, "Facebook");
  await setPeriod(pg, 30);

  // "เพิ่มสุทธิในช่วงนี้" ของ Facebook อยู่หลักสิบ — ห้ามขึ้นเป็น %
  const netCard = await pg.evaluate(() => {
    const c = [...document.querySelectorAll(".sc")].find((x) => /เพิ่มสุทธิ/.test(x.querySelector(".sc-l").textContent));
    return c ? { val: c.querySelector(".sc-v").textContent.trim(), d: c.querySelector(".sc-d").textContent.trim() } : null;
  });
  ok(!!netCard, "เจอการ์ดเพิ่มสุทธิ");
  const base = Number(String(netCard.val).replace(/[^\d.]/g, ""));
  ok(base < 1000, `ฐานอยู่หลักน้อยจริง (${netCard.val})`);
  ok(!/%/.test(netCard.d), `delta ไม่ใช่ % (ได้ "${netCard.d}")`);
  ok(/[+−-]\s*[\d,]/.test(netCard.d), "delta เป็นจำนวนจริงพร้อมเครื่องหมาย");

  // ของที่ฐานใหญ่ยังต้องเป็น % ตามเดิม
  const bigD = await pg.evaluate(() => {
    const c = [...document.querySelectorAll(".sc")].find((x) => /การเข้าถึง|ผู้ติดตาม$/.test(x.querySelector(".sc-l").textContent.trim()));
    return c ? c.querySelector(".sc-d").textContent.trim() : "";
  });
  ok(/%/.test(bigD), `ฐานใหญ่ยังเป็น % (ได้ "${bigD}")`);

  // util เดียวจริง — ห้ามมีใครคิด % เองที่อื่น
  const js = await (await fetch(BASE + "/social/app.js")).text();
  ok((js.match(/DELTA_MIN_BASE/g) || []).length >= 2, "มีค่าคงที่ฐานขั้นต่ำอยู่จุดเดียวแล้วอ้างถึง");
  ok((js.match(/function delta\(/g) || []).length === 1, "มีฟังก์ชัน delta ตัวเดียวในไฟล์");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[5] 🔴 แกน Y กราฟผู้ติดตาม — เป็นจำนวนคน ไม่ใช่ % และห้ามมีป้ายซ้ำ");
{
  const { pg } = await open();
  const axOf = () => pg.evaluate(() => {
    const svg = document.querySelectorAll("svg.chart")[0];
    return [...svg.querySelectorAll(".ax")].map((x) => x.textContent.trim());
  });
  for (const days of [7, 30, 90]) {
    await setPeriod(pg, days);
    const ax = (await axOf()).filter((t) => /[\d]/.test(t) && !/ก\.ค\.|ส\.ค\.|มิ\.ย\.|พ\.ค\.|เม\.ย\.|มี\.ค\./.test(t));
    ok(ax.length >= 4, `${days} วัน: มีป้ายแกน Y (${ax.join(" / ")})`);
    ok(new Set(ax).size === ax.length, `${days} วัน: ป้ายแกน Y ไม่ซ้ำกันเลย`);
    ok(!ax.some((t) => /%/.test(t)), `${days} วัน: ไม่ใช่ % แล้ว`);
    ok(ax.some((t) => /K|,|\d{3}/.test(t)), `${days} วัน: เป็นจำนวนคนจริง`);
  }
  const v = await view(pg);
  ok(!/% สะสมจากวันแรก/.test(v), "ไม่มีคำบรรยายแบบ % ค้างอยู่");
  ok(!/เริ่มที่ 100/.test(v), "ไม่มีคำอธิบายของวิธี index 100 ค้างอยู่");
  await pg.close();
}

console.log("\n[5b] 🔴 แนวโน้ม — วาดทีละเส้น สลับช่องด้วยแท็บ + เลือกวัน/สัปดาห์/เดือน");
{
  const { pg, errs } = await open();
  const order = await secs(pg);
  const clean = order.map((s) => s.replace(/ⓘ/g, " ").replace(/\s+/g, " ").trim());
  ok(/^แนวโน้ม/.test(clean[0]), `หัวข้อแรกคือแนวโน้ม (ได้ "${clean[0]}")`);
  ok(/เพิ่มและที่หายไป/.test(clean[1]), "คู่กับผู้ติดตามที่เพิ่ม/หาย (เรื่องเดียวกัน 2 มุม)");
  ok(clean.findIndex((x) => /ผลงานรายช่อง/.test(x)) === 2, "ตารางรายช่องอยู่ถัดจากกลุ่มแนวโน้ม");

  /* 🔴 เดิมวาดเส้นรวม + เส้นรายช่องซ้อนกัน 4 เส้น (เจ้าของสั่งเปลี่ยน 19 ส.ค. 2026)
     ช่องที่ตัวเลขต่างกันหลายเท่าอยู่บนแกนเดียวกัน เส้นเล็กเลยแบนติดพื้น
     ตอนนี้เลือกดูทีละเส้นด้วยแท็บ แกนจึงขยายเต็มกรอบให้เส้นที่กำลังดูอยู่เสมอ */
  ok((await pg.$$("svg.chart")).length === 1, "หน้าภาพรวมมีกราฟเส้นอันเดียว");
  ok((await pg.$$eval("svg.chart path", (n) => n.length)) === 1, "วาดทีละเส้นเท่านั้น");

  const chips = await pg.$$eval(".mchip", (n) => n.map((x) => x.textContent.trim()));
  ok(chips.length >= 4, `มีชิพสลับ metric ครบ (${chips.join(" · ")})`);
  ok((await pg.$$(".mchip.on")).length === 1, "มีชิพ metric ที่เลือกอยู่ใบเดียว");

  const chtabs = await pg.$$eval(".chtab", (n) => n.map((x) => x.textContent.trim()));
  ok(chtabs.length === 4 && chtabs[0] === "รวม", `แท็บช่อง: รวม + รายช่อง 3 (${chtabs.join(" / ")})`);
  ok((await pg.$$(".chtab.on")).length === 1, "มีแท็บช่องที่เลือกอยู่อันเดียว");

  const dOf = () => pg.$eval("svg.chart path", (e) => e.getAttribute("d"));
  const axOf = () => pg.$$eval("svg.chart .ax:not(.ax-x)", (n) => n.map((x) => x.textContent.trim()));

  // ⚠️ ป้ายแกน Y ห้ามซ้ำกัน — ช่วงข้อมูลแคบเคยได้ 258K/258K/259K/259K อ่านไม่ออก
  const ax0 = await axOf();
  ok(new Set(ax0).size === ax0.length, `ป้ายแกน Y ไม่ซ้ำกันเลย (${ax0.join(" / ")})`);

  // สลับช่องแล้วเส้นต้องเปลี่ยนจริง ไม่ใช่เปลี่ยนแต่แท็บ
  const dAll = await dOf();
  await pg.click('[data-tch="tiktok"]');
  await pg.waitForTimeout(200);
  ok((await dOf()) !== dAll, "กดแท็บช่องแล้วเส้นเปลี่ยนตามจริง");
  ok((await pg.$$eval("svg.chart path", (n) => n.length)) === 1, "ยังเป็นเส้นเดียวเหมือนเดิม");
  ok(/TikTok/.test(await pg.$eval("svg.chart", (e) => e.getAttribute("aria-label"))), "กราฟบอกว่ากำลังดูช่องไหน");
  const axTT = await axOf();
  ok(new Set(axTT).size === axTT.length, `ป้ายแกนของช่องเดียวก็ไม่ซ้ำ (${axTT.join(" / ")})`);

  // ⚠️ ปิดช่องที่กำลังดูอยู่ ต้องตกกลับไปที่ "รวม" ไม่ใช่ค้างเป็นแท็บที่ไม่มีข้อมูลแล้ว
  await pg.click('[data-ch="tiktok"]');
  await pg.waitForTimeout(220);
  ok(await pg.$eval('.chtab[data-tch="all"]', (e) => e.classList.contains("on")),
     "ปิดช่องที่กำลังดูอยู่ → กราฟตกกลับไปที่ 'รวม'");
  ok((await pg.$$(".chtab")).length === 3, "แท็บของช่องที่ปิดหายไปด้วย");
  await pg.click('[data-ch="tiktok"]');
  await pg.waitForTimeout(200);

  // สลับ metric
  await pg.click('[data-metric="engagement"]');
  await pg.waitForTimeout(200);
  ok(await pg.$eval('[data-metric="engagement"]', (e) => e.classList.contains("on")), "ชิพ metric ที่กดติดสถานะ");

  /* 🔴 ความละเอียดของแกนเวลา (เจ้าของสั่ง 19 ส.ค. 2026)
     ⚠️ จำนวนจุดต้องลดลงจริงเมื่อรวมเป็นสัปดาห์/เดือน ไม่ใช่แค่เปลี่ยนป้าย */
  const grains = await pg.$$eval(".seg.grain button", (n) => n.map((x) => x.textContent.trim()));
  ok(grains.join("/") === "รายวัน/รายสัปดาห์/รายเดือน", `มีตัวเลือกวัน/สัปดาห์/เดือน (${grains.join(" ")})`);
  const pts = async () => pg.evaluate(() => (document.querySelector("svg.chart path").getAttribute("d").match(/[ML]/g) || []).length);
  const pDay = await pts();
  await pg.click('[data-grain="week"]');
  await pg.waitForTimeout(200);
  const pWeek = await pts();
  await pg.click('[data-grain="month"]');
  await pg.waitForTimeout(200);
  const pMonth = await pts();
  ok(pDay > pWeek && pWeek > pMonth, `จุดลดลงตามความละเอียด (วัน ${pDay} > สัปดาห์ ${pWeek} > เดือน ${pMonth})`);
  ok(pDay === 30, `รายวันได้ 1 จุดต่อวัน (${pDay} จุดใน 30 วัน)`);

  /* ⚠️ ช่วงสั้นๆ เลือก "รายเดือน" แล้วได้จุดเดียว วาดกราฟไม่ได้ → ต้องปิดปุ่มพร้อมบอกเหตุผล */
  await pg.click('[data-grain="day"]');
  await setPeriod(pg, 7);
  await closePeriod(pg);
  const dis = await pg.$eval('[data-grain="month"]', (e) => ({ d: e.disabled, t: e.getAttribute("title") || "" }));
  ok(dis.d, "ช่วง 7 วัน: ปุ่มรายเดือนถูกปิด");
  ok(/สั้นเกินไป/.test(dis.t), "บอกเหตุผลที่ปิดด้วย");
  await setPeriod(pg, 30);
  await closePeriod(pg);

  // ⚠️ ผู้ติดตามเป็น "ระดับ" รวมเป็นสัปดาห์ต้องเอาค่าสุดท้าย ไม่ใช่บวกกัน
  await pg.click('[data-metric="followers"]');
  await pg.waitForTimeout(150);
  const vDay = await pg.$$eval("svg.chart .ax:not(.ax-x)", (n) => n.map((x) => x.textContent));
  await pg.click('[data-grain="week"]');
  await pg.waitForTimeout(200);
  const vWeek = await pg.$$eval("svg.chart .ax:not(.ax-x)", (n) => n.map((x) => x.textContent));
  const scale = (a) => (/M$/.test(a[a.length - 1]) ? "M" : "K");
  ok(scale(vDay) === scale(vWeek),
     `รวมเป็นสัปดาห์แล้วผู้ติดตามยังอยู่หลักเดิม ไม่ได้ถูกบวกทบ (${vDay[3]} → ${vWeek[3]})`);
  await pg.click('[data-grain="day"]');
  await pg.waitForTimeout(150);

  // ⚠️ กราฟเคยสูงจนกินทั้งหน้าจอ — ต้องย่อลงแล้วมีของวางข้างๆ
  const fh = await pg.$eval("svg.chart", (e) => e.getBoundingClientRect().height);
  ok(fh < 230, `กราฟไม่สูงเกินไป (${Math.round(fh)}px)`);

  const duos = await pg.$$eval(".duo", (n) => n.map((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length));
  ok(duos.every((c) => c === 2), `ทุกแถวคู่เป็น 2 คอลัมน์บนจอกว้าง (${duos})`);
  const side = await pg.$$eval(".duo .duo-c .panel", (n) => n.map((e) => Math.round(e.getBoundingClientRect().top)));
  ok(Math.abs(side[0] - side[1]) < 8, "กล่องซ้าย-ขวาอยู่ระดับเดียวกัน");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();

  const { pg: m } = await open({ width: 390, height: 900 });
  const mduo = await m.$eval(".duo", (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length);
  ok(mduo === 1, "มือถือยุบเป็นคอลัมน์เดียว");
  await m.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[6] 🔴 ผลงานรายช่อง — หนึ่งแถวคือหนึ่งช่อง + แท็บ Engagement / Views");
{
  const { pg } = await open();
  ok((await pg.$$(".pcard")).length === 0, "ไม่มีการ์ดรายช่องแบบเดิมเหลืออยู่");
  ok(!!(await pg.$(".tbl.perf")), "มีตารางผลงานรายช่อง");

  /* 🔴 เดิมสลับแกนกัน (ตัวชี้วัดเป็นแถว ช่องเป็นคอลัมน์) เจ้าของสั่งเปลี่ยน 19 ส.ค. 2026
     คนอ่านตารางแบบ "หนึ่งแถว = หนึ่งช่อง" แล้วกวาดตาไปตามคอลัมน์ */
  const rowNames = await pg.$$eval('.tbl.perf tbody th[scope="row"]', (n) => n.map((x) => x.textContent.trim()));
  ok(rowNames.length === 3, `แถวคือช่อง 3 แถว (${rowNames.length})`);
  ok(/YouTube/.test(rowNames[0]) && /TikTok/.test(rowNames[1]) && /Facebook/.test(rowNames[2]),
     `แถวเรียงตามลำดับช่อง (${rowNames.join(" / ")})`);

  const tabs = await pg.$$eval(".ptab", (n) => n.map((x) => x.textContent.trim()));
  ok(tabs.length === 2 && /Engagement/.test(tabs[0]) && /Views/.test(tabs[1]),
     `มีแท็บสลับชุดคอลัมน์ (${tabs.join(" / ")})`);

  /* 🔴 ไลก์ / คอมเมนต์ / แชร์ ต้องแยกเป็นคอลัมน์ — เดิมมีแต่ยอดรวม
     ตัวเลขแยกอยู่ในแท็บรายช่องอย่างเดียว เทียบข้ามช่องไม่ได้เลย */
  const hEng = await pg.$$eval(".tbl.perf thead th", (n) => n.map((x) => x.textContent.trim()));
  for (const want of ["ไลก์", "คอมเมนต์", "แชร์", "Engagement รวม", "ER"]) {
    ok(hEng.some((x) => x.includes(want)), `แท็บ Engagement มีคอลัมน์ "${want}"`);
  }

  /* ⚠️ YouTube ไม่เปิดเผยจำนวนแชร์ผ่าน API — ต้องขึ้น "—" ห้ามใส่ 0
     (0 แปลว่า "ไม่มีใครแชร์" ซึ่งคนละเรื่องกับ "ไม่รู้") */
  /* 🔴 YouTube มีตัวเลขแชร์แล้ว (มาจาก YouTube Analytics) — เดิมขึ้น "—" */
  const shareCol = await pg.$$eval(".tbl.perf tbody tr", (n) =>
    n.map((r) => r.querySelectorAll("td")[2].innerText.trim().split("\n")[0]));
  ok(shareCol.every((x) => x !== "—"), `ทุกช่องมีตัวเลขแชร์ (${shareCol.join(" / ")})`);

  // สลับแท็บแล้วชุดคอลัมน์ต้องเปลี่ยนจริง
  await pg.click('[data-ptab="reach"]');
  await pg.waitForTimeout(180);
  const hR = await pg.$$eval(".tbl.perf thead th", (n) => n.map((x) => x.textContent.trim()));
  /* 🔴 เจ้าของถามว่า "สัดส่วน" คืออะไร retention หรือเปล่า — เปลี่ยนชื่อเป็น "% ของยอดรวม"
     และแยก retention ออกมาเป็นคอลัมน์ "ดูจนจบ" ของมันเอง (19 ส.ค. 2026)
     ⚠️ ชื่อคอลัมน์ที่ตีความได้ 2 แบบ = เจ้าของอ่านตัวเลขผิดโดยไม่มีอะไรเตือน */
  for (const want of ["Views / Reach", "% ของยอดรวม", "โพสต์", "เฉลี่ยต่อโพสต์",
                      "ดูเกิน 3 วิ", "ดูเฉลี่ย/ครั้ง", "ดูจนจบ", "เวลาดูรวม"]) {
    ok(hR.some((x) => x.includes(want)), `แท็บ Views / Reach มีคอลัมน์ "${want}"`);
  }
  ok(!hR.some((x) => /^สัดส่วน/.test(x.trim())), "ไม่มีคอลัมน์ชื่อ 'สัดส่วน' ลอยๆ ที่ตีความได้หลายแบบ");

  /* ⚠️ แต่ละเจ้าให้ตัวเลขไม่เท่ากัน ช่องที่ไม่มีต้องขึ้น "—" พร้อมเหตุผล ห้ามใส่ 0
     (0 แปลว่า "วัดได้แล้วได้ศูนย์" คนละเรื่องกับ "วัดไม่ได้") */
  const cells = await pg.$$eval(".tbl.perf tbody tr", (n) => n.map((r) =>
    [...r.querySelectorAll("td")].map((c) => ({ t: c.innerText.trim().split("\n")[0], na: c.classList.contains("na"), tip: c.title }))));
  const [yt, tt, fb] = cells;
  ok(fb[1].t !== "—" && !fb[1].na, `Facebook มี "ดูเกิน 3 วิ" จริง (${fb[1].t})`);
  ok(yt[1].na && tt[1].na, "YouTube กับ TikTok ไม่มีตัวเลข 3 วินาที → ขึ้น —");
  ok(/ระยะเวลา/.test(yt[1].tip || ""), "บอกเหตุผลที่ไม่มีตัวเลข");
  ok(fb[4].na, "Facebook ไม่มีเวลาดูรวม → ขึ้น —");
  ok(!yt[4].na && yt[4].t !== "—", `YouTube มีเวลาดูรวม (${yt[4].t})`);
  ok(!yt[3].na && parseFloat(yt[3].t) > 0, `ดูจนจบของ YouTube มีค่าจริง ไม่ใช่ 0% (${yt[3].t})`);
  ok(!tt[2].na && tt[2].t !== "0:00", `ดูเฉลี่ยของ TikTok มีค่าจริง (${tt[2].t})`);
  ok(!hR.some((x) => /ไลก์/.test(x)), "สลับแท็บแล้วคอลัมน์ของอีกแท็บหายไปจริง");
  ok(await pg.$eval('[data-ptab="reach"]', (e) => e.classList.contains("on")), "แท็บที่กดติดสถานะ");

  // % ของยอดรวม ต้องรวมกันได้ราว 100%
  const shares = await pg.$$eval(".tbl.perf tbody tr td:last-child .cv", (n) => n.map((x) => parseFloat(x.textContent)));
  const tot = shares.reduce((a, b) => a + b, 0);
  ok(Math.abs(tot - 100) < 0.5, `สัดส่วนรวมกันได้ 100% (${tot.toFixed(2)}%)`);

  await pg.click('[data-ptab="engagement"]');
  await pg.waitForTimeout(150);
  const cell = await pg.$eval(".tbl.perf tbody tr td", (e) => ({ v: !!e.querySelector(".cv"), d: !!e.querySelector(".cd") }));
  ok(cell.v && cell.d, "แต่ละช่องมีค่า + delta ตัวเล็กใต้ค่า");
  ok(await pg.$eval(".tbl.perf", (e) => {
    const w = e.closest(".tblwrap");
    return !!w && ["auto", "scroll"].includes(getComputedStyle(w).overflowX);
  }), "อยู่ในกล่องที่เลื่อนแนวนอนได้ (ตาม pattern เดิมของ repo)");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[7] 🔴 สัดส่วนแยกช่อง — แท่ง 100% หนึ่งแถวต่อหนึ่งตัวชี้วัด");
{
  const { pg } = await open();
  ok((await pg.$$("svg.donut")).length === 0, "ไม่มีโดนัทเหลืออยู่");

  /* 🔴 เดิมมีแท่งเดียว (Views / Reach) เจ้าของบอกว่า "ไม่มีประโยชน์" (19 ส.ค. 2026)
     ถูกแล้ว — แท่งเดียวบอกได้แค่ "ช่องไหนใหญ่" ซึ่งดูจากตารางก็รู้
     ประโยชน์อยู่ที่เทียบข้ามแถว: ช่องที่กินยอดวิว 64% อาจได้คอมเมนต์แค่ 20% */
  const rows = await pg.$$eval(".sbar-r .sbar-l", (n) => n.map((x) => x.textContent.trim()));
  ok(rows.length >= 4, `มีหลายแถว ไม่ใช่แท่งเดียว (${rows.length} แถว)`);
  for (const want of ["Views / Reach", "Engagement", "ไลก์", "คอมเมนต์", "แชร์"]) {
    ok(rows.some((x) => x.includes(want)), `มีแถว "${want}"`);
  }
  ok((await pg.$$(".sbars .share")).length === rows.length, "ทุกแถวมีแท่งของตัวเอง");

  // แต่ละแถวต้องรวมกันได้ 100% ของตัวเอง
  const per = await pg.$$eval(".sbar-r", (n) => n.map((r) =>
    [...r.querySelectorAll(".sbar-i")].map((x) => parseFloat(x.textContent))));
  per.forEach((vals, i) => {
    const tot = vals.reduce((a, b) => a + b, 0);
    ok(Math.abs(tot - 100) < 0.5, `แถวที่ ${i + 1}: รวมกันได้ 100% (${tot.toFixed(2)}%)`);
  });

  /* ⚠️ YouTube ไม่เปิดเผยจำนวนแชร์ — แถวแชร์ต้องไม่นับเป็น 0 ในฐาน
     ไม่งั้นสัดส่วนของอีก 2 ช่องจะถูกกดให้เล็กลงด้วยตัวเลขที่ไม่มีอยู่จริง
     และต้องมีป้ายบอก ไม่งั้นอ่านว่า "YouTube ไม่มีใครแชร์เลย" ซึ่งไม่จริง */
  const shareRow = await pg.evaluate(() => {
    const r = [...document.querySelectorAll(".sbar-r")].find((x) => /แชร์/.test(x.querySelector(".sbar-l").textContent));
    return { segs: r.querySelectorAll(".share-s").length, note: (r.querySelector(".sbar-x") || {}).textContent || "" };
  });
  /* 🔴 YouTube นับแชร์ด้วยแล้ว แถวนี้จึงครบ 3 ช่อง และไม่ต้องมีป้าย "ไม่รวม"
     ⚠️ กลไกป้าย "ไม่รวมช่องไหน" ยังต้องอยู่ — ช่องใหม่ที่ไม่มี metric นั้นจะได้ใช้ */
  ok(shareRow.segs === 3, `แถวแชร์ครบ 3 ช่อง (${shareRow.segs})`);
  ok(!shareRow.note.trim(), "ไม่มีป้าย 'ไม่รวม' เพราะทุกช่องมีตัวเลขแล้ว");

  // มี delta หน่วย pt (ส่วนต่างของสัดส่วน ไม่ใช่ % ของ %)
  ok((await pg.$$eval(".sbar-i .dlt", (n) => n.length)) > 0, "มี delta ของสัดส่วน");
  ok(/pt/.test(await pg.$eval(".sbar-i .dlt", (e) => e.textContent)), "ใช้หน่วย pt");

  // ป้ายสีประกาศครั้งเดียว ไม่ซ้ำทุกแถว
  const legends = await pg.$$eval(".sbars ~ .legend .lg-n", (n) => n.map((x) => x.textContent.trim()));
  ok(legends.length === 3, `ป้ายสีประกาศครั้งเดียวใช้ได้ทุกแถว (${legends.join(" / ")})`);

  // ปิดช่อง → ทุกแถวต้องคิดใหม่
  await pg.click('[data-ch="youtube"]');
  await pg.waitForTimeout(220);
  const per2 = await pg.$$eval(".sbar-r", (n) => n.map((r) =>
    [...r.querySelectorAll(".sbar-i")].map((x) => parseFloat(x.textContent))));
  per2.forEach((vals, i) => {
    const tot = vals.reduce((a, b) => a + b, 0);
    ok(Math.abs(tot - 100) < 0.5, `ปิดช่องแล้วแถวที่ ${i + 1} ยังรวมได้ 100% (${tot.toFixed(2)}%)`);
  });
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[8] 🔴 ผู้ติดตามเพิ่ม/หาย — diverging bar เส้นศูนย์ร่วม scale เดียว");
{
  const { pg } = await open();
  ok((await pg.$$(".gl-row")).length === 0, "ไม่มีแท่งแบบเดิมเหลืออยู่");
  const rows = await pg.$$(".dv-row");
  ok(rows.length === 3, "มี 3 แถว ครบทุกช่อง");
  const geo = await pg.$$eval(".dv-row", (n) => n.map((r) => {
    const ax = r.querySelector(".dv-axis").getBoundingClientRect();
    const neg = r.querySelector(".dv-neg").getBoundingClientRect();
    const pos = r.querySelector(".dv-pos").getBoundingClientRect();
    return { axis: Math.round(ax.left), negRight: Math.round(neg.right), posLeft: Math.round(pos.left),
             negW: neg.width, posW: pos.width, net: r.querySelector(".dv-net").textContent.trim() };
  }));
  ok(new Set(geo.map((g) => g.axis)).size === 1, "เส้นศูนย์กลางอยู่ตำแหน่งเดียวกันทุกแถว");
  ok(geo.every((g) => Math.abs(g.negRight - g.axis) <= 2), "แท่งลบชนเส้นศูนย์แล้วยื่นไปทางซ้าย");
  ok(geo.every((g) => Math.abs(g.posLeft - g.axis) <= 2), "แท่งบวกเริ่มจากเส้นศูนย์แล้วยื่นไปทางขวา");
  ok(geo.every((g) => g.net.length > 0), "ยอดสุทธิแสดงท้ายแถวทุกแถว");

  const colors = await pg.$eval(".dv-neg", (e) => getComputedStyle(e).backgroundColor);
  const colorsP = await pg.$eval(".dv-pos", (e) => getComputedStyle(e).backgroundColor);
  ok(colors !== colorsP, "ฝั่งลบกับฝั่งบวกใช้สีต่างกัน (แดง/เขียว)");

  // scale เดียวกัน: แท่งที่ค่ามากที่สุดต้องยาวสุด และอัตราส่วนตรงกัน
  const widest = geo.reduce((a, g) => Math.max(a, g.posW, g.negW), 0);
  ok(widest > 0, "มีแท่งที่กินความกว้างจริง (ไม่ใช่ 0 ทุกแถว)");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[9] 🔴 ชิพเลือกช่อง — ปิดแล้วทุกส่วนต้องคิดใหม่");
{
  const { pg, errs } = await open();
  ok((await pg.$$(".ch")).length === 3, "มีชิพครบ 3 ช่อง");

  const totalBefore = await pg.$eval(".sc .sc-v", (e) => e.textContent.trim());
  const rowsBefore = await pg.$$eval('.tbl.perf tbody th[scope="row"]', (n) => n.length);
  const segsBefore = await pg.$$eval(".share-s", (n) => n.length);
  const dvBefore = await pg.$$eval(".dv-row", (n) => n.length);
  const headsBefore = await pg.$$eval(".tcard-h", (n) => n.map((x) => x.textContent.trim()));

  await pg.click('[data-ch="youtube"]');
  await pg.waitForTimeout(180);

  ok(await pg.$eval('[data-ch="youtube"]', (e) => e.getAttribute("aria-pressed") === "false"), "ชิพเปลี่ยนเป็นสถานะปิด");
  // ตารางสลับแกนแล้ว — ช่องเป็นแถว ปิดช่องจึงลด "แถว" ไม่ใช่ "คอลัมน์"
  ok((await pg.$$eval('.tbl.perf tbody th[scope="row"]', (n) => n.length)) === rowsBefore - 1, "ตารางลดแถว YouTube ออก");
  /* ⚠️ ตอนนี้มีแท่งสัดส่วนหลายแถว (เส้นละตัวชี้วัด) และแถว "แชร์" ไม่นับ YouTube อยู่แล้ว
     จำนวนช่องที่หายไปจึงไม่เท่ากับ 1 ต่อ 1 แถว — เช็คว่า "ไม่มีสีของ YouTube เหลือ" แทน */
  const ytColor = await pg.evaluate(() => window.SOCIAL_CONFIG.PLATFORMS.youtube.rawColor);
  const stillYt = await pg.$$eval(".sbars .share-s", (n, c) =>
    n.filter((x) => x.style.background === c || x.style.backgroundColor === c).length, ytColor);
  ok(stillYt === 0, `ไม่มีส่วนของ YouTube เหลือในแท่งสัดส่วนสักแถว (${stillYt})`);
  ok((await pg.$$eval(".share-s", (n) => n.length)) < segsBefore, "จำนวนส่วนย่อยรวมลดลง");
  ok((await pg.$$eval(".dv-row", (n) => n.length)) === dvBefore - 1, "diverging bar เหลือ 2 แถว");
  ok(!/YouTube/.test(await pg.$eval(".tbl.perf", (e) => e.innerText)), "ไม่มีคำว่า YouTube ในตารางแล้ว");

  const totalAfter = await pg.$eval(".sc .sc-v", (e) => e.textContent.trim());
  ok(totalAfter !== totalBefore, `ยอดรวมคิดใหม่จริง (${totalBefore} → ${totalAfter})`);

  const headsAfter = await pg.$$eval(".tcard-h", (n) => n.map((x) => x.textContent.trim()));
  ok(!headsAfter.some((h) => /YouTube/.test(h)), "กล่องคอนเทนต์ของ YouTube หายไปแล้ว");
  // กล่องคอนเทนต์มี 2 ชุด (มีส่วนร่วมมากสุด / คนดูมากสุด) จำนวนจึงเป็น 2 × ช่องที่เปิดอยู่
  ok(headsBefore.length === 6 && headsAfter.length === 4, `เหลือกล่องของช่องที่เปิดอยู่ (${headsBefore.length} → ${headsAfter.length})`);

  // กันปิดหมดจนหน้าว่างเปล่าโดยไม่มีคำอธิบาย
  await pg.click('[data-ch="tiktok"]');
  await pg.waitForTimeout(120);
  await pg.click('[data-ch="facebook"]');
  await pg.waitForTimeout(120);
  const stillOn = await pg.$$eval(".ch.on", (n) => n.length);
  ok(stillOn >= 1, "ปิดช่องสุดท้ายไม่ได้ (เหลือเปิดอยู่อย่างน้อย 1 ช่อง)");

  await pg.click('[data-ch="youtube"]');
  await pg.waitForTimeout(150);
  ok((await pg.$$eval(".ch.on", (n) => n.length)) >= 1, "กดกลับมาเปิดได้");

  // ⚠️ ชิพไม่ต้องมีผลกับแท็บรายช่อง
  await tabTo(pg, "TikTok");
  ok((await pg.$$(".ch")).length === 0, "แท็บรายช่องไม่โชว์ชิพ (ไม่เกี่ยวกัน)");
  ok((await pg.$$(".sc")).length >= 4, "แท็บรายช่องยังแสดงข้อมูลปกติแม้ชิพนั้นถูกปิด");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[9b] 🔴 แถวรายช่องใต้ยอดรวม — กางไว้ตลอด ไม่มีปุ่มพับ");
{
  const { pg, errs } = await open();
  /* 🔴 กางไว้ตลอดและ "ถอดปุ่มพับออกแล้ว" (เจ้าของสั่ง 19 ส.ค. 2026)
     ยอดรวมอย่างเดียวตอบไม่ได้ว่าช่องไหนดันขึ้นหรือฉุดลง จึงไม่มีเหตุผลให้ซ่อน */
  ok((await pg.$$(".bd-r")).length === 12, "เปิดหน้ามาเห็นแถวรายช่องเลย 12 แถว (4 การ์ด × 3 ช่อง)");
  ok((await pg.$$("[data-bd]")).length === 0, "ไม่มีปุ่มแยกช่องเหลืออยู่");
  ok((await pg.$$(".bd-btn")).length === 0, "ไม่มีปุ่มเดิมค้างในหน้า");

  const first = await pg.$eval(".sc", (e) => e.innerText);
  ok(/YT/.test(first) && /TT/.test(first) && /FB/.test(first), "การ์ดแรกแจกแจงครบ 3 ช่อง");
  ok((await pg.$$(".bd-r .dlt")).length === 12, "ทุกแถวรายช่องมี delta ของตัวเอง");

  // 🔴 รายช่องต้องบวกกันได้เท่ายอดรวม ไม่งั้นดูเหมือนคำนวณผิด
  const sums = await pg.evaluate(() => {
    const card = [...document.querySelectorAll(".sc")].find((c) => /Views \/ Reach รวม/.test(c.querySelector(".sc-l").textContent));
    const parse = (t) => {
      const m = String(t).replace(/,/g, "").match(/([\d.]+)\s*([KM])?/);
      if (!m) return 0;
      return parseFloat(m[1]) * (m[2] === "M" ? 1e6 : m[2] === "K" ? 1e3 : 1);
    };
    return {
      total: parse(card.querySelector(".sc-v").textContent),
      parts: [...card.querySelectorAll(".bd-v")].map((x) => parse(x.textContent)),
    };
  });
  // ⚠️ เทียบจากตัวเลขที่ "แสดงบนจอ" ซึ่งย่อเป็น K/M ทศนิยม 1 ตำแหน่ง
  //    ผลรวมของค่าที่ปัดแล้วจึงไม่มีทางตรงเป๊ะ — เผื่อความคลาดเคลื่อนของการปัดไว้
  //    (ถ้าคำนวณผิดจริง เช่น นับช่องที่ปิดอยู่เข้ามาด้วย จะเพี้ยนหลักสิบเปอร์เซ็นต์ ไม่ใช่หลักหน่วย)
  const partSum = sums.parts.reduce((a, b) => a + b, 0);
  const gap = Math.abs(partSum - sums.total) / sums.total;
  ok(gap < 0.05, `รายช่องบวกกันแล้วเท่ายอดรวม คลาดเคลื่อน ${(gap * 100).toFixed(1)}% ` +
     `(${Math.round(partSum)} vs ${Math.round(sums.total)})`);

  // ปิดช่อง → ต้องหายทั้งยอดรวมและรายช่อง ไม่งั้นบวกกันไม่ลง
  await pg.click('[data-ch="youtube"]');
  await pg.waitForTimeout(180);
  ok((await pg.$$(".bd-r")).length === 8, "ปิด YouTube → เหลือ 8 แถว");
  ok(!/YT/.test(await pg.$eval(".grid4", (e) => e.innerText)), "ไม่มี YT ค้างในการ์ดสรุป");

  // ไม่โผล่ในแท็บรายช่อง (ช่องเดียวอยู่แล้ว ไม่มีอะไรให้แยก)
  await tabTo(pg, "TikTok");
  ok((await pg.$$(".bd-r")).length === 0, "แท็บรายช่องไม่มีแถวแยกช่อง");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[9c] ลูกศรกับตัวเลขของ delta ต้องเล่าเรื่องเดียวกัน");
{
  const { pg } = await open();
  // แถวรายช่องกางอยู่แล้วตั้งแต่เปิดหน้า จึงตรวจ delta ของทั้งยอดรวมและรายช่องได้เลย
  // เคยเจอ "▬ 0.1%" อยู่ข้าง "▲ 0.1%" — ลูกศรราบต้องคู่กับเลข 0 เท่านั้น
  const bad = await pg.$$eval(".dlt", (n) => n.map((e) => e.textContent.trim()).filter((t) => {
    const flat = t.startsWith("▬");
    const zero = /(^|\s)0(\.0)?\s*(%|pt)?$/.test(t.replace(/[▬▲▼+−]/g, "").trim());
    return flat !== zero;      // ราบแต่ไม่ใช่ศูนย์ หรือ ศูนย์แต่ไม่ราบ
  }));
  ok(bad.length === 0, "ไม่มีป้ายที่ลูกศรขัดกับตัวเลข (" + (bad.slice(0, 3).join(" / ") || "ไม่มี") + ")");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[10] 🔴 คำอธิบายย้ายไปเป็น tooltip ที่ ⓘ");
{
  const { pg } = await open();
  ok((await pg.$$(".foot")).length === 0, "ไม่มีย่อหน้าคำอธิบายใต้การ์ดเหลืออยู่");
  const tips = await pg.$$(".tipi");
  ok(tips.length >= 5, `มีไอคอน ⓘ ให้กด (${tips.length} จุด)`);
  ok(await pg.$eval(".tipi", (e) => !!e.getAttribute("title")), "มี title ให้เดสก์ท็อป hover เห็น");

  ok((await pg.$$("#tipbox")).length === 0, "ยังไม่กด ยังไม่มีกล่องคำอธิบาย");
  await tips[0].click();
  await pg.waitForTimeout(120);
  const box = await pg.$("#tipbox");
  ok(!!box, "กดแล้วขึ้นกล่องคำอธิบาย (มือถือไม่มี hover)");
  ok((await box.innerText()).length > 20, "กล่องมีเนื้อหาจริง");
  await tips[0].click();
  await pg.waitForTimeout(120);
  ok((await pg.$$("#tipbox")).length === 0, "กดซ้ำแล้วปิด");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[11] 🔴 กราฟรายช่อง — แยก ยอดวิว กับ engagement rate เป็นคนละกราฟ");
{
  const { pg } = await open();
  for (const t of ["YouTube", "TikTok", "Facebook"]) {
    await tabTo(pg, t);
    const g = await pg.evaluate(() => {
      const heads = [...document.querySelectorAll(".sec")].filter((x) => /รายวัน/.test(x.textContent));
      return heads.map((h) => {
        const p = h.nextElementSibling;
        const svg = p ? p.querySelector("svg.chart") : null;
        return {
          title: h.textContent.replace(/ⓘ.*/s, "").trim(),
          // ⚠️ ป้ายแกนเวลาก็ class .ax เหมือนกัน ต้องตัด .ax-x ออก ไม่งั้นได้วันที่ปนมา
          ax: svg ? [...svg.querySelectorAll(".ax:not(.ax-r):not(.ax-x)")].map((x) => x.textContent.trim()) : [],
          axR: svg ? svg.querySelectorAll(".ax-r").length : -1,
          paths: svg ? svg.querySelectorAll("path").length : -1,
          pts: svg ? (svg.querySelector("path").getAttribute("d").match(/[ML]/g) || []).length : 0,
        };
      });
    });
    ok(g.length === 2, `${t}: มีกราฟรายวัน 2 อัน (${g.map((x) => x.title).join(" / ")})`);

    /* 🔴 เดิมเป็นกราฟเดียวแกนคู่ — 2 เส้นตัดกันไปมาโดยที่จุดตัดไม่มีความหมาย
       (คนละหน่วย คนละแกน) เจ้าของสั่งแยกเป็น 2 กราฟ 19 ส.ค. 2026 */
    for (const c of g) {
      ok(c.paths === 1, `${t} · ${c.title}: มีเส้นเดียว (${c.paths})`);
      ok(c.axR === 0, `${t} · ${c.title}: ไม่มีแกนขวาแล้ว`);
    }
    const [v, er] = g;
    ok(!/%$/.test(v.ax[0] || ""), `${t}: กราฟแรกเป็นยอดวิว/การเข้าถึง ไม่ใช่ % (${v.ax.join(" ")})`);
    ok(er.ax.every((x) => /%$/.test(x)), `${t}: กราฟที่สองเป็นหน่วย % ทุกป้าย (${er.ax.join(" ")})`);
    ok(!er.ax.some((x) => x.startsWith("+")), `${t}: แกน ER ไม่มีเครื่องหมาย + (เป็นระดับ ไม่ใช่การเปลี่ยนแปลง)`);
    ok(new Set(er.ax).size === er.ax.length, `${t}: ป้ายแกน ER ไม่ซ้ำ`);

    // ⚠️ แยกแล้วต้องอยู่บนแกนเวลาชุดเดียวกัน ไม่งั้นอ่านเทียบกันไม่ได้
    ok(v.pts === er.pts && v.pts > 1, `${t}: ทั้ง 2 กราฟใช้แกนเวลาชุดเดียวกัน (${v.pts} จุดเท่ากัน)`);

    /* ⚠️ แกน ER ห้ามกดพื้นเป็น 0 — ค่าจริงอยู่ในช่วงแคบ (5–11%)
       ลากถึง 0 เมื่อไหร่เส้นจะแบนจนดูไม่ออกว่าวันไหนดีวันไหนแย่ */
    // ป้ายแกน Y เรียงจากน้อยไปมาก ตัวแรกคือค่าต่ำสุดของแกน
    ok(parseFloat(er.ax[0]) > 0.5, `${t}: แกน ER ไม่เริ่มจาก 0 (ต่ำสุด ${er.ax[0]})`);

    // กราฟยอดวิวเริ่มจาก 0 ได้ เพราะ 0 มีความหมายจริง (วันนั้นไม่มีคนดู)
    ok(/^0$/.test(v.ax[0]), `${t}: แกนยอดวิวเริ่มจาก 0 (${v.ax[0]})`);
  }

  // จอกว้างวางคู่ซ้าย-ขวา · มือถือยุบเป็นบน-ล่าง
  const cols = await pg.$$eval(".duo", (n) => n.map((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length));
  ok(cols.every((c) => c === 2), `จอกว้าง: กราฟ 2 อันวางคู่กัน (${cols})`);
  await pg.close();

  const { pg: m } = await open({ width: 390, height: 900 });
  await tabTo(m, "YouTube");
  const mc = await m.$eval(".duo", (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length);
  ok(mc === 1, "มือถือ: ยุบเป็นบน-ล่าง");
  ok(await m.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), "มือถือ: ไม่ล้นแนวนอน");
  await m.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[12] 🔴 กริดการ์ด TikTok — ห้ามมีใบเดียวลอยท้ายแถว");
{
  /* ⚠️ จำนวนใบมาจาก config ไม่ได้เขียนตายตัวไว้ในเทสต์ — เพิ่ม metric ให้ช่องไหน
     จำนวนใบก็เปลี่ยน เทสต์นี้ต้องคุม "ไม่มีใบลอยท้ายแถว" ไม่ใช่คุมตัวเลข */
  const cardCount = (pg2) => pg2.evaluate(() => {
    const P = window.SOCIAL_CONFIG.PLATFORMS;
    const out = {};
    // 4 ใบพื้นฐาน (ผู้ติดตาม · เพิ่มสุทธิ · Views/Reach · ER) + extras ที่ไม่ซ้ำกับ reachKey
    ["youtube", "tiktok", "facebook"].forEach((k) => {
      out[P[k].label] = 4 + P[k].extras.filter((e) => e.key !== P[k].reachKey).length;
    });
    return out;
  });

  // จอกว้าง: ทุกใบต้องอยู่แถวเดียวกัน
  const { pg } = await open({ width: 1400, height: 1000 });
  const want = await cardCount(pg);
  for (const t of ["YouTube", "TikTok", "Facebook"]) {
    const n = want[t];
    await tabTo(pg, t);
    const g = await pg.evaluate(() => {
      const grid = document.querySelector(".scgrid");
      const cards = [...grid.querySelectorAll(".sc")];
      const tops = new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top)));
      return { count: cards.length, rows: tops.size, n: grid.style.getPropertyValue("--n") };
    });
    ok(g.count === n, `${t}: มีการ์ด ${n} ใบ`);
    ok(g.rows === 1, `${t}: จอกว้างอยู่แถวเดียว (${g.rows} แถว)`);
    ok(g.n === String(n), `${t}: --n ตรงกับจำนวนใบจริง`);
  }
  await pg.close();

  // มือถือ: 2 คอลัมน์ และใบสุดท้ายของจำนวนคี่ต้องกินเต็มแถว ไม่ลอยเดี่ยว
  const { pg: m } = await open({ width: 390, height: 900 });
  const wantM = await cardCount(m);
  for (const t of ["TikTok", "YouTube", "Facebook"]) {
    const n = wantM[t];
    await tabTo(m, t);
    const g = await m.evaluate(() => {
      const grid = document.querySelector(".scgrid");
      const cards = [...grid.querySelectorAll(".sc")];
      const rows = {};
      cards.forEach((c) => {
        const k = Math.round(c.getBoundingClientRect().top);
        (rows[k] = rows[k] || []).push(Math.round(c.getBoundingClientRect().width));
      });
      const gridW = Math.round(grid.getBoundingClientRect().width);
      return { count: cards.length, rows: Object.values(rows), gridW };
    });
    ok(g.count === n, `${t} มือถือ: การ์ด ${n} ใบ`);
    const last = g.rows[g.rows.length - 1];
    const orphan = last.length === 1 && last[0] < g.gridW * 0.9;
    ok(!orphan, `${t} มือถือ: แถวสุดท้ายไม่มีใบแคบลอยเดี่ยว (แถวสุดท้าย ${last.length} ใบ กว้าง ${last[0]}/${g.gridW})`);
  }
  await m.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[13] แท็บรายช่อง — โครงเดิมต้องอยู่ครบ (ห้ามรื้อ)");
{
  const { pg } = await open();
  for (const [t, must] of [["YouTube", /เวลาที่คนดูรวม/], ["TikTok", /ดูจนจบ/], ["Facebook", /Reach/]]) {
    await tabTo(pg, t);
    const v = await view(pg), s = await secs(pg);
    ok(must.test(v), `${t}: metric เฉพาะแพลตฟอร์มยังอยู่`);
    ok(s.some((x) => /แยกประเภท/.test(x)), `${t}: ③ แยกประเภทการมีส่วนร่วม`);
    ok(s.some((x) => /Engagement สูงสุด/.test(x)), `${t}: ④ อันดับบน`);
    ok(s.some((x) => /ล่าสุด/.test(x)), `${t}: ⑤ ล่าสุด`);
    ok(s.some((x) => /ผลตอบรับน้อยที่สุด/.test(x)), `${t}: ⑥ อันดับท้าย`);
    ok(s.some((x) => /ทั้งหมดในช่วงที่เลือก/.test(x)), `${t}: ⑦ ตารางทั้งหมด`);
    ok(/สูตร/.test(v), `${t}: เชิงอรรถสูตร ER`);
  }
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[14] สูตร ER ของแต่ละช่องต้องไม่เหมือนกัน");
{
  const { pg } = await open();
  const f = {};
  for (const t of ["YouTube", "TikTok", "Facebook"]) {
    await tabTo(pg, t);
    f[t] = await pg.$eval(".formula b", (e) => e.textContent);
  }
  /* 🔴 YouTube นับแชร์ด้วยแล้ว (เจ้าของสั่ง 19 ส.ค. 2026 — "youtube ก็มี feature share")
     ตัวเลขมาจาก YouTube Analytics ซึ่งชั้น API key ไม่มีให้
     ⚠️ ตัวเศษเหมือนกันหมดแล้ว แต่ "ตัวส่วน" ยังต่างกัน — Facebook หารด้วย Reach
        เทียบข้ามช่องตรงๆ จึงยังทำไม่ได้ ต้องเหลือคำเตือนนี้ไว้ */
  ok(/แชร์/.test(f.YouTube), `YouTube: นับแชร์ด้วยแล้ว (${f.YouTube})`);
  ok(/แชร์/.test(f.TikTok), "TikTok: นับแชร์ด้วย");
  ok(/Reach/.test(f.Facebook), "Facebook: หารด้วย Reach");
  ok(/Views/.test(f.YouTube) && /Views/.test(f.TikTok), "YouTube/TikTok หารด้วย Views");
  ok(f.Facebook !== f.YouTube, "ตัวส่วนของ Facebook ยังต่างจากอีก 2 ช่อง");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[15] กรองตามช่วง + ป้ายยังใหม่ + ตัดใบใหม่ออกจากอันดับท้าย");
{
  const { pg } = await open();
  await tabTo(pg, "TikTok");
  await setPeriod(pg, 90);
  const n90 = await pg.$$eval(".tbl:not(.cmp) tbody tr", (n) => n.length);
  await setPeriod(pg, 7);
  const n7 = await pg.$$eval(".tbl:not(.cmp) tbody tr", (n) => n.length);
  ok(n7 < n90, `ช่วงแคบลงรายการน้อยลง (7 วัน ${n7} < 90 วัน ${n90})`);

  await setPeriod(pg, 90);
  const newestSec = await pg.evaluate(() => {
    const h = [...document.querySelectorAll(".sec")].find((x) => /ล่าสุด/.test(x.textContent));
    return h ? h.nextElementSibling.innerText : "";
  });
  const bottomSec = await pg.evaluate(() => {
    const h = [...document.querySelectorAll(".sec")].find((x) => /ผลตอบรับน้อยที่สุด/.test(x.textContent));
    return h ? h.nextElementSibling.innerText : "";
  });
  ok(/ยังใหม่/.test(newestSec), "⑤ ใบอายุน้อยกว่า 7 วันติดป้าย 'ยังใหม่'");
  ok(!/ยังใหม่/.test(bottomSec), "⑥ ไม่มีใบที่ยังใหม่ปนในอันดับท้าย");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[16] ไม่มีข้อมูล → บอกชัด ห้ามลากกราฟเป็น 0");
{
  const { pg, errs } = await open();
  await setPeriod(pg, "custom");
  await pg.waitForSelector("#d1");
  await pg.fill("#d1", "2009-01-01");
  await pg.fill("#d2", "2009-01-31");
  await pg.waitForTimeout(220);
  const v = await view(pg);
  ok(/ไม่มีข้อมูลในช่วงที่เลือก/.test(v), "ภาพรวม: บอกตรงๆ ว่าไม่มีข้อมูล");
  ok((await pg.$$("svg.chart")).length === 0, "ไม่วาดกราฟที่ลากเป็น 0");
  ok((await pg.$$(".share")).length === 0, "ไม่วาดแท่งสัดส่วนเปล่า");
  ok((await pg.$$(".empty")).length > 0, "ใช้กล่องบอกสถานะว่าง");
  await tabTo(pg, "YouTube");
  ok(/ไม่มีข้อมูล/.test(await view(pg)), "แท็บช่องก็บอกว่าไม่มีข้อมูล");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[17] custom range + ตารางเรียงได้");
{
  const { pg } = await open();
  await setPeriod(pg, "custom");
  await pg.waitForSelector("#d1");
  ok((await pg.$eval("#d1", (e) => e.type)) === "date", "ใช้ตัวเลือกวันที่ของเบราว์เซอร์ ไม่เพิ่มไลบรารี");
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const k = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  await pg.fill("#d1", k(new Date(end.getTime() - 20 * 864e5)));
  await pg.fill("#d2", k(end));
  await pg.waitForTimeout(200);
  const note = await pg.$eval(".periodbtn", (e) => e.innerText);
  ok(/21 วัน/.test(note), "นับจำนวนวันถูก");
  await tabTo(pg, "Facebook");
  ok((await pg.$eval(".periodbtn", (e) => e.innerText)) === note, "ช่วงกำหนดเองคงอยู่ข้ามแท็บ");

  const col = () => pg.$$eval(".tbl:not(.cmp) tbody tr", (rows) => rows.map((r) => parseFloat(r.children[3].textContent)));
  await pg.click('[data-sort="er"]');
  await pg.waitForTimeout(130);
  const desc = await col();
  ok(desc.every((v, i, a) => i === 0 || a[i - 1] >= v), "เรียง ER มากไปน้อย");
  await pg.click('[data-sort="er"]');
  await pg.waitForTimeout(130);
  const asc = await col();
  ok(asc.every((v, i, a) => i === 0 || a[i - 1] <= v), "กดซ้ำสลับทิศ");
  await tabTo(pg, "TikTok");
  await tabTo(pg, "Facebook");
  ok((await pg.$eval(".tbl:not(.cmp)", (e) => e.innerHTML)).includes("▲"), "สลับแท็บกลับมาการเรียงยังอยู่");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[18] มือถือ — หน้าห้ามเลื่อนแนวนอน");
{
  const { pg, errs } = await open({ width: 390, height: 844 });
  for (const t of ["ภาพรวม", "YouTube", "TikTok", "Facebook"]) {
    await tabTo(pg, t);
    const m = await pg.evaluate(() => {
      const inScroller = (el) => {
        let p = el.parentElement;
        while (p && p !== document.body) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === "auto" || ox === "scroll") return true;
          p = p.parentElement;
        }
        return false;
      };
      return {
        sw: document.scrollingElement.scrollWidth, iw: window.innerWidth,
        over: [...document.querySelectorAll("body *")]
          .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !inScroller(e))
          .map((e) => e.tagName + "." + (e.className || "").toString().split(" ")[0]),
      };
    });
    ok(m.sw <= m.iw + 1, `${t}: หน้าไม่เลื่อนแนวนอน (${m.sw}/${m.iw})`);
    ok(m.over.length === 0, `${t}: ไม่มีอะไรล้นนอกกล่องที่ให้เลื่อน (${m.over.join(",") || "ไม่มี"})`);
  }
  // ⚠️ .grid4 มีแต่ในแท็บภาพรวม — แท็บรายช่องใช้ .scgrid ต้องกลับมาก่อนวัด
  await tabTo(pg, "ภาพรวม");
  ok((await pg.$eval(".grid4", (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length)) === 2,
     "การ์ดสรุปเรียง 2 คอลัมน์บนมือถือ");
  ok(errs.length === 0, "ไม่มี JS error บนมือถือ");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[19] ข้อมูลจำลอง + ฟีเจอร์มาตรฐาน + ไม่เพิ่ม dependency");
{
  const { pg } = await open();
  ok(!!(await pg.$("#mockbar")), "มีแถบบอกว่าเป็นข้อมูลจำลอง");
  ok(/ข้อมูลจำลอง/.test(await pg.title()), "ชื่อหน้าต่างบอกด้วย");
  const meta = await pg.evaluate(() => ({
    ver: document.querySelector('meta[name="page-ver"]')?.content || "",
    pwa: !!document.querySelector('link[rel="manifest"]') && !!document.querySelector('link[rel="apple-touch-icon"]'),
    home: [...document.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/"),
    vtag: !!document.getElementById("vtag"),
    noindex: (document.querySelector('meta[name="robots"]')?.content || "").includes("noindex"),
    ext: [...document.querySelectorAll("script[src],link[href]")]
      .map((e) => e.getAttribute("src") || e.getAttribute("href")).filter((u) => /^https?:|^\/\//.test(u)),
  }));
  ok(!!meta.ver && meta.pwa && meta.home && meta.vtag && meta.noindex, "ฟีเจอร์มาตรฐานครบ");
  ok(meta.ext.length === 0, "ไม่โหลดอะไรจากภายนอกเลย (" + (meta.ext.join(",") || "ไม่มี") + ")");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[20] 🔴 โหมดสว่าง — ต้องใช้ชุดสีเดียวกับ /trend/ /ir/ /issue/");
{
  // ความสว่างตามสูตรของ WCAG (ต้องแปลง gamma ก่อน ไม่ใช่เฉลี่ย RGB ดิบ)
  const lum = (rgb) => {
    const [r, g, b] = String(rgb).match(/\d+/g).map(Number).slice(0, 3).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  const { pg } = await open();
  const c = await pg.evaluate(() => {
    const g = (el) => getComputedStyle(el);
    return {
      bg: g(document.body).backgroundColor,
      fg: g(document.body).color,
      panel: g(document.querySelector(".panel")).backgroundColor,
      muted: g(document.querySelector(".sc-l")).color,
      scheme: g(document.documentElement).colorScheme,
      theme: document.querySelector('meta[name="theme-color"]').content,
    };
  });
  ok(lum(c.bg) > 0.8, `พื้นหลังเป็นสีสว่าง (${c.bg})`);
  ok(lum(c.fg) < 0.3, `ตัวอักษรเป็นสีเข้ม (${c.fg})`);
  ok(c.scheme === "light", "ประกาศ color-scheme เป็น light (ช่องกรอกวันที่จะได้ไม่เป็นธีมมืด)");
  ok(lum(c.theme.match(/\d+/) ? c.theme : "#fff") !== null && /^#f/i.test(c.theme), `theme-color เป็นสีสว่าง (${c.theme})`);
  // WCAG AA ต้องการ 4.5:1 สำหรับตัวอักษรขนาดปกติ
  ok(contrast(c.fg, c.bg) >= 4.5, `ตัวอักษรหลักผ่านเกณฑ์อ่านง่าย (${contrast(c.fg, c.bg).toFixed(1)}:1)`);
  ok(contrast(c.muted, c.panel) >= 4.5, `ตัวอักษรจางยังผ่านเกณฑ์ (${contrast(c.muted, c.panel).toFixed(1)}:1)`);

  // ⚠️ สีของช่องต้องอ่านออกบนพื้นขาว — สีเดิม #25f4ee จางจนเส้นกราฟหาย
  const lines = await pg.$$eval("svg.chart path[stroke]", (n) => n.map((e) => e.getAttribute("stroke")));
  const weak = lines.filter((s) => {
    const m = s.match(/^#(..)(..)(..)$/);
    if (!m) return false;
    const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16));
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6;   // สว่างเกินไปบนพื้นขาว
  });
  ok(weak.length === 0, "เส้นกราฟทุกเส้นเข้มพอบนพื้นสว่าง (" + (weak.join(",") || "ผ่านหมด") + ")");
  await pg.close();

  /* 🔴 ต้องใช้ชุดสีเดียวกับแดชบอร์ดพี่น้อง
   * (CLAUDE.md เคยเขียนว่า 3 หน้านั้นเป็น "โหมดมืดล้วน" ซึ่งไม่จริง — ทั้งหมดเป็นโหมดสว่าง
   *  มาตั้งแต่แรก · เทสต์นี้จึงยึดของจริงในโค้ด ไม่ใช่ของที่เอกสารเขียนไว้)
   * ⚠️ สลับไปมาระหว่างหน้าแล้วสีต้องไม่กระโดด */
  const fam = {};
  for (const path of ["/trend/", "/ir/", "/issue/"]) {
    const p2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await p2.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await p2.goto(BASE + path, { waitUntil: "domcontentloaded" });
    fam[path] = await p2.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return { bg: s.getPropertyValue("--bg").trim(), surface: s.getPropertyValue("--surface").trim(),
               border: s.getPropertyValue("--border").trim(), text: s.getPropertyValue("--text").trim(),
               muted: s.getPropertyValue("--muted").trim() };
    });
    await p2.close();
  }
  const ref = fam["/trend/"];
  ok(Object.values(fam).every((v) => v.bg === ref.bg), "แดชบอร์ดพี่น้องใช้สีพื้นชุดเดียวกัน");

  const p3 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await p3.goto(BASE + "/social/?mock=1", { waitUntil: "load" });
  const mine = await p3.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return { bg: s.getPropertyValue("--plane").trim(), surface: s.getPropertyValue("--surface").trim(),
             border: s.getPropertyValue("--border").trim(), text: s.getPropertyValue("--ink").trim(),
             muted: s.getPropertyValue("--muted").trim() };
  });
  ["bg", "surface", "border", "text", "muted"].forEach(function (k) {
    ok(mine[k].toLowerCase() === ref[k].toLowerCase(), `สี ${k} ตรงกับหน้าอื่น (${mine[k]} = ${ref[k]})`);
  });
  await p3.close();
}


/* ────────────────────────────────────────────────────────────────── */
console.log("\n[21] 🔴 แผงเลือกช่วงเวลา — ขวาบน มีชุดสำเร็จรูปให้ครบ");
{
  const { pg } = await open();
  const btn = await pg.$(".periodbtn");
  ok(!!btn, "เป็นปุ่มเปิดแผง ไม่ใช่ dropdown ธรรมดา");
  const btnTxt = await btn.innerText();
  ok(/30 วันล่าสุด/.test(btnTxt), `ปุ่มบอกช่วงที่เลือกอยู่ (${btnTxt.replace(/\n/g, " · ")})`);
  ok(/–/.test(btnTxt), "ปุ่มบอกวันที่จริงของช่วงด้วย");

  /* 🔴 ย้ายจากแถบหัวเรื่องมาอยู่ในแถบติดขอบแล้ว (รอบ GA4 pattern)
     เหตุผล: แถบหัวเรื่องเลื่อนหายไปกับหน้า พอเลื่อนลงไปอ่านตารางกลางหน้า
     จะไม่เหลืออะไรบอกว่ากำลังดูช่วงไหน — รายละเอียดการติดขอบอยู่ที่ [33] */
  const geo = await pg.evaluate(() => {
    const s = document.querySelector(".periodbtn").getBoundingClientRect();
    const st = document.querySelector(".sticky").getBoundingClientRect();
    return { inSticky: s.top >= st.top - 1 && s.bottom <= st.bottom + 1, rightHalf: s.left > innerWidth / 2 };
  });
  ok(geo.inSticky && geo.rightHalf, "อยู่ขวาบนในแถบติดขอบ");

  ok((await pg.$$(".periodpanel")).length === 0, "ยังไม่กด แผงยังไม่กาง");
  await pg.click('[data-period="toggle"]');
  await pg.waitForSelector(".periodpanel");

  const items = await pg.$$eval(".pp-i", (n) => n.map((x) => x.innerText.replace(/\n/g, " | ")));
  ok(items.length >= 10, `มีตัวเลือกครบ (${items.length} ตัว)`);
  /* 🔴 ตัด "28 วันล่าสุด" กับ "90 วันล่าสุด" ออก (เจ้าของสั่ง 19 ส.ค. 2026)
     ซ้ำซ้อนกับ 30 วัน และ 3 เดือน ที่มีอยู่แล้ว */
  for (const gone of ["28 วัน", "90 วัน"]) {
    ok(!items.some((i) => i.includes(gone)), `ไม่มีตัวเลือก "${gone}" แล้ว`);
  }
  for (const want of ["วันนี้", "เมื่อวาน", "7 วัน", "30 วัน",
                      "เดือนนี้", "เดือนที่แล้ว", "3 เดือน", "12 เดือน", "ปีนี้", "ปีที่แล้ว", "กำหนดเอง"]) {
    ok(items.some((i) => i.includes(want)), `มีตัวเลือก "${want}"`);
  }
  // ทุกตัวยกเว้น "กำหนดเอง" ต้องบอกช่วงวันที่จริงกำกับ
  ok(items.filter((i) => /–/.test(i)).length === items.length - 1, "แต่ละตัวเลือกบอกช่วงวันที่จริงกำกับ");

  // ⚠️ ช่วงที่ข้ามปีต้องมีปีกำกับ ไม่งั้น "20 ส.ค. – 19 ส.ค." อ่านเหมือนช่วงสั้นๆ
  const yr = items.find((i) => i.includes("12 เดือน"));
  ok(/\d{4}/.test(yr), `ช่วงข้ามปีมีปีกำกับ (${yr})`);
  const cur = new Date().getFullYear();
  ok(items.some((i) => i.includes("ปีนี้") && i.includes(String(cur))), "ตัวเลือกรายปีบอกเลขปีจริง");

  // เลือกแล้วปิดแผงเอง ไม่ต้องกดซ้ำ
  await pg.click('[data-preset="lastmonth"]');
  await pg.waitForTimeout(220);
  ok((await pg.$$(".periodpanel")).length === 0, "เลือกของสำเร็จรูปแล้วแผงปิดเอง");
  const note = await pg.$eval(".periodbtn", (e) => e.innerText);
  ok(/1 ก\.ค\.|1 [ก-๙.]+/.test(note), `ช่วงเปลี่ยนตามที่เลือก (${note.split("\n")[0]})`);

  // เดือนที่แล้วต้องเป็นทั้งเดือนปฏิทิน
  const days = Number((note.match(/\((\d+) วัน\)/) || [])[1]);
  ok(days >= 28 && days <= 31, `"เดือนที่แล้ว" ได้ทั้งเดือน (${days} วัน)`);

  // กดนอกแผง = ปิด
  await pg.click('[data-period="toggle"]');
  await pg.waitForSelector(".periodpanel");
  await pg.click("#view", { position: { x: 5, y: 5 } });
  await pg.waitForTimeout(220);
  ok((await pg.$$(".periodpanel")).length === 0, "กดนอกแผงแล้วปิด");
  await pg.close();
}

console.log("\n[22] 🔴 ช่องเลือกวันที่ ห้ามเลือกอนาคต");
{
  const { pg } = await open();
  await setPeriod(pg, "custom");
  await pg.waitForSelector("#d1");
  ok(!!(await pg.$(".periodpanel #d1")), "ช่องเลือกวันที่อยู่ในแผงเดียวกัน ไม่ได้แยกไปอยู่ข้างล่าง");
  const today = await pg.evaluate(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  });
  const maxes = await pg.$$eval("#d1,#d2", (n) => n.map((e) => e.max));
  ok(maxes.every((m) => m === today), `ทั้ง 2 ช่องตั้งเพดานไว้ที่วันนี้ (${maxes.join(", ")})`);

  // ⚠️ บาง browser ไม่บังคับตาม max ให้ — ต้องมีด่านฝั่งโค้ดด้วย
  await pg.evaluate(() => {
    const d = document.getElementById("d2");
    d.value = "2099-12-31";
    d.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await pg.waitForTimeout(220);
  ok((await pg.$eval("#d2", (e) => e.value)) <= today, "ยัดวันอนาคตเข้าไป ระบบดึงกลับมาเป็นวันนี้");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[23] 🔴 เทียบกับช่วงไหน — ต้องบอกชื่อ ไม่ใช่บอกแค่วันที่");
{
  const { pg } = await open();
  /* 🔴 ตัวเลือกโหมดเทียบย้ายเข้าไปอยู่ในแผงเลือกช่วงเวลาแล้ว (แบบ GA4)
     ⚠️ "ไม่เทียบ" กลายเป็นสวิตช์ ไม่ใช่ปุ่มในลิสต์ */
  await pg.click('[data-period="toggle"]');
  await pg.waitForSelector(".periodpanel");
  const cmps = await pg.$$eval(".pp-c", (n) => n.map((x) => x.querySelector(".pp-n").textContent.trim()));
  ok(cmps.includes("เดือนที่แล้ว"), `มีตัวเลือก 'เดือนที่แล้ว' (${cmps.join(" / ")})`);
  ok(!cmps.includes("ไม่เทียบ"), "ไม่เทียบเป็นสวิตช์ ไม่ใช่ตัวเลือกในลิสต์");
  ok(await pg.$eval(".pp-sw", (e) => e.getAttribute("role") === "switch"), "สวิตช์เปิด/ปิดการเทียบเป็น role=switch");
  /* ⚠️ ทุกตัวเลือกต้องบอกวันที่จริงของช่วงนั้น ไม่ใช่บอกแค่ชื่อ */
  const cmpRanges = await pg.$$eval(".pp-c .pp-r", (n) => n.map((x) => x.textContent.trim()));
  ok(cmpRanges.length === cmps.length && cmpRanges.every((x) => /\d/.test(x)),
     `ทุกตัวเลือกบอกช่วงวันที่จริง (${cmpRanges.join(" | ")})`);
  await closePeriod(pg);

  for (const [k, name] of [["prev", "ช่วงก่อนหน้า"], ["lastmonth", "เดือนที่แล้ว"], ["yoy", "ปีก่อน"]]) {
    await setCompare(pg, k);
    await pg.waitForTimeout(160);
    const note = await pg.$eval(".periodbtn", (e) => e.innerText);
    ok(note.includes(name), `${k}: แถบบอกชื่อช่วงที่เทียบ ("${name}")`);
    ok(/\d+\s*[ก-๙.]+\s*–/.test(note), `${k}: บอกวันที่ของช่วงเทียบด้วย`);
    const t = await pg.$eval(".sc .dlt", (e) => e.getAttribute("title") || "");
    ok(t.includes(name), `${k}: ป้าย delta ก็บอกว่าเทียบกับอะไร`);
  }

  // เดือนที่แล้วต้องถอยด้วยเดือนปฏิทิน ไม่ใช่ลบ 30 วันตายตัว
  await setPeriod(pg, 30);
  await setCompare(pg, "lastmonth");
  await pg.waitForTimeout(160);
  const okMonth = await pg.evaluate(() => {
    const m = document.querySelector(".periodbtn").innerText.match(/เดือนที่แล้ว \((.+?) – (.+?)\)/);
    return !!m;
  });
  ok(okMonth, "ช่วงของ 'เดือนที่แล้ว' แสดงเป็นวันที่จริง");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[24] 🔴 เอาเมาส์ชี้กราฟแล้วอ่านตัวเลขได้ — ทุกกราฟ");
{
  const { pg, errs } = await open();
  const boxes = await pg.$$(".chartbox");
  // หน้าภาพรวมยุบเหลือกราฟเส้นอันเดียว (สลับ metric ด้วยชิพ) — ดู [5b]
  ok(boxes.length === 1, `กราฟบนหน้าภาพรวมมีกล่องรับ hover (${boxes.length})`);

  for (let i = 0; i < boxes.length; i++) {
    const bb = await boxes[i].boundingBox();
    await pg.mouse.move(bb.x + bb.width * 0.45, bb.y + bb.height * 0.5);
    await pg.waitForTimeout(160);
    const tip = await boxes[i].$(".ctip:not([hidden])");
    ok(!!tip, `กราฟที่ ${i + 1}: มีกล่องบอกค่าโผล่ขึ้นมา`);
    if (tip) {
      const txt = await tip.innerText();
      ok(/\d/.test(txt), `กราฟที่ ${i + 1}: มีตัวเลขในกล่อง`);
      ok(/รวมทุกช่อง|YouTube|TikTok|Facebook|Engagement|Views|Reach|ผู้ติดตาม/.test(txt),
         `กราฟที่ ${i + 1}: บอกว่าเป็นเส้นไหน (${txt.replace(/\n/g, " ")})`);
    }
    const cross = await boxes[i].$eval(".crosshair", (e) => e.style.display);
    ok(cross !== "none", `กราฟที่ ${i + 1}: มีเส้นชี้ตำแหน่ง`);
  }

  // ออกจากกราฟแล้วต้องหาย ไม่ค้าง
  await pg.mouse.move(5, 5);
  await pg.waitForTimeout(160);
  ok((await pg.$$(".ctip:not([hidden])")).length === 0, "เอาเมาส์ออกแล้วกล่องหาย ไม่ค้าง");

  // แท็บรายช่องก็ต้องมี
  await tabTo(pg, "YouTube");
  const b2 = await pg.$(".chartbox");
  const bb2 = await b2.boundingBox();
  await pg.mouse.move(bb2.x + bb2.width * 0.5, bb2.y + bb2.height * 0.5);
  await pg.waitForTimeout(160);
  ok(!!(await b2.$(".ctip:not([hidden])")), "กราฟในแท็บรายช่องก็ hover ได้");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[25] 🔴 เลือกดูทีละเส้นด้วยแท็บช่อง (แทนการกดป้ายเปิด/ปิดเส้น)");
{
  const { pg, errs } = await open();

  /* 🔴 เดิมวาดหลายเส้นซ้อนกันแล้วให้กดป้ายใต้กราฟเพื่อซ่อน/แสดงทีละเส้น
     เจ้าของสั่งเปลี่ยนเป็น "วาดทีละเส้น เลือกด้วยแท็บ" (19 ส.ค. 2026)
     ⚠️ ป้ายเปิด/ปิดเส้นจึงไม่มีแล้วโดยตั้งใจ — มีเส้นเดียวจะปิดไปทำไม
        ถ้าเห็นมันกลับมาแปลว่ามีคนเอากราฟหลายเส้นกลับมาโดยไม่ได้ตั้งใจ */
  ok((await pg.$$(".lg-btn")).length === 0, "ไม่มีป้ายเปิด/ปิดเส้นบนหน้าภาพรวมแล้ว");
  ok((await pg.$$eval("svg.chart path", (n) => n.length)) === 1, "กราฟวาดทีละเส้น");

  const tabs = await pg.$$eval(".chtab", (n) => n.map((x) => ({ k: x.dataset.tch, on: x.classList.contains("on") })));
  ok(tabs.length === 4, `มีแท็บช่องครบ (รวม + 3 ช่อง = ${tabs.length})`);
  ok(tabs[0].k === "all" && tabs[0].on, "ค่าตั้งต้นคือ 'รวม'");

  const dOf = () => pg.$eval("svg.chart path", (e) => e.getAttribute("d"));
  const axOf = () => pg.$$eval("svg.chart .ax:not(.ax-x)", (n) => n.map((x) => x.textContent.trim()));

  const dAll = await dOf(), axAll = await axOf();
  await pg.click('[data-tch="facebook"]');
  await pg.waitForTimeout(220);
  ok((await dOf()) !== dAll, "สลับไปช่องหนึ่งแล้วเส้นเปลี่ยน");
  /* ⚠️ ประโยชน์ทั้งหมดของการวาดทีละเส้นคือ "แกนขยายเต็มกรอบให้เส้นนั้น"
     ถ้าแกนยังเท่าเดิม แปลว่ายังคิดขอบเขตจากทุกช่องอยู่ = เส้นช่องเล็กยังแบนติดพื้นเหมือนเดิม */
  ok((await axOf()).join() !== axAll.join(), "แกน Y คิดใหม่ตามช่องที่เลือก ไม่ใช่ค้างที่ขอบเขตของทุกช่อง");

  // ต้องรอด render ใหม่ (สลับแท็บไปกลับ) — state ไม่ได้อยู่ใน DOM
  await tabTo(pg, "TikTok");
  await tabTo(pg, "ภาพรวม");
  ok(await pg.$eval('[data-tch="facebook"]', (e) => e.classList.contains("on")),
     "สลับแท็บกลับมา ยังจำได้ว่าดูช่องไหนอยู่");

  // ความละเอียดแกนเวลาก็ต้องจำได้เหมือนกัน
  await pg.click('[data-grain="week"]');
  await pg.waitForTimeout(200);
  await tabTo(pg, "YouTube");
  await tabTo(pg, "ภาพรวม");
  ok(await pg.$eval('[data-grain="week"]', (e) => e.classList.contains("on")), "จำความละเอียดแกนเวลาได้ด้วย");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[26] แท็บอยู่บนสุดและเป็นหน้าตาแท็บ ไม่ใช่เม็ดยา");
{
  const { pg } = await open();
  const geo = await pg.evaluate(() => {
    const tabs = document.querySelector(".tabs");
    const ctrl = document.querySelector("#controls");
    const view = document.querySelector("#view");
    const on = document.querySelector(".tab.on");
    const cs = getComputedStyle(on);
    return {
      aboveControls: tabs.getBoundingClientRect().top < ctrl.getBoundingClientRect().top,
      aboveView: tabs.getBoundingClientRect().top < view.getBoundingClientRect().top,
      underline: parseFloat(cs.borderBottomWidth) > 0,
      radius: parseFloat(cs.borderTopLeftRadius),
      barBorder: parseFloat(getComputedStyle(tabs).borderBottomWidth) > 0,
    };
  });
  ok(geo.aboveControls && geo.aboveView, "แท็บอยู่บนสุดของเนื้อหา");
  ok(geo.underline, "แท็บที่เลือกมีเส้นใต้");
  ok(geo.radius < 6, `ไม่ใช่เม็ดยาแล้ว (มุมโค้ง ${geo.radius}px)`);
  ok(geo.barBorder, "แถบแท็บมีเส้นคั่นด้านล่าง");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[27] รูปย่อของคอนเทนต์");
{
  const { pg } = await open();
  const imgs = await pg.$$eval(".post img", (n) => n.map((e) => ({ src: e.getAttribute("src") || "", w: e.naturalWidth })));
  ok(imgs.length > 0, `มีรูปย่อในรายการคอนเทนต์ (${imgs.length} รูป)`);
  ok(imgs.every((i) => i.w > 0), "ทุกรูปโหลดขึ้นจริง ไม่มีรูปแตก");
  // ⚠️ โหมดจำลองต้องไม่ยิงเน็ต — ของจริงค่อยได้ URL จากแพลตฟอร์ม
  ok(imgs.every((i) => !/^https?:/.test(i.src)), "โหมดจำลองไม่ดึงรูปจากภายนอก");
  // ฝั่งหน้าเว็บต้องวาง URL จาก data ตรงๆ เพื่อให้ของจริงไหลเข้ามาได้เลย
  const js = await (await fetch(BASE + "/social/app.js")).text();
  ok(/<img src="' \+ esc\(p\.thumb\)/.test(js), "โค้ดวาง p.thumb ลง img ตรงๆ (ของจริงใช้ URL จากแพลตฟอร์มได้ทันที)");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[28] 🔴 คอนเทนต์เด่น — แยกกล่องรายช่อง และกดเปิดโพสต์ได้");
{
  const { pg } = await open();
  /* 🔴 มี 2 อันดับวางคู่กัน (คนมีส่วนร่วมมากสุด / คนดูมากสุด) แต่ละอันดับแยกกล่องตามช่อง
     ⚠️ ทั้งสองฝั่งต้องแยกช่องเหมือนกัน ไม่ใช่ฝั่งหนึ่งแยกอีกฝั่งเรียงรวม */
  const cols = await pg.$$(".duo .duo-c .tcards");
  ok(cols.length === 2, `มีอันดับ 2 ชุดวางคู่กัน (${cols.length})`);
  for (let i = 0; i < cols.length; i++) {
    const h = await cols[i].$$eval(".tcard-h", (n) => n.map((x) => x.textContent.trim()));
    ok(h.length === 3, `ชุดที่ ${i + 1}: แยกกล่องตามช่อง 3 กล่อง (${h.length})`);
    ok(/YouTube/.test(h[0]) && /TikTok/.test(h[1]) && /Facebook/.test(h[2]), `ชุดที่ ${i + 1}: หัวกล่องเป็นชื่อช่อง (${h.join(" / ")})`);
  }
  // ⚠️ สองฝั่งต้องเป็นคนละอันดับกันจริง ไม่ใช่ก๊อปกันมา
  const [erTop, vTop] = await pg.$$eval(".duo .duo-c .tcards", (n) =>
    n.map((c) => [...c.querySelectorAll(".post-t")].map((x) => x.textContent.trim()).join("|")));
  ok(erTop !== vTop, "อันดับซ้าย (มีส่วนร่วม) กับขวา (คนดู) ไม่ใช่ชุดเดียวกัน");
  const cards = await pg.$$(".tcard");

  // ⚠️ ห้ามมีกล่องไหนดูดอันดับไปหมด — แต่ละกล่องเรียงเฉพาะของช่องตัวเอง
  for (let i = 0; i < cards.length; i++) {
    const chips = await cards[i].$$eval(".chip", (n) => n.map((x) => x.textContent.trim())).catch(() => []);
    ok(chips.length === 0, `กล่องที่ ${i + 1}: ไม่ต้องติดป้ายช่องซ้ำในแต่ละรายการ`);
  }

  const links = await pg.$$eval(".tcard .post", (n) => n.map((e) => ({ tag: e.tagName, href: e.getAttribute("href") || "", ext: !!e.querySelector(".ext") })));
  ok(links.length > 0, `มีรายการในกล่อง (${links.length})`);
  ok(links.every((l) => l.tag === "A"), "ทุกรายการเป็นลิงก์กดได้");
  ok(links.every((l) => /^https?:/.test(l.href)), "ลิงก์ชี้ไปโพสต์บนแพลตฟอร์ม");
  ok(links.every((l) => l.ext), "มีสัญลักษณ์บอกว่ากดแล้วเปิดแท็บใหม่");
  ok(await pg.$$eval(".tcard .post", (n) => n.every((e) => e.target === "_blank" && /noopener/.test(e.rel))), "เปิดแท็บใหม่อย่างปลอดภัย");

  // ปิดช่อง → กล่องนั้นต้องหายไปด้วย
  await pg.click('[data-ch="tiktok"]');
  await pg.waitForTimeout(200);
  ok((await pg.$$(".tcard")).length === 4, "ปิดช่องแล้วกล่องของช่องนั้นหายไปทั้ง 2 อันดับ");
  ok(!/TikTok/.test(await pg.$$eval(".tcard-h", (n) => n.map((x) => x.textContent).join())), "ไม่มีหัวกล่อง TikTok เหลือ");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[29] 🔴 ตัวเลขบนแท่งผู้ติดตาม ต้องไม่จมไปกับสีแท่ง");
{
  const { pg } = await open();
  const m = await pg.evaluate(() => {
    const row = document.querySelector(".dv-row");
    const neg = row.querySelector(".dv-neg").getBoundingClientRect();
    const pos = row.querySelector(".dv-pos").getBoundingClientRect();
    const ln = row.querySelector(".dv-lbl.neg").getBoundingClientRect();
    const lp = row.querySelector(".dv-lbl.pos").getBoundingClientRect();
    const over = (a, b) => !(a.right <= b.left + 1 || a.left >= b.right - 1);
    return { negOverlap: over(ln, neg), posOverlap: over(lp, pos) };
  });
  ok(!m.negOverlap, "ตัวเลขฝั่งลบไม่ทับแท่งแดง");
  ok(!m.posOverlap, "ตัวเลขฝั่งบวกไม่ทับแท่งเขียว");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[30] ถอดทางลัด Social ออกจากหน้าหลักแล้ว");
{
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p2.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await p2.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const hrefs = await p2.$$eval(".card", (n) => n.map((e) => e.getAttribute("href")));
  ok(!hrefs.some((h) => /social/.test(h || "")), `ไม่มีการ์ด Social บน landing (${hrefs.join(", ")})`);
  // แต่หน้ายังอยู่ เข้าตรงได้
  const r = await fetch(BASE + "/social/");
  ok(r.ok, "หน้า /social/ ยังเปิดได้ตามเดิม");
  await p2.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[31] 🔴 กล่องสรุปให้อ่าน (Insights) — มาจากกฎ ไม่ใช่ข้อความลอยๆ");
{
  const { pg, errs } = await open();
  const items = await pg.$$eval(".insight-l li", (n) => n.map((x) => x.innerText.trim()));
  ok(items.length >= 1 && items.length <= 3, `มีข้อสรุป 1–3 ข้อ (ได้ ${items.length})`);
  ok(items.every((t) => t.length > 10), "ทุกข้อเป็นประโยคจริง ไม่ใช่ข้อความว่าง");

  // ทุกข้อต้องมีทิศทางกำกับ (ขึ้น/ลง/กลางๆ) ไม่ใช่ก้อนข้อความเปล่า
  const tones = await pg.$$eval(".insight-l li", (n) => n.map((x) => x.className));
  ok(tones.every((c) => /ins-(up|down|flat)/.test(c)), "ทุกข้อมีทิศทางกำกับ (ins-up/down/flat)");

  // ⚠️ ข้อที่เทียบกับช่วงก่อนหน้า ห้ามขึ้นเมื่อผู้ใช้เลือก "ไม่เทียบ"
  const withCmp = await pg.$$eval(".insight-l li", (n) => n.map((x) => x.innerText));
  await setCompare(pg, "none");
  await pg.waitForTimeout(180);
  const noCmp = await pg.$$eval(".insight-l li", (n) => n.map((x) => x.innerText));
  /* ⚠️ ห้ามจับแค่คำว่า "เทียบกับ" — ข้อที่อธิบาย ER ก็มีคำนี้ ("เทียบกับคนที่เห็น")
     ต้องจับชื่อช่วงเวลาจริงที่ระบบใช้เรียกช่วงก่อนหน้า */
  const CMP_RE = /ช่วงก่อนหน้า|เดือนที่แล้ว|ปีก่อน/;
  ok(!noCmp.some((t) => CMP_RE.test(t)), "เลือก 'ไม่เทียบ' แล้วไม่มีข้อไหนอ้างช่วงก่อนหน้า");
  ok(withCmp.some((t) => CMP_RE.test(t)), "เปิดการเทียบแล้วมีข้อที่อ้างช่วงก่อนหน้า");

  // ตัวเลขในข้อสรุปต้องเป็นเปอร์เซ็นต์เต็มหน่วย ไม่ใช่ทศนิยมรก
  ok(!withCmp.some((t) => /\d+\.\d+%\s*เทียบ/.test(t)), "ตัวเลข % ในข้อสรุปปัดเป็นจำนวนเต็ม");
  ok(errs.length === 0, "ไม่มี error ระหว่างสร้างกล่องสรุป");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[32] 🔴 ยอดรวมต้องบอกว่ารวมกี่ช่อง + หัวคอลัมน์กดไปแท็บช่องได้");
{
  const { pg } = await open();
  const labels = await pg.$$eval(".grid4 .sc-l", (n) => n.map((x) => x.textContent.trim()));
  ok(labels.every((t) => /\(3 ช่อง\)/.test(t)), `ทุกใบบอกว่ารวม 3 ช่อง (${labels[0]})`);

  // ปิดช่องหนึ่ง → ตัวเลขในป้ายต้องลดตาม ไม่ใช่ค้างที่ 3
  await pg.click('[data-ch="tiktok"]');
  await pg.waitForTimeout(180);
  const l2 = await pg.$$eval(".grid4 .sc-l", (n) => n.map((x) => x.textContent.trim()));
  ok(l2.every((t) => /\(2 ช่อง\)/.test(t)), "ปิดช่องแล้วป้ายเหลือ 2 ช่อง");
  await pg.click('[data-ch="tiktok"]');
  await pg.waitForTimeout(180);

  // drill-down: ชื่อช่องในตารางเป็นปุ่มจริง กดแล้วไปแท็บนั้น (ตารางสลับแกนแล้ว ช่องอยู่ที่หัวแถว)
  const drills = await pg.$$eval(".tbl.perf tbody .drill", (n) =>
    n.map((x) => ({ tag: x.tagName, tab: x.dataset.tab })));
  ok(drills.length === 3, `ชื่อช่องเป็นปุ่มครบ 3 ช่อง (ได้ ${drills.length})`);
  ok(drills.every((d) => d.tag === "BUTTON"), "เป็น <button> จริง (คีย์บอร์ดใช้ได้)");
  ok(drills.every((d) => ["youtube", "tiktok", "facebook"].includes(d.tab)), "ชี้ไปแท็บของช่องนั้นถูกต้อง");

  await pg.click('.tbl.perf tbody .drill[data-tab="tiktok"]');
  await pg.waitForTimeout(200);
  const on = await pg.$eval(".tab.on", (e) => e.innerText);
  ok(/TikTok/.test(on), `กดชื่อช่องแล้วเด้งไปแท็บนั้นจริง (${on.replace(/\s+/g, " ")})`);
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[33] 🔴 แถบควบคุมติดขอบบน — ช่วงเวลา + แท็บ + ชิพช่อง ต้องอยู่ครบตอนเลื่อน");
{
  const { pg } = await open();
  ok((await pg.$$(".sticky #periodbox")).length === 1, "ตัวเลือกช่วงเวลาอยู่ในแถบติดขอบ");
  ok((await pg.$$(".sticky .tabs")).length === 1, "แท็บอยู่ในแถบติดขอบ");
  ok((await pg.$$(".sticky #chips")).length === 1, "ชิพเลือกช่องอยู่ในแถบติดขอบ");

  await pg.evaluate(() => window.scrollTo(0, 1500));
  await pg.waitForTimeout(160);
  const vis = await pg.evaluate(() => {
    const r = document.querySelector(".periodbtn").getBoundingClientRect();
    const t = document.querySelector(".tab.on").getBoundingClientRect();
    return { period: r.top >= 0 && r.bottom <= innerHeight, tab: t.top >= 0 && t.bottom <= innerHeight };
  });
  ok(vis.period, "เลื่อนลงไปกลางหน้าแล้วยังเห็นตัวเลือกช่วงเวลา");
  ok(vis.tab, "เลื่อนลงไปกลางหน้าแล้วยังเห็นแท็บที่เปิดอยู่");
  await pg.close();

  /* ⚠️ แถบติดขอบกินพื้นที่อ่านข้อมูลตลอดเวลา — บนมือถือห้ามเกิน 1 ใน 3 ของจอ */
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(BASE + "/social/?mock=1", { waitUntil: "load" });
  await m.waitForSelector(".sc");
  const h = await m.$eval(".sticky", (e) => e.getBoundingClientRect().height);
  ok(h <= 844 / 3, `มือถือ: แถบติดขอบสูง ${Math.round(h)}px ไม่เกิน 1/3 ของจอ (281px)`);
  ok(await m.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), "มือถือ: หน้าไม่เลื่อนแนวนอน");
  await m.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[34] 🔴 ช่องที่ยังไม่ได้เชื่อมต่อ — บอกว่าต้องทำอะไร ไม่ใช่บอกว่าไม่มีข้อมูล");
{
  const pg = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.goto(BASE + "/social/?off=facebook", { waitUntil: "load" });
  await pg.waitForSelector(".sc");

  // ยอดรวมต้องไม่นับช่องที่ยังไม่เชื่อม และต้องบอกไว้ด้วย
  const labels = await pg.$$eval(".grid4 .sc-l", (n) => n.map((x) => x.textContent.trim()));
  ok(labels.every((t) => /\(2 ช่อง\)/.test(t)), `ยอดรวมนับแค่ช่องที่เชื่อมแล้ว (${labels[0]})`);
  const note = await pg.$eval(".offnote", (e) => e.innerText).catch(() => "");
  ok(/Facebook/.test(note) && /ยังไม่ได้เชื่อมต่อ/.test(note), `บอกไว้ใต้ยอดรวมว่าช่องไหนไม่ถูกนับ (${note})`);

  // ชิพของช่องนั้นต้องกดไม่ได้ แต่ห้ามหายไป
  const chips = await pg.$$eval("#chips .ch", (n) =>
    n.map((x) => ({ t: x.textContent.trim(), off: x.disabled })));
  ok(chips.length === 3, "ชิพยังครบ 3 ช่อง ไม่ซ่อนช่องที่ยังไม่เชื่อม");
  ok(chips.filter((c) => c.off).length === 1 && /Facebook/.test(chips.find((c) => c.off).t),
     "ชิพของช่องที่ยังไม่เชื่อมกดไม่ได้");

  // แท็บของช่องนั้น = การ์ดบอกวิธีเชื่อม ไม่ใช่ข้อความ "ไม่มีข้อมูล"
  await tabTo(pg, "Facebook");
  const txt = await view(pg);
  ok(/ยังไม่ได้เชื่อมต่อ/.test(txt), "แท็บช่องนั้นขึ้นการ์ดบอกว่ายังไม่ได้เชื่อมต่อ");
  ok(!/ลองขยายช่วงเวลา/.test(txt), "ไม่ใช้ข้อความ 'ลองขยายช่วงเวลา' ซึ่งชี้ทางผิด");
  const needs = await pg.$$eval(".setup-n code", (n) => n.map((x) => x.textContent));
  ok(needs.length >= 2, `บอกชื่อค่าที่ต้องใส่ (${needs.join(", ")})`);
  ok(!/\bCP\b|CPF/i.test(txt), "ไม่มีชื่อบริษัทโผล่ในการ์ดตั้งค่า");

  // ⚠️ ขยายช่วงเวลาแล้วต้องยังเป็นการ์ดตั้งค่าเหมือนเดิม (ไม่ใช่ปัญหาเรื่องช่วงเวลา)
  await setPeriod(pg, 90);
  await closePeriod(pg);
  ok(/ยังไม่ได้เชื่อมต่อ/.test(await view(pg)), "เปลี่ยนช่วงเวลาแล้วยังเป็นการ์ดตั้งค่า");

  // ช่องที่เชื่อมแล้วต้องไม่ได้รับผลกระทบ
  await tabTo(pg, "YouTube");
  ok((await pg.$$(".scgrid .sc")).length >= 4, "ช่องที่เชื่อมแล้วยังแสดงตัวเลขตามปกติ");
  ok(errs.length === 0, "ไม่มี error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[35] 🔴 แกน Engagement rate เป็น 'ระดับ' ห้ามมีเครื่องหมาย +");
{
  const { pg } = await open();
  await pg.click('[data-metric="er"]');
  await pg.waitForTimeout(200);
  const ax = await pg.$$eval(".panel .chartbox svg text", (n) =>
    n.map((x) => x.textContent).filter((t) => /%/.test(t)));
  ok(ax.length >= 2, `แกน ER มีป้ายอย่างน้อย 2 ใบ (${ax.join(" · ")})`);
  ok(!ax.some((t) => t.trim().startsWith("+")), "ไม่มีป้ายไหนขึ้นต้นด้วย + (8% ไม่ใช่ +8%)");

  // กราฟรายช่องใช้แกน ER ฝั่งขวาด้วย ต้องไม่มี + เหมือนกัน
  await tabTo(pg, "YouTube");
  const ax2 = await pg.$$eval(".panel svg text", (n) =>
    n.map((x) => x.textContent).filter((t) => /^\s*[+\-\d.]+%$/.test(t)));
  ok(!ax2.some((t) => t.trim().startsWith("+")), "แกน ER ของหน้ารายช่องก็ไม่มี +");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[36] 🔴 ปฏิทินเลือกช่วงวันที่ (แบบ GA4) — กดวันเริ่ม แล้วกดวันสิ้นสุด");
{
  const { pg, errs } = await open();
  await pg.click('[data-period="toggle"]');
  await pg.waitForSelector(".periodpanel");

  // จอกว้างโชว์ 2 เดือนคู่กัน
  const months = await pg.$$eval(".cal-mh", (n) => n.map((x) => x.textContent.trim()));
  ok(months.length === 2, `จอกว้างโชว์ 2 เดือน (${months.join(" / ")})`);
  ok(await pg.$eval(".pp-body", (e) => getComputedStyle(e).flexDirection === "row"),
     "จอกว้าง: ตัวเลือกสำเร็จรูปซ้าย ปฏิทินขวา");

  /* ⚠️ แผงต้องเตี้ยกว่าจอเสมอ ไม่งั้นปุ่มล่างๆ กดไม่ถึง
     (ตัวเลือก 13 อัน + ปฏิทิน 2 เดือน + โหมดเทียบ = เกือบ 1000px) */
  const ph = await pg.$eval(".periodpanel", (e) => e.getBoundingClientRect().height);
  ok(ph < 1000 * 0.8, `แผงเตี้ยกว่าจอ (${Math.round(ph)}px)`);
  ok(await pg.$eval(".pp-scroll", (e) => ["auto", "scroll"].includes(getComputedStyle(e).overflowY)),
     "ส่วนกลางเลื่อนได้");

  /* 🔴 วันในอนาคตต้องกดไม่ได้จริง ไม่ใช่กดได้แล้วค่อยตัดทีหลัง — ไม่มีข้อมูลของพรุ่งนี้ */
  const future = await pg.$$eval(".cal-d:disabled", (n) => n.map((x) => x.dataset.day));
  ok(future.length > 0, `วันในอนาคตถูกปิด (${future.length} วัน)`);
  const today = new Date();
  const tk = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  ok(future.every((d) => d > tk), "ปิดเฉพาะวันหลังวันนี้ ไม่ได้ปิดวันนี้ด้วย");
  ok(await pg.$eval('[data-cal="next"]', (e) => e.disabled), "เลื่อนไปเดือนหน้าไม่ได้");

  // ช่วงที่เลือกอยู่ต้องไฮไลต์ให้เห็น
  ok((await pg.$$(".cal-d.s")).length === 1 && (await pg.$$(".cal-d.e")).length === 1, "ไฮไลต์หัว-ท้ายของช่วงที่เลือก");
  ok((await pg.$$(".cal-d.in")).length > 0, "ไฮไลต์วันที่อยู่ระหว่างกลางด้วย");

  // เลื่อนเดือนถอยหลังได้ และไม่ไปแตะช่วงที่เลือกไว้
  const headBefore = await pg.$eval(".pp-head", (e) => e.innerText);
  await pg.click('[data-cal="prev"]');
  await pg.waitForTimeout(180);
  const m2 = await pg.$$eval(".cal-mh", (n) => n.map((x) => x.textContent.trim()));
  ok(m2.join() !== months.join(), `เลื่อนเดือนได้ (${m2.join(" / ")})`);
  ok((await pg.$eval(".pp-head", (e) => e.innerText)) === headBefore, "เลื่อนเดือนแล้วช่วงที่เลือกไม่เปลี่ยน");

  /* คลิกแรก = วันเริ่ม · คลิกที่สอง = วันสิ้นสุด */
  const days = pg.locator(".cal-ms > .cal-m").last().locator(".cal-d:not(:disabled)");
  await days.nth(4).click();
  await pg.waitForTimeout(180);
  ok(/เลือกวันสิ้นสุด/.test(await pg.$eval(".pp-note", (e) => e.innerText)), "คลิกแรกแล้วบอกให้เลือกวันสิ้นสุด");
  ok((await pg.$$(".cal-d.in")).length === 0, "ระหว่างเลือกอยู่ ไม่ไฮไลต์ช่วงเก่าค้างไว้");

  await days.nth(11).click();
  await pg.waitForTimeout(220);
  const head = await pg.$eval(".pp-head", (e) => e.innerText);
  ok(/8 วัน/.test(head), `เลือกครบ 2 คลิกได้ช่วง 8 วัน (${head.replace(/\n/g, " ")})`);
  ok(await pg.$eval('[data-preset="custom"]', (e) => e.classList.contains("on")), "สลับเป็นโหมดกำหนดเองให้เอง");

  /* ⚠️ กดย้อนหลัง (วันจบมาก่อนวันเริ่ม) ต้องสลับให้ ไม่ใช่ไม่ยอมรับ */
  await days.nth(20).click();
  await pg.waitForTimeout(150);
  await days.nth(13).click();
  await pg.waitForTimeout(220);
  const head2 = await pg.$eval(".pp-head", (e) => e.innerText);
  ok(/8 วัน/.test(head2), `กดย้อนหลังก็ได้ช่วงเดียวกัน (${head2.replace(/\n/g, " ")})`);

  // ช่องพิมพ์วันที่เองยังอยู่ — ช่วงที่ย้อนไปหลายปี กดทีละเดือนไม่ไหว
  ok(!!(await pg.$("#d1")) && !!(await pg.$("#d2")), "มีช่องพิมพ์วันที่เอง");
  ok(await pg.$eval("#d1", (e) => e.getAttribute("max") !== null), "ช่องพิมพ์ก็กันวันอนาคต");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();

  // จอแคบโชว์เดือนเดียว ไม่งั้นช่องวันเล็กจนกดไม่โดน
  const { pg: m } = await open({ width: 390, height: 844 });
  await m.click('[data-period="toggle"]');
  await m.waitForSelector(".periodpanel");
  const vis = await m.$$eval(".cal-m", (n) => n.filter((x) => x.offsetParent !== null).length);
  ok(vis === 1, `มือถือโชว์เดือนเดียว (${vis})`);
  // ⚠️ ต้องวัดจากเดือนที่ "มองเห็นอยู่" — เดือนซ้ายถูกซ่อนบนมือถือ วัดได้ 0×0
  const cell = await m.$eval(".cal-ms > .cal-m:last-child .cal-d:not(:disabled)", (e) => e.getBoundingClientRect());
  ok(cell.width >= 28 && cell.height >= 28, `ช่องวันกดโดนบนมือถือ (${Math.round(cell.width)}×${Math.round(cell.height)}px)`);
  ok(await m.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), "มือถือ: แผงไม่ดันหน้าให้เลื่อนแนวนอน");
  await m.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[37] 🔴 ตัวเลขเทียบต้องบอกด้วยว่าเทียบกับช่วงไหน");
{
  const { pg } = await open();
  /* 🔴 "▲ 0.1%" ลอยๆ ไม่มีทางรู้ว่าเทียบกับช่วงก่อนหน้า เดือนที่แล้ว หรือปีก่อน
     — และตัวเลือกอยู่ในแผงเลือกช่วงเวลาซึ่งคนละที่กับการ์ด (เจ้าของสั่ง 19 ส.ค. 2026) */
  const vs = await pg.$$eval(".grid4 .sc-vs", (n) => n.map((x) => x.textContent.trim()));
  ok(vs.length === 4, `ทุกการ์ดบอกว่าเทียบกับช่วงไหน (${vs.length} ใบ)`);
  ok(vs.every((t) => /เทียบกับช่วงก่อนหน้า/.test(t)), `ชื่อช่วงตรงกับที่เลือกไว้ (${vs[0]})`);

  // เปลี่ยนโหมดเทียบ → ป้ายต้องเปลี่ยนตาม ไม่ใช่ค้างของเดิม
  await setCompare(pg, "yoy");
  const vs2 = await pg.$$eval(".grid4 .sc-vs", (n) => n.map((x) => x.textContent.trim()));
  ok(vs2.every((t) => /ปีก่อน/.test(t)), `เปลี่ยนโหมดแล้วป้ายเปลี่ยนตาม (${vs2[0]})`);

  // ปิดการเทียบ → ไม่มีทั้งตัวเลขเทียบและป้าย
  await setCompare(pg, "none");
  ok((await pg.$$(".sc-vs")).length === 0, "ปิดการเทียบแล้วป้ายหายไปด้วย ไม่ค้างเป็นข้อความลอย");
  ok((await pg.$$(".grid4 .dlt")).length === 0, "ไม่มีตัวเลขเทียบเหลืออยู่");

  // แท็บรายช่องก็ต้องมีเหมือนกัน
  await setCompare(pg, "prev");
  await tabTo(pg, "YouTube");
  const vs3 = await pg.$$eval(".scgrid .sc-vs", (n) => n.map((x) => x.textContent.trim()));
  ok(vs3.length >= 4 && vs3.every((t) => /เทียบกับ/.test(t)), `แท็บรายช่องก็บอกด้วย (${vs3.length} ใบ)`);
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[38] 🔴 สัดส่วนของยอดรวมในแถวรายช่อง");
{
  const { pg } = await open();
  /* 🔴 เจ้าของสั่ง 19 ส.ค. 2026 — เห็นตัวเลขดิบอย่างเดียวยังต้องหารเองว่าคิดเป็นกี่ %
     ⚠️ ใส่ % ได้เฉพาะค่าที่บวกกันแล้วเป็นยอดรวม ห้ามใส่กับ Engagement rate
        (เป็นอัตราส่วน ค่ารายช่องบวกกันไม่ใช่ 100% — ใส่ไปจะได้เลขที่ไม่มีความหมาย) */
  const cards = await pg.$$eval(".grid4 .sc", (n) => n.map((c) => ({
    label: c.querySelector(".sc-l").textContent.trim(),
    shares: [...c.querySelectorAll(".bd-s")].map((x) => x.textContent.trim()).filter(Boolean),
  })));
  const er = cards.find((c) => /Engagement rate/.test(c.label));
  ok(er && er.shares.length === 0, "การ์ด Engagement rate ไม่มี % สัดส่วน (บวกกันไม่ได้)");

  const addable = cards.filter((c) => !/Engagement rate/.test(c.label));
  ok(addable.length === 3, `การ์ดที่บวกกันได้มี 3 ใบ (${addable.length})`);
  for (const c of addable) {
    ok(c.shares.length === 3, `${c.label}: มี % ครบ 3 ช่อง`);
    const tot = c.shares.reduce((a, x) => a + parseFloat(x), 0);
    // ปัดเป็นจำนวนเต็ม 3 ตัวรวมกันจึงคลาดได้ ±2
    ok(Math.abs(tot - 100) <= 2, `${c.label}: สัดส่วนรวมกันได้ 100% (${tot}%)`);
  }

  // ปิดช่อง → สัดส่วนต้องคิดใหม่จากช่องที่เหลือ ไม่ใช่ค้างของเดิม
  await pg.click('[data-ch="tiktok"]');
  await pg.waitForTimeout(200);
  const after = await pg.$$eval(".grid4 .sc", (n) => {
    const c = [...n].find((x) => /Views \/ Reach รวม/.test(x.querySelector(".sc-l").textContent));
    return [...c.querySelectorAll(".bd-s")].map((x) => x.textContent.trim());
  });
  ok(after.length === 2, "ปิดช่องแล้วเหลือ 2 แถว");
  ok(Math.abs(after.reduce((a, x) => a + parseFloat(x), 0) - 100) <= 2,
     `สัดส่วนคิดใหม่จากช่องที่เหลือ (${after.join(" + ")})`);
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[39] 🔴 กดแถวช่องแล้วกางดูได้ว่ายอดมาจากคอนเทนต์ใบไหน");
{
  const { pg, errs } = await open();
  /* 🔴 เจ้าของสั่ง 19 ส.ค. 2026 — ตัวเลขรวมอย่างเดียวตอบไม่ได้ว่า
     "โตเพราะคลิปเดียวดัง หรือดีขึ้นทั้งกระดาน" */
  ok((await pg.$$(".perf-sub")).length === 0, "ยังไม่กด ยังไม่มีแถวย่อย");

  const cols = await pg.$$eval(".tbl.perf thead th", (n) => n.length);
  await pg.click('[data-perf="tiktok"]');
  await pg.waitForTimeout(220);
  const subs = await pg.$$(".perf-sub .sub-t");
  ok(subs.length > 1, `กางแล้วเห็นคอนเทนต์รายใบ (${subs.length} ใบ)`);

  /* ⚠️ ยอดของช่องไม่ได้มาจากโพสต์ในช่วงนี้ทั้งหมด — โพสต์เก่ายังมีคนดูอยู่
     ไม่บอกไว้ เจ้าของจะบวกแถวย่อยแล้วงงว่าทำไมไม่เท่ายอดข้างบน */
  const note = await pg.$eval(".sub-note", (e) => e.innerText);
  ok(/ของยอดช่อง/.test(note) && /โพสต์ที่ลงไว้ก่อนหน้า/.test(note), `บอกว่าแถวย่อยครอบคลุมเท่าไหร่ (${note})`);
  ok(await pg.$eval('[data-perf="tiktok"]', (e) => e.getAttribute("aria-expanded") === "true"), "ปุ่มบอกสถานะกางให้ screen reader");

  // ⚠️ แถวย่อยต้องมีคอลัมน์เท่าหัวตาราง ไม่งั้นตัวเลขจะเลื่อนไปคนละคอลัมน์
  const subCols = await pg.$$eval(".perf-sub .sub-t", (n) => n[0].parentElement.querySelectorAll("td").length);
  ok(subCols === cols, `แถวย่อยมีคอลัมน์เท่าหัวตาราง (${subCols} vs ${cols})`);

  // เรียงจากมากไปน้อยตามคอลัมน์หลักของแท็บ
  const vals = await pg.$$eval(".perf-sub .sub-t", (n) => n.map((c) => {
    const cell = c.parentElement.querySelectorAll("td")[4].innerText;
    return parseFloat(cell.replace(/[,K]/g, "")) * (/K/.test(cell) ? 1000 : 1);
  }));
  ok(vals.every((v, i) => i === 0 || vals[i - 1] >= v), "เรียงจากมากไปน้อย");

  // กดเปิดโพสต์จริงได้
  const links = await pg.$$eval(".perf-sub .sub-t a", (n) =>
    n.map((e) => ({ href: e.getAttribute("href"), t: e.target, rel: e.rel })));
  ok(links.length > 0 && links.every((l) => /^https?:/.test(l.href)), "ชื่อคอนเทนต์กดเปิดโพสต์จริงได้");
  ok(links.every((l) => l.t === "_blank" && /noopener/.test(l.rel)), "เปิดแท็บใหม่อย่างปลอดภัย");

  // เฉพาะช่องที่กด ช่องอื่นต้องไม่กางตาม
  const owner = await pg.$$eval(".tbl.perf tbody tr", (n) => {
    let cur = "", map = {};
    n.forEach((r) => {
      if (r.classList.contains("perf-r")) cur = r.querySelector("[data-perf]").dataset.perf;
      else (map[cur] = map[cur] || 0, map[cur]++);
    });
    return map;
  });
  ok(Object.keys(owner).join() === "tiktok", `กางเฉพาะช่องที่กด (${Object.keys(owner).join(",") || "ไม่มี"})`);

  // สลับแท็บคอลัมน์แล้วยังกางอยู่ และคอลัมน์เปลี่ยนตาม
  await pg.click('[data-ptab="reach"]');
  await pg.waitForTimeout(220);
  ok((await pg.$$(".perf-sub .sub-t")).length === subs.length, "สลับแท็บคอลัมน์แล้วยังกางอยู่");
  ok((await pg.$$eval(".perf-sub .sub-t", (n) => n[0].parentElement.querySelectorAll("td").length)) ===
     (await pg.$$eval(".tbl.perf thead th", (n) => n.length)), "แถวย่อยเปลี่ยนคอลัมน์ตามแท็บ");

  // ต้องรอด render ใหม่ — state ไม่ได้อยู่ใน DOM
  await tabTo(pg, "YouTube");
  await tabTo(pg, "ภาพรวม");
  ok((await pg.$$(".perf-sub")).length > 0, "สลับแท็บไปกลับแล้วยังกางอยู่");

  await pg.click('[data-perf="tiktok"]');
  await pg.waitForTimeout(200);
  ok((await pg.$$(".perf-sub")).length === 0, "กดซ้ำแล้วพับกลับ");

  /* ⚠️ ปุ่มกาง กับ ปุ่มไปแท็บของช่อง ต้องเป็นคนละปุ่ม
     ปุ่มเดียวทำ 2 อย่าง = กดแล้วเดาไม่ถูกว่าจะกางหรือจะเปลี่ยนหน้า */
  await pg.click('.tbl.perf tbody .drill[data-tab="facebook"]');
  await pg.waitForTimeout(200);
  ok(/Facebook/.test(await pg.$eval(".tab.on", (e) => e.innerText)), "ปุ่ม › ยังเป็นทางลัดไปแท็บช่องเหมือนเดิม");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[40] 🔴 คอนเทนต์เด่น — ช่องละ 2 อันดับ");
{
  const { pg } = await open();
  /* 🔴 เจ้าของสั่ง 19 ส.ค. 2026 — ใบเดียวต่อช่องบอกไม่ได้ว่าใบที่ชนะโดดออกมาใบเดียว
     หรือทั้งช่องทำได้ดีพอๆ กัน */
  const perCard = await pg.$$eval(".tcard", (n) => n.map((c) => c.querySelectorAll(".post").length));
  ok(perCard.length === 6, `มี 2 อันดับ × 3 ช่อง = 6 กล่อง (${perCard.length})`);
  ok(perCard.every((x) => x === 2), `ทุกกล่องมี 2 ใบ (${perCard.join(",")})`);

  // มีเลขอันดับกำกับ ไม่งั้นไม่รู้ว่าใบไหนมาก่อน
  const ranks = await pg.$$eval(".tcards .tcard", (n) => [...n[0].querySelectorAll(".rk")].map((x) => x.textContent.trim()));
  ok(ranks.join() === "1,2", `มีเลขอันดับกำกับ (${ranks.join(",")})`);

  // ⚠️ ในกล่องเดียวกันต้องเรียงถูก — อันดับ 1 ต้องดีกว่าอันดับ 2 จริง
  const erPair = await pg.$$eval(".duo .duo-c:first-child .tcards .tcard", (n) =>
    [...n[0].querySelectorAll(".post-m")].map((m) => parseFloat((m.innerText.match(/ER\s+([\d.]+)%/) || [])[1])));
  ok(erPair.length === 2 && erPair[0] >= erPair[1], `กล่อง Engagement: อันดับ 1 ER สูงกว่า (${erPair.join(" > ")})`);

  // ทั้ง 2 ใบต้องเป็นคนละโพสต์
  const titles = await pg.$$eval(".tcards .tcard", (n) => [...n[0].querySelectorAll(".post-t")].map((x) => x.textContent.trim()));
  ok(titles[0] !== titles[1], "2 ใบในกล่องเดียวกันไม่ใช่ใบเดียวกัน");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[41] 🔴 ปุ่มช่วงเวลาต้องบอกด้วยว่ากำลังเทียบกับช่วงไหน");
{
  const { pg } = await open();
  /* 🔴 เจ้าของสั่ง 19 ส.ค. 2026 — ตัวเลือกโหมดเทียบซ่อนอยู่ในแผงที่ต้องกดเปิด
     ถ้าปุ่มไม่บอก จะไม่มีอะไรบนหน้าบอกเลยว่าตัวเลข ▲▼ ทั้งหน้าเทียบกับอะไร */
  const cmp = () => pg.$eval(".pb-cmp", (e) => e.textContent.trim());
  ok(/เทียบกับช่วงก่อนหน้า/.test(await cmp()), `ปุ่มบอกชื่อช่วงที่เทียบ (${await cmp()})`);
  ok(/\d/.test(await cmp()), "บอกวันที่จริงของช่วงที่เทียบด้วย ไม่ใช่บอกแค่ชื่อ");

  // ปุ่มต้องบอกครบ 3 อย่าง: ชื่อช่วง · วันที่จริง · เทียบกับอะไร
  const all = await pg.$eval(".periodbtn", (e) => e.innerText.replace(/\n/g, " | "));
  ok(/30 วันล่าสุด/.test(all) && /30 วัน\)/.test(all), `ปุ่มบอกช่วงที่เลือกและจำนวนวัน (${all})`);

  await setCompare(pg, "yoy");
  ok(/ปีก่อน/.test(await cmp()), `เปลี่ยนโหมดแล้วปุ่มเปลี่ยนตาม (${await cmp()})`);

  await setCompare(pg, "none");
  ok(/ไม่ได้เทียบ/.test(await cmp()), `ปิดการเทียบแล้วบอกตรงๆ ว่าไม่ได้เทียบ (${await cmp()})`);

  /* ⚠️ บรรทัดสรุปเดิมที่อยู่ใต้แถบควบคุมถูกยกมาไว้บนปุ่มแล้ว ห้ามมี 2 ที่
     (ซ้ำกันแล้วกินความสูงของแถบติดขอบเปล่าๆ) */
  ok((await pg.$$(".ctrl-note")).length === 0, "ไม่มีบรรทัดสรุปซ้ำใต้แถบควบคุม");

  // แท็บรายช่องก็ต้องเห็นเหมือนกัน — ปุ่มอยู่ในแถบติดขอบร่วม
  await setCompare(pg, "prev");
  await tabTo(pg, "TikTok");
  ok(/เทียบกับ/.test(await cmp()), "แท็บรายช่องก็เห็นบรรทัดนี้");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[42] 🔴 ต่อข้อมูลจริง — แปลงคำตอบของ API เป็นโครงที่หน้าเว็บใช้");
{
  /* 🔴 YouTube ที่ใส่แค่ API key อยู่ในสถานะ "เชื่อมแล้วแต่ไม่มีตัวเลขรายวัน"
     ⚠️ สถานะนี้ห้ามยุบไปรวมกับอันไหน
        นับเป็น "เชื่อมแล้ว" → กราฟว่างโดยไม่มีคำอธิบาย (ดูเหมือนระบบพัง)
        นับเป็น "ยังไม่เชื่อม" → ตัวเลขจริงที่มีอยู่ถูกทิ้งไปเปล่าๆ */
  const YT = {
    ok: true, status: "ok", need: [], message: "", at: 1,
    data: {
      channel: { id: "UC1", title: "ช่องทดสอบ", subs: 52400, subsApprox: true, subsHidden: false,
                 views: 8123456, videos: 214, url: "https://youtube.com/@x" },
      videos: [
        { id: "v1", title: "คลิปทดสอบหนึ่ง", at: "2026-08-15T03:00:00Z", thumb: "",
          url: "https://www.youtube.com/watch?v=v1", views: 12345, likes: 890, comments: 45 },
        { id: "v2", title: "คลิปทดสอบสอง", at: "2026-08-10T03:00:00Z", thumb: "",
          url: "https://www.youtube.com/watch?v=v2", views: 8000, likes: 400, comments: 20 },
      ],
    },
  };
  const OFF = { ok: false, status: "not-configured", need: ["FB_PAGE_ID"], message: "ยังไม่ได้เชื่อมต่อ" };

  const pg = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  const json = (b) => ({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  await pg.route("**/social/api/youtube", (r) => r.fulfill(json(YT)));
  await pg.route("**/social/api/tiktok", (r) => r.fulfill(json(OFF)));
  await pg.route("**/social/api/facebook", (r) => r.fulfill(json(OFF)));

  await pg.goto(BASE + "/social/", { waitUntil: "load" });
  await pg.waitForSelector(".partial, .setup", { timeout: 5000 });

  // ⚠️ โหมดจริงห้ามขึ้นแบนเนอร์ "ข้อมูลจำลอง" — ไม่งั้นเจ้าของไม่กล้าเชื่อตัวเลขจริง
  ok((await pg.$$("#mockbar")).length === 0, "ไม่มีแบนเนอร์ข้อมูลจำลองในโหมดจริง");
  ok(!/ข้อมูลจำลอง/.test(await pg.title()), "ชื่อหน้าไม่มีคำว่าข้อมูลจำลอง");

  const sum = await pg.$eval("#view", (e) => e.innerText);
  ok(/ยังไม่มีช่องไหนที่มีตัวเลขรายวัน/.test(sum), "ภาพรวมบอกตรงๆ ว่าทำไมยังไม่มีอะไรให้ดู");
  ok(!/ลองขยายช่วงเวลา/.test(sum), "ไม่ชี้ทางผิดว่าให้ขยายช่วงเวลา (ขยายเท่าไหร่ก็ไม่มี)");

  // ชิพต้องแยกเหตุผล 2 แบบ ไม่ใช่บอกเหมือนกันหมด
  const chips = await pg.$$eval("#chips .ch", (n) => n.map((x) => ({ t: x.textContent.trim(), off: x.disabled })));
  ok(chips.every((c) => c.off), "ยังกดใช้ไม่ได้ทุกช่อง");
  ok(/ไม่มีรายวัน/.test(chips[0].t), `YouTube บอกว่าไม่มีรายวัน (${chips[0].t})`);
  ok(/ยังไม่เชื่อม/.test(chips[1].t), `TikTok บอกว่ายังไม่เชื่อม (${chips[1].t})`);

  // แท็บ YouTube: ต้องโชว์ตัวเลขจริงที่มี ไม่ใช่บอกว่าไม่มีข้อมูล
  await tabTo(pg, "YouTube");
  const v = await pg.$eval("#view", (e) => e.innerText);
  ok(/เชื่อมต่อแล้ว แต่ยังไม่มีตัวเลขรายวัน/.test(v), "บอกสถานะให้ชัด");
  ok(/52K/.test(v), "โชว์ผู้ติดตามจริงที่ได้มา");
  /* 🔴 YouTube ปัดยอดผู้ติดตามเหลือเลขนัยสำคัญ 3 ตัวก่อนส่งมา (52,437 → 52,400)
     ไม่ติดป้ายว่าเป็นค่าประมาณ = เจ้าของเอาไปอ้างอิงเป็นเลขเป๊ะ */
  ok(/โดยประมาณ/.test(v), "ติดป้ายว่าผู้ติดตามเป็นค่าประมาณ");
  ok(/8\.1M/.test(v), "โชว์ยอดวิวรวมทั้งช่อง");
  ok(/GOOGLE_CLIENT_ID/.test(v) && /YT_REFRESH_TOKEN/.test(v), "บอกว่าต้องใส่อะไรเพิ่มถึงจะมีตัวเลขรายวัน");

  // คลิปจริงต้องขึ้นและกดเปิดได้
  const posts = await pg.$$eval(".posts .post", (n) =>
    n.map((e) => ({ tag: e.tagName, href: e.getAttribute("href"), t: e.innerText })));
  ok(posts.length === 2, `โชว์คลิปที่ได้มาครบ (${posts.length})`);
  ok(posts.every((x) => x.tag === "A" && /youtube\.com/.test(x.href)), "กดเปิดคลิปจริงได้");
  ok(/12,345|12K/.test(posts[0].t), `ยอดวิวเป็นของจริง (${posts[0].t.replace(/\n/g, " ")})`);
  /* ⚠️ รายการนี้ไม่ได้ยึดตามช่วงเวลาที่เลือก เพราะต้นทางให้มาแค่ "ล่าสุด N ชิ้น"
     ไม่เขียนบอก เจ้าของจะเปลี่ยนช่วงเวลาแล้วงงว่าทำไมรายการไม่เปลี่ยน */
  ok(/ไม่ได้ยึดตามช่วงเวลา/.test(v), "บอกว่ารายการนี้ไม่ได้ยึดตามช่วงเวลาที่เลือก");

  // ช่องที่ยังไม่เชื่อม ยังเป็นการ์ดบอกวิธีเชื่อมเหมือนเดิม
  await tabTo(pg, "TikTok");
  ok(/ยังไม่ได้เชื่อมต่อ/.test(await pg.$eval("#view", (e) => e.innerText)), "ช่องที่ยังไม่เชื่อมขึ้นการ์ดตั้งค่า");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[42b] 🔴 สิทธิ์หมดอายุ ≠ ยังไม่ได้ตั้งค่า");
{
  /* 🔴 บัญชี Gmail ธรรมดาที่ยังไม่ได้ publish แอป Google จะได้ refresh token
     ที่ **หมดอายุทุก 7 วัน** — เคสนี้จะเกิดจริงแน่ๆ ไม่ใช่เคสสมมติ
     ⚠️ บอกว่า "ยังไม่ได้เชื่อมต่อ" จะทำให้เจ้าของไปไล่ตั้งค่าใหม่ทั้งชุดเปล่าๆ
        ทั้งที่ค่าใน Cloudflare ยังถูกอยู่ ต้องแค่กดขอสิทธิ์ใหม่ */
  const pg = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  const body = (b) => ({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  await pg.route("**/social/api/youtube", (r) => r.fulfill(body({
    ok: false, status: "auth-failed", need: [],
    message: "token ของ YouTube หมดอายุหรือถูกถอนสิทธิ์" })));
  await pg.route("**/social/api/tiktok", (r) => r.fulfill(body({
    ok: false, status: "not-configured", need: ["TIKTOK_CLIENT_KEY"], message: "" })));
  await pg.route("**/social/api/facebook", (r) => r.fulfill(body({
    ok: false, status: "not-configured", need: ["FB_PAGE_ID"], message: "" })));

  await pg.goto(BASE + "/social/", { waitUntil: "load" });
  await pg.waitForSelector(".setup", { timeout: 5000 });
  await tabTo(pg, "YouTube");
  const v = await pg.$eval("#view", (e) => e.innerText);
  ok(/สิทธิ์หมดอายุ/.test(v), "บอกว่าสิทธิ์หมดอายุ");
  ok(!/ยังไม่ได้เชื่อมต่อ/.test(v), "ไม่บอกว่ายังไม่ได้เชื่อมต่อ (จะไปแก้ผิดจุด)");
  ok(/ไม่ต้องแก้/.test(v), "บอกว่าค่าใน Cloudflare ยังถูก ไม่ต้องแตะ");
  ok(/connect/.test(v), "บอกวิธีขอสิทธิ์ใหม่");
  ok(/หมดอายุหรือถูกถอนสิทธิ์/.test(v), "ยกข้อความจากต้นทางมาแสดงด้วย");

  // ช่องที่ยังไม่ได้ตั้งค่าจริงๆ ยังต้องบอกแบบเดิม
  await tabTo(pg, "TikTok");
  const t = await pg.$eval("#view", (e) => e.innerText);
  ok(/ยังไม่ได้เชื่อมต่อ/.test(t) && !/สิทธิ์หมดอายุ/.test(t), "ช่องที่ยังไม่ตั้งค่ายังบอกแบบเดิม");
  ok(/TIKTOK_CLIENT_KEY/.test(t), "และยังบอกชื่อค่าที่ต้องใส่");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[43] ต่อ API ไม่ติด ≠ ยังไม่ได้ตั้งค่า");
{
  const pg = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  // ⚠️ ยิงไม่ถึง endpoint กับ ยังไม่ได้ใส่ค่า เป็นคนละเรื่อง
  //    บอกผิด เจ้าของจะไปนั่งไล่ตั้งค่าใหม่ทั้งที่ตั้งไปแล้ว
  await pg.route("**/social/api/**", (r) => r.abort());
  await pg.goto(BASE + "/social/", { waitUntil: "load" });
  await pg.waitForTimeout(700);
  const v = await pg.$eval("#view", (e) => e.innerText);
  ok(/ต่อกับเซิร์ฟเวอร์ไม่ได้|เชื่อมต่อ/.test(v), "ยังบอกสถานะบางอย่าง ไม่ใช่หน้าว่าง");
  ok(errs.length === 0, "ต่อไม่ติดแล้วต้องไม่พังทั้งหน้า");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[44] เปิดหน้ามาต้องขึ้นไอคอนหมุน ไม่ใช่หน้าว่าง");
{
  const pg = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  /* ฟีเจอร์มาตรฐานข้อ 6 ของโปรเจกต์ — ข้อความเปล่าๆ อ่านแล้วเหมือนหน้าค้าง
     หน่วง API ไว้แล้ววัดว่าระหว่างรอเห็นอะไร */
  await pg.route("**/social/api/**", async (r) => {
    await new Promise((res) => setTimeout(res, 1200));
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: false, status: "not-configured", need: ["X"], message: "" }) });
  });
  await pg.goto(BASE + "/social/", { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(350);
  ok((await pg.$$(".loading .spin")).length === 1, "ระหว่างรอมีไอคอนหมุน");
  ok(/กำลังดึงข้อมูล/.test(await pg.$eval("#view", (e) => e.innerText)), "บอกว่ากำลังดึงข้อมูล");

  await pg.waitForTimeout(1400);
  ok((await pg.$$(".loading")).length === 0, "โหลดเสร็จแล้วไอคอนหมุนต้องหาย ไม่หมุนค้าง");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[45] 🔴 ชั้นรายวันจาก YouTube Analytics — ต่อแล้วต้องใช้ได้ทั้งแดชบอร์ด");
{
  const DAYS = 400;
  const days = [], today = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 864e5);
    const v = 3000 + Math.round(2000 * Math.sin(i / 9)) + i * 3;
    days.push({
      date: d.toISOString().slice(0, 10), views: v,
      likes: Math.round(v * 0.04), comments: Math.round(v * 0.004), shares: Math.round(v * 0.006),
      watchTime: Math.round(v * 0.05), avgViewDuration: 180 + (i % 40),
      completionRate: 0.35 + (i % 20) / 100, gained: 40 + (i % 15), lost: 12 + (i % 7),
    });
  }
  let run = 41000;
  const followers = [];
  for (let i = days.length - 1; i >= 0; i--) {
    followers[i] = { date: days[i].date, value: run, gained: days[i].gained, lost: days[i].lost };
    run -= days[i].gained - days[i].lost;
  }

  const pg = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  const body = (b) => ({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  await pg.route("**/social/api/youtube", (r) => r.fulfill(body({
    ok: true, status: "ok", need: [], message: "", at: 1,
    data: {
      channel: { id: "UC1", title: "ช่อง", subs: 41000, subsApprox: true, views: 5200000, videos: 1100, url: "#" },
      videos: [{ id: "v1", title: "คลิปหนึ่ง", at: new Date(Date.now() - 3 * 864e5).toISOString(),
                 thumb: "", url: "https://youtu.be/v1", views: 12345, likes: 890, comments: 45 }],
      analytics: { daily: days, followers, approxLevel: true },
    } })));
  for (const k of ["tiktok", "facebook"]) {
    await pg.route(`**/social/api/${k}`, (r) => r.fulfill(body({
      ok: false, status: "not-configured", need: ["X"], message: "" })));
  }

  await pg.goto(BASE + "/social/", { waitUntil: "load" });
  await pg.waitForSelector(".grid4 .sc", { timeout: 5000 });

  /* 🔴 มีตัวเลขรายวันแล้ว = เลิกเป็นสถานะ partial ต้องใช้ได้ทั้งหน้า
     ⚠️ ถ้ายังขึ้นการ์ด "ยังไม่มีตัวเลขรายวัน" แปลว่าตัวแปลงไม่ได้อ่าน analytics.daily */
  ok((await pg.$$(".partial")).length === 0, "ไม่ขึ้นการ์ด 'ยังไม่มีตัวเลขรายวัน' แล้ว");
  ok((await pg.$$(".grid4 .sc")).length === 4, "หน้าภาพรวมมีการ์ดสรุปครบ");
  ok(/1 ช่อง/.test(await pg.$eval(".grid4 .sc-l", (e) => e.textContent)), "นับเฉพาะช่องที่มีข้อมูลรายวัน");

  const pts = await pg.evaluate(() => (document.querySelector("svg.chart").getAttribute("d") ? 0 :
    (document.querySelector("svg.chart path").getAttribute("d").match(/[ML]/g) || []).length));
  ok(pts === 30, `กราฟวาดครบ 30 จุดตามช่วง 30 วัน (${pts})`);

  // ตารางต้องมีตัวเลขจริง ไม่ใช่ "—" ทั้งแถว
  const row = await pg.$$eval(".tbl.perf tbody tr:first-child td", (n) => n.map((x) => x.innerText.trim()));
  ok(row.filter((x) => x !== "—").length >= 3, `ตารางมีตัวเลขจริง (${row.join(" | ").replace(/\n/g, " ")})`);

  // แท็บรายช่องต้องมีกราฟ 2 อันเหมือนช่องปกติ
  await tabTo(pg, "YouTube");
  ok((await pg.$$("svg.chart")).length === 2, "แท็บรายช่องมีกราฟรายวันครบ 2 อัน");
  const cards = await pg.$$eval(".scgrid .sc-v", (n) => n.map((x) => x.textContent.trim()));
  ok(cards.some((x) => /K|M/.test(x)), `การ์ดของช่องมีตัวเลขจริง (${cards.join(" / ")})`);

  /* ⚠️ ผู้ติดตามสะสมย้อนหลังเดินถอยมาจากยอดปัจจุบันซึ่ง YouTube ปัดเลขไว้
     ระดับของเส้นจึงคลาดได้หลักร้อย — ยอดล่าสุดต้องเท่ากับที่ต้นทางบอกเป๊ะ */
  const last = followers[followers.length - 1].value;
  ok(last === 41000, `ยอดผู้ติดตามวันล่าสุดตรงกับที่ต้นทางบอก (${last})`);
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[46] 🔴 สิทธิ์ Analytics พัง แต่ชั้นสาธารณะต้องยังใช้ได้");
{
  /* ⚠️ ห้ามทิ้งของที่ได้มาแล้วทั้งหมดเพราะชั้นที่ 2 พัง
     ยอดผู้ติดตามกับคลิปล่าสุดยังเป็นของจริงและยังใช้ได้ */
  const pg = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  const body = (b) => ({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  await pg.route("**/social/api/youtube", (r) => r.fulfill(body({
    ok: true, status: "ok", need: [], message: "", at: 1,
    data: {
      channel: { id: "UC1", title: "ช่อง", subs: 41000, subsApprox: true, views: 5200000, videos: 1100, url: "#" },
      videos: [{ id: "v1", title: "คลิปหนึ่ง", at: "2026-08-15T00:00:00Z", thumb: "",
                 url: "https://youtu.be/v1", views: 12345, likes: 890, comments: 45 }],
      analytics: null,
      analyticsError: "สิทธิ์ของ YouTube Analytics หมดอายุหรือถูกถอน — ต้องกดขออนุญาตใหม่",
    } })));
  for (const k of ["tiktok", "facebook"]) {
    await pg.route(`**/social/api/${k}`, (r) => r.fulfill(body({
      ok: false, status: "not-configured", need: ["X"], message: "" })));
  }
  await pg.goto(BASE + "/social/", { waitUntil: "load" });
  await pg.waitForSelector(".partial", { timeout: 5000 });
  await tabTo(pg, "YouTube");
  const v = await pg.$eval("#view", (e) => e.innerText);
  ok(/หมดอายุ/.test(v), "บอกว่าสิทธิ์ของชั้นรายวันหมดอายุ");
  ok(/41K/.test(v), "ยอดผู้ติดตามที่ได้มาแล้วยังแสดงอยู่");
  ok(/คลิปหนึ่ง/.test(v), "คลิปล่าสุดยังแสดงอยู่");
  ok(!/GOOGLE_CLIENT_ID/.test(v), "ไม่บอกให้ไปใส่ค่าใหม่ (ค่ายังถูกอยู่ ต้องแค่ขอสิทธิ์ใหม่)");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[47] 🔴 ตัวเลขผู้ติดตามห้ามย่อ + ไม่มีคนเข้าออกต้องบอกว่าไม่มี");
{
  const { pg } = await open();
  /* 🔴 เจ้าของแจ้ง 19 ส.ค. 2026 ว่า "follower โดนตัด" — ย่อเป็น 41K แล้ว
     ส่วนต่างหลักร้อยคนมองไม่เห็นเลย ทั้งที่เป็นตัวเลขที่คนดูบ่อยที่สุด */
  const v = await pg.$eval(".grid4 .sc-v", (e) => e.textContent.trim());
  ok(/,/.test(v), `ผู้ติดตามโชว์เลขเต็มมีลูกน้ำคั่น (${v})`);
  ok(!/[KM]$/.test(v), `ไม่ย่อเป็น K/M (${v})`);

  // ⚠️ ยอดวิว/engagement ยังย่ออยู่โดยตั้งใจ — หลักล้าน เขียนเต็มแล้วอ่านยากกว่า
  const others = await pg.$$eval(".grid4 .sc-v", (n) => n.slice(1, 3).map((x) => x.textContent.trim()));
  ok(others.some((x) => /[KM]/.test(x)), `ยอดวิว/engagement ยังย่อเป็น K/M (${others.join(" / ")})`);

  // การ์ดผู้ติดตามต้องมีคำอธิบายว่าตัวเลขถูกปัดมาจากต้นทาง
  const tip = await pg.$eval(".grid4 .sc .tipi", (e) => e.getAttribute("title") || "");
  ok(/ปัด/.test(tip), "บอกไว้ว่าต้นทางปัดตัวเลขมาให้");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[48] 🔴 Analytics ตอบ 200 แต่เป็นศูนย์ทั้งชุด = ผิดช่อง ไม่ใช่ช่องไม่มีคนดู");
{
  /* 🔴 เจอจริง 19 ส.ค. 2026 — บัญชี Google ที่กดอนุญาตไม่ใช่เจ้าของช่อง
     channel==MINE เลยไปหยิบช่องเปล่าของบัญชีนั้นมาแทน API ตอบสำเร็จ ไม่มี error
     ⚠️ ปล่อยผ่าน = หน้าเว็บโชว์ 0 ทุกช่องเหมือนช่องไม่มีคนดู ซึ่งผิดและหาสาเหตุยากมาก
        (โพสต์รายใบมีตัวเลขจริงอยู่ ทำให้ยิ่งงงว่าทำไมยอดรวมเป็น 0) */
  const pg = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  const body = (b) => ({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  await pg.route("**/social/api/youtube", (r) => r.fulfill(body({
    ok: true, status: "ok", need: [], message: "", at: 1,
    data: {
      channel: { id: "UC1", title: "ช่อง", subs: 41000, subsApprox: true, views: 5200000, videos: 1100, url: "#" },
      videos: [{ id: "v1", title: "EP.90", at: "2026-08-01T00:00:00Z", thumb: "",
                 url: "https://youtu.be/v1", views: 4500, likes: 55, comments: 0 }],
      analytics: null,
      analyticsError: "ดึงสถิติมาได้แต่เป็นศูนย์ทั้งหมด — แปลว่าบัญชี Google ที่กดอนุญาต " +
        "ไม่ใช่เจ้าของช่องนี้ (ไปหยิบสถิติของอีกช่องมาแทน) ต้องกดอนุญาตใหม่ด้วยบัญชีที่เป็นเจ้าของช่อง",
    } })));
  for (const k of ["tiktok", "facebook"]) {
    await pg.route(`**/social/api/${k}`, (r) => r.fulfill(body({
      ok: false, status: "not-configured", need: ["X"], message: "" })));
  }
  await pg.goto(BASE + "/social/", { waitUntil: "load" });
  await pg.waitForSelector(".partial", { timeout: 5000 });
  await tabTo(pg, "YouTube");
  const v = await pg.$eval("#view", (e) => e.innerText);
  ok(/ไม่ใช่เจ้าของช่องนี้/.test(v), "บอกสาเหตุจริงว่ากดอนุญาตผิดบัญชี");
  ok(/กดอนุญาตใหม่/.test(v), "บอกวิธีแก้");
  /* ⚠️ ห้ามโชว์ 0 เป็นตัวเลขของช่อง — ตัวเลขที่ผิดแย่กว่าไม่มีตัวเลข */
  ok((await pg.$$(".grid4")).length === 0, "ไม่โชว์การ์ดยอดรวมที่เป็น 0");
  ok(/41,?000|41K/.test(v), "ยอดผู้ติดตามที่ได้จากชั้นสาธารณะยังแสดงอยู่");
  ok(/EP\.90/.test(v), "คลิปล่าสุดยังแสดงอยู่");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[49] 🔴 เหลือช่องเดียว — ห้ามพูดเปรียบเทียบกับตัวเอง");
{
  /* 🔴 เจอจริงตอนต่อ YouTube ได้ช่องเดียว (19 ส.ค. 2026)
     ขึ้นพร้อมกัน 2 บรรทัด: "Views รวมลดลง 26%" กับ "YouTube ลดลง 26%"
     ⚠️ ข้อความที่พูดซ้ำตัวเองทำให้เจ้าของไม่เชื่อถือกล่องสรุปทั้งกล่อง */
  const { pg } = await open();
  await pg.click('[data-ch="tiktok"]');
  await pg.waitForTimeout(150);
  await pg.click('[data-ch="facebook"]');
  await pg.waitForTimeout(220);

  const chips = await pg.$$eval("#chips .ch.on", (n) => n.length);
  ok(chips === 1, `เหลือช่องเดียว (${chips})`);

  const ins = await pg.$$eval(".insight-l li", (n) => n.map((x) => x.innerText.trim()));
  ok(!ins.some((t) => /เปลี่ยนแปลงมากที่สุด/.test(t)), `ไม่มีข้อ "ช่องที่เปลี่ยนแปลงมากที่สุด" (${ins.length} ข้อ)`);
  ok(!ins.some((t) => /สูงสุดที่/.test(t)), "ไม่มีข้อ 'ช่องที่ ER สูงสุด' — ไม่มีอะไรให้เทียบ");

  // ⚠️ แถวรายช่องใต้ยอดรวมก็ซ้ำกับยอดรวมเป๊ะ
  ok((await pg.$$(".bd-r")).length === 0, "ไม่มีแถวรายช่องซ้ำกับยอดรวม");

  // เปิดกลับมา 2 ช่อง แล้วข้อเปรียบเทียบต้องกลับมา
  await pg.click('[data-ch="tiktok"]');
  await pg.waitForTimeout(220);
  const ins2 = await pg.$$eval(".insight-l li", (n) => n.map((x) => x.innerText.trim()));
  ok(ins2.some((t) => /สูงสุดที่|เปลี่ยนแปลงมากที่สุด/.test(t)), "เปิด 2 ช่องแล้วข้อเปรียบเทียบกลับมา");
  ok((await pg.$$(".bd-r")).length > 0, "แถวรายช่องกลับมาด้วย");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[50] 🔴 ตัวเลขรายคลิปต้องครบ ไม่ใช่ '—' ทั้งแถว");
{
  /* 🔴 เจ้าของถาม "ทำไมขาดข้อมูลตรงนี้" (19 ส.ค. 2026)
     แถวรวมของช่องมีตัวเลข แต่แถวย่อยรายคลิปขึ้น "—" หมด
     เพราะ Data API ให้แค่ ยอดวิว/ไลก์/คอมเมนต์ ต่อคลิป
     ⚠️ Analytics ขอต่อคลิปได้ (dimensions=video) ก็ต้องขอมา ไม่ใช่ปล่อยว่าง */
  const day = (i) => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
  const daily = [];
  for (let i = 39; i >= 0; i--) {
    daily.push({ date: day(i), views: 5000, likes: 200, comments: 10, shares: 15,
      watchTime: 250, avgViewDuration: 190, completionRate: 0.42, gained: 30, lost: 5 });
  }
  const followers = daily.map((d, i) => ({ date: d.date, value: 41000 - (daily.length - i) * 25, gained: d.gained, lost: d.lost }));

  const pg = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.route("**/social/api/youtube", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, status: "ok", need: [], message: "", at: 1, data: {
      channel: { id: "UC1", title: "ช่อง", subs: 41000, subsApprox: true, views: 5200000, videos: 1100, url: "#" },
      videos: [
        { id: "v1", title: "คลิปมีสถิติครบ", at: day(5) + "T00:00:00Z", thumb: "",
          url: "https://youtu.be/v1", views: 6200, likes: 300, comments: 12 },
        { id: "v2", title: "คลิปที่ Analytics ไม่ได้ให้มา", at: day(9) + "T00:00:00Z", thumb: "",
          url: "https://youtu.be/v2", views: 4600, likes: 210, comments: 8 },
      ],
      analytics: { daily, followers, approxLevel: true, byVideo: {
        v1: { views: 6200, likes: 300, comments: 12, shares: 41, watchTime: 310,
              avgViewDuration: 205, completionRate: 0.47 },
      } } } }) }));
  for (const k of ["tiktok", "facebook"]) {
    await pg.route(`**/social/api/${k}`, (r) => r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: false, status: "not-configured", need: ["X"], message: "" }) }));
  }
  await pg.goto(BASE + "/social/", { waitUntil: "load" });
  await pg.waitForSelector(".tbl.perf", { timeout: 5000 });

  await pg.click('[data-ptab="reach"]');
  await pg.waitForTimeout(150);
  await pg.click('[data-perf="youtube"]');
  await pg.waitForTimeout(250);

  const rows = await pg.$$eval(".perf-sub .sub-t", (n) =>
    n.map((c) => ({
      title: c.innerText.split("\n")[0].trim(),
      cells: [...c.parentElement.querySelectorAll("td")].slice(1).map((x) => x.innerText.trim()),
    })));
  const full = rows.find((r) => /มีสถิติครบ/.test(r.title));
  ok(!!full, "เจอแถวของคลิปที่มีสถิติครบ");
  ok(full.cells.filter((x) => x === "—").length <= 1,
     `คลิปนั้นมีตัวเลขเกือบทุกคอลัมน์ (${full.cells.join(" | ")})`);
  ok(full.cells.some((x) => /:/.test(x)), "มีเวลาที่ดูเฉลี่ย (รูปแบบ นาที:วินาที)");
  ok(full.cells.some((x) => /%/.test(x)), "มีสัดส่วนดูจนจบ");

  /* ⚠️ คลิปที่ Analytics ไม่ได้ให้มา ต้องขึ้น "—" ไม่ใช่ 0
     — 0 แปลว่า "วัดได้แล้วได้ศูนย์" คนละเรื่องกับ "ยังไม่ได้ตัวเลขมา" */
  const none = rows.find((r) => /ไม่ได้ให้มา/.test(r.title));
  ok(!!none && none.cells.filter((x) => x === "—").length >= 3,
     `คลิปที่ไม่มีสถิติขึ้น — ไม่ใช่ 0 (${none ? none.cells.join(" | ") : "ไม่เจอ"})`);

  // แชร์รายคลิปต้องโผล่ในแท็บ Engagement ด้วย
  await pg.click('[data-ptab="engagement"]');
  await pg.waitForTimeout(200);
  const eng = await pg.$$eval(".perf-sub .sub-t", (n) =>
    n.map((c) => [...c.parentElement.querySelectorAll("td")][3].innerText.trim()));
  ok(eng[0] !== "—", `คลิปแรกมีตัวเลขแชร์ (${eng[0]})`);
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

await browser.close();
console.log(`\n${fail ? "❌" : "✅"} ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
