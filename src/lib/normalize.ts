// نرمال‌سازی فارسی برای جست‌وجو — حفظ متن اصلی و نرمال‌سازی فقط در نمایه/مقایسه
// کدهای مهندسی: ارقام به لاتین برای مقایسه، حروف تغییر نمی‌کنند

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function toLatinDigits(s: string): string {
  let out = '';
  for (const ch of s) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) { out += String(p); continue; }
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a >= 0) { out += String(a); continue; }
    out += ch;
  }
  return out;
}

export function normalizeFa(input: string): string {
  if (!input) return '';
  let s = input;
  s = s.replace(/[\u064A\u0649]/g, '\u06CC'); // ي/ی → ی فارسی
  s = s.replace(/\u0643/g, '\u06A9'); // ك → ک
  s = s.replace(/[\u0622\u0623\u0625]/g, '\u0627'); // آ/أ/إ → ا
  s = s.replace(/[\u064B-\u065F\u0670]/g, ''); // اعراب
  s = s.replace(/\u200C/g, ' '); // نیم‌فاصله → فاصله (فقط برای نمایه)
  s = s.replace(/\u200F|\u200E/g, '');
  s = toLatinDigits(s);
  s = s.replace(/[\.\-_\(\)\[\]\/\\:,،؛]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// برای کدهای مهندسی: بدون تغییر حروف، فقط ارقام و جداسازها
export function normalizeCode(input: string): string {
  if (!input) return '';
  let s = toLatinDigits(input.trim());
  s = s.replace(/\s+/g, '');
  return s.toUpperCase();
}

// استخراج کاندیدهای کد مهندسی از یک پرسش آزاد (هر توکن + کل رشته)
export function candidateCodes(input: string): string[] {
  if (!input) return [];
  const out = new Set<string>();
  const full = normalizeCode(input);
  if (full) out.add(full);
  // توکن‌ها: دنبالهٔ حروف/ارقام/خط‌تیره/نقطه (مناسب شماره‌های مهندسی مثل 6-P-1183-B2A یا EA-308B)
  const tokens = input.split(/[^\p{L}\p{N}\-_.]+/u);
  for (const t of tokens) {
    const n = normalizeCode(t);
    if (n.length >= 3) out.add(n);
  }
  return Array.from(out);
}
