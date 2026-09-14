// Worker مستقل پردازش — مرحله B
// اجرا: bun worker/worker.ts  (کاربر غیر ریشه، بدون تماس شبکه، سقف حافظه از اسکریپت npm)
import { PrismaClient } from '@prisma/client';
import path from 'path';

export const DATA_ROOT = path.join(process.cwd(), 'data');
export const OBJECT_ROOT = path.join(DATA_ROOT, 'objectstore');
export const TMP_ROOT = path.join(DATA_ROOT, 'tmp');

export const db = new PrismaClient();

// یک واژه با مختصات نرمال 0..1 نسبت به صفحه — پایهٔ جست‌وجو و هایلایت
export interface W {
  t: string;   // متن واژه
  x: number;   // x0 نرمال
  y: number;   // y0 نرمال
  w: number;   // پهنا نرمال
  h: number;   // ارتفاع نرمال
  c: number;   // اطمینان 0..1
}

export interface PageWords {
  page: number;
  width: number;   // ابعاد اصلی صفحه (PDF pt یا px تصویر)
  height: number;
  words: W[];
}

export type Db = typeof db;

export function normalizeCode(s: string): string {
  if (!s) return '';
  const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
  const ARABIC = '٠١٢٣٤٥٦٧٨٩';
  let out = '';
  for (const ch of s) {
    const p = PERSIAN.indexOf(ch);
    if (p >= 0) { out += String(p); continue; }
    const a = ARABIC.indexOf(ch);
    if (a >= 0) { out += String(a); continue; }
    out += ch;
  }
  return out.replace(/\s+/g, '').toUpperCase();
}

// نرمال‌سازی فارسی برای نمایه جست‌وجو — همسان با src/lib/normalize.ts
export function normalizeFa(input: string): string {
  if (!input) return '';
  let s = input;
  s = s.replace(/[\u064A\u0649]/g, '\u06CC');
  s = s.replace(/\u0643/g, '\u06A9');
  s = s.replace(/[\u0622\u0623\u0625]/g, '\u0627');
  s = s.replace(/[\u064B-\u065F\u0670]/g, '');
  s = s.replace(/\u200C/g, ' ');
  s = s.replace(/\u200F|\u200E/g, '');
  s = toLatin(s);
  s = s.replace(/[\.\-_\(\)\[\]\/\\:,،؛]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
function toLatin(s: string): string {
  const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
  const ARABIC = '٠١٢٣٤٥٦٧٨٩';
  let out = '';
  for (const ch of s) {
    const p = PERSIAN.indexOf(ch);
    if (p >= 0) { out += String(p); continue; }
    const a = ARABIC.indexOf(ch);
    if (a >= 0) { out += String(a); continue; }
    out += ch;
  }
  return out;
}
