# News Monitor — Google Alerts + Google News Dashboard

แดชบอร์ดแบบ static (ไฟล์เดียว) ที่ดึงข่าว **สด** จากฟีด RSS ของ Google โดยไม่ต้องใช้ API key
ต่อ **Google Alerts 2 ตัว** (แยกเป็น 2 หมวด) + **Google News** (ค้นหาข่าวตามคำค้น)

> ปรับปรุงจากเวอร์ชันเดิมที่ต่อ Google Trends — เปลี่ยนมาใช้ **Google Alerts + Google News** แทน

## ฟีเจอร์

- 📰 **การ์ดข่าว** — หัวข้อ (ลิงก์), แหล่งข่าว, เวลาแบบสัมพัทธ์ (เช่น "2 ชม.ที่แล้ว"), และสรุปย่อ
- 🗂️ **แท็บหมวด** — Alert 1 · Alert 2 · Google News · ทั้งหมด (พร้อมตัวนับจำนวนข่าว)
- 🔎 **ค้นหา/กรอง** ในหัวข้อข่าวที่โหลดมา + เรียงลำดับ (ใหม่สุด / เก่าสุด / ตามแหล่ง)
- 🔄 **รีเฟรชอัตโนมัติ** (5 / 10 / 30 นาที) หรือรีเฟรชเอง
- ⚙️ **หน้าตั้งค่าแหล่งข่าว** — วาง URL ฟีดของ Google Alert และตั้งคำค้น/ภาษา/ประเทศของ Google News
- 💾 **จำค่า** อัตโนมัติในเบราว์เซอร์ (localStorage) + 🔗 **แชร์ลิงก์** (ฝัง state ใน URL)
- 🌙 โหมดมืด/สว่าง

ไม่ต้องใช้ API key — ดึงจากฟีด RSS โดยตรงผ่าน **public CORS proxy** (มีตัวสำรองหลายตัว)

## โครงสร้าง

```
index.html   ไฟล์เดียวจบ (HTML + CSS + JS)
```

## วิธีต่อ Google Alert (สำคัญ)

ฟีด Google Alert เป็น URL **ส่วนตัวของคุณ** ต้องสร้างเองแล้วนำมาวางในหน้าตั้งค่า:

1. เข้า [google.com/alerts](https://www.google.com/alerts)
2. พิมพ์หัวข้อที่อยากติดตาม → กด **Show options**
3. ตั้ง **Deliver to = RSS feed** แล้วกด **Create Alert**
4. คลิกไอคอน **RSS** ข้าง Alert ที่สร้าง → คัดลอก URL (ขึ้นต้นด้วย `https://www.google.com/alerts/feeds/…`)
5. เปิดแดชบอร์ด → ปุ่ม **⚙️ ตั้งค่าแหล่งข่าว** → วาง URL ลงช่อง Alert หมวดที่ 1 / หมวดที่ 2 → **บันทึกและโหลดใหม่**

ทำซ้ำอีกหัวข้อสำหรับหมวดที่ 2 เพื่อ **แยกหมวด** ตามต้องการ

## Google News

ไม่ต้องตั้งค่าอะไรเพิ่ม — แค่ใส่ **คำค้น** + เลือกภาษา/ประเทศ ในหน้าตั้งค่า
(ระบบสร้างฟีด `https://news.google.com/rss/search?q=…` ให้อัตโนมัติ)

## หมายเหตุทางเทคนิค

- ฟีด RSS ของ Google **ไม่เปิด CORS** จึงต้องดึงผ่าน public proxy — โค้ดลองหลายตัวตามลำดับ:
  `allorigins.win` → `corsproxy.io` → `codetabs.com` (ถ้าตัวหนึ่งล่ม ใช้ตัวถัดไป)
- รองรับทั้ง **Atom** (Google Alerts) และ **RSS 2.0** (Google News) ในตัวแยกฟีดเดียว
- ลิงก์ของ Google Alert ถูกห่อด้วย redirect `google.com/url?...&url=<จริง>` — โค้ดจะแกะ URL จริงออกให้

## รันดูในเครื่อง

เปิดผ่านเว็บเซิร์ฟเวอร์ (อย่าเปิด `file://` ตรงๆ):

```bash
python3 -m http.server 8080   # แล้วเปิด http://localhost:8080
```

## Deploy ขึ้น Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**
2. เลือก repo นี้ + branch
3. Framework preset: **None**, Build command: *(เว้นว่าง)*, Build output directory: `/`
4. Deploy → ได้ URL `*.pages.dev` (auto-deploy ทุกครั้งที่ push)

เป็น static ล้วน ไม่มีขั้นตอน build
