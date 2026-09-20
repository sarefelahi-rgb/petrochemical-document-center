// آزمون سریع ماژول فینگلیش — اجرا: bun scripts/finglish-test.ts
import { analyzeFinglishToken, finglishExpansion, reverseExpansion, dominantLanguage, transliterateFinglish } from '../src/lib/finglish';

let pass = 0, fail = 0;
function t(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name}`); }
}

// واژه‌نامهٔ دقیق
t('madarek → مدارک', analyzeFinglishToken('madarek').persian.includes('مدارک'));
t('lule → لوله', analyzeFinglishToken('lule').persian.includes('لوله'));
// پسوند
t('valveha → شیر', analyzeFinglishToken('valveha').persian.includes('شیر'));
t('luleha → لوله', analyzeFinglishToken('luleha').persian.includes('لوله'));
// غلط تایپی (fuzzy)
t('madarekk (غلط تایپی) → مدارک', analyzeFinglishToken('madarekk').persian.includes('مدارک'));
t('pumpp (غلط تایپی) → پمپ', analyzeFinglishToken('pumpp').persian.includes('پمپ'));
// آوانگاری قاعده‌بنیاد
const kh = transliterateFinglish('kharestan');
t('آوانگاری kharestan کاندید خ دارد', kh.some((c) => c.includes('خ')));
// واژهٔ انگلیسی فنی نباید فینگلیش شود
t('pdf فینگلیش نیست', !analyzeFinglishToken('pdf').isFinglish);
t('P-1183 (کد بی‌واکه) فینگلیش نیست', !analyzeFinglishToken('P-1183').isFinglish);
// گسترش پرسش فینگلیش
const e1 = finglishExpansion('salam, madarek khat 2101 ro bebin');
t('پرسش فینگلیش تشخیص داده شد', e1.hasFinglish);
t('معادل مدارک در گسترش هست', e1.tokens.includes('مدارک'));
// گسترش معکوس فارسی → لاتین
const rev = reverseExpansion('پمپ و شیرهای خط را نشان بده');
t('معکوس: pump', rev.includes('pump'));
t('معکوس: valve', rev.includes('valve'));
// زبان غالب
t('زبان فینگلیش تشخیص داده شد', dominantLanguage('madarek khat 2101 ro neshan bede') === 'finglish');
t('زبان فارسی تشخیص داده شد', dominantLanguage('مدارک خط ۲۱۰۱ را نشان بده') === 'fa');
t('زبان انگلیسی تشخیص داده شد', dominantLanguage('show me all approved documents') === 'en');

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail > 0 ? 1 : 0);
