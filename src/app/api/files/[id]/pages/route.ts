// اطلاعات صفحات یک فایل — برای نمایشگر (انتخاب شیت) و وضعیت صادقانهٔ پردازش
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can, canViewDocument } from '@/lib/permissions';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;

  const file = await db.fileObject.findUnique({
    where: { id },
    include: { revision: { include: { document: true } } },
  });
  if (!file || !file.revision?.document) return jsonError('فایل یافت نشد.', 404, 'NOT_FOUND');
  const doc = file.revision.document;
  if (!canViewDocument(ctx, doc)) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');
  if (!can(ctx, 'doc:content', doc)) return jsonError('اجازه مشاهده محتوای این سند را ندارید.', 403, 'FORBIDDEN');

  const pages = await db.pageText.findMany({
    where: { fileId: id },
    orderBy: { pageNumber: 'asc' },
    select: { pageNumber: true, wordCount: true, source: true, ocrConfidence: true, status: true },
  });

  const derivs = await db.derivativeObject.findMany({
    where: { fileId: id, kind: { in: ['PAGE_IMAGE', 'THUMB'] } },
    select: { kind: true, pageNumber: true },
  });

  const jobs = await db.processingJob.findMany({
    where: { fileId: id },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: { id: true, type: true, status: true, stage: true, attempts: true, error: true, finishedAt: true, correlationId: true },
  });

  return jsonOk({
    fileId: id,
    mimeType: file.mimeType,
    pageCount: pages.length,
    pages,
    derivatives: {
      pageImages: derivs.filter((d) => d.kind === 'PAGE_IMAGE').map((d) => d.pageNumber).sort((a, b) => (a || 0) - (b || 0)),
      hasThumb: derivs.some((d) => d.kind === 'THUMB'),
    },
    jobs,
  });
}
