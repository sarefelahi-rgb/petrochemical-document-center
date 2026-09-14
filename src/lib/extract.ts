// استخراج متن از فایل‌های بارگذاری‌شده — دستیار هوشمند و پذیرش اسناد
// پشتیبانی: PDF (لایهٔ متن) · تصویر (OCR فارسی/انگلیسی) · DOCX · XLSX · CSV/TXT
// نکتهٔ صداقت: اگر متنی استخراج نشد، صریح اعلام می‌شود (هیچ حدسی زده نمی‌شود)
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { unzipSync } from 'fflate';

const run = promisify(execFile);

export const TESSDATA = path.join(process.cwd(), 'data', 'tessdata');
const OCR_LANGS = 'fas+eng';
const OCR_DPI = 200;

export type ExtractSource = 'TEXT_LAYER' | 'OCR' | 'OFFICE' | 'FILE';

export interface ExtractResult {
  ok: boolean;
  text: string;          // متن استخراج‌شده (خالی = هیچ متنی یافت نشد)
  source?: ExtractSource;
  pageCount?: number;
  note?: string;         // یادداشت صادقانه دربارهٔ کیفیت/روش
  error?: string;
}

function xmlUnescape(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');
}

// استخراج متن PPTX — ppt/slides/slideN.xml + یادداشت‌ها
function extractPptx(buf: Buffer): string {
  const files = unzipSync(buf);
  const slideNum = (n: string) => Number(n.match(/slide(\d+)\.xml$/)?.[1] || 0);
  const slides = Object.keys(files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => slideNum(a) - slideNum(b));
  const out: string[] = [];
  for (const name of slides.slice(0, 100)) {
    const xml = Buffer.from(files[name]).toString('utf8');
    const texts = Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)).map((m) => xmlUnescape(m[1]).trim()).filter(Boolean);
    const notes = files[name.replace('slides/slide', 'notesSlides/notesSlide')];
    if (notes) {
      const nxml = Buffer.from(notes).toString('utf8');
      const ntexts = Array.from(nxml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)).map((m) => xmlUnescape(m[1]).trim()).filter(Boolean);
      if (ntexts.length) texts.push(`[یادداشت ارائه‌دهنده] ${ntexts.join(' ')}`);
    }
    if (texts.length) out.push(`--- اسلاید ${slideNum(name)} ---\n${texts.join('\n')}`);
  }
  return out.join('\n\n').trim();
}

// استخراج متن HTML/XML — حذف تگ‌ها + رمزگشایی موجودیت‌ها
function extractMarkup(raw: string): string {
  return xmlUnescape(raw
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<t[dh][^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// استخراج متن RTF — حذف کلمات کنترلی، رمزگشایی \'hh
function extractRtf(raw: string): string {
  return raw
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u(-?\d+)\s?\??/g, (_, d) => String.fromCodePoint(((Number(d) % 65536) + 65536) % 65536))
    .replace(/\\par[d]?/g, '\n').replace(/\\line/g, '\n')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '').replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function xmlToText(xml: string): string {
  return xml
    .replace(/<w:p[^>]*>/g, '\n')            // پاراگراف Word
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<[^>]+>/g, '')                  // همهٔ تگ‌ها
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// استخراج متن DOCX — word/document.xml
function extractDocx(buf: Buffer): string {
  const files = unzipSync(buf);
  const doc = files['word/document.xml'];
  if (!doc) return '';
  return xmlToText(Buffer.from(doc).toString('utf8'));
}

// فرمت‌های قدیمی/سازگاری (doc/xls/ppt/odt/ods/odp) — تبدیل با LibreOffice سرِبند (headless)
// (RTF خارج از این جدول است — ابتدا پارسر سبک داخلی، در صورت ناکامی LibreOffice)
const LO_EXT_TO_FILTER: Record<string, string> = {
  '.doc': 'txt:Text', '.xls': 'csv:Text - txt - csv (StarCalc)', '.ppt': 'txt:Text',
  '.odt': 'txt:Text', '.ods': 'csv:Text - txt - csv (StarCalc)', '.odp': 'txt:Text',
};
async function libreofficeToText(absPath: string, ext: string, tmpDir: string): Promise<string> {
  fs.mkdirSync(tmpDir, { recursive: true });
  const filter = LO_EXT_TO_FILTER[ext] || 'txt:Text';
  await run('soffice', ['--headless', '--norestore', '--convert-to', filter, '--outdir', tmpDir, absPath], {
    timeout: 150_000,
    env: { ...process.env, HOME: process.env.HOME || '/tmp' },
  });
  const found = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.txt') || f.endsWith('.csv'));
  if (!found.length) throw new Error('LibreOffice خروجی متنی تولید نکرد');
  // بزرگ‌ترین فایل خروجی = متن اصلی
  const best = found.map((f) => path.join(tmpDir, f)).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
  return fs.readFileSync(best, 'utf8');
}

// استخراج متن XLSX — sharedStrings + سلول‌های inline
function extractXlsx(buf: Buffer): string {
  const files = unzipSync(buf);
  const out: string[] = [];
  const shared: string[] = [];
  const sst = files['xl/sharedStrings.xml'];
  if (sst) {
    const xml = Buffer.from(sst).toString('utf8');
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const texts = Array.from(m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((t) => t[1]);
      shared.push(texts.join(''));
    }
  }
  const sheetNames = Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
  for (const name of sheetNames.slice(0, 5)) {
    const xml = Buffer.from(files[name]).toString('utf8');
    const rows: string[] = [];
    for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const cm of rm[1].matchAll(/<c[^>]*?(?:\st="(\w+)")?[^>]*>([\s\S]*?)<\/c>/g)) {
        const type = cm[1] || '';
        const inner = cm[2] || '';
        const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
        const isM = inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);
        let val = '';
        if (type === 's' && vm) val = shared[parseInt(vm[1], 10)] ?? '';
        else if (isM) val = isM[1];
        else if (vm) val = vm[1];
        cells.push(val.trim());
      }
      if (cells.some((c) => c)) rows.push(cells.join(' | '));
    }
    if (rows.length) out.push(rows.join('\n'));
  }
  return out.join('\n\n').trim();
}

