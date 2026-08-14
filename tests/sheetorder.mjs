// ⚠️ รันด้วย TZ=Asia/Bangkok — โค้ดใน .gs ใช้เวลาท้องถิ่นของชีต (Apps Script ตั้งเป็นกรุงเทพ)
//    รันด้วย TZ อื่นแล้วเวลาที่แสดงจะเลื่อน เทสต์จะตกทั้งที่โค้ดถูก
// ข่าวใหม่ต้องไปอยู่ "บนสุด" ของชีต ไม่ใช่ก้นชีต
// (ต้นเหตุที่เจ้าของเปิดดูแล้วเห็นวันที่ค้างอยู่ที่ 12 ส.ค. แถวเดียว)
// รันโค้ดจริงจากไฟล์ .gs โดยปลอม SpreadsheetApp / UrlFetchApp ให้ ไม่ก๊อปโค้ดมาเขียนซ้ำ
import fs from "node:fs";
import vm from "node:vm";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const SRC = fs.readFileSync(new URL("../sheet/news-to-sheet.gs", import.meta.url), "utf8");

// ---- ชีตปลอม: เก็บเป็น array of array เหมือนของจริง ----
function makeSheet(rows) {
  const grid = [["สำนักข่าว", "พาดหัว", "link", "วันที่", "หมวด"], ...rows];
  const api = {
    getLastRow: () => grid.length,
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues: () => Array.from({ length: nr }, (_, i) =>
          Array.from({ length: nc }, (_, j) => (grid[r - 1 + i] || [])[c - 1 + j] ?? "")),
        setValues(v) {
          v.forEach((row, i) => {
            while (grid.length < r - 1 + i + 1) grid.push(["", "", "", "", ""]);
            row.forEach((val, j) => { grid[r - 1 + i][c - 1 + j] = val; });
          });
          return api;
        },
        setFontWeight: () => api,
        getValue: () => (grid[r - 1] || [])[c - 1] ?? "",
        sort({ column, ascending }) {
          const body = grid.slice(r - 1, r - 1 + nr);
          body.sort((a, b) => (a[column - 1] < b[column - 1] ? -1 : 1) * (ascending ? 1 : -1));
          body.forEach((row, i) => { grid[r - 1 + i] = row; });
          return api;
        },
      };
    },
    insertRowsBefore(before, n) {
      grid.splice(before - 1, 0, ...Array.from({ length: n }, () => ["", "", "", "", ""]));
    },
    setFrozenRows: () => api,
    setColumnWidth: () => api,
    _grid: grid,
  };
  return api;
}

function run(existing, apiRows) {
  const sheet = makeSheet(existing);
  const hits = [];
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
    UrlFetchApp: { fetch: (u) => { hits.push(String(u)); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ rows: apiRows }) }; } },
    Utilities: { sleep() {} },
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + "\n;this.__syncNews = syncNews; this.__sortNewestFirst = sortNewestFirst; this.__checkStatus = checkStatus;", ctx);
  return { ctx, sheet, hits };
}

const news = (t, title) => ({
  outlet: "ข่าวสด", title, link: "https://x.test/" + encodeURIComponent(title),
  date: t, publishedAt: new Date(t.replace(" ", "T") + "+07:00").toISOString(), topic: "PM2.5",
});

console.log("\n[1] ชีตที่เรียงใหม่→เก่าอยู่แล้ว — ของใหม่ต้องขึ้นไปอยู่บนสุด");
{
  const existing = [
    ["ข่าวสด", "ของเก่า ก", "https://x.test/a", "2026-08-12 15:35", "PM2.5"],
    ["ข่าวสด", "ของเก่า ข", "https://x.test/b", "2026-08-11 16:07", "PM2.5"],
  ];
  const { ctx, sheet } = run(existing, [news("2026-08-13 09:00", "ใหม่เช้า"), news("2026-08-13 18:00", "ใหม่เย็น")]);
  ctx.__syncNews();
  const dates = sheet._grid.slice(1).map((r) => r[3]);
  ok("แถวบนสุดคือข่าวใหม่ที่สุด", dates[0] === "2026-08-13 18:00", JSON.stringify(dates));
  ok("เรียงใหม่→เก่าทั้งชีต", JSON.stringify(dates) === JSON.stringify([
    "2026-08-13 18:00", "2026-08-13 09:00", "2026-08-12 15:35", "2026-08-11 16:07"]), JSON.stringify(dates));
  ok("หัวตารางยังอยู่แถว 1", sheet._grid[0][0] === "สำนักข่าว");
  ok("ไม่มีแถวว่างค้าง", sheet._grid.every((r) => r[0] !== ""), JSON.stringify(sheet._grid));
}

