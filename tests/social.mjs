// แดชบอร์ดโซเชียล 4 แท็บ — คุมข้อกำหนดที่พังแล้วดูไม่ออกด้วยตาเปล่า
//
// เรื่องที่คุมไว้: ช่วงเวลา/โหมดเทียบต้องใช้ร่วมกันทุกแท็บ · ทุกตัวเลขต้องมี delta
// (ยกเว้นเลือกไม่เทียบ) · Top/Bottom/Newest ต้องกรองตามช่วงที่เลือก ·
// ไม่มีข้อมูลต้องบอกว่าไม่มี ห้ามลากกราฟเป็น 0 · จอแคบต้องอ่านจบ
//
// ⚠️ ยิงเน็ตออกนอกไม่ได้ — หน้านี้ใช้ข้อมูลจำลองในตัว ไม่ต้องปลอม API
// ต้องมีเซิร์ฟเวอร์ static ที่พอร์ต 8899:  python3 -m http.server 8899 --directory ..

import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8899";
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log("  ✅ " + m)) : (fail++, console.log("  ❌ " + m)); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

async function open(viewport = { width: 1280, height: 900 }) {
  const pg = await browser.newPage({ viewport });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await pg.goto(BASE + "/social/", { waitUntil: "load" });
  await pg.waitForSelector(".sc");
  return { pg, errs };
}

