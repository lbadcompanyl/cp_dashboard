#!/usr/bin/env node
// แปลง Google Sheet → ไฟล์ JSON รายปี สำหรับหน้า /archives/
//
// ⚠️ **ไม่ใช่ build step ของเว็บ** — Cloudflare Pages ยังไม่มี build เหมือนเดิม (ดู CLAUDE.md)
// สคริปต์นี้รันด้วยมือเมื่อข้อมูลในชีตเปลี่ยน แล้ว **commit ไฟล์ JSON ที่ได้เข้า repo**
// หน้าเว็บอ่านไฟล์นิ่งๆ อย่างเดียว **ไม่มีการเรียก Google Sheets API ตอนผู้ใช้เปิดหน้า**
//
//   node tools/build-archives.mjs <SHEET_ID> [gid]  # ดึงของจริง (ชีตต้องแชร์แบบ "ใครมีลิงก์ก็ดูได้")
//   node tools/build-archives.mjs --csv <ไฟล์>       # แปลงจากไฟล์ CSV ที่โหลดมาเองแล้ว
//   node tools/build-archives.mjs --mock            # สร้างข้อมูลจำลองโครงเดียวกัน (ไว้ลองของ)
//
// เติม `--out <โฟลเดอร์>` ท้ายคำสั่งไหนก็ได้ = เขียนลง `archives/<โฟลเดอร์>/` แทน `archives/data/`
//   node tools/build-archives.mjs --csv blackchin.csv --out data-blackchin
// ⚠️ **หน้าเว็บที่จะอ่านโฟลเดอร์นั้นต้องมี `<meta name="data-dir">` ชี้มาให้ตรงกัน**
//    (blackchin.html ชี้ไว้ที่ data-blackchin แล้ว) — ตั้งชื่อไม่ตรง = หน้าว่างเปล่าเงียบๆ
//
// ⚠️ **โหมด `--csv` มีไว้เพราะเครื่องที่รัน session ยิงเข้า Google ไม่ได้** (โดนบล็อก 403)
//    ดาวน์โหลดชีตเป็น CSV มาก่อน แล้วชี้ไฟล์ให้ · ผลลัพธ์เหมือนกับดึงเองทุกอย่าง
//    เจ้าของรันบนเครื่องตัวเองใช้ `<SHEET_ID>` ได้ตามปกติ
//
// ผลลัพธ์:
//   archives/data/index.json  — รายชื่อปี + จำนวนแถวต่อปี + เวลาที่สร้าง
//   archives/data/<ปี>.json   — แถวของปีนั้น (ใหม่สุดอยู่บนสุด)
//
// ⚠️ ห้ามใส่ sheet id ลงไฟล์นี้ — repo เป็น public ให้ส่งเป็น argument ตอนรัน

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/* --out <โฟลเดอร์> — เลือกได้ว่าจะเขียนคลังก้อนไหน (ดูหัวไฟล์)
 * 🚫 รับเฉพาะชื่อโฟลเดอร์ชั้นเดียว a-z 0-9 - _ เท่านั้น — write() ลบไฟล์ .json ในโฟลเดอร์ปลายทางทิ้ง
 *    ปล่อยให้ใส่ `..` หรือ path เต็มได้เมื่อไหร่ พิมพ์พลาดทีเดียวลบไฟล์ผิดที่ */
function outDirFromArgv(argv) {
  const i = argv.indexOf("--out");
  if (i === -1) return "data";
  const v = argv[i + 1];
  if (!v || !/^[a-z0-9][a-z0-9_-]*$/i.test(v)) {
    console.error(`--out รับชื่อโฟลเดอร์ชั้นเดียว (a-z 0-9 - _) เท่านั้น — ได้มา: ${JSON.stringify(v)}`);
    process.exit(1);
  }
  return v;
}
const OUT_DIR = outDirFromArgv(process.argv);
const OUT = path.join(ROOT, "archives", OUT_DIR);

// ---------- อ่าน CSV (ชีตส่งมาเป็น CSV ผ่าน /export) ----------
// เขียนเองเพราะต้องรองรับเครื่องหมายคำพูดครอบ + จุลภาคในเซลล์ ซึ่ง split(",") ทำไม่ได้
export function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  const s = String(text).replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
}

