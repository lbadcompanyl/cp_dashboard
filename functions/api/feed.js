// Cloudflare Pages Function — same-origin RSS/Atom fetcher with server-side fallbacks.
// Served at /api/feed?url=<google feed url>.
//
// Why: the browser only ever talks to this same origin (works behind strict
// corporate networks that block third-party proxy domains). Server-side we try
// several routes because Google blocks Cloudflare's datacenter IPs for
// news.google.com/rss/search ("We're sorry / automated queries"): fetch direct
// first (fine for user-specific Alert feeds), then relay through public proxies
// (different IPs Google doesn't block). Only *.google.com targets are allowed.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// upstream URL builders, tried in order (direct → public relays)
const UPSTREAMS = [
  t => t,
  t => "https://api.allorigins.win/raw?url=" + encodeURIComponent(t),
  t => "https://api.codetabs.com/v1/proxy/?quest=" + encodeURIComponent(t),
  t => "https://corsproxy.io/?url=" + encodeURIComponent(t),
];

export async function onRequestGet(context) {
  const reqUrl = new URL(context.request.url);
  const target = reqUrl.searchParams.get("url");
  if (!target) return json(400, { error: "missing url param" });

  let host;
  try { host = new URL(target).hostname; }
  catch { return json(400, { error: "invalid url" }); }
  if (!/(^|\.)google\.com$/i.test(host)) return json(403, { error: "host not allowed", host });

  let lastStatus = 0, blocked = false;
  for (const build of UPSTREAMS) {
    try {
      const res = await fetch(build(target), {
        headers: {
          "User-Agent": UA,
          "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
          "Accept-Language": "th,en;q=0.8",
        },
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      lastStatus = res.status;
      const body = await res.text();
      if (res.ok && /<(rss|feed|item|entry)\b/i.test(body)) {
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": res.headers.get("content-type") || "application/xml; charset=utf-8",
            "access-control-allow-origin": "*",
            "cache-control": "public, max-age=300",
            "x-feed-via": build === UPSTREAMS[0] ? "direct" : "relay",
          },
        });
      }
      if (/we('|&#39;|’)?re sorry|unusual traffic|automated queries/i.test(body)) blocked = true;
    } catch (e) {
      lastStatus = lastStatus || -1;
    }
  }
  return json(502, { error: "all upstreams failed to return a feed", lastStatus, blocked });
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}
