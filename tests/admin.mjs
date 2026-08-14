// ตรวจหน้า /admin/ + ตรวจว่าปุ่มลอย 🚩/➕ หายไปจากแดชบอร์ดแล้วจริง
import { chromium } from "playwright";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log("  ✅ " + m)) : (fail++, console.log("  ❌ " + m)); };

const B = "http://127.0.0.1:8899";

// state ปลอมของ /api/flags แยกตาม scope — ให้เห็นว่าสลับแท็บแล้วข้อมูลเปลี่ยนจริง
const SERVER = {
  pr: {
    configured: true,
    records: [
      { link: "https://a.example.com/1", title: "ข่าวไม่เกี่ยว A", source: "alert2", host: "a.example.com", ts: 1 },
      { link: "https://a.example.com/2", title: "ข่าวไม่เกี่ยว B", source: "alert2", host: "a.example.com", ts: 2 },
      { link: "https://a.example.com/3", title: "ข่าวไม่เกี่ยว C", source: "alert2", host: "a.example.com", ts: 3 },
    ],
    dismissed: [], kw: { alert1: ["ราคาหมู", "สุกร"] }, cats: {},
  },
  ir: {
    configured: true,
    records: [{ link: "https://ir.example.com/9", title: "IR ไม่เกี่ยว", source: "alert1", host: "ir.example.com", ts: 9 }],
    dismissed: [], kw: {}, cats: {},
  },
  root: { configured: true, records: [], dismissed: [], kw: {}, cats: {} },
};

const EMPTY_FEEDS = {
  generatedAt: new Date().toISOString(), errors: [],
  sources: {
    news: { label: "News", items: [], feedCount: 1 },
    alert1: { label: "CP", feedCount: 1, items: [{ id: "x1", link: "https://n.example.com/a", title: "ข่าวทดสอบ", snippet: "เนื้อหา", publishedAt: new Date().toISOString(), sourceLabel: "สำนักข่าว" }] },
    alert2: { label: "จับตามอง", items: [], feedCount: 1 },
    trends: { label: "Google Trends", items: [] },
  },
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

async function newPage(ctx) {
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message)));
  // ⚠️ Playwright เลือก route ที่ "ลงทะเบียนทีหลัง" ก่อน — ตัวกว้างต้องมาก่อน ตัวเจาะจงมาทีหลัง
  await page.route("**/api/**", (route) =>
    route.request().url().includes("/feeds") ? route.fulfill({ json: EMPTY_FEEDS }) : route.fulfill({ json: { items: [] } }));
  await page.route((u) => u.pathname === "/api/flags", async (route) => {
    const req = route.request();
    const sc = new URL(req.url()).searchParams.get("scope") || "root";
    const st = SERVER[sc] || SERVER.root;
    // POST ของจริงจะ apply op แล้วคืน state ใหม่ — mock ต้องทำเหมือนกัน
    // ไม่งั้นค่าที่เพิ่งเพิ่มจะถูก state เก่าจาก server ทับกลับทันที (เข้าใจผิดว่าโค้ดพัง)
    if (req.method() === "POST") {
      const op = req.postDataJSON() || {};
      if (op.op === "setKw" && op.source) st.kw[op.source] = op.terms || [];
      if (op.op === "flag" && op.rec) st.records = [...st.records, op.rec];
      if (op.op === "unflag") st.records = st.records.filter((r) => r.link !== op.link);
      if (op.op === "clearSource") st.records = st.records.filter((r) => r.source !== op.source);
    }
    route.fulfill({ json: st });
  });
  page.errs = errs;
  return page;
}

