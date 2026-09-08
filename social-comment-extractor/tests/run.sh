#!/usr/bin/env bash
# รันเทสต์ของห้อง sentiment ทั้งหมด — ใช้ได้ทั้งในเครื่องที่รัน session และบน CI
#
# 🎯 ทำไมต้องมีไฟล์นี้ (สร้าง 8 ก.ย. 2026)
#    เจ้าของถาม: "งั้นก็ต้องตรวจทุกห้องซิ" — ก่อนหน้านี้วิธีรันเขียนไว้เป็น
#    ขั้นตอนก๊อปวางใน README.md แปลว่า **มีแต่ AI ที่นั่งรันเองทีละบรรทัด**
#    ไม่มีใครตรวจซ้ำ ซึ่งชนกฎข้อ 3 ของเจ้าของเอง ("อย่าเชื่อ self-report ของ AI")
#
# วิธีใช้:  bash run.sh
#
# ⚠️ ต้องมีเซิร์ฟเวอร์ static ที่พอร์ต 8899 ให้เทสต์ฝั่งหน้าเว็บใช้ — สคริปต์เปิดให้เอง
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CORE="$ROOT/functions/issue/api/sentiment/_core.js"
WORK="${TMPDIR:-/tmp}/sentiment-tests"
PORT="${TEST_PORT:-8899}"

# playwright ถูกลงไว้ที่เดียวคือ tests/ ของห้องแดชบอร์ด — node หาเองไม่เจอเพราะคนละสาย
export NODE_PATH="$ROOT/tests/node_modules"

# ── 1. ประกอบ w.mjs ────────────────────────────────────────────────
# ⚠️ **ต้องใส่ให้ครบทุกชื่อในบรรทัดเดียว** — เคยเติมแค่บางชื่อแล้วเทสต์ตัวอื่นพังหมด
#    (`_core.js` ตั้งใจไม่มี export ในตัว เพราะมันคือไฟล์ที่ Cloudflare เอาไปรันจริง)
#    🔗 เพิ่ม export ใหม่ที่นี่ที่เดียว — README.md ชี้มาที่ไฟล์นี้ ไม่ได้ก๊อปลิสต์ไปไว้อีกชุด
rm -rf "$WORK" && mkdir -p "$WORK"
cp "$CORE" "$WORK/w.mjs"
cat >> "$WORK/w.mjs" <<'EOF'
export { classifyTwoLens, normLens, systemTwoLens, TWO_LENS_SHOTS, extractJsonArray,
         nestedReplies, scComment, fetchYouTube, INCLUDE_REPLIES,
         feedbackRoute, fbClean, FB_MAX, FB_MAX_PER_REQ, FB_MAX_TEXT,
         EFFORT_CHOICES, EFFORT_MODELS, analyze, countTerms,
         PROFILES, getProfile, DEFAULT_PROFILE,
         sampleQuota, SAMPLE_MIN, SAMPLE_MAX, dupKey, systemBlackchin, BLACKCHIN_SHOTS };
EOF
cp "$HERE"/*.mjs "$WORK/" 2>/dev/null || true

# ── 2. เซิร์ฟเวอร์ static (เทสต์ฝั่งหน้าเว็บต้องใช้) ─────────────────
SRV=""
if curl -sf -o /dev/null "http://127.0.0.1:$PORT/issue/sentiment.html"; then
  echo "· ใช้เซิร์ฟเวอร์ที่เปิดอยู่แล้วที่พอร์ต $PORT"
else
  python3 -m http.server "$PORT" --directory "$ROOT" >/dev/null 2>&1 &
  SRV=$!
  for _ in $(seq 1 30); do
    curl -sf -o /dev/null "http://127.0.0.1:$PORT/issue/sentiment.html" && break
    sleep 1
  done
  if ! curl -sf -o /dev/null "http://127.0.0.1:$PORT/issue/sentiment.html"; then
    echo "❌ เซิร์ฟเวอร์ไม่ขึ้นภายใน 30 วิ"; exit 1
  fi
fi
cleanup() { [ -n "$SRV" ] && kill "$SRV" 2>/dev/null; }
trap cleanup EXIT

# ── 3. รันทีละไฟล์ ─────────────────────────────────────────────────
mkdir -p "$WORK/logs"
fails=""; pass=0
run_one() {  # $1 = ชื่อไฟล์ที่แสดง · $2 = ที่อยู่จริง · $3 = โฟลเดอร์ที่ต้องรันอยู่
  echo "─────────── $1 ───────────"
  if (cd "$3" && timeout 300 node "$2" 2>&1) | tee "$WORK/logs/$1.log"; then
    # ⚠️ pipefail อย่างเดียวไม่พอ — ต้องอ่านสถานะของ node ตัวจริง ไม่ใช่ของ tee
    [ "${PIPESTATUS[0]}" -eq 0 ] && pass=$((pass+1)) || fails="$fails $1"
  else
    fails="$fails $1"
  fi
}

for f in "$WORK"/*.mjs; do
  n="$(basename "$f")"
  [ "$n" = "w.mjs" ] && continue
  run_one "$n" "$f" "$WORK"
done
for f in "$HERE"/*.cjs; do
  n="$(basename "$f")"
  [ "$n" = "browser.cjs" ] && continue   # ตัวช่วย ไม่ใช่เทสต์
  run_one "$n" "$f" "$HERE"
done

# ⚠️ leakcheck.py ไม่ได้อยู่ในรอบนี้ — มันต้องใช้ไฟล์ชุดสอบ (.xlsx) ที่ **ห้าม commit**
#    (มีเฉลยอยู่ข้างใน) ต้องรันด้วยมือตอนแก้ few-shot เท่านั้น

# ── 4. สรุป ────────────────────────────────────────────────────────
echo
if [ -n "$fails" ]; then
  # สรุปข้อที่ตกซ้ำท้ายสุด — เครื่องมืออ่าน log ของ GitHub ให้มาแต่ท้ายไฟล์
  echo "══════════ รายละเอียดข้อที่ตก ══════════"
  for f in $fails; do
    echo "── $f"
    # ไม่มี ❌ = ไฟล์นั้นพังกลางทาง (โยน error / หมดเวลา) ไม่ใช่ข้อทดสอบตก
    if grep -q '❌' "$WORK/logs/$f.log"; then
      grep -n -B2 '❌' "$WORK/logs/$f.log" | tail -60
    else
      echo "   (ไม่มีข้อที่ตก = พังกลางทาง — ท้าย log:)"
      tail -40 "$WORK/logs/$f.log"
    fi
  done
  echo
  echo "❌ ชุดผ่าน $pass · ตก:$fails"
  exit 1
fi
echo "✅ ผ่านหมด $pass ชุด"
