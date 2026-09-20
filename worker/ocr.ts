// OCR فارسی/انگلیسی — موتور چندگذرهٔ با‌دقت‌افزاشته (Multi-Pass OCR Engine)
// ارتقای دقت در برابر نسخهٔ پایه:
//   ۱) رندر ۳۰۰ DPI (به‌جای ۲۰۰) — متن ریز مهندسی خواناتر می‌شود
//   ۲) بزرگ‌نمایی هوشمند تصاویر کوچک (۲x با Lanczos)
//   ۳) پیش‌پردازش سه‌گانه با sharp: پایه / بهبودکنتراست+تیزشدگی / دودویی‌سازی تطبیقی
//   ۴) چندگذره: گذار اول سریع؛ اگر اطمینان کافی نبود گذارهای تکمیلی و انتخاب بهترین
//      بر اساس امتیاز ترکیبی (اطمینان × پوشش واژه)
//   ۵) پاک‌سازی واژه: نویسه‌های عربی→فارسی، تیطه میانی، نویز کنترلی، حذف خرده‌نویز کم‌اطمینان
// خروجی TSV با مختصات نرمال و اطمینان واژه — رابط پایه (worker.ts) ثابت مانده است.
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { TMP_ROOT, type PageWords, type W } from './base';

const run = promisify(execFile);

export const TESSDATA = path.join(process.cwd(), 'data', 'tessdata');
export const OCR_LANGS = 'fas+eng';
export const OCR_DPI = 300;          // ↑ از ۲۰۰ — دقت خوانش متن ریز
export const PAGE_IMAGE_DPI = 150;
const GOOD_CONF = 0.85;              // آستانهٔ خروج سریع (بدون گذار اضافه)
const MIN_CONF_TRY_MORE = 0.72;      // زیر این مقدار گذار سوم هم اجرا می‌شود
const SPARSE_TRY_BELOW = 0.55;       // زیر این مقدار گذار پراکنده (نقشه‌ها) هم اجرا می‌شود
const UPSCALE_BELOW_PX = 1700;       // تصویر باریک‌تر از این → بزرگ‌نمایی ۲x

async function toolVersion(cmd: string, args: string[]): Promise<string> {
  try {
    // some tools (pdftoppm -v) print version to stderr — merge streams
    const opts = { timeout: 15000, all: true, encoding: 'buffer' as const } as ExecFileOptionsWithBufferEncoding;
    const { stdout } = await run(cmd, args, opts);
    return stdout.toString().split('\n')[0].trim().slice(0, 80);
  } catch (e) {
    const err = e as { stdout?: Buffer; all?: Buffer };
    const out = (err.all || err.stdout || Buffer.alloc(0)).toString();
    const v = out.split('\n')[0]?.trim()?.slice(0, 80);
    return v || 'unknown';
  }
}
export const tesseractVersion = () => toolVersion('tesseract', ['--version']);
export const popplerVersion = () => toolVersion('pdftoppm', ['-v']);

// رندر همهٔ صفحات PDF به PNG
async function renderPdfPages(absPdf: string, outDir: string, dpi: number, maxPages = 300): Promise<string[]> {
  fs.mkdirSync(outDir, { recursive: true });
  await run('pdftoppm', ['-png', '-r', String(dpi), absPdf, path.join(outDir, 'page')], { timeout: 420000 });
  const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.png'))
    .sort((a, b) => pageNumOf(a) - pageNumOf(b));
  return files.slice(0, maxPages).map((f) => path.join(outDir, f));
}
function pageNumOf(name: string): number {
  const m = name.match(/-(\d+)\.png$/);
  return m ? parseInt(m[1], 10) : 0;
}

// ---------- پیش‌پردازش تصویر (sharp) ----------
type PrepMode = 'base' | 'enhanced' | 'binarized';

