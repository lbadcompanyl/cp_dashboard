#!/usr/bin/env python3
"""
leakcheck.py — กันข้อสอบรั่ว: few-shot ใน worker.js ต้องไม่ซ้ำ/ไม่คล้ายกับ eval set

ทำไมต้องมี: รอบแรกรั่ว 5 ข้อจาก 14 โดยไม่มีใครรู้ ตัวเลข sarcasm บวมไป 25%
⚠️ ต้องจับ "คล้ายกัน" ไม่ใช่แค่ "ตรงเป๊ะ" — คอมเมนต์เดียวกันที่เว้นวรรค/สะกดต่างกันนิดเดียว
   ก็คือข้อสอบรั่วเหมือนกัน (เจอจริง: "ฝุ่น pm2.5" กับ "ฝุ่น pm 2.5")
⚠️ เส้นตัดที่ 0.70 — เคยตั้ง 0.80 แล้วมีข้อที่ 0.79 หลุดผ่านไปได้

ใช้:  python3 leakcheck.py <path/worker.js> <path/CPF_eval_verified_475.xlsx>
"""
import sys, re, difflib, unicodedata
import pandas as pd

CUTOFF = 0.70

def norm(s):
    s = unicodedata.normalize("NFKC", str(s))
    return re.sub(r"[\s​]+", " ", s).strip().lower()

def main():
    if len(sys.argv) < 3:
        sys.exit("ใช้: python3 leakcheck.py <worker.js> <eval.xlsx>")
    src = open(sys.argv[1], encoding="utf-8").read()
    block = src.split("const TWO_LENS_SHOTS")[1].split("];")[0]
    shots = re.findall(r'\{ t: "(.+?)", cp:', block)
    if not shots:
        sys.exit("อ่าน few-shot จาก worker.js ไม่ได้")

    gold = pd.read_excel(sys.argv[2])
    ev = [(norm(m), i) for m, i in zip(gold["message"], gold["id"])]
    keys = [k for k, _ in ev]

    bad = 0
    for k, s in enumerate(shots, 1):
        n = norm(s)
        hit = difflib.get_close_matches(n, keys, n=1, cutoff=CUTOFF)
        if hit:
            ratio = difflib.SequenceMatcher(None, n, hit[0]).ratio()
            eid = dict(ev)[hit[0]] if False else [i for kk, i in ev if kk == hit[0]][0]
            print("  🔴 ข้อ %2d รั่ว (คล้าย %.2f กับ eval id=%s): %s" % (k, ratio, eid, s[:55]))
            bad += 1
    print("ตรวจ few-shot %d ข้อ · รั่ว %d ข้อ %s" % (len(shots), bad, "✅" if bad == 0 else "❌"))
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
