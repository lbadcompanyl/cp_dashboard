// GET /api/lab/social — ห้องทดลอง: เช็คว่าแหล่ง social ไหน "ดึงได้จริง" จาก Cloudflare Worker
// เปิดในเบราว์เซอร์แล้วดูผลเป็น text — ใช้ตัดสินใจก่อนลงมือทำจริง (ไฟล์ชั่วคราว ลบได้)

const FETCH_TIMEOUT = 10000;

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
];

export async function onRequest() {
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
    (r.err ? `\n   ✗ ${r.err}` : `\n   peek: ${r.peek}`)
  ).join("\n\n");
  return new Response(txt, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
