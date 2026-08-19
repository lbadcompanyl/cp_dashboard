// ตัวช่วยขอสิทธิ์ครั้งเดียว — เอา refresh token ออกมาใส่ Cloudflare
// รองรับ 2 เจ้า: TikTok · Google (สำหรับ YouTube Analytics)
//
// ใช้ยังไง (ทำครั้งเดียวตอนติดตั้ง):
//   1. ใส่ SETUP_KEY ใน Cloudflare (ตั้งเป็นข้อความยาวๆ เดาไม่ได้)
//   2. เปิด  /social/api/connect?key=<SETUP_KEY>   แล้วเลือกว่าจะเชื่อมเจ้าไหน
//   3. กดอนุญาตด้วย "บัญชีของช่องที่ต้องการ" ← ไม่ใช่บัญชีส่วนตัว
//   4. หน้าจะโชว์ refresh token → ก๊อปไปใส่เป็น Secret ตามชื่อที่บอก
//   5. 🔴 ลบ SETUP_KEY ทิ้งทันที — ปิดประตูนี้ไว้ ไม่ใช้แล้วไม่ต้องเปิดค้าง
//
// 🔒 ทำไมต้องมี SETUP_KEY: หน้านี้แสดง refresh token ซึ่งเป็นความลับ
//    ถ้าเปิดโล่ง ใครกดตามลิงก์ก็เริ่มขั้นตอนขอสิทธิ์ในนามแอปเราได้
//    ⚠️ ไม่มี SETUP_KEY = ปิดสนิท ไม่ใช่เปิดให้ทุกคน (ค่าปริยายต้องปลอดภัยเสมอ)
//
// ⚠️ ทั้ง 2 เจ้าใช้ redirect URI เดียวกัน (/social/api/connect) จึงต้องรู้ว่ากำลังทำเจ้าไหนอยู่
//    ตอนกลับมา — พกไว้ใน state (ทั้งคู่ส่ง state กลับมาให้เหมือนที่ส่งไป)

/* ⚠️ ทุก scope ต้องเป็น "อ่านอย่างเดียว" — ต่อให้ token หลุด ก็ต้องทำอะไรกับช่องไม่ได้
   ห้ามเติม scope ที่เขียน/ลบข้อมูลได้เด็ดขาด */
