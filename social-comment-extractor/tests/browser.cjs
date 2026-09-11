/* เปิดเบราว์เซอร์ให้เทสต์ของห้องนี้ — ที่เดียวสำหรับทุกไฟล์ .cjs
 *
 * 🎯 ทำไมต้องมี (สร้าง 8 ก.ย. 2026)
 *    เจ้าของถาม: "งั้นก็ต้องตรวจทุกห้องซิ" — ถูก แต่เอาเข้า CI ตรงๆ ไม่ได้
 *    เทสต์ 19 ไฟล์เขียนที่อยู่ Chromium ของ "เครื่องที่รัน session" ตายตัวไว้
 *
 *        chromium.launch({ executablePath: "/opt/pw-browsers/chromium", … })
 *
 *    ที่ GitHub Actions **ไม่มีไฟล์นั้น** → พังตั้งแต่บรรทัดแรกทั้ง 19 ไฟล์
 *    (ห้องแดชบอร์ดเจอเรื่องเดียวกันแล้วแก้ด้วย tests/browser.mjs — ท่าเดียวกันเป๊ะ)
 *
 * วิธีใช้ — แทน `chromium.launch({ executablePath: …, args: […] })` ด้วย `launch()`
 *
 *    const { launch } = require("./browser.cjs");
 *    const b = await launch();
 *
 * ⚠️ **ห้องนี้รัน Chromium อย่างเดียวโดยตั้งใจ** — หน้า /issue/sentiment.html เป็น
 *    เครื่องมือหลังบ้านที่เจ้าของเปิดบนคอม ไม่ใช่หน้าที่ผู้ใช้ทั่วไปเปิดบนมือถือ
 *    ต่างจากแดชบอร์ดข่าวที่ต้องคุม WebKit ด้วยเพราะผู้ใช้ส่วนใหญ่อยู่บน iOS
 *    · จะเพิ่ม WebKit ทีหลังก็ได้ แต่ต้องไล่แก้ทีละข้อเหมือนที่ห้องนั้นทำ อย่าเปิดทิ้งไว้เฉยๆ
 */
const fs = require("node:fs");
const { chromium } = require("playwright");

// Chromium ที่ติดตั้งไว้ให้แล้วในเครื่องที่รัน session — ที่อื่น (เช่น CI) ไม่มีไฟล์นี้
// แล้วให้ Playwright หาของตัวเองเอา (มันรู้ที่อยู่ของตัวเองอยู่แล้ว)
const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium";

async function launch(opts = {}) {
  const o = { args: ["--no-sandbox"], ...opts };
  // ใส่ executablePath เฉพาะตอนที่ไฟล์มีจริง — ใส่มั่วแล้ว Playwright พังทั้งที่มีเบราว์เซอร์ของตัวเอง
  if (fs.existsSync(LOCAL_CHROMIUM)) o.executablePath = LOCAL_CHROMIUM;
  return chromium.launch(o);
}

module.exports = { launch, LOCAL_CHROMIUM };
