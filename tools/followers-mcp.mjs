#!/usr/bin/env node
/* 🔌 ตัวเชื่อม MCP แบบรันในเครื่อง — สำหรับ Claude Desktop / Claude Code
 * ==================================================================================
 * ทำหน้าที่เดียว: รับคำสั่ง MCP ทาง stdin แล้วส่งต่อไปที่ /api/followers/mcp บนเว็บ
 * (Claude Desktop คุยกับเครื่องมือผ่าน stdio เป็นหลัก — ตัวนี้เลยเป็นสะพานให้)
 *
 * ไม่มี dependency เลย ใช้ Node 18+ (มี fetch มาให้ในตัว)
 *
 * ตั้งค่าใน claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "cp-followers": {
 *         "command": "node",
 *         "args": ["/path/to/cp_dashboard/tools/followers-mcp.mjs"],
 *         "env": {
 *           "FOLLOWERS_MCP_URL": "https://cp-dashboard-680.pages.dev/api/followers/mcp",
 *           "FOLLOWERS_TOKEN": "<กุญแจเดียวกับที่ตั้งใน Cloudflare>"
 *         }
 *       }
 *     }
 *   }
 *
 * หรือใน Claude Code:  claude mcp add cp-followers -- node /path/to/tools/followers-mcp.mjs
 *
 * 🔑 **กุญแจอยู่ใน env ของเครื่องตัวเอง ห้าม commit ลง repo** (repo นี้เป็น public)
 */

const URL_ = process.env.FOLLOWERS_MCP_URL || "https://cp-dashboard-680.pages.dev/api/followers/mcp";
const TOKEN = process.env.FOLLOWERS_TOKEN || "";

const send = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
const log = (m) => process.stderr.write("[cp-followers] " + m + "\n");

if (!TOKEN) log("⚠️ ยังไม่ได้ตั้ง FOLLOWERS_TOKEN — เซิร์ฟเวอร์จะปฏิเสธทุกคำขอ");

async function forward(msg) {
  const u = new URL(URL_);
  if (TOKEN) u.searchParams.set("key", TOKEN);
  const r = await fetch(u.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(TOKEN ? { authorization: "Bearer " + TOKEN } : {}),
    },
    body: JSON.stringify(msg),
  });
  if (r.status === 202) return null;          // notification — ไม่ต้องตอบกลับ
  const text = await r.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { throw new Error("เซิร์ฟเวอร์ตอบมาแต่ไม่ใช่ JSON: " + text.slice(0, 200)); }
}

// MCP ทาง stdio = JSON ก้อนละบรรทัด
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;

    let msg;
    try { msg = JSON.parse(line); }
    catch { log("อ่านบรรทัดนี้ไม่ได้: " + line.slice(0, 120)); continue; }

    try {
      const res = await forward(msg);
      if (res) send(res);
    } catch (e) {
      // ⚠️ เน็ตล่ม/URL ผิด ต้องตอบกลับเป็น error ของ JSON-RPC
      //    ถ้าเงียบไป Claude จะค้างรอคำตอบที่ไม่มีวันมา
      const id = msg && msg.id !== undefined ? msg.id : null;
      if (id !== null) send({ jsonrpc: "2.0", id, error: { code: -32000, message: String(e && e.message || e) } });
      else log(String(e && e.message || e));
    }
  }
});
process.stdin.on("end", () => process.exit(0));
