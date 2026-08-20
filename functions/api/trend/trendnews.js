// POST /api/trendnews  body: { ids: [[articleId,"th","TH"], ...] }
// แปลง article ids ของเทรนด์ -> ข่าวจริง (title/url/source/time/image)

import { fetchTrendNews } from "./_lib/trends.js";
import { startLog, finishLog, resetLog } from "../_lib/syslog.js";

export async function onRequest(context) {
  let ids = [];
  try {
    const b = await context.request.json();
    ids = b.ids || [];
  } catch {
    /* ignore */
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return json({ articles: [] });
  }

  try {
    const articles = await fetchTrendNews(ids);
    return json({ articles });
  } catch (e) {
    // ไม่ให้พัง — ส่ง list ว่างพร้อม error (UI จะซ่อนส่วนข่าวเอง)
    // ⚠️ UI ซ่อนส่วนข่าวเงียบๆ = ผู้ใช้ไม่มีทางรู้ว่าพัง ต้องมีบันทึกไว้ให้ไล่ทีหลัง
    resetLog();
    const L = startLog("trend/trendnews");
    context.waitUntil(finishLog(context.env || {}, L, { err: String((e && e.message) || e).slice(0, 120) }));
    return json({ articles: [], error: String(e.message || e) });
  }
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
