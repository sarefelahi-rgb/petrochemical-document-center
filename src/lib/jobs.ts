// صف پردازش — enqueue از سمت اپلیکیشن (آپلود، پردازش مجدد، داده نمونه)
// Worker مستقل در worker/worker.ts همین صف را مصرف می‌کند (صف پایدار روی پایگاه داده)
import { db } from '@/lib/db';
import crypto from 'crypto';

export const JOB_TYPES = {
  THUMBNAIL: 'THUMBNAIL',
  TEXT_EXTRACT: 'TEXT_EXTRACT',
  OCR: 'OCR',
  TITLE_BLOCK: 'TITLE_BLOCK',
} as const;

export const JOB_STATUS = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  DONE: 'DONE',
  FAILED: 'FAILED',
  DEAD: 'DEAD', // Dead-letter — پس از اتمام تلاش‌ها
  CANCELLED: 'CANCELLED',
} as const;

// فرمت‌های قابل پردازش متن/OCR — بقیهٔ فرمت‌ها «قابل مدیریت به‌عنوان فایل» می‌مانند
export function isPdfMime(mime: string): boolean {
  return mime === 'application/pdf';
}
export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}
export function isProcessableMime(mime: string): boolean {
  return isPdfMime(mime) || isImageMime(mime);
}

export interface EnqueueResult {
  correlationId: string;
  queued: Array<{ id: string; type: string }>;
  processable: boolean;
}

// زنجیرهٔ پایه: THUMBNAIL + TEXT_EXTRACT (برای PDF) یا OCR (برای تصویر)
// ادامهٔ زنجیره (OCR → TITLE_BLOCK یا TEXT_EXTRACT → TITLE_BLOCK) توسط Worker صف می‌شود
export async function enqueuePipelineForFile(fileId: string, opts?: { reprocess?: boolean; priority?: number }): Promise<EnqueueResult> {
  const file = await db.fileObject.findUnique({ where: { id: fileId } });
  if (!file) throw new Error('file not found');
  const correlationId = crypto.randomUUID();
  const priority = opts?.priority ?? 5;
  const queued: Array<{ id: string; type: string }> = [];
  const processable = isProcessableMime(file.mimeType) && !file.quarantine && file.scanStatus !== 'REJECTED';

  if (processable) {
    const doc = file.revisionId
      ? await db.revision.findUnique({ where: { id: file.revisionId }, select: { documentId: true } })
      : null;

    const mkJob = async (type: string, jobPriority: number) => {
      const j = await db.processingJob.create({
        data: {
          type,
          status: 'QUEUED',
          stage: 'queued',
          fileId: file.id,
          documentId: doc?.documentId || null,
          revisionId: file.revisionId,
          organizationId: file.revisionId
            ? (await db.revision.findUnique({ where: { id: file.revisionId }, select: { document: { select: { organizationId: true } } } }))?.document.organizationId || ''
            : '',
          correlationId,
          priority: jobPriority,
          settingsJson: JSON.stringify({ reprocess: !!opts?.reprocess, ocrLangs: 'fas+eng', dpi: 200, enqueuedAt: new Date().toISOString() }),
        },
      });
      queued.push({ id: j.id, type });
    };

    await mkJob(JOB_TYPES.THUMBNAIL, Math.max(1, priority - 2));
    if (isPdfMime(file.mimeType)) {
      await mkJob(JOB_TYPES.TEXT_EXTRACT, priority);
    } else {
      // تصویر: OCR مستقیم
      await mkJob(JOB_TYPES.OCR, priority);
    }

    // وضعیت پردازش سند: در صف پردازش
    if (doc?.documentId) {
      await db.document.updateMany({ where: { id: doc.documentId }, data: { processingStatus: 'PROCESSING' } });
    }
  }

  return { correlationId, queued, processable };
}

// پردازش مجدد — اصلاح انسانی تأییدشده بازنویسی نمی‌شود؛ نتیجهٔ جدید «پیشنهاد» می‌شود
export async function enqueueReprocess(fileId: string): Promise<EnqueueResult> {
  // حذف کارهای در انتظار تکراری برای همین فایل (کار DONE/DEAD دست نمی‌خورد)
  await db.processingJob.updateMany({
    where: { fileId, status: { in: ['QUEUED', 'FAILED'] } },
    data: { status: 'CANCELLED', finishedAt: new Date(), error: 'لغو به‌علت درخواست پردازش مجدد' },
  });
  return enqueuePipelineForFile(fileId, { reprocess: true, priority: 4 });
}
