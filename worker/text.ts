// استخراج لایهٔ متن PDF با مختصات واژه‌ها — pdfjs-dist (legacy برای Node)
// در PDF متنی ابتدا متن و مختصات برداری استخراج می‌شود؛ اسکن به OCR می‌رود
import path from 'path';
import { OBJECT_ROOT, type PageWords, type W } from './base';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pdfjs = any;

let pdfjs: Pdfjs | null = null;
async function loadPdfjs(): Promise<Pdfjs> {
  if (pdfjs) return pdfjs;
  // legacy build برای محیط Node — بدون Worker واقعی
  pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

export interface TextExtractResult {
  pageCount: number;
  pages: PageWords[];
  avgWordsPerPage: number;
}

export async function extractPdfText(absPath: string, opts?: { maxPages?: number }): Promise<TextExtractResult> {
  const lib = await loadPdfjs();
  const data = new Uint8Array((await import('fs')).readFileSync(absPath));
  const doc = await lib.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  const maxPages = Math.min(doc.numPages, opts?.maxPages || 300);
  const pages: PageWords[] = [];

  for (let p = 1; p <= maxPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const pw = viewport.width;
    const ph = viewport.height;
    const tc = await page.getTextContent();
    const words: W[] = [];
    for (const item of tc.items) {
      if (!('str' in item) || !item.str || !item.str.trim()) continue;
      const str: string = item.str;
      const tr = item.transform as number[]; // [a,b,c,d,e,f]
      const x0 = tr[4];
      const y0Top = ph - tr[5]; // تبدیل مبدأ PDF به مبدأ بالای صفحه
      const itemW = (item.width as number) || 0;
      const itemH = Math.abs((item.height as number) || Math.hypot(tr[1], tr[3])) || 10;
      // تفکیک واژه‌ها با توزیع متناسب طول کاراکترها (تقریب کافی برای هایلایت)
      const tokens = str.split(/(\s+)/);
      let charIdx = 0;
      const charW = str.length > 0 ? itemW / str.length : 0;
      for (const tok of tokens) {
        const tokLen = tok.length;
        if (!tok.trim()) { charIdx += tokLen; continue; }
        const wx0 = x0 + charIdx * charW;
        const ww = tokLen * charW;
        words.push({
          t: tok,
          x: wx0 / pw,
          y: y0Top / ph,
          w: ww / pw,
          h: itemH / ph,
          c: 1, // لایهٔ متن — اطمینان کامل منبع
        });
        charIdx += tokLen;
      }
    }
    pages.push({ page: p, width: pw, height: ph, words });
    page.cleanup();
  }

  const totalWords = pages.reduce((a, pg) => a + pg.words.length, 0);
  const pageCount = doc.numPages;
  await doc.destroy();
  return { pageCount, pages, avgWordsPerPage: pageCount > 0 ? totalWords / pageCount : 0 };
}

// کلید مشتق واژه‌ها — در مسیر derivatives با ارتباط به فایل
export function wordsKey(orgId: string, fileId: string, page: number): string {
  return path.posix.join('derivatives', orgId, fileId.slice(0, 2), `words-${fileId}-p${page}.json`);
}

export { OBJECT_ROOT };
