// ตัว parse RSS/Atom แบบเบา ไม่พึ่ง DOMParser (ใช้ได้ใน Cloudflare Workers)
// รองรับ: RSS <item>, Atom <entry> และฟีด Google Trends (namespace ht:)

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(str = "") {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n) => ENTITIES[n])
    .trim();
}

function stripTags(html = "") {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function blocks(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1]) : "";
}

function attr(block, tag, name) {
  const m = block.match(new RegExp(`<${tag}[^>]*\\b${name}="([^"]*)"`));
  return m ? decode(m[1]) : "";
}

function toISO(str) {
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return "i" + (h >>> 0).toString(36);
}

// RSS <item> หรือ Atom <entry> (ใช้กับ news + alert)
export function parseGeneric(xml, source) {
  const items = [];
  let list = blocks(xml, "item").map((b) => ({ b, atom: false }));
  if (list.length === 0) list = blocks(xml, "entry").map((b) => ({ b, atom: true }));

  for (const { b, atom } of list) {
    let title = tagText(b, "title");
    if (!title) continue;
    let link = atom ? attr(b, "link", "href") || tagText(b, "id") : tagText(b, "link");
    const date =
      tagText(b, "pubDate") ||
      tagText(b, "published") ||
      tagText(b, "updated") ||
      tagText(b, "dc:date");
    let snippet = stripTags(
      tagText(b, "description") || tagText(b, "summary") || tagText(b, "content")
    );
    let sourceLabel = "";

    // หมายเหตุ: ฟีดข่าวตรงจากสำนักข่าว — sourceLabel มาจาก label ใน config (ตั้งใน feeds.js)
    // เก็บ title/snippet ตามจริง (ไม่ตัดอะไร)

    if (source === "alert") {
      // Google Alert: title/snippet มี <b> ไฮไลต์คำ — ตัด tag ออก
      title = stripTags(title);
      // ลิงก์เป็น google.com/url?...&url=<ลิงก์จริง> — แกะออกให้ตรง
      const m = link.match(/[?&]url=([^&]+)/);
      if (m) {
        try {
          link = decodeURIComponent(m[1]);
        } catch {
          /* keep original */
        }
      }
    }

    items.push({
      id: hash(link || title),
      source,
      sourceLabel,
      title,
      link,
      publishedAt: toISO(date),
      snippet: snippet.slice(0, 240),
    });
  }
  return items;
}

// ฟีด Google Trends (มี ht:approx_traffic, ht:news_item)
export function parseTrends(xml, source = "trends") {
  const items = [];
  for (const b of blocks(xml, "item")) {
    const title = tagText(b, "title");
    if (!title) continue;
    const traffic = tagText(b, "ht:approx_traffic");
    const date = tagText(b, "pubDate");
    const newsUrl = tagText(b, "ht:news_item_url");
    const newsTitle = tagText(b, "ht:news_item_title");
    items.push({
      id: hash(title),
      source,
      sourceLabel: traffic ? `${traffic} การค้นหา` : "",
      title,
      link: newsUrl || "https://trends.google.com/trending?geo=TH",
      publishedAt: toISO(date),
      snippet: newsTitle || "",
    });
  }
  return items;
}
