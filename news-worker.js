/**
 * Cloudflare Worker — ตัวดึงข่าว Google News (แก้ CORS + ข่าวเสถียร + ดึงรูปจริง og:image)
 *
 * วิธี deploy (ทำครั้งเดียว):
 *  1) Cloudflare Dashboard → Compute → Create → Workers → Create Worker
 *  2) ตั้งชื่อ (เช่น "news") → Deploy
 *  3) กด "Edit code" → ลบโค้ดเดิมทั้งหมด → วางไฟล์นี้ทั้งไฟล์ → กด Deploy
 *  4) ได้ URL เช่น https://news.<ชื่อ>.workers.dev
 *  5) วาง URL นั้นในตัวแปร NEWS_API ที่ index.html แล้ว push
 *     (ถ้าเคย deploy เวอร์ชันก่อน ให้วางโค้ดนี้ทับแล้ว Deploy ใหม่ เพื่อได้รูปจริง)
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
    const withImg = url.searchParams.get("img") !== "0";   // ?img=0 เพื่อปิดการดึงรูป (เร็วขึ้น)
    if (!q) return new Response(JSON.stringify({ items: [] }), { headers: cors });

    const rss =
      "https://news.google.com/rss/search?q=" + encodeURIComponent(q) +
      "&hl=" + hl + "&gl=" + gl + "&ceid=" + ceid;

    let xml = "";
    try {
      const res = await fetch(rss, { headers: { "User-Agent": UA }, cf: { cacheTtl: 600, cacheEverything: true } });
      xml = await res.text();
    } catch (e) {
      return new Response(JSON.stringify({ items: [], error: "fetch failed" }), { headers: cors });
    }

    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml)) && items.length < 10) {
      const b = m[1];
      items.push({
        title: pick(b, "title"),
        link: pick(b, "link"),
        source: pick(b, "source"),
        pubDate: pick(b, "pubDate"),
        thumbnail: "",
      });
    }

    // ดึงรูปหน้าปกบทความ (og:image) แบบขนาน มี timeout กันช้า
    if (withImg) {
      await Promise.all(items.map(async (it) => {
        it.thumbnail = await ogImage(it.link);
      }));
    }

    return new Response(JSON.stringify({ items }), { headers: cors });
  },
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function clean(s) {
  return (s || "")
    .replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
function pick(block, tag) {
  const m = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">").exec(block);
  return m ? clean(m[1]) : "";
}

async function ogImage(link) {
  if (!link) return "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4500);
    let html = "";
    try {
      const r = await fetch(link, {
        headers: { "User-Agent": UA },
        redirect: "follow",
        signal: ctrl.signal,
        cf: { cacheTtl: 3600, cacheEverything: true },
      });
      html = (await r.text()).slice(0, 200000);   // อ่านแค่ส่วนหัวพอ
    } finally { clearTimeout(timer); }

    const patterns = [
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    ];
    for (const p of patterns) {
      const m = p.exec(html);
      if (m && m[1] && /^https?:\/\//i.test(m[1])) return m[1].replace(/&amp;/g, "&");
    }
  } catch (e) { /* ไม่มีรูป → ปล่อยว่าง (ฝั่งเว็บจะโชว์ไอคอนตัวอักษรแทน) */ }
  return "";
}