async function preprocessImage(src: string, out: string, mode: PrepMode): Promise<{ width: number; height: number }> {
  const sharp = (await import('sharp')).default;
  if (mode === 'base') {
    const meta = await sharp(src).metadata();
    return { width: meta.width || 1, height: meta.height || 1 };
  }
  const meta = await sharp(src).metadata();
  const w = meta.width || 0;
  let pipeline = sharp(src).grayscale();
  // بزرگ‌نمایی هوشمند: اسکن‌های کم‌کیفیت/کوچک — متن ریز با Lanczos ۲x قابل‌خوانش‌تر می‌شود
  if (w && w < UPSCALE_BELOW_PX) pipeline = pipeline.resize({ width: Math.min(w * 2, 5200), kernel: 'lanczos3' });
  if (mode === 'enhanced') {
    // کشش کنتراست + تیزکردن لبهٔ حروف + گاما ملایم — بهترین برای اسکن‌های کم‌رنگ/محو
    pipeline = pipeline
      .normalise({ lower: 1, upper: 99 })
      .sharpen({ sigma: 1.1 })
      .gamma(1.08)
      .linear(1.06, 0);
  } else {
    // دودویی‌سازی تطبیقی — بهترین برای پس‌زمینهٔ کثیف/لکه/جوهٔ نا یکنواخت
    pipeline = pipeline
      .normalise()
      .median(2)
      .sharpen({ sigma: 0.7 })
      .threshold(172);
  }
  const outMeta = await pipeline.png().toFile(out);
  return { width: outMeta.width || 1, height: outMeta.height || 1 };
}

