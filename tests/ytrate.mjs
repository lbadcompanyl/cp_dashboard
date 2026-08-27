// 📈 "มาแรง" ของคอลัมน์ YouTube = วิว/ชม. ไม่ใช่ "วิวที่เพิ่มในช่วงที่เลือก"
//
// เจ้าของถาม 27 ส.ค. 2026 พร้อมภาพ 2 ใบ: "ทำไมหมวดข่าวถึงมี view เยอะกว่าทั่วไป?
// มีความผิดปรกติ ทั่วไปน่าจะกว้างกว่าและเยอะกว่า"
//
// ต้นเหตุ: `d24` มี 2 ทางที่คนละหน่วยกันแต่หน้าเว็บเขียนเหมือนกันว่า "+X ใน 24 ชม."
//   1. มีภาพยอดวิวเก่าให้ลบ  → วิวที่เพิ่มจริง
//   2. คลิปเพิ่งลงในช่วงนั้น → ยกยอดสะสมทั้งก้อนมาเป็น "วิวเพิ่ม"
// หมวดข่าว (News & Politics) เป็นคลิปที่ลงวันนี้แทบทั้งหมด จึงตกทาง 2 ทุกใบ
// ส่วนหมวดทั่วไปเป็น MV/หนัง/เกมอายุหลายวัน ตกเป็น null แล้วถูกดันไปท้ายลิสต์
// ทั้งที่ยอดวิวเยอะกว่าหลายเท่า
//
// รันด้วย: node ytrate.mjs
import fs from "node:fs";
import { withDeltas, rateFor } from "../functions/api/trend/yttrends.js";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅ " + n)) : (fail++, console.log("  ❌ " + n + (x ? " → " + x : ""))); };

const H = 3600000;
const now = Date.parse("2026-08-27T12:00:00Z");
const mk = (id, views, ageH) => ({ id, views, published: now - ageH * H });
// สถิติที่เก็บได้จริงตอนนี้ยังไม่ถึง 24 ชม. — ตรงกับที่หน้าเว็บขึ้นป้ายเตือนไว้
const hist = [8, 6, 4, 2].map((h) => ({ t: now - h * H, v: {} }));

console.log("\n[1] พิสูจน์อาการที่เจ้าของเจอ — d24 ของคลิปใหม่คือ 'ยอดสะสมทั้งก้อน'");
{
  const news = [mk("n1", 1500000, 6), mk("n2", 589000, 20)];
  const gen = [mk("g1", 12000000, 96), mk("g2", 8000000, 72), mk("g3", 149000, 5)];
  const dn = withDeltas(news, hist, now);
  const dg = withDeltas(gen, hist, now);

  ok("คลิปข่าวอายุ 6 ชม. → d24 = ยอดวิวทั้งหมด (ไม่ใช่วิวเพิ่มจริง)",
    dn[0].d24 === dn[0].views, String(dn[0].d24));
  ok("คลิปทั่วไปอายุ 96 ชม. ไม่มียอดเดิมให้ลบ → d24 = null",
    dg[0].d24 === null, String(dg[0].d24));
  // นี่คือ "46 จาก 50" กับ "20 จาก 50" ที่เจ้าของเห็นบนป้ายท้ายคอลัมน์
  ok("ผลลัพธ์: ข่าวมี d24 ครบ · ทั่วไปมีแค่ใบที่เพิ่งลง",
    dn.every((x) => x.d24 != null) && dg.filter((x) => x.d24 != null).length === 1);
  ok("🔴 และตัวเลขของข่าวใหญ่กว่าทั่วไปทั้งที่ทั่วไปวิวเยอะกว่า 8 เท่า",
    dn[0].d24 > (dg[0].d24 || 0) && dg[0].views >= dn[0].views * 8,
    `ข่าว ${dn[0].d24} · ทั่วไป ${dg[0].d24} (ยอดรวม ${dg[0].views})`);
}

console.log("\n[2] วิว/ชม. — ทุกใบต้องมีตัวเลข ไม่มีใบไหนตกท้ายเพราะ 'ยังไม่รู้'");
{
  const all = withDeltas(
    [mk("a", 12000000, 96), mk("b", 8000000, 72), mk("c", 149000, 5), mk("d", 144000, 9)],
    hist, now
  );
  ok("ทุกใบมี r24", all.every((x) => x.r24 != null), JSON.stringify(all.map((x) => x.r24)));
  ok("ทุกใบบอกด้วยว่าวัดจากกี่ชั่วโมง", all.every((x) => x.rh24 > 0));
  ok("ยังไม่เคยเก็บยอดของใบไหนเลย → basis = u (เฉลี่ยตั้งแต่ลง)",
    all.every((x) => x.rb24 === "u"), JSON.stringify(all.map((x) => x.rb24)));

  // 🎯 หัวใจของการแก้: คลิปเก่าที่วิวเยอะต้องกลับมาอยู่เหนือคลิปใหม่ที่วิวน้อย
  const order = all.slice().sort((x, y) => y.r24 - x.r24).map((x) => x.id);
  ok("เรียงด้วยวิว/ชม. แล้ว MV 12 ล้านอยู่เหนือคลิปเล็กที่เพิ่งลง",
    order.indexOf("a") < order.indexOf("c"), order.join(" > "));
  ok("คลิป 149K อายุ 5 ชม. = ~30K/ชม. ไม่ใช่ 149K",
    Math.round(all[2].r24) === Math.round(149000 / 5), String(Math.round(all[2].r24)));
}

