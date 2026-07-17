# Food Rescue Trends — Google Trends Dashboard

แดชบอร์ดแบบ static ที่ฝัง **Google Trends embed widgets** เพื่อแสดงเทรนด์การค้นหาของ
3 คำค้นในประเทศไทย ย้อนหลัง 5 ปี:

- `Food Rescue`
- `Food Surplus`
- `อาหารส่วนเกิน`

ใช้วิธี embed อย่างเป็นทางการของ Google → **ฟรี ไม่ต้องใช้ API key ไม่ติด CORS ไม่โดน rate limit**
และรันบน static hosting (เช่น Cloudflare Pages) ได้เลย

---

## โครงสร้างไฟล์

```
index.html        โครงหน้า + โหลด embed_loader ของ Google
assets/app.js     ตั้งค่าคำค้น/พื้นที่/ช่วงเวลา และสั่ง render widget
assets/style.css  ธีม (รองรับ light/dark) + layout
```

Widget ที่แสดง:
- **TIMESERIES** — ความสนใจตามช่วงเวลา (เทียบ 3 คำ)
- **GEO_MAP** — ความสนใจแยกตามจังหวัด
- **RELATED_QUERIES** — คำค้นที่เกี่ยวข้อง (การ์ดละ 1 คำ)

---

## แก้ไขคำค้น / พื้นที่ / ช่วงเวลา

แก้ที่ `CONFIG` ด้านบนของ `assets/app.js` ที่เดียว:

```js
const CONFIG = {
  geo: "TH",             // "" = ทั่วโลก
  time: "today 5-y",     // เช่น "today 12-m", "2020-01-01 2024-12-31"
  hl: "th",
  keywords: ["Food Rescue", "Food Surplus", "อาหารส่วนเกิน"],
};
```

---

## รันดูในเครื่อง

เปิดผ่านเว็บเซิร์ฟเวอร์ (ไม่ควรเปิดไฟล์ `file://` ตรงๆ เพราะ widget อาจไม่โหลด):

```bash
python3 -m http.server 8080
# แล้วเปิด http://localhost:8080
```

---

## Deploy ขึ้น Cloudflare Pages

1. เข้า Cloudflare dashboard → **Workers & Pages → Create → Pages**
2. **Connect to Git** แล้วเลือก repo นี้ + branch ที่ต้องการ
3. Build settings:
   - Framework preset: **None**
   - Build command: *(เว้นว่าง)*
   - Build output directory: `/` (root)
4. Deploy → ได้ URL `*.pages.dev` ทุกครั้งที่ push จะ auto-deploy ให้เอง

ไม่มีขั้นตอน build เพราะเป็น static ล้วน

---

## หมายเหตุ / แก้ปัญหา

- ถ้า widget **ไม่แสดง**: ตรวจว่าเปิดผ่าน `https` และไม่มีตัวบล็อกสคริปต์/แอดบล็อก
- Google อาจอัปเดตเวอร์ชันของ `embed_loader.js` — ปัจจุบันใช้
  `https://ssl.gstatic.com/trends_nrtr/3603_RC01/embed_loader.js`
  ถ้าเวอร์ชันนี้เลิกทำงาน ให้เข้า Google Trends → กดปุ่ม **embed (`< >`)** ที่กราฟใดก็ได้
  แล้วคัดลอกเวอร์ชัน loader ใหม่มาแทนใน `index.html`
- ค่าดัชนีเป็น **สัดส่วนสัมพัทธ์ 0–100** ไม่ใช่จำนวนการค้นหาจริง
