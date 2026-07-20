# Dashboards — Trends Explorer & IR News Monitor

รวมแดชบอร์ดแบบ static (ไม่ต้องมี backend / API key) 2 ตัว พร้อมหน้า landing สำหรับเลือกใช้งาน

## โครงสร้างไฟล์

```
index.html    หน้ารวม (landing) — เลือกเข้าแดชบอร์ด
ir.html       IR News Monitor — Google Alerts (2 หมวด) + Google News   ← ของใหม่
trends.html   Trends Explorer — Google Trends embed                    ← ของเดิม
```

ทั้งสองแดชบอร์ดเป็นไฟล์เดียวจบ (HTML + CSS + JS) และมีปุ่ม 🏠 หน้าหลัก กลับมาที่ `index.html`

---

## 📰 ir.html — IR News Monitor (ใหม่ สำหรับงานนักลงทุนสัมพันธ์)

ดึงข่าว **สด** จากฟีด RSS ของ Google โดยไม่ต้องใช้ API key — ต่อ **Google Alerts 2 ตัว** (แยก 2 หมวด) + **Google News**

**ฟีเจอร์**
- 📰 การ์ดข่าว — หัวข้อ (ลิงก์), แหล่งข่าว, เวลาแบบสัมพัทธ์, สรุปย่อ
- 🗂️ แท็บหมวด: Alert 1 · Alert 2 · Google News · ทั้งหมด (มีตัวนับ)
- 🔎 ค้นหา/กรอง + เรียงลำดับ (ใหม่สุด / เก่าสุด / ตามแหล่ง)
- 🔄 รีเฟรชอัตโนมัติ (5/10/30 นาที), ⚙️ หน้าตั้งค่าแหล่งข่าว
- 💾 จำค่าในเบราว์เซอร์ + 🔗 แชร์ลิงก์, 🌙 โหมดมืด/สว่าง

**วิธีต่อ Google Alert**
1. เข้า [google.com/alerts](https://www.google.com/alerts) → พิมพ์หัวข้อ → **Show options**
2. ตั้ง **Deliver to = RSS feed** → **Create Alert**
3. คลิกไอคอน **RSS** → คัดลอก URL (`https://www.google.com/alerts/feeds/…`)
4. เปิด `ir.html` → **⚙️ ตั้งค่าแหล่งข่าว** → วาง URL ลงช่อง Alert หมวด 1 / หมวด 2 → **บันทึกและโหลดใหม่**

**Google News** — แค่ใส่คำค้น + เลือกภาษา/ประเทศ (สร้างฟีด `news.google.com/rss/search` ให้อัตโนมัติ)

**หมายเหตุทางเทคนิค** — ฟีด RSS ของ Google ไม่เปิด CORS จึงดึงผ่าน public proxy (สำรองหลายตัว: allorigins → corsproxy → codetabs), รองรับทั้ง Atom (Alerts) และ RSS 2.0 (News), และแกะลิงก์ redirect ของ Alert เป็น URL จริงให้

---

## 📈 trends.html — Trends Explorer (เดิม)

ฝัง **Google Trends embed widgets** ติดตามเทรนด์การค้นหา จัดกลุ่มคำค้นเป็นแท็บ รวมหลายคำในกลุ่มด้วย `+` เป็นเส้นเดียว
มี Interest over time / by region / Related queries + ฟิลเตอร์พื้นที่และช่วงเวลา

---

## รันดูในเครื่อง

```bash
python3 -m http.server 8080   # แล้วเปิด http://localhost:8080
```

## Deploy ขึ้น Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**
2. เลือก repo นี้ + branch
3. Framework preset: **None**, Build command: *(เว้นว่าง)*, Build output directory: `/`
4. Deploy → ได้ URL `*.pages.dev`

เป็น static ล้วน ไม่มีขั้นตอน build — เข้า `/` = หน้ารวม, `/ir.html` = IR, `/trends.html` = Trends
