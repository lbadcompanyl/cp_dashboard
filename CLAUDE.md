# CLAUDE.md

บันทึกสำหรับ session ถัดไป — อ่านก่อนเริ่มงานทุกครั้ง

## 🚦 Environment / Branch — สำคัญที่สุด อ่านก่อนแตะอะไร

Cloudflare Pages project = **`cp-dashboard-680`**

| URL | เสิร์ฟ branch ไหน |
|---|---|
| `cp-dashboard-680.pages.dev` | `dev` ← **production** |
| `dev.cp-dashboard-680.pages.dev` | `dev` ← alias ของ build เดียวกัน |

### 🔴 `dev` = production — ไม่มี staging แยกจริง

ยืนยันแล้ว (5 ส.ค. 2026): `/issue/` มีเฉพาะบน branch `dev` ไม่เคยอยู่บน `main`
และมันขึ้นบน `cp-dashboard-680.pages.dev` → **production build มาจาก `dev`**

สอง URL ข้างบนชี้ build เดียวกัน คนละชื่อเท่านั้น **push `dev` = ขึ้นเว็บจริงทันที**

| branch | ไปโผล่ที่ไหน | push ได้เองไหม |
|---|---|---|
| `dev` | **production** | ❌ **ต้องได้รับคำสั่งชัดเจนทุกครั้ง** |
| `claude/*` | preview ของ Pages | ได้ |
| `main` | ไม่ได้ deploy ที่ไหนเลย | — (ค้างที่ `6614efa` ตกรุ่นแล้ว) |

> ⚠️ **อย่าสับสนกับ `trend-dashboard.pages.dev`** — อันนั้นคือโปรเจกต์ **ต้นทาง**
> ที่โค้ดหน้า 3 คอลัมน์ถูกยกมา (ดู `TREND-HANDOFF.md`) **ไม่ใช่แดชบอร์ดนี้**
> เคยเข้าใจผิดมาแล้ว ทำให้ยิง URL ผิดโปรเจกต์ทั้งหมด

### กฎเหล็ก

1. **ห้าม push ขึ้น production โดยไม่ได้รับคำสั่งชัดเจน** — เคยพลาดมาแล้ว 2 ครั้ง
   การ "บอกทีหลัง" หรือ "หมายเหตุไว้ท้ายข้อความ" ไม่นับว่าขออนุญาต
2. **โค้ดทดลอง / debug endpoint ห้ามขึ้น production** — ลบทิ้งก่อน merge ทุกครั้ง
3. งานพัฒนาอยู่บน branch งาน (`claude/...`) → ทดสอบบน staging → ขึ้น production เมื่อได้รับอนุมัติ
4. ถ้าไม่แน่ใจว่า branch ไหนคือ environment ไหน — **ถาม อย่าเดา**

## 📦 โครงสร้างโปรเจกต์

```
index.html      landing — การ์ดลิงก์ทุกแดชบอร์ด
trend/          PR Trend Dashboard — Google Alerts + Google Trends   ← งานฝั่ง PR
ir/             IR News Monitor — ข่าวนักลงทุนสัมพันธ์
issue/          Issue Dashboard — CP + หัวข้อที่จับตามอง
sd.html         SD Trends — ความยั่งยืน
trends.html     Trends Explorer (เก่า) — ไม่มีลิงก์จาก landing แล้ว
functions/api/  Cloudflare Pages Functions (trend / ir / sd / flags)
```

เป็น static + Pages Functions ไม่มีขั้นตอน build

## 🗂️ งานแต่ละแดชบอร์ดควรอยู่ที่ไหน

- **เทรนด์ทั่วไป** (# ไหนดัง, คนค้นอะไร ไม่ผูกกับ CP) → `trend/` (PR)
- **CP ถูกพูดถึงยังไง** (mentions, ประเด็นที่จับตา) → `issue/`
- ข่าวนักลงทุน → `ir/` · ความยั่งยืน → `sd.html`

## 🔍 สิ่งที่เคยทดสอบแล้ว — อย่าเสียเวลาลองซ้ำ

ยิงจาก Cloudflare Worker (5 ส.ค. 2026):

| แหล่ง | ผล |
|---|---|
| YouTube RSS | ✅ ใช้ได้ ฟรี ไม่ต้องมี key |
| getdaytrends.com/thailand/ | ✅ ได้เทรนด์ X ไทย (71KB, สะอาด) — **ตัวหลักที่เลือก** |
| trends24.in/thailand/ | ✅ ได้เหมือนกัน (305KB, ขยะเยอะกว่า) — ตัวสำรอง |
| TikTok Creative Center | ❌ `40101 no permission` ทั้งยิงเปล่าและใส่ header ครบ — ทางฟรีปิด |
| Facebook (www/mbasic/embed) | ❌ login wall / 400 / ได้แต่เปลือก — ต้องใช้ Meta API เท่านั้น |
| Nitter (net/poast) | ❌ 520 / bot check |
| Pantip (tag/search API) | ❌ 404 / 401 access denied |
| X syndication | ⚠️ ได้ข้อมูล แต่เป็นทวีตเก่าในโปรไฟล์ ไม่ใช่เทรนด์ |

## ⚠️ หนี้ทางเทคนิคที่รู้อยู่

- `/api/sd/img?u=<url>` เป็น **image proxy แบบเปิด** — ใครใส่ URL อะไรก็ได้
  (มีตัวกัน: ต้องเป็น http/https, ต้องได้ `content-type: image/*`, จำกัด 3MB, timeout 8 วิ)
  ถ้าจะปิดช่อง = จำกัดเฉพาะโดเมนข่าวที่อยู่ในลิสต์
- การ์ด `issue/` บน landing ยังติดป้าย 🚧 Under Construction ทั้งที่ใช้งานได้แล้ว
- `trends.html` ยัง deploy อยู่แต่ไม่มีลิงก์จาก landing (มีช่วงเวลา 1เดือน/3เดือน/12เดือน/5ปี
  ที่ `trend/` ปัจจุบันไม่มี — ปัจจุบันมีแค่ `now 1-d` / `now 7-d`)
- `COORDINATION.md` ตกยุค — ยังอ้างไฟล์ที่ root ทั้งที่ย้ายเป็นโฟลเดอร์แล้ว
- branch `claude/google-trends-dashboard-lt5k09` เป็น history คนละสาย (ต้นแบบ ก.ค.) ทิ้งได้
- **ไม่มี staging แยกจริง** — `dev` คือ production ถ้าอยากได้ที่ทดสอบที่ปลอดภัย
  ต้องเปิด preview deployment ของ Pages หรือตั้งโปรเจกต์ staging แยก
- `main` ค้างที่ `6614efa` ไม่ได้ deploy ที่ไหน ตกรุ่นไป 23 commit — จะ sync ให้ตรงหรือลบก็ได้
