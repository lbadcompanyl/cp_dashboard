# 🔗 Repo Coordination — lbadcompanyl/test

เอกสารประสานงานระหว่าง session (ใช้เมื่อมีหลาย session ช่วยกันทำแดชบอร์ดใน repo เดียว)

## โครงสร้าง repo

```
lbadcompanyl/test
├── index.html        หน้า landing (รวมทางเข้า) — การ์ดลิงก์ทุกแดชบอร์ด
├── ir.html           IR News Monitor — Google Alerts 2 หมวด + Google News   [session: IR]
├── trends.html       Trends Explorer — Google Trends embed (ของเดิม)
├── sd.html           SD Trends — Google Trends ด้านความยั่งยืน  ← session SD ทำไฟล์นี้
├── README.md
└── COORDINATION.md   ← ไฟล์นี้
```

ทุกไฟล์เป็น static HTML ไฟล์เดียวจบ (HTML + CSS + JS) ไม่มีขั้นตอน build — deploy บน Cloudflare Pages

---

## 📌 กติกากันชนกัน (อ่านก่อนเริ่ม)

1. **`index.html` (หน้า landing) มีเจ้าของคนเดียว = session IR** — session อื่น **ห้ามแก้ `index.html`**
   หน้า landing มีการ์ดของแต่ละแดชบอร์ดรออยู่แล้ว (รวมการ์ด SD → ลิงก์ `sd.html`)
2. **แต่ละ session แตะเฉพาะไฟล์แดชบอร์ดของตัวเอง** (session SD = `sd.html` เท่านั้น)
3. อยากให้การ์ดบน landing เปลี่ยนหน้าตา/ข้อความ → แจ้ง session IR ปรับให้ที่เดียว
4. ทำงานบน **branch ของตัวเอง** แล้วค่อย merge เข้า `main` (Cloudflare deploy จาก `main`)

---

## ✅ สิ่งที่ session SD ต้องทำ

1. สร้างไฟล์ **`sd.html`** (แดชบอร์ด Google Trends สำหรับ SD)
2. ใส่ปุ่มกลับหน้าหลักใน appbar เพื่อให้นำทางกลับ landing ได้:
   ```html
   <a class="btn" href="index.html" style="text-decoration:none">🏠 หน้าหลัก</a>
   ```
3. push `sd.html` ขึ้น branch ของ session SD → เปิด PR เข้า `main`
4. **ห้าม** แก้ `index.html` / `ir.html` / `trends.html`

การ์ด SD บน landing รออยู่แล้ว (title "SD Trends", tag "SD", ลิงก์ `sd.html`) — พอ `sd.html` เข้า `main` จะเชื่อมทันที

---

## 🎨 ให้ดีไซน์เข้าชุดกัน (คัดลอก CSS variables ชุดนี้ไปใช้)

แดชบอร์ดทุกตัวใช้ธีมเดียวกัน โทนมืดเป็นค่าเริ่มต้น + สลับสว่างได้:

```css
:root {
  color-scheme: dark;
  --plane:#0d0d0d; --surface:#1a1a19; --surface-2:#232322;
  --ink:#fff; --ink-2:#c3c2b7; --muted:#898781;
  --border:rgba(255,255,255,0.10); --accent:#3987e5; --accent-soft:#1a2436; --radius:12px;
}
:root[data-theme="light"] {
  color-scheme: light;
  --plane:#f9f9f7; --surface:#fcfcfb; --surface-2:#f3f3ef;
  --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781;
  --border:rgba(11,11,11,0.10); --accent:#2a78d6; --accent-soft:#eaf1fe;
}
```
ฟอนต์: `system-ui, -apple-system, "Segoe UI", "Sarabun", "Noto Sans Thai", Roboto, sans-serif`

> ดูตัวอย่างเต็มได้จาก `trends.html` (แนวทาง Google Trends) และ `ir.html` (โครง appbar/แท็บ/การ์ด)

---

## 🚀 แผน deploy

> ⚠️ **ส่วนนี้เคยเขียนว่า deploy จาก `main` ซึ่งไม่ตรงกับความจริงแล้ว**
> ดูข้อมูลที่เป็นปัจจุบันได้ที่ **[`CLAUDE.md`](./CLAUDE.md)** — ใช้ไฟล์นั้นเป็นแหล่งอ้างอิงหลัก

สรุปสั้น:

- **`dev` = staging** — ทดสอบที่นี่ push ได้
- **production = ห้าม push โดยไม่ได้รับคำสั่งชัดเจน** (เคยพลาดมาแล้ว 2 ครั้ง)
- โค้ดทดลอง / debug endpoint **ห้ามขึ้น production** ลบทิ้งก่อน merge ทุกครั้ง
- ไม่แน่ใจว่า branch ไหนคือ environment ไหน → **ถาม อย่าเดา**

URL ปัจจุบัน: `/` = landing, `/trend/`, `/ir/`, `/issue/`, `/sd.html`
(ไฟล์ `ir.html` / `trends.html` ที่ root เป็นของเก่า ย้ายเป็นโฟลเดอร์แล้ว)
