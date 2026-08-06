// Service worker — หน้าที่เดียว: ทำให้เครื่องที่ติดตั้งเป็นแอปรู้ว่ามีของใหม่
//
// ⚠️ ตั้งใจ "ไม่ดัก fetch" — เคยดักแล้วพังมาแล้ว
// รุ่นก่อน (sw3/sw4) ดัก navigate แล้วยิงเน็ตเอง ถ้ายิงพลาดจะคืน Response.error()
// ซึ่งเบราว์เซอร์แปลว่า ERR_FAILED = หน้าเปิดไม่ขึ้นเลย (เกิดกับ /sd.html จริง)
// ความสดของ HTML มาจาก Cache-Control: no-cache ใน _headers อยู่แล้ว
// ไม่จำเป็นต้องให้ sw เข้ามายุ่ง — ยุ่งแล้วมีแต่ความเสี่ยง ไม่ได้อะไรเพิ่ม
//
// กฎ: ถ้าไม่มี fetch handler ที่เรียก respondWith เลย sw จะทำให้หน้าเว็บพังไม่ได้
//
// ⚠️ แก้ไฟล์นี้ทีไรให้บวก SW_VERSION ด้วย และทดสอบบน staging ก่อนเสมอ
const SW_VERSION = 5;

self.addEventListener("install", () => self.skipWaiting());

// หน้าเว็บถามเลขเวอร์ชันได้ — เอาไว้โชว์ว่าเครื่องถือ sw ตัวไหนอยู่ ไม่ต้องเดา
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "get-version" && e.source) {
    e.source.postMessage({ type: "sw-version", version: SW_VERSION });
  }
});

self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      // ล้าง cache ที่ sw รุ่นก่อนอาจทิ้งไว้
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
      // บอกหน้าที่เปิดอยู่ว่ามีของใหม่ — หน้าจะรีโหลดเอง (หรือขึ้นแถบให้กด)
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.postMessage({ type: "sw-updated", version: SW_VERSION }));
    })()
  )
);
