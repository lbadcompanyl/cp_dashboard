/* บันทึกระบบ (system log) — ไว้ไล่ปัญหาว่า "ทำไมข่าวหาย / ทำไมคลังไม่โต / ต้นทางล่มไหม"
 *
 * 🎯 **ไลบรารีเดียวสำหรับทุกแดชบอร์ด** แบบเดียวกับ `noise.js`
 *    แดชบอร์ดใหม่ที่จะสร้างต่อจากนี้ ให้ `import` จากไฟล์นี้ตั้งแต่วันแรก
 *    **ห้ามก๊อปโค้ดเขียน log ไปวางในแดชบอร์ดอีก**
 *
 * ⚠️⚠️ **กฎเหล็กเรื่องโควตา KV — อ่านก่อนแตะไฟล์นี้**
 * `FLAGS_KV` ใช้ร่วมกันทั้งโปรเจกต์ แผนฟรีเขียนได้ **1,000 ครั้ง/วัน**
 * ตัวบันทึก log ที่เขียนทุก request จะ **ทำโควตาหมดเอง** แล้วพังทั้งระบบ
 * ซึ่งเป็นอาการเดียวกับที่มันมีไว้ตรวจ — กลายเป็นต้นเหตุเสียเอง
 *
 * กฎที่บังคับไว้ในโค้ดนี้:
 *   1. **1 request เขียน log ได้ครั้งเดียวเท่านั้น** (`logged` กันไว้)
 *   2. เขียนเฉพาะตอน "มีอะไรเกิดขึ้นจริง" — build ใหม่ หรือมี error
 *      ไม่ใช่ทุกครั้งที่มีคนเปิดหน้าเว็บ (cache hit ไม่เขียนอะไรเลย)
 *   3. เก็บแบบวงแหวน blob เดียว (`log:events`) ไม่ใช่ key ต่อรายการ
 *
 * ประมาณการ: build เกิดตอน cache หมดอายุ (~1 ชม.) × ~5 endpoint = ~120 ครั้ง/วัน
 * รวมกับที่เขียนอยู่เดิม ~150 ครั้ง/วัน → ยังห่างเพดาน 1,000 อยู่มาก
 *
 * 🚫 **ห้ามเก็บ log ไว้ใน edge cache แทน KV** — edge cache แยกตามศูนย์ข้อมูล
 *    log ที่เขียนจากศูนย์กรุงเทพ หน้า admin ที่เปิดจากอีกที่จะมองไม่เห็น
 *    ดูเหมือน log หาย ทั้งที่เขียนสำเร็จ
 *
 * 🚫 **ยังไม่รับ log จากฝั่งเบราว์เซอร์** (หน้าเว็บ POST เข้ามาเอง) — จะกลายเป็น
 *    ช่องให้ใครก็ได้ยิงเข้ามาเขียน KV ไม่จำกัด = โควตาหมดใน 1 นาที และเป็นรูเดียว
 *    กับที่ `/api/allow` มีอยู่ ถ้าจะทำต้องมีกุญแจ + จำกัดจำนวนก่อน
 */

export const LOG_KEY = "log:events";

const MAX_ENTRIES = 300;      // เก็บย้อนหลังเท่านี้พอ — หน้า admin ดูไม่เกินนี้อยู่แล้ว
const MAX_BYTES = 180 * 1024; // กันไม่ให้ blob โตจนอ่าน/เขียนช้า (เพดานจริงของ KV คือ 25 MB)

const prefix = (env) => (env && env.APP_ENV ? String(env.APP_ENV) + ":" : "");

// ⚠️ Workers ใช้โมดูลเดิมซ้ำข้าม request — ตัวแปรระดับโมดูลต้องรีเซ็ตทุก request
// ไม่งั้น request ที่ 2 จะคิดว่า "เขียน log ไปแล้ว" แล้วเงียบไปเฉยๆ
let logged = false;
export function resetLog() { logged = false; }