console.log("\n[2] กันซ้ำยังทำงานเหมือนเดิม");
{
  const existing = [["ข่าวสด", "ของเก่า ก", "https://x.test/a", "2026-08-12 15:35", "PM2.5"]];
  const dup = { outlet: "ข่าวสด", title: "ของเก่า ก", link: "https://x.test/a?utm_source=z", date: "2026-08-12 15:35",
                publishedAt: "2026-08-12T08:35:00.000Z", topic: "PM2.5" };
  const { ctx, sheet } = run(existing, [dup, news("2026-08-13 09:00", "ของใหม่")]);
  ctx.__syncNews();
  ok("ข่าวเดิม (ลิงก์พ่วง utm) ไม่ถูกเขียนซ้ำ", sheet._grid.length === 3, JSON.stringify(sheet._grid.map((r) => r[1])));
  ok("ของใหม่ยังเข้า และอยู่บนสุด", sheet._grid[1][1] === "ของใหม่", JSON.stringify(sheet._grid[1]));
}

console.log("\n[3] ไม่มีข่าวใหม่ → ห้ามแตะชีตเลย");
{
  const existing = [["ข่าวสด", "ของเก่า ก", "https://x.test/a", "2026-08-12 15:35", "PM2.5"]];
  const { ctx, sheet } = run(existing, []);
  ctx.__syncNews();
  ok("จำนวนแถวเท่าเดิม", sheet._grid.length === 2, String(sheet._grid.length));
}

console.log("\n[4] sortNewestFirst() — ซ่อมชีตที่ของเก่ายังปนกันอยู่");
{
  const existing = [
    ["ข่าวสด", "บนสุดเก่า", "https://x.test/a", "2026-08-12 15:35", "PM2.5"],
    ["ข่าวสด", "กลาง", "https://x.test/b", "2026-08-11 16:07", "PM2.5"],
    ["ข่าวสด", "ก้นชีตแต่ใหม่สุด", "https://x.test/c", "2026-08-13 20:00", "PM2.5"],
  ];
  const { ctx, sheet } = run(existing, []);
  ctx.__sortNewestFirst();
  const titles = sheet._grid.slice(1).map((r) => r[1]);
  ok("ของใหม่ที่ตกอยู่ก้นชีตถูกดึงขึ้นบน", titles[0] === "ก้นชีตแต่ใหม่สุด", JSON.stringify(titles));
  ok("หัวตารางไม่ถูกเรียงไปด้วย", sheet._grid[0][3] === "วันที่", JSON.stringify(sheet._grid[0]));
}

console.log("\n[5] ตัวตั้งเวลาของชีตทำหน้าที่ cron ให้คลังข่าวด้วย");
{
  // ⚠️ คลังข่าวโตเฉพาะตอนมีคนเปิดแดชบอร์ด (Pages ตั้ง cron ไม่ได้)
  // ถ้าไม่แตะ /api/trend/feeds ก่อน วันที่ไม่มีใครเปิดหน้าเว็บจะไม่มีข่าวเก็บเลย
  const { ctx, hits } = run([], [news("2026-08-13 09:00", "ก")]);
  ctx.__syncNews();
  ok("แตะ /api/trend/feeds ก่อน", hits.some((u) => u.includes("/api/trend/feeds")), JSON.stringify(hits));
  ok("แล้วค่อยดึงคลังข่าว", hits.findIndex((u) => u.includes("/archive")) > hits.findIndex((u) => u.includes("/feeds")), JSON.stringify(hits));
}

console.log("\n[6] ด่านกันข้อมูลผิดยังอยู่ — แถวไม่มีหมวด ต้องหยุดและฟ้อง");
{
  const bad = { outlet: "ข่าวสด", title: "ไม่มีหมวด", link: "https://x.test/z", date: "2026-08-13 09:00",
                publishedAt: "2026-08-13T02:00:00.000Z", topic: "" };
  const { ctx, sheet } = run([], [bad]);
  let threw = false;
  try { ctx.__syncNews(); } catch { threw = true; }
  ok("โยน error", threw);
  ok("ไม่เขียนอะไรลงชีตเลย", sheet._grid.length === 1, String(sheet._grid.length));
}

