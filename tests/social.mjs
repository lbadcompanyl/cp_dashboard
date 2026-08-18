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
  await pg.click('[data-days="90"]');
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
  await pg.click('[data-days="30"]');
  await pg.waitForTimeout(150);

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
console.log("\n[5] 🔴 แกน Y กราฟผู้ติดตาม — % สะสม เริ่ม 0% และห้ามมีป้ายซ้ำ");
{
  const { pg } = await open();
  for (const days of [7, 30, 90]) {
    await pg.click(`[data-days="${days}"]`);
    await pg.waitForTimeout(180);
    const ax = await pg.$$eval("svg.chart .ax", (n) => n.map((x) => x.textContent.trim()).filter((t) => /%/.test(t)));
    ok(ax.length >= 4, `${days} วัน: มีป้ายแกน Y (${ax.join(" / ")})`);
    ok(new Set(ax).size === ax.length, `${days} วัน: ป้ายแกน Y ไม่ซ้ำกันเลย`);
    ok(ax.every((t) => /%$/.test(t)), `${days} วัน: ทุกป้ายเป็นหน่วย %`);
    // ต้องไม่ใช่ index 100 ของเดิม
    ok(!ax.some((t) => /^1?0[01]%?$/.test(t.replace(/[+%]/g, ""))) || ax.some((t) => /\./.test(t)),
       `${days} วัน: ไม่ใช่ค่าที่ปัดจนเหลือ 100/101 แบบเดิม`);
  }
  const v = await view(pg);
  ok(/% เปลี่ยนแปลงสะสมจากวันแรก/.test(v), "คำบรรยายตรงกับวิธีคิดใหม่");
  ok(!/เริ่มที่ 100/.test(v), "ไม่มีคำอธิบายของวิธีเดิม (index 100) ค้างอยู่");
  await pg.close();
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
  const chipsBefore = await pg.$$eval(".posts .post .chip", (n) => n.map((x) => x.textContent.trim()));

  await pg.click('[data-ch="youtube"]');
  await pg.waitForTimeout(180);

  ok(await pg.$eval('[data-ch="youtube"]', (e) => e.getAttribute("aria-pressed") === "false"), "ชิพเปลี่ยนเป็นสถานะปิด");
  ok((await pg.$$eval(".tbl.cmp thead th", (n) => n.length)) === colsBefore - 1, "ตารางลดคอลัมน์ YouTube ออก");
  ok((await pg.$$eval(".share-s", (n) => n.length)) === segsBefore - 1, "แท่งสัดส่วนเหลือ 2 ช่อง");
  ok((await pg.$$eval(".dv-row", (n) => n.length)) === dvBefore - 1, "diverging bar เหลือ 2 แถว");
  ok(!/YouTube/.test(await pg.$eval(".tbl.cmp", (e) => e.innerText)), "ไม่มีคำว่า YouTube ในตารางแล้ว");

  const totalAfter = await pg.$eval(".sc .sc-v", (e) => e.textContent.trim());
  ok(totalAfter !== totalBefore, `ยอดรวมคิดใหม่จริง (${totalBefore} → ${totalAfter})`);

  const chipsAfter = await pg.$$eval(".posts .post .chip", (n) => n.map((x) => x.textContent.trim()));
  ok(!chipsAfter.includes("YouTube"), "top content ไม่มีของ YouTube ปนแล้ว");
  ok(chipsBefore.length > 0 && chipsAfter.length > 0, "top content ยังมีของช่องที่เหลือ");

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
console.log("\n[11] 🔴 กราฟรายช่อง — แกน Y คู่ เส้น ER อ่านแกนขวา");
{
  const { pg } = await open();
  for (const t of ["YouTube", "TikTok", "Facebook"]) {
    await tabTo(pg, t);
    const chart = await pg.evaluate(() => {
      const h = [...document.querySelectorAll(".sec")].find((x) => /รายวัน/.test(x.textContent));
      const p = h ? h.nextElementSibling : null;
      const svg = p ? p.querySelector("svg.chart") : null;
      if (!svg) return null;
      return {
        left: [...svg.querySelectorAll(".ax:not(.ax-r)")].map((x) => x.textContent.trim()),
        right: [...svg.querySelectorAll(".ax-r")].map((x) => x.textContent.trim()),
        legend: p.querySelector(".legend").innerText,
        paths: svg.querySelectorAll("path").length,
      };
    });
    ok(!!chart, `${t}: มีกราฟรายวัน`);
    ok(chart.right.length >= 4, `${t}: มีป้ายแกนขวา`);
    ok(chart.right.every((v) => /%$/.test(v)), `${t}: แกนขวาเป็นหน่วย % (ER)`);
    ok(chart.left.some((v) => !/%$/.test(v)), `${t}: แกนซ้ายไม่ใช่ % (ยอดวิว/การเข้าถึง)`);
    ok(chart.paths === 2, `${t}: วาด 2 เส้น`);
    ok(/แกนซ้าย/.test(chart.legend) && /แกนขวา/.test(chart.legend), `${t}: legend บอกว่าเส้นไหนอ่านแกนไหน`);
    ok(/[Ee]ngagement rate/.test(chart.legend), `${t}: เส้นที่สองเป็น engagement rate ไม่ใช่ engagement ดิบ`);
    ok(new Set(chart.right).size === chart.right.length, `${t}: ป้ายแกนขวาไม่ซ้ำ`);
  }
  await pg.close();
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
  await pg.click('[data-days="90"]');
  await pg.waitForTimeout(160);
  const n90 = await pg.$$eval(".tbl:not(.cmp) tbody tr", (n) => n.length);
  await pg.click('[data-days="7"]');
  await pg.waitForTimeout(160);
  const n7 = await pg.$$eval(".tbl:not(.cmp) tbody tr", (n) => n.length);
  ok(n7 < n90, `ช่วงแคบลงรายการน้อยลง (7 วัน ${n7} < 90 วัน ${n90})`);

  await pg.click('[data-days="90"]');
  await pg.waitForTimeout(160);
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
  await pg.click('[data-days="custom"]');
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
  await pg.click('[data-days="custom"]');
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

await browser.close();
console.log(`\n${fail ? "❌" : "✅"} ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
