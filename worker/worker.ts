// Worker مستقل پردازش اسناد — مرحله B (خواندن و یافتن)
// صف پایدار روی پایگاه داده · وضعیت مرحله‌ای · Retry محدود با Backoff · Dead-letter
// اجرا: bun worker/worker.ts — کاربر غیر ریشه، بدون تماس شبکه، پاک‌سازی tmp پس از هر کار
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db, normalizeFa, OBJECT_ROOT, TMP_ROOT, type PageWords } from './base';
import { extractPdfText, wordsKey } from './text';
import { ocrFile, renderSinglePage, tmpSessionDir, tesseractVersion, popplerVersion, OCR_DPI, PAGE_IMAGE_DPI } from './ocr';
import { extractTitleBlock } from './titleblock';

const WORKER_VERSION = 'B-1.0.0';
const POLL_MS = 1500;
const STUCK_MINUTES = 10;
const MAX_PAGE_IMAGES_PER_PDF = 50;
const THUMB_DPI = 100;

let stopping = false;
const versions = { tesseract: 'unknown', poppler: 'unknown' };

process.on('SIGINT', () => { console.log('[worker] توقف نرم…'); stopping = true; });
process.on('SIGTERM', () => { console.log('[worker] توقف نرم…'); stopping = true; });

function log(...args: unknown[]) {
  console.log(`[worker ${new Date().toISOString()}]`, ...args);
}

// ---------- ابزار مشتقات ----------

function derivativeKey(orgId: string, fileId: string, name: string): string {
  return path.posix.join('derivatives', orgId, fileId.slice(0, 2), name);
}

function writeDerivative(orgId: string, fileId: string, name: string, content: Buffer): string {
  const key = derivativeKey(orgId, fileId, name);
  const abs = path.join(OBJECT_ROOT, key);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return key;
}

