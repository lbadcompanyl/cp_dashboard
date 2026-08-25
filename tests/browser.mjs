/* เปิดเบราว์เซอร์ให้เทสต์ — ที่เดียวสำหรับทุกไฟล์
 *
 * 🎯 ทำไมต้องมีไฟล์นี้ (สร้าง 25 ส.ค. 2026)
 *    เจ้าของถามว่าทำระบบทดสอบฝั่ง iOS เองได้ไหม — เครื่องที่รัน session โหลด WebKit ไม่ได้
 *    (ต้นทางถูกบล็อก ลองแล้วได้ 403) แต่ **GitHub Actions โหลดได้** จึงย้ายไปรันที่นั่นแทน
 *    ของเดิมเทสต์ 16 ไฟล์เขียน executablePath ของ Chromium ในเครื่องนี้ตายตัว
 *    → ย้ายไปรันที่อื่นไม่ได้เลย และเปลี่ยนเอนจินไม่ได้ด้วย
 *
 * วิธีใช้ — แทนที่ `chromium.launch({ executablePath: "...", args: [...] })` ด้วย `launch()`
 *
 *    import { launch } from "./browser.mjs";
 *    const browser = await launch();
 *
 * เลือกเอนจินด้วย env `TEST_BROWSER` : `chromium` (ค่าตั้งต้น) · `webkit`
 *
 * ⚠️ **WebKit ของ Playwright ไม่ใช่ Safari บน iPhone** — ใช้เครื่องยนต์เดียวกันจึงจับเรื่อง
 *    หน้าตา/CSS/JS ที่ Safari ไม่รองรับได้ แต่ **ไม่มี**เมนูแชร์ · ไม่มีการเพิ่มลงหน้าจอโฮม ·
 *    ไม่มี navigator.standalone · safe-area ก็คนละค่า
 *    เรื่องพวกนั้นต้องเปิด /selftest/ บนเครื่องจริงเท่านั้น **ห้ามเคลมว่าเทสต์ Safari แล้ว**
 */
import fs from "node:fs";
import { chromium, webkit, devices } from "playwright";

// Chromium ที่ติดตั้งไว้ให้แล้วในเครื่องที่รัน session — ที่อื่น (เช่น CI) ไม่มีไฟล์นี้
// แล้วให้ Playwright หาเอง (มันรู้ที่อยู่ของตัวเองอยู่แล้ว)
const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium";

export const ENGINE = (process.env.TEST_BROWSER || "chromium").toLowerCase();
export const isWebKit = ENGINE === "webkit";

/** เปิดเบราว์เซอร์ตามเอนจินที่เลือก — ทำงานได้ทั้งในเครื่องนี้และบน CI */
export async function launch(opts = {}) {
  if (isWebKit) return webkit.launch(opts); // WebKit ไม่รับ --no-sandbox
  const o = { args: ["--no-sandbox"], ...opts };
  // ใส่ executablePath เฉพาะตอนที่ไฟล์มีจริง ไม่งั้น Playwright จะพังทั้งที่มีเบราว์เซอร์ของตัวเอง
  if (fs.existsSync(LOCAL_CHROMIUM)) o.executablePath = LOCAL_CHROMIUM;
  return chromium.launch(o);
}

/** โปรไฟล์เครื่อง iPhone/iPad ของ Playwright — ใช้คู่กับ WebKit ถึงจะใกล้ของจริงที่สุด */
export const IPHONE = devices["iPhone 14"] || devices["iPhone 13"];
export const IPAD = devices["iPad (gen 7)"];

export { devices };
