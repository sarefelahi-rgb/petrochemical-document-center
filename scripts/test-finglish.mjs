// آزمون سریع موتور فینگلیش — واژه‌نامه + آوانگاری + تشخیص زبان
import { finglishExpansion, dominantLanguage, analyzeFinglishToken } from '../src/lib/finglish.ts';

const cases = [
  'salam madarek projhe chi hast?',
  'lule baraye khat 6-P-1183 ro peyda kon',
  'gozaresh bazresi joshkar ra neshan bede',
  'چند سند در پروژه وجود دارد؟',
  'list of all P&ID drawings',
  'mikhham etelat pumpha ro bebinam',
  'tasvib shodeha ye khordad 1403',
  'dastur kar valveha ye tabe 25',
];

let pass = 0, total = cases.length;
for (const c of cases) {
  const exp = finglishExpansion(c);
  const lang = dominantLanguage(c);
  const ok = exp.tokens.length > 0 || !exp.hasFinglish;
  if (ok) pass++;
  console.log(`${ok ? 'OK ' : 'FAIL'} [${lang}] "${c}"`);
  console.log(`     tokens: ${exp.tokens.join(' | ') || '(—)'}`);
}
console.log(`\n${pass}/${total} cases passed`);

// نمونه‌های آوانگاری تکی
for (const w of ['chetori', 'khabar', 'daryaft', 'barresi', 'aks', 'nostalgia', 'PDF', 'api']) {
  console.log(`  ${w} →`, analyzeFinglishToken(w).persian.join('، ') || '(فینگلیش تشخیص نشد)');
}
