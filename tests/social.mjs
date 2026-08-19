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

async function open(viewport = { width: 1400, height: 1000 }) {
  const pg = await browser.newPage({ viewport });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await pg.goto(BASE + "/social/", { waitUntil: "load" });
  await pg.waitForSelector(".sc");
  return { pg, errs };
}
const tabTo = async (pg, label) => { await pg.click(`.tab:has-text("${label}")`); await pg.waitForTimeout(140); };
const view = (pg) => pg.$eval("#view", (e) => e.innerText);
const secs = (pg) => pg.$$eval(".sec", (n) => n.map((x) => x.textContent.trim()));
// ช่วงเวลาเป็นแผงแบบกดเปิด — ตัวช่วยตัวเดียวใช้ทั้งไฟล์
const setPeriod = async (pg, k) => {
  const map = { 7: "7d", 30: "30d", 90: "90d", custom: "custom" };
  const key = map[k] || String(k);
  if (!(await pg.$(".periodpanel"))) await pg.click('[data-period="toggle"]');
  await pg.waitForSelector(".periodpanel");
  await pg.click(`[data-preset="${key}"]`);
  await pg.waitForTimeout(200);
};
const closePeriod = async (pg) => { if (await pg.$(".periodpanel")) { await pg.click('[data-period="close"]'); await pg.waitForTimeout(150); } };

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
  await pg.click('[data-cmp="yoy"]');
  const before = await pg.$eval(".ctrl-note", (e) => e.innerText);
  ok(/90 วัน/.test(before) && /เทียบกับ/.test(before), "ตั้งค่า 90 วัน + เทียบปีก่อนแล้ว");
  for (const t of ["YouTube", "TikTok", "Facebook", "ภาพรวม"]) {
    await tabTo(pg, t);
    ok((await pg.$eval(".ctrl-note", (e) => e.innerText)) === before, `แท็บ ${t}: ช่วงเวลายังเป็นชุดเดิม`);
  }
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[3] delta — ทุกตัวเลขต้องมี ยกเว้นเลือก 'ไม่เทียบ'");
{
  const { pg } = await open();
  ok((await pg.$$(".sc .dlt")).length >= 4, "สรุปบนสุดมีป้ายเทียบครบ");
  ok((await pg.$$(".tbl.cmp .cd .dlt")).length >= 8, "ทุกช่องในตารางเทียบรายช่องมี delta");

  await pg.click('[data-cmp="none"]');
  await pg.waitForTimeout(140);
  ok((await pg.$$(".dlt")).length === 0, "เลือกไม่เทียบ → ไม่มีป้ายเทียบเหลือเลย");
  ok(!/▲|▼/.test(await view(pg)), "ไม่มีลูกศรค้างอยู่");

  await pg.click('[data-cmp="prev"]');
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

console.log("\n[5b] 🔴 แนวโน้ม — กราฟเดียวสลับ metric ได้ มีเส้นรวมและเส้นรายช่อง");
{
  const { pg, errs } = await open();
  const order = await secs(pg);
  const clean = order.map((s) => s.replace(/ⓘ/g, " ").replace(/\s+/g, " ").trim());
  ok(/แนวโน้มรายวัน/.test(clean[0]), `หัวข้อแรกคือแนวโน้มรายวัน (ได้ "${clean[0]}")`);
  ok(/เพิ่มและที่หายไป/.test(clean[1]), "คู่กับผู้ติดตามที่เพิ่ม/หาย (เรื่องเดียวกัน 2 มุม)");
  const iTable = clean.findIndex((x) => /ผลงานรายช่อง/.test(x));
  ok(iTable === 2, "ตารางรายช่องอยู่ถัดจากกลุ่มแนวโน้ม");

  /* 🔴 เดิมวางกราฟเส้นใหญ่ 3 อันเรียงกัน หน้ายาวมากและอ่านทีละอันไม่ได้เทียบอะไร
     ยุบเหลืออันเดียวแล้วสลับด้วยชิพ — เพิ่มกราฟกลับมาเมื่อไหร่เทสต์นี้ตก */
  ok((await pg.$$("svg.chart")).length === 1, "หน้าภาพรวมมีกราฟเส้นอันเดียว");
  const chips = await pg.$$eval(".mchip", (n) => n.map((x) => x.textContent.trim()));
  ok(chips.length >= 4, `มีชิพสลับ metric ครบ (${chips.join(" · ")})`);
  ok(chips.filter((_, i) => i === 0).length === 1 && (await pg.$$(".mchip.on")).length === 1,
     "มีชิพที่เลือกอยู่ใบเดียว");

  /* ⚠️ "เส้นรวมทุกช่อง" คือของที่แก้ปัญหากราฟนิ่ง — ต้องมีเสมอ ไม่ใช่มีแต่เส้นรายช่อง */
  const lg = await pg.$$eval(".duo-c .legend .lg-n", (n) => n.map((x) => x.textContent.trim()));
  ok(/รวมทุกช่อง/.test(lg[0]), `เส้นแรกคือเส้นรวมทุกช่อง (${lg.join(" · ")})`);
  ok(lg.length === 4, `มีเส้นรวม 1 + รายช่อง 3 = 4 เส้น (ได้ ${lg.length})`);

  // สลับ metric แล้วกราฟต้องเปลี่ยนจริง ไม่ใช่เปลี่ยนแต่ชิพ
  const dOf = () => pg.$eval("svg.chart path", (e) => e.getAttribute("d"));
  const d1 = await dOf();
  await pg.click('[data-metric="engagement"]');
  await pg.waitForTimeout(200);
  const d2 = await dOf();
  ok(d1 !== d2, "สลับ metric แล้วเส้นเปลี่ยนตามจริง");
  ok(await pg.$eval('[data-metric="engagement"]', (e) => e.classList.contains("on")), "ชิพที่กดติดสถานะ");
  await pg.click('[data-metric="followers"]');
  await pg.waitForTimeout(200);

  // ⚠️ กราฟเคยสูงจนกินทั้งหน้าจอ — ต้องย่อลงแล้วมีของวางข้างๆ
  const fh = await pg.$eval("svg.chart", (e) => e.getBoundingClientRect().height);
  ok(fh < 230, `กราฟไม่สูงเกินไป (${Math.round(fh)}px)`);

  // ซ้าย-ขวาบนจอกว้าง
  const duos = await pg.$$eval(".duo", (n) => n.map((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length));
  ok(duos.every((c) => c === 2), `ทุกแถวคู่เป็น 2 คอลัมน์บนจอกว้าง (${duos})`);
  const side = await pg.$$eval(".duo .duo-c .panel", (n) => n.map((e) => Math.round(e.getBoundingClientRect().top)));
  ok(Math.abs(side[0] - side[1]) < 8, "กล่องซ้าย-ขวาอยู่ระดับเดียวกัน");

  // ⚠️ ทุกช่องต้องวางบนแกนเวลาชุดเดียวกัน — จำนวนจุดต้องเท่ากันทุกเส้น
  const same = await pg.evaluate(() => {
    const svg = document.querySelector("svg.chart");
    const counts = [...svg.querySelectorAll("path")].map((p) => (p.getAttribute("d").match(/[ML]/g) || []).length);
    return new Set(counts).size === 1;
  });
  ok(same, "ทุกเส้นในกราฟมีจำนวนจุดเท่ากัน (แกนเวลาชุดเดียว)");

  // ชิพเลือกช่องต้องคุมทั้งเส้นรายช่องและเส้นรวม
  const before = await pg.$eval("svg.chart", (s) => s.querySelectorAll("path").length);
  const dvBefore = (await pg.$$(".dv-row")).length;
  const sumBefore = await dOf();
  await pg.click('[data-ch="tiktok"]');
  await pg.waitForTimeout(220);
  const after = await pg.$eval("svg.chart", (s) => s.querySelectorAll("path").length);
  ok(after === before - 1, `ปิดช่องแล้วกราฟลดเส้น (${before} → ${after})`);
  ok((await dOf()) !== sumBefore, "เส้นรวมคิดใหม่ตามช่องที่เหลือ ไม่ใช่ค้างของเดิม");
  ok((await pg.$$(".dv-row")).length === dvBefore - 1, "แท่งเพิ่ม/หายที่อยู่ข้างกันก็ลดตาม");
  ok(!/TikTok/.test(await pg.$$eval(".duo", (n) => n.map((e) => e.innerText).join())), "legend ไม่มี TikTok เหลือ");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();

  // จอแคบยุบเป็นบน-ล่าง
  const { pg: m } = await open({ width: 390, height: 900 });
  const mduo = await m.$eval(".duo", (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length);
  ok(mduo === 1, "มือถือยุบเป็นคอลัมน์เดียว");
  await m.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[6] 🔴 ผลงานรายช่อง — เป็นตารางเดียว ไม่ใช่การ์ด 3 ใบ");
{
  const { pg } = await open();
  ok((await pg.$$(".pcard")).length === 0, "ไม่มีการ์ดรายช่องแบบเดิมเหลืออยู่");
  const t = await pg.$(".tbl.cmp");
  ok(!!t, "มีตารางเทียบรายช่อง");
  const heads = await pg.$$eval(".tbl.cmp thead th", (n) => n.map((x) => x.textContent.trim()));
  ok(/YouTube/.test(heads.join()) && /TikTok/.test(heads.join()) && /Facebook/.test(heads.join()), "คอลัมน์คือช่อง");
  const rowNames = await pg.$$eval('.tbl.cmp tbody th[scope="row"]', (n) => n.map((x) => x.textContent.trim()));
  ok(rowNames.length === 4, "แถวคือ metric ครบ 4 ตัว");
  ok(/ยอดวิว|การเข้าถึง/.test(rowNames[0]), "มีแถวยอดวิว/การเข้าถึง");
  ok(rowNames.some((x) => /Engagement rate/.test(x)), "มีแถว engagement rate");
  ok(rowNames.some((x) => /จำนวนโพสต์/.test(x)), "มีแถวจำนวนโพสต์");
  ok(rowNames.some((x) => /เฉลี่ยต่อโพสต์/.test(x)), "มีแถวเฉลี่ยต่อโพสต์");
  const cell = await pg.$eval(".tbl.cmp tbody tr td", (e) => ({ v: !!e.querySelector(".cv"), d: !!e.querySelector(".cd") }));
  ok(cell.v && cell.d, "แต่ละช่องมีค่า + delta ตัวเล็กใต้ค่า");
  ok(await pg.$eval(".tbl.cmp", (e) => {
    const w = e.closest(".tblwrap");
    return !!w && ["auto", "scroll"].includes(getComputedStyle(w).overflowX);
  }), "อยู่ในกล่องที่เลื่อนแนวนอนได้ (ตาม pattern เดิมของ repo)");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[7] 🔴 สัดส่วนการมองเห็น — แท่ง 100% แทนโดนัท");
{
  const { pg } = await open();
  ok((await pg.$$("svg.donut")).length === 0, "ไม่มีโดนัทเหลืออยู่");
  ok((await pg.$$(".share")).length === 1, "มีแท่ง 100% แท่งเดียว");
  const segs = await pg.$$eval(".share-s", (n) => n.map((x) => ({ w: x.style.width, t: x.textContent.trim() })));
  ok(segs.length === 3, "แบ่ง 3 ช่อง");
  ok(segs.every((s) => /%$/.test(s.w)), "ความกว้างเป็นสัดส่วน %");
  ok(segs.filter((s) => /%/.test(s.t)).length >= 2, "มีป้าย % บนแท่ง");
  const legend = await pg.evaluate(() => {
    const sh = document.querySelector(".share");
    return sh.parentElement.querySelector(".legend").innerText;
  });
  ok(/pt/.test(legend), "legend มี delta หน่วย pt");

  // ต้องเตี้ยกว่าโดนัทเดิมอย่างน้อยครึ่งหนึ่ง (โดนัทเดิม 180px + legend)
  const hh = await pg.$eval(".share", (e) => e.closest(".panel").getBoundingClientRect().height);
  ok(hh < 130, `section เตี้ยลงจริง (${Math.round(hh)}px)`);
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
  const colsBefore = await pg.$$eval(".tbl.cmp thead th", (n) => n.length);
  const segsBefore = await pg.$$eval(".share-s", (n) => n.length);
  const dvBefore = await pg.$$eval(".dv-row", (n) => n.length);
  const headsBefore = await pg.$$eval(".tcard-h", (n) => n.map((x) => x.textContent.trim()));

  await pg.click('[data-ch="youtube"]');
  await pg.waitForTimeout(180);

  ok(await pg.$eval('[data-ch="youtube"]', (e) => e.getAttribute("aria-pressed") === "false"), "ชิพเปลี่ยนเป็นสถานะปิด");
  ok((await pg.$$eval(".tbl.cmp thead th", (n) => n.length)) === colsBefore - 1, "ตารางลดคอลัมน์ YouTube ออก");
  ok((await pg.$$eval(".share-s", (n) => n.length)) === segsBefore - 1, "แท่งสัดส่วนเหลือ 2 ช่อง");
  ok((await pg.$$eval(".dv-row", (n) => n.length)) === dvBefore - 1, "diverging bar เหลือ 2 แถว");
  ok(!/YouTube/.test(await pg.$eval(".tbl.cmp", (e) => e.innerText)), "ไม่มีคำว่า YouTube ในตารางแล้ว");

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
console.log("\n[9b] 🔴 ปุ่มแยกช่อง — กางตัวเลขรายช่องใต้ยอดรวม");
{
  const { pg, errs } = await open();
  ok((await pg.$$(".bd-r")).length === 0, "ยังไม่กด ยังไม่มีแถวรายช่อง");

  await pg.click("[data-bd]");
  await pg.waitForTimeout(180);
  ok((await pg.$$(".bd-r")).length === 12, "กางแล้วได้ 12 แถว (4 การ์ด × 3 ช่อง)");
  ok(await pg.$eval("[data-bd]", (e) => e.getAttribute("aria-pressed") === "true"), "ปุ่มเป็นสถานะกางอยู่");

  const first = await pg.$eval(".sc", (e) => e.innerText);
  ok(/YT/.test(first) && /TT/.test(first) && /FB/.test(first), "การ์ดแรกแจกแจงครบ 3 ช่อง");
  ok((await pg.$$(".bd-r .dlt")).length === 12, "ทุกแถวรายช่องมี delta ของตัวเอง");

  // 🔴 รายช่องต้องบวกกันได้เท่ายอดรวม ไม่งั้นดูเหมือนคำนวณผิด
  const sums = await pg.evaluate(() => {
    const card = [...document.querySelectorAll(".sc")].find((c) => /การมองเห็นรวม/.test(c.querySelector(".sc-l").textContent));
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

  await pg.click("[data-bd]");
  await pg.waitForTimeout(150);
  ok((await pg.$$(".bd-r")).length === 0, "กดซ้ำแล้วยุบกลับ");

  // ไม่โผล่ในแท็บรายช่อง (ช่องเดียวอยู่แล้ว ไม่มีอะไรให้แยก)
  await tabTo(pg, "TikTok");
  ok((await pg.$$("[data-bd]")).length === 0, "แท็บรายช่องไม่มีปุ่มแยกช่อง");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[9c] ลูกศรกับตัวเลขของ delta ต้องเล่าเรื่องเดียวกัน");
{
  const { pg } = await open();
  await pg.click("[data-bd]");
  await pg.waitForTimeout(180);
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
  // จอกว้าง: ทุกใบต้องอยู่แถวเดียวกัน
  const { pg } = await open({ width: 1400, height: 1000 });
  for (const [t, n] of [["YouTube", 6], ["TikTok", 5], ["Facebook", 4]]) {
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
  for (const [t, n] of [["TikTok", 5], ["YouTube", 6], ["Facebook", 4]]) {
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
  for (const [t, must] of [["YouTube", /เวลาที่คนดูรวม/], ["TikTok", /ดูจนจบ/], ["Facebook", /การเข้าถึง/]]) {
    await tabTo(pg, t);
    const v = await view(pg), s = await secs(pg);
    ok(must.test(v), `${t}: metric เฉพาะแพลตฟอร์มยังอยู่`);
    ok(s.some((x) => /แยกประเภท/.test(x)), `${t}: ③ แยกประเภทการมีส่วนร่วม`);
    ok(s.some((x) => /มีส่วนร่วมมากที่สุด/.test(x)), `${t}: ④ อันดับบน`);
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
  ok(!/แชร์/.test(f.YouTube), "YouTube: สูตรไม่มีแชร์");
  ok(/แชร์/.test(f.TikTok), "TikTok: นับแชร์ด้วย");
  ok(/การเข้าถึง/.test(f.Facebook), "Facebook: หารด้วยการเข้าถึง");
  ok(new Set(Object.values(f)).size === 3, "ทั้ง 3 ช่องใช้สูตรคนละแบบจริง");
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
  const note = await pg.$eval(".ctrl-note", (e) => e.innerText);
  ok(/21 วัน/.test(note), "นับจำนวนวันถูก");
  await tabTo(pg, "Facebook");
  ok((await pg.$eval(".ctrl-note", (e) => e.innerText)) === note, "ช่วงกำหนดเองคงอยู่ข้ามแท็บ");

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
  await p3.goto(BASE + "/social/", { waitUntil: "load" });
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
  ok(items.length >= 12, `มีตัวเลือกครบ (${items.length} ตัว)`);
  for (const want of ["วันนี้", "เมื่อวาน", "7 วัน", "28 วัน", "30 วัน", "90 วัน",
                      "เดือนนี้", "เดือนที่แล้ว", "3 เดือน", "12 เดือน", "ปีนี้", "ปีที่แล้ว", "กำหนดเอง"]) {
    ok(items.some((i) => i.includes(want)), `มีตัวเลือก "${want}"`);
  }
  ok(items.filter((i) => /–/.test(i)).length >= 11, "แต่ละตัวเลือกบอกช่วงวันที่จริงกำกับ");

  // ⚠️ ช่วงที่ข้ามปีต้องมีปีกำกับ ไม่งั้น "20 ส.ค. – 19 ส.ค." อ่านเหมือนช่วงสั้นๆ
  const yr = items.find((i) => i.includes("12 เดือน"));
  ok(/\d{4}/.test(yr), `ช่วงข้ามปีมีปีกำกับ (${yr})`);
  const cur = new Date().getFullYear();
  ok(items.some((i) => i.includes("ปีนี้") && i.includes(String(cur))), "ตัวเลือกรายปีบอกเลขปีจริง");

  // เลือกแล้วปิดแผงเอง ไม่ต้องกดซ้ำ
  await pg.click('[data-preset="lastmonth"]');
  await pg.waitForTimeout(220);
  ok((await pg.$$(".periodpanel")).length === 0, "เลือกของสำเร็จรูปแล้วแผงปิดเอง");
  const note = await pg.$eval(".ctrl-note", (e) => e.innerText);
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
  const cmps = await pg.$$eval("#cmp button", (n) => n.map((x) => x.textContent.trim()));
  ok(cmps.includes("เดือนที่แล้ว"), `มีตัวเลือก 'เดือนที่แล้ว' (${cmps.join(" / ")})`);

  for (const [k, name] of [["prev", "ช่วงก่อนหน้า"], ["lastmonth", "เดือนที่แล้ว"], ["yoy", "ปีก่อน"]]) {
    await pg.click(`[data-cmp="${k}"]`);
    await pg.waitForTimeout(160);
    const note = await pg.$eval(".ctrl-note", (e) => e.innerText);
    ok(note.includes(name), `${k}: แถบบอกชื่อช่วงที่เทียบ ("${name}")`);
    ok(/\d+\s*[ก-๙.]+\s*–/.test(note), `${k}: บอกวันที่ของช่วงเทียบด้วย`);
    const t = await pg.$eval(".sc .dlt", (e) => e.getAttribute("title") || "");
    ok(t.includes(name), `${k}: ป้าย delta ก็บอกว่าเทียบกับอะไร`);
  }

  // เดือนที่แล้วต้องถอยด้วยเดือนปฏิทิน ไม่ใช่ลบ 30 วันตายตัว
  await setPeriod(pg, 30);
  await pg.click('[data-cmp="lastmonth"]');
  await pg.waitForTimeout(160);
  const okMonth = await pg.evaluate(() => {
    const m = document.querySelector(".ctrl-note").innerText.match(/เดือนที่แล้ว \((.+?) – (.+?)\)/);
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
      ok(/YouTube|TikTok|Facebook|Engagement/.test(txt), `กราฟที่ ${i + 1}: บอกว่าเป็นเส้นไหน`);
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
console.log("\n[25] 🔴 ป้ายใต้กราฟ กดปิด/เปิดเส้นได้");
{
  const { pg, errs } = await open();
  const btns = await pg.$$(".lg-btn");
  // กราฟเดียว = เส้นรวม 1 + รายช่อง 3
  ok(btns.length === 4, `ป้ายใต้กราฟเป็นปุ่มกดได้ (${btns.length} ปุ่ม)`);

  const pathsOf = () => pg.$$eval("svg.chart", (n) => n.map((s) => s.querySelectorAll("path").length));
  const before = await pathsOf();
  await pg.click(".lg-btn");
  await pg.waitForTimeout(220);
  const after = await pathsOf();
  ok(after[0] === before[0] - 1, `กดแล้วเส้นนั้นหายจากกราฟ (${before[0]} → ${after[0]})`);
  ok(after[1] === before[1] && after[2] === before[2], "กราฟอื่นไม่ถูกกระทบ (จำแยกรายกราฟ)");

  const first = await pg.$(".lg-btn");
  ok((await first.getAttribute("aria-pressed")) === "false", "ปุ่มบอกสถานะปิดให้ screen reader");
  ok((await first.evaluate((e) => e.className)).includes("off"), "ปุ่มยังอยู่ให้กดกลับ แค่จางลง");

  // ⚠️ ปิดเส้นที่ค่าสูงแล้ว แกนต้องขยายตามเส้นที่เหลือ ไม่ใช่ค้างที่ของเดิม
  const axAfter = await pg.$$eval("svg.chart .ax", (n) => n.map((x) => x.textContent.trim()));
  ok(axAfter.length > 0, "แกนยังวาดอยู่หลังปิดเส้น");

  await first.click();
  await pg.waitForTimeout(220);
  ok((await pathsOf())[0] === before[0], "กดกลับแล้วเส้นกลับมา");

  // ต้องรอด render ใหม่ (สลับแท็บไปกลับ)
  await pg.click(".lg-btn");
  await pg.waitForTimeout(200);
  await tabTo(pg, "TikTok");
  await tabTo(pg, "ภาพรวม");
  ok((await pg.$eval(".lg-btn", (e) => e.className)).includes("off"), "สลับแท็บกลับมา เส้นที่ปิดไว้ยังปิดอยู่");
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
  await pg.click('[data-cmp="none"]');
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

  // drill-down: หัวคอลัมน์เป็นปุ่มจริง กดแล้วไปแท็บนั้น
  const drills = await pg.$$eval(".tbl.cmp thead .drill", (n) =>
    n.map((x) => ({ tag: x.tagName, tab: x.dataset.tab })));
  ok(drills.length === 3, `หัวคอลัมน์เป็นปุ่มครบ 3 ช่อง (ได้ ${drills.length})`);
  ok(drills.every((d) => d.tag === "BUTTON"), "เป็น <button> จริง (คีย์บอร์ดใช้ได้)");
  ok(drills.every((d) => ["youtube", "tiktok", "facebook"].includes(d.tab)), "ชี้ไปแท็บของช่องนั้นถูกต้อง");

  await pg.click('.tbl.cmp thead .drill[data-tab="tiktok"]');
  await pg.waitForTimeout(200);
  const on = await pg.$eval(".tab.on", (e) => e.innerText);
  ok(/TikTok/.test(on), `กดหัวคอลัมน์แล้วเด้งไปแท็บนั้นจริง (${on.replace(/\s+/g, " ")})`);
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
  await m.goto(BASE + "/social/", { waitUntil: "load" });
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

await browser.close();
console.log(`\n${fail ? "❌" : "✅"} ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
