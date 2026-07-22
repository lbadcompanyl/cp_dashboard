// flags.js — "ไม่เกี่ยวข้อง" (flag → ซ่อน → แนะนำ exclusion) ใช้ร่วมกัน IR + PR
// เก็บใน localStorage (ต่อเบราว์เซอร์) — ไม่มี Google API เทรน alert โดยตรง จึงช่วย user
// สร้าง -site:/-keyword ที่ "ใช้ได้จริง" ไปแปะใน Google Alert เอง
(function () {
  "use strict";
  const LS_HIDDEN = "flgHidden.v1"; // { [link]: 1 }
  const LS_RECS = "flgRecs.v1"; // [{ link, title, source, label, host, ts }]
  const LS_KW = "flgKw.v1"; // { [source]: [term, ...] } — คำที่กำลังจะเพิ่มใน Alert
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
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  let hidden = {};
  let records = [];
  let kwStore = {};
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
  }
  function adoptServer(d) {
    serverOn = true;
    records = Array.isArray(d.records) ? d.records : [];
    kwStore = d.kw && typeof d.kw === "object" ? d.kw : {};
    rebuildHidden();
    save(key(LS_RECS), records);
    save(key(LS_KW), kwStore);
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
    return $$(".panel[data-source]").map((p) => p.dataset.source).filter((s) => s.startsWith("alert"));
  }
  function labelOf(source) {
    const p = $(`.panel[data-source="${source}"] .ptitle`);
    return p ? p.textContent.trim() : source;
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
    save(key(LS_HIDDEN), hidden);
    save(key(LS_RECS), records);
    onChange();
    refresh(); // re-render panel ถ้าเปิดอยู่
    pushOp({ op: "unflag", link });
  }
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
  let fab, kwFab, fabWrap, mask, panel, kwPanel;
  function closeAll() { closePanel(); closeKw(); }
  function ensureUi() {
    if (fabWrap) return;
    fabWrap = document.createElement("div");
    fabWrap.className = "flg-fabwrap";
    document.body.appendChild(fabWrap);

    kwFab = document.createElement("button");
    kwFab.type = "button";
    kwFab.className = "flg-fab kw";
    kwFab.innerHTML = "➕ เพิ่มคำค้น";
    kwFab.addEventListener("click", () => openKw());
    fabWrap.appendChild(kwFab);

    fab = document.createElement("button");
    fab.className = "flg-fab";
    fab.type = "button";
    fab.addEventListener("click", () => openPanel());
    fabWrap.appendChild(fab);

    mask = document.createElement("div");
    mask.className = "flg-mask";
    mask.addEventListener("click", closeAll);
    document.body.appendChild(mask);

    panel = document.createElement("div");
    panel.className = "flg-panel";
    document.body.appendChild(panel);

    kwPanel = document.createElement("div");
    kwPanel.className = "flg-panel";
    document.body.appendChild(kwPanel);

    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(); });
  }

  // ---------- ปุ่ม "เพิ่มคำค้น" ในคอลัมน์ Alert ----------
  function injectKwButtons() {
    $$(".panel").forEach((p) => {
      const s = p.dataset.source || "";
      if (!s.startsWith("alert")) return;
      const filters = $(".filters", p);
      if (!filters || $(".flg-kw-btn", filters)) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "flg-kw-btn";
      btn.textContent = "➕ เพิ่มคำค้น";
      btn.title = "สร้างคำค้นเพิ่มสำหรับ Alert นี้ → คัดลอกไปแปะใน Google Alert";
      btn.addEventListener("click", () => openKw(s));
      filters.appendChild(btn);
    });
  }

  function openKw(source) {
    ensureUi();
    closePanel();
    const alerts = alertSources();
    if (!source) source = alerts[0];
    if (!source) return;
    const terms = kwStore[source] || [];
    const tabs = alerts.length > 1
      ? `<div class="flg-kwtabs">${alerts.map((s) => `<button type="button" class="flg-kwtab${s === source ? " on" : ""}" data-tab="${esc(s)}">${esc(labelOf(s))}</button>`).join("")}</div>`
      : "";
    kwPanel.dataset.source = source;
    kwPanel.innerHTML = `
      <div class="flg-head"><b>➕ เพิ่มคำค้น${scopeName() ? " · " + scopeName() : ""} · ${esc(labelOf(source))}${serverOn ? ' <span class="flg-sync">☁︎ sync</span>' : ""}</b><button type="button" class="flg-x" data-kwclose>✕</button></div>
      ${tabs}
      <p class="flg-note">พิมพ์คำ → ประกอบเป็น OR string → คัดลอกไป <u>ต่อท้าย</u> query ใน Google Alert แล้วกด Update (Google ไม่มี API เพิ่มให้อัตโนมัติ)</p>
      <div class="flg-kwin"><input type="text" class="flg-kwfield" placeholder="พิมพ์คำแล้วกด Enter…" autocomplete="off"><button type="button" class="flg-kwadd">เพิ่ม</button></div>
      <div class="flg-rows flg-kwchips">${terms.length ? terms.map((t, i) => `<span class="flg-kwchip">${esc(t)}<button type="button" data-rm="${i}" title="ลบ">✕</button></span>`).join("") : '<span class="flg-thin">ยังไม่มีคำ — พิมพ์ด้านบน</span>'}</div>
      <div class="flg-sub">คำค้นที่ประกอบได้ <span class="flg-hint">(แก้ได้)</span>:</div>
      <div class="flg-ex"><textarea id="flgkwta" rows="2" placeholder='เช่น "ราคาหมู" OR สุกร'>${esc(buildKw(terms))}</textarea><button type="button" class="flg-copy" data-kwcopy>📋 คัดลอก</button></div>
      <div class="flg-actions"><a href="https://www.google.com/alerts" target="_blank" rel="noopener">🔗 เปิด Google Alerts → แก้ query → Update</a><button type="button" class="flg-clear" data-kwclear>ล้างคำทั้งหมด</button></div>`;
    kwPanel.classList.add("open");
    kwPanel.style.display = "block";
    mask.style.display = "block";

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
    field.focus();
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
    if (!kwPanel) return;
    kwPanel.classList.remove("open");
    kwPanel.style.display = "none";
    if (panel && !panel.classList.contains("open")) mask.style.display = "none";
  }
  function refresh() {
    ensureUi();
    const total = records.length;
    fab.style.display = total > 0 ? "inline-flex" : "none";
    fab.classList.toggle("ready", totalReady());
    fab.innerHTML = `🚩 คำแนะนำตัดข่าว <b>${total}</b>${totalReady() ? ' <span class="fdot"></span>' : ""}`;
    kwFab.style.display = alertSources().length ? "inline-flex" : "none";
    injectKwButtons();
    // live-update panel ที่เปิดอยู่ — แต่ไม่ทับถ้ากำลังพิมพ์/แก้อยู่ในนั้น
    if (panel.classList.contains("open") && !panel.contains(document.activeElement)) openPanel();
    if (kwPanel && kwPanel.classList.contains("open") && !kwPanel.contains(document.activeElement))
      openKw(kwPanel.dataset.source);
  }
  function openPanel() {
    ensureUi();
    closeKw();
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
      html += `<div class="flg-sub">🗞 ข่าวที่ flag <span class="flg-hint">(＋ ตัดเว็บ · ↩ เอากลับ)</span></div>
        <div class="flg-items">` +
        a.items.slice().reverse().map((r) => `<div class="flg-item">
          <div class="flg-item-main"><div class="flg-item-ttl">${esc(r.title || "(ไม่มีหัวข้อ)")}</div>${r.host ? `<div class="flg-item-host">🌐 ${esc(r.host)}</div>` : ""}</div>
          ${r.host ? `<button type="button" class="flg-mini" data-ta="${esc(taId)}" data-add="-site:${esc(r.host)}" title="เติม -site:${esc(r.host)} ลงกล่อง">＋ ตัดเว็บ</button>` : ""}
          <button type="button" class="flg-mini ghost" data-restore="${esc(r.link)}" title="เอาข่าวนี้กลับ">↩</button>
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
    mask.style.display = "block";
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
    $$(".flg-copy", panel).forEach((b) =>
      b.addEventListener("click", () => {
        const ta = panel.querySelector("#" + b.dataset.ta);
        if (ta) copy(ta.value, b);
      })
    );
    $$("[data-clear]", panel).forEach((b) => b.addEventListener("click", () => clearSource(b.dataset.clear)));
  }
  function closePanel() {
    if (!panel) return;
    panel.classList.remove("open");
    panel.style.display = "none";
    if (kwPanel && !kwPanel.classList.contains("open")) mask.style.display = "none";
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
    .flag-btn{position:absolute;top:6px;right:6px;z-index:3;border:1px solid rgba(160,160,160,.32);background:rgba(40,40,40,.42);color:#fff;width:25px;height:25px;border-radius:7px;font-size:12px;line-height:1;cursor:pointer;opacity:.55;transition:opacity .12s,background .12s;display:grid;place-items:center;padding:0}
    .card:hover .flag-btn{opacity:.9}
    .flag-btn:hover{opacity:1;background:#c0392b;border-color:#c0392b}
    :root[data-theme="light"] .flag-btn{background:rgba(255,255,255,.72);color:#666;border-color:rgba(0,0,0,.15)}
    :root[data-theme="light"] .flag-btn:hover{background:#c0392b;color:#fff;border-color:#c0392b}
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
    .flg-kwin{display:flex;gap:8px;margin:2px 0 10px}
    .flg-kwfield{flex:1;min-width:0;background:rgba(150,150,150,.12);color:inherit;border:1px solid rgba(150,150,150,.25);border-radius:8px;padding:9px;font-family:inherit;font-size:13px}
    .flg-kwadd{border:none;background:#2a78d6;color:#fff;border-radius:8px;padding:0 15px;cursor:pointer;font-family:inherit;font-size:13px;white-space:nowrap}
    .flg-kwchips{margin-bottom:4px}
    .flg-kwchip{background:rgba(42,120,214,.18);border:1px solid rgba(42,120,214,.4);border-radius:7px;padding:3px 6px 3px 9px;font-size:12px;display:inline-flex;gap:7px;align-items:center}
    .flg-kwchip button{background:none;border:none;color:inherit;cursor:pointer;opacity:.55;font-size:11px;padding:0;line-height:1}
    .flg-kwchip button:hover{opacity:1}
    `;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------- public API ----------
  const Flags = {
    init(opts = {}) {
      onChange = opts.onChange || (() => {});
      SCOPE = opts.scope || deriveScope();
      hidden = load(key(LS_HIDDEN), {});
      records = load(key(LS_RECS), []);
      kwStore = load(key(LS_KW), {});
      injectCss();
      ensureUi();
      injectKwButtons();
      document.addEventListener("click", (e) => {
        const b = e.target.closest(".flag-btn");
        if (b) { e.preventDefault(); e.stopPropagation(); flag(b); }
      });
      refresh();
      // sync กับ server (ถ้า bind KV) — ดึงตอนเปิด, ทุก 25 วิ, และตอนกลับมาโฟกัสแท็บ
      syncPull();
      setInterval(syncPull, 25000);
      window.addEventListener("focus", syncPull);
    },
    isHidden(link) { return !!hidden[link]; },
    button(item, source) {
      // flag → exclusion ใช้ได้เฉพาะ Google Alert (มี query ให้แก้) — News เป็น RSS ตรง จึงไม่มีปุ่ม
      if (!source || !source.startsWith("alert")) return "";
      return `<button type="button" class="flag-btn" title="🚩 ไม่เกี่ยวข้อง — ซ่อน + เก็บเข้าคำแนะนำตัดข่าว" data-link="${esc(item.link)}" data-source="${esc(source)}" data-title="${esc(item.title || "")}" data-label="${esc(item.sourceLabel || "")}">🚩</button>`;
    },
    refresh,
  };
  window.Flags = Flags;
})();
