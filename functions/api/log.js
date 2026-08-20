/* GET /api/log — อ่านบันทึกระบบให้หน้า /admin/
 *
 * ⚠️ **อ่านอย่างเดียว ไม่มี POST** — ถ้าเปิดให้เขียนจากข้างนอกได้เมื่อไหร่
 *    ใครก็ยิงเข้ามาเขียน KV ไม่จำกัด โควตาหมดใน 1 นาที (ดูเหตุผลเต็มใน _lib/syslog.js)
 *
 * ⚠️ อ่าน KV **ครั้งเดียว** ต่อ request · ไม่ cache ที่ edge เพราะ log ต้องเป็นของสด
 *    (หน้า admin เปิดไม่บ่อย การอ่านจึงไม่กระทบโควตา — โควตาที่ตึงคือ "เขียน")
 */
import { readLog } from "./_lib/syslog.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET") return json({ error: "อ่านได้อย่างเดียว" }, 405);
  if (!env || !env.FLAGS_KV) return json({ items: [], note: "ยังไม่ได้ผูก KV" });

  const url = new URL(request.url);
  const src = (url.searchParams.get("src") || "").trim();
  const limit = Math.min(300, Math.max(1, +url.searchParams.get("limit") || 200));

  let items = await readLog(env);
  if (src) items = items.filter((x) => x && x.src === src);
  return json({ items: items.slice(0, limit), total: items.length });
}