// OCR یک تصویر با tesseract (فارسی/انگلیسی)
async function ocrImageFile(absPath: string, tmpDir: string): Promise<{ text: string; conf: number }> {
  fs.mkdirSync(tmpDir, { recursive: true });
  const base = path.join(tmpDir, 'ocr-out');
  await run('tesseract', [absPath, base, '-l', OCR_LANGS, '--psm', '3'], {
    timeout: 240000,
    env: { ...process.env, TESSDATA_PREFIX: TESSDATA },
  });
  const text = fs.readFileSync(`${base}.txt`, 'utf8');
  fs.rmSync(`${base}.txt`, { force: true });
  return { text: text.trim(), conf: 0 };
}

// رندر یک صفحهٔ PDF به PNG با pdftoppm
async function renderPdfPage(absPdf: string, page: number, outDir: string): Promise<string> {
  fs.mkdirSync(outDir, { recursive: true });
  const prefix = path.join(outDir, 'pg');
  await run('pdftoppm', ['-png', '-r', String(OCR_DPI), '-f', String(page), '-l', String(page), absPdf, prefix], { timeout: 120000 });
  const found = fs.readdirSync(outDir).filter((f) => f.startsWith('pg') && f.endsWith('.png')).sort();
  if (!found.length) throw new Error('render failed');
  return path.join(outDir, found[found.length - 1]);
}

