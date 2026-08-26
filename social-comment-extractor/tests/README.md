# เทสต์ของเครื่องมือ sentiment

| ไฟล์ | คุมอะไร | รันยังไง |
|---|---|---|
| `twolens.mjs` | ตัวจัดหมวด 2 แกนใน `worker.js` — **แถวต้องไม่เลื่อน** เมื่อโมเดลตอบสลับลำดับ / ตอบไม่ครบ / ตอบเป็นขยะ · ค่าเพี้ยนต้องกลายเป็น Neutral ไม่ใช่ Negative | ดูข้างล่าง |
| `evalpage.cjs` | หน้า `issue/sentiment-eval.html` — แถวไม่เลื่อน · ก้อนที่ยิงพลาดต้องไม่ถูกเดาแทน · ป้ายเตือนต้องขึ้น | ต้องมีเซิร์ฟเวอร์ static |

```bash
# twolens.mjs — ต้องก๊อป worker.js เป็น .mjs แล้วเติม export ก่อน (worker เป็นไฟล์เดียวโดยตั้งใจ)
cp ../worker/worker.js /tmp/w.mjs
echo 'export { classifyTwoLens, normLens, systemTwoLens, TWO_LENS_SHOTS };' >> /tmp/w.mjs
cp twolens.mjs /tmp/ && cd /tmp && node twolens.mjs

# evalpage.cjs
python3 -m http.server 8899 --directory <รากของ repo> &
node evalpage.cjs
```

> ⚠️ **ทำไมต้องมีเทสต์เรื่อง "แถวเลื่อน" โดยเฉพาะ** — ถ้าผลที่โมเดลตอบกลับมาไปตกผิดแถว
> ตัวเลขความแม่นจะผิดทั้งกระดาน **โดยไม่มี error อะไรบอกเลย** และจะพาไปแก้ prompt ผิดทาง
