// Cloudflare Pages Function — same-origin RSS/Atom fetcher.
// Served at /api/feed?url=<google feed url>. Lets the dashboard read Google
// News / Alerts / Trends feeds without relying on flaky public CORS proxies.
// Only Google hosts are allowed so this can't be abused as an open proxy.
export async function onRequestGet(context) {
  const reqUrl = new URL(context.request.url);
  const target = reqUrl.searchParams.get("url");
  if (!target) return json(400, { error: "missing url param" });

  let host;
  try { host = new URL(target).hostname; }
  catch { return json(400, { error: "invalid url" }); }

  // allow only *.google.com (news/trends/www alerts feeds)
  if (!/(^|\.)google\.com$/i.test(host)) {
    return json(403, { error: "host not allowed", host });
  }

  try {
    const res = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; cp-dashboard/1.0; +https://pages.dev)",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "Accept-Language": "th,en;q=0.8",
      },
      cf: { cacheTtl: 180, cacheEverything: true },
    });
    const body = await res.text();
    return new Response(body, {
      status: res.ok ? 200 : res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/xml; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=180",
      },
    });
  } catch (e) {
    return json(502, { error: "upstream fetch failed", detail: String(e && e.message || e) });
  }
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}
