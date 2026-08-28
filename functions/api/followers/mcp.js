/* 🔌 /api/followers/mcp — ต่อยอดผู้ติดตามเข้ากับ "แชท" ผ่าน MCP
 * ==================================================================================
 * MCP (Model Context Protocol) = ภาษากลางที่ Claude ใช้คุยกับเครื่องมือภายนอก
 * ไฟล์นี้พูด **JSON-RPC 2.0 ผ่าน HTTP POST** ซึ่งเป็นท่ามาตรฐานของ MCP ฝั่งเซิร์ฟเวอร์
 * ไม่ต้องมี npm / build step อะไรเลย — เขียนมือได้ทั้งหมด (โปรเจกต์นี้ไม่มีขั้นตอน build)
 *
 * ต่อเข้าแชท 2 ทาง (ดู FOLLOWERS.md):
 *   ก. ใส่ URL นี้เป็น **Connector** ใน Claude โดยตรง
 *      https://cp-dashboard-680.pages.dev/api/followers/mcp?key=<กุญแจ>
 *   ข. รันตัวเชื่อมในเครื่อง `tools/followers-mcp.mjs` (ใช้กับ Claude Desktop / Claude Code)
 *
 * 🔑 ใช้กุญแจตัวเดียวกับ /api/followers (`FOLLOWERS_TOKEN`) — ไม่มีกุญแจไม่ทำงาน
 * 💧 ไม่เขียน KV เอง — เรียกผ่าน /api/followers ตัวเดิม จึงได้ cache 6 ชม. และงบ KV เท่าเดิม
 */

import { onRequest as followersRequest, readHistory } from "./index.js";
import accountsConfig from "../../../followers.config.js";
import { normPlatform, normHandle, PLATFORMS } from "./_lib/providers.js";

const PROTOCOL = "2024-11-05";
const SERVER = { name: "cp-followers", version: "1.0.0" };

const TOOLS = [
  {
    name: "get_followers",
    description:
      "ดึงยอดผู้ติดตามล่าสุดของบัญชีโซเชียล (YouTube, TikTok, Instagram, X, Facebook) " +
      "พร้อมส่วนต่างจากครั้งก่อน ไม่ใส่พารามิเตอร์ = เอาทุกบัญชีที่ตั้งไว้",
    inputSchema: {
      type: "object",
      properties: {
        accounts: { type: "array", items: { type: "string" },
          description: "รหัสบัญชีที่ตั้งไว้ (ดูจาก list_accounts) เช่น [\"yt-cpfnews\"]" },
        platform: { type: "string", enum: PLATFORMS,
          description: "ใช้คู่กับ handle เพื่อถามบัญชีที่ไม่ได้ตั้งไว้ (เช่นบัญชีคู่แข่ง)" },
        handle: { type: "string", description: "ชื่อบัญชี ไม่ต้องมี @ (ใส่ลิงก์เต็มก็ได้)" },
        refresh: { type: "boolean", description: "true = ไม่เอาค่าที่ cache ไว้ (เสียเครดิตเพิ่ม)" },
      },
    },
  },
  {
    name: "list_accounts",
    description: "ดูรายชื่อบัญชีที่ตั้งค่าไว้ในระบบ พร้อมสถานะเปิด/ปิด",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_follower_history",
    description: "ดูประวัติยอดผู้ติดตามรายวันย้อนหลังของบัญชีที่ตั้งไว้ (มีเฉพาะวันที่เคยมีคนเรียกดู)",
    inputSchema: {
      type: "object",
      properties: {
        account: { type: "string", description: "รหัสบัญชี เช่น yt-cpfnews (ไม่ใส่ = ทุกบัญชี)" },
        days: { type: "number", description: "ย้อนหลังกี่วัน (ค่าตั้งต้น 30)" },
      },
    },
  },
];

