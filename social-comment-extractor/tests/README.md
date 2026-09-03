# เทสต์ของเครื่องมือ sentiment

| ไฟล์ | คุมอะไร | รันยังไง |
|---|---|---|
| `authguard.mjs` | 🔐 **กันคนนอกยิงเข้า worker** — ไม่ตั้ง `WORKER_KEY` = **ปิด** ไม่ใช่เปิด · กุญแจผิดต้องไม่ยิงออกไปข้างนอกเลย · 🚫 endpoint ที่หน้าเว็บเรียกห้ามถูกบังคับกุญแจ · `ALLOW_ORIGIN` ต้องบล็อกจริง | `node authguard.mjs` |
| `profiles.mjs` | 🔒 **profile-based rubric + REGRESSION ของ `cp_comment`** — เก็บ sha256 ของ prompt/few-shot ไว้ ขยับ 1 ตัวอักษรก็ตก · ชื่อ profile ที่ไม่รู้จักห้ามตกกลับไปตัวปริยาย · เกณฑ์งานอื่นห้ามปนเข้ามา | `node profiles.mjs` |
| `twolens.mjs` | ตัวจัดหมวด 2 แกนใน `worker.js` — **แถวต้องไม่เลื่อน** เมื่อโมเดลตอบสลับลำดับ / ตอบไม่ครบ / ตอบเป็นขยะ · ค่าเพี้ยนต้องกลายเป็น Neutral ไม่ใช่ Negative | ดูข้างล่าง |
| `retry.mjs` | ถูกตัดกลางคัน → ลองใหม่เพดาน 2 เท่า · พลาดซ้ำต้องโยน error ไม่ใช่คืน Neutral |  |
| `jsonparse.mjs` | โมเดลตอบผิดฟอร์แมตแล้วแก้ตัวเองกลางคัน — ต้องหยิบ array ที่ถูกต้องให้เจอ |  |
| `replies.mjs` | ดึง reply มาวิเคราะห์ด้วย · คีย์ `replies` เป็นได้ทั้งตัวเลขและ array ห้ามสับสน |  |
| `lensconsistency.mjs` | **ตัวเลขบนแถบสรุป ต้องเท่ากับรายการ audit เสมอ** (บั๊กที่เจ้าของจับได้เอง) |  |
| `leakcheck.py` | few-shot ห้ามซ้ำ/ใกล้เคียงกับ eval set | `python3 leakcheck.py ../worker/worker.js <eval.xlsx>` |
| `evalpage.cjs` · `evalpage-context.cjs` · `evalpage-missing.cjs` · `evalpage-error.cjs` · `evalpage-tokens.cjs` · `evalpage-split.cjs` · `evalpage-grab.cjs` | หน้า `issue/sentiment-eval.html` — แถวไม่เลื่อน · ก้อนที่ยิงพลาดต้องไม่ถูกเดาแทน · ป้ายเตือน · โทเคน · ชุดสอบไล่ · ดึงคอมเมนต์เป็น CSV | ต้องมีเซิร์ฟเวอร์ static |
| `verbadge.cjs` · `stopbtn.cjs` · `edittest.cjs` | หน้า `issue/sentiment.html` — ป้ายเวอร์ชันหลังบ้าน · ปุ่มเดียวสลับวิเคราะห์/หยุด · แก้ป้ายเองแล้วตัวเลขต้องขยับ | ต้องมีเซิร์ฟเวอร์ static |
| `feedback.mjs` | กองรอตรวจฝั่ง worker — เขียน KV ครั้งเดียว · ไม่มี KV ต้องตอบ `ok:false` · อ่านต้องมีกุญแจ | `node feedback.mjs` |
| `teachbox.cjs` · `fbreview.cjs` | ระบบเรียนรู้ชั้น ②/③ — ปุ่มส่งเข้ากอง (ห้ามส่งชื่อ/ลิงก์) · หน้าตรวจกอง | ต้องมีเซิร์ฟเวอร์ static |
| `skipped.cjs` | คอมเมนต์ที่เป็นสติกเกอร์/รูปถูกคัดออก **ต้องไม่หายเงียบ** — ห้ามเอา analyzed_count มาแปะป้ายว่า "ดึงมา" | ต้องมีเซิร์ฟเวอร์ static |
| `cache.mjs` · `effortpage.cjs` | แคชคำสั่ง (คำสั่งต้องเหมือนกันเป๊ะทุกก้อน) · ระดับการคิด (haiku ห้ามส่ง) · แคชไม่ทำงานต้องเตือน | `node cache.mjs` / ต้องมีเซิร์ฟเวอร์ static |
| `notext.mjs` | สติกเกอร์/รูป **นับเป็นกลาง ไม่ตัดทิ้ง** · ห้ามส่งให้ AI · ต้องติดธง no_text · ลำดับห้ามสลับ | `node notext.mjs` |
| `samplemove.cjs` | ตัวอย่างคอมเมนต์ต้องย้ายกลุ่มตามป้ายที่ผู้ใช้แก้เอง · หลังบ้านรุ่นเก่าต้องไม่พังและต้องบอกว่าไม่ย้าย | ต้องมีเซิร์ฟเวอร์ static |
| `cpcount.cjs` | 🔴 **ป้ายในโหมด CP ต้องไม่โกหก** — 🚫 ห้ามมี "พูดถึงเครือ CP"/"ไม่เกี่ยวกับ CP" (นับทุกใบ = 48/0 เสมอ) · "เอ่ยชื่อเครือ CP" นับจากข้อความจริง · คำจับต้องไม่โดนทรูธโซเชียล/CPU | ต้องมีเซิร์ฟเวอร์ static |
| `swapsample.cjs` | ✂️ **ปุ่ม ✕ ตัดตัวอย่างที่ไม่ตรงประเด็น** — ต้องเอาใบ**ในกลุ่มเดียวกัน**มาแทน · กดซ้ำต้องเดินหน้า · ไม่มีใบเหลือ/ถอดความไม่สำเร็จ = **เก็บใบเดิมไว้** ห้ามปล่อยช่องว่าง | ต้องมีเซิร์ฟเวอร์ static |
| `resynth.cjs` | 🔄 **ปุ่ม "สรุปใหม่ตามป้ายที่แก้"** — ยังไม่แก้ป้ายห้ามมีปุ่ม · ต้องส่งป้ายที่แก้แล้ว+ยอดถูกใจ · **ยิงไม่สำเร็จห้ามลบสรุป/ตัวอย่างเดิมทิ้ง** · การ์ด keyword ห้ามมีปุ่มนี้ | ต้องมีเซิร์ฟเวอร์ static |
| `samplemid.mjs` | 🟡 **ช่อง "กลาง" ต้องมีตัวอย่างของตัวเอง** — โพสจริงส่วนใหญ่เป็นกลางท่วม · โหมด CP ก็ต้องมี (ห้ามผูกกับ synthIdx) · `not_related` ห้ามถูกเลือก | `node samplemid.mjs` |
| `samplesrc.mjs` | **เราเลือกใบตัวอย่างเอง ไม่ให้ AI เลือก** — src ต้องถูกเสมอไม่ว่า AI ตอบรูปแบบไหน · เลือกแบบตายตัว รันซ้ำได้ใบเดิม | `node samplesrc.mjs` |
| `keywords.mjs` | **เลข "คำที่พูดถึงบ่อย" ต้องนับจากคอมเมนต์จริง ไม่ใช่ที่ AI เดา** · คำที่แต่งขึ้นต้องถูกตัด · สรุปต้องรู้สัดส่วนจริงของทั้งโพส | `node keywords.mjs` |
| `synthbudget.mjs` | 🔴 **สรุปพังต้องไม่หายเงียบ** — เพดานคำตอบคิดตามจำนวนใบถอดความ (ห้ามตายตัว) · ถูกตัดกลางคันต้องลองใหม่ · แกะไม่ได้ต้องติดธง **ห้ามคืนของว่างเงียบ** | `node synthbudget.mjs` |
| `airetry.mjs` | 🔁 **ต้นทาง Claude ล่มชั่วคราวต้องลองใหม่ให้เอง** (429 · 529 · 5xx) · เคารพ `retry-after` · 🚫 **403/401 ห้ามลองใหม่** ลองกี่ครั้งก็เหมือนเดิม | `node airetry.mjs` |
| `apierror.mjs` | **ข้อความ error จาก Claude API ต้องบอกเลขสถานะ + ชนิดเสมอ** — 401/403/429/500 ต้องอ่านแยกออก · ต้นทางไม่ตอบ JSON ก็ห้ามพัง | `node apierror.mjs` |
| `verbadge.cjs` | **ป้ายเวอร์ชันต้องบอกทั้งเลขหน้าเว็บ (น) และเลขหลังบ้าน (ล)** · ผลวิเคราะห์ต้องแนบ `ver` มาด้วย · หลังบ้านล่มก็ยังต้องบอกเลขหน้าเว็บ | ต้องมีเซิร์ฟเวอร์ static |