function unlinkDerivative(storageKey: string | undefined | null) {
  if (!storageKey) return;
  try {
    const abs = path.join(OBJECT_ROOT, storageKey);
    if (abs.startsWith(path.resolve(OBJECT_ROOT)) && fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch { /* بی‌خطر */ }
}

// ثبت/به‌روزرسانی مشتق — ردیف قدیمی و فایل قدیمی جایگزین می‌شود
async function upsertDerivative(fileId: string, orgId: string, kind: string, pageNumber: number | null, content: Buffer, name: string, mime: string, meta?: object) {
  const old = await db.derivativeObject.findFirst({
    where: { fileId, kind, pageNumber: pageNumber ?? null },
    select: { id: true, storageKey: true },
  });
  if (old) { unlinkDerivative(old.storageKey); await db.derivativeObject.delete({ where: { id: old.id } }); }
  const key = writeDerivative(orgId, fileId, name, content);
  await db.derivativeObject.create({
    data: { fileId, kind, storageKey: key, pageNumber: pageNumber ?? null, mimeType: mime, size: content.length, meta: meta ? JSON.stringify(meta) : null },
  });
  return key;
}

async function savePageWords(orgId: string, fileId: string, pg: PageWords) {
  const json = JSON.stringify(pg);
  const key = writeDerivative(orgId, fileId, `words-${fileId}-p${pg.page}.json`, Buffer.from(json, 'utf8'));
  // کلید با تابع wordsKey همسان باشد (برای خواندن در titleblock)
  const expected = wordsKey(orgId, fileId, pg.page);
  if (key !== expected) throw new Error('key mismatch words derivative');
}

function readWordsDerivative(orgId: string, fileId: string, page: number): PageWords | null {
  try {
    const abs = path.join(OBJECT_ROOT, wordsKey(orgId, fileId, page));
    return JSON.parse(fs.readFileSync(abs, 'utf8')) as PageWords;
  } catch { return null; }
}

// ---------- نگارش PageText با احترام به بازبینی انسانی ----------

async function upsertPageText(fileId: string, revisionId: string | null, pg: PageWords, source: 'TEXT_LAYER' | 'OCR', avgConf: number | null) {
  const textRaw = pg.words.map((w) => w.t).join(' ');
  const textNorm = normalizeFa(textRaw);
  const existing = await db.pageText.findUnique({ where: { fileId_pageNumber: { fileId, pageNumber: pg.page } } });
  if (existing?.status === 'REVIEWED') {
    // متن بازبینی‌شدهٔ انسانی بازنویسی نمی‌شود
    return { kept: true };
  }
  const data = {
    textRaw,
    textNormalized: textNorm,
    wordCount: pg.words.length,
    source,
    ocrConfidence: source === 'OCR' ? avgConf : null,
    language: source === 'OCR' ? 'fas+eng' : null,
    status: 'AUTO' as const,
    aiPolished: false,
    polishedAt: null,
    revisionId,
  };
  if (existing) await db.pageText.update({ where: { id: existing.id }, data });
  else await db.pageText.create({ data: { fileId, pageNumber: pg.page, ...data } });
  return { kept: false };
}

// ---------- صف بازبینی (Dedupe) ----------

async function raiseReviewTask(opts: {
  organizationId: string; documentId: string; revisionId: string | null; fileId: string | null;
  reason: string; detail: string; payload?: object;
}) {
  const existing = await db.reviewTask.findFirst({
    where: { fileId: opts.fileId, reason: opts.reason, status: { in: ['OPEN', 'IN_PROGRESS'] } },
  });
  if (existing) {
    await db.reviewTask.update({
      where: { id: existing.id },
      data: { detail: opts.detail, payload: opts.payload ? JSON.stringify(opts.payload) : existing.payload, documentId: opts.documentId, revisionId: opts.revisionId },
    });
    return existing.id;
  }
  const t = await db.reviewTask.create({
    data: {
      organizationId: opts.organizationId, documentId: opts.documentId, revisionId: opts.revisionId,
      fileId: opts.fileId, reason: opts.reason, detail: opts.detail,
      payload: opts.payload ? JSON.stringify(opts.payload) : null,
    },
  });
  return t.id;
}

// ---------- انواع کار ----------

async function jobThumbnail(job: Job) {
  const file = await db.fileObject.findUnique({ where: { id: job.fileId } });
  if (!file) throw new Error('فایل یافت نشد');
  const orgId = await orgOfFile(file);
  if (!orgId) throw new Error('فایل بدون ویرایش/سازمان — بندانگشتی غیرقابل‌استفاده');
  const abs = path.join(OBJECT_ROOT, file.storageKey);
  const tmp = tmpSessionDir();
  try {
    await db.processingJob.update({ where: { id: job.id }, data: { stage: 'render' } });
    let pngBuf: Buffer;
    if (file.mimeType === 'application/pdf') {
      const png = await renderSinglePage(abs, 1, tmp, THUMB_DPI);
      pngBuf = fs.readFileSync(png);
    } else {
      pngBuf = fs.readFileSync(abs);
    }
    const sharp = (await import('sharp')).default;
    pngBuf = await sharp(pngBuf).resize({ width: 480, withoutEnlargement: true }).png().toBuffer();
    await db.processingJob.update({ where: { id: job.id }, data: { stage: 'index' } });
    await upsertDerivative(file.id, orgId, 'THUMB', null, pngBuf, `thumb-${file.id}.png`, 'image/png', { dpi: THUMB_DPI });
    return { ok: true };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function orgOfFile(file: { revisionId: string | null }): Promise<string | null> {
  if (!file.revisionId) return null;
  const rev = await db.revision.findUnique({ where: { id: file.revisionId }, select: { document: { select: { organizationId: true, projectId: true, id: true } } } });
  return rev?.document.organizationId || null;
}

interface Job {
  id: string; type: string; fileId: string; documentId: string | null; revisionId: string | null;
  organizationId: string; correlationId: string | null; settingsJson: string | null; attempts: number;
}

async function jobTextExtract(job: Job) {
  const file = await db.fileObject.findUnique({ where: { id: job.fileId } });
  if (!file) throw new Error('فایل یافت نشد');
  if (file.mimeType !== 'application/pdf') throw new Error('TEXT_EXTRACT فقط برای PDF');
  const abs = path.join(OBJECT_ROOT, file.storageKey);
  if (!fs.existsSync(abs)) throw new Error('اصل فایل در مخزن یافت نشد');
  const orgId = await orgOfFile(file);
  const tmp = tmpSessionDir();
  try {
    await db.processingJob.update({ where: { id: job.id }, data: { stage: 'extract' } });
    const result = await extractPdfText(abs);
    await db.processingJob.update({ where: { id: job.id }, data: { stage: 'index' } });

    for (const pg of result.pages) {
      if (!orgId) break;
      await savePageWords(orgId, file.id, pg);
      await upsertPageText(file.id, job.revisionId, pg, 'TEXT_LAYER', null);
      // تصویر صفحه فقط برای PDFهای متعارف — سند بسیار بزرگ مشتق تصویری نمی‌گیرد (در ماتریس فرمت‌ها ثبت شده)
      if (result.pageCount <= MAX_PAGE_IMAGES_PER_PDF) {
        const png = await renderSinglePage(abs, pg.page, tmp, PAGE_IMAGE_DPI);
        await upsertDerivative(file.id, orgId, 'PAGE_IMAGE', pg.page, fs.readFileSync(png), `page-${file.id}-p${pg.page}.png`, 'image/png', { dpi: PAGE_IMAGE_DPI });
      }
    }

    const scanned = result.pages.length > 0 && result.avgWordsPerPage < 8;
    const settings = safeParse(job.settingsJson) || {};

    // ادامهٔ زنجیره
    if (orgId && job.revisionId) {
      const nextType = scanned ? 'OCR' : 'TITLE_BLOCK';
      await db.processingJob.create({
        data: {
          type: nextType, status: 'QUEUED', stage: 'queued', fileId: file.id,
          documentId: job.documentId, revisionId: job.revisionId, organizationId: orgId,
          correlationId: job.correlationId, priority: scanned ? 4 : 5,
          settingsJson: JSON.stringify({ ...settings, chain: 'TEXT_EXTRACT→' + nextType, dpi: OCR_DPI }),
        },
      });
    }
    return {
      ok: true, pageCount: result.pageCount, avgWordsPerPage: Math.round(result.avgWordsPerPage),
      scanned, chainNext: orgId && job.revisionId ? (scanned ? 'OCR' : 'TITLE_BLOCK') : 'none',
      note: orgId ? undefined : 'فایل بدون ویرایش ثبت‌شده است — استخراج شناسنامه انجام نمی‌شود',
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function jobOcr(job: Job) {
  const file = await db.fileObject.findUnique({ where: { id: job.fileId } });
  if (!file) throw new Error('فایل یافت نشد');
  const abs = path.join(OBJECT_ROOT, file.storageKey);
  if (!fs.existsSync(abs)) throw new Error('اصل فایل در مخزن یافت نشد');
  const orgId = await orgOfFile(file);
  if (!orgId) throw new Error('فایل بدون ویرایش — OCR غیرقابل‌استفاده');
  const tmp = tmpSessionDir();
  try {
    await db.processingJob.update({ where: { id: job.id }, data: { stage: 'ocr' } });
    const result = await ocrFile(abs, file.mimeType, tmp);
    await db.processingJob.update({ where: { id: job.id }, data: { stage: 'index' } });

    for (const pg of result.pages) {
      await savePageWords(orgId, file.id, pg);
      const avg = pg.words.length ? pg.words.reduce((a, w) => a + w.c, 0) / pg.words.length : 0;
      await upsertPageText(file.id, job.revisionId, pg, 'OCR', avg);
    }
    for (const img of result.pageImages) {
      await upsertDerivative(file.id, orgId, 'PAGE_IMAGE', img.page, fs.readFileSync(img.pngPath), `page-${file.id}-p${img.page}.png`, 'image/png', { dpi: img.dpi || OCR_DPI, ocr: true });
    }

    if (result.emptyPages.length > 0 && job.documentId) {
      await raiseReviewTask({
        organizationId: orgId, documentId: job.documentId, revisionId: job.revisionId, fileId: file.id,
        reason: 'LOW_QUALITY',
        detail: `در صفحه‌های ${result.emptyPages.join('، ')} متن خوانا استخراج نشد (اسکن کم‌کیفیت یا دست‌نویس؟) — بازبینی کارشناس لازم است.`,
        payload: { emptyPages: result.emptyPages, avgConfidence: Number(result.avgConfidence.toFixed(3)) },
      });
    }

    if (job.revisionId) {
      await db.processingJob.create({
        data: {
          type: 'TITLE_BLOCK', status: 'QUEUED', stage: 'queued', fileId: file.id,
          documentId: job.documentId, revisionId: job.revisionId, organizationId: orgId,
          correlationId: job.correlationId, priority: 5,
          settingsJson: JSON.stringify({ chain: 'OCR→TITLE_BLOCK', source: 'OCR', avgConfidence: result.avgConfidence }),
        },
      });
    }
    return {
      ok: true, pageCount: result.pageCount, avgConfidence: Number(result.avgConfidence.toFixed(3)),
      emptyPages: result.emptyPages, langs: 'fas+eng', engine: result.engine,
      passes: result.passStats.slice(0, 12),
      tools: result.toolVersions, chainNext: job.revisionId ? 'TITLE_BLOCK' : 'none',
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function jobTitleBlock(job: Job) {
  const file = await db.fileObject.findUnique({ where: { id: job.fileId } });
  if (!file || !job.documentId) throw new Error('فایل یا سند یافت نشد');
  const orgId = job.organizationId || (await orgOfFile(file));
  if (!orgId) throw new Error('سازمان فایل نامشخص');

  await db.processingJob.update({ where: { id: job.id }, data: { stage: 'analyze' } });

  // واژه‌های صفحات از مشتق‌ها
  const ptCount = await db.pageText.count({ where: { fileId: file.id } });
  const pages: PageWords[] = [];
  for (let p = 1; p <= Math.max(ptCount, 1); p++) {
    const w = readWordsDerivative(orgId, file.id, p);
    if (w) pages.push(w);
  }
  if (pages.length === 0) throw new Error('واژه‌های استخراجی یافت نشد — TEXT_EXTRACT/OCR پیش از این کار لازم است');

  const doc = await db.document.findUnique({ where: { id: job.documentId }, select: { projectId: true, docNumber: true, extractionStatus: true } });
  if (!doc) throw new Error('سند یافت نشد');

  const source = pages.some((pg) => pg.words.some((w) => w.c < 1)) ? 'OCR' : 'TEXT_LAYER';
  const avgConf = source === 'OCR' ? pages.reduce((a, pg) => a + (pg.words.length ? pg.words.reduce((b, w) => b + w.c, 0) / pg.words.length : 0), 0) / pages.length : undefined;
  const settings = safeParse(job.settingsJson) || {};
  const reprocess = !!settings.reprocess;

  const candidates = await extractTitleBlock(db, pages, {
    documentId: job.documentId, revisionId: job.revisionId, projectId: doc.projectId,
    source: source === 'OCR' ? 'OCR' : 'TEXT_LAYER', ocrConf: avgConf,
  });

  // اعمال با قاعدهٔ پردازش مجدد: مقدار تأیید/ویرایش‌شدهٔ انسانی بازنویسی نمی‌شود؛ جدید «پیشنهاد» می‌ماند
  const existing = await db.docExtraction.findMany({ where: { fileId: file.id } });
  const confirmedByField = new Map<string, typeof existing[number]>();
  for (const ex of existing) {
    if ((ex.status === 'CONFIRMED' || ex.status === 'EDITED') && !ex.isSuggestion) {
      const prev = confirmedByField.get(ex.field);
      if (!prev || ex.updatedAt > prev.updatedAt) confirmedByField.set(ex.field, ex);
    }
  }

  let created = 0, keptConfirmed = 0, suggestions = 0;
  const toolV = `${versions.tesseract} | poppler ${versions.poppler}`;
  for (const c of candidates) {
    const confirmed = confirmedByField.get(c.field);
    if (confirmed) {
      if ((confirmed.valueNorm || confirmed.valueRaw) === (c.valueNorm || c.valueRaw)) { keptConfirmed += 1; continue; }
      // پیشنهاد جدید — جایگزین نمی‌شود
      const dup = await db.docExtraction.findFirst({
        where: { fileId: file.id, field: c.field, isSuggestion: true, valueNorm: c.valueNorm, status: 'UNREVIEWED' },
      });
      if (!dup) {
        await db.docExtraction.create({
          data: {
            documentId: job.documentId, revisionId: job.revisionId, fileId: file.id,
            field: c.field, valueRaw: c.valueRaw, valueNorm: c.valueNorm, confidence: c.confidence,
            source: source === 'OCR' ? 'OCR' : 'TEXT_LAYER', pageNumber: c.page, bbox: JSON.stringify(c.bbox),
            status: 'UNREVIEWED', isSuggestion: true, toolVersion: toolV,
          },
        });
        suggestions += 1;
      }
      continue;
    }
    // بدون مقدار انسانی: ردیف‌های AUTO قبلی این فیلد جایگزین می‌شوند
    await db.docExtraction.deleteMany({
      where: { fileId: file.id, field: c.field, status: { in: ['UNREVIEWED', 'REJECTED'] }, isSuggestion: false },
    });
    await db.docExtraction.create({
      data: {
        documentId: job.documentId, revisionId: job.revisionId, fileId: file.id,
        field: c.field, valueRaw: c.valueRaw, valueNorm: c.valueNorm, confidence: c.confidence,
        source: source === 'OCR' ? 'OCR' : 'TEXT_LAYER', pageNumber: c.page, bbox: JSON.stringify(c.bbox),
        status: 'UNREVIEWED', isSuggestion: false, toolVersion: toolV,
      },
    });
    created += 1;
  }

  // صف بازبینی: اطمینان پایین
  const lowFields = candidates.filter((c) => c.confidence < 0.6).map((c) => ({ field: c.field, value: c.valueRaw, confidence: Number(c.confidence.toFixed(2)), page: c.page }));
  if (lowFields.length > 0) {
    await raiseReviewTask({
      organizationId: orgId, documentId: job.documentId, revisionId: job.revisionId, fileId: file.id,
      reason: 'LOW_CONFIDENCE',
      detail: `${lowFields.length} مقدار استخراج‌شده با اطمینان پایین نیاز به بازبینی کارشناس دارد.`,
      payload: { fields: lowFields, source },
    });
  }

  await db.processingJob.update({ where: { id: job.id }, data: { stage: 'index' } });
  const docUpdate: { processingStatus: string; extractionStatus?: string } = { processingStatus: 'PROCESSED' };
  const hasSuggestions = suggestions > 0;
  if (doc.extractionStatus === 'NOT_EXTRACTED' || (hasSuggestions && doc.extractionStatus === 'VERIFIED')) {
    docUpdate.extractionStatus = 'EXTRACTED_UNREVIEWED';
  }
  await db.document.update({ where: { id: job.documentId }, data: docUpdate });

  if (hasSuggestions) {
    await raiseReviewTask({
      organizationId: orgId, documentId: job.documentId, revisionId: job.revisionId, fileId: file.id,
      reason: 'MANUAL',
      detail: 'پردازش مجدد مقادیر پیشنهادی جدید تولید کرد؛ مقادیر تأییدشدهٔ انسانی دست‌نخورده ماندند — مقایسه و تصمیم لازم است.',
      payload: { suggestions },
    });
  }

  return {
    ok: true, fieldsCreated: created, fieldsKeptConfirmed: keptConfirmed, suggestions,
    lowConfidence: lowFields.length, source, reprocess,
  };
}

function safeParse(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

// ---------- اجرای کار با سقف زمانی ----------

const JOB_TIMEOUT_MS: Record<string, number> = {
  THUMBNAIL: 120000, TEXT_EXTRACT: 600000, OCR: 900000, TITLE_BLOCK: 300000,
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`سقف زمان کار ${label} (${Math.round(ms / 1000)}s) تمام شد`)), ms)),
  ]);
}

// ---------- حلقهٔ اصلی ----------

async function heartbeat(jobId?: string, stage?: string) {
  const payload = JSON.stringify({ at: new Date().toISOString(), pid: process.pid, version: WORKER_VERSION, versions });
  await db.setting.upsert({ where: { key: 'worker.heartbeat' }, update: { value: payload }, create: { key: 'worker.heartbeat', value: payload } });
  if (jobId) {
    await db.processingJob.update({ where: { id: jobId }, data: { heartbeatAt: new Date(), ...(stage ? { stage } : {}) } }).catch(() => {});
  }
}

async function recoverStuck() {
  const cutoff = new Date(Date.now() - STUCK_MINUTES * 60000);
  const stuck = await db.processingJob.updateMany({
    where: { status: 'RUNNING', heartbeatAt: { lt: cutoff } },
    data: { status: 'QUEUED', stage: 'queued', claimedAt: null, error: 'بازیابی پس از توقف Worker (heartbeat منقضی)', availableAt: new Date() },
  });
  if (stuck.count > 0) log(`🔁 ${stuck.count} کار معطل بازیابی شد`);
}

async function onJobDead(job: Job, err: string) {
  const file = await db.fileObject.findUnique({ where: { id: job.fileId } });
  const docId = job.documentId;
  if (!docId || !file) return;
  const orgId = job.organizationId || (await orgOfFile(file));
  if (!orgId) return;
  const textCount = await db.pageText.count({ where: { fileId: file.id } });
  await db.document.update({ where: { id: docId }, data: { processingStatus: textCount > 0 ? 'PROCESSED' : 'FAILED' } });
  if (textCount === 0) {
    await raiseReviewTask({
      organizationId: orgId, documentId: docId, revisionId: job.revisionId, fileId: file.id,
      reason: 'OCR_FAILED',
      detail: `پردازش پس از ${job.attempts} تلاش ناموفق ماند: ${err.slice(0, 160)}`,
      payload: { jobId: job.id, type: job.type },
    });
  } else {
    await raiseReviewTask({
      organizationId: orgId, documentId: docId, revisionId: job.revisionId, fileId: file.id,
      reason: 'MANUAL',
      detail: 'پردازش ناتمام ماند (متن موجود است) — بازپردازش از پنل مدیریت ممکن است.',
      payload: { jobId: job.id, type: job.type },
    });
  }
}

async function processJob(job: Job) {
  const t0 = Date.now();
  log(`▶ ${job.type} job=${job.id} file=${job.fileId} attempt=${job.attempts}`);
  await heartbeat(job.id, 'prepare');
  let result: unknown;
  try {
    switch (job.type) {
      case 'THUMBNAIL': result = await withTimeout(jobThumbnail(job), JOB_TIMEOUT_MS.THUMBNAIL, 'THUMBNAIL'); break;
      case 'TEXT_EXTRACT': result = await withTimeout(jobTextExtract(job), JOB_TIMEOUT_MS.TEXT_EXTRACT, 'TEXT_EXTRACT'); break;
      case 'OCR': result = await withTimeout(jobOcr(job), JOB_TIMEOUT_MS.OCR, 'OCR'); break;
      case 'TITLE_BLOCK': result = await withTimeout(jobTitleBlock(job), JOB_TIMEOUT_MS.TITLE_BLOCK, 'TITLE_BLOCK'); break;
      default: throw new Error(`نوع کار ناشناخته: ${job.type}`);
    }
    await db.processingJob.update({
      where: { id: job.id },
      data: {
        status: 'DONE', stage: 'done', finishedAt: new Date(), durationMs: Date.now() - t0,
        resultJson: JSON.stringify(result), error: null,
        workerVersion: WORKER_VERSION,
        toolVersion: `${versions.tesseract} | poppler ${versions.poppler} | pdfjs`,
      },
    });
    log(`✔ ${job.type} job=${job.id} در ${Date.now() - t0}ms`);
  } catch (e) {
    const err = (e as Error)?.message || String(e);
    const maxAttempts = (await db.processingJob.findUnique({ where: { id: job.id }, select: { maxAttempts: true } }))?.maxAttempts ?? 3;
    const dead = job.attempts >= maxAttempts;
    if (dead) {
      await db.processingJob.update({
        where: { id: job.id },
        data: { status: 'DEAD', stage: 'dead', finishedAt: new Date(), durationMs: Date.now() - t0, error: err.slice(0, 500), workerVersion: WORKER_VERSION },
      });
      await onJobDead(job, err);
      log(`✖ DEAD ${job.type} job=${job.id}: ${err}`);
    } else {
      const backoffMs = Math.min(120000, 8000 * Math.pow(2, Math.max(0, job.attempts - 1)));
      await db.processingJob.update({
        where: { id: job.id },
        data: { status: 'QUEUED', stage: 'queued', claimedAt: null, error: err.slice(0, 500), availableAt: new Date(Date.now() + backoffMs) },
      });
      log(`↻ retry ${job.type} job=${job.id} در ${Math.round(backoffMs / 1000)}s: ${err}`);
    }
  }
}

async function main() {
  log('Worker پردازش اسناد — نسخه', WORKER_VERSION);
  versions.tesseract = await tesseractVersion();
  versions.poppler = await popplerVersion();
  log('ابزارها:', versions);
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  await heartbeat();
  await recoverStuck();

  while (!stopping) {
    try {
      await recoverStuck();
      const candidate = await db.processingJob.findFirst({
        where: { status: 'QUEUED', availableAt: { lte: new Date() } },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      });
      if (!candidate) {
        await heartbeat();
        await sleep(POLL_MS);
        continue;
      }
      const claimed = await db.processingJob.updateMany({
        where: { id: candidate.id, status: 'QUEUED' },
        data: {
          status: 'RUNNING', stage: 'prepare', claimedAt: new Date(),
          startedAt: candidate.startedAt || new Date(), heartbeatAt: new Date(), attempts: { increment: 1 },
        },
      });
      if (claimed.count === 0) continue;
      await processJob({
        id: candidate.id, type: candidate.type, fileId: candidate.fileId, documentId: candidate.documentId,
        revisionId: candidate.revisionId, organizationId: candidate.organizationId,
        correlationId: candidate.correlationId || crypto.randomUUID(), settingsJson: candidate.settingsJson,
        attempts: candidate.attempts + 1,
      });
      await heartbeat();
    } catch (e) {
      log('خطای حلقه:', (e as Error).message);
      await sleep(3000);
    }
  }
  log('Worker متوقف شد.');
  await db.$disconnect();
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

main().catch((e) => { console.error('[worker] خطای مهلک:', e); process.exit(1); });