export async function onRequest(context) {
  const { request, env = {} } = context;
  if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
  if (request.method === "GET") {
    // เปิดด้วยเบราว์เซอร์แล้วเห็นว่ามันคืออะไร — ไม่คืนข้อมูลอะไรที่เป็นความลับ
    return cors(json({ ok: true, service: SERVER.name, protocol: PROTOCOL, transport: "http+jsonrpc",
                       tools: TOOLS.map(t => t.name) }));
  }
  if (request.method !== "POST") return cors(json(rpcErr(null, -32600, "ใช้ POST เท่านั้น"), 405));

  let msg;
  try { msg = await request.json(); }
  catch { return cors(json(rpcErr(null, -32700, "อ่าน JSON ไม่ได้"), 400)); }

  // MCP ส่งเป็นชุด (batch) ได้ด้วย
  if (Array.isArray(msg)) {
    const out = [];
    for (const m of msg) {
      const r = await handle(m, context);
      if (r) out.push(r);
    }
    return cors(out.length ? json(out) : new Response(null, { status: 202 }));
  }
  const res = await handle(msg, context);
  return cors(res ? json(res) : new Response(null, { status: 202 }));
}

async function handle(msg, context) {
  const { env = {} } = context;
  const id = msg && msg.id !== undefined ? msg.id : null;
  const method = msg && msg.method;

  // notification (ไม่มี id) — ตอบกลับไม่ได้ตามสเปค
  if (id === null && /^notifications\//.test(String(method))) return null;

  switch (method) {
    case "initialize":
      return rpcOk(id, {
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: "ถามยอดผู้ติดตามของบัญชีโซเชียลได้เลย เช่น \"ตอนนี้ follower เท่าไหร่บ้าง\"",
      });
    case "ping":
      return rpcOk(id, {});
    case "tools/list":
      return rpcOk(id, { tools: TOOLS });
    case "tools/call":
      return await callTool(id, msg.params || {}, context);
    default:
      if (id === null) return null;
      return rpcErr(id, -32601, "ไม่รู้จักคำสั่ง: " + method);
  }
}

async function callTool(id, params, context) {
  const name = params.name;
  const args = params.arguments || {};
  try {
    if (name === "list_accounts") return rpcOk(id, textResult(listAccountsText()));
    if (name === "get_follower_history") return rpcOk(id, textResult(await historyText(context.env, args)));
    if (name === "get_followers") return rpcOk(id, textResult(await followersText(context, args)));
    return rpcErr(id, -32602, "ไม่รู้จักเครื่องมือ: " + name);
  } catch (e) {
    // ⚠️ MCP: ให้ error ของ "ตัวงาน" กลับไปเป็นข้อความ ไม่ใช่ error ของ protocol
    //    ไม่งั้นแชทจะขึ้นว่าเครื่องมือพัง ทั้งที่แค่ดึงไม่สำเร็จ
    return rpcOk(id, { isError: true, content: [{ type: "text", text: "ดึงไม่สำเร็จ: " + String(e && e.message || e) }] });
  }
}

/* ---------- เนื้องานของแต่ละเครื่องมือ ---------- */

function listAccountsText() {
  const rows = (Array.isArray(accountsConfig) ? accountsConfig : []).map(a => {
    const p = normPlatform(a.platform) || a.platform;
    return `${a.off ? "⏸ ปิดอยู่" : "▶ เปิดอยู่"} · ${a.id} · ${p} · @${normHandle(a.handle)} · ${a.label || "-"}`;
  });
  if (!rows.length) return "ยังไม่ได้ตั้งบัญชีไว้เลย (แก้ที่ followers.config.js)";
  return "บัญชีที่ตั้งไว้:\n" + rows.join("\n") +
         "\n\n(บัญชีที่ปิดอยู่จะไม่ถูกดึงจนกว่าจะลบ off: true ในไฟล์ followers.config.js)";
}

async function followersText(context, args) {
  const { request } = context;
  const src = new URL(request.url);
  const u = new URL(src.origin + "/api/followers");
  // ส่งกุญแจต่อไปให้ endpoint หลักตรวจเอง (ไม่มีกุญแจ = มันจะปฏิเสธเอง)
  const key = src.searchParams.get("key");
  if (key) u.searchParams.set("key", key);
  if (Array.isArray(args.accounts) && args.accounts.length) u.searchParams.set("accounts", args.accounts.join(","));
  if (args.platform) u.searchParams.set("platform", String(args.platform));
  if (args.handle) u.searchParams.set("handle", String(args.handle));
  if (args.refresh) u.searchParams.set("refresh", "1");

  const req = new Request(u.toString(), {
    method: "GET",
    headers: { authorization: request.headers.get("authorization") || "" },
  });
  // ⚠️ ห้าม spread context ทั้งก้อน — `waitUntil` เป็นเมธอดที่ผูกกับ context เดิม
  //    ก๊อปออกมาแล้วเรียกลอยๆ จะหลุด this แล้ว cache ไม่ถูกเขียน (พังเงียบ)
  const res = await followersRequest({
    request: req,
    env: context.env,
    waitUntil: (p) => (context.waitUntil ? context.waitUntil(p) : undefined),
  });
  const data = await res.json();
  if (data.error) return "❌ " + data.error;

  const lines = data.accounts.map(a => {
    if (a.followers == null) return `❌ ${a.label} — ดึงไม่สำเร็จ (${a.error || "ไม่ทราบสาเหตุ"})`;
    const unit = a.metric === "likes" ? "ไลก์ (เพจนี้ไม่ให้ยอดผู้ติดตาม)" : "ผู้ติดตาม";
    let s = `${a.label} · ${a.followers.toLocaleString("en-US")} ${unit}`;
    if (a.delta != null) {
      const sign = a.delta > 0 ? "+" : "";
      s += ` · ${sign}${a.delta.toLocaleString("en-US")} จาก ${a.deltaDays} วันก่อน`;
    } else {
      s += " · (ยังไม่มีค่าก่อนหน้าให้เทียบ)";
    }
    return s;
  });

  const credits = data.credits && data.credits.scrapecreators;
  return [
    `ยอดผู้ติดตาม ณ ${data.day} (เวลาไทย)`,
    ...lines,
    credits != null ? `\nเครดิต ScrapeCreators คงเหลือ ${credits}` : "",
    `\nJSON:\n${JSON.stringify(data)}`,
  ].filter(Boolean).join("\n");
}

async function historyText(env, args) {
  const hist = await readHistory(env);
  const ids = args.account ? [String(args.account)] : Object.keys(hist);
  if (!ids.length) return "ยังไม่มีประวัติเก็บไว้ — ประวัติจะเริ่มมีหลังเรียก get_followers อย่างน้อย 2 วันคนละวันกัน";
  const days = Math.max(1, Math.min(400, +args.days || 30));

  const out = [];
  for (const id of ids) {
    const series = (hist[id] || []).slice(-days);
    if (!series.length) { out.push(`${id}: ไม่มีข้อมูลในช่วงนี้`); continue; }
    const first = series[0], last = series[series.length - 1];
    const diff = last.n - first.n;
    out.push(
      `${id}: ${first.d} = ${first.n.toLocaleString("en-US")} → ${last.d} = ${last.n.toLocaleString("en-US")} ` +
      `(${diff >= 0 ? "+" : ""}${diff.toLocaleString("en-US")} · ${series.length} จุด)`
    );
  }
  return out.join("\n") + `\n\nJSON:\n${JSON.stringify(
    Object.fromEntries(ids.map(id => [id, (hist[id] || []).slice(-days)]))
  )}`;
}

/* ---------- JSON-RPC helper ---------- */
const textResult = (text) => ({ content: [{ type: "text", text }] });
const rpcOk = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcErr = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "content-type": "application/json; charset=utf-8" },
  });
}
function cors(res) {
  res.headers.set("access-control-allow-origin", "*");
  res.headers.set("access-control-allow-headers", "authorization, content-type, mcp-protocol-version");
  res.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  return res;
}
