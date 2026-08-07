// flags.js — "ไม่เกี่ยวข้อง" (flag → ซ่อน → แนะนำ exclusion) ใช้ร่วมกัน IR + PR
// เก็บใน localStorage (ต่อเบราว์เซอร์) — ไม่มี Google API เทรน alert โดยตรง จึงช่วย user
// สร้าง -site:/-keyword ที่ "ใช้ได้จริง" ไปแปะใน Google Alert เอง
(function () {
  "use strict";
  const LS_HIDDEN = "flgHidden.v1"; // { [link]: 1 }
  const LS_RECS = "flgRecs.v1"; // [{ link, title, source, label, host, ts }]
  const LS_KW = "flgKw.v1"; // { [source]: [term, ...] } — คำที่กำลังจะเพิ่มใน Alert
  const LS_DISM = "flgDism.v1"; // [link, ...] — ลบออกจากรายการแล้ว แต่ยังซ่อนข่าวไว้
  const LS_CAT = "flgCat.v1"; // { link: catKey } — ผู้ใช้จัดหมวดข่าวเอง (override หมวดจาก AI)
  const THRESH = 3; // host/คำ ซ้ำถึงเกณฑ์นี้ → แนะนำตัด (จุดแดง)
  const MIN_LIST = 2; // แสดงในรายการเมื่อซ้ำ ≥ นี้

  const STOP = new Set([
    "และ","ที่","ใน","การ","ของ","เป็น","จาก","ให้","ไม่","มี","ได้","กับ","ก็","นี้","แต่","จะ","ว่า","ๆ","คน","วัน",
    "a","an","the","to","of","in","and","for","on","at","by","is","are","with","as","from","new",
  ]);

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s = "") =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // ตัด marker ไฮไลต์ (จาก <b> ของ Google Alert) ออก — ใช้ตอนเก็บ record / โชว์ใน panel
  const MARK_RE = new RegExp("[" + String.fromCharCode(1, 2) + "]", "g");
  const stripMarks = (s) => String(s == null ? "" : s).replace(/\[\[\/?hl\]\]/g, "").replace(MARK_RE, "");
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  let hidden = {};
  let records = [];
  let dismissed = [];
  let kwStore = {};
  let catStore = {}; // { link: catKey } override หมวดโดยผู้ใช้
  let catList = []; // [{ key, label }] หมวดที่เลือกได้ (ส่งมาจาก app.js ตอน init)
  let keywordsBySource = {}; // { source: [keyword, ...] } รายการคำที่ตั้งไว้ใน Alert (แกะจาก query)

  // โหมดหน้าตา — ตัวเดียวกันนี้ใช้ได้ทั้งบนแดชบอร์ดและบนหน้า admin
  //   "fab"   = ปุ่มลอยมุมขวาล่างทั้ง 2 ปุ่ม (ของเดิม)
  //   "kw"    = เหลือแต่ ➕ เพิ่ม keyword · ไม่มี 🚩 คำแนะนำตัดข่าว  ← แดชบอร์ดใช้อันนี้
  //   "none"  = ไม่มีปุ่มลอยเลย · ปุ่ม ⚑ / 🗂 บนการ์ดยังใช้ได้ตามปกติ
  //   "admin" = กาง 2 กล่องไว้ในหน้าเลย ไม่มีปุ่มลอย ไม่มีฉากดำ ปิดไม่ได้ ← /admin/ ใช้อันนี้
  let UI = "fab";
  let mountCut = null, mountKw = null; // element ที่จะเอากล่องไปวางในโหมด admin
  // หน้า admin ไม่มี .panel ของแดชบอร์ดให้อ่านชื่อคอลัมน์ จึงส่งรายชื่อมาเองได้
  let alertsOverride = []; // [{ source, label }]

  // แกะ Google Alert query → คำ ๆ (ตัด OR / "" / () / -exclude ออก) + ตัดซ้ำ
  function kwFromQuery(q) {
    const seen = new Set(), out = [];
    const push = (w) => { const k = w.toLowerCase(); if (w && !seen.has(k)) { seen.add(k); out.push(w); } };
    (Array.isArray(q) ? q : [q]).forEach((raw) => {
      if (!raw) return;
      String(raw).replace(/-"[^"]*"/g, " ").replace(/(^|\s)-\S+/g, " ") // ตัด -exclude
        .split(/\s+OR\s+/i).forEach((s) => push(s.replace(/["()]/g, "").trim()));
    });
    return out;
  }
  let onChange = () => {};

  // แยกที่เก็บต่อหน้า (IR ≠ PR) แม้อยู่โดเมนเดียวกัน — กันข้อมูล flag ปนกัน
  let SCOPE = "root";
  const key = (base) => base + ":" + SCOPE;
  function deriveScope() {
    const p = (location.pathname || "").toLowerCase();
    if (p.includes("/ir")) return "ir";
    if (p.includes("/trend")) return "pr";
    return "root";
  }
  const scopeName = () => (SCOPE === "ir" ? "IR" : SCOPE === "pr" ? "PR" : "");

  // ประกอบ terms → OR string (ครอบ "..." อัตโนมัติถ้ามีเว้นวรรค)
  function buildKw(terms) {
    return (terms || []).map((t) => (/\s/.test(t) ? `"${t}"` : t)).join(" OR ");
  }

  // ---------- server sync (Cloudflare KV) — ถ้า bind แล้วจะ sync ข้ามเครื่อง ----------
  const API = "/api/flags";
  let serverOn = false; // เป็น true เมื่อ /api/flags ตอบว่า configured (bind KV แล้ว)
  const apiUrl = () => API + "?scope=" + encodeURIComponent(SCOPE);
  function rebuildHidden() {
    hidden = {};
    records.forEach((r) => { if (r.link) hidden[r.link] = 1; });
    dismissed.forEach((l) => { if (l) hidden[l] = 1; }); // ลบจากรายการแล้วแต่ยังต้องซ่อน
  }
  function adoptServer(d) {
    serverOn = true;
    records = Array.isArray(d.records) ? d.records : [];
    dismissed = Array.isArray(d.dismissed) ? d.dismissed : [];
    kwStore = d.kw && typeof d.kw === "object" ? d.kw : {};
    catStore = d.cats && typeof d.cats === "object" ? d.cats : {};
    rebuildHidden();
    save(key(LS_RECS), records);
    save(key(LS_DISM), dismissed);
    save(key(LS_KW), kwStore);
    save(key(LS_CAT), catStore);
    save(key(LS_HIDDEN), hidden);
    onChange();
    refresh();
  }
  async function syncPull() {
    try {
      const d = await (await fetch(apiUrl(), { cache: "no-store" })).json();
      if (d && d.configured) adoptServer(d);
      else serverOn = false;
    } catch { serverOn = false; }
  }
  async function pushOp(op) {
    if (!serverOn) return; // ยังไม่ได้ bind KV → อยู่ local อย่างเดียว
    try {
      const d = await (await fetch(apiUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(op),
      })).json();
      if (d && d.configured) adoptServer(d);
    } catch { /* ออฟไลน์ → คงค่า local ไว้ รอ pull รอบหน้า */ }
  }

  function host(link) {
    try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return ""; }
  }
  function words(title) {
    return (title || "")
      .toLowerCase()
      .split(/[\s|\-–—:,.\/()"'“”?!*]+/)
      .filter((w) => w.length >= 2 && !STOP.has(w) && /[a-z฀-๿]/.test(w));
  }

  // ---------- analysis ต่อคอลัมน์ ----------
  function analyze(source) {
    const rs = records.filter((r) => r.source === source);
    const hc = {}, wc = {};
    rs.forEach((r) => {
      if (r.host) hc[r.host] = (hc[r.host] || 0) + 1;
      const seen = new Set();
      words(r.title).forEach((w) => { if (!seen.has(w)) { seen.add(w); wc[w] = (wc[w] || 0) + 1; } });
    });
    const byHost = Object.entries(hc).map(([k, c]) => ({ k, c })).filter((x) => x.c >= MIN_LIST).sort((a, b) => b.c - a.c);
    const byWord = Object.entries(wc).map(([k, c]) => ({ k, c })).filter((x) => x.c >= MIN_LIST).sort((a, b) => b.c - a.c).slice(0, 12);
    // auto = เฉพาะ -site: ของเว็บที่ซ้ำถึงเกณฑ์ (ปลอดภัย ไม่ไปตัดแบรนด์ที่ติดตาม)
    // คำ (byWord) เป็น "เติมเอง" เท่านั้น เพราะอาจเผลอตัดคำสำคัญ เช่น -cp บน alert CP
    const auto = byHost.filter((x) => x.c >= THRESH).map((x) => `-site:${x.k}`).join(" ");
    return { count: rs.length, byHost, byWord, auto, ready: auto.length > 0, items: rs };
  }
  function totalReady() {
    return sources().some((s) => analyze(s).ready);
  }
  function sources() {
    return [...new Set(records.map((r) => r.source))];
  }
  function alertSources() {
    const fromDom = $$(".panel[data-source]").map((p) => p.dataset.source).filter((s) => s.startsWith("alert"));
    return fromDom.length ? fromDom : alertsOverride.map((a) => a.source);
  }
  function labelOf(source) {
    const p = $(`.panel[data-source="${source}"] .ptitle`);
    if (p) return p.textContent.trim();
    const o = alertsOverride.find((a) => a.source === source);
    return o ? o.label : source;
  }

  // ---------- flag / undo ----------
  let lastFlag = null;
  function flag(btn) {
    const link = btn.dataset.link;
    if (!link || hidden[link]) return;
    const rec = {
      link,
      title: btn.dataset.title || "",
      source: btn.dataset.source || "",
      label: btn.dataset.label || "",
      host: host(link),
      ts: Date.now(),
    };
    hidden[link] = 1;
    records.push(rec);
    save(key(LS_HIDDEN), hidden);
    save(key(LS_RECS), records);
    lastFlag = rec;
    toast(`ซ่อนแล้ว ✓ · flag คอลัมน์นี้ ${analyze(rec.source).count} ใบ`, true);
    onChange();
    refresh();
    pushOp({ op: "flag", rec });
  }
  function undoLast() {
    if (!lastFlag) return;
    const link = lastFlag.link;
    delete hidden[link];
    records = records.filter((r) => !(r.link === link && r.ts === lastFlag.ts));
    save(key(LS_HIDDEN), hidden);
    save(key(LS_RECS), records);
    lastFlag = null;
    hideToast();
    onChange();
    refresh();
    pushOp({ op: "unflag", link });
  }
  function restoreItem(link) {
    delete hidden[link];
    records = records.filter((r) => r.link !== link);
    dismissed = dismissed.filter((l) => l !== link);
    save(key(LS_HIDDEN), hidden);
    save(key(LS_RECS), records);
    save(key(LS_DISM), dismissed);
    onChange();
    refresh(); // re-render panel ถ้าเปิดอยู่
    pushOp({ op: "unflag", link });
  }
  // ลบออกจากรายการคำแนะนำ แต่ยังซ่อนข่าวไว้ (ไม่เอากลับเข้า feed)
  function dismissItem(link) {
    records = records.filter((r) => r.link !== link);
    if (!dismissed.includes(link)) dismissed.push(link);
    if (dismissed.length > 3000) dismissed = dismissed.slice(-3000);
    hidden[link] = 1; // คงการซ่อนไว้
    save(key(LS_RECS), records);
    save(key(LS_DISM), dismissed);
    save(key(LS_HIDDEN), hidden);
    onChange();
    refresh();
    pushOp({ op: "dismiss", link });
  }

  // ---------- จัดหมวดเอง (override) ----------
  function setCat(link, cat, title) {
    if (!link) return;
    if (cat) catStore[link] = cat; else delete catStore[link];
    save(key(LS_CAT), catStore);
    onChange(); // re-render การ์ด → ย้ายหมวดทันที
    pushOp({ op: "setCat", link, cat: cat || "", title: title || "" });
  }
  function getCat(link) { return (link && catStore[link]) || ""; }
  function clearSource(source) {
    const gone = records.filter((r) => r.source === source);
    gone.forEach((r) => delete hidden[r.link]);
    records = records.filter((r) => r.source !== source);
    save(key(LS_HIDDEN), hidden);
    save(key(LS_RECS), records);
    onChange();
    refresh();
    openPanel(); // rerender panel
    pushOp({ op: "clearSource", source });
  }

  // ---------- toast ----------
  let toastEl, toastTimer;
  function toast(msg, undo) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "flg-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = `<span>${esc(msg)}</span>` + (undo ? `<button type="button" data-undo>↩ เลิกทำ</button>` : "");
    toastEl.style.display = "flex";
    $("[data-undo]", toastEl)?.addEventListener("click", undoLast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  }
  function hideToast() { if (toastEl) toastEl.style.display = "none"; }

  // ---------- FAB + panel ----------
  let fab, kwFab, fabWrap, mask, panel, kwPanel, catPicker;
  let uiReady = false;
  const isAdmin = () => UI === "admin";
  function closeAll() { closePanel(); closeKw(); closeCat(); }
  function ensureUi() {
    if (uiReady) return;
    uiReady = true;

    if (UI === "fab" || UI === "kw") {
      fabWrap = document.createElement("div");
      fabWrap.className = "flg-fabwrap";
      document.body.appendChild(fabWrap);

      kwFab = document.createElement("button");
      kwFab.type = "button";
      kwFab.className = "flg-fab kw";
      kwFab.innerHTML = '➕<span class="flg-fab-label"> เพิ่ม keyword</span>';
      kwFab.addEventListener("click", () => openKw());
      fabWrap.appendChild(kwFab);
    }
    if (UI === "fab") {
      fab = document.createElement("button");
      fab.className = "flg-fab";
      fab.type = "button";
      fab.addEventListener("click", () => openPanel());
      fabWrap.appendChild(fab);
    }

    // ฉากดำมีไว้ให้กดปิดกล่องลอย — โหมด admin กางไว้ในหน้าอยู่แล้ว ไม่ต้องมี
    if (!isAdmin()) {
      mask = document.createElement("div");
      mask.className = "flg-mask";
      mask.addEventListener("click", closeAll);
      document.body.appendChild(mask);
    }

    panel = document.createElement("div");
    panel.className = "flg-panel" + (isAdmin() ? " flg-inline" : "");
    (isAdmin() && mountCut ? mountCut : document.body).appendChild(panel);

    // โหมด admin: สร้างกล่อง ➕ เพิ่ม keyword เฉพาะเมื่อมีที่ให้วางจริง
    // (หน้า admin ตอนนี้ไม่มีกล่องนี้แล้ว — ➕ อยู่บนแดชบอร์ดที่เดียว)
    if (!isAdmin() || mountKw) {
      kwPanel = document.createElement("div");
      kwPanel.className = "flg-panel" + (isAdmin() ? " flg-inline" : "");
      (isAdmin() && mountKw ? mountKw : document.body).appendChild(kwPanel);
    }

    catPicker = document.createElement("div");
    catPicker.className = "flg-catpick";
    document.body.appendChild(catPicker);

    if (!isAdmin()) document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(); });
  }

  // ---------- ตัวเลือกจัดหมวดข่าว (popup แบบ flag) ----------
  function openCatPicker(link, title, source) {
    ensureUi();
    if (!catList.length) return;
    const cur = getCat(link);
    catPicker.innerHTML =
      `<div class="flg-head"><b>🗂 จัดหมวดข่าวนี้</b><button type="button" class="flg-x" data-catclose>✕</button></div>
       <div class="flg-cattt">${esc((title || "").slice(0, 90))}</div>
       <div class="flg-catopts">
         <button type="button" class="flg-catopt${cur ? "" : " on"}" data-setcat="">↩ อัตโนมัติ (AI/keyword)</button>` +
      catList.map((c) => `<button type="button" class="flg-catopt${cur === c.key ? " on" : ""}" data-setcat="${esc(c.key)}">${esc(c.label)}</button>`).join("") +
      `<button type="button" class="flg-catopt${cur === "other" ? " on" : ""}" data-setcat="other">🗃 ทั่วไป (ไม่เข้าหมวด)</button>
       </div>`;
    catPicker.dataset.link = link;
    catPicker.dataset.title = title || "";
    catPicker.classList.add("open");
    if (mask) mask.style.display = "block";
    catPicker.style.display = "block";
    $("[data-catclose]", catPicker)?.addEventListener("click", closeCat);
    $$("[data-setcat]", catPicker).forEach((b) =>
      b.addEventListener("click", () => {
        setCat(catPicker.dataset.link, b.dataset.setcat, catPicker.dataset.title);
        closeCat();
      })
    );
  }
  function closeCat() {
    if (!catPicker) return;
    catPicker.classList.remove("open");
    catPicker.style.display = "none";
    if (mask && (!panel || !panel.classList.contains("open")) && (!kwPanel || !kwPanel.classList.contains("open")))
      mask.style.display = "none";
  }

  // ---------- ปุ่ม "ดู keyword" ในหัวคอลัมน์ ปศุสัตว์ (alert2) เท่านั้น ----------
  function injectKwButtons() {
    $$(".panel").forEach((p) => {
      const s = p.dataset.source || "";
      if (s !== "alert2") return; // เฉพาะ alert 2
      const phead = $(".phead", p);
      if (!phead || $(".flg-view-btn", phead)) return;
      const vbtn = document.createElement("button");
      vbtn.type = "button";
      vbtn.className = "flg-view-btn";
      vbtn.textContent = "🔤 ดู keyword";
      vbtn.title = "ดูคำที่ Google กำลัง match ในผลตอนนี้ (แสดงเป็นคำ ๆ ไม่ใช่ query)";
      vbtn.addEventListener("click", () => showMatched(s));
      const count = $("[data-count]", phead);
      if (count) phead.insertBefore(vbtn, count); else phead.appendChild(vbtn); // วางที่ช่องว่างข้างชื่อ
    });
  }

  // แสดง "keyword ที่ track อยู่" — รายการคำที่ตั้งไว้ใน Alert (แกะจาก query แล้ว) เป็นคำ ๆ
  function showMatched(source) {
    ensureUi();
    const words = keywordsBySource[source] || [];
    catPicker.innerHTML =
      `<div class="flg-head"><b>🔤 keyword ที่ track อยู่ · ${esc(labelOf(source))}</b><button type="button" class="flg-x" data-catclose>✕</button></div>` +
      (words.length
        ? `<div class="flg-matchnote">keyword ที่ตั้งไว้ใน Alert นี้</div>
           <div class="flg-matchwrap">${words.map((w) => `<span class="flg-mchip">${esc(w)}</span>`).join("")}</div>`
        : `<div class="flg-matchnote">ยังไม่ได้ตั้งรายการ keyword สำหรับ Alert นี้</div>`);
    catPicker.classList.add("open");
    if (mask) mask.style.display = "block";
    catPicker.style.display = "block";
    $("[data-catclose]", catPicker)?.addEventListener("click", closeCat);
  }

  function openKw(source) {
    if (UI === "none") return; // แดชบอร์ดไม่มีกล่องนี้แล้ว — ย้ายไปหน้า /admin/
    ensureUi();
    if (!kwPanel) return; // หน้านี้ไม่มีกล่องนี้
    if (!isAdmin()) closePanel(); // admin กางคู่กันได้ ไม่ต้องไล่ปิดอีกกล่อง
    const alerts = alertSources();
    if (!source || !alerts.includes(source)) source = alerts[0];
    if (!source) {
      // ไม่มีคอลัมน์ Alert ให้เพิ่มคำ — บนหน้า admin ต้องบอก ไม่ใช่ปล่อยกล่องค้างของเดิมไว้
      if (isAdmin()) kwPanel.innerHTML = `<div class="flg-empty">แดชบอร์ดนี้ไม่มีคอลัมน์ Alert</div>`;
      return;
    }
    const terms = kwStore[source] || [];
    const tabs = alerts.length > 1
      ? `<div class="flg-kwtabs">${alerts.map((s) => `<button type="button" class="flg-kwtab${s === source ? " on" : ""}" data-tab="${esc(s)}">${esc(labelOf(s))}</button>`).join("")}</div>`
      : "";
    kwPanel.dataset.source = source;
    kwPanel.innerHTML = `
      <div class="flg-head"><b>➕ เพิ่ม keyword${scopeName() ? " · " + scopeName() : ""} · ${esc(labelOf(source))}${serverOn ? ' <span class="flg-sync">☁︎ sync</span>' : ""}</b><button type="button" class="flg-x" data-kwclose>✕</button></div>
      ${tabs}
      <p class="flg-note">พิมพ์คำ → ประกอบเป็น OR string → คัดลอกไป <u>ต่อท้าย</u> query ใน Google Alert แล้วกด Update (Google ไม่มี API เพิ่มให้อัตโนมัติ)</p>
      <div class="flg-kwin"><input type="text" class="flg-kwfield" placeholder="พิมพ์คำแล้วกด Enter…" autocomplete="off"><button type="button" class="flg-kwadd">เพิ่ม</button></div>
      <div class="flg-rows flg-kwchips">${terms.length ? terms.map((t, i) => `<span class="flg-kwchip">${esc(t)}<button type="button" data-rm="${i}" title="ลบ">✕</button></span>`).join("") : '<span class="flg-thin">ยังไม่มีคำ — พิมพ์ด้านบน</span>'}</div>
      <div class="flg-sub">คำค้นที่ประกอบได้ <span class="flg-hint">(แก้ได้)</span>:</div>
      <div class="flg-ex"><textarea id="flgkwta" rows="2" placeholder='เช่น "ราคาหมู" OR สุกร'>${esc(buildKw(terms))}</textarea><button type="button" class="flg-copy" data-kwcopy>📋 คัดลอก</button></div>
      <div class="flg-actions"><a href="https://www.google.com/alerts" target="_blank" rel="noopener">🔗 เปิด Google Alerts → แก้ query → Update</a><button type="button" class="flg-clear" data-kwclear>ล้างคำทั้งหมด</button></div>`;
    kwPanel.classList.add("open");
    kwPanel.style.display = "block";
    if (mask) mask.style.display = "block";

    const field = $(".flg-kwfield", kwPanel);
    const doAdd = () => {
      const v = field.value.trim();
      if (!v) return;
      const arr = kwStore[source] || (kwStore[source] = []);
      if (!arr.includes(v)) arr.push(v);
      save(key(LS_KW), kwStore);
      pushOp({ op: "setKw", source, terms: kwStore[source] });
      openKw(source);
    };
    // โหมด admin กล่องนี้กางค้างอยู่ตลอด ห้ามชิงโฟกัสเอง —
    // refresh() มองว่า "กำลังพิมพ์อยู่" แล้วเลี่ยงการวาดทับ ค่าที่ sync มาจาก KV เลยไม่ขึ้นสักที
    if (!isAdmin()) field.focus();
    $(".flg-kwadd", kwPanel).addEventListener("click", doAdd);
    field.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doAdd(); } });
    $$("[data-rm]", kwPanel).forEach((b) =>
      b.addEventListener("click", () => { kwStore[source].splice(Number(b.dataset.rm), 1); save(key(LS_KW), kwStore); pushOp({ op: "setKw", source, terms: kwStore[source] }); openKw(source); })
    );
    $$("[data-tab]", kwPanel).forEach((b) => b.addEventListener("click", () => openKw(b.dataset.tab)));
    $("[data-kwclose]", kwPanel).addEventListener("click", closeKw);
    $("[data-kwcopy]", kwPanel).addEventListener("click", () => { const ta = $("#flgkwta", kwPanel); if (ta) copy(ta.value, $("[data-kwcopy]", kwPanel)); });
    $("[data-kwclear]", kwPanel).addEventListener("click", () => { kwStore[source] = []; save(key(LS_KW), kwStore); pushOp({ op: "setKw", source, terms: [] }); openKw(source); });
  }
  function closeKw() {
    if (!kwPanel || isAdmin()) return; // admin: กางค้างไว้ตลอด ปิดไม่ได้
    kwPanel.classList.remove("open");
    kwPanel.style.display = "none";
    if (mask && panel && !panel.classList.contains("open")) mask.style.display = "none";
  }
  function refresh() {
    ensureUi();
    const total = records.length;
    if (fab) {
      fab.style.display = total > 0 ? "inline-flex" : "none";
      fab.classList.toggle("ready", totalReady());
      fab.innerHTML = `🚩<span class="flg-fab-label"> คำแนะนำตัดข่าว</span> <b>${total}</b>${totalReady() ? ' <span class="fdot"></span>' : ""}`;
    }
    if (kwFab) kwFab.style.display = alertSources().length ? "inline-flex" : "none";
    injectKwButtons();
    // live-update panel ที่เปิดอยู่ — แต่ไม่ทับ "เฉพาะตอนกำลังพิมพ์" ในช่อง input/textarea (ปุ่มที่ได้ focus ไม่นับ)
    const ae = document.activeElement;
    const typingIn = (el) => ae && el && el.contains(ae) && /^(TEXTAREA|INPUT)$/.test(ae.tagName || "");
    if (panel.classList.contains("open") && !typingIn(panel)) openPanel();
    if (kwPanel && kwPanel.classList.contains("open") && !typingIn(kwPanel))
      openKw(kwPanel.dataset.source);
  }
  function openPanel() {
    if (UI !== "fab" && UI !== "admin") return; // แดชบอร์ดไม่มีกล่องนี้แล้ว — ย้ายไปหน้า /admin/
    ensureUi();
    if (!isAdmin()) closeKw();
    const srcs = sources();
    let html = `<div class="flg-head"><b>🚩 คำแนะนำตัดข่าว${scopeName() ? " · " + scopeName() : ""}${serverOn ? ' <span class="flg-sync">☁︎ sync</span>' : ""}</b><button type="button" class="flg-x" data-close>✕</button></div>
      <p class="flg-note">flag = ซ่อนที่นี่ + สรุปคำที่ควรตัด แล้ว <u>คุณ</u> เอา exclusion ไปแปะใน Google Alert (กด Update) — Google ไม่มี API เทรนตรง วิธีนี้ได้ผลจริงสุด</p>`;

    if (!srcs.length) {
      html += `<div class="flg-empty">ยังไม่มีที่ flag — กด 🚩 บนการ์ดที่ไม่เกี่ยวข้อง</div>`;
    }
    srcs.forEach((source) => {
      const a = analyze(source);
      const taId = "flgta_" + source.replace(/[^a-z0-9]/gi, "");
      html += `<div class="flg-sec">
        <div class="flg-sec-h">${esc(labelOf(source))} <span class="flg-cnt">${a.count} ใบ</span></div>`;
      // รายการข่าวที่ flag — เห็นทันทีว่าข่าวไหน/เว็บอะไร กดตัดเว็บได้เลย (แม้ใบเดียว)
      html += `<div class="flg-sub">🗞 ข่าวที่ flag <span class="flg-hint">(＋ ตัดเว็บ · ↩ เอากลับ · 🗑 ลบออกจากรายการ)</span></div>
        <div class="flg-items">` +
        a.items.slice().reverse().map((r) => `<div class="flg-item">
          <div class="flg-item-main"><div class="flg-item-ttl">${esc(stripMarks(r.title) || "(ไม่มีหัวข้อ)")}</div>${r.host ? `<div class="flg-item-host">🌐 ${esc(r.host)}</div>` : ""}</div>
          ${r.host ? `<button type="button" class="flg-mini" data-ta="${esc(taId)}" data-add="-site:${esc(r.host)}" title="เติม -site:${esc(r.host)} ลงกล่อง">＋ ตัดเว็บ</button>` : ""}
          <button type="button" class="flg-mini ghost" data-restore="${esc(r.link)}" title="เอาข่าวนี้กลับเข้า feed">↩</button>
          <button type="button" class="flg-mini ghost" data-dismiss="${esc(r.link)}" title="ลบออกจากรายการนี้ (ยังซ่อนข่าวไว้ ไม่เอากลับ)">🗑</button>
        </div>`).join("") + `</div>`;
      if (a.byHost.length) {
        html += `<div class="flg-sub">🌐 ตามเว็บ <span class="flg-hint">(ปลอดภัย — กดเพื่อเพิ่ม)</span></div><div class="flg-rows">` +
          a.byHost.map((x) => `<button type="button" class="flg-chip-add" data-ta="${esc(taId)}" data-add="-site:${esc(x.k)}"><code>${esc(x.k)}</code><b>×${x.c}</b> +</button>`).join("") + `</div>`;
      }
      if (a.byWord.length) {
        html += `<div class="flg-sub">🔤 ตามคำ <span class="flg-hint">⚠ อย่าตัดคำที่เป็นแบรนด์ที่ติดตาม (เช่น cp) · ไทยที่ติดกันแยกไม่ได้</span></div><div class="flg-rows">` +
          a.byWord.map((x) => `<button type="button" class="flg-chip-add warn" data-ta="${esc(taId)}" data-add="-${esc(x.k)}">${esc(x.k)}<b>×${x.c}</b> +</button>`).join("") + `</div>`;
      }
      html += `<div class="flg-sub">exclusion ที่จะเอาไปแปะ <span class="flg-hint">(แก้ได้)</span>:</div>
        <div class="flg-ex"><textarea id="${esc(taId)}" rows="2" placeholder="${a.ready ? "" : "กดชิพด้านบนเพื่อสร้าง หรือพิมพ์เอง"}">${esc(a.auto)}</textarea>
          <button type="button" class="flg-copy" data-ta="${esc(taId)}">📋 คัดลอก</button></div>`;
      html += `<div class="flg-actions">
        <a href="https://www.google.com/alerts" target="_blank" rel="noopener">🔗 เปิด Google Alerts → แก้ query → Update</a>
        <button type="button" class="flg-clear" data-clear="${esc(source)}">ล้างคอลัมน์นี้</button>
      </div></div>`;
    });

    panel.innerHTML = html;
    panel.classList.add("open");
    if (mask) mask.style.display = "block";
    panel.style.display = "block";

    $("[data-close]", panel)?.addEventListener("click", closePanel);
    $$("[data-add]", panel).forEach((b) =>
      b.addEventListener("click", () => {
        const ta = panel.querySelector("#" + b.dataset.ta);
        if (!ta) return;
        const cur = ta.value.trim().split(/\s+/).filter(Boolean);
        if (!cur.includes(b.dataset.add)) cur.push(b.dataset.add);
        ta.value = cur.join(" ");
        b.classList.add("added");
      })
    );
    $$("[data-restore]", panel).forEach((b) => b.addEventListener("click", () => restoreItem(b.dataset.restore)));
    $$("[data-dismiss]", panel).forEach((b) => b.addEventListener("click", () => dismissItem(b.dataset.dismiss)));
    $$(".flg-copy", panel).forEach((b) =>
      b.addEventListener("click", () => {
        const ta = panel.querySelector("#" + b.dataset.ta);
        if (ta) copy(ta.value, b);
      })
    );
    $$("[data-clear]", panel).forEach((b) => b.addEventListener("click", () => clearSource(b.dataset.clear)));
  }
  function closePanel() {
    if (!panel || isAdmin()) return; // admin: กางค้างไว้ตลอด ปิดไม่ได้
    panel.classList.remove("open");
    panel.style.display = "none";
    if (mask && kwPanel && !kwPanel.classList.contains("open")) mask.style.display = "none";
  }
  function copy(text, btn) {
    const done = () => { const o = btn.textContent; btn.textContent = "✓ คัดลอกแล้ว"; setTimeout(() => (btn.textContent = o), 1500); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const t = document.createElement("textarea");
    t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand("copy"); done(); } catch {}
    t.remove();
  }

  // ---------- styles (ฝังในตัว) ----------
  function injectCss() {
    const css = `
    .card{position:relative}
    .flag-btn{position:absolute;top:6px;right:6px;z-index:3;border:1px solid rgba(160,160,160,.28);background:rgba(30,30,30,.5);color:#fff;width:23px;height:23px;border-radius:6px;font-size:13px;line-height:1;cursor:pointer;opacity:0;transition:opacity .12s,background .12s;display:grid;place-items:center;padding:0}
    .card:hover .flag-btn{opacity:.8}
    .flag-btn:hover{opacity:1;background:#c0392b;border-color:#c0392b}
    @media(hover:none){.flag-btn{opacity:.45}}
    :root[data-theme="light"] .flag-btn{background:rgba(255,255,255,.8);color:#888;border-color:rgba(0,0,0,.12)}
    :root[data-theme="light"] .flag-btn:hover{background:#c0392b;color:#fff;border-color:#c0392b}
    .flag-cat-btn{position:absolute;top:6px;right:6px;z-index:3;border:1px solid rgba(160,160,160,.28);background:rgba(30,30,30,.5);color:#fff;min-width:23px;height:23px;padding:0 5px;border-radius:6px;font-size:12px;line-height:1;cursor:pointer;opacity:0;transition:opacity .12s,background .12s;display:grid;place-items:center}
    .card:hover .flag-cat-btn{opacity:.8}
    .flag-cat-btn:hover,.flag-cat-btn.on{opacity:1;background:#2a78d6;border-color:#2a78d6;color:#fff}
    @media(hover:none){.flag-cat-btn{opacity:.5}}
    :root[data-theme="light"] .flag-cat-btn{background:rgba(255,255,255,.8);color:#888;border-color:rgba(0,0,0,.12)}
    :root[data-theme="light"] .flag-cat-btn:hover,:root[data-theme="light"] .flag-cat-btn.on{background:#2a78d6;color:#fff}
    .flg-catpick{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(340px,92vw);background:#16181d;color:#eee;border:1px solid rgba(150,150,150,.22);border-radius:14px;z-index:9999;display:none;padding:16px;box-shadow:0 16px 48px rgba(0,0,0,.5);font-family:inherit;font-size:13px}
    :root[data-theme="light"] .flg-catpick{background:#fff;color:#1a1a1a;border-color:rgba(0,0,0,.12)}
    .flg-cattt{font-size:12px;opacity:.7;margin:2px 0 10px;line-height:1.4}
    .flg-catopts{display:flex;flex-direction:column;gap:7px}
    .flg-catopt{text-align:left;border:1px solid rgba(150,150,150,.3);background:rgba(150,150,150,.08);color:inherit;border-radius:9px;padding:9px 12px;font-size:13px;cursor:pointer;font-family:inherit}
    .flg-catopt:hover{border-color:#2a78d6}
    .flg-catopt.on{background:#2a78d6;color:#fff;border-color:#2a78d6}
    .card mark.hl{background:none;color:inherit;font-weight:700}
    .flg-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#1f2937;color:#fff;padding:10px 14px;border-radius:10px;font-size:13px;display:none;gap:14px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.35);z-index:10000;font-family:inherit;max-width:92vw}
    .flg-toast button{background:none;border:none;color:#7db3ff;cursor:pointer;font-size:13px;font-family:inherit;white-space:nowrap}
    .flg-fabwrap{position:fixed;right:16px;bottom:16px;z-index:9997;display:flex;flex-direction:column;gap:10px;align-items:flex-end}
    .flg-fab{border:none;background:#c0392b;color:#fff;border-radius:999px;padding:11px 16px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.3);font-family:inherit;display:none;align-items:center;gap:8px}
    .flg-fab.kw{background:#2a78d6}
    .flg-fab b{font-weight:800}
    .flg-kwtabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
    .flg-kwtab{border:1px solid rgba(150,150,150,.3);background:transparent;color:inherit;border-radius:999px;padding:4px 11px;font-size:12px;cursor:pointer;font-family:inherit}
    .flg-kwtab.on{background:#2a78d6;color:#fff;border-color:#2a78d6}
    .flg-fab .fdot,.flg-cnt .fdot{width:8px;height:8px;border-radius:50%;background:#ffd27a;display:inline-block}
    .flg-mask{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;display:none}
    .flg-panel{position:fixed;right:16px;bottom:70px;width:min(430px,94vw);max-height:74vh;overflow:auto;background:#16181d;color:#eee;border:1px solid rgba(150,150,150,.22);border-radius:14px;z-index:9999;display:none;padding:16px;box-shadow:0 16px 48px rgba(0,0,0,.45);font-family:inherit;font-size:13px;line-height:1.5}
    :root[data-theme="light"] .flg-panel{background:#fff;color:#1a1a1a;border-color:rgba(0,0,0,.12)}
    .flg-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
    .flg-head b{font-size:15px}
    .flg-sync{font-size:10px;font-weight:600;color:#3fb56a;border:1px solid rgba(63,181,106,.4);border-radius:999px;padding:1px 7px;margin-left:6px;vertical-align:middle}
    .flg-x{background:none;border:none;color:inherit;font-size:16px;cursor:pointer;opacity:.6}
    .flg-note{margin:0 0 12px;font-size:11px;opacity:.7;line-height:1.45}
    .flg-empty,.flg-thin{opacity:.6;font-size:12px;padding:6px 0}
    .flg-sec{border-top:1px solid rgba(150,150,150,.18);padding:12px 0}
    .flg-sec-h{font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:8px}
    .flg-cnt{font-weight:500;font-size:11px;opacity:.65}
    .flg-sub{font-size:11px;opacity:.7;margin:8px 0 5px}
    .flg-hint{opacity:.55}
    .flg-rows{display:flex;flex-wrap:wrap;gap:6px}
    .flg-row{background:rgba(150,150,150,.14);border-radius:7px;padding:3px 8px;font-size:12px;display:inline-flex;gap:6px;align-items:center}
    .flg-row code{font-size:11px}
    .flg-row b{color:#e8a; font-weight:700}
    .flg-chip-add{background:rgba(150,150,150,.14);border:1px solid transparent;border-radius:7px;padding:3px 8px;font-size:12px;display:inline-flex;gap:6px;align-items:center;cursor:pointer;color:inherit;font-family:inherit}
    .flg-chip-add:hover{border-color:#2a78d6}
    .flg-chip-add.warn:hover{border-color:#c0392b}
    .flg-chip-add.added{opacity:.4}
    .flg-chip-add code{font-size:11px}
    .flg-chip-add b{color:#e8a;font-weight:700}
    .flg-items{display:flex;flex-direction:column;gap:6px;margin:2px 0 10px;max-height:210px;overflow:auto}
    .flg-item{display:flex;gap:8px;align-items:center;background:rgba(150,150,150,.10);border-radius:8px;padding:6px 8px}
    .flg-item-main{flex:1;min-width:0}
    .flg-item-ttl{font-size:12px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .flg-item-host{font-size:10.5px;opacity:.6;margin-top:2px}
    .flg-mini{border:1px solid rgba(150,150,150,.3);background:transparent;color:inherit;border-radius:7px;padding:4px 8px;font-size:11px;cursor:pointer;font-family:inherit;white-space:nowrap}
    .flg-mini:hover{border-color:#c0392b}
    .flg-mini.ghost{opacity:.6;padding:4px 7px}
    .flg-mini.ghost:hover{opacity:1;border-color:#2a78d6}
    .flg-ex{display:flex;gap:8px;align-items:stretch;margin-top:4px}
    .flg-ex textarea{flex:1;resize:none;background:rgba(150,150,150,.12);color:inherit;border:1px solid rgba(150,150,150,.25);border-radius:8px;padding:8px;font-family:ui-monospace,Menlo,monospace;font-size:12px}
    .flg-copy{border:none;background:#2a78d6;color:#fff;border-radius:8px;padding:0 12px;cursor:pointer;font-size:12px;font-family:inherit;white-space:nowrap}
    .flg-actions{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:12px}
    .flg-actions a{color:#6fb0ff;text-decoration:none}
    .flg-clear{background:none;border:1px solid rgba(150,150,150,.3);color:inherit;border-radius:7px;padding:3px 9px;cursor:pointer;font-size:11px;font-family:inherit;opacity:.8}
    .flg-kw-btn{border:1px solid rgba(150,150,150,.35);background:transparent;color:inherit;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap}
    .flg-kw-btn:hover{border-color:#2a78d6}
    .flg-view-btn{margin-left:auto;margin-right:7px;border:1px solid rgba(150,150,150,.35);background:transparent;color:inherit;border-radius:7px;padding:3px 8px;font-size:11px;cursor:pointer;font-family:inherit;white-space:nowrap;line-height:1.5}
    .flg-view-btn:hover{border-color:#2a78d6;color:#2a78d6}
    .flg-matchnote{font-size:12px;opacity:.75;margin:2px 0 10px;line-height:1.4}
    .flg-matchwrap{display:flex;flex-wrap:wrap;gap:6px;max-height:52vh;overflow:auto}
    .flg-mchip{background:rgba(42,120,214,.15);border:1px solid rgba(42,120,214,.35);border-radius:20px;padding:4px 11px;font-size:12px;display:inline-flex;align-items:center}
    .flg-kwin{display:flex;gap:8px;margin:2px 0 10px}
    .flg-kwfield{flex:1;min-width:0;background:rgba(150,150,150,.12);color:inherit;border:1px solid rgba(150,150,150,.25);border-radius:8px;padding:9px;font-family:inherit;font-size:13px}
    .flg-kwadd{border:none;background:#2a78d6;color:#fff;border-radius:8px;padding:0 15px;cursor:pointer;font-family:inherit;font-size:13px;white-space:nowrap}
    .flg-kwchips{margin-bottom:4px}
    .flg-kwchip{background:rgba(42,120,214,.18);border:1px solid rgba(42,120,214,.4);border-radius:7px;padding:3px 6px 3px 9px;font-size:12px;display:inline-flex;gap:7px;align-items:center}
    .flg-kwchip button{background:none;border:none;color:inherit;cursor:pointer;opacity:.55;font-size:11px;padding:0;line-height:1}
    .flg-kwchip button:hover{opacity:1}
    /* โหมด admin — กล่องเดียวกันนี้กางอยู่ในหน้าเลย ไม่ลอย ไม่มีปุ่มปิด */
    .flg-panel.flg-inline{position:static;width:auto;max-width:none;max-height:none;right:auto;bottom:auto;box-shadow:none;border:0;padding:0;background:transparent;display:block;overflow:visible}
    .flg-panel.flg-inline .flg-x{display:none}
    .flg-panel.flg-inline .flg-items{max-height:52vh}
    @media (max-width:640px){
      .flg-kw-btn{display:none}
      .flg-fab{padding:8px 13px;font-size:12px}
      .flg-fab b{font-size:12px}
      .flg-fabwrap{right:12px;bottom:12px;gap:8px}
    }
    `;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------- public API ----------
  const Flags = {
    init(opts = {}) {
      onChange = opts.onChange || (() => {});
      UI = opts.ui || "fab";
      mountCut = opts.mountCut || null;
      mountKw = opts.mountKw || null;
      alertsOverride = Array.isArray(opts.alerts) ? opts.alerts : [];
      SCOPE = opts.scope || deriveScope();
      records = load(key(LS_RECS), []);
      dismissed = load(key(LS_DISM), []);
      kwStore = load(key(LS_KW), {});
      catStore = load(key(LS_CAT), {});
      catList = Array.isArray(opts.cats) ? opts.cats : [];
      rebuildHidden(); // สร้าง hidden จาก records + dismissed ให้ตรงกันเสมอ
      injectCss();
      ensureUi();
      injectKwButtons();
      document.addEventListener("click", (e) => {
        const b = e.target.closest(".flag-btn");
        if (b) { e.preventDefault(); e.stopPropagation(); flag(b); return; }
        const cb = e.target.closest(".flag-cat-btn");
        if (cb) { e.preventDefault(); e.stopPropagation(); openCatPicker(cb.dataset.link, cb.dataset.title, cb.dataset.source); }
      });
      refresh();
      if (isAdmin()) { openPanel(); openKw(); }
      // sync กับ server (ถ้า bind KV) — ดึงตอนเปิด, ทุก 25 วิ, และตอนกลับมาโฟกัสแท็บ
      syncPull();
      setInterval(syncPull, 25000);
      window.addEventListener("focus", syncPull);
    },
    // สลับแดชบอร์ดที่กำลังดูอยู่บนหน้า admin (PR / IR / Issue เก็บ flag คนละกอง)
    // ⚠️ ห้ามเรียก init() ซ้ำเพื่อสลับ — จะได้ listener + setInterval ซ้อนกันเพิ่มทุกครั้งที่กด
    setScope(scope, alerts) {
      SCOPE = scope || "root";
      alertsOverride = Array.isArray(alerts) ? alerts : [];
      records = load(key(LS_RECS), []);
      dismissed = load(key(LS_DISM), []);
      kwStore = load(key(LS_KW), {});
      catStore = load(key(LS_CAT), {});
      rebuildHidden();
      refresh();
      if (isAdmin()) { openPanel(); openKw(); }
      syncPull(); // ของจริงอยู่บน KV — ค่า local เป็นแค่ภาพชั่วคราวระหว่างรอ
    },
    scope() { return SCOPE; },
    isHidden(link) { return !!hidden[link]; },
    getCat,
    parseKw: kwFromQuery, // ให้ app.js แกะ query → คำ ๆ ได้ (ใช้เทียบ feed vs hardcode)
    setKeywords(map) { keywordsBySource = {}; for (const k of Object.keys(map || {})) keywordsBySource[k] = kwFromQuery(map[k]); },
    button(item, source) {
      // flag → exclusion ใช้ได้เฉพาะ Google Alert (มี query ให้แก้) — News เป็น RSS ตรง จึงไม่มีปุ่ม
      if (!source || !source.startsWith("alert")) return "";
      return `<button type="button" class="flag-btn" title="ไม่เกี่ยวข้อง — ซ่อน + เก็บเข้าคำแนะนำตัดข่าว" data-link="${esc(item.link)}" data-source="${esc(source)}" data-title="${esc(stripMarks(item.title))}" data-label="${esc(item.sourceLabel || "")}">⚑</button>`;
    },
    // ปุ่มจัดหมวดเอง — เฉพาะคอลัมน์ข่าว (มีหมวดให้เลือก)
    catButton(item, source) {
      if (!catList.length || !source || source.indexOf("news") !== 0) return "";
      const on = getCat(item.link);
      return `<button type="button" class="flag-cat-btn${on ? " on" : ""}" title="จัดหมวดข่าวนี้เอง" data-link="${esc(item.link)}" data-source="${esc(source)}" data-title="${esc(stripMarks(item.title))}">🗂</button>`;
    },
    refresh,
  };
  window.Flags = Flags;
})();
