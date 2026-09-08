/* 💱 หน้าราคาเหรียญ/อัตราแลกเปลี่ยน ต้องไม่ถูกนับเป็นข่าวของเครือ CP
 *
 * เจ้าของส่งภาพมา 2 ก.ย. 2026: การ์ดในคอลัมน์ CP เป็น
 *   "อัตราแลกเปลี่ยนย้อนหลัง CP USD KuCoin - Investing.com"
 * → `CP` ตรงนั้นคือเหรียญคริปโต Cluster Protocol ไม่ใช่เครือ CP
 *
 * ⚠️ ก่อนแก้: cpEvidence ตอบ "weak" → ส่งให้ AI → AI ตอบว่าใช่ → หลุดเข้าคอลัมน์
 *
 * รันด้วย: node fxpage.mjs
 */
import fs from "node:fs";
import { FXPAGE_RE, noiseReason, cpEvidence } from "../functions/api/_lib/noise.js";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };
const why = (t, src = "alert1") =>
  noiseReason({ title: t, link: "https://th.investing.com/crypto/x", snippet: "" }, t.toLowerCase(), src);

console.log("\n[1] 🎯 เคสจริงจากภาพ");
{
  const T = "อัตราแลกเปลี่ยนย้อนหลัง CP USD KuCoin - Investing.com";
  ok("ก่อนแก้เคยได้ weak (ต้นเหตุที่ส่งไป AI)", cpEvidence(T) === "weak", cpEvidence(T));
  ok("🎯 ตอนนี้ถูกตัดด้วยเหตุผล fx-page", why(T) === "fx-page", JSON.stringify(why(T)));
}

console.log("\n[2] หน้าราคาแบบอื่นก็ต้องโดน");
for (const t of [
  "CP/USDT Price Chart - Binance",
  "ราคาย้อนหลัง BTC USD - CoinMarketCap",
  "CP USD historical data | Investing.com",
  "กราฟราคา ETH/THB วันนี้",
]) ok(`ตัด: ${t.slice(0, 40)}`, FXPAGE_RE.test(t), "ไม่ถูกจับ");

console.log("\n[3] 🚫 ห้ามตัดข่าวจริง");
{
  // ⚠️ ฝั่งนี้สำคัญกว่า — ตัดพลาดแล้วข่าวหายเงียบ แย่กว่าปล่อยขยะผ่าน
  const KEEP = [
    // มีคำว่าอัตราแลกเปลี่ยน แต่ไม่มีคู่สกุลเงิน = ข่าวจริง
    "เงินบาทอ่อนค่า อัตราแลกเปลี่ยนวันนี้ กระทบผู้ส่งออก",
    "ธปท. ชี้แจงอัตราแลกเปลี่ยนผันผวน ไม่กระทบเสถียรภาพ",
    // มีคู่สกุลเงินแต่ไม่ใช่หน้าราคา
    "ซีพีเอฟ ปิดดีล USD 500 ล้าน ลงทุนโรงงานเวียดนาม",
    // ข่าวเครือปกติ
    "ซีพี แอ็กซ์ตร้า โชว์ผลงานครึ่งปีแรก",
    "เซเว่น อีเลฟเว่น ปรับราคาสินค้า",
    "ราคาหมูหน้าฟาร์มขยับ เกษตรกรเริ่มหายใจคล่อง",
  ];
  for (const t of KEEP) ok(`🚫 ห้ามตัด: ${t.slice(0, 38)}`, !FXPAGE_RE.test(t), "ถูกตัดผิด");
}

console.log("\n[4] ตัดทุกคอลัมน์ ไม่ใช่เฉพาะ CP");
{
  const T = "อัตราแลกเปลี่ยนย้อนหลัง CP USD KuCoin - Investing.com";
  ok("alert2 ก็ตัด", why(T, "alert2") === "fx-page", JSON.stringify(why(T, "alert2")));
}

console.log("\n[5] หน้า admin ต้องแปลเหตุผลเป็นภาษาคน");
{
  // ⚠️ เพิ่มเหตุผลใหม่ใน noiseReason ทีไร ต้องเติม WHY_TH ด้วย ไม่งั้นเจ้าของเห็นรหัสดิบ
  const adm = fs.readFileSync(new URL("../admin/app.js", import.meta.url), "utf8");
  ok("WHY_TH มี fx-page แล้ว", /"fx-page":\s*"[^"]*[ก-๙]/.test(adm));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
