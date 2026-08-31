/**
 * xlsxread.js — อ่านไฟล์ .xlsx ในเบราว์เซอร์ โดยไม่ใช้ไลบรารีจากข้างนอก
 * ------------------------------------------------------------------
 * ทำไมต้องเขียนเอง: CDN ถูกบล็อกในสภาพแวดล้อมนี้ (เคยลอง SheetJS แล้วโดน 403)
 * และหน้าเว็บนี้เป็น static ล้วน ไม่มีขั้นตอน build ที่จะ bundle ไลบรารีเข้ามาได้
 *
 * รองรับเท่าที่ต้องใช้จริง: sheet แรก · sharedStrings · inlineStr · ตัวเลข
 * ไม่รองรับ: สูตร · วันที่แบบ serial (คืนเป็นตัวเลขดิบ) · หลาย sheet
 *
 * ⚠️ ใช้ DecompressionStream("deflate-raw") ซึ่งเป็นของเบราว์เซอร์เอง
 *    Safari รองรับตั้งแต่ 16.4 · ถ้าไม่มีจะโยน error ให้หน้าเว็บบอกผู้ใช้ให้ใช้ CSV แทน
 */
(function (root) {
  "use strict";

  const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);

  /** แตกไฟล์ zip → Map<ชื่อไฟล์, Uint8Array> */
  async function unzip(buf) {
    const b = new Uint8Array(buf), d = dv(b);
    // หา End of Central Directory (ท้ายไฟล์ ถอยหลังหาลายเซ็น)
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) {
      if (d.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("ไม่ใช่ไฟล์ zip/xlsx ที่อ่านได้");

    const count = d.getUint16(eocd + 10, true);
    let p = d.getUint32(eocd + 16, true);          // ตำแหน่งเริ่ม central directory
    const out = new Map();

    for (let i = 0; i < count; i++) {
      if (d.getUint32(p, true) !== 0x02014b50) break;
      const method = d.getUint16(p + 10, true);
      const csize = d.getUint32(p + 20, true);
      const nameLen = d.getUint16(p + 28, true);
      const extraLen = d.getUint16(p + 30, true);
      const cmtLen = d.getUint16(p + 32, true);
      const local = d.getUint32(p + 42, true);
      const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));

      // local header มีความยาว name/extra ของตัวเอง (ไม่เท่ากับของ central เสมอ)
      const ln = d.getUint16(local + 26, true), le = d.getUint16(local + 28, true);
      const start = local + 30 + ln + le;
      const raw = b.subarray(start, start + csize);

      out.set(name, method === 0 ? raw : await inflateRaw(raw));
      p += 46 + nameLen + extraLen + cmtLen;
    }
    return out;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("เบราว์เซอร์นี้อ่าน .xlsx ไม่ได้ (ไม่มี DecompressionStream) — ใช้ไฟล์ .csv แทน");
    }
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  const XML = (s) => new DOMParser().parseFromString(s, "application/xml");

  /** "B12" → 1 (เลขคอลัมน์ฐาน 0) */
  function colOf(ref) {
    let n = 0;
    for (const ch of ref) {
      const c = ch.charCodeAt(0);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  }

  /**
   * อ่าน .xlsx → { headers:[...], rows:[{คอลัมน์: ค่า}, ...] }
   * แถวแรกถือเป็นหัวตาราง
   */
  async function readXlsx(arrayBuffer) {
    const files = await unzip(arrayBuffer);
    const dec = new TextDecoder();

    // sharedStrings: ข้อความส่วนใหญ่ของ xlsx อยู่ในนี้ ไม่ได้อยู่ในตัว sheet
    let shared = [];
    const ssFile = files.get("xl/sharedStrings.xml");
    if (ssFile) {
      shared = [...XML(dec.decode(ssFile)).getElementsByTagName("si")].map((si) =>
        [...si.getElementsByTagName("t")].map((t) => t.textContent).join("")
      );
    }

    const sheetName = [...files.keys()].find((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
    if (!sheetName) throw new Error("ไม่พบ sheet ในไฟล์");
    const sheet = XML(dec.decode(files.get(sheetName)));

    const grid = [];
    for (const row of sheet.getElementsByTagName("row")) {
      const cells = [];
      for (const c of row.getElementsByTagName("c")) {
        const ref = c.getAttribute("r") || "";
        const idx = ref ? colOf(ref) : cells.length;
        const type = c.getAttribute("t");
        let v = "";
        if (type === "inlineStr") {
          v = [...c.getElementsByTagName("t")].map((t) => t.textContent).join("");
        } else {
          const vEl = c.getElementsByTagName("v")[0];
          const raw = vEl ? vEl.textContent : "";
          v = type === "s" ? (shared[+raw] ?? "") : raw;
        }
        cells[idx] = v;
      }
      grid.push(cells);
    }
    if (!grid.length) return { headers: [], rows: [] };

    const headers = (grid[0] || []).map((h) => String(h ?? "").trim());
    const rows = grid.slice(1)
      .filter((r) => r && r.some((v) => String(v ?? "").trim() !== ""))
      .map((r) => {
        const o = {};
        headers.forEach((h, i) => { if (h) o[h] = r[i] === undefined ? "" : r[i]; });
        return o;
      });
    return { headers, rows };
  }

  /** CSV ที่รองรับเครื่องหมายคำพูดและขึ้นบรรทัดใหม่ในช่อง */
  function readCsv(text) {
    text = text.replace(/^﻿/, "");
    const grid = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); grid.push(row); row = []; cell = ""; }
      else if (ch !== "\r") cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); grid.push(row); }
    if (!grid.length) return { headers: [], rows: [] };
    const headers = grid[0].map((h) => String(h).trim());
    const rows = grid.slice(1)
      .filter((r) => r.some((v) => String(v ?? "").trim() !== ""))
      .map((r) => {
        const o = {};
        headers.forEach((h, i) => { if (h) o[h] = r[i] === undefined ? "" : r[i]; });
        return o;
      });
    return { headers, rows };
  }

  /** รับ File จาก <input type=file> แล้วเลือกวิธีอ่านตามนามสกุล */
  async function readTable(file) {
    if (/\.csv$/i.test(file.name)) return readCsv(await file.text());
    return readXlsx(await file.arrayBuffer());
  }

  root.XlsxRead = { readTable, readXlsx, readCsv };
})(window);
