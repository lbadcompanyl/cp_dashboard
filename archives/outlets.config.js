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
  // ↓ เพิ่มจากที่เจอจริงในชีต (19 ส.ค. 2026)
  "siamrath.co.th": "สยามรัฐ",
  "banmuang.co.th": "บ้านเมือง",
  "innnews.co.th": "INN News",
  "thaipost.net": "ไทยโพสต์",
  "topnews.co.th": "TOP News",
  "tnnthailand.com": "TNN",
  "ch3plus.com": "ช่อง 3",
  "bugaboo.tv": "ช่อง 7 (Bugaboo)",
  "chiangmainews.co.th": "เชียงใหม่นิวส์",
  "hoonsmart.com": "HoonSmart",
  "kaohoon.com": "ข่าวหุ้น",
  "brandbuffet.in.th": "Brand Buffet",
  "thereporter.asia": "The Reporter Asia",
  "spacebar.th": "SPACEBAR",
  "sanook.com": "Sanook",
  "positioningmag.com": "Positioning",
  "wealthnbiz.com": "Wealth & Biz",

  // ชื่อ Google Alert — ไม่ใช่สำนักข่าว ยุบให้เหลือป้ายเดียวจะได้ไม่ปนกับสำนักข่าวจริง
  // ⚠️ ในชีตมี **เครื่องหมายคำพูดติดมาด้วย** (`"ซีพี"` · `"cp" -tower`) เพราะเป็นตัว query
  //    ที่ใส่ไว้ใน Google Alerts ตรงๆ — ต้องเขียนให้ตรงเป๊ะรวมเครื่องหมายคำพูด
  //    **แก้ query ใน Google Alerts เมื่อไหร่ ค่าที่นี่ก็เปลี่ยนตาม ต้องมาเติมด้วย**
  "หัวข้อที่จับตามอง": "🔔 จาก Google Alert",
  '"ซีพี"': "🔔 จาก Google Alert",
  '"cp" -tower': "🔔 จาก Google Alert",
  "ซีพี": "🔔 จาก Google Alert",
  "CP / ซีพี": "🔔 จาก Google Alert",
  "CP": "🔔 จาก Google Alert",
};

/* ── หางพาดหัวที่ให้ตัดทิ้งตอนแสดงผล ────────────────────────────────────
 * ฟีดหลายเจ้าต่อท้ายพาดหัวด้วย **ชื่อคอลัมน์/ชื่อเว็บ** ไม่ใช่แค่ชื่อสำนักข่าว
 *   "วอนรัฐเร่งแก้ 'โรคกุ้ง' … - เทคโนโลยีชาวบ้าน - ข่าวสด"
 *                                 └── คอลัมน์ ──┘   └ สำนัก ┘
 *
 * หน้าเว็บตัดหางให้เองอยู่แล้ว 2 ทาง **ไม่ต้องมาเติมที่นี่ทุกคำ**
 *   1. ท่อนที่ตรงกับชื่อสำนักข่าว (ตารางข้างบน หรือค่าที่มีอยู่จริงในข้อมูล)
 *   2. ท่อนที่ไปโผล่เป็นหางของข่าว **ตั้งแต่ 2 ใบขึ้นไป** — ของแบบนี้เป็นชื่อคอลัมน์แน่ๆ
 *      ไม่ใช่เนื้อพาดหัว (นับจากข้อมูลจริง จึงตามข้อมูลใหม่ได้เองโดยไม่ต้องแก้ไฟล์)
 *
 * รายการข้างล่างมีไว้สำหรับ **ท่อนที่โผล่ครั้งเดียว** ซึ่งกฎข้อ 2 จับไม่ได้
 * ⚠️ ห้ามใส่คำที่เป็นเนื้อพาดหัวได้ — ใส่แล้วพาดหัวจริงจะถูกตัดหายไปเงียบๆ
 */
window.ARCHIVE_TAILS = [
  "เทคโนโลยีชาวบ้าน",
  "ข่าวหุ้นธุรกิจออนไลน์",
  "ผู้จัดการออนไลน์",
  "ข่าวท้องถิ่น",
  "ข่าวมีคม",
  "Thai PBS Sci & Tech",
  "Greener Bangkok",
  "NBT CONNEXT",
  "Tnews",
  "ช่อง 8",
  "ข่าวจราจร",
  "Facebook",
  "Page 2 of 2",
  "HOMEDAY",
  "IQAir ประเทศไทย",
  "IQAir Thailand",
  "Kasemrad Hospital",
  "e-power service",
  "ThaiHealth Resource Center",
  "นิตยสารสาระวิทย์ โดย สวทช.",
];
