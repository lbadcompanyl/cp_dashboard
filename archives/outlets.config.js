/* คลังข่าว — ยุบชื่อสำนักข่าวที่เป็นเจ้าเดียวกันให้เหลือชื่อเดียว
 *
 * ทำไมต้องมีไฟล์นี้: คอลัมน์ "สำนักข่าว" ในชีตมีค่าปนกัน 3 แบบ
 *   1. ชื่อไทย        — "ข่าวสด"
 *   2. โดเมน          — "khaosod.co.th"
 *   3. ชื่อ Google Alert — "หัวข้อที่จับตามอง", "ซีพี"   ← ไม่ใช่สำนักข่าว แต่เป็นชื่อคอลัมน์ที่ข่าวมาจาก
 * ถ้าไม่ยุบ ตัวเลือกในตัวกรองจะมีเจ้าเดียวกันโผล่ 2-3 บรรทัด
 *
 * ⚠️ **แก้ไฟล์นี้ได้เลย ไม่ต้องแตะโค้ดและไม่ต้องสร้างข้อมูลใหม่** — หน้าเว็บอ่านตอนเปิดหน้า
 * ⚠️ ค่าที่ไม่มีในนี้ **แสดงตามเดิม** ไม่ได้ถูกซ่อนหรือรวมมั่ว
 */
window.ARCHIVE_OUTLETS = {
  // โดเมน → ชื่อไทย
  "khaosod.co.th": "ข่าวสด",
  "thairath.co.th": "ไทยรัฐ",
  "matichon.co.th": "มติชน",
  "dailynews.co.th": "เดลินิวส์",
  "prachachat.net": "ประชาชาติธุรกิจ",
  "thansettakij.com": "ฐานเศรษฐกิจ",
  "naewna.com": "แนวหน้า",
  "bangkokbiznews.com": "กรุงเทพธุรกิจ",
  "mgronline.com": "ผู้จัดการ",
  "posttoday.com": "โพสต์ทูเดย์",
  "bangkokpost.com": "Bangkok Post",
  "nationthailand.com": "The Nation",
  "thepeople.co": "The People",
  "workpointtoday.com": "Workpoint Today",
  "springnews.co.th": "Spring News",
  "amarintv.com": "อมรินทร์ทีวี",
  "pptvhd36.com": "PPTV",
  "thaipbs.or.th": "Thai PBS",
  "infoquest.co.th": "อินโฟเควสท์",
  "ryt9.com": "RYT9",
  "newswit.com": "Newswit",
  "thaipr.net": "ThaiPR",

  // ชื่อ Google Alert — ไม่ใช่สำนักข่าว ยุบให้เหลือป้ายเดียวจะได้ไม่ปนกับสำนักข่าวจริง
  "หัวข้อที่จับตามอง": "🔔 จาก Google Alert",
  "ซีพี": "🔔 จาก Google Alert",
  "CP / ซีพี": "🔔 จาก Google Alert",
  "CP": "🔔 จาก Google Alert",
};
