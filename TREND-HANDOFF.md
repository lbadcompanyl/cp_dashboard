# Trend 3-column page — handoff (branch `claude/trend-3col`)

หน้า 3 คอลัมน์ **News + Alert + Trends (ข้อมูลสด)** ยกมาจากโปรเจกต์ `trend-dashboard`

> ⚠️ **โปรเจกต์ต้นทางเลิกใช้แล้ว** — `trend-dashboard.pages.dev` git ไม่ได้ต่อ
> หยุด deploy ตั้งแต่ ก.ค. 2026 และถูกลบทิ้ง โค้ดยกมาอยู่ในโปรเจกต์นี้ครบแล้ว
>
> **URL ของแดชบอร์ดนี้คือ `cp-dashboard-680.pages.dev`** อย่าสับสน (ดู `CLAUDE.md`)

**Stack:** static HTML/CSS/JS (vanilla, ไม่มี framework) + Cloudflare Pages Functions
**ไม่มี build step · ไม่มี runtime dependency · ไม่มี API key ใด ๆ**

---

## ✅ วางตามกติกาที่ตกลงไว้แล้ว (collision แก้หมดแล้ว)

```
trend/index.html                        ← หน้า 3 คอลัมน์  (เสิร์ฟที่ /trend/)
trend/styles.css
trend/app.js
trend-feeds.config.js                   ← ⭐ แหล่งข้อมูล — แก้ไฟล์นี้เพื่อเพิ่ม/ลบฟีด
functions/api/trend/feeds.js            → GET  /api/trend/feeds
functions/api/trend/trending.js         → GET  /api/trend/trending      (batchexecute i0OFE)
functions/api/trend/related.js          → GET  /api/trend/related
functions/api/trend/trendnews.js        → POST /api/trend/trendnews
functions/api/trend/_lib/parser.js      (RSS/Atom parser — ไม่พึ่ง DOMParser)
functions/api/trend/_lib/trends.js      (Google Trends internal API)
```

- asset path ใน `index.html` เป็น **relative** แล้ว (`./styles.css?v=11`, `./app.js?v=11`)
- fetch ใน `app.js` ชี้ **`/api/trend/*`** แล้ว → ไม่ชนกับ `/api/feed` ของ IR
- cache key ภายใน function ก็ namespace แล้ว (`/api/trend/...`) ไม่ชน cache ของ endpoint อื่น

> ⚠️ **`?v=` cache-busting** — ทุกครั้งที่แก้ `trend/app.js` หรือ `trend/styles.css` ต้องบวกเลข `?v=` ใน `trend/index.html` ไม่งั้นเบราว์เซอร์ค้างของเก่า

**ทดสอบแล้วบน repo นี้** (`npx wrangler pages dev .`):
`/trend/` 200 · `/trend/app.js` 200 · `/trend/styles.css` 200
`/api/trend/feeds` → news 181, alert 13, errors 0
`/api/trend/trending` → 128 เทรนด์, top = "สเปน พบ อาร์เจนตินา 500K+ +1,000%"

---

## ⚠️ 2 จุดที่ต่างจากที่เข้าใจกันตอนแรก

### 1. ไม่ได้ใช้ Google News แล้ว
`news.google.com/rss` คืน **HTTP 503 จาก IP ของ Cloudflare** (hard block — ลองใส่ browser headers ครบแล้วก็ยัง 503)
→ เปลี่ยนเป็นดึง **RSS ตรงจากสำนักข่าว** แทน ได้ข่าวเยอะกว่าเดิมมาก (~180 vs ~37)
**อย่าพยายามเอา Google News กลับมาบน Cloudflare**

### 2. ไม่มี API key เลย
ไม่ใช้ rss2json หรือบริการเสียเงินใด ๆ → ไม่ต้องตั้ง env/secret อะไรทั้งสิ้น

---

## แหล่งข้อมูล

### News — RSS ตรง (แก้ใน `trend-feeds.config.js`)
มติชน · ข่าวสด · THE STANDARD · ประชาไท · Blognone · BBC World · The Verge
(ทดสอบแล้วใช้ได้จาก Cloudflare edge ทั้งหมด)

### Google Alert
ตั้งที่ google.com/alerts → แก้ alert → **Deliver to: RSS feed** → ก๊อป URL มาใส่ config
🔒 URL ฟีด alert เป็น **กึ่งลับ** (ใครมี URL ก็อ่านได้) — repo นี้ public อยู่ พิจารณาย้ายไปเป็น env var ถ้ากังวล

### Google Trends — ตัวเลข "500K+ / +1,000%" มาจากไหน ⭐
ใช้ **internal batchexecute API** (ไม่เป็นทางการ) — embed ธรรมดาทำไม่ได้