const PROVIDERS = {
  tiktok: {
    label: "TikTok",
    authorize: "https://www.tiktok.com/v2/auth/authorize/",
    token: "https://open.tiktokapis.com/v2/oauth/token/",
    scope: "user.info.basic,user.info.profile,user.info.stats,video.list",
    idEnv: "TIKTOK_CLIENT_KEY",
    secretEnv: "TIKTOK_CLIENT_SECRET",
    out: "TIKTOK_REFRESH_TOKEN",
    // TikTok เรียกพารามิเตอร์ตัวนี้ว่า client_key ไม่ใช่ client_id
    idParam: "client_key",
    where: "หน้า App details ใน TikTok for Developers · ถ้าใช้ sandbox ต้องใช้ค่าของ sandbox",
    revoke: "เข้า TikTok แล้วถอนสิทธิ์แอปนี้ทิ้ง",
  },
  google: {
    label: "YouTube Analytics",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    /* ตัวเดียวพอ: อ่านรายงานสถิติของช่องตัวเอง
       ข้อมูลสาธารณะ (ชื่อคลิป ยอดวิว ไลก์) ใช้ API key เดิมอยู่แล้ว ไม่ต้องขอเพิ่ม */
    scope: "https://www.googleapis.com/auth/yt-analytics.readonly",
    idEnv: "GOOGLE_CLIENT_ID",
    secretEnv: "GOOGLE_CLIENT_SECRET",
    out: "YT_REFRESH_TOKEN",
    idParam: "client_id",
    where: "Google Cloud Console → APIs & Services → Credentials → OAuth client ID (ชนิด Web application)",
    revoke: "เข้า myaccount.google.com/permissions แล้วถอนสิทธิ์แอปนี้ทิ้ง",
    /* ⚠️ ไม่ใส่ 2 ตัวนี้ Google จะไม่ให้ refresh token เลย — ให้แต่ access token อายุ 1 ชม.
       prompt=consent จำเป็นแม้แต่ตอนกดอนุญาตซ้ำ ไม่งั้นครั้งที่สองจะไม่มี refresh_token ติดมา */
    extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
};

/** เทียบความลับแบบไม่แพ้เวลา — กันการเดาทีละตัวอักษรจากเวลาที่ตอบกลับ */
function sameSecret(a, b) {
  const x = String(a || ""), y = String(b || "");
  if (!x || !y || x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function page(title, bodyHtml, status = 200) {
  return new Response(
    `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<style>
 body{margin:0;background:#0d0d0d;color:#fff;font-family:system-ui,-apple-system,"Sarabun","Noto Sans Thai",sans-serif;line-height:1.6}
 .w{max-width:720px;margin:0 auto;padding:36px 20px 64px}
 h1{font-size:1.4rem;margin:0 0 6px} p{color:#c3c2b7}
 .box{background:#1a1a19;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:16px 18px;margin:18px 0}
 .tok{word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82rem;
      background:#232322;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:12px;color:#fff;user-select:all}
 .btn{display:inline-block;background:#3987e5;color:#fff;text-decoration:none;border-radius:999px;padding:11px 22px;font-weight:600}
 .bad{color:#f2555a} .warn{color:#f5a524} .ok{color:#4ade80}
 ol{color:#c3c2b7} li{margin:.4em 0} code{background:#232322;border-radius:5px;padding:1px 6px;font-size:.9em}
</style></head><body><div class="w">${bodyHtml}</div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );
}

/* state พาทั้ง "กุญแจ" และ "กำลังทำเจ้าไหน" ข้ามขั้นตอนกดอนุญาต
   ⚠️ ของเดิมส่งแต่กุญแจล้วน — ยังอ่านได้อยู่ ถือว่าเป็น TikTok (ของเก่าที่ค้างอยู่จะได้ไม่พัง) */
function packState(provider, key) { return provider + "|" + key; }
function unpackState(raw) {
  const t = String(raw || "");
  const i = t.indexOf("|");
  if (i < 0) return { provider: "tiktok", key: t };
  const p = t.slice(0, i);
  return { provider: PROVIDERS[p] ? p : "tiktok", key: t.slice(i + 1) };
}

export async function onRequest(context) {
  const env = context.env || {};
  const url = new URL(context.request.url);
  const redirectUri = url.origin + "/social/api/connect";

  // ── ประตูต้องปิดไว้เป็นค่าปริยาย ────────────────────────────────────
  const setupKey = String(env.SETUP_KEY || "").trim();
  if (!setupKey) {
    return page("ปิดอยู่", `<h1 class="bad">🔒 ปิดอยู่</h1>
      <p>ยังไม่ได้เปิดโหมดติดตั้ง ตั้ง <code>SETUP_KEY</code> ใน Cloudflare ก่อน แล้วค่อยเปิดหน้านี้อีกครั้ง</p>
      <div class="box warn">⚠️ ใช้เสร็จแล้ว <b>ลบ SETUP_KEY ทิ้งทุกครั้ง</b> อย่าเปิดค้างไว้</div>`, 403);
  }

  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const st = unpackState(url.searchParams.get("state"));
  const given = url.searchParams.get("key") || st.key || "";

  if (!sameSecret(given, setupKey)) {
    return page("กุญแจไม่ถูก", `<h1 class="bad">🔒 กุญแจไม่ถูกต้อง</h1>
      <p>เปิดด้วย <code>/social/api/connect?key=&lt;SETUP_KEY&gt;</code></p>`, 403);
  }

  // ── เลือกว่าจะเชื่อมเจ้าไหน ─────────────────────────────────────────
  const pKey = url.searchParams.get("p") || (code || err ? st.provider : "");
  const P = PROVIDERS[pKey];
  if (!P) {
    const link = (k) => `/social/api/connect?key=${encodeURIComponent(given)}&p=${k}`;
    return page("เลือกที่จะเชื่อม", `<h1>เชื่อมต่อช่อง</h1>
      <p>เลือกว่าจะขอสิทธิ์ของเจ้าไหน (ทำทีละเจ้า)</p>
      <div class="box">
        <p><a class="btn" href="${esc(link("google"))}">YouTube Analytics →</a></p>
        <p style="font-size:.86rem">สถิติรายวันของช่องเรา — ยอดวิว เวลาที่คนดู ผู้ติดตามเข้า/ออก
          <br>⚠️ ตัวเลขสาธารณะ (ชื่อคลิป ยอดวิว ไลก์) ใช้ <code>YT_API_KEY</code> เดิมอยู่แล้ว อันนี้คนละตัว</p>
      </div>
      <div class="box">
        <p><a class="btn" href="${esc(link("tiktok"))}">TikTok →</a></p>
      </div>
      <div class="box">
        <p style="margin:0 0 6px"><b>Redirect URI ที่ต้องใส่ให้ตรงกันเป๊ะทั้ง 2 เจ้า:</b></p>
        <div class="tok">${esc(redirectUri)}</div>
      </div>`);
  }

  const need = [P.idEnv, P.secretEnv].filter((n) => !String(env[n] || "").trim());
  if (need.length) {
    return page("ยังไม่ครบ", `<h1 class="warn">⚠️ ยังตั้งค่าไม่ครบ</h1>
      <p>ต้องใส่ค่าพวกนี้ใน Cloudflare ก่อน (แบบ Secret):</p>
      <div class="box">${need.map((n) => "<code>" + esc(n) + "</code>").join("<br>")}</div>
      <p>เอามาจาก ${esc(P.where)}</p>`, 400);
  }

  if (err) {
    return page("ไม่ได้รับอนุญาต", `<h1 class="bad">❌ ยังไม่ได้รับสิทธิ์</h1>
      <p>${esc(P.label)} แจ้งกลับมาว่า: <code>${esc(err)}</code></p>
      <p>${esc(url.searchParams.get("error_description") || "")}</p>
      <p><a class="btn" href="/social/api/connect?key=${encodeURIComponent(given)}&p=${esc(pKey)}">ลองใหม่</a></p>`, 400);
  }

  // ── ขั้นที่ 1: ส่งไปหน้ากดอนุญาต ────────────────────────────────────
  if (!code) {
    const auth = new URL(P.authorize);
    auth.searchParams.set(P.idParam, env[P.idEnv]);
    auth.searchParams.set("scope", P.scope);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set("state", packState(pKey, setupKey));
    Object.keys(P.extra || {}).forEach((k) => auth.searchParams.set(k, P.extra[k]));

    const googleNote = pKey === "google" ? `
      <div class="box warn">⚠️ <b>ช่องที่เป็น Brand Account</b> — บัญชี Google ที่กดอนุญาตต้องมีสิทธิ์
        เจ้าของหรือผู้จัดการของช่องนั้น ไม่งั้นจะได้รายงานของช่องส่วนตัวแทนโดยไม่มีอะไรเตือน</div>` : "";

    return page("เชื่อมต่อ " + P.label, `<h1>เชื่อมต่อ ${esc(P.label)}</h1>
      <p>กดปุ่มข้างล่างเพื่อไปหน้าอนุญาต</p>
      <div class="box warn">⚠️ <b>ต้องล็อกอินด้วยบัญชีของช่องที่ต้องการดูสถิติ</b> ไม่ใช่บัญชีส่วนตัว<br>
        ถ้าตอนนี้เบราว์เซอร์ค้างบัญชีอื่นอยู่ ให้ออกจากระบบก่อน</div>
      ${googleNote}
      <p><a class="btn" href="${esc(auth.toString())}">ไปหน้าอนุญาต →</a></p>
      <div class="box">
        <p style="margin:0 0 6px"><b>Redirect URI ที่ต้องใส่ให้ตรงกันเป๊ะ:</b></p>
        <div class="tok">${esc(redirectUri)}</div>
        <p style="margin:8px 0 0;font-size:.86rem">ไม่ตรงแม้แต่ตัวเดียวจะไม่ยอมส่งกลับมา</p>
      </div>`);
  }

  // ── ขั้นที่ 2: แลก code เป็น token ───────────────────────────────────
  let j = null, httpStatus = 0;
  try {
    const body = { code, grant_type: "authorization_code", redirect_uri: redirectUri, client_secret: env[P.secretEnv] };
    body[P.idParam] = env[P.idEnv];
    const r = await fetch(P.token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
    httpStatus = r.status;
    j = await r.json().catch(() => null);
  } catch (e) {
    return page("ต่อไม่ติด", `<h1 class="bad">❌ ต่อกับ ${esc(P.label)} ไม่ได้</h1><p>${esc(e.message || String(e))}</p>`, 502);
  }

  if (!j || !j.refresh_token) {
    const msg = (j && (j.error_description || j.error)) || `HTTP ${httpStatus}`;
    /* ⚠️ Google ให้ refresh token เฉพาะครั้งแรกที่กดอนุญาต ถ้าเคยอนุญาตไปแล้ว
       จะได้แต่ access token — เราส่ง prompt=consent ไปแล้วจึงไม่ควรเจอ
       แต่ถ้าเจอ ทางแก้คือถอนสิทธิ์แอปทิ้งแล้วทำใหม่ */
    const hint = pKey === "google"
      ? `<div class="box">ถ้าได้ token มาแต่ไม่มี <b>refresh token</b> แปลว่าบัญชีนี้เคยอนุญาตไว้แล้ว —
           เข้า <code>myaccount.google.com/permissions</code> ถอนสิทธิ์แอปนี้ทิ้ง แล้วทำใหม่</div>`
      : `<div class="box">เช็ค 3 อย่าง: <b>Redirect URI</b> ตรงกับที่ตั้งไว้ไหม ·
           ใช้ Client key/secret <b>ชุดเดียวกัน</b> กับที่กดอนุญาตหรือเปล่า (sandbox กับ production คนละชุด) ·
           code ใช้ได้ครั้งเดียวและหมดอายุเร็ว ลองเริ่มใหม่</div>`;
    return page("แลกไม่สำเร็จ", `<h1 class="bad">❌ แลกสิทธิ์ไม่สำเร็จ</h1>
      <p>${esc(P.label)} ตอบว่า: <code>${esc(msg)}</code></p>
      ${hint}
      <p><a class="btn" href="/social/api/connect?key=${encodeURIComponent(given)}&p=${esc(pKey)}">เริ่มใหม่</a></p>`, 400);
  }

  // ⚠️ โชว์ครั้งเดียวตรงนี้เท่านั้น — ไม่เก็บลง KV ไม่เขียน log
  //    เก็บไว้ที่ไหนก็เป็นความลับเพิ่มอีกที่ที่ต้องคอยระวัง
  return page("สำเร็จ", `<h1 class="ok">✅ ได้สิทธิ์ ${esc(P.label)} แล้ว</h1>
    <p>ก๊อปค่าข้างล่างไปใส่ Cloudflare → Settings → Variables and Secrets</p>
    <div class="box">
      <p style="margin:0 0 8px"><b>${esc(P.out)}</b> — ใส่แบบ <b>Secret</b> เท่านั้น</p>
      <div class="tok">${esc(j.refresh_token)}</div>
    </div>
    <ol>
      <li>ใส่เป็น <code>${esc(P.out)}</code> <b>ทั้ง Production และ Preview</b></li>
      <li>กด <b>Retry deployment</b> ไม่งั้นค่าใหม่ยังไม่มีผล</li>
      <li>🔴 <b>ลบ <code>SETUP_KEY</code> ทิ้ง</b> เพื่อปิดหน้านี้</li>
      <li>เปิด <code>/social/api/status</code> ดูว่าครบทุกช่องแล้ว</li>
    </ol>
    <div class="box warn">⚠️ อย่าส่งค่านี้ทางแชท อีเมล หรือ commit ลง repo — repo เป็น public<br>
      ถ้าเผลอหลุดไปแล้ว ให้${esc(P.revoke)} แล้วทำขั้นตอนนี้ใหม่</div>`);
}
