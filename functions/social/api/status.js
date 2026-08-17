// เช็คว่าตั้งค่าอะไรไปแล้วบ้าง — ใช้ตอนติดตั้ง จะได้ไม่ต้องเดาว่าใส่ค่าครบหรือยัง
//
// 🔒 คืนแค่ "ตั้งค่าแล้ว/ยังไม่ได้ตั้ง" เป็น true/false เท่านั้น
//    ⚠️ ห้ามคืนค่าจริงของ secret ออกไปเด็ดขาด แม้แต่บางส่วน
//    (ความยาว/ตัวอักษรต้นท้ายก็ไม่เอา — เป็นเบาะแสให้เดาต่อได้)

const GROUPS = [
  {
    key: "youtube", label: "YouTube",
    vars: [
      { name: "YT_API_KEY", secret: true, note: "ใส่ไว้แล้วตั้งแต่ทำคอลัมน์เทรนด์" },
      { name: "YT_CHANNEL_HANDLE", secret: false, note: "เช่น @ชื่อช่อง — หรือใช้ YT_CHANNEL_ID แทนก็ได้" },
    ],
    // ช่องไหนใส่ YT_CHANNEL_ID มาแทน ก็ถือว่าครบเหมือนกัน
    altOk: (env) => !!(env.YT_API_KEY && (env.YT_CHANNEL_HANDLE || env.YT_CHANNEL_ID)),
  },
  {
    key: "facebook", label: "Facebook Page",
    vars: [
      { name: "FB_PAGE_ID", secret: false, note: "เลข ID ของเพจ" },
      { name: "FB_PAGE_TOKEN", secret: true, note: "Page Access Token — ต้องมีสิทธิ์ read_insights" },
    ],
  },
  {
    key: "tiktok", label: "TikTok",
    vars: [
      { name: "TIKTOK_CLIENT_KEY", secret: true, note: "จากหน้า App details" },
      { name: "TIKTOK_CLIENT_SECRET", secret: true, note: "จากหน้า App details" },
      { name: "TIKTOK_REFRESH_TOKEN", secret: true, note: "ได้จาก /social/api/connect" },
    ],
  },
];

const has = (env, n) => !!String((env && env[n]) || "").trim();

export function onRequest(context) {
  const env = context.env || {};

  const groups = GROUPS.map((g) => {
    const vars = g.vars.map((v) => ({ ...v, set: has(env, v.name) }));
    const ready = g.altOk ? g.altOk(env) : vars.every((v) => v.set);
    return {
      key: g.key,
      label: g.label,
      ready,
      missing: vars.filter((v) => !v.set).map((v) => v.name),
      vars,
    };
  });

  return new Response(
    JSON.stringify({
      ok: true,
      // ⚠️ Pages แยก env ของ Preview กับ Production คนละชุด — ใส่ที่เดียวแล้วอีกที่จะว่าง
      //    บอกไว้ตรงนี้ว่ากำลังดูของ branch ไหนอยู่ จะได้ไม่ไล่หาผิดที่ (เคยเสียเวลามาแล้ว)
      branch: env.CF_PAGES_BRANCH || "(ไม่ทราบ — น่าจะรันในเครื่อง)",
      kv: !!env.FLAGS_KV,
      setupOpen: has(env, "SETUP_KEY"),
      groups,
      allReady: groups.every((g) => g.ready),
    }, null, 2),
    { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }
  );
}
