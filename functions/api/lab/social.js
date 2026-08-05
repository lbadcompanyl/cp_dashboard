// GET /api/lab/social — ห้องทดลอง: เช็คว่าแหล่ง social ไหน "ดึงได้จริง" จาก Cloudflare Worker
// เปิดในเบราว์เซอร์แล้วดูผลเป็น text — ใช้ตัดสินใจก่อนลงมือทำจริง (ไฟล์ชั่วคราว ลบได้)

const FETCH_TIMEOUT = 10000;

// endpoint เบื้องหลังหน้า Creative Center ของ TikTok — หน้าเว็บมันเรียกตัวนี้เอง
// ไม่ใช่ API สาธารณะ ใช้ได้แต่ไม่มีสัญญาว่าจะอยู่ตลอด
const TT_HASHTAG =
  "https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list" +
  "?period=7&page=1&limit=20&order_by=popular&country_code=TH";

const TARGETS = [
  // ---- Facebook (คาด: โดน login wall / redirect) ----
  { id: "fb-www",    url: "https://www.facebook.com/khaosod" },
  { id: "fb-mbasic", url: "https://mbasic.facebook.com/khaosod" },
  { id: "fb-embed",  url: "https://www.facebook.com/plugins/page.php?href=https%3A%2F%2Fwww.facebook.com%2Fkhaosod&tabs=timeline&width=340" },
  // ---- X/Twitter ----
  { id: "x-syndication", url: "https://syndication.twitter.com/srv/timeline-profile/screen-name/KhaosodOnline" },
  { id: "nitter-net",    url: "https://nitter.net/KhaosodOnline/rss" },
  { id: "nitter-poast",  url: "https://nitter.poast.org/KhaosodOnline/rss" },
  // ---- Pantip (กระทู้สังคมไทย) ----
  { id: "pantip-tag",    url: "https://pantip.com/tag/%E0%B8%8B%E0%B8%B5%E0%B8%9E%E0%B8%B5" },
  { id: "pantip-search", url: "https://pantip.com/api/search-service/search/getresult", method: "POST",
    body: JSON.stringify({ keyword: "ซีพี", type: "all" }), ctype: "application/json" },
  // ---- YouTube (RSS ทางการ — ถ้าตัวนี้รอด หา channel id ข่าวไทยมาเสียบได้เลย) ----
  { id: "yt-rss", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw" },

  // ---- เทรนด์ # ของ X: เว็บมิเรอร์ (API ทางการอยู่ tier Pro ~$5,000/เดือน เลยยังไม่แตะ) ----
  { id: "xtrend-trends24",     url: "https://trends24.in/thailand/" },
  { id: "xtrend-getdaytrends", url: "https://getdaytrends.com/thailand/" },

  // ---- เทรนด์ # ของ TikTok: ยิงเปล่าก่อน ถ้าโดนตีค่อยดูตัวที่ใส่ header ครบ ----
  { id: "tt-hashtag-bare", url: TT_HASHTAG },
  { id: "tt-hashtag-hdr",  url: TT_HASHTAG, headers: {
      "referer": "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en",
      "origin": "https://ads.tiktok.com",
      "anonymous-user-id": "8f3c2a10-5b7e-4d21-9c64-0a1e2f3b4c5d",
      "timestamp": String(Math.floor(Date.now() / 1000)),
      "web-id": "7300000000000000000",
    } },
  { id: "tt-country", url: "https://ads.tiktok.com/creative_radar_api/v1/common/country" },
];

// ดึงตัวอย่าง # ออกมาให้ดู — จะได้รู้ว่า "200 แล้วมีของจริง" ไม่ใช่ 200 แล้วเปลือกเปล่า
const JUNK_ANCHOR = /^#(content|main|top|footer|header|nav|menu|search|close|modal|app|root|skip|home|collapsible\w*)$/i;
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;   // #fff #e5e7eb — สี CSS ไม่ใช่แท็ก
const ENTITY_FRAG = /^#x[0-9a-f]{2,6}$/i;                            // เศษจาก &#xe40; ไม่ใช่แท็ก

function isRealTag(t) {
  return !JUNK_ANCHOR.test(t) && !HEX_COLOR.test(t) && !ENTITY_FRAG.test(t);
}

function extractSample(text, type) {
  if (type.includes("json")) {
    try {
      const j = JSON.parse(text);
      const list = j?.data?.list || j?.data?.country_list || j?.data?.countries;
      if (Array.isArray(list) && list.length) {
        return list.slice(0, 8)
          .map((x) => (x.hashtag_name ? `#${x.hashtag_name}` : x.label || x.value || x.id || "?"))
          .join("  ");
      }
      const msg = j?.msg || j?.message;
      return msg ? `msg="${msg}" code=${j?.code ?? "-"}` : undefined;
    } catch { return undefined; }
  }
  // HTML: คว้า # ที่โผล่ในหน้า (หยาบๆ พอให้รู้ว่ามีเทรนด์อยู่จริงไหม)
  const tags = [...new Set(text.match(/#[0-9A-Za-z_฀-๿]{2,40}/g) || [])].filter(isRealTag);
  return tags.length ? tags.slice(0, 10).join("  ") : undefined;
}

// ?dump=<id> — คาย HTML ดิบรอบๆ แท็กตัวแรกที่เจอ เอาไว้ดูโครงสร้างก่อนเขียน parser จริง
async function dumpStructure(t) {
  const res = await fetch(t.url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,*/*;q=0.8",
      "Accept-Language": "th,en;q=0.9",
      ...(t.headers || {}),
    },
  });
  const html = await res.text();
  // หา <a> ตัวแรกที่ข้างในเป็นแท็กจริง (ไม่ใช่สี CSS / เศษ entity)
  const re = /<a\b[^>]*>\s*(#[0-9A-Za-z_฀-๿]{2,40})\s*<\/a>/g;
  let m, at = -1, tag = null;
  while ((m = re.exec(html))) {
    if (isRealTag(m[1])) { at = m.index; tag = m[1]; break; }
  }
  if (at < 0) {
    return `【${t.id}】 หา <a>#tag</a> ไม่เจอ — เทรนด์อาจไม่ได้อยู่ใน <a> ตรงๆ\n\n` +
      html.slice(0, 3000);
  }
  const from = Math.max(0, at - 1200);
  return `【${t.id}】 http=${res.status} bytes=${html.length}\n` +
    `แท็กแรกที่เจอ: ${tag} (ตำแหน่ง ${at})\n` +
    `${"=".repeat(60)}\n` + html.slice(from, at + 2200);
}

export async function onRequest({ request }) {
  const dump = new URL(request.url).searchParams.get("dump");
  if (dump) {
    const t = TARGETS.find((x) => x.id === dump);
    if (!t) {
      return new Response(`ไม่รู้จัก id "${dump}"\nมีให้เลือก: ${TARGETS.map((x) => x.id).join(", ")}`,
        { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    let body;
    try { body = await dumpStructure(t); } catch (e) { body = `✗ ${e && e.message}`; }
    return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }

  const out = [];
  for (const t of TARGETS) {
    const r = { id: t.id };
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
      const res = await fetch(t.url, {
        method: t.method || "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/rss+xml,application/json;q=0.9,*/*;q=0.8",
          "Accept-Language": "th,en;q=0.9",
          ...(t.ctype ? { "content-type": t.ctype } : {}),
          ...(t.headers || {}),
        },
        body: t.body || undefined,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const text = await res.text();
      r.http = res.status;
      r.finalUrl = res.url !== t.url ? res.url.slice(0, 120) : undefined;
      r.type = (res.headers.get("content-type") || "").split(";")[0];
      r.bytes = text.length;
      r.items = (text.match(/<item\b/g) || []).length || undefined;           // RSS
      r.loginWall = /login|เข้าสู่ระบบ|checkpoint/i.test(text.slice(0, 4000)) || undefined;
      r.sample = extractSample(text, r.type || "");
      r.peek = text.replace(/\s+/g, " ").slice(0, 140);
    } catch (e) {
      r.err = String((e && e.message) || e).slice(0, 100);
    }
    out.push(r);
  }
  const txt = out.map((r) =>
    `【${r.id}】 http=${r.http ?? "-"} type=${r.type ?? "-"} bytes=${r.bytes ?? "-"}` +
    (r.items ? ` rssItems=${r.items}` : "") +
    (r.loginWall ? " ⚠login-wall" : "") +
    (r.finalUrl ? `\n   → redirect: ${r.finalUrl}` : "") +
    (r.sample ? `\n   ✓ sample: ${r.sample}` : "") +
    (r.err ? `\n   ✗ ${r.err}` : `\n   peek: ${r.peek}`)
  ).join("\n\n");
  return new Response(txt, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
