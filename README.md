# Trends Explorer — Google Trends Dashboard

แดชบอร์ดแบบ static (ไฟล์เดียว) ที่ฝัง **Google Trends embed widgets** สำหรับติดตามเทรนด์การค้นหา
โดยจัดเป็น **แท็บ = กลุ่มคำค้น** และรวมหลายคำในกลุ่มด้วย `+` เป็น **เส้นเดียว** (Google ถ่วงน้ำหนักตาม volume จริงให้เอง)

กลุ่มเริ่มต้น: Food Waste (food waste + food rescue + food surplus + อาหารส่วนเกิน), Net Zero, Biodiversity, Circular Economy

## ฟีเจอร์

- 📈 **Interest over time** — รวมคำในกลุ่มเป็นเส้นเดียว (widget จริงของ Google)
- 🗺️ **Interest by region** + 🔎 **Related queries** (Top/Rising)
- 🎛️ ฟิลเตอร์ **พื้นที่ (Location)** และ **ช่วงเวลา (Time range)** — เปลี่ยนแล้ว widget โหลดใหม่อัตโนมัติ
- ✏️ เพิ่ม/ลบคำในกลุ่ม, เพิ่ม/ลบ/เปลี่ยนชื่อแท็บได้ (สูงสุด 8 กลุ่ม)
- 💾 **จำค่า** อัตโนมัติในเบราว์เซอร์ (localStorage) + 🔗 **แชร์ลิงก์** (ฝัง state ใน URL)
- 🌙 โหมดมืด/สว่าง

ไม่ต้องใช้ API key ไม่ติด CORS ไม่โดน rate limit — ใช้วิธี embed อย่างเป็นทางการของ Google

## โครงสร้าง

```
index.html   ไฟล์เดียวจบ (HTML + CSS + JS + โหลด embed_loader ของ Google)
```

## แก้ไขกลุ่ม/คำค้นเริ่มต้น

แก้ที่ตัวแปร `groups` ด้านบนของ `<script>` ใน `index.html`:

```js
let groups = [
  { name:"Food Waste", keywords:["food waste","food rescue","food surplus","อาหารส่วนเกิน"] },
  { name:"Net Zero",   keywords:["net zero","carbon neutral","net zero 2050"] },
  ...
];
```

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

## หมายเหตุ

- ค่าเป็น **สัดส่วนสัมพัทธ์ 0–100** ไม่ใช่จำนวนค้นหาจริง
- มุมมอง **5 ปี** อาจดูแบนถ้ามีจุดพีคเดียวในอดีต (Google normalize ให้พีค = 100) — ลองย่นช่วงเวลาจะเห็นรายละเอียดมากขึ้น
- **โหมดมืด** เป็นของกรอบหน้าเว็บ ส่วน widget เป็น UI ของ Google (พื้นขาว)
- **Related queries** ใช้คำแรกของกลุ่ม (คำเดี่ยว) เพราะคำรวม `+` มักไม่มีข้อมูล
- ถ้า `embed_loader.js` เวอร์ชันในไฟล์เลิกทำงาน ให้เข้า Google Trends → กดปุ่ม embed (`< >`) แล้วคัดลอกเวอร์ชัน loader ใหม่มาแทน
