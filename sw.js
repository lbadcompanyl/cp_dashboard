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
const SW_VERSION = 4;

self.addEventListener("install", () => self.skipWaiting());

// หน้าเว็บถามเลขเวอร์ชันได้ — เอาไว้โชว์ให้เห็นว่าเครื่องถือ sw ตัวไหนอยู่
// (ที่ผ่านมาต้องเดาเอาว่าแอปอัปเดตหรือยัง เสียเวลาไล่หลายรอบ)
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "get-version" && e.source) {
    e.source.postMessage({ type: "sw-version", version: SW_VERSION });
  }
});

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
        // ⚠️ ห้ามส่ง req (mode=navigate) เข้า fetch พร้อม init — สเปคจะลดระดับ mode
        // เป็น same-origin เงียบๆ ทำให้ redirect ข้ามโดเมนพัง ยิงด้วย URL ตรงๆ แทน
        return await fetch(req.url, { cache: "no-store", credentials: "same-origin", redirect: "follow" });
      } catch {
        // ออฟไลน์ → ใช้ของเก่าดีกว่าหน้าขาว
        const cached = await caches.match(req);
        return cached || Response.error();
      }
    })()
  );
});
