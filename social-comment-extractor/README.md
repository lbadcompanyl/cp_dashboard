# Comment Sentiment 💬

วางลิงก์โพส **Facebook / TikTok / YouTube** → ดึงคอมเมนต์ → ตี **sentiment %** ด้วย Claude → สรุปเป็น **Excel**
คล้าย social listening (Wisesight) เวอร์ชันย่อ ทำงานได้เอง ไม่มีฐานข้อมูล ออกแบบ **aggregate-first** เพื่อความสอดคล้อง PDPA

```
วางลิงก์ ──► [Cloudflare Worker] ──┬─ YouTube Data API (ฟรี)
                                    ├─ ScrapeCreators (FB / TikTok)
                                    └─ Claude API (ตี sentiment + สรุป)
                                          │
        หน้าเว็บ ◄── 😊 บวก 58% · 😐 กลาง 26% · 😞 ลบ 16% + keywords + Excel
```

## โครงสร้าง
```
social-comment-extractor/
├── index.html            หน้าเว็บ (static) — วางลิงก์ / ดูผล / export Excel
├── worker/
│   ├── worker.js         Cloudflare Worker — ดึงคอมเมนต์ + เรียก Claude
│   └── wrangler.toml     config การ deploy
├── PRIVACY_NOTE.md       บันทึกการประมวลผลข้อมูล (ROPA ย่อ) ตาม PDPA
└── README.md
```

## ลองเล่นทันที (โหมด Demo — ไม่ต้องตั้งค่าอะไร)
เปิด `index.html` ผ่านเว็บเซิร์ฟเวอร์ แล้ววางลิงก์ใดก็ได้ กด **วิเคราะห์** → เห็น flow เต็มด้วย **ข้อมูลตัวอย่าง**
(ไม่เรียก API จริง ไม่มีค่าใช้จ่าย) เหมาะสำหรับดู UX ก่อนต่อ backend

```bash
cd social-comment-extractor
python3 -m http.server 8080   # เปิด http://localhost:8080
```

## ใช้งานจริง (โหมด Live) — 3 ขั้นตอน

### 1) ขอ API keys
| ใช้กับ | key | หมายเหตุ |
|---|---|---|
| **YouTube** | `YOUTUBE_API_KEY` | ฟรี — Google Cloud Console → เปิด "YouTube Data API v3" → สร้าง API key |
| **Claude** (sentiment) | `ANTHROPIC_API_KEY` | console.anthropic.com |
| **FB / TikTok** | `SCRAPECREATORS_API_KEY` | scrapecreators.com (100 credits ฟรีลอง) — ข้ามได้ถ้าใช้แค่ YouTube |

### 2) Deploy Worker
```bash
cd social-comment-extractor/worker
npx wrangler deploy
# ตั้ง secret (ไม่เก็บใน git):
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler secret put SCRAPECREATORS_API_KEY
```
จะได้ URL เช่น `https://comment-sentiment.<you>.workers.dev`

### 3) ต่อหน้าเว็บเข้ากับ Worker
เปิด `index.html` → **⚙️ ตั้งค่า** → วาง URL ของ Worker → เสร็จ (badge เปลี่ยนเป็น **Live**)
ค่า URL ถูกจำใน localStorage ของเบราว์เซอร์

> deploy หน้าเว็บขึ้น **Cloudflare Pages** ได้เหมือน static site ทั่วไป (build command เว้นว่าง, output = `/`)

### ทดสอบก่อน: ตรวจว่า Worker ทำงาน
- เปิด `https://<worker>.workers.dev/` ในเบราว์เซอร์ → ควรเห็น `{"ok":true,...}`
- `https://<worker>.workers.dev/credits` → เห็นเครดิต ScrapeCreators (ถ้าตั้ง key แล้ว)
- **เริ่มจาก YouTube ก่อน** (ฟรี) เพื่อพิสูจน์ flow เต็มก่อนจ่ายเงิน scraper

## ⚠️ ข้อควรรู้ตอน deploy จริง
1. **โหมด Live ใช้ในหน้า preview ของ claude.ai ไม่ได้** — sandbox ของ artifact บล็อกการเรียก
   ข้ามโดเมน (CSP) → ต้องเปิดหน้าเว็บจาก **Cloudflare Pages หรือ localhost** แล้วค่อยวาง URL Worker
   (พรีวิว claude.ai ใช้ได้เฉพาะโหมด Demo)
