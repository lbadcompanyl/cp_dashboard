// เรียก Google Trends internal API (ไม่เป็นทางการ) เพื่อดึง Related queries
// flow 2 ขั้น: /explore (ขอ widget token) -> /widgetdata/relatedsearches

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const strip = (t) => t.replace(/^\)\]\}'?,?\s*/, ""); // Google ใส่ prefix )]}' กันโหลดข้าม origin

async function getCookie() {
  try {
    const r = await fetch("https://trends.google.com/?geo=TH", { headers: { "User-Agent": UA } });
    const sc = r.headers.get("set-cookie") || "";
    const m = sc.match(/(NID=[^;]+)/);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

// Trending Now (หน้าใหม่ของ Google) ผ่าน batchexecute — ให้ search volume, %, เวลาเริ่ม, breakdown
// hours: 4 | 24 | 48 | 168 (7 วัน)
// cat: หมวดหมู่ Google Trends (0 = ทุกหมวด). หมายเหตุ: RPC i0OFE ไม่รับ param หมวดหมู่ —
//   Google ติด topic id มากับแต่ละ trend (index 10) แล้วกรองฝั่ง client เอง เราจึงกรองแบบเดียวกัน
export async function fetchTrendingNow(geo = "TH", hours = 24, cat = 0) {
  const inner = JSON.stringify([null, null, geo, 0, "th", hours, 1]);
  const freq = JSON.stringify([[["i0OFE", inner, null, "generic"]]]);
  const r = await fetch(
    "https://trends.google.com/_/TrendsUi/data/batchexecute?rpcids=i0OFE&hl=th&rt=c",
    {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "f.req=" + encodeURIComponent(freq),
    }
  );
  if (!r.ok) throw new Error("trendingnow HTTP " + r.status);
  const t = await r.text();
  const line = t.split("\n").find((l) => l.includes("wrb.fr"));
  if (!line) throw new Error("trendingnow: no data line");
  const payload = JSON.parse(JSON.parse(line)[0][2]);
  let trends = payload[1] || [];

  // กรองตามหมวดหมู่ (ถ้าเลือก) โดยดู topic id ที่ index 10 ของแต่ละ trend
  if (cat) trends = trends.filter((a) => Array.isArray(a[10]) && a[10].includes(cat));

  // ช่วงยาว (7 วัน) เทรนด์เดียวพุ่งได้หลายรอบ Google ส่งมาเป็นคนละเหตุการณ์
  // ("ทุเรียน" 2K+ เมื่อ 2 วันก่อน + 200+ เมื่อ 6 วันก่อน = 2 แถว) — เก็บแค่แถวแรก
  // ซึ่งเป็นรอบที่แรงสุดตามการจัดอันดับของ Google เอง
  const seen = new Set();
  trends = trends.filter((a) => {
    const k = String(a[0] || "").trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return trends.map((a) => {
    const title = a[0] || "";
    const started = Array.isArray(a[3]) ? a[3][0] : null; // unix seconds
    const volume = a[6] || 0;
    const pct = a[8] || 0;
    const breakdown = Array.isArray(a[9]) ? a[9].filter((x) => x && x !== title).slice(0, 12) : [];
    return {
      id: "t_" + encodeURIComponent(title),
      source: "trends",
      title,
      volume,
      volumeLabel: fmtVolume(volume),
      pct,
      pctLabel: pct ? "+" + pct.toLocaleString("en-US") + "%" : "",
      sourceLabel: fmtVolume(volume) + " ค้นหา",
      related: breakdown, // คำที่เกี่ยวข้อง (ใช้เป็น fallback ตอน Top/Rising โดน rate limit)
      topics: Array.isArray(a[10]) ? a[10] : [], // topic/category ids (ใช้กรองหมวดหมู่)
      newsIds: Array.isArray(a[11]) ? a[11].slice(0, 8) : [], // article id triplets สำหรับดึงข่าว
      snippet: breakdown.join(" · "),
      publishedAt: started ? new Date(started * 1000).toISOString() : new Date().toISOString(),
      link: `https://trends.google.com/trends/explore?q=${encodeURIComponent(title)}&geo=${geo}`,
    };
  });
}

// แปลง article id triplets -> ข่าวจริง (title/url/source/time/image) ผ่าน rpc w4opAf
export async function fetchTrendNews(triplets) {
  if (!Array.isArray(triplets) || triplets.length === 0) return [];
  const freq = JSON.stringify([[["w4opAf", JSON.stringify([triplets]), null, "generic"]]]);
  const r = await fetch(
    "https://trends.google.com/_/TrendsUi/data/batchexecute?rpcids=w4opAf&hl=th&rt=c",
    {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "f.req=" + encodeURIComponent(freq),
    }
  );
  if (!r.ok) throw new Error("news HTTP " + r.status);
  const t = await r.text();
  const line = t.split("\n").find((l) => l.includes("wrb.fr"));
  if (!line) throw new Error("news: no data line");
  const data = JSON.parse(JSON.parse(line)[0][2]);
  const arts = data[0] || [];
  return arts
    .map((a) => ({
      title: a[0],
      url: a[1],
      source: a[2],
      time: Array.isArray(a[3]) ? new Date(a[3][0] * 1000).toISOString() : null,
      image: a[4] || "",
    }))
    .filter((x) => x.title && x.url);
}

function fmtVolume(n) {
  if (!n) return "";
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "M+";
  if (n >= 1e3) return Math.round(n / 1e3) + "K+";
  return n + "+";
}

// ---------- เช็คคำเดียว: ความสนใจตามเวลา + คำที่เกี่ยวข้อง ----------
//
// ใช้ explore ครั้งเดียวแล้วหยิบ 2 widget ต่อจากนั้น — explore คือขั้นที่โดน rate limit ง่ายสุด
// (ต้องขอ token ใหม่ทุกครั้ง) ยิงรอบเดียวแล้วใช้ทั้งคู่จึงประหยัดกว่าเรียก fetchRelated ซ้ำ
//
// time ที่ Google รับ: "now 7-d" · "today 1-m" · "today 3-m" · "today 12-m" · "today 5-y"
export async function fetchKeywordCheck(keyword, geo = "TH", time = "today 12-m") {
  const cookie = await getCookie();
  const hdr = { "User-Agent": UA, "Accept-Language": "th,en", ...(cookie ? { Cookie: cookie } : {}) };
  const tz = -420;
  const req = { comparisonItem: [{ keyword, geo, time }], category: 0, property: "" };

  const er = await fetch(
    `https://trends.google.com/trends/api/explore?hl=th&tz=${tz}&req=` + encodeURIComponent(JSON.stringify(req)),
    { headers: hdr }
  );
  if (!er.ok) throw new Error("explore HTTP " + er.status);
  const widgets = JSON.parse(strip(await er.text())).widgets;

  const widgetData = async (w, path) => {
    if (!w) return null;
    const r = await fetch(
      `https://trends.google.com/trends/api/widgetdata/${path}?hl=th&tz=${tz}&req=` +
        encodeURIComponent(JSON.stringify(w.request)) + `&token=${w.token}`,
      { headers: hdr }
    );
    if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
    return JSON.parse(strip(await r.text()));
  };

  // ทั้งสอง widget ไม่ขึ้นต่อกัน ยิงพร้อมกันได้ · อันไหนพังไม่ต้องลากอีกอันตกไปด้วย
  const [tsRes, rqRes] = await Promise.allSettled([
    widgetData(widgets.find((x) => x.id === "TIMESERIES"), "multiline"),
    widgetData(widgets.find((x) => x.id === "RELATED_QUERIES"), "relatedsearches"),
  ]);

  let interest = null;
  if (tsRes.status === "fulfilled" && tsRes.value) {
    const rows = tsRes.value.default?.timelineData || [];
    // value เป็น array (รองรับเทียบหลายคำ) — เราส่งคำเดียว จึงเอาช่องแรก
    const pts = rows
      .filter((r) => Array.isArray(r.value) && Number.isFinite(r.value[0]))
      .map((r) => ({ t: Number(r.time) * 1000, label: r.formattedAxisTime || "", v: r.value[0] }));
    if (pts.length) {
      const vals = pts.map((p) => p.v);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      // เทียบ 1/4 ท้ายกับ 1/4 แรก — บอกทิศทางได้โดยไม่แกว่งตามจุดเดียว
      const q = Math.max(1, Math.floor(pts.length / 4));
      const head = vals.slice(0, q).reduce((a, b) => a + b, 0) / q;
      const tail = vals.slice(-q).reduce((a, b) => a + b, 0) / q;
      interest = {
        points: pts,
        avg: Math.round(avg),
        peak: Math.max(...vals),
        latest: vals[vals.length - 1],
        // เลี่ยงหารศูนย์: ช่วงแรกเป็น 0 แปลว่า "ไม่เคยมีใครค้น" การคิด % ไม่มีความหมาย
        changePct: head > 0 ? Math.round(((tail - head) / head) * 100) : null,
        direction: tail > head * 1.15 ? "up" : tail < head * 0.85 ? "down" : "flat",
      };
    }
  }

  let related = { top: [], rising: [] };
  if (rqRes.status === "fulfilled" && rqRes.value) {
    const ranked = rqRes.value.default?.rankedList || [];
    const map = (arr) => (arr || []).slice(0, 10).map((k) => ({ query: k.query, label: k.formattedValue || String(k.value) }));
    related = { top: map(ranked[0]?.rankedKeyword), rising: map(ranked[1]?.rankedKeyword) };
  }

  return {
    interest,
    related,
    // ไม่มีข้อมูลเลย ≠ พัง — คำที่ไม่มีใครค้นก็ได้ผลว่างแบบนี้ ต้องแยกให้ออกจาก error
    empty: !interest && !related.top.length && !related.rising.length,
    errors: [tsRes, rqRes].filter((r) => r.status === "rejected").map((r) => String(r.reason?.message || r.reason).slice(0, 120)),
  };
}

// time: "now 1-d" (24 ชม.) | "now 7-d" (7 วัน)
export async function fetchRelated(keyword, geo = "TH", time = "now 1-d") {
  const cookie = await getCookie();
  const hdr = {
    "User-Agent": UA,
    "Accept-Language": "th,en",
    ...(cookie ? { Cookie: cookie } : {}),
  };
  const tz = -420; // ไทย UTC+7 (นาที)
  const req = { comparisonItem: [{ keyword, geo, time }], category: 0, property: "" };

  const exploreUrl =
    `https://trends.google.com/trends/api/explore?hl=th&tz=${tz}&req=` +
    encodeURIComponent(JSON.stringify(req));
  const er = await fetch(exploreUrl, { headers: hdr });
  if (!er.ok) throw new Error("explore HTTP " + er.status);
  const widgets = JSON.parse(strip(await er.text())).widgets;
  const w = widgets.find((x) => x.id === "RELATED_QUERIES");
  if (!w) throw new Error("no related-queries widget");

  const wUrl =
    `https://trends.google.com/trends/api/widgetdata/relatedsearches?hl=th&tz=${tz}&req=` +
    encodeURIComponent(JSON.stringify(w.request)) +
    `&token=${w.token}`;
  const wr = await fetch(wUrl, { headers: hdr });
  if (!wr.ok) throw new Error("widgetdata HTTP " + wr.status);
  const ranked = JSON.parse(strip(await wr.text())).default.rankedList;

  const map = (arr) =>
    (arr || []).slice(0, 10).map((k) => ({
      query: k.query,
      value: k.value,
      label: k.formattedValue || String(k.value),
      link: `https://trends.google.com/trends/explore?q=${encodeURIComponent(k.query)}&geo=${geo}`,
    }));

  return {
    top: map(ranked?.[0]?.rankedKeyword),
    rising: map(ranked?.[1]?.rankedKeyword),
  };
}
