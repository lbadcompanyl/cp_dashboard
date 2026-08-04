// Minimal service worker — ทำให้ติดตั้งเป็น PWA บน Android ได้ (โชว์ "ติดตั้งแอป")
// pass-through ล้วน: ไม่ cache อะไรเลย → ไม่มีทางเสิร์ฟ HTML/ข้อมูลเก่าค้าง
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {}); // ปล่อยให้เครือข่ายจัดการปกติ (แค่มี handler ให้ผ่านเกณฑ์ติดตั้ง)
