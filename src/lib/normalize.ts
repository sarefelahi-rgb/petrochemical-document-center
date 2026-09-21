// نرمال‌سازی فارسی برای جست‌وجو — حفظ متن اصلی و نرمال‌سازی فقط در نمایه/مقایسه
// قاعدهٔ بهره‌بردار (۲۰۲۶-۰۹):
//  ۱) بزرگ/کوچکی حروف لاتین تفکیک نمی‌شود — همه به حروف کوچک
//  ۲) ارقام فارسی/عربی/لاتین معادل‌اند — جست‌وجو با هر فرمی، هر دو فرم را می‌یابد
// کدهای مهندسی: ارقام به لاتین برای مقایسه با نمایهٔ کد، حروف لاتین بی‌توجه به بزرگی

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function toLatinDigits(s: string | number): string {
  let out = '';
  for (const ch of String(s)) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) { out += String(p); continue; }
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a >= 0) { out += String(a); continue; }
    out += ch;
  }
  return out;
}

export function toPersianDigits(s: string | number): string {
  let out = '';
  for (const ch of String(s)) {
    if (ch >= '0' && ch <= '9') { out += PERSIAN_DIGITS[Number(ch)]; continue; }
    out += ch;
  }
  return out;
}

export function normalizeFa(input: string): string {
  if (!input) return '';
  let s = input;
  s = s.replace(/[\u064A\u0649\u06D2]/g, '\u06CC'); // ي/ی/ے → ی فارسی
  s = s.replace(/\u0643/g, '\u06A9'); // ك → ک
  s = s.replace(/\u0629/g, '\u0647'); // ة → ه
  s = s.replace(/[\u0622\u0623\u0625]/g, '\u0627'); // آ/أ/إ → ا
  s = s.replace(/[\u064B-\u065F\u0670]/g, ''); // اعراب
  s = s.replace(/\u0640/g, ''); // کشیده (تطویل)
  s = s.replace(/\u200C/g, ' '); // نیم‌فاصله → فاصله (فقط برای نمایه)
  s = s.replace(/\u200F|\u200E/g, '');
  s = toLatinDigits(s);
  s = s.replace(/[\.\-_\(\)\[\]\/\\:,،؛]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s.toLowerCase(); // بزرگ/کوچکی حروف لاتین تفکیک نمی‌شود
}

// فرم‌های ارقام یک متن — برای WHERE های پایگاه‌داده که روی متن خام جست‌وجو می‌کنند
// خروجی: حداقل یک فرم (لاتین و فارسی) — بدون تکرار
export function digitVariants(input: string): string[] {
  if (!input) return [];
  const out = new Set<string>();
  out.add(input);
  out.add(toLatinDigits(input));
  out.add(toPersianDigits(input));
  return Array.from(out);
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

// ---------- جست‌وجوی فراگیر (تصمیم بهره‌بردار ۱۴۰۵) ----------
// همهٔ شیوه‌های نگارش باید نتیجهٔ یکسان بدهند:
//   بزرگ/کوچکی، ارقام فارسی/عربی/لاتین، ی/ك عربی، آ/أ/إ، اعراب، کشیده،
//   نیم‌فاصله/فاصله/بی‌فاصله، علائم نگارشی و حذف کلمات پیوندی (و/در/به/…)
// برای دادهٔ خام (عنوان‌ها): معادل عربی‌شدهٔ پرسش هم ساخته می‌شود تا متن ذخیره‌شده با
// حروف عربی (مثلاً خروجی OCR قدیمی) نیز پیدا شود.

// آینهٔ عربی: حروف فارسی را به معادل عربی رایج برمی‌گرداند — فقط برای الگوهای LIKE روی متن خام
// «ه» تنها در پایان واژه به «ة» تبدیل می‌شود (تاء مربوطه عربی در پایان واژه می‌آید)
export function arabicMirror(input: string): string {
  return input
    .replace(/\u06CC/g, '\u064A') // ی → ي
    .replace(/\u06A9/g, '\u0643') // ک → ك
    .replace(/ه(?=\s|$|[،.,؛;!?)\]])/g, 'ة'); // هٔ پایانی واژه → ة
}

// متن نرمال فشرده (بی‌فاصله) برای نمایهٔ جست‌وجو — روی ستون searchNorm ذخیره می‌شود
// چرا بی‌فاصله؟ «برگه ۱»، «برگه۱» و «برگه‌۱» همه یک نمایه می‌دهند؛ فاصله/نیم‌فاصله در
// دادهٔ ذخیره‌شده و پرسش کاربر هر چه باشد، نتیجه یکسان است
export function buildSearchNorm(parts: Array<string | null | undefined>): string {
  return normalizeFa(parts.filter((p): p is string => Boolean(p && p.trim())).join(' ')).replace(/\s+/g, '');
}

// فرم پرسش برای مقایسه با نمایهٔ فشرده
export function compactQuery(input: string): string {
  return normalizeFa(input).replace(/\s+/g, '');
}

// توکن‌های معنادار پرسش — حذف کلمات پیوندی کوتاه؛ برای جست‌وجوی «هر واژه» (OR)
const STOP_TOKENS = new Set(['و', 'در', 'به', 'از', 'که', 'را', 'با', 'برای', 'the', 'of', 'and', 'for', 'a', 'an', 'on', 'in']);

export function queryTokens(input: string): string[] {
  return normalizeFa(input)
    .split(' ')
    .filter((t) => t.length >= 2 && !STOP_TOKENS.has(t))
    .slice(0, 10);
}

// گونه‌های جست‌وجو برای ستون‌های خام (LIKE) — پوشش حروف عربی/فارسی، ارقام و فاصله‌ها
// خروجی محدود و یکتا است تا کوئری منفجر نشود
export function searchVariants(input: string): string[] {
  if (!input) return [];
  const raw = input.trim();
  const faQ = normalizeFa(raw);
  const out = new Set<string>();
  if (raw) out.add(raw);
  if (faQ) {
    out.add(faQ);
    out.add(toPersianDigits(faQ));
    out.add(arabicMirror(faQ));
    // فرم فشرده: بدون فاصله/نیم‌فاصله — «پمپ 101» و «پمپ101» و «پمپ‌101» همه یکسان می‌شوند
    out.add(faQ.replace(/\s+/g, ''));
    out.add(arabicMirror(faQ).replace(/\s+/g, ''));
  }
  out.add(arabicMirror(raw));
  out.delete('');
  return Array.from(out).slice(0, 8);
}
