// ยอดค้นหาต่อเดือนจาก Google Ads API (บริการเดียวกับ Keyword Planner)
//
// ⚠️ ยังไม่เปิดใช้ — รอ developer token ที่ผ่าน Basic access
// ถ้า env ไม่ครบ โมดูลนี้จะคืน { available: false, missing: [...] } เฉยๆ ไม่โยน error
// คอลัมน์เช็ค Trend จึงทำงานได้ตามปกติด้วยข้อมูล Google Trends ไปก่อน
//
// ที่ยืนยันแล้วด้วยการยิงจริง (7 ส.ค. 2026):
//   POST https://googleads.googleapis.com/v21/customers/{id}:generateKeywordHistoricalMetrics
//   → 401 UNAUTHENTICATED  = endpoint มีจริง เรียกผ่าน REST ได้ ไม่ต้องใช้ gRPC/SDK
//   v20 ใช้ได้เหมือนกัน · v19 ลงไปตอบ 404 = ปลดระวางแล้ว อย่าถอยเลขเวอร์ชัน
//
// ⚠️ token ทุกตัวต้องอยู่ใน Cloudflare env แบบ Secret เท่านั้น — repo เป็น public
const API_VER = "v21";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// ต้องมีครบทุกตัวถึงจะเรียกได้ · ชื่อเดียวกับที่ตั้งใน Cloudflare
const REQUIRED = [
  "GADS_DEVELOPER_TOKEN",   // จาก API Center ของบัญชี Google Ads Manager
  "GADS_CUSTOMER_ID",       // บัญชีที่จะใช้เรียก (ตัวเลขล้วน ไม่ต้องมีขีด)
  "GADS_CLIENT_ID",         // OAuth 2.0 client
  "GADS_CLIENT_SECRET",
  "GADS_REFRESH_TOKEN",     // ได้จากการทำ OAuth flow ครั้งเดียว แล้วเก็บไว้ใช้ตลอด
];

// ⚠️ สองค่านี้เป็น "criteria ID" ของ Google ไม่ใช่ชื่อประเทศ/ภาษา
// ต้องยืนยันกับตาราง geoTargetConstant / languageConstant ก่อนใช้จริง
const GEO_TARGET = { TH: "2764", US: "2840", GB: "2826", JP: "2392", KR: "2410", SG: "2702", IN: "2356" };
const LANG_TH = "1044";

const digits = (s) => String(s || "").replace(/[^0-9]/g, "");

export function adsConfig(env = {}) {
  const missing = REQUIRED.filter((k) => !env[k]);
  return { available: missing.length === 0, missing };
}

// refresh token → access token (อายุสั้น) · ไม่ต้องเก็บ access token ไว้เอง
// รอบนึงใช้ครั้งเดียว และผลลัพธ์ของ endpoint ที่เรียกก็ถูก cache อยู่แล้ว
async function accessToken(env) {
  const body = new URLSearchParams({
    client_id: env.GADS_CLIENT_ID,
    client_secret: env.GADS_CLIENT_SECRET,
    refresh_token: env.GADS_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const d = await r.json().catch(() => ({}));
  // Google บอกสาเหตุมาใน body เสมอ (invalid_grant = refresh token หมดอายุ/ถูกถอน)
  // ถ้าอ่านแต่ status จะไล่ต่อไม่ถูก — บทเรียนเดียวกับตอนทำ YouTube API key
  if (!r.ok || !d.access_token) {
    throw new Error(`oauth ${r.status} ${d.error || ""} ${(d.error_description || "").slice(0, 120)}`.trim());
  }
  return d.access_token;
}

// keywords: string[] (สูงสุด 10,000 ต่อคำขอ แต่ที่นี่ใช้ทีละไม่กี่คำ)
// คืน Map<keyword(lowercase), metrics>
export async function fetchSearchVolume(keywords, geo = "TH", env = {}) {
  const cfg = adsConfig(env);
  if (!cfg.available) return { available: false, missing: cfg.missing, metrics: {} };

  const list = [...new Set((keywords || []).map((k) => String(k || "").trim()).filter(Boolean))];
  if (!list.length) return { available: true, metrics: {} };

  const token = await accessToken(env);
  const cid = digits(env.GADS_CUSTOMER_ID);
  const headers = {
    authorization: `Bearer ${token}`,
    "developer-token": env.GADS_DEVELOPER_TOKEN,
    "content-type": "application/json",
    // ต้องใส่เมื่อ customer_id เป็นบัญชีลูกที่อยู่ใต้ Manager account
    ...(env.GADS_LOGIN_CUSTOMER_ID ? { "login-customer-id": digits(env.GADS_LOGIN_CUSTOMER_ID) } : {}),
  };
  const payload = {
    keywords: list,
    geoTargetConstants: [`geoTargetConstants/${GEO_TARGET[geo] || GEO_TARGET.TH}`],
    language: `languageConstants/${LANG_TH}`,
    keywordPlanNetwork: "GOOGLE_SEARCH",
  };

  const r = await fetch(
    `https://googleads.googleapis.com/${API_VER}/customers/${cid}:generateKeywordHistoricalMetrics`,
    { method: "POST", headers, body: JSON.stringify(payload) }
  );
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const g = d.error || (Array.isArray(d) && d[0] && d[0].error) || {};
    throw new Error(`ads ${r.status} ${g.status || ""} ${(g.message || "").slice(0, 160)}`.trim());
  }

  const metrics = {};
  for (const row of d.results || []) {
    const m = row.keywordMetrics || {};
    metrics[String(row.text || "").toLowerCase()] = {
      // ⚠️ บัญชีที่ไม่มียอดใช้จ่ายโฆษณาจริง Google จะให้ค่าแบบช่วงกว้าง ไม่ใช่เลขเป๊ะ
      avgMonthly: Number(m.avgMonthlySearches ?? 0) || null,
      competition: m.competition || "",           // LOW / MEDIUM / HIGH
      competitionIndex: Number(m.competitionIndex ?? 0) || null, // 0-100
      lowBid: Number(m.lowTopOfPageBidMicros ?? 0) / 1e6 || null,   // micros → บาท
      highBid: Number(m.highTopOfPageBidMicros ?? 0) / 1e6 || null,
      monthly: (m.monthlySearchVolumes || []).map((v) => ({
        month: `${v.year}-${String(v.month || "").padStart(2, "0")}`,
        searches: Number(v.monthlySearches ?? 0),
      })),
    };
  }
  return { available: true, metrics };
}