**(ก) รายการเทรนด์ + volume + % + เวลาเริ่ม + คำที่เกี่ยวข้อง**
```
POST https://trends.google.com/_/TrendsUi/data/batchexecute?rpcids=i0OFE&hl=th&rt=c
Content-Type: application/x-www-form-urlencoded;charset=UTF-8
f.req = [[["i0OFE","[null,null,\"TH\",0,\"th\",24,1]",null,"generic"]]]
                                  ^geo     ^lang ^hours (4|24|48|168)
```
response ขึ้นต้น `)]}'` → หาบรรทัดที่มี `wrb.fr` → `JSON.parse(JSON.parse(line)[0][2])[1]`

| index | คือ |
|-------|-----|
| 0 | ชื่อเทรนด์ |
| 3 | `[unix_seconds]` เวลาเริ่ม |
| 6 | search volume (`500000` → "500K+") |
| 8 | % เพิ่ม (`1000` → "+1,000%") |
| 9 | คำที่เกี่ยวข้อง (breakdown) |
| 11 | `[[articleId,"th","TH"],...]` id ข่าว |

**(ข) ข่าวของเทรนด์ (พร้อมรูป)** — แปลง index 11
```
POST .../batchexecute?rpcids=w4opAf&hl=th&rt=c
f.req = [[["w4opAf","[[[id,\"th\",\"TH\"],...]]",null,"generic"]]]
```
แต่ละข่าว: `[title, url, source, [unix_time], imageUrl]`

**(ค) Top/Rising queries + %** — ⚠️ **ใช้ไม่ได้บน Cloudflare**
`/trends/api/explore` + `/trends/api/widgetdata/relatedsearches` → **429 ทุกครั้งจาก IP Cloudflare**
(ทดสอบซ้ำหลายรอบ + proxy ฟรี 3 เจ้าก็โดนบล็อก — ต้องใช้ residential proxy เสียเงินถึงจะได้)
→ โค้ด **fallback ไปใช้ index 9 (คำที่เกี่ยวข้อง)** ซึ่งเชื่อถือได้ 100% เพราะมากับ (ก) อยู่แล้ว
→ UI จะโชว์ "คำค้นที่เกี่ยวข้อง" เสมอ และอัปเกรดเป็นตาราง Top/Rising ให้เองถ้าดึง % ได้

**RSS สำรอง** (auto-fallback ถ้า batchexecute พัง): `https://trends.google.com/trending/rss?geo=TH`
(ได้แค่ ~10 คำ ไม่มี volume/%) — ตัวเก่า `/trends/trendingsearches/daily/rss` **404 แล้ว อย่าใช้**

---

## พฤติกรรม cache (ควรรู้ก่อนแก้)

- `/api/trend/feeds` ใช้ **stale-while-revalidate**: ส่ง cache ทันที (~0.1s) แล้วรีเฟรชเบื้องหลังถ้าเก่ากว่า 5 นาที
- ส่ง `Cache-Control: no-store` ให้เบราว์เซอร์ แต่ cache ที่ edge 1 ชม.
- **ไม่ cache ตอนมีฟีดพัง** → รอบหน้าลองใหม่ทันที (กัน error ค้าง 10 นาที)
- มี `CACHE_VER` ใน `feeds.js` และ `&v=2` ใน `trending.js` — **บวกเลขเมื่อแก้ logic parsing** เพื่อล้าง edge cache เก่า

---

## Deploy

Cloudflare Pages, **direct upload ไม่มี build command**
`functions/` ที่ root ถูก bundle อัตโนมัติ — ไม่ได้ใส่ `wrangler.toml`/`package.json` มาเพื่อไม่ให้ชนกับ config เดิมของ repo

Local dev: `npx wrangler pages dev . --compatibility-date 2025-01-01`

---

## ข้อจำกัดที่ยกมาด้วย (ไม่ใช่บั๊ก)

| เรื่อง | สถานะ |
|-------|-------|
| Google News | ใช้ไม่ได้บน Cloudflare (503) — ใช้ RSS ตรงแทนแล้ว |
| Top/Rising queries + % | ใช้ไม่ได้บน Cloudflare (429) — fallback เป็นคำที่เกี่ยวข้องแล้ว |
| Trends batchexecute | **ไม่เป็นทางการ** อาจพังถ้า Google เปลี่ยนโครงสร้าง — มี fallback ไป RSS อัตโนมัติ |
| Trends แยกหมวดหมู่ | ยังไม่ได้ทำ |
| เก็บประวัติย้อนหลัง | ไม่มี DB — กรองได้เฉพาะข้อมูลที่ฟีดส่งมา ณ ตอนนั้น |
