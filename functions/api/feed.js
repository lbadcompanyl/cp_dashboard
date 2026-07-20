// Cloudflare Pages Function — same-origin RSS/Atom fetcher with server-side fallbacks.
// Served at /api/feed?url=<google feed url>.
//
// Why: the browser only ever talks to this same origin (works behind strict
// corporate networks that block third-party proxy domains). Server-side we try
// several routes because Google blocks datacenter/proxy IPs for
// news.google.com/rss/search ("We're sorry / automated queries"):
//   1) direct           — fine for user-specific Alert feeds
//   2) rss2json          — dedicated RSS service Google serves (JSON → RSS here)
//   3) allorigins/codetabs — generic relays (different IPs)
// Only *.google.com targets are allowed so this can't be an open proxy.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const UPSTREAMS = [
  { kind: "xml",  build: t => t },
  { kind: "json", build: t => "https://api.rss2json.com/v1/api.json?count=60&rss_url=" + encodeURIComponent(t) },
  { kind: "xml",  build: t => "https://api.allorigins.win/raw?url=" + encodeURIComponent(t) },
  { kind: "xml",  build: t => "https://api.codetabs.com/v1/proxy/?quest=" + encodeURIComponent(t) },
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
  for (const up of UPSTREAMS) {
    try {
      const res = await fetch(up.build(target), {
        headers: {
          "User-Agent": UA,
          "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*",
          "Accept-Language": "th,en;q=0.8",
        },
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      lastStatus = res.status;
      const body = await res.text();

      if (up.kind === "json") {
        const xml = rss2jsonToRss(body);
        if (xml) return feed(xml, "rss2json");
        if (/automated queries|unusual traffic/i.test(body)) blocked = true;
        continue;
      }
      if (res.ok && /<(rss|feed|item|entry)\b/i.test(body)) return feed(body, "xml");
      if (/we('|&#39;|’)?re sorry|unusual traffic|automated queries/i.test(body)) blocked = true;
    } catch (e) {
      lastStatus = lastStatus || -1;
    }
  }
  return json(502, { error: "all upstreams failed to return a feed", lastStatus, blocked });
}

// rss2json returns {status:"ok", items:[{title,link,pubDate,description,...}]}.
// Convert to minimal RSS so the client's XML parser handles it uniformly.
function rss2jsonToRss(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (!data || data.status !== "ok" || !Array.isArray(data.items) || !data.items.length) return null;
  const items = data.items.map(it =>
    "<item>" +
      "<title>" + xesc(it.title) + "</title>" +
      "<link>" + xesc(it.link) + "</link>" +
      "<pubDate>" + xesc(it.pubDate) + "</pubDate>" +
      "<description>" + xesc(it.description || it.content || "") + "</description>" +
    "</item>"
  ).join("");
  return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>' + items + "</channel></rss>";
}

const xesc = s => String(s == null ? "" : s).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

function feed(body, via) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300",
      "x-feed-via": via,
    },
  });
}
function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}