// ---------- 1. หน้า admin ----------
console.log("\n--- /admin/ (เดสก์ท็อป) ---");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await newPage(ctx);
  await page.goto(B + "/admin/", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  ok(page.errs.length === 0, "ไม่มี JS error" + (page.errs.length ? " → " + page.errs[0] : ""));
  // เนื้อหาต้องอยู่กลางจอ — ระยะซ้าย/ขวาต้องเท่ากัน (±2px)
  const ctr = await page.evaluate(() => {
    const r = document.querySelector(".wrap").getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(window.innerWidth - r.right), w: Math.round(r.width) };
  });
  ok(Math.abs(ctr.left - ctr.right) <= 2, `เนื้อหาอยู่กลางจอ (ซ้าย ${ctr.left} · ขวา ${ctr.right})`);
  ok(ctr.left > 0, "จอกว้างแล้วไม่ยืดเต็มขอบ");

  ok(await page.locator("#admCut .flg-panel.flg-inline").count() === 1, "กล่อง 🚩 คำแนะนำตัดข่าว กางอยู่ในหน้า");
  ok(await page.locator("#admKw .flg-panel.flg-inline").count() === 1, "กล่อง keyword กางอยู่ในหน้า");
  ok(await page.locator(".flg-fabwrap").count() === 0, "ไม่มีปุ่มลอยบนหน้า admin");
  ok(await page.locator(".flg-mask").count() === 0, "ไม่มีฉากดำบนหน้า admin");
  ok(await page.locator("#admCut .flg-x, #admKw .flg-x").evaluateAll((els) =>
    els.every((e) => getComputedStyle(e).display === "none")), "ปุ่ม ✕ ถูกซ่อน (ปิดกล่องไม่ได้)");

  // ครึ่ง "ประกอบ query + คัดลอก" ต้องอยู่ที่ admin เท่านั้น ไม่มีช่องพิมพ์
  const admKw = await page.locator("#admKw").innerText();
  ok(await page.locator("#admKw .flg-kwfield").count() === 0, "admin: ไม่มีช่องพิมพ์คำ (ไปพิมพ์บนแดชบอร์ด)");
  ok(await page.locator("#admKw textarea").count() === 1, "admin: มีกล่องคำค้นที่ประกอบได้");
  ok((await page.locator("#admKw textarea").inputValue()).includes(" OR "), "admin: ประกอบเป็น OR string ให้แล้ว");
  ok(admKw.includes("คัดลอก"), "admin: มีปุ่มคัดลอก");
  ok(admKw.includes("เปิด Google Alerts"), "admin: มีลิงก์ไป Google Alerts");
  ok(admKw.includes("ล้างคำทั้งหมด"), "admin: มีปุ่มล้างคำทั้งหมด");
  ok(admKw.includes("ราคาหมู") && admKw.includes("สุกร"), "admin: เห็นคำที่เก็บไว้ของ alert1");

  const cut = await page.locator("#admCut").innerText();
  ok(cut.includes("a.example.com"), "PR: เห็นเว็บที่ flag ไว้ (a.example.com)");
  ok(cut.includes("×3"), "PR: นับจำนวนซ้ำถูก (×3)");
  ok((await page.locator("#admCut textarea").inputValue()).includes("-site:a.example.com"),
    "PR: สร้าง exclusion -site: ให้อัตโนมัติ");
  ok(cut.includes("🔔 หัวข้อที่จับตามอง"), "PR: ใช้ชื่อคอลัมน์ของแดชบอร์ด ไม่ใช่ alert2");

  // ---------- สลับ scope ----------
  await page.click('#scopes button[data-scope="ir"]');
  await page.waitForTimeout(600);
  const cutIr = await page.locator("#admCut").innerText();
  ok(cutIr.includes("ir.example.com"), "สลับไป IR: ข้อมูลเปลี่ยนตาม");
  ok(!cutIr.includes("a.example.com"), "สลับไป IR: ของ PR ไม่ค้างอยู่");
  ok(cutIr.includes("🔔 CP / ซีพี"), "สลับไป IR: ใช้ชื่อคอลัมน์ของ IR");
  ok(await page.locator('#scopes button.on').getAttribute("data-scope") === "ir", "แท็บ IR ถูกไฮไลต์");

  await page.click('#scopes button[data-scope="root"]');
  await page.waitForTimeout(600);
  ok((await page.locator("#admCut").innerText()).includes("ยังไม่มีที่ flag"), "สลับไป Issue: ไม่มีรายการ → ขึ้นข้อความว่าง");
  ok(page.errs.length === 0, "สลับ scope ไปมาแล้วยังไม่มี JS error");

  // จำ scope ล่าสุด
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  ok(await page.locator("#scopes button.on").getAttribute("data-scope") === "root", "รีโหลดแล้วกลับมาที่แดชบอร์ดเดิม");

  await ctx.close();
}

// ---------- 2. มือถือ: หน้า admin ต้องไม่ล้นแนวนอน ----------
console.log("\n--- /admin/ (มือถือ 390px) ---");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await newPage(ctx);
  await page.goto(B + "/admin/", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const m = await page.evaluate(() => ({
    sw: document.scrollingElement.scrollWidth,
    iw: window.innerWidth,
    wide: [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.className || e.tagName),
  }));
  ok(m.sw <= m.iw + 1, `ไม่มี scroll แนวนอน (${m.sw} ≤ ${m.iw})`);
  ok(m.wide.length === 0, "ไม่มีของล้นขอบขวา" + (m.wide.length ? " → " + m.wide.slice(0, 3).join(", ") : ""));
  await ctx.close();
}