// ---------- วันที่ ----------
// ชีตปนกันหลายแบบ: ค่า Date ของ Sheets, "2026-08-14 09:30", "14/08/2569 09:30"
// ⚠️ ปี พ.ศ. ต้องลบ 543 — ถ้าไม่แปลง ข่าวจะไปกองอยู่ปี 2569 แล้วไม่มีใครหาเจอ
const TH_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
export function toISO(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?/);
  if (m) {
    let y = +m[1];
    if (y > 2400) y -= 543;
    return new Date(Date.UTC(y, +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0))).toISOString();
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[, ]*(\d{1,2})?:?(\d{2})?/);
  if (m) {
    let y = +m[3];
    if (y > 2400) y -= 543;
    return new Date(Date.UTC(y, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0))).toISOString();
  }
  m = s.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})/);
  if (m) {
    const mi = TH_MONTHS.indexOf(m[2]);
    if (mi >= 0) {
      let y = +m[3];
      if (y > 2400) y -= 543;
      return new Date(Date.UTC(y, mi, +m[1])).toISOString();
    }
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

// ---------- หมวด ----------
// ⚠️ ช่องเดียวเก็บได้หลายหมวดคั่นด้วยจุลภาค ("ปลาหมอคางดำ, Alien species")
// ต้องแตกเป็น array ตั้งแต่ตอนแปลง ไม่งั้นตัวกรองจะมองว่าเป็นหมวดชื่อยาวหมวดเดียว
export function splitCats(raw) {
  return String(raw || "")
    .split(/[,;·]|、/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/* ☑️ ---------- ช่องติ๊กหมวด = ความจริง ไม่ใช่คอลัมน์ `หมวด` ----------
 *
 * ชีตมีหัวคอลัมน์รูปแบบ `<เลข> <ชื่อหมวด>` (เช่น `1 ศาล/คดีความ` … `10 อื่น ๆ`)
 * ช่องข้างใต้เป็น `TRUE`/`FALSE` — **นั่นคือสิ่งที่เจ้าของกดเอง**
 * ส่วนคอลัมน์ `หมวด` เป็นสูตรที่ประกอบเลขจากช่องติ๊กอีกที **ซึ่งพังอยู่จริง**
 * (วัดกับชีตจริง 18 ก.ย. 2026 รอบสอง: 318 แถว มี **75 แถว** ที่เลขเพี้ยนเป็น `2005`/`2007`/`2026`)
 *
 * 🚫 **ห้ามกลับไปยึดคอลัมน์ `หมวด` เป็นหลัก** — สูตรพังเงียบๆ ได้ตลอดเวลา
 *    และพังแล้วข่าวย้ายหมวดทั้งคลังโดยไม่มีอะไรบอก
 * 🔙 ชีตที่ **ไม่มีช่องติ๊กเลย** ยังอ่านคอลัมน์ `หมวด` เหมือนเดิมทุกอย่าง (ชีตรุ่นเก่ายังสร้างไฟล์ได้)
 *
 * 🔴 **หัวตารางกับช่องติ๊กไม่ได้อยู่ตรงกันเสมอไป — ห้ามอ่านด้วยตำแหน่งของหัวตาราง**
 *    เจอจริง 18 ก.ย. 2026 รอบสอง: เจ้าของเพิ่มคอลัมน์ยอดวิว 2 ช่อง (`1.4M` · `31K`)
 *    **ช่องติ๊กทั้ง 10 เลื่อนไปทางขวา 2 ช่อง แต่หัวตารางอยู่ที่เดิม**
 *    → อ่านตามตำแหน่งหัวตาราง = ข่าวศาลกลายเป็นหมวด "มาตรการรัฐ+CPF" **ทั้งคลัง** โดยไม่มี error
 *
 * ✅ จึงจับคู่ด้วย **ลำดับ** แทนตำแหน่ง — หาคอลัมน์ที่เป็น TRUE/FALSE ล้วน แล้วจับคู่กับ
 *    หัวตารางที่มีเลขนำหน้า ตัวที่ 1 ↔ ตัวที่ 1 · ตัวที่ 2 ↔ ตัวที่ 2 …
 * 🚫 **จำนวนไม่เท่ากันเมื่อไหร่ ให้โยน error ทันที ห้ามเดา** — เดาผิดคือข่าวย้ายหมวดทั้งคลัง
 *    (กฎเดิมของโปรเจกต์: "ไม่รู้" ห้ามกลืนให้กลายเป็นค่าใดค่าหนึ่ง)
 */
const BOOLCELL = /^(true|false)$/i;
export function tickCols(head, body = []) {
  const labels = [];
  head.forEach((h, i) => {
    const m = /^(\d{1,2})\s+\S/.exec(String(h).trim());
    if (m) labels.push({ i, n: m[1] });
  });
  if (!labels.length || !body.length) return labels;

  // คอลัมน์ที่ "ทุกแถวเป็น TRUE/FALSE หรือว่าง และมีอย่างน้อย 1 ค่าจริง" = ช่องติ๊ก
  const width = Math.max(head.length, ...body.map((r) => r.length));
  const bools = [];
  for (let i = 0; i < width; i++) {
    let seen = 0, ok = true;
    for (const r of body) {
      const v = String(r[i] ?? "").trim();
      if (!v) continue;
      if (!BOOLCELL.test(v)) { ok = false; break; }
      seen++;
    }
    if (ok && seen) bools.push(i);
  }
  if (!bools.length) return labels;                       // ไม่มีช่องติ๊กเลย → ใช้หัวตารางตามเดิม
  if (bools.length !== labels.length) {
    throw new Error(
      `ชีตมีหัวหมวด ${labels.length} ช่อง แต่เจอช่องติ๊ก ${bools.length} ช่อง — จับคู่ไม่ได้ ` +
      `หยุดไว้ก่อนเพื่อไม่ให้ข่าวเข้าหมวดผิดทั้งคลัง (หัวหมวด: ${labels.map((l) => l.n).join(",")})`);
  }
  return labels.map((l, k) => ({ i: bools[k], n: l.n }));
}
const isTicked = (v) => /^(true|x|✓|yes|1)$/i.test(String(v || "").trim());

/* 🔑 ---------- กุญแจกันข่าวซ้ำ ----------
 *
 * 🐞 **ของเดิมตัด query ทิ้งทั้งก้อน** (`link.replace(/[?#].*$/, "")`) ซึ่งพังกับ YouTube
 *    `youtube.com/watch?v=<รหัสคลิป>` — **รหัสคลิปอยู่ใน query** ตัดทิ้งแล้วคลิปทุกใบ
 *    กลายเป็นกุญแจเดียวกันหมด (`youtube.com/watch`) แล้วถูกมองว่าซ้ำ
 *    · วัดกับชีตจริง 18 ก.ย. 2026: คลิป YouTube **10 ใบ เหลือ 1 ใบ** หายไป 9 ใบเงียบๆ
 *    · เจอเพราะเพิ่งเพิ่มคอลัมน์ `Channel` แล้วนับยอดแต่ละช่องทางเทียบกับชีต
 *
 * ✅ ตอนนี้ตัดเฉพาะ **พารามิเตอร์ติดตาม** ที่ไม่ได้บอกว่าเป็นคนละหน้า
 *    🚫 ห้ามกลับไปตัดทั้ง query — เว็บที่ใส่ id ไว้ใน query มีอีกเยอะ (`?p=`, `?id=`, `?news_id=`)
 */
const TRACK_PARAM = /^(utm_|fbclid$|gclid$|igshid$|mc_cid$|mc_eid$|ref$|ref_src$|spm$|_ga$|si$)/i;
export function dedupKey(link) {
  try {
    const x = new URL(link);
    x.hash = "";
    for (const k of [...x.searchParams.keys()]) if (TRACK_PARAM.test(k)) x.searchParams.delete(k);
    x.searchParams.sort();                       // ลำดับพารามิเตอร์ต่างกันไม่ใช่คนละหน้า
    let out = x.toString();
    if (!x.search) out = out.replace(/\/+$/, "");  // ตัด / ท้ายเฉพาะตอนไม่มี query
    return out.toLowerCase();
  } catch {
    return String(link || "").trim().replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}

const normLink = (u) => {
  try { const x = new URL(u); x.hash = ""; return x.toString(); } catch { return String(u || "").trim(); }
};

export function buildRows(table) {
  const head = table[0].map((h) => String(h).trim());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const iOutlet = col("สำนักข่าว", "outlet");
  const iTitle = col("พาดหัว", "title");
  const iLink = col("link", "ลิงก์", "url");
  const iDate = col("วันที่", "date");
  const iCat = col("หมวด", "category", "หมวดหมู่");
  const ticks = tickCols(head, table.slice(1));   // ☑️ ช่องติ๊กหมวด — ชนะคอลัมน์ `หมวด` เสมอ (ดูหมายเหตุข้างบน)
  // 💬 ช่องทาง (ข่าว/social) — **ไม่บังคับ** ชีตที่ยังไม่มีคอลัมน์นี้ยังสร้างไฟล์ได้เหมือนเดิม
  const iChan = col("Channel", "channel", "ช่องทาง");
  if (iTitle < 0 || iLink < 0) throw new Error("ชีตต้องมีคอลัมน์ 'พาดหัว' และ 'link' — เจอ: " + head.join(" | "));

  const seen = new Set();
  const out = [];
  for (const r of table.slice(1)) {
    const link = normLink(r[iLink]);
    const title = String(r[iTitle] || "").trim();
    if (!link || !title) continue;
    const key = dedupKey(link);   // 🔑 ดูหมายเหตุที่ dedupKey — ห้ามกลับไปตัด query ทั้งก้อน
    if (seen.has(key)) continue; // ข่าวซ้ำในชีต — เอาแถวแรกที่เจอ
    seen.add(key);
    out.push({
      t: title,                                   // พาดหัวต้นฉบับ (ใช้ค้นหา)
      u: link,
      o: String(r[iOutlet] || "").trim(),         // สำนักข่าว (ค่าดิบ ยังไม่ยุบชื่อ)
      d: toISO(r[iDate]),
      c: ticks.length ? ticks.filter((t) => isTicked(r[t.i])).map((t) => t.n) : splitCats(r[iCat]),
      ch: iChan >= 0 ? String(r[iChan] || "").trim() : "",   // ค่าดิบ — แปลเป็นถังที่หน้าเว็บ
    });
  }
  out.sort((a, b) => String(b.d).localeCompare(String(a.d)));
  return out;
}

// ---------- ข้อมูลจำลอง (ใช้ตอนยังไม่มี sheet id) ----------
// โครงเหมือนของจริงทุกอย่าง รวมถึงข้อมูลที่ "ไม่สวย" ที่ต้องรับมือ:
// พาดหัวมีหางชื่อคอลัมน์/สำนัก · สำนักข่าวปนทั้งชื่อไทย/โดเมน/ชื่อ Alert · หมวดหลายค่า
export function mockTable(n = 18000) {
  const outlets = [
    ["ข่าวสด", 1], ["khaosod.co.th", 1], ["ไทยรัฐ", 1], ["thairath.co.th", 1],
    ["มติชน", 1], ["matichon.co.th", 1], ["เดลินิวส์", 1], ["dailynews.co.th", 1],
    ["ประชาชาติธุรกิจ", 1], ["prachachat.net", 1], ["ฐานเศรษฐกิจ", 1], ["thansettakij.com", 1],
    ["แนวหน้า", 1], ["naewna.com", 1], ["กรุงเทพธุรกิจ", 1], ["bangkokbiznews.com", 1],
    ["ผู้จัดการ", 1], ["mgronline.com", 1], ["โพสต์ทูเดย์", 1], ["posttoday.com", 1],
    ["Bangkok Post", 1], ["bangkokpost.com", 1], ["The Nation", 1], ["nationthailand.com", 1],
    ["หัวข้อที่จับตามอง", 3], ["ซีพี", 3], ["CP / ซีพี", 3], // ชื่อ Google Alert ไม่ใช่สำนักข่าว
  ];
  const cats = ["CPF", "ปลาหมอคางดำ", "PM2.5", "Alien species", "ปศุสัตว์", "ค้าปลีก", "ความยั่งยืน", "ส่งออก"];
  const subjects = [
    "ซีพีเอฟ", "ซีพี ออลล์", "แม็คโคร", "โลตัส", "ราคาหมู", "ราคาไก่", "โรคกุ้ง", "ผลผลิตกุ้งทะเล",
    "ปลาหมอคางดำ", "ฝุ่น PM2.5", "ชนิดพันธุ์ต่างถิ่น", "ส่งออกอาหาร", "อาหารสัตว์", "เกษตรกร",
    "กรมประมง", "กระทรวงเกษตร", "ตลาดค้าปลีก", "ธุรกิจอาหาร",
  ];
  const verbs = [
    "เดินหน้าลงทุนเพิ่ม", "แจ้งผลประกอบการไตรมาสล่าสุด", "ราคาพุ่งต่อเนื่อง", "เร่งแก้ปัญหาเชิงระบบ",
    "ผนึกพันธมิตรขยายตลาด", "ตั้งเป้าลดคาร์บอน", "รับมือภัยแล้ง", "ยืนยันมาตรฐานความปลอดภัย",
    "เปิดตัวโครงการใหม่", "ชี้แจงข้อกังวลของชุมชน",
  ];
  const tails = ["", "", "", " - เทคโนโลยีชาวบ้าน - ข่าวสด", " - ประชาชาติธุรกิจ", " | RYT9", " - The Nation"];
  // ⚠️ ต้องมีพาดหัวที่คำสำคัญ **ไม่ได้อยู่ต้นประโยค** และ **ไม่มีช่องว่างคั่น** ด้วย
  //    ("จับตาราคาหมู…") — เป็นเคสที่ตัวค้นหาแบบตัดคำด้วยช่องว่างจะหาไม่เจอ
  //    ถ้าข้อมูลจำลองมีแต่คำขึ้นต้น เทสต์จะผ่านทั้งที่ของจริงพัง
  const leads = ["", "", "จับตา", "ส่องแนวโน้ม", "เปิดใจเกษตรกร ", "ทำความรู้จัก"];

  const rows = [["สำนักข่าว", "พาดหัว", "link", "วันที่", "หมวด"]];
  // กระจายย้อนหลัง 3 ปี ให้ปีล่าสุดมีข่าวเยอะสุด (เหมือนของจริงที่เพิ่งเริ่มเก็บ)
  const now = Date.UTC(2026, 7, 19);
  for (let i = 0; i < n; i++) {
    const back = Math.floor(Math.pow(i / n, 1.6) * 3 * 365); // ถอยหลังแบบไม่เชิงเส้น
    const t = now - back * 86400000 - (i % 24) * 3600000;
    const o = outlets[i % outlets.length][0];
    const s = subjects[(i * 7) % subjects.length];
    const v = verbs[(i * 3) % verbs.length];
    const tail = tails[i % tails.length];
    const nCat = 1 + (i % 3 === 0 ? 1 : 0);
    const cs = [];
    for (let k = 0; k < nCat; k++) cs.push(cats[(i * 5 + k * 3) % cats.length]);
    rows.push([
      o,
      `${leads[i % leads.length]}${s} ${v}${tail}`,
      `https://example.com/news/${i}`,
      new Date(t).toISOString().slice(0, 16).replace("T", " "),
      [...new Set(cs)].join(", "),
    ]);
  }

  // ⚠️ เคสที่ข้อมูลสุ่มข้างบนไม่มี แต่ของจริงมี — ใส่มือไว้ให้เทสต์จับได้
  //    พาดหัวที่ **มีตัวคั่นอยู่ข้างในเอง** แล้วยังมีหางต่อท้ายอีกที
  //    ถ้าโค้ดตัดหางด้วยวิธี split แล้ว join กลับ ตัวคั่นข้างในจะถูกเขียนใหม่หมด
  //    ("A | B - ข่าวสด" กลายเป็น "A - B") = พาดหัวเพี้ยนทั้งที่ไม่ได้ตั้งใจแก้
  const mixed = [
    "ราคาหมู | เกาะติดสถานการณ์ ราคาสินค้าเกษตร - ข่าวสด",
    "โรคกุ้ง | รายงานพิเศษ ผลผลิตสัตว์น้ำรายไตรมาส - ประชาชาติธุรกิจ",
    "ฝุ่น PM2.5 | เจาะลึกทั้งระบบ ตั้งแต่ต้นทางถึงปลายทาง | RYT9",
  ];
  mixed.forEach((t, k) => rows.push([
    "ข่าวสด", t, `https://example.com/mixed/${k}`, "2026-08-19 09:00", "PM2.5",
  ]));

  return rows;
}

// ---------- เขียนไฟล์ ----------
// ⚠️ เก็บแบบ "ตารางย่อ" ไม่ใช่ object ต่อแถว — ที่ 20,000 แถวต่างกันหลายเท่า
// ชื่อสำนักข่าวกับหมวดซ้ำกันมาก จึงเก็บเป็นรายการเดียวแล้วอ้างด้วยเลขลำดับ
// วันที่เก็บเป็นวินาที (ตัวเลข) ไม่ใช่สตริง ISO — สั้นกว่าและเรียงเร็วกว่า
//   { o:[สำนัก], c:[หมวด], ch:[ช่องทาง], r:[[พาดหัว, ลิงก์, วินาที, ลำดับสำนัก, [ลำดับหมวด], ลำดับช่องทาง], …] }
// 🚫 **ช่องใหม่ต้องต่อท้ายเท่านั้น ห้ามแทรกกลาง** — ตำแหน่งในแถวคือความหมาย
//    แทรกกลางเมื่อไหร่ ไฟล์เก่าทุกไฟล์จะอ่านผิดทั้งก้อนโดยไม่มี error อะไรบอก
//    · ชีตที่ไม่มีคอลัมน์ `Channel` เลย → ไม่มีคีย์ `ch` และแถวยาว 5 ช่องเท่าเดิม
// ฝั่งหน้าเว็บคลี่กลับใน expand() ของ app.js — **แก้โครงตรงนี้ต้องแก้ที่นั่นด้วย**
export function packYear(rows) {
  const oList = [], oIx = new Map(), cList = [], cIx = new Map(), chList = [], chIx = new Map();
  const idx = (v, list, map) => {
    if (!map.has(v)) { map.set(v, list.length); list.push(v); }
    return map.get(v);
  };
  const r = rows.map((x) => {
    const row = [
      x.t,
      x.u,
      Math.floor(new Date(x.d).getTime() / 1000),
      idx(x.o, oList, oIx),
      x.c.map((c) => idx(c, cList, cIx)),
    ];
    if (x.ch) row.push(idx(x.ch, chList, chIx));   // ← ต่อท้าย · แถวที่ไม่ได้กรอกจะสั้นกว่า
    return row;
  });
  return chList.length ? { o: oList, c: cList, ch: chList, r } : { o: oList, c: cList, r };
}

function write(rows) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith(".json")) fs.unlinkSync(path.join(OUT, f));

  const byYear = new Map();
  let noDate = 0;
  for (const r of rows) {
    const y = r.d ? r.d.slice(0, 4) : "";
    if (!y) { noDate++; continue; } // ไม่มีวันที่ = จัดปีไม่ได้ ทิ้งไว้ให้เห็นในสรุป
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(r);
  }
  const years = [...byYear.keys()].sort().reverse();
  for (const y of years) {
    fs.writeFileSync(path.join(OUT, y + ".json"), JSON.stringify(packYear(byYear.get(y))));
  }
  const index = {
    generatedAt: new Date().toISOString(),
    total: rows.length - noDate,
    noDate,
    years: years.map((y) => ({ y: +y, n: byYear.get(y).length })),
  };
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1));

  console.log(`เขียนลง archives/${OUT_DIR}/ แล้ว ${years.length} ปี · รวม ${index.total} แถว` + (noDate ? ` · ไม่มีวันที่ ${noDate} แถว (ข้าม)` : ""));
  for (const y of years) {
    const kb = (fs.statSync(path.join(OUT, y + ".json")).size / 1024).toFixed(0);
    console.log(`  ${y}: ${byYear.get(y).length} แถว · ${kb} KB`);
  }
}