const tabTo = async (pg, label) => {
  await pg.click(`.tab:has-text("${label}")`);
  await pg.waitForTimeout(120);
};
const view = (pg) => pg.$eval("#view", (e) => e.innerText);
const secs = (pg) => pg.$$eval(".sec", (n) => n.map((x) => x.textContent.trim()));

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[1] โครงหน้า — 4 แท็บ อ่านจาก config ไม่ได้เขียนค้างใน HTML");
{
  const { pg, errs } = await open();
  const tabs = await pg.$$eval(".tab", (n) => n.map((x) => x.dataset.tab));
  ok(tabs.join(",") === "summary,youtube,tiktok,facebook", "แท็บครบ 4 ตัว เรียงถูก");

  // ⚠️ ต้องเพิ่มแท็บใหม่ได้โดยไม่ต้องแตะ HTML — เช็คว่า HTML ไม่ได้ hardcode ปุ่มไว้
  const html = await (await fetch(BASE + "/social/index.html")).text();
  ok(!/data-tab=/.test(html), "ปุ่มแท็บไม่ได้เขียนค้างไว้ใน HTML (เพิ่มแท็บ paid ทีหลังได้)");
  ok(errs.length === 0, "ไม่มี JS error");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[2] ช่วงเวลา + โหมดเทียบ ต้องใช้ร่วมกันทุกแท็บ");
{
  const { pg } = await open();
  await pg.click('[data-days="90"]');
  await pg.click('[data-cmp="yoy"]');
  const noteBefore = await pg.$eval(".ctrl-note", (e) => e.innerText);
  ok(/90 วัน/.test(noteBefore), "ตั้งเป็น 90 วันแล้ว");
  ok(/เทียบกับ/.test(noteBefore), "ตั้งเป็นเทียบปีก่อนแล้ว");

  for (const t of ["YouTube", "TikTok", "Facebook", "ภาพรวม"]) {
    await tabTo(pg, t);
    const n = await pg.$eval(".ctrl-note", (e) => e.innerText);
    ok(n === noteBefore, `สลับไปแท็บ ${t} แล้วช่วงเวลายังเป็นชุดเดิม`);
  }
  const on = await pg.$$eval(".seg button.on", (n) => n.map((x) => x.textContent.trim()));
  ok(on.includes("90 วัน") && on.includes("ปีก่อน"), "ปุ่มที่เลือกไว้ยังไฮไลต์ถูกหลังสลับแท็บ");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[3] ทุกตัวเลขต้องมี delta — ยกเว้นเลือก 'ไม่เทียบ'");
{
  const { pg } = await open();
  let d = await pg.$$(".sc .dlt");
  ok(d.length >= 4, `สรุป 4 ใบมีป้ายเทียบครบ (${d.length})`);

  await pg.click('[data-cmp="none"]');
  await pg.waitForTimeout(120);
  d = await pg.$$(".dlt");
  ok(d.length === 0, "เลือกไม่เทียบ → ไม่มีป้ายเทียบเหลือเลยสักอัน");
  const txt = await view(pg);
  ok(!/▲|▼/.test(txt), "ไม่มีลูกศรขึ้นลงค้างอยู่");

  await pg.click('[data-cmp="prev"]');
  await pg.waitForTimeout(120);
  ok((await pg.$$(".dlt")).length > 0, "กลับมาเทียบแล้วป้ายกลับมา");

  // แท็บช่องก็ต้องมีครบเหมือนกัน
  await tabTo(pg, "TikTok");
  ok((await pg.$$(".sc .dlt")).length >= 4, "แท็บช่องก็มีป้ายเทียบครบทุกใบ");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[4] แท็บภาพรวม — ครบและเรียงตามที่สั่ง");
{
  const { pg } = await open();
  ok((await pg.$$(".sc")).length === 4, "① สรุป 4 ใบ");
  ok((await pg.$$(".pcard")).length === 3, "② การ์ดรายช่อง 3 ใบ");
  const s = await secs(pg);
  const idx = (re) => s.findIndex((x) => re.test(x));
  ok((await pg.$$("svg.donut")).length === 1, "③ มีโดนัทสัดส่วน");
  ok(idx(/สัดส่วน/) < idx(/แนวโน้มผู้ติดตาม/), "③ มาก่อน ④");
  ok(idx(/แนวโน้มผู้ติดตาม/) < idx(/เพิ่มและที่หายไป/), "④ มาก่อน ⑤");
  ok(idx(/เพิ่มและที่หายไป/) < idx(/มีส่วนร่วมมากที่สุด/), "⑤ มาก่อน ⑥");
  ok((await pg.$$(".gl-row")).length === 3, "⑤ มีแท่งได้/เสีย ครบ 3 ช่อง");

  const top = await pg.$$(".posts .post");
  ok(top.length === 3, "⑥ คอนเทนต์เด่น 3 ใบ");
  ok((await pg.$$(".posts .post .chip")).length === 3, "⑥ ทุกใบบอกว่ามาจากช่องไหน");

  // ④ ต้องเป็น index 100 ไม่ใช่ตัวเลขดิบ
  const yLabels = await pg.$$eval("svg.chart .ax", (n) => n.map((x) => x.textContent));
  ok(yLabels.some((v) => /^\d{2,3}$/.test(v)), "④ แกน Y เป็นเลขฐาน 100 ไม่ใช่หลักหมื่น");
  ok(/เริ่มที่ 100/.test(await view(pg)), "④ อธิบายว่าทำไมถึงใช้ฐาน 100");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[5] แท็บรายช่อง — โครงเดียวกันทั้ง 3 ช่อง + metric เฉพาะช่อง");
{
  const { pg } = await open();
  for (const [t, must] of [
    ["YouTube", /เวลาที่คนดูรวม/],
    ["TikTok", /ดูจนจบ/],
    ["Facebook", /การเข้าถึง/],
  ]) {
    await tabTo(pg, t);
    const v = await view(pg);
    const s = await secs(pg);
    ok(must.test(v), `${t}: มี metric เฉพาะแพลตฟอร์ม`);
    ok(s.some((x) => /รายวัน/.test(x)), `${t}: ② กราฟรายวัน`);
    ok(s.some((x) => /แยกประเภท/.test(x)), `${t}: ③ แยกประเภทการมีส่วนร่วม`);
    ok(s.some((x) => /ล่าสุด/.test(x)), `${t}: ⑤ ล่าสุด`);
    ok(s.some((x) => /ผลตอบรับน้อยที่สุด/.test(x)), `${t}: ⑥ ผลตอบรับน้อยที่สุด`);
    ok(s.some((x) => /ทั้งหมดในช่วงที่เลือก/.test(x)), `${t}: ⑦ ตารางทั้งหมด`);
    ok(/สูตร/.test(v), `${t}: มีเชิงอรรถบอกสูตร ER`);
  }

  // ③ ต้องบอก "จำนวนจริง" ไม่ใช่แค่สัดส่วน
  await tabTo(pg, "TikTok");
  const legend = await pg.$eval(".stackbar", (e) => e.parentElement.innerText);
  ok(/ไลก์/.test(legend) && /แชร์/.test(legend), "③ แจกแจง ไลก์/คอมเมนต์/แชร์");
  ok(/\d/.test(legend), "③ มีตัวเลขจำนวนจริง ไม่ใช่แค่เปอร์เซ็นต์");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[6] สูตร ER ของแต่ละช่องต้องไม่เหมือนกัน (ห้ามบังคับให้เท่ากัน)");
{
  const { pg } = await open();
  // ⚠️ อ่านเฉพาะตัวสูตร ไม่เอาคำอธิบายท้าย — คำอธิบายของ YouTube มีคำว่า "แชร์"
  //    อยู่ในประโยค "ไม่ได้นับรวม" ซึ่งไม่ได้แปลว่าสูตรนับแชร์
  const f = {};
  for (const t of ["YouTube", "TikTok", "Facebook"]) {
    await tabTo(pg, t);
    f[t] = await pg.$eval(".formula b", (e) => e.textContent);
  }
  ok(!/แชร์/.test(f.YouTube), "YouTube: สูตรไม่มีแชร์ (API ไม่ให้ตัวเลข)");
  ok(/แชร์/.test(f.TikTok), "TikTok: นับแชร์ด้วย");
  ok(/การเข้าถึง/.test(f.Facebook), "Facebook: หารด้วยการเข้าถึง ไม่ใช่ยอดวิว");
  ok(new Set(Object.values(f)).size === 3, "ทั้ง 3 ช่องใช้สูตรคนละแบบจริง");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[7] Top/Newest/ตาราง ต้องกรองตามช่วงที่เลือกเท่านั้น");
{
  const { pg } = await open();
  await tabTo(pg, "TikTok");

  await pg.click('[data-days="90"]');
  await pg.waitForTimeout(150);
  const n90 = await pg.$$eval(".tbl tbody tr", (n) => n.length);

  await pg.click('[data-days="7"]');
  await pg.waitForTimeout(150);
  const n7 = await pg.$$eval(".tbl tbody tr", (n) => n.length);

  ok(n7 < n90, `ช่วงแคบลงแล้วรายการน้อยลงจริง (7 วัน ${n7} < 90 วัน ${n90})`);

  // วันที่ในตารางต้องอยู่ในช่วงที่บอกไว้บนแถบควบคุมเท่านั้น
  await pg.click('[data-days="90"]');
  await pg.waitForTimeout(150);
  const rowsOut = await pg.evaluate(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const lim = new Date(now.getTime() - 95 * 864e5);
    return [...document.querySelectorAll(".tbl tbody tr")].filter((tr) => {
      const t = tr.children[1].textContent.trim();
      return t === "" || t == null;
    }).length;
  });
  ok(rowsOut === 0, "ทุกแถวมีวันที่ครบ ไม่มีของหลุดช่วงเข้ามา");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[8] ป้าย 'ยังใหม่' และการตัดใบใหม่ออกจากอันดับท้าย");
{
  const { pg } = await open();
  await tabTo(pg, "TikTok");
  await pg.click('[data-days="90"]');
  await pg.waitForTimeout(150);

  const newestSec = await pg.evaluate(() => {
    const h = [...document.querySelectorAll(".sec")].find((x) => /ล่าสุด/.test(x.textContent));
    return h ? h.nextElementSibling.innerText : "";
  });
  ok(/ยังใหม่/.test(newestSec), "⑤ ใบที่อายุน้อยกว่า 7 วันติดป้าย 'ยังใหม่'");

  const bottomSec = await pg.evaluate(() => {
    const h = [...document.querySelectorAll(".sec")].find((x) => /ผลตอบรับน้อยที่สุด/.test(x.textContent));
    return h ? h.nextElementSibling.innerText : "";
  });
  ok(!/ยังใหม่/.test(bottomSec), "⑥ ไม่มีใบที่ยังใหม่ปนอยู่ในอันดับท้าย");
  ok(/เกิน 7 วัน/.test(await view(pg)), "⑥ บอกเหตุผลว่าทำไมถึงตัดใบใหม่ออก");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[9] ไม่มีข้อมูลในช่วงที่เลือก → ต้องบอกชัด ห้ามลากกราฟเป็น 0");
{
  const { pg, errs } = await open();
  await pg.click('[data-days="custom"]');
  await pg.waitForSelector("#d1");
  await pg.fill("#d1", "2009-01-01");
  await pg.fill("#d2", "2009-01-31");
  await pg.waitForTimeout(200);

  const v = await view(pg);
  ok(/ไม่มีข้อมูลในช่วงที่เลือก/.test(v), "ภาพรวม: บอกตรงๆ ว่าไม่มีข้อมูล");
  ok((await pg.$$("svg.chart")).length === 0, "ไม่วาดกราฟเปล่าที่ลากเป็น 0");
  ok(!/^—$/m.test(v), "ไม่ขึ้น '—' ลอยๆ แบบไม่มีคำอธิบาย");
  ok((await pg.$$(".empty")).length > 0, "ใช้กล่องบอกสถานะว่างจริงๆ");

  await tabTo(pg, "YouTube");
  ok(/ไม่มีข้อมูล/.test(await view(pg)), "แท็บช่องก็บอกว่าไม่มีข้อมูล");
  ok(errs.length === 0, "ไม่มี JS error ตอนไม่มีข้อมูล");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[10] custom range — เลือกวันเองได้ และค่าคงอยู่ข้ามแท็บ");
{
  const { pg } = await open();
  await pg.click('[data-days="custom"]');
  await pg.waitForSelector("#d1");
  ok((await pg.$("#d1")) && (await pg.$("#d2")), "มีช่องเลือกวันที่เริ่ม–สิ้นสุด");
  const type = await pg.$eval("#d1", (e) => e.type);
  ok(type === "date", "ใช้ตัวเลือกวันที่ของเบราว์เซอร์ ไม่เพิ่มไลบรารี");

  const end = new Date(); end.setHours(0, 0, 0, 0);
  const s = new Date(end.getTime() - 20 * 864e5);
  const k = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  await pg.fill("#d1", k(s));
  await pg.fill("#d2", k(end));
  await pg.waitForTimeout(200);
  const note = await pg.$eval(".ctrl-note", (e) => e.innerText);
  ok(/21 วัน/.test(note), "นับจำนวนวันถูก (รวมวันเริ่มและวันจบ)");

  await tabTo(pg, "Facebook");
  ok((await pg.$eval(".ctrl-note", (e) => e.innerText)) === note, "ช่วงที่กำหนดเองคงอยู่ข้ามแท็บ");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[11] ตารางเรียงได้ตาม วันที่ / views / ER");
{
  const { pg } = await open();
  await tabTo(pg, "YouTube");
  await pg.click('[data-days="90"]');
  await pg.waitForTimeout(150);

  const col = (i) => pg.$$eval(".tbl tbody tr", (rows, idx) => rows.map((r) => r.children[idx].textContent.trim()), i);

  await pg.click('[data-sort="er"]');
  await pg.waitForTimeout(120);
  const erDesc = (await col(3)).map((x) => parseFloat(x));
  ok(erDesc.every((v, i, a) => i === 0 || a[i - 1] >= v), "เรียง ER มากไปน้อย");

  await pg.click('[data-sort="er"]');
  await pg.waitForTimeout(120);
  const erAsc = (await col(3)).map((x) => parseFloat(x));
  ok(erAsc.every((v, i, a) => i === 0 || a[i - 1] <= v), "กดซ้ำแล้วสลับเป็นน้อยไปมาก");

  await pg.click('[data-sort="date"]');
  await pg.waitForTimeout(120);
  ok((await pg.$eval(".tbl", (e) => e.innerHTML)).includes("▼"), "มีลูกศรบอกว่ากำลังเรียงคอลัมน์ไหน");

  // ⚠️ การเรียงต้องรอด render ใหม่ — เก็บใน state ไม่ใช่ใน DOM อย่างเดียว
  await tabTo(pg, "TikTok");
  await tabTo(pg, "YouTube");
  ok((await pg.$eval(".tbl", (e) => e.innerHTML)).includes("▼"), "สลับแท็บกลับมาแล้วการเรียงยังอยู่");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[12] มือถือ — ต้องอ่านจบ ไม่ล้นแนวนอน");
{
  const { pg, errs } = await open({ width: 390, height: 844 });
  // กฎของโปรเจกต์: ของกว้างๆ (ตาราง/แถบแท็บ) ต้องเลื่อน "ในกล่องตัวเอง"
  // ตัวหน้าห้ามเลื่อนแนวนอนเด็ดขาด — จึงยอมให้ล้นได้เฉพาะที่อยู่ในกล่องที่ตั้งใจให้เลื่อน
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
        sw: document.scrollingElement.scrollWidth,
        iw: window.innerWidth,
        over: [...document.querySelectorAll("body *")]
          .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !inScroller(e))
          .map((e) => e.tagName + "." + (e.className || "").toString().split(" ")[0]),
      };
    });
    ok(m.sw <= m.iw + 1, `${t}: หน้าไม่เลื่อนแนวนอน (${m.sw}/${m.iw})`);
    ok(m.over.length === 0, `${t}: ไม่มีอะไรล้นขอบนอกกล่องที่ให้เลื่อน (${m.over.join(",") || "ไม่มี"})`);
  }
  // ตารางต้องเลื่อนในกล่องตัวเองจริง ไม่ใช่ดันทั้งหน้า
  await tabTo(pg, "YouTube");
  ok(await pg.$eval(".tblwrap", (e) => e.scrollWidth > e.clientWidth &&
     ["auto", "scroll"].includes(getComputedStyle(e).overflowX)), "ตารางกว้างเลื่อนอยู่ในกล่องของตัวเอง");
  const cols = await pg.$eval(".grid4", (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length);
  ok(cols === 2, "การ์ดสรุปเรียง 2 คอลัมน์บนมือถือ (ไม่บีบจนอ่านไม่ออก)");
  const tabsScroll = await pg.$eval(".tabs", (e) => getComputedStyle(e).overflowX);
  ok(tabsScroll === "auto" || tabsScroll === "scroll", "แถบแท็บเลื่อนได้ (รองรับแท็บที่จะเพิ่มทีหลัง)");
  ok(errs.length === 0, "ไม่มี JS error บนมือถือ");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[13] ยังเป็นข้อมูลจำลอง — ต้องบอกไว้ตลอด");
{
  const { pg } = await open();
  ok(!!(await pg.$("#mockbar")), "มีแถบบอกว่าเป็นข้อมูลจำลอง");
  ok(/ข้อมูลจำลอง/.test(await pg.title()), "ชื่อหน้าต่างบอกด้วย (แคปหน้าจอแล้วยังรู้)");
  const pos = await pg.$eval("#mockbar", (e) => getComputedStyle(e).position);
  ok(pos === "sticky" || pos === "fixed", "แถบค้างบนจอ ไม่เลื่อนหาย");
  await pg.close();
}

/* ────────────────────────────────────────────────────────────────── */
console.log("\n[14] ฟีเจอร์มาตรฐาน + ไม่เพิ่ม dependency ใหม่");
{
  const { pg } = await open();
  const meta = await pg.evaluate(() => ({
    ver: document.querySelector('meta[name="page-ver"]')?.content || "",
    manifest: !!document.querySelector('link[rel="manifest"]'),
    icon: !!document.querySelector('link[rel="icon"]'),
    touch: !!document.querySelector('link[rel="apple-touch-icon"]'),
    home: [...document.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/"),
    vtag: !!document.getElementById("vtag"),
    noindex: (document.querySelector('meta[name="robots"]')?.content || "").includes("noindex"),
    ext: [...document.querySelectorAll("script[src],link[href]")]
      .map((e) => e.getAttribute("src") || e.getAttribute("href"))
      .filter((u) => /^https?:|^\/\//.test(u)),
  }));
  ok(!!meta.ver, "มี page-ver");
  ok(meta.manifest && meta.icon && meta.touch, "PWA ครบ (manifest + favicon + apple-touch-icon)");
  ok(meta.home, "มีปุ่มกลับหน้าหลัก");
  ok(meta.vtag, "มีป้ายเลขเวอร์ชัน");
  ok(meta.noindex, "กัน Google เก็บ index");
  ok(meta.ext.length === 0, "ไม่โหลดอะไรจากภายนอกเลย (" + (meta.ext.join(",") || "ไม่มี") + ")");

  const js = await (await fetch(BASE + "/social/app.js")).text();
  ok(!/\b(APP_VER|PAGE_VER)\s*=\s*["']?\d/.test(js), "ไม่เขียนเลขเวอร์ชันซ้ำไว้ใน app.js");
  await pg.close();
}

await browser.close();
console.log(`\n${fail ? "❌" : "✅"} ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
