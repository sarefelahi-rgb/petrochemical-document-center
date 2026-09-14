// جست‌وجو در متن صفحات مدرک (لایهٔ متن یا OCR) با مختصات هایلایت
// واژه‌های صفحات از مشتق‌های WORDS خوانده می‌شود؛ نرمال‌سازی ی/ک/ارقام با حفظ متن اصلی
import fs from 'fs';
import path from 'path';
import { normalizeFa, toLatinDigits } from '@/lib/normalize';

export interface W { t: string; x: number; y: number; w: number; h: number; c: number }
export interface PageWords { page: number; width: number; height: number; words: W[] }

export interface ContentMatch {
  page: number;
  snippet: string;         // برش متن اصلی دور تطبیق
  rects: Array<[number, number, number, number]>; // نرمال 0..1
  source: string;          // TEXT_LAYER | OCR
  confidence?: number | null;
}

const OBJECT_ROOT = path.join(process.cwd(), 'data', 'objectstore');

function wordsKey(orgId: string, fileId: string, page: number): string {
  return path.posix.join('derivatives', orgId, fileId.slice(0, 2), `words-${fileId}-p${page}.json`);
}

export function readPageWords(orgId: string, fileId: string, page: number): PageWords | null {
  try {
    const abs = path.resolve(path.join(OBJECT_ROOT, wordsKey(orgId, fileId, page)));
    if (!abs.startsWith(path.resolve(OBJECT_ROOT))) return null;
    return JSON.parse(fs.readFileSync(abs, 'utf8')) as PageWords;
  } catch { return null; }
}

function readAllPages(orgId: string, fileId: string, maxPage: number): PageWords[] {
  const out: PageWords[] = [];
  for (let p = 1; p <= maxPage; p++) {
    const pg = readPageWords(orgId, fileId, p);
    if (pg) out.push(pg);
  }
  return out;
}

export interface PageMeta { pageNumber: number; source: string; wordCount: number; confidence: number | null }

export function pageMetas(orgId: string, fileId: string, pageTexts: Array<{ pageNumber: number; source: string; wordCount: number; ocrConfidence: number | null }>): PageMeta[] {
  void orgId; void fileId;
  return pageTexts.map((t) => ({ pageNumber: t.pageNumber, source: t.source, wordCount: t.wordCount, confidence: t.ocrConfidence }));
}

function unionRect(ws: Array<{ x: number; y: number; w: number; h: number }>): [number, number, number, number] {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const w of ws) {
    x0 = Math.min(x0, w.x); y0 = Math.min(y0, w.y);
    x1 = Math.max(x1, w.x + w.w); y1 = Math.max(y1, w.y + w.h);
  }
  return [x0, y0, x1 - x0, y1 - y0];
}

// تطبیق واژه یا عبارت پیوسته روی دنبالهٔ واژه‌های نرمال‌شده؛ خروجی rect اتحاد واژه‌های منطبق
function findMatches(pg: PageWords, qNorm: string, limit: number): Array<[number, number, number, number]> {
  const qTokens = qNorm.split(' ').filter(Boolean);
  const rects: Array<[number, number, number, number]> = [];
  if (qTokens.length === 0) return rects;
  const nWords = pg.words.map((w) => ({ ...w, norm: normalizeFa(w.t) }));
  const windowLen = qTokens.length === 1 ? 1 : qTokens.length;
  for (let i = 0; i + windowLen <= nWords.length && rects.length < limit; i++) {
    const joined = nWords.slice(i, i + windowLen).map((w) => w.norm).join(' ');
    if (joined === qNorm) {
      rects.push(unionRect(nWords.slice(i, i + windowLen)));
    }
  }
  return rects;
}

export function searchInDocument(opts: {
  orgId: string; fileId: string; maxPage: number; query: string;
  pageTexts: Array<{ pageNumber: number; source: string; ocrConfidence: number | null }>;
  limitPerPage?: number; maxPages?: number;
}): { matches: ContentMatch[]; pagesSearched: number; queryNormalized: string } {
  const qNorm = normalizeFa(opts.query);
  const pages = readAllPages(opts.orgId, opts.fileId, Math.min(opts.maxPage, opts.pageTexts.length || opts.maxPage));
  const metaByPage = new Map(opts.pageTexts.map((t) => [t.pageNumber, t]));
  const matches: ContentMatch[] = [];
  let pagesSearched = 0;

  for (const pg of pages) {
    const meta = metaByPage.get(pg.page);
    if (!meta) continue;
    pagesSearched += 1;
    const rects = findMatches(pg, qNorm, opts.limitPerPage ?? 8);
    if (rects.length === 0) continue;
    // برش متن اصلی دور نخستین تطبیق
    const raw = pg.words.map((w) => w.t).join(' ');
    let snippet = raw.slice(0, 160);
    const normRaw = normalizeFa(raw);
    const idx = normRaw.indexOf(qNorm);
    if (idx >= 0) {
      // نگاشت تقریبی به موقعیت متن اصلی نسبت طول‌ها
      const approx = Math.floor((idx / Math.max(1, normRaw.length)) * raw.length);
      snippet = raw.slice(Math.max(0, approx - 60), approx + qNorm.length + 80).trim();
    }
    matches.push({ page: pg.page, snippet, rects, source: meta.source, confidence: meta.ocrConfidence });
    if (matches.length >= (opts.maxPages ?? 40)) break;
  }
  return { matches, pagesSearched, queryNormalized: qNorm };
}

// جست‌وجوی سراسری روی PageText (فهرست اسناد با برش) — بدون فایل‌های ایندکس‌نشده
export function snippetAround(textRaw: string, qNorm: string): string {
  const normRaw = normalizeFa(textRaw);
  const idx = normRaw.indexOf(qNorm);
  if (idx < 0) return textRaw.slice(0, 140);
  const approx = Math.floor((idx / Math.max(1, normRaw.length)) * textRaw.length);
  return textRaw.slice(Math.max(0, approx - 55), approx + qNorm.length + 75).trim();
}

export { toLatinDigits };