// ---------- main ----------
if (import.meta.url === `file://${process.argv[1]}`) {
  // ตัด --out <โฟลเดอร์> ออกก่อน ไม่งั้นมันจะถูกอ่านเป็น SHEET_ID หรือ gid
  const argv = process.argv.slice(2);
  const oi = argv.indexOf("--out");
  if (oi !== -1) argv.splice(oi, 2);

  const arg = argv[0];
  if (!arg) {
    console.error("ใช้: node tools/build-archives.mjs <SHEET_ID> [gid]   หรือ   --csv <ไฟล์>   หรือ   --mock   [--out <โฟลเดอร์>]");
    process.exit(1);
  }
  let table;
  if (arg === "--mock") {
    console.log("สร้างข้อมูลจำลอง (ไม่ใช่ข่าวจริง)…");
    table = mockTable();
  } else if (arg === "--csv") {
    const file = argv[1];
    if (!file) { console.error("ใช้: node tools/build-archives.mjs --csv <ไฟล์.csv>"); process.exit(1); }
    console.log("อ่านจากไฟล์ CSV…");
    table = parseCSV(fs.readFileSync(file, "utf8"));
  } else {
    const gid = argv[1] || "0";
    const url = `https://docs.google.com/spreadsheets/d/${arg}/export?format=csv&gid=${gid}`;
    console.log("ดึงจากชีต…");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ดึงชีตไม่สำเร็จ (HTTP ${res.status}) — ชีตต้องตั้งเป็น "ใครมีลิงก์ก็ดูได้"`);
    table = parseCSV(await res.text());
  }
  write(buildRows(table));
}
