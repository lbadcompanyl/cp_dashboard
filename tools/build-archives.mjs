#!/usr/bin/env node
// แปลง Google Sheet → ไฟล์ JSON รายปี สำหรับหน้า /archives/
//
// ⚠️ **ไม่ใช่ build step ของเว็บ** — Cloudflare Pages ยังไม่มี build เหมือนเดิม (ดู CLAUDE.md)
// สคริปต์นี้รันด้วยมือเมื่อข้อมูลในชีตเปลี่ยน แล้ว **commit ไฟล์ JSON ที่ได้เข้า repo**
// หน้าเว็บอ่านไฟล์นิ่งๆ อย่างเดียว **ไม่มีการเรียก Google Sheets API ตอนผู้ใช้เปิดหน้า**
//
//   node tools/build-archives.mjs <SHEET_ID>   # ดึงของจริง (ชีตต้องแชร์แบบ "ใครมีลิงก์ก็ดูได้")
//   node tools/build-archives.mjs --mock       # สร้างข้อมูลจำลองโครงเดียวกัน (ยังไม่มี sheet id)
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
const OUT = path.join(ROOT, "archives", "data");

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
  if (iTitle < 0 || iLink < 0) throw new Error("ชีตต้องมีคอลัมน์ 'พาดหัว' และ 'link' — เจอ: " + head.join(" | "));

  const seen = new Set();
  const out = [];
  for (const r of table.slice(1)) {
    const link = normLink(r[iLink]);
    const title = String(r[iTitle] || "").trim();
    if (!link || !title) continue;
    const key = link.replace(/[?#].*$/, "").replace(/\/+$/, "");
    if (seen.has(key)) continue; // ข่าวซ้ำในชีต — เอาแถวแรกที่เจอ
    seen.add(key);
    out.push({
      t: title,                                   // พาดหัวต้นฉบับ (ใช้ค้นหา)
      u: link,
      o: String(r[iOutlet] || "").trim(),         // สำนักข่าว (ค่าดิบ ยังไม่ยุบชื่อ)
      d: toISO(r[iDate]),
      c: splitCats(r[iCat]),
    });
  }
  out.sort((a, b) => String(b.d).localeCompare(String(a.d)));
  return out;
}

// ---------- ข้อมูลจำลอง (ใช้ตอนยังไม่มี sheet id) ----------
// โครงเหมือนของจริงทุกอย่าง รวมถึงข้อมูลที่ "ไม่สวย" ที่ต้องรับมือ:
// พาดหัวมีหางชื่อคอลัมน์/สำนัก · สำนักข่าวปนทั้งชื่อไทย/โดเมน/ชื่อ Alert · หมวดหลายค่า
function mockTable(n = 18000) {
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
  return rows;
}

// ---------- เขียนไฟล์ ----------
// ⚠️ เก็บแบบ "ตารางย่อ" ไม่ใช่ object ต่อแถว — ที่ 20,000 แถวต่างกันหลายเท่า
// ชื่อสำนักข่าวกับหมวดซ้ำกันมาก จึงเก็บเป็นรายการเดียวแล้วอ้างด้วยเลขลำดับ
// วันที่เก็บเป็นวินาที (ตัวเลข) ไม่ใช่สตริง ISO — สั้นกว่าและเรียงเร็วกว่า
//   { o:[สำนัก], c:[หมวด], r:[[พาดหัว, ลิงก์, วินาที, ลำดับสำนัก, [ลำดับหมวด]], …] }
// ฝั่งหน้าเว็บคลี่กลับใน expand() ของ app.js — **แก้โครงตรงนี้ต้องแก้ที่นั่นด้วย**
function packYear(rows) {
  const oList = [], oIx = new Map(), cList = [], cIx = new Map();
  const idx = (v, list, map) => {
    if (!map.has(v)) { map.set(v, list.length); list.push(v); }
    return map.get(v);
  };
  const r = rows.map((x) => [
    x.t,
    x.u,
    Math.floor(new Date(x.d).getTime() / 1000),
    idx(x.o, oList, oIx),
    x.c.map((c) => idx(c, cList, cIx)),
  ]);
  return { o: oList, c: cList, r };
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

  console.log(`เขียนแล้ว ${years.length} ปี · รวม ${index.total} แถว` + (noDate ? ` · ไม่มีวันที่ ${noDate} แถว (ข้าม)` : ""));
  for (const y of years) {
    const kb = (fs.statSync(path.join(OUT, y + ".json")).size / 1024).toFixed(0);
    console.log(`  ${y}: ${byYear.get(y).length} แถว · ${kb} KB`);
  }
}

// ---------- main ----------
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (!arg) {
    console.error("ใช้: node tools/build-archives.mjs <SHEET_ID>   หรือ   --mock");
    process.exit(1);
  }
  let table;
  if (arg === "--mock") {
    console.log("สร้างข้อมูลจำลอง (ยังไม่มี sheet id)…");
    table = mockTable();
  } else {
    const gid = process.argv[3] || "0";
    const url = `https://docs.google.com/spreadsheets/d/${arg}/export?format=csv&gid=${gid}`;
    console.log("ดึงจากชีต…");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ดึงชีตไม่สำเร็จ (HTTP ${res.status}) — ชีตต้องตั้งเป็น "ใครมีลิงก์ก็ดูได้"`);
    table = parseCSV(await res.text());
  }
  write(buildRows(table));
}
