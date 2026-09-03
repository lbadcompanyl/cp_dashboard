// สร้าง tools/zocial/schema.sql จาก functions/issue/api/_lib/schema.js (ความจริงกลาง)
// รัน: node tools/zocial/gen-schema.mjs
import { writeFileSync } from "node:fs";
import { DDL } from "../../functions/issue/api/_lib/schema.js";

const head = `-- ไฟล์นี้ "สร้างจากโค้ด" — ห้ามแก้ด้วยมือ
-- แก้ที่ functions/issue/api/_lib/schema.js แล้วรัน: node tools/zocial/gen-schema.mjs
-- (เทสต์ tests/zocial.mjs เทียบ 2 ไฟล์ให้ ถ้าไม่ตรงกันจะตก)
--
-- ⚠️ ปกติไม่ต้องรันไฟล์นี้เอง — endpoint สร้างตารางให้เองครั้งแรกที่ใช้งาน
--    เก็บไว้ให้คนอ่านและไว้กู้ระบบเวลาต้องสร้างใหม่จากศูนย์

`;
writeFileSync(new URL("./schema.sql", import.meta.url), head + DDL.map((s) => s.trim() + ";").join("\n\n") + "\n");
console.log("เขียน tools/zocial/schema.sql แล้ว ·", DDL.length, "คำสั่ง");
