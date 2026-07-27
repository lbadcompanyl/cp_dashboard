// GET /api/sd/img?u=<encoded image url>
// image proxy — ดึงรูป og:image มาเสิร์ฟเอง (ทะลุ hotlink/referrer/mixed-content) + cache 1 วัน
// รูปข่าว aggregator (msn/aol ฯลฯ) มัก block การโหลดตรงจากโดเมนอื่น → proxy ช่วยให้ขึ้นเสมอ

const TIMEOUT = 8000;
const MAX_BYTES = 3_000_000; // กันรูปยักษ์

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const u = url.searchParams.get("u") || "";
  let target;
  try { target = new URL(u); } catch { return new Response(null, { status: 400 }); }
  if (target.protocol !== "http:" && target.protocol !== "https:") return new Response(null, { status: 400 });

  const cache = caches.default;
  const key = new Request(url.origin + "/api/sd/img?u=" + encodeURIComponent(u), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(u, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        Referer: target.origin + "/", // เนียนเป็น same-site เพื่อผ่าน hotlink protection
      },
    });
    if (!res.ok) return new Response(null, { status: 502 }); // → client onerror → กล่องตัวอักษร
    const ct = res.headers.get("content-type") || "";
    if (!/^image\//i.test(ct)) return new Response(null, { status: 415 });
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return new Response(null, { status: 413 });
    const out = new Response(buf, {
      headers: { "content-type": ct, "cache-control": "public, max-age=86400", "access-control-allow-origin": "*" },
    });
    context.waitUntil(cache.put(key, out.clone()));
    return out;
  } catch {
    return new Response(null, { status: 504 });
  } finally {
    clearTimeout(t);
  }
}
