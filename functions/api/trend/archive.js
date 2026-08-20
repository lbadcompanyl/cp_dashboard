import { startLog, finishLog, resetLog } from "../_lib/syslog.js";
// GET /api/trend/archive?src=alert1&days=90&format=csv
// ดึงคลังข่าวสะสมของคอลัมน์ CP / หัวข้อที่จับตามอง ออกมาเป็นไฟล์
//
// ใช้กับ Google Sheets ได้ตรงๆ ด้วย  =IMPORTDATA("<url>")  แล้วชีตจะอัปเดตเองตามคลัง
//
// อ่านอย่างเดียว ไม่เขียน KV เลย — เรียกกี่ครั้งก็ไม่กินโควตาเขียนของโปรเจกต์
// (โควตาอ่านของแผนฟรีคือ 100,000 ครั้ง/วัน ซึ่งเหลือเฟือ)

const ARCHIVE_KEY = "pr:archive"; // ต้องตรงกับใน feeds.js
const LABELS = { alert1: "CP", alert2: "หัวข้อที่จับตามอง" };
// ⚠️ อ่านอย่างเดียว ไม่เขียน KV — Google Sheet มาดึงทุกชั่วโมงก็ไม่กินโควตาเขียน
const MAX_DAYS = 400;

// ---- หัวข้อที่แยกเก็บลง Google Sheet ----
// ?topics=cpf,blackchin,pm25,alien  → เอาเฉพาะข่าวที่เข้าหัวข้อพวกนี้ + ติดชื่อหัวข้อมาให้
// ไม่ใส่ = เอาทุกข่าวเหมือนเดิม (ของเดิมที่ =IMPORTDATA ใช้อยู่จะไม่พัง)
//
// ⚠️ ข่าวใบเดียวเข้าได้หลายหัวข้อ (เช่น CPF + ปลาหมอคางดำ) — ใส่ทุกหัวข้อคั่นด้วย ", "
// ไม่เลือกอันใดอันหนึ่ง เพราะจะทำให้อีกหัวข้อหาย และตัวกรองในชีตยังใช้ "มีคำว่า..." ได้อยู่
const TOPICS = [
  { key: "cpf", label: "CPF", terms: ["cpf", "ซีพีเอฟ", "cp foods", "เจริญโภคภัณฑ์อาหาร", "charoen pokphand foods"] },
  { key: "blackchin", label: "ปลาหมอคางดำ", terms: ["หมอคางดำ", "ปลาหมอสีคางดำ", "blackchin tilapia"] },
  { key: "pm25", label: "PM2.5", terms: ["pm2.5", "pm 2.5", "ฝุ่นพิษ", "ฝุ่นละอองขนาดเล็ก", "ค่าฝุ่น", "ฝุ่นจิ๋ว", "หมอกควัน"] },
  // 🐟 เจ้าของสั่งให้เอาแค่คำว่า alien species (ไทย+อังกฤษ) กับ "สัตว์ต่างถิ่น"
  // ไม่ต้องไล่ชื่อชนิดพันธุ์ทีละตัว — ต้องเป็นชุดเดียวกับ extraTerms ใน
  // trend-feeds.config.js ไม่งั้นข่าวจะเข้าคอลัมน์แต่ไม่เข้าชีต (หรือกลับกัน)
  { key: "alien", label: "Alien species",
    terms: ["เอเลี่ยนสปีชีส์", "เอเลียนสปีชีส์", "เอเลี่ยน สปีชีส์", "ชนิดพันธุ์ต่างถิ่น",
            "สัตว์ต่างถิ่น", "alien species", "invasive species"] },
];
// คำไทยไม่มีช่องว่างคั่นคำ จึงเทียบแบบ substring · คำอังกฤษต้องตรงทั้งคำ
// (บทเรียนเดิม: rcep ไปจับ inte(rcep)t · SLAPP ไปจับ slapped) — โค้ดชุดเดียวกับใน feeds.js
const LATIN_TERM = /^[\x20-\x7e]+$/;
function termRe(t) {
  const esc = String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(LATIN_TERM.test(t) ? "(?<![a-z0-9])" + esc + "(?![a-z0-9])" : esc, "i");
}
const TOPIC_RE = TOPICS.map((t) => ({ ...t, res: t.terms.map(termRe) }));
function topicsOf(text) {
  const hay = String(text || "").toLowerCase();
  return TOPIC_RE.filter((t) => t.res.some((re) => re.test(hay)));
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const env = context.env || {};
  const kv = env.FLAGS_KV;

  const srcParam = (url.searchParams.get("src") || "all").toLowerCase();
  const wanted = srcParam === "all" ? Object.keys(LABELS) : Object.keys(LABELS).filter((k) => k === srcParam);
  const days = clamp(parseInt(url.searchParams.get("days") || "90", 10), 1, MAX_DAYS);
  const format = (url.searchParams.get("format") || "csv").toLowerCase();
  // ว่าง = ไม่กรอง · ใส่ชื่อหัวข้อคั่นจุลภาค = เอาเฉพาะหัวข้อนั้น · "all" = ทุกหัวข้อที่รู้จัก
  const topicParam = (url.searchParams.get("topics") || "").trim().toLowerCase();
  const wantTopics = !topicParam ? null
    : topicParam === "all" ? TOPIC_RE.map((t) => t.key)
    : topicParam.split(",").map((x) => x.trim()).filter((x) => TOPIC_RE.some((t) => t.key === x));
  if (wantTopics && !wantTopics.length) return text("ไม่รู้จักหัวข้อนี้ — ใช้ " + TOPIC_RE.map((t) => t.key).join(", "), 400);

  if (!wanted.length) return text("ไม่รู้จักคอลัมน์นี้ — ใช้ src=alert1, alert2 หรือ all", 400);
  if (!kv) return text("ยังไม่ได้ผูก KV — ไม่มีคลังข้อมูลให้ดึง", 503);

  let store = {};
  try {
    const raw = await kv.get((env.APP_ENV ? String(env.APP_ENV) + ":" : "") + ARCHIVE_KEY);
    store = raw ? JSON.parse(raw) || {} : {};
  } catch (e) {
    // 📋 คลังข่าวคือที่ที่ชีต Google มาดึงทุกชั่วโมง — อ่านไม่ได้เมื่อไหร่ ชีตจะค้างเงียบๆ
    //    เคยไล่หาสาเหตุกัน 2 รอบเพราะไม่มีอะไรบันทึกไว้ให้ดู
    resetLog();
    const La = startLog("trend/archive");
    context.waitUntil(finishLog(env, La, { err: "อ่านคลังข้อมูลจาก KV ไม่สำเร็จ: " + String((e && e.message) || e).slice(0, 80) }));
    return text("อ่านคลังข้อมูลไม่สำเร็จ", 500);
  }

  const cutoff = Date.now() - days * 86400000;
  const rows = [];
  for (const src of wanted) {
    for (const it of store[src] || []) {
      const t = Date.parse(it && it.publishedAt);
      if (!Number.isFinite(t) || t < cutoff) continue;
      let topicLabel = "";
      if (wantTopics) {
        // ดูทั้งพาดหัวและสรุป — บางข่าวชื่อหัวข้ออยู่ในสรุปอย่างเดียว
        const hit = topicsOf(clean(it.title) + " " + clean(it.snippet)).filter((x) => wantTopics.includes(x.key));
        if (!hit.length) continue;
        topicLabel = hit.map((x) => x.label).join(", ");
      }
      rows.push({
        topic: topicLabel,
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

  const head = ["วันที่", "เวลา ISO", "คอลัมน์", "พาดหัว", "สำนักข่าว", "ลิงก์", "สรุป", "หมวด"];
  const body = rows.map((r) => [r.date, r.publishedAt, r.column, r.title, r.outlet, r.link, r.snippet, r.topic || ""]);
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