2. **Cloudflare Workers Free จำกัด 50 subrequest/คำขอ** — 1 โพส = ดึงคอมเมนต์หลายหน้า + เรียก
   Claude หลาย batch. แนะนำตั้ง **"ดึงกี่คอมเมนต์" ≤ 400** บนแพลนฟรี (โพสใหญ่กว่านั้นอาจชนลิมิต/
   ใช้เวลานาน) — อัปเกรด Workers Paid ได้ถ้าต้องดึงเยอะ
3. **ตรวจ field ของ ScrapeCreators ครั้งแรก** — ครั้งแรกที่ดึง FB/TikTok จริง ให้เช็คว่า
   ข้อความ/like/เวลา มาครบ; ถ้า field ชื่อไม่ตรง แก้ที่ `pickField()` ใน `worker.js` (คอมเมนต์กำกับไว้)
4. (แนะนำ) ตั้ง `ALLOW_ORIGIN` ใน `wrangler.toml` เป็นโดเมนหน้าเว็บของคุณ แทน `"*"` เพื่อกันคนอื่นยิง Worker

## 🏢 โหมด "วัดท่าทีต่อเครือ CP" (aspect-based)

นอกจากอารมณ์รวม ระบบวัด **ท่าทีที่มีต่อ CP โดยเฉพาะ** ได้ (ค่าเริ่มต้นของแท็บใน Issue Dashboard)

- ป้าย 4 แบบ: `positive` · `neutral` · `negative` · **`not_related`** (ไม่ได้พูดถึง CP)
- **% คิดจากเฉพาะคอมเมนต์ที่พูดถึง CP** ไม่ใช่ทั้งหมด — ไม่งั้นตัวเลขจะเพี้ยน
  (โพสปลาหมอคางดำส่วนใหญ่ด่าปลา/รัฐ ไม่ได้ด่า CP)
- เกณฑ์ตัดสินอยู่ที่ **[`RUBRIC-CP.md`](RUBRIC-CP.md)** — อ่านก่อนใช้/ก่อน label

### สอน AI ให้แม่นขึ้น (few-shot)
ตัวอย่างสอนอยู่ที่ตัวแปร **`CP_EXAMPLES`** บนสุดของ `worker/worker.js`
เพิ่มเคสที่ AI เคยตอบผิดเข้าไป → Deploy → แม่นขึ้นทันที (ไม่ต้องเทรนโมเดล)
· วิธีสร้างชุดข้อมูล label ดูที่ [`labels/README.md`](labels/README.md)

> ⚠️ **worker deploy ด้วยการ copy-paste ไฟล์เดียว** — จึงเก็บตัวอย่างไว้ใน `worker.js`
> ห้ามแยกเป็นไฟล์อื่น ไม่งั้น deploy ผ่าน Cloudflare web editor ไม่ได้

## โมเดล sentiment
ตั้งใน `wrangler.toml` → `CLAUDE_MODEL`:
- `claude-haiku-4-5` — **ค่าเริ่มต้น** ถูก เหมาะจัดหมวดคอมเมนต์จำนวนมาก
- `claude-opus-5` — แม่นสูงสุด เข้าใจบริบท/ประชดดีสุด แพงกว่า

## ต้นทุนโดยประมาณ (ต่อ 1 โพส ~500 คอมเมนต์)
- **YouTube**: ฟรี (โควตา YouTube API ~1M คอมเมนต์/วัน)
- **FB/TikTok**: ScrapeCreators ~$0.05–0.20 (1 credit/หน้า, ~15–40 คอมเมนต์/หน้า)
- **Claude Haiku**: หลักสตางค์ต่อโพส
- ช่อง **"ดึงกี่คอมเมนต์"** ช่วยคุมต้นทุน — วิเคราะห์ N คอมเมนต์ล่าสุดก็ได้ภาพรวมแม่นพอ

## ความเป็นส่วนตัว / กฎหมาย
- ออกแบบ **aggregate-first**: Worker ไม่ persist อะไร, ตัดชื่อผู้คอมเมนต์ออกโดย default, ตัวอย่างเป็นข้อความ **ถอดความ**
- YouTube = ใช้ API ทางการ (ปลอดภัยสุด) · FB/TikTok = ผ่าน scraper (gray area ของ ToS แพลตฟอร์ม)
- อ่าน `PRIVACY_NOTE.md` ก่อนใช้งานจริง โดยเฉพาะถ้าใช้เชิงพาณิชย์

## ปรับแต่ง
- **เพิ่ม scraper เจ้าอื่น** (Apify/TikHub/Bright Data): เพิ่มฟังก์ชัน collector ใน `worker.js` แล้ว route ตาม platform — โครงเป็น adapter อยู่แล้ว
- **แก้ field mapping ของ ScrapeCreators**: ดู `fetchScrapeCreators()` + `pickField()` (เผื่อ response เปลี่ยน field)
