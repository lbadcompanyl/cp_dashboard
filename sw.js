// Service worker — หน้าที่เดียว: กันไม่ให้แอปที่ติดตั้งบนมือถือค้างหน้าเก่า
//
// ทำไมต้องให้ sw คุม ไม่ใช่สคริปต์ในหน้า:
// สคริปต์เช็คเวอร์ชันในหน้าเว็บช่วยได้เฉพาะเครื่องที่โหลดหน้าใหม่ไปแล้ว — เครื่องที่
// ติดตั้งแอปไว้ก่อนหน้านั้นถือโค้ดเก่าที่ไม่มีตัวเช็ค เลยไม่มีทางอัปเดตตัวเองได้เลย
// ส่วน sw.js เบราว์เซอร์ไปตรวจเองทุกครั้งที่เปิดแอป โดยไม่ผ่าน cache ของหน้า
// จึงเป็นทางเดียวที่ไปถึงเครื่องที่ค้างอยู่แล้วได้
//
// ⚠️ แก้ไฟล์นี้ทีไรให้บวก SW_VERSION ด้วย — เบราว์เซอร์เทียบ byte ของไฟล์
// ถ้าเนื้อหาไม่ต่างเลยมันจะไม่ติดตั้งตัวใหม่
const SW_VERSION = 2;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      // ล้าง cache เก่าที่อาจค้างจาก sw รุ่นก่อน
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
      // บอกแท็บ/แอปที่เปิดอยู่ให้โหลดใหม่ จะได้เห็นของใหม่ทันทีไม่ต้องรอปิดเปิด
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.postMessage({ type: "sw-updated", version: SW_VERSION }));
    })()
  )
);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // สนใจเฉพาะการเปิดหน้า (HTML) — ไฟล์อื่นมี ?v= กำกับอยู่แล้ว ปล่อยผ่านตามปกติ
  if (req.mode !== "navigate") return;
  e.respondWith(
    (async () => {
      try {
        return await fetch(req, { cache: "no-store" }); // HTML เอาสดเสมอ
      } catch {
        // ออฟไลน์ → ใช้ของเก่าดีกว่าหน้าขาว
        const cached = await caches.match(req);
        return cached || Response.error();
      }
    })()
  );
});