// ---------- پاک‌سازی نویسه‌های OCR ----------
const CHAR_FIX: Array<[string, string]> = [
  ['ي', 'ی'], ['ى', 'ی'], ['ﯼ', 'ی'], ['ﯽ', 'ی'], ['ﻯ', 'ی'], ['ﻰ', 'ی'],
  ['ك', 'ک'], ['ﮐ', 'ک'], ['ﮑ', 'ک'], ['ﻙ', 'ک'], ['ﻚ', 'ک'],
  ['ة', 'ه'], ['ﺔ', 'ه'], ['أ', 'ا'], ['إ', 'ا'], ['ٱ', 'ا'], ['ﺃ', 'ا'], ['ﺇ', 'ا'],
  ['ؤ', 'و'], ['٠', '۰'], ['١', '۱'], ['٢', '۲'], ['٣', '۳'], ['٤', '۴'],
  ['٥', '۵'], ['٦', '۶'], ['٧', '۷'], ['٨', '۸'], ['٩', '۹'],
];
function fixOcrWord(raw: string): string {
  let s = raw;
  for (const [a, b] of CHAR_FIX) s = s.split(a).join(b);
  s = s.replace(/\u0640+/g, '');            // تیطهٔ میانی (کشیده‌های جدولی)
  s = s.replace(/[\u200b-\u200f\u202a-\u202e\ufeff\u2066-\u2069]/g, ''); // کنترل‌های دوجهته
  s = s.replace(/^[^\p{L}\p{N}(\[«"'-]+|[^\p{L}\p{N})\]»"'.,%]+$/gu, ''); // علائم سرگردان دو سر واژه
  return s.trim();
}

// OCR یک تصویر با پیکربندی مشخص → واژه‌ها با مختصات نرمال + اطمینان
async function ocrImageWith(
  absImg: string,
  outDir: string,
  pageWidth: number,
  pageHeight: number,
  psm: string,
  prep: PrepMode,
): Promise<{ words: W[]; avgConf: number }> {
  const tag = prep === 'base' ? '' : `-${prep}`;
  const base = path.join(outDir, `ocr-${path.basename(absImg, path.extname(absImg))}${tag}-${psm}`);
  const target = prep === 'base' ? absImg : path.join(outDir, `prep-${prep}-${path.basename(absImg)}`);
  if (prep !== 'base' && !fs.existsSync(target)) {
    await preprocessImage(absImg, target, prep);
  }
  await run('tesseract', [target, base, '-l', OCR_LANGS, '--psm', psm, 'tsv'], {
    timeout: 300000,
    env: { ...process.env, TESSDATA_PREFIX: TESSDATA },
  });
  const tsvPath = `${base}.tsv`;
  const tsv = fs.readFileSync(tsvPath, 'utf8');
  fs.rmSync(tsvPath, { force: true });

  const words: W[] = [];
  let confSum = 0, confN = 0;
  const lines = tsv.split(/\r?\n/).filter(Boolean);
  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    if (cols.length < 12) continue;
    const level = parseInt(cols[0], 10);
    if (level !== 5) continue; // فقط سطح واژه
    const text = cols[11]?.trim();
    const conf = parseFloat(cols[10]);
    if (!text || isNaN(conf) || conf < 0) continue;
    const fixed = fixOcrWord(text);
    if (!fixed) continue;
    // حذف خرده‌نویز: تک‌نویسهٔ بی‌اطمینان (سرشاخه‌های خطا در اسکن بد)
    if (fixed.length === 1 && !/[\p{N}\p{L}]/u.test(fixed)) continue;
    if (fixed.length === 1 && conf < 25) continue;
    const left = parseFloat(cols[6]), top = parseFloat(cols[7]);
    const w = parseFloat(cols[8]), h = parseFloat(cols[9]);
    if (w <= 0 || h <= 0) continue;
    words.push({
      t: fixed,
      x: left / pageWidth,
      y: top / pageHeight,
      w: w / pageWidth,
      h: h / pageHeight,
      c: Math.min(1, conf / 100),
    });
    if (conf >= 30) { confSum += conf; confN += 1; } // نویز خیلی کم‌اطمینان در میانگین نمی‌آید
  }
  return { words, avgConf: confN > 0 ? confSum / confN / 100 : 0 };
}

// امتیاز انتخاب بهترین گذار: اطمینان × پوشش (متن صفحات مهندسی: ۸۰..۴۰۰ واژه)
function passScore(r: { words: W[]; avgConf: number }): number {
  const cover = Math.min(1, r.words.length / 120);
  return r.avgConf * 0.72 + cover * 0.28;
}

// چندگذرهٔ هوشمند یک صفحه: سریع اگر خوب باشد، عمیق اگر مشکل داشته باشد
async function ocrImage(
  absImg: string,
  outDir: string,
  pageWidth: number,
  pageHeight: number,
): Promise<{ words: W[]; avgConf: number; pass: string; tried: Array<{ psm: string; prep: PrepMode; conf: number; words: number }> }> {
  const tried: Array<{ psm: string; prep: PrepMode; conf: number; words: number }> = [];
  let best = await ocrImageWith(absImg, outDir, pageWidth, pageHeight, '3', 'base');
  tried.push({ psm: '3', prep: 'base', conf: best.avgConf, words: best.words.length });
  let bestLabel = 'psm3';

  if (best.avgConf < GOOD_CONF || best.words.length < 8) {
    // گذار ۲: بهبود کنتراست/تیزشدگی — رایج‌ترین درمان اسکن کم‌کیفیت
    const p2 = await ocrImageWith(absImg, outDir, pageWidth, pageHeight, '3', 'enhanced');
    tried.push({ psm: '3', prep: 'enhanced', conf: p2.avgConf, words: p2.words.length });
    if (passScore(p2) > passScore(best)) { best = p2; bestLabel = 'psm3+enhanced'; }
    if (best.avgConf < MIN_CONF_TRY_MORE) {
      // گذار ۳: دودویی‌سازی — پس‌زمینهٔ کثیف/لکه‌دار
      const p3 = await ocrImageWith(absImg, outDir, pageWidth, pageHeight, '6', 'binarized');
      tried.push({ psm: '6', prep: 'binarized', conf: p3.avgConf, words: p3.words.length });
      if (passScore(p3) > passScore(best)) { best = p3; bestLabel = 'psm6+binarized'; }
      if (best.avgConf < SPARSE_TRY_BELOW) {
        // گذار ۴: متن پراکنده (نقشه‌ها/برچسب‌های جدا) — ۱۱=SPARSE، ۱۲=SPARSE+OSD
        const p4 = await ocrImageWith(absImg, outDir, pageWidth, pageHeight, '11', 'base');
        tried.push({ psm: '11', prep: 'base', conf: p4.avgConf, words: p4.words.length });
        if (passScore(p4) > passScore(best)) { best = p4; bestLabel = 'psm11-sparse'; }
      }
    }
  }
  return { ...best, pass: bestLabel, tried };
}

export interface OcrResult {
  pageCount: number;
  pages: PageWords[];           // واژه‌ها با اطمینان
  pageImages: Array<{ page: number; pngPath: string; dpi: number }>; // برای ذخیره مشتق
  avgConfidence: number;
  emptyPages: number[];         // صفحاتی که واژه خوانا نداشتند
  toolVersions: { tesseract: string; poppler: string };
  engine: string;               // شناسهٔ موتور چندگذره برای ردیابی
  passStats: Array<{ page: number; pass: string; conf: number; words: number; tried: number }>;
}

// OCR مسیر کامل: PDF → رندر ۳۰۰dpi → OCR چندگذرهٔ صفحه‌به‌صفحه؛ یا تصویر تکی
export async function ocrFile(absPath: string, mime: string, tmpDir: string): Promise<OcrResult> {
  fs.mkdirSync(tmpDir, { recursive: true });
  const versions = { tesseract: await tesseractVersion(), poppler: await popplerVersion() };
  const pages: PageWords[] = [];
  const pageImages: OcrResult['pageImages'] = [];
  const emptyPages: number[] = [];
  const passStats: OcrResult['passStats'] = [];
  let confSum = 0, confN = 0;

  if (mime === 'application/pdf') {
    const pngs = await renderPdfPages(absPath, tmpDir, OCR_DPI);
    for (let i = 0; i < pngs.length; i++) {
      const png = pngs[i];
      const pageNo = pageNumOf(path.basename(png)) || i + 1;
      // ابعاد واقعی تصویر برای نرمال‌سازی
      const meta = await imageSize(png);
      const r = await ocrImage(png, tmpDir, meta.width, meta.height);
      if (r.words.length === 0) emptyPages.push(pageNo);
      pages.push({ page: pageNo, width: meta.width, height: meta.height, words: r.words });
      passStats.push({ page: pageNo, pass: r.pass, conf: Number(r.avgConf.toFixed(3)), words: r.words.length, tried: r.tried.length });
      confSum += r.avgConf; confN += 1;
      pageImages.push({ page: pageNo, pngPath: png, dpi: OCR_DPI });
    }
  } else {
    // تصویر تکی — تبدیل به PNG برای یکدستی
    const png = await convertToPng(absPath, tmpDir);
    const meta = await imageSize(png);
    const r = await ocrImage(png, tmpDir, meta.width, meta.height);
    if (r.words.length === 0) emptyPages.push(1);
    pages.push({ page: 1, width: meta.width, height: meta.height, words: r.words });
    passStats.push({ page: 1, pass: r.pass, conf: Number(r.avgConf.toFixed(3)), words: r.words.length, tried: r.tried.length });
    confSum += r.avgConf; confN += 1;
    pageImages.push({ page: 1, pngPath: png, dpi: 0 });
  }

  return {
    pageCount: pages.length,
    pages,
    pageImages,
    avgConfidence: confN > 0 ? confSum / confN : 0,
    emptyPages,
    toolVersions: versions,
    engine: 'multi-pass-v2 (300dpi + preprocessing + best-of-N)',
    passStats,
  };
}

async function imageSize(absImg: string): Promise<{ width: number; height: number }> {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(absImg).metadata();
  return { width: meta.width || 1, height: meta.height || 1 };
}

async function convertToPng(absImg: string, outDir: string): Promise<string> {
  const sharp = (await import('sharp')).default;
  const out = path.join(outDir, `conv-${path.basename(absImg, path.extname(absImg))}.png`);
  await sharp(absImg).png().toFile(out);
  return out;
}

// رندر تک‌صفحه برای مشتق PAGE_IMAGE (۱۵۰ DPI) — مسیر PDF متنی
export async function renderSinglePage(absPdf: string, page: number, outDir: string, dpi = PAGE_IMAGE_DPI): Promise<string> {
  fs.mkdirSync(outDir, { recursive: true });
  await run('pdftoppm', ['-png', '-r', String(dpi), '-f', String(page), '-l', String(page), absPdf, path.join(outDir, `pg${page}`)], { timeout: 120000 });
  const f = fs.readdirSync(outDir).find((x) => x.startsWith(`pg${page}-`) && x.endsWith('.png'));
  if (!f) throw new Error(`رندر صفحه ${page} ناموفق بود`);
  return path.join(outDir, f);
}

export function tmpSessionDir(): string {
  const d = path.join(TMP_ROOT, `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
