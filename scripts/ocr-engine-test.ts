// آزمون مستقیم موتور OCR چندگذرهٔ جدید — بدون صف/worker
// تصویر متنی با sharp/SVG ساخته می‌شود و به ocrFile داده می‌شود؛
// راستی‌آزمایی: خوانش واژه‌های کلیدی + اطمینان + شناسهٔ موتور
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { ocrFile, tmpSessionDir } from '../worker/ocr';

const LINES = [
  'ISOMETRIC DRAWING 2299-ISO-E2E1',
  'LINE: 8-P-2299-C3B',
  'SIZE: 4 INCH  CLASS: A312 TP316',
  'NOTE: MULTI-PASS OCR ENGINE TEST',
];

async function main() {
  // تصویر کوچک (زیر آستانهٔ ۱۷۰۰px) — بزرگ‌نمایی ۲x و گذارهای پیش‌پردازش باید فعال شوند
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320">
    <rect width="100%" height="100%" fill="#f5f5f2"/>
    ${LINES.map((l, i) => `<text x="30" y="${60 + i * 60}" font-family="DejaVu Sans" font-size="26" fill="#111">${l}</text>`).join('\n    ')}
  </svg>`;
  const tmp = tmpSessionDir();
  const pngPath = path.join(tmp, 'engine-test.png');
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
  console.log('تصویر آزمون ساخته شد:', pngPath);

  const t0 = Date.now();
  const r = await ocrFile(pngPath, 'image/png', tmp);
  const text = r.pages[0].words.map((w) => w.t).join(' ');
  console.log(`موتور: ${r.engine}`);
  console.log(`گذارها: ${r.passStats.map((p) => `p${p.page}:${p.pass}@${p.conf}`).join(' | ')}`);
  console.log(`اطمینان: ${(r.avgConfidence * 100).toFixed(1)}٪ | واژه‌ها: ${r.pages[0].words.length} | زمان: ${Date.now() - t0}ms`);
  console.log(`متن خوانده‌شده: ${text.slice(0, 220)}`);

  const norm = text.toLowerCase().replace(/\s+/g, ' ');
  const checks: Array<[string, boolean]> = [
    ['ISOMETRIC خوانده شد', norm.includes('isometric')],
    ['کد سند خوانده شد', /2299/.test(norm) && /iso|e2e/.test(norm)],
    ['شماره خط خوانده شد', /2299/.test(norm) && /c3b|c8b/.test(norm)],
    ['کلاس A312 خوانده شد', norm.includes('a312')],
    ['SIZE/INCH خوانده شد', norm.includes('inch')],
    ['اطمینان بالای ۶۰٪', r.avgConfidence > 0.6],
    ['شناسهٔ موتور چندگذره', r.engine.includes('multi-pass-v2')],
  ];
  let pass = 0;
  for (const [name, ok] of checks) { console.log(`${ok ? '✓' : '✗'} ${name}`); if (ok) pass++; }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nنتیجه: ${pass}/${checks.length} PASS`);
  process.exit(pass === checks.length ? 0 : 1);
}

main().catch((e) => { console.error('خطا:', e); process.exit(1); });
