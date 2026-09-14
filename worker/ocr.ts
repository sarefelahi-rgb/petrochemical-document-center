// OCR فارسی/انگلیسی + رندر صفحه — tesseract CLI (fas+eng) و pdftoppm (poppler)
// Worker بدون تماس شبکه؛ ابزارها فقط روی فایل محلی؛ خروجی TSV با مختصات و اطمینان واژه
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { TMP_ROOT, type PageWords, type W } from './base';

const run = promisify(execFile);

export const TESSDATA = path.join(process.cwd(), 'data', 'tessdata');
export const OCR_LANGS = 'fas+eng';
export const OCR_DPI = 200;
export const PAGE_IMAGE_DPI = 150;

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
  await run('pdftoppm', ['-png', '-r', String(dpi), absPdf, path.join(outDir, 'page')], { timeout: 300000 });
  const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.png'))
    .sort((a, b) => pageNumOf(a) - pageNumOf(b));
  return files.slice(0, maxPages).map((f) => path.join(outDir, f));
}
function pageNumOf(name: string): number {
  const m = name.match(/-(\d+)\.png$/);
  return m ? parseInt(m[1], 10) : 0;
}

// OCR یک تصویر → واژه‌ها با مختصات نرمال + اطمینان میانگین
async function ocrImage(absImg: string, outDir: string, pageWidth: number, pageHeight: number): Promise<{ words: W[]; avgConf: number }> {
  const base = path.join(outDir, `ocr-${path.basename(absImg, path.extname(absImg))}`);
  await run('tesseract', [absImg, base, '-l', OCR_LANGS, '--psm', '3', 'tsv'], {
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
    const left = parseFloat(cols[6]), top = parseFloat(cols[7]);
    const w = parseFloat(cols[8]), h = parseFloat(cols[9]);
    if (w <= 0 || h <= 0) continue;
    words.push({
      t: text,
      x: left / pageWidth,
      y: top / pageHeight,
      w: w / pageWidth,
      h: h / pageHeight,
      c: Math.min(1, conf / 100),
    });
    confSum += conf; confN += 1;
  }
  return { words, avgConf: confN > 0 ? confSum / confN / 100 : 0 };
}

export interface OcrResult {
  pageCount: number;
  pages: PageWords[];           // واژه‌ها با اطمینان
  pageImages: Array<{ page: number; pngPath: string; dpi: number }>; // برای ذخیره مشتق
  avgConfidence: number;
  emptyPages: number[];         // صفحاتی که واژه خوانا نداشتند
  toolVersions: { tesseract: string; poppler: string };
}

// OCR مسیر کامل: PDF → رندر 200dpi → OCR صفحه‌به‌صفحه؛ یا تصویر تکی
export async function ocrFile(absPath: string, mime: string, tmpDir: string): Promise<OcrResult> {
  fs.mkdirSync(tmpDir, { recursive: true });
  const versions = { tesseract: await tesseractVersion(), poppler: await popplerVersion() };
  const pages: PageWords[] = [];
  const pageImages: OcrResult['pageImages'] = [];
  const emptyPages: number[] = [];
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