// ---------- อ่าน ----------
export async function readLog(env) {
  const kv = env && env.FLAGS_KV;
  if (!kv) return [];
  try {
    const raw = await kv.get(prefix(env) + LOG_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// ---------- เขียน ----------
/**
 * บันทึก 1 บรรทัด — เรียกได้ครั้งเดียวต่อ request
 * @param entry {{src, ok, ms, note, counts, drops, upstream, ai, kvWrites, cache}}
 * คืน true ถ้าเขียนจริง · false ถ้าถูกกันไว้ (เรียกซ้ำ / ไม่มี KV / ไม่มีอะไรต้องบันทึก)
 */
export async function writeLog(env, entry) {
  const kv = env && env.FLAGS_KV;
  if (!kv || !entry) return false;
  if (logged) return false;              // กฎข้อ 1 — 1 request 1 ครั้ง
  logged = true;

  const row = {
    at: new Date().toISOString(),
    env: (env && env.APP_ENV) || "prod",
    ...entry,
  };
  try {
    const list = await readLog(env);
    list.unshift(row);                    // ใหม่สุดอยู่บนสุด (หน้า admin อ่านจากบนลงล่าง)
    let out = list.slice(0, MAX_ENTRIES);
    // ตัดตามขนาดจริงด้วย ไม่ใช่ตามจำนวนอย่างเดียว — บาง entry ยาวกว่าเพื่อนมาก
    let s = JSON.stringify(out);
    while (s.length > MAX_BYTES && out.length > 10) {
      out = out.slice(0, Math.floor(out.length * 0.8));
      s = JSON.stringify(out);
    }
    await kv.put(prefix(env) + LOG_KEY, s);
    return true;
  } catch {
    return false;                          // log พังห้ามทำให้ API พัง
  }
}

// ---------- กันเขียนซ้ำเรื่องเดิมรัวๆ ----------
// ⚠️ **จำเป็น ไม่ใช่ของหรู** — endpoint ที่ดึงข้อมูลสด (เทรนด์ · X · YouTube · โซเชียล)
// มี cache key แยกตามประเทศ/ช่วงเวลา/หมวด ถ้าต้นทางล่มยาว **ทุก request จะเป็น build ที่ error**
// แล้วเขียน log คนละครั้ง = โควตา KV หมดใน 1 ชม. ซึ่งคือปัญหาเดียวกับที่ log มีไว้ตรวจ
//
// จึงบันทึก "เรื่องเดิม จาก endpoint เดิม" ได้ครั้งเดียวต่อ 5 นาที
// 📌 ที่ใช้ edge cache ตรงนี้ได้ เพราะเก็บแค่ **ตัวนับว่าเพิ่งเขียนไปแล้ว** ไม่ใช่ตัว log
//    (ตัว log ยังอยู่ใน KV ตามกฎ — edge cache แยกตามศูนย์ข้อมูล ใช้เก็บ log ไม่ได้)
//    ผลข้างเคียงที่ยอมรับได้: ศูนย์ข้อมูลละ 1 ครั้ง/5 นาที ยังห่างเพดานมาก
const THROTTLE_SEC = 300;
async function throttled(src, sig) {
  try {
    const cache = caches.default;
    const key = new Request("https://syslog.internal/" + encodeURIComponent(src) + "/" + encodeURIComponent(sig));
    if (await cache.match(key)) return true;
    await cache.put(key, new Response("1", { headers: { "cache-control": "max-age=" + THROTTLE_SEC } }));
    return false;
  } catch { return false; }
}

// ---------- ตัวช่วยเก็บระหว่างทาง ----------
// ใช้ในตัว endpoint: สร้าง 1 ตัวต่อ request แล้วค่อย finish() ตอนจบ
export function startLog(src) {
  const t0 = Date.now();
  return {
    src,
    upstream: [],   // ต้นทางที่ล่ม: [{host, err}]
    counts: {},     // ตัวเลขที่อยากเห็น: {fetched, kept, dropped, ...}
    drops: {},      // ตัดเพราะอะไรกี่ใบ: {"archive-page": 3, ...}
    ai: 0,          // ถาม AI กี่ครั้ง
    kvWrites: 0,    // เขียน KV กี่ครั้ง (ไม่รวมตัว log เอง)
    cache: "",      // hit / miss / rebuild
    note: "",
    flagged: false, // มีเรื่องผิดปกติที่อยากให้บันทึกไว้ แม้จะไม่ถึงขั้น error
    fail(host, err) { this.upstream.push({ host: String(host).slice(0, 60), err: String(err).slice(0, 120) }); },
    count(k, n) { this.counts[k] = (this.counts[k] || 0) + (n || 0); },
    drop(why, n) { this.drops[why] = (this.drops[why] || 0) + (n || 1); },
    // "ไม่ได้พัง แต่ผิดปกติ" — เช่นดึงสำเร็จแต่ได้ 0 รายการ, ตกไปใช้ต้นทางสำรอง
    warn(msg) { this.note = String(msg).slice(0, 200); this.flagged = true; },
    ms() { return Date.now() - t0; },
  };
}

/**
 * ปิดท้าย: เขียนลง KV **เฉพาะเมื่อมีอะไรน่าบันทึกจริงๆ**
 * ⚠️ กฎข้อ 2 — cache hit ที่ไม่ได้ build อะไรเลย ไม่ต้องเขียน
 *    ไม่งั้นทุกคนที่เปิดหน้าเว็บจะกินโควตา KV คนละครั้ง
 *
 * `built: true` = "งานหลักของ endpoint นี้ทำงานจริงรอบนี้" ใช้ได้เฉพาะ endpoint ที่
 * **มี cache key เดียว** (ข่าว PR / ข่าว IR) ซึ่ง build ราวชั่วโมงละครั้ง
 * endpoint ที่ cache key แตกตามพารามิเตอร์ **ห้ามส่ง built: true** ให้ปล่อยเป็นค่าปริยาย
 * แล้วบันทึกเฉพาะตอนพัง/ผิดปกติแทน ไม่งั้นโควตา KV หมด
 */
export async function finishLog(env, L, { built = false, err = "" } = {}) {
  const worth = built || !!err || L.flagged || L.upstream.length > 0;
  if (!worth) return false;
  // เรื่องที่ไม่ใช่ build ปกติ = อาจเกิดรัวๆ ต้องผ่านตัวกันเขียนซ้ำก่อน
  if (!built) {
    const sig = String(err || L.note || (L.upstream[0] || {}).err || "?").slice(0, 60);
    if (await throttled(L.src, sig)) return false;
  }
  return writeLog(env, {
    src: L.src,
    ok: !err,
    ms: L.ms(),
    note: err ? String(err).slice(0, 200) : L.note,
    counts: L.counts,
    drops: L.drops,
    upstream: L.upstream,
    ai: L.ai,
    kvWrites: L.kvWrites,
    cache: L.cache,
  });
}