// ---------- 3. แดชบอร์ด: ปุ่มลอยต้องหายไป แต่ ⚑ ยังอยู่ ----------
for (const [name, path] of [["trend", "/trend/"], ["ir", "/ir/"], ["issue", "/issue/"]]) {
  console.log(`\n--- ${name} (ปุ่มลอยต้องหายแล้ว) ---`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await newPage(ctx);
  await page.goto(B + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  ok(page.errs.length === 0, "ไม่มี JS error" + (page.errs.length ? " → " + page.errs[0] : ""));
  // 🚩 ย้ายไป /admin/ แล้ว · แต่ ➕ เพิ่ม keyword ต้องอยู่ที่เดิม (เจ้าของสั่งให้เก็บไว้)
  ok(await page.locator(".flg-fab:not(.kw)").count() === 0, "ไม่มีปุ่มลอย 🚩 คำแนะนำตัดข่าว แล้ว");
  ok(!(await page.locator("body").innerText()).includes("คำแนะนำตัดข่าว"), 'ไม่มีคำว่า "คำแนะนำตัดข่าว" บนหน้าแล้ว');
  const kwFab = page.locator(".flg-fab.kw");
  ok(await kwFab.count() === 1, "ปุ่ม ➕ เพิ่ม keyword ยังอยู่");
  ok(await kwFab.isVisible(), "ปุ่ม ➕ เพิ่ม keyword มองเห็นได้จริง");
  await kwFab.click();
  await page.waitForTimeout(400);
  ok(await page.locator(".flg-panel.open").count() === 1, "กด ➕ แล้วกล่องเพิ่ม keyword เปิดขึ้นมา");
  const kwBox = await page.locator(".flg-panel.open").innerText();
  ok(kwBox.includes("เพิ่ม keyword"), "เปิดมาเป็นกล่อง ➕ เพิ่ม keyword");
  ok(await page.locator(".flg-panel.open .flg-kwfield").count() === 1, "มีช่องพิมพ์คำ");
  // ครึ่งประกอบ query ต้องไม่อยู่บนแดชบอร์ดแล้ว — ย้ายไป /admin/
  ok(await page.locator(".flg-panel.open textarea").count() === 0, "ไม่มีกล่องคำค้นที่ประกอบได้แล้ว");
  ok(!kwBox.includes("คัดลอก"), "ไม่มีปุ่ม 📋 คัดลอก แล้ว");
  ok(!kwBox.includes("เปิด Google Alerts"), "ไม่มีลิงก์ เปิด Google Alerts แล้ว");
  ok(!kwBox.includes("ล้างคำทั้งหมด"), "ไม่มีปุ่ม ล้างคำทั้งหมด แล้ว");
  // พิมพ์เพิ่มคำยังต้องได้
  await page.fill(".flg-panel.open .flg-kwfield", "ไข่แพง");
  await page.click(".flg-panel.open .flg-kwadd");
  await page.waitForTimeout(300);
  ok((await page.locator(".flg-panel.open").innerText()).includes("ไข่แพง"), "พิมพ์คำใหม่แล้วขึ้นทันที");
  ok(await page.locator(".flg-mask").isVisible(), "มีฉากดำให้กดปิด");
  await page.click(".flg-panel.open [data-kwclose]");
  await page.waitForTimeout(250);
  ok(await page.locator(".flg-panel.open").count() === 0, "กด ✕ แล้วปิดได้");

  // ⚑ บนการ์ดต้องยังใช้ได้ — เป็นทางเดียวที่จะเก็บข่าวเข้าคำแนะนำ
  const flagBtn = page.locator('.panel[data-source="alert1"] .flag-btn').first();
  ok(await flagBtn.count() === 1, "ปุ่ม ⚑ บนการ์ด alert ยังอยู่");
  if (await flagBtn.count()) {
    await flagBtn.click({ force: true });
    await page.waitForTimeout(300);
    // ⚑ ไม่ได้แค่ซ่อนหน้านี้แล้ว — ตัดออกจากทุกแดชบอร์ด (13 ส.ค. 2026) ข้อความจึงเปลี่ยนตาม
    ok((await page.locator(".flg-toast").innerText()).includes("ตัดออกทุกแดชบอร์ด"), "กด ⚑ แล้วบอกว่าตัดทุกแดชบอร์ด");
    ok(await page.locator(".flg-panel.open").count() === 0, "กด ⚑ แล้วไม่มีกล่องเด้งขึ้นมา");
  }
  ok(page.errs.length === 0, "กด ⚑ แล้วยังไม่มี JS error");
  await ctx.close();
}

await browser.close();
console.log(`\n${fail ? "❌" : "✅"} ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
