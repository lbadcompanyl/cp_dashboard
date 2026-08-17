// ตัวช่วยขอสิทธิ์ TikTok ครั้งเดียว — เอา refresh token ออกมาใส่ Cloudflare
//
// ใช้ยังไง (ทำครั้งเดียวตอนติดตั้ง):
//   1. ใส่ SETUP_KEY ใน Cloudflare (ตั้งเป็นข้อความยาวๆ เดาไม่ได้)
//   2. เปิด  /social/api/connect?key=<SETUP_KEY>
//   3. กดอนุญาตด้วย "บัญชีของช่องที่ต้องการ" ← ไม่ใช่บัญชีส่วนตัว
//   4. หน้าจะโชว์ refresh token → ก๊อปไปใส่ TIKTOK_REFRESH_TOKEN แบบ Secret
//   5. 🔴 ลบ SETUP_KEY ทิ้งทันที — ปิดประตูนี้ไว้ ไม่ใช้แล้วไม่ต้องเปิดค้าง
//
// 🔒 ทำไมต้องมี SETUP_KEY: หน้านี้แสดง refresh token ซึ่งเป็นความลับ
//    ถ้าเปิดโล่ง ใครกดตามลิงก์ก็เริ่มขั้นตอนขอสิทธิ์ในนามแอปเราได้
//    ⚠️ ไม่มี SETUP_KEY = ปิดสนิท ไม่ใช่เปิดให้ทุกคน (ค่าปริยายต้องปลอดภัยเสมอ)

const AUTHORIZE = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";