// استخراج متن PDF: ابتدا لایهٔ متن؛ اگر ناچیز بود (اسکن)، صفحات محدود با OCR
export async function extractFromFile(absPath: string, originalName: string, opts?: { maxOcrPages?: number; tmpDir?: string }): Promise<ExtractResult> {
  const ext = (originalName.match(/\.[a-zA-Z0-9]+$/) || [''])[0].toLowerCase();
  const tmpDir = opts?.tmpDir || path.join(process.cwd(), 'data', 'tmp', `extract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  try {
    // متنی ساده — هر فرمتی که ذاتاً متن است (md/log/json/xml/html هم اضافه شد)
    if (['.txt', '.csv', '.md', '.log', '.json'].includes(ext)) {
      const raw = fs.readFileSync(absPath, 'utf8');
      const text = raw.slice(0, 400000);
      return { ok: text.trim().length > 0, text, source: 'FILE', note: text.trim().length ? undefined : 'فایل متنی خالی است.' };
    }
    if (ext === '.xml' || ext === '.html' || ext === '.htm') {
      const raw = fs.readFileSync(absPath, 'utf8');
      const text = ext === '.xml' ? raw.slice(0, 400000) : extractMarkup(raw).slice(0, 400000);
      return { ok: text.trim().length > 0, text, source: 'FILE', note: text.trim().length ? undefined : 'محتوای متنی قابل استخراج یافت نشد.' };
    }

    // Word / Excel / PowerPoint (فرمت zip-based)
    const head = fs.readFileSync(absPath).subarray(0, 4);
    const isZip = head.toString('hex') === '504b0304';
    if (isZip && ext === '.docx') {
      const text = extractDocx(fs.readFileSync(absPath));
      return { ok: text.length > 0, text: text.slice(0, 400000), source: 'OFFICE', note: text.length ? undefined : 'هیچ متنی در سند Word یافت نشد.' };
    }
    if (isZip && ext === '.xlsx') {
      const text = extractXlsx(fs.readFileSync(absPath));
      return { ok: text.length > 0, text: text.slice(0, 400000), source: 'OFFICE', note: text.length ? undefined : 'هیچ متنی در فایل Excel یافت نشد.' };
    }
    if (isZip && ext === '.pptx') {
      const text = extractPptx(fs.readFileSync(absPath));
      return { ok: text.length > 0, text: text.slice(0, 400000), source: 'OFFICE', note: text.length ? undefined : 'هیچ متنی در ارائهٔ PowerPoint یافت نشد.' };
    }

    // فرمت‌های قدیمی و سازگاری — LibreOffice سرِبند (فارسی/انگلیسی، هر دو زبان)
    if (LO_EXT_TO_FILTER[ext]) {
      let text = '';
      let method = 'LibreOffice';
      try {
        text = await libreofficeToText(absPath, ext, tmpDir);
      } catch {
        if (ext === '.doc') {
          // جایگزین سبک برای Word قدیمی
          const { stdout } = await run('antiword', ['-w', '0', absPath], { timeout: 60_000 });
          text = stdout; method = 'antiword';
        } else {
          throw new Error('تبدیل فرمت قدیمی ناموفق بود');
        }
      }
      const clean = text.replace(/\n{3,}/g, '\n\n').trim();
      return { ok: clean.length > 0, text: clean.slice(0, 400000), source: 'OFFICE', note: clean.length ? `استخراج با ${method} انجام شد.` : 'هیچ متنی در فایل یافت نشد.' };
    }

    // RTF متنی — ابتدا پارسر سبک داخلی (فارسی \uN پشتیبانی می‌شود)
    if (ext === '.rtf') {
      const raw = fs.readFileSync(absPath, 'utf8');
      const text = extractRtf(raw);
      if (text.length >= 30) return { ok: true, text: text.slice(0, 400000), source: 'FILE' };
      const loText = await libreofficeToText(absPath, '.rtf', tmpDir).catch(() => '');
      return { ok: (loText || text).trim().length > 0, text: (loText || text).slice(0, 400000), source: 'OFFICE', note: loText.trim() ? 'استخراج با LibreOffice انجام شد.' : 'متنی در فایل RTF یافت نشد.' };
    }

    // PDF — لایهٔ متن با pdfjs (legacy)
    if (ext === '.pdf') {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const data = new Uint8Array(fs.readFileSync(absPath));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = await (pdfjs as any).getDocument({ data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
      const pageCount: number = doc.numPages;
      const maxTextPages = Math.min(pageCount, 60);
      let text = '';
      for (let p = 1; p <= maxTextPages; p++) {
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        const pageText = tc.items.filter((it: { str?: string }) => it.str && it.str.trim()).map((it: { str: string }) => it.str).join(' ').trim();
        if (pageText) text += `\n--- صفحهٔ ${p} ---\n${pageText}`;
        page.cleanup();
      }
      await doc.destroy();
      const trimmed = text.replace(/\n{3,}/g, '\n\n').trim();
      if (trimmed.length >= 30) {
        return { ok: true, text: trimmed.slice(0, 400000), source: 'TEXT_LAYER', pageCount, note: pageCount > maxTextPages ? `فقط ${maxTextPages} صفحهٔ نخست خوانده شد.` : undefined };
      }
      // PDF اسکن‌شده — OCR صفحات محدود
      const maxOcr = Math.min(pageCount, opts?.maxOcrPages ?? 5);
      const parts: string[] = [];
      for (let p = 1; p <= maxOcr; p++) {
        try {
          const img = await renderPdfPage(absPath, p, tmpDir);
          const { text: ocrText } = await ocrImageFile(img, tmpDir);
          if (ocrText) parts.push(`--- صفحهٔ ${p} (OCR) ---\n${ocrText}`);
          try { fs.unlinkSync(img); } catch { /* بی‌خطر */ }
        } catch { /* صفحهٔ خاص ناخوانا ماند */ }
      }
      const ocrJoined = parts.join('\n\n').trim();
      return {
        ok: ocrJoined.length > 0,
        text: ocrJoined.slice(0, 400000),
        source: 'OCR',
        pageCount,
        note: ocrJoined.length
          ? `PDF اسکن‌شده است؛ OCR روی ${maxOcr} صفحهٔ نخست انجام شد${pageCount > maxOcr ? ` (${pageCount - maxOcr} صفحهٔ دیگر OCR نشد)` : ''}.`
          : 'این PDF اسکن‌شده است و متن قابل استخراجی یافت نشد.',
      };
    }

    // تصاویر — OCR مستقیم (فارسی/انگلیسی)
    if (['.png', '.jpg', '.jpeg', '.tif', '.tiff'].includes(ext)) {
      const { text } = await ocrImageFile(absPath, tmpDir);
      return {
        ok: text.length > 0,
        text: text.slice(0, 400000),
        source: 'OCR',
        pageCount: 1,
        note: text.length ? undefined : 'متنی در تصویر تشخیص داده نشد (ممکن است ناخوانا یا غیرمتن باشد).',
      };
    }

    return { ok: false, text: '', note: `برای فرمت «${ext || 'نامشخص'}» استخراج متن پشتیبانی نمی‌شود؛ فایل به‌عنوان پیوست نگهداری می‌شود.` };
  } catch (e) {
    return { ok: false, text: '', error: `استخراج متن ناموفق بود: ${(e as Error).message?.slice(0, 200) || 'خطای نامشخص'}` };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* بی‌خطر */ }
  }
}
