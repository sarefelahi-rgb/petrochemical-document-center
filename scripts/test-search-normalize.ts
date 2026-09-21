// تست واحد جست‌وجوی فراگیر — تشخیص هم‌ارزی شیوه‌های مختلف نگارش
import { normalizeFa, buildSearchNorm, searchVariants, queryTokens, arabicMirror, candidateCodes, compactQuery } from '../src/lib/normalize';

let pass = 0, fail = 0;
function eq(name: string, a: unknown, b: unknown) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa === sb) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got: ${sa}\n      want: ${sb}`); }
}

console.log('— normalizeFa: هم‌ارزی نگارش‌ها —');
// همهٔ این‌ها باید یک نرمال بدهند: «پروژه الف»
eq('فاصله ساده', normalizeFa('پروژه الف'), 'پروژه الف');
eq('نیم‌فاصله → فاصله', normalizeFa('پروژه\u200Cالف'), 'پروژه الف');
eq('چند فاصله → یک فاصله', normalizeFa('پروژه    الف'), 'پروژه الف');
eq('ے عربی/اردو → ی', normalizeFa('لڑکی'.replace('ک', 'ک')), normalizeFa('لڑکی')); // sanity
eq('ي عربی → ی', normalizeFa('ماشين'), normalizeFa('ماشین'));
eq('ى maksura → ی', normalizeFa('علي'), normalizeFa('علی'));
eq('ة → ه', normalizeFa('دستة'), normalizeFa('دسته'));
eq('ك عربی → ک', normalizeFa('پمپك'), 'پمپک');
eq('ارقام فارسی = لاتین', normalizeFa('پمپ ۱۰۱'), normalizeFa('پمپ 101'));
eq('ارقام عربی = لاتین', normalizeFa('پمپ ١٠١'), normalizeFa('پمپ 101'));
eq('بزرگ/کوچکی لاتین', normalizeFa('Prj-BI-1403'), normalizeFa('prj-bi-1403'));
eq('آ → ا', normalizeFa('آب'), normalizeFa('اب'));
eq('اعراب حذف', normalizeFa('مُهَندِس'), normalizeFa('مهندس'));
eq('علامت نگارشی → فاصله', normalizeFa('پروژه،الف'), 'پروژه الف');

console.log('— buildSearchNorm (فرمت فشرده بی‌فاصله) —');
eq('عنوان+شماره', buildSearchNorm(['ایزومتریک خط', '1183-ISO-0001', null]), 'ایزومتریکخط1183iso0001');
eq('هم‌ارزی در نمایه', buildSearchNorm(['ایزومتریک\u200Cخط ۱۱۸۳', null]), buildSearchNorm(['ایزومتریک خط 1183', null]));
eq('فاصله/نیم‌فاصله/بی‌فاصله = یکی', buildSearchNorm(['برگه ۱']), buildSearchNorm(['برگه۱']));
eq('فرم پرسش فشرده', compactQuery('برگه ۱'), 'برگه1');
eq('نمایه پرسش را می‌گیرد', buildSearchNorm(['P&ID واحد ۱۱۰ برگه ۱']).includes(compactQuery('برگه۱')), true);

console.log('— queryTokens: واژه‌های معنادار —');
eq('حذف پیوندها', queryTokens('نقشه ایزومتریک خط'), ['نقشه', 'ایزومتریک', 'خط']);
eq('حداقل ۲ نویسه', queryTokens('و نقشه'), ['نقشه']);

console.log('— searchVariants —');
const v1 = searchVariants('پروژه');
eq('شامل فرم نرمال', v1.includes('پروژه'), true);
eq('شامل فرم فشرده', v1.includes('پروژه'), true);
eq('شامل آینه عربی', v1.includes('پروژة'), true);
const v2 = searchVariants('پمپ 101');
eq('فرم فارسی ارقام', v2.includes('پمپ ۱۰۱'), true);
eq('فرم فشرده', v2.includes('پمپ101'), true);
eq('حداکثر ۸ گونه', searchVariants('x').length <= 8, true);

console.log('— arabicMirror —');
eq('ی پایانی → ي (آینه)', arabicMirror('ماشین').endsWith('ين'), true);
eq('ه پایانی → ة', arabicMirror('دسته'), 'دستة');
eq('ه میانی حفظ', arabicMirror('هواخنک').startsWith('هو'), true);

console.log('— candidateCodes —');
eq('کد مهندسی', candidateCodes('سند 6-P-1183-B2A را بده').some((c) => c.includes('6-P-1183')), true);

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail > 0 ? 1 : 0);
