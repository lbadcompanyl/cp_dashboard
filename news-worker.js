/**
 * Cloudflare Worker — ตัวดึงข่าว Google News (แก้ปัญหา CORS + ให้ข่าวเสถียร)
 *
 * วิธี deploy (ทำครั้งเดียว):
 *  1) Cloudflare Dashboard → Compute → Create → Workers → Create Worker
 *  2) ตั้งชื่อ (เช่น "news") → Deploy
 *  3) กด "Edit code" → ลบโค้ดเดิมทั้งหมด → วางไฟล์นี้ทั้งไฟล์ → กด Deploy
 *  4) จะได้ URL เช่น https://news.<ชื่อ>.workers.dev
 *  5) เอา URL นั้นไปวางในตัวแปร NEWS_API ที่ index.html แล้ว push
 *
 * เรียกใช้:  https://your-worker.workers.dev?q=<คำค้น>&hl=th&gl=TH&ceid=TH:th
 * ส่งกลับ:   { "items": [ { title, link, source, pubDate, thumbnail }, ... ] }
 */
export default {
  async fetch(request) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";
    const hl = url.searchParams.get("hl") || "en-US";
    const gl = url.searchParams.get("gl") || "US";
    const ceid = url.searchParams.get("ceid") || "US:en";
    if (!q) return new Response(JSON.stringify({ items: [] }), { headers: cors });

    const rss =
      "https://news.google.com/rss/search?q=" + encodeURIComponent(q) +
      "&hl=" + hl + "&gl=" + gl + "&ceid=" + ceid;

    let xml = "";
    try {
      const res = await fetch(rss, { headers: { "User-Agent": "Mozilla/5.0" } });
      xml = await res.text();
    } catch (e) {
      return new Response(JSON.stringify({ items: [], error: "fetch failed" }), { headers: cors });
    }

    const clean = (s) =>
      (s || "")
        .replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    const pick = (block, tag) => {
      const m = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">").exec(block);
      return m ? clean(m[1]) : "";
    };

    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml)) && items.length < 12) {
      const b = m[1];
      items.push({
        title: pick(b, "title"),
        link: pick(b, "link"),
        source: pick(b, "source"),
        pubDate: pick(b, "pubDate"),
        thumbnail: "",
      });
    }
    return new Response(JSON.stringify({ items }), { headers: cors });
  },
};
