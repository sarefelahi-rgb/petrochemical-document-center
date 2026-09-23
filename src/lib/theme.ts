// تنظیمات ظاهری — رنگ سازمانی، فونت، اندازهٔ متن
// منبع واحد: هم کلاینت (اعمال زنده) و هم اسکریپت ضد-فلش در layout از همین فایل استفاده می‌کنند.

export interface ColorOption {
  id: string;
  label: string;
  swatch: string; // فقط برای نمایش نمونهٔ رنگ در رابط
  light: { primary: string; primaryFg: string };
  dark: { primary: string; primaryFg: string };
}

// رنگ سازمانی پیش‌فرض: آبی
export const COLOR_OPTIONS: ColorOption[] = [
  { id: 'blue',   label: 'آبی (سازمانی)', swatch: 'oklch(0.55 0.16 255)', light: { primary: 'oklch(0.55 0.16 255)', primaryFg: 'oklch(0.99 0.005 255)' }, dark: { primary: 'oklch(0.72 0.14 255)', primaryFg: 'oklch(0.16 0.03 255)' } },
  { id: 'green',  label: 'سبز',            swatch: 'oklch(0.55 0.14 155)', light: { primary: 'oklch(0.55 0.14 155)', primaryFg: 'oklch(0.99 0.005 155)' }, dark: { primary: 'oklch(0.72 0.14 155)', primaryFg: 'oklch(0.16 0.03 155)' } },
  { id: 'teal',   label: 'فیروزه‌ای',      swatch: 'oklch(0.55 0.12 195)', light: { primary: 'oklch(0.55 0.12 195)', primaryFg: 'oklch(0.99 0.005 195)' }, dark: { primary: 'oklch(0.74 0.12 195)', primaryFg: 'oklch(0.16 0.03 195)' } },
  { id: 'violet', label: 'بنفش',           swatch: 'oklch(0.55 0.18 300)', light: { primary: 'oklch(0.55 0.18 300)', primaryFg: 'oklch(0.99 0.005 300)' }, dark: { primary: 'oklch(0.72 0.16 300)', primaryFg: 'oklch(0.16 0.03 300)' } },
  { id: 'orange', label: 'نارنجی',         swatch: 'oklch(0.62 0.16 55)',  light: { primary: 'oklch(0.60 0.16 55)',  primaryFg: 'oklch(0.99 0.005 55)' },  dark: { primary: 'oklch(0.75 0.14 55)',  primaryFg: 'oklch(0.18 0.03 55)' } },
  { id: 'red',    label: 'قرمز',           swatch: 'oklch(0.55 0.18 25)',  light: { primary: 'oklch(0.55 0.18 25)',  primaryFg: 'oklch(0.99 0.005 25)' },  dark: { primary: 'oklch(0.70 0.16 25)',  primaryFg: 'oklch(0.98 0.005 25)' } },
  { id: 'navy',   label: 'سرمه‌ای',        swatch: 'oklch(0.42 0.12 265)', light: { primary: 'oklch(0.42 0.12 265)', primaryFg: 'oklch(0.99 0.005 265)' }, dark: { primary: 'oklch(0.68 0.12 265)', primaryFg: 'oklch(0.16 0.03 265)' } },
  { id: 'gold',   label: 'طلایی',          swatch: 'oklch(0.58 0.11 85)',  light: { primary: 'oklch(0.58 0.11 85)',  primaryFg: 'oklch(0.99 0.005 85)' },  dark: { primary: 'oklch(0.76 0.12 85)',  primaryFg: 'oklch(0.18 0.03 85)' } },
];

export interface FontOption {
  id: string;
  label: string;
  stack: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { id: 'vazir',  label: 'وزیرمتن (پیش‌فرض)', stack: "'Carlito', 'Vazirmatn', Tahoma, 'Segoe UI', sans-serif" },
  { id: 'shabnam', label: 'شبنم',              stack: "'Shabnam', 'Vazirmatn', Tahoma, sans-serif" },
  { id: 'sahel',  label: 'ساحل',               stack: "'Sahel', 'Vazirmatn', Tahoma, sans-serif" },
  { id: 'system', label: 'سیستمی (تاهوما)',    stack: "Tahoma, 'Segoe UI', 'Vazirmatn', sans-serif" },
];

export const SIZE_OPTIONS = [
  { id: 'small', label: 'کوچک', px: 14 },
  { id: 'medium', label: 'متوسط', px: 16 },
  { id: 'large', label: 'بزرگ', px: 18 },
] as const;

export const LS_KEYS = {
  dark: 'edc_theme',
  color: 'edc_theme_color',
  font: 'edc_theme_font',
  size: 'edc_theme_size',
} as const;

/** اعمال تنظیمات ذخیره‌شده روی documentElement — سمت کلاینت */
export function applyThemeFromStorage(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isDark = root.classList.contains('dark');
  try {
    const colorId = localStorage.getItem(LS_KEYS.color) || 'blue';
    const color = COLOR_OPTIONS.find((c) => c.id === colorId) || COLOR_OPTIONS[0];
    const p = isDark ? color.dark : color.light;
    root.style.setProperty('--primary', p.primary);
    root.style.setProperty('--primary-foreground', p.primaryFg);
    root.style.setProperty('--ring', p.primary);
    const fontId = localStorage.getItem(LS_KEYS.font) || 'vazir';
    const font = FONT_OPTIONS.find((f) => f.id === fontId) || FONT_OPTIONS[0];
    root.style.setProperty('--app-font', font.stack);
    const sizeId = localStorage.getItem(LS_KEYS.size) || 'medium';
    const size = SIZE_OPTIONS.find((s) => s.id === sizeId) || SIZE_OPTIONS[1];
    root.style.fontSize = `${size.px}px`;
  } catch {
    /* حافظه در دسترس نیست — پیش‌فرض می‌ماند */
  }
}

/** اسکریپت ضد-فلش: پیش از اولین رنگ‌آمیزی، تم ذخیره‌شده را اعمال می‌کند (server-safe) */
export function getThemeBootScript(): string {
  const colorsJson = JSON.stringify(
    COLOR_OPTIONS.map((c) => ({ id: c.id, l: c.light, d: c.dark })),
  );
  const fontsJson = JSON.stringify(FONT_OPTIONS.map((f) => ({ id: f.id, stack: f.stack })));
  const sizesJson = JSON.stringify(SIZE_OPTIONS.map((s) => ({ id: s.id, px: s.px })));
  return `(function(){try{
var C=${colorsJson},F=${fontsJson},S=${sizesJson};
var g=function(k){try{return localStorage.getItem(k)}catch(e){return null}};
var d=g('${LS_KEYS.dark}')==='dark';
if(d)document.documentElement.classList.add('dark');
var cid=g('${LS_KEYS.color}')||'blue';var c=C.filter(function(x){return x.id===cid})[0]||C[0];
var p=d?c.d:c.l;var rs=document.documentElement.style;
rs.setProperty('--primary',p.primary);rs.setProperty('--primary-foreground',p.primaryFg);rs.setProperty('--ring',p.primary);
var fid=g('${LS_KEYS.font}')||'vazir';var f=F.filter(function(x){return x.id===fid})[0]||F[0];
rs.setProperty('--app-font',f.stack);
var sid=g('${LS_KEYS.size}')||'medium';var s=S.filter(function(x){return x.id===sid})[0]||S[1];
rs.fontSize=s.px+'px';
}catch(e){}})();`;
}
