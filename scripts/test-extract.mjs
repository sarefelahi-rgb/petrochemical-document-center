// آزمون استخراج فرمت‌های جدید: md/json/rtf/doc — ساختن فایل نمونه و فراخوانی extractFromFile
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const tmp = '/home/z/my-project/data/tmp/extract-test';
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

// md
fs.writeFileSync(path.join(tmp, 'sample.md'), '# گزارش بازرسی خطوط\n\nخط 6-P-1183 بازرسی شد. نتیجه: تأیید.\n');
// json
fs.writeFileSync(path.join(tmp, 'sample.json'), JSON.stringify({ doc: '6-P-1183', tag: 'V-2501', qty: 12 }, null, 2));
// rtf با متن فارسی (\\uN)
const fa = 'گزارش بازرسی جوشکاری';
const rtfBody = Array.from(fa).map((ch) => `\\u${ch.codePointAt(0)}?`).join('');
fs.writeFileSync(path.join(tmp, 'sample.rtf'), `{\\rtf1\\ansi\\fs20 ${rtfBody}\\par خط 6-P-1183 تأیید شد\\par}`);

// doc با LibreOffice از txt ساخته می‌شود (word قدیمی)
fs.writeFileSync(path.join(tmp, 'src.txt'), 'شناسنامهٔ سند شماره 6-P-1183\nسازنده: واحد مهندسی\nوضعیت: تأییدشده\n');
execSync(`soffice --headless --norestore --convert-to doc --outdir ${tmp} ${tmp}/src.txt`, { timeout: 120000, stdio: 'pipe' });

const { extractFromFile } = await import('../src/lib/extract.ts');
for (const f of ['sample.md', 'sample.json', 'sample.rtf', 'src.doc']) {
  const p = path.join(tmp, f);
  if (!fs.existsSync(p)) { console.log(`SKIP ${f} (ساخته نشد)`); continue; }
  const r = await extractFromFile(p, f);
  console.log(`\n=== ${f} → ok=${r.ok} source=${r.source} chars=${r.text.length}`);
  console.log('  متن:', (r.text || r.note || r.error || '').slice(0, 120).replace(/\n/g, ' ⏎ '));
}
fs.rmSync(tmp, { recursive: true, force: true });