console.log("\n[7] checkStatus() — ต้องบอกได้ว่าติดฝั่งชีตหรือฝั่งคลัง และห้ามแตะชีต");
{
  // ชีตเรียงถูก (ใหม่อยู่บน) แต่คลังมีของใหม่ที่ชีตยังไม่มี → ต้องชี้ไปที่ syncNews
  const existing = [["ข่าวสด", "เก่า", "https://x.test/a", "2026-08-12 15:35", "PM2.5"]];
  const { ctx, sheet } = run(existing, [news("2026-08-13 09:00", "ของใหม่")]);
  const said = [];
  ctx.console = { log: (m) => said.push(String(m)) };
  ctx.__checkStatus();
  const log = said.join("\n");
  ok("ไม่แตะชีตเลย", sheet._grid.length === 2, String(sheet._grid.length));
  ok("บอกวันที่ใหม่สุดในชีต", log.includes("2026-08-12 15:35"), log);
  ok("บอกว่ามีของใหม่กี่ใบ", /ที่ยังไม่มีในชีต: 1 ใบ/.test(log), log);
  ok("ชี้ว่าให้ไปกด syncNews", log.includes("syncNews"), log);
}
{
  // ชีตยังไม่ได้เรียง (ของใหม่ตกก้นชีต) → ต้องชี้ไปที่ sortNewestFirst
  const existing = [
    ["ข่าวสด", "บนสุดเก่า", "https://x.test/a", "2026-08-12 15:35", "PM2.5"],
    ["ข่าวสด", "ก้นชีตแต่ใหม่สุด", "https://x.test/c", "2026-08-13 20:00", "PM2.5"],
  ];
  const { ctx } = run(existing, []);
  const said = [];
  ctx.console = { log: (m) => said.push(String(m)) };
  ctx.__checkStatus();
  const log = said.join("\n");
  ok("จับได้ว่าของใหม่ไม่ได้อยู่บนสุด", log.includes("sortNewestFirst"), log);
}
{
  // คลังว่าง → ต้องชี้ว่าปัญหาอยู่ต้นทาง ไม่ใช่ชีต
  const { ctx } = run([["ข่าวสด", "เก่า", "https://x.test/a", "2026-08-12 15:35", "PM2.5"]], []);
  const said = [];
  ctx.console = { log: (m) => said.push(String(m)) };
  ctx.__checkStatus();
  ok("บอกว่าคลังไม่มีของใหม่", /ปัญหาอยู่ฝั่งคลัง|คลังข่าวว่างเปล่า/.test(said.join("\n")), said.join("\n"));
}

console.log("\n[8] คอลัมน์วันที่เป็น Date object (ของจริงเป็นแบบนี้) ห้ามเทียบแบบข้อความ");
{
  // ⚠️ เคสจริงที่เจอ 13 ส.ค. 2026: ชีตเก็บเป็น Date · String(Date) = "Wed Aug 12..." / "Thu Aug 13..."
  // เรียงแบบตัวอักษรแล้ว "Wed" > "Thu" → รายงานผิดว่าเรียงถูกแล้ว ทั้งที่ของใหม่อยู่ก้นชีต
  const d = (s2) => new Date(s2.replace(" ", "T") + "+07:00");
  const existing = [
    ["ข่าวสด", "บนสุด", "https://x.test/a", d("2026-08-12 15:35"), "PM2.5"],
    ["ข่าวสด", "ก้นชีตแต่ใหม่สุด", "https://x.test/c", d("2026-08-13 06:22"), "PM2.5"],
  ];
  const { ctx, sheet } = run(existing, []);
  const said = [];
  ctx.console = { log: (m) => said.push(String(m)) };
  ctx.__checkStatus();
  const log = said.join("\n");
  ok("รู้ว่าใหม่สุดคือ 13 ส.ค. ไม่ใช่ 12", log.includes("วันที่ใหม่สุดที่มีในชีต: 2026-08-13 06:22"), log);
  ok("ชี้ว่าต้องเรียงใหม่", log.includes("sortNewestFirst"), log);

  ctx.__sortNewestFirst();
  ok("เรียงแล้วของใหม่ขึ้นบนสุด", sheet._grid[1][1] === "ก้นชีตแต่ใหม่สุด", JSON.stringify(sheet._grid.map((r) => r[1])));
}
{
  // ปนกันทั้ง Date และข้อความ ก็ต้องเรียงถูก
  const d = (s2) => new Date(s2.replace(" ", "T") + "+07:00");
  const existing = [
    ["ข่าวสด", "เก่าเป็น Date", "https://x.test/a", d("2026-08-10 10:00"), "PM2.5"],
    ["ข่าวสด", "ใหม่เป็นข้อความ", "https://x.test/b", "2026-08-13 06:22", "PM2.5"],
    ["ข่าวสด", "กลางเป็น Date", "https://x.test/c", d("2026-08-12 15:35"), "PM2.5"],
  ];
  const { ctx, sheet } = run(existing, []);
  ctx.__sortNewestFirst();
  ok("ปน Date กับข้อความก็เรียงถูก",
     JSON.stringify(sheet._grid.slice(1).map((r) => r[1])) ===
     JSON.stringify(["ใหม่เป็นข้อความ", "กลางเป็น Date", "เก่าเป็น Date"]),
     JSON.stringify(sheet._grid.slice(1).map((r) => r[1])));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