// อ่านอย่างเดียวทั้งหมด — ไม่ขอสิทธิ์โพสต์/แก้/ลบ
// ⚠️ ห้ามเติม scope ที่เขียนข้อมูลได้ ต่อให้ token หลุดก็ต้องทำอะไรกับช่องไม่ได้
const SCOPES = "user.info.basic,user.info.profile,user.info.stats,video.list";

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
  // TikTok ส่ง state กลับมาให้เหมือนที่เราส่งไป — ใช้พา key ข้ามขั้นตอนกดอนุญาต
  const given = url.searchParams.get("key") || url.searchParams.get("state") || "";

  if (!sameSecret(given, setupKey)) {
    return page("กุญแจไม่ถูก", `<h1 class="bad">🔒 กุญแจไม่ถูกต้อง</h1>
      <p>เปิดด้วย <code>/social/api/connect?key=&lt;SETUP_KEY&gt;</code></p>`, 403);
  }

  const need = ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"].filter((n) => !String(env[n] || "").trim());
  if (need.length) {
    return page("ยังไม่ครบ", `<h1 class="warn">⚠️ ยังตั้งค่าไม่ครบ</h1>
      <p>ต้องใส่ค่าพวกนี้ใน Cloudflare ก่อน (แบบ Secret):</p>
      <div class="box">${need.map((n) => "<code>" + esc(n) + "</code>").join("<br>")}</div>
      <p>เอามาจากหน้า <b>App details</b> ใน TikTok for Developers · ถ้าใช้ sandbox ต้องใช้ค่าของ sandbox</p>`, 400);
  }

  if (err) {
    return page("ไม่ได้รับอนุญาต", `<h1 class="bad">❌ ยังไม่ได้รับสิทธิ์</h1>
      <p>TikTok แจ้งกลับมาว่า: <code>${esc(err)}</code></p>
      <p>${esc(url.searchParams.get("error_description") || "")}</p>
      <p><a class="btn" href="/social/api/connect?key=${encodeURIComponent(given)}">ลองใหม่</a></p>`, 400);
  }

  // ── ขั้นที่ 1: ส่งไปหน้ากดอนุญาตของ TikTok ──────────────────────────
  if (!code) {
    const auth = new URL(AUTHORIZE);
    auth.searchParams.set("client_key", env.TIKTOK_CLIENT_KEY);
    auth.searchParams.set("scope", SCOPES);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set("state", setupKey);

    return page("เชื่อมต่อ TikTok", `<h1>เชื่อมต่อ TikTok</h1>
      <p>กดปุ่มข้างล่างเพื่อไปหน้าอนุญาตของ TikTok</p>
      <div class="box warn">⚠️ <b>ต้องล็อกอินด้วยบัญชีของช่องที่ต้องการดูสถิติ</b> ไม่ใช่บัญชีส่วนตัว<br>
        ถ้าตอนนี้เบราว์เซอร์ค้างบัญชีอื่นอยู่ ให้ออกจากระบบ TikTok ก่อน</div>
      <p><a class="btn" href="${esc(auth.toString())}">ไปหน้าอนุญาตของ TikTok →</a></p>
      <div class="box">
        <p style="margin:0 0 6px"><b>Redirect URI ที่ต้องใส่ในหน้า App details ให้ตรงกันเป๊ะ:</b></p>
        <div class="tok">${esc(redirectUri)}</div>
        <p style="margin:8px 0 0;font-size:.86rem">ไม่ตรงแม้แต่ตัวเดียว TikTok จะไม่ยอมส่งกลับมา</p>
      </div>`);
  }

  // ── ขั้นที่ 2: แลก code เป็น token ───────────────────────────────────
  let j = null, httpStatus = 0;
  try {
    const r = await fetch(TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: env.TIKTOK_CLIENT_KEY,
        client_secret: env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
    });
    httpStatus = r.status;
    j = await r.json().catch(() => null);
  } catch (e) {
    return page("ต่อไม่ติด", `<h1 class="bad">❌ ต่อกับ TikTok ไม่ได้</h1><p>${esc(e.message || String(e))}</p>`, 502);
  }

  if (!j || !j.refresh_token) {
    const msg = (j && (j.error_description || j.error)) || `HTTP ${httpStatus}`;
    return page("แลกไม่สำเร็จ", `<h1 class="bad">❌ แลกสิทธิ์ไม่สำเร็จ</h1>
      <p>TikTok ตอบว่า: <code>${esc(msg)}</code></p>
      <div class="box">เช็ค 3 อย่าง: <b>Redirect URI</b> ตรงกับที่ตั้งใน App details ไหม ·
        ใช้ Client key/secret ของ <b>ชุดเดียวกัน</b> กับที่กดอนุญาตหรือเปล่า (sandbox กับ production คนละชุด) ·
        code ใช้ได้ครั้งเดียวและหมดอายุเร็ว ลองเริ่มใหม่</div>
      <p><a class="btn" href="/social/api/connect?key=${encodeURIComponent(given)}">เริ่มใหม่</a></p>`, 400);
  }

  // ⚠️ โชว์ครั้งเดียวตรงนี้เท่านั้น — ไม่เก็บลง KV ไม่เขียน log
  //    เก็บไว้ที่ไหนก็เป็นความลับเพิ่มอีกที่ที่ต้องคอยระวัง
  return page("สำเร็จ", `<h1 class="ok">✅ ได้สิทธิ์แล้ว</h1>
    <p>ก๊อปค่าข้างล่างไปใส่ Cloudflare → Settings → Variables and Secrets</p>
    <div class="box">
      <p style="margin:0 0 8px"><b>TIKTOK_REFRESH_TOKEN</b> — ใส่แบบ <b>Secret</b> เท่านั้น</p>
      <div class="tok">${esc(j.refresh_token)}</div>
    </div>
    <ol>
      <li>ใส่เป็น <code>TIKTOK_REFRESH_TOKEN</code> <b>ทั้ง Production และ Preview</b></li>
      <li>กด <b>Retry deployment</b> ไม่งั้นค่าใหม่ยังไม่มีผล</li>
      <li>🔴 <b>ลบ <code>SETUP_KEY</code> ทิ้ง</b> เพื่อปิดหน้านี้</li>
      <li>เปิด <code>/social/api/status</code> ดูว่าครบทุกช่องแล้ว</li>
    </ol>
    <div class="box warn">⚠️ อย่าส่งค่านี้ทางแชท อีเมล หรือ commit ลง repo — repo เป็น public<br>
      ถ้าเผลอหลุดไปแล้ว ให้เข้า TikTok แล้วถอนสิทธิ์แอปนี้ทิ้ง แล้วทำขั้นตอนนี้ใหม่</div>`);
}