```bash
# เทสต์ฝั่ง worker ทุกตัว: ก๊อป worker.js เป็น .mjs แล้วเติม "export line" เดียวนี้
# (worker ตั้งใจให้เป็นไฟล์เดียวเพราะ deploy ด้วยการก๊อปวาง จึงไม่มี export ในตัว)
# ⚠️ ต้องใส่ให้ครบทุกชื่อในบรรทัดเดียว — เคยเติมแค่บางชื่อแล้วเทสต์ตัวอื่นพังหมด
cp ../worker/worker.js /tmp/w.mjs
cat >> /tmp/w.mjs <<'EOF'
export { classifyTwoLens, normLens, systemTwoLens, TWO_LENS_SHOTS, extractJsonArray,
         nestedReplies, scComment, fetchYouTube, INCLUDE_REPLIES,
         feedbackRoute, fbClean, FB_MAX, FB_MAX_PER_REQ, FB_MAX_TEXT,
         EFFORT_CHOICES, EFFORT_MODELS, analyze, countTerms,
         PROFILES, getProfile, DEFAULT_PROFILE };
EOF
cp *.mjs /tmp/ && cd /tmp
for t in authguard profiles twolens retry jsonparse replies lensconsistency feedback cache notext samplesrc samplemid keywords apierror synthbudget airetry; do node $t.mjs; done

# evalpage.cjs
python3 -m http.server 8899 --directory <รากของ repo> &
node evalpage.cjs
```

> ⚠️ **ทำไมต้องมีเทสต์เรื่อง "แถวเลื่อน" โดยเฉพาะ** — ถ้าผลที่โมเดลตอบกลับมาไปตกผิดแถว
> ตัวเลขความแม่นจะผิดทั้งกระดาน **โดยไม่มี error อะไรบอกเลย** และจะพาไปแก้ prompt ผิดทาง
