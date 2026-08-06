// GET /api/trend/archive?src=alert1&days=90&format=csv
// ดึงคลังข่าวสะสมของคอลัมน์ CP / หัวข้อที่จับตามอง ออกมาเป็นไฟล์
//
// ใช้กับ Google Sheets ได้ตรงๆ ด้วย  =IMPORTDATA("<url>")  แล้วชีตจะอัปเดตเองตามคลัง
//
// อ่านอย่างเดียว ไม่เขียน KV เลย — เรียกกี่ครั้งก็ไม่กินโควตาเขียนของโปรเจกต์
// (โควตาอ่านของแผนฟรีคือ 100,000 ครั้ง/วัน ซึ่งเหลือเฟือ)

const ARCHIVE_KEY = "pr:archive"; // ต้องตรงกับใน feeds.js
const LABELS = { alert1: "CP", alert2: "หัวข้อที่จับตามอง" };
const MAX_DAYS = 400;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const env = context.env || {};
  const kv = env.FLAGS_KV;

  const srcParam = (url.searchParams.get("src") || "all").toLowerCase();
  const wanted = srcParam === "all" ? Object.keys(LABELS) : Object.keys(LABELS).filter((k) => k === srcParam);
  const days = clamp(parseInt(url.searchParams.get("days") || "90", 10), 1, MAX_DAYS);
  const format = (url.searchParams.get("format") || "csv").toLowerCase();

  if (!wanted.length) return text("ไม่รู้จักคอลัมน์นี้ — ใช้ src=alert1, alert2 หรือ all", 400);
  if (!kv) return text("ยังไม่ได้ผูก KV — ไม่มีคลังข้อมูลให้ดึง", 503);

  let store = {};
  try {
    const raw = await kv.get((env.APP_ENV ? String(env.APP_ENV) + ":" : "") + ARCHIVE_KEY);
    store = raw ? JSON.parse(raw) || {} : {};
  } catch {
    return text("อ่านคลังข้อมูลไม่สำเร็จ", 500);
  }

  const cutoff = Date.now() - days * 86400000;
  const rows = [];
  for (const src of wanted) {
    for (const it of store[src] || []) {
      const t = Date.parse(it && it.publishedAt);
      if (!Number.isFinite(t) || t < cutoff) continue;
      rows.push({
        publishedAt: new Date(t).toISOString(),
        date: thDate(t),
        column: LABELS[src],
        title: clean(it.title),
        outlet: clean(it.sourceLabel),
        link: String(it.link || ""),
        snippet: clean(it.snippet),
      });
    }
  }
  rows.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  if (format === "json") {
    return new Response(JSON.stringify({ days, count: rows.length, rows }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const head = ["วันที่", "เวลา ISO", "คอลัมน์", "พาดหัว", "สำนักข่าว", "ลิงก์", "สรุป"];
  const body = rows.map((r) => [r.date, r.publishedAt, r.column, r.title, r.outlet, r.link, r.snippet]);
  // BOM (\uFEFF) — ถ้าไม่ใส่ Excel จะอ่านภาษาไทยเป็นตัวยึกยือ
  const csv = "\uFEFF" + [head, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cp-news-${srcParam}-${days}d.csv"`,
      "cache-control": "no-store",
    },
  });
}

/* ---------- helpers ---------- */

function csvCell(v) {
  const s = String(v == null ? "" : v);
  // ต้องครอบด้วยเครื่องหมายคำพูดเสมอ — พาดหัวข่าวไทยมีทั้งจุลภาค บรรทัดใหม่ และคำพูด
  return `"${s.replace(/"/g, '""')}"`;
}

// ตัด marker ไฮไลต์ที่ feeds.js ใส่ไว้ (\[\[hl\]\]) ออก ไม่งั้นจะติดไปในไฟล์
function clean(s) {
  return String(s == null ? "" : s)
    .replace(/\[\[\/?hl\]\]/g, "")
    .replace(/[]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function thDate(t) {
  const d = new Date(t + 7 * 3600000); // เวลาไทย
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function clamp(n, lo, hi) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : hi;
}

function text(msg, status) {
  return new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