console.log("\n[3] มีสถิติเก็บไว้แล้ว → ต้องวัดจากของจริง ไม่ใช่เฉลี่ยตั้งแต่ลง");
{
  const h2 = [{ t: now - 6 * H, v: { a: 11400000 } }, { t: now - 2 * H, v: { a: 11800000 } }];
  const [it] = withDeltas([mk("a", 12000000, 96)], h2, now);
  ok("basis = m (วัดจากสถิติ)", it.rb24 === "m", it.rb24);
  ok("เลือกภาพที่ใกล้ 24 ชม.ที่สุดเท่าที่มี = ตัวเก่าสุด (6 ชม.)", Math.round(it.rh24) === 6, String(it.rh24));
  ok("(12,000,000 - 11,400,000) / 6 ชม. = 100,000/ชม.", Math.round(it.r24) === 100000, String(Math.round(it.r24)));
  // ⚠️ d24 ยังต้องเป็น null อยู่ — มันเป็นตัวเลขที่เคร่งครัดกว่า ห้ามผ่อนเกณฑ์ให้มัน
  ok("d24 ยังคงเป็น null (เกณฑ์เดิมไม่ถูกผ่อน)", it.d24 === null, String(it.d24));
}

console.log("\n[4] กันตัวเลขเหวี่ยง");
{
  // ภาพที่เพิ่งเก็บไปเมื่อ 10 นาทีก่อน ช่วงสั้นเกินไป หารแล้วได้เลขมหาศาล
  const fresh = [{ t: now - 10 * 60000, v: { a: 11999000 } }];
  const [it] = withDeltas([mk("a", 12000000, 96)], fresh, now);
  ok("ภาพที่ใหม่กว่า 45 นาที ไม่เอามาหาร", it.rb24 === "u", it.rb24);
  ok("ตกไปใช้เฉลี่ยตั้งแต่ลงแทน = 125,000/ชม.", Math.round(it.r24) === Math.round(12000000 / 96),
    String(Math.round(it.r24)));

  // ไลฟ์/คลิปที่ต้นทางไม่บอกเวลาลง — ไม่มีอะไรให้หาร ต้องคืน null ไม่ใช่เดา 0
  const [nolive] = withDeltas([{ id: "z", views: 5000, published: 0 }], [], now);
  ok("ต้นทางไม่บอกเวลาที่ลง → r24 = null (ไม่ใช่ 0)", nolive.r24 === null, String(nolive.r24));

  // ยอดวิวลดลง (ต้นทางนับใหม่/แก้ตัวเลข) ต้องไม่ได้ค่าติดลบ
  const drop = [{ t: now - 4 * H, v: { a: 20000 } }];
  const neg = rateFor({ id: "a", views: 10000 }, drop, now, 24, 50);
  ok("ยอดวิวลดลงก็ไม่ติดลบ", neg.r24 === 0, String(neg.r24));
}

console.log("\n[5] กฎระดับโค้ด — กันไม่ให้ใครเผลอกลับไปใช้ของเดิม");
{
  const app = fs.readFileSync(new URL("../trend/app.js", import.meta.url), "utf8");
  ok("หน้าเว็บเรียงด้วย r{w} ไม่ใช่ d{w}", /const rkey = isGrowth \? "r" \+ winH/.test(app));
  ok("ไม่มีการหาร d{w} ด้วย winH เองที่หน้าเว็บ", !/\[dkey\]\s*\/\s*winH|d\d+\s*\/\s*winH/.test(app));
  // 🚫 ป้ายบนการ์ดห้ามกลับไปเขียนว่า "+X ใน N ชม." — เป็นข้อความที่ไม่ตรงกับตัวเลข
  ok("ป้ายบนการ์ดเป็นวิว/ชม.", /ratePerH\(/.test(app) && /วิว\/ชม\./.test(app));
  ok("ป้ายบอกด้วยว่าวัดจากช่วงไหน (ywhy)", /class="ywhy"/.test(app));
  ok("แมป histHours จาก server แล้ว (เคยลืมจนขึ้น '0 ชม.' ตลอด)", /histHours: Number\(d\.histHours\)/.test(app));

  const yt = fs.readFileSync(new URL("../functions/api/trend/yttrends.js", import.meta.url), "utf8");
  const ver = yt.match(/const DATA_VER = "(\d+)"/);
  ok("บวก DATA_VER แล้ว (ไม่งั้นของเก่าใน KV/edge ถูกเสิร์ฟต่อ ไม่มี r{w} ติดมา)",
    ver && Number(ver[1]) >= 9, ver ? ver[1] : "หาไม่เจอ");
  const css = fs.readFileSync(new URL("../trend/styles.css", import.meta.url), "utf8");
  ok("มีสไตล์ของ .ywhy", /\.ywhy/.test(css));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ตก ${fail}\n`);
process.exit(fail ? 1 : 0);
