// صف کردن فایل‌های موجود برای پردازش (ابزار انتقال مرحله B)
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const files = await db.fileObject.findMany({ select: { id: true, revisionId: true, mimeType: true, originalName: true } });
let n = 0;
for (const f of files) {
  const dup = await db.processingJob.findFirst({ where: { fileId: f.id, type: { in: ['TEXT_EXTRACT', 'OCR'] }, status: { in: ['QUEUED', 'RUNNING', 'DONE'] } } });
  if (dup) continue;
  const correlationId = `migrate-${Date.now()}-${++n}`;
  const rev = f.revisionId ? await db.revision.findUnique({ where: { id: f.revisionId }, select: { documentId: true, document: { select: { organizationId: true } } } }) : null;
  await db.processingJob.create({ data: {
    type: f.mimeType === 'application/pdf' ? 'TEXT_EXTRACT' : 'OCR', status: 'QUEUED', stage: 'queued',
    fileId: f.id, documentId: rev?.documentId || null, revisionId: f.revisionId,
    organizationId: rev?.document.organizationId || '', correlationId, priority: 5,
    settingsJson: JSON.stringify({ reprocess: false, ocrLangs: 'fas+eng', dpi: 200, enqueuedAt: new Date().toISOString() }),
  }});
  await db.processingJob.create({ data: {
    type: 'THUMBNAIL', status: 'QUEUED', stage: 'queued',
    fileId: f.id, documentId: rev?.documentId || null, revisionId: f.revisionId,
    organizationId: rev?.document.organizationId || '', correlationId, priority: 3,
    settingsJson: '{}',
  }});
  if (rev?.documentId) await db.document.update({ where: { id: rev.documentId }, data: { processingStatus: 'PROCESSING' } });
  n++;
}
console.log('enqueued for', n, 'files');
process.exit(0);
