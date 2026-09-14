// شناسنامهٔ استخراج‌شده از مدرک — «استخراج‌شده، تأییدنشده» تا تأیید کارشناس
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can, canViewDocument } from '@/lib/permissions';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');
  if (!canViewDocument(ctx, doc)) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');
  if (!can(ctx, 'doc:content', doc)) return jsonError('اجازه مشاهده این سند را ندارید.', 403, 'FORBIDDEN');

  const rows = await db.docExtraction.findMany({
    where: { documentId: id },
    orderBy: [{ field: 'asc' }, { confidence: 'desc' }],
  });

  const fileIds = Array.from(new Set(rows.map((r) => r.fileId)));
  const files = fileIds.length > 0 ? await db.fileObject.findMany({
    where: { id: { in: fileIds } },
    select: { id: true, originalName: true },
  }) : [];
  const fileMap = new Map(files.map((f) => [f.id, f]));

  const canReview = can(ctx, 'doc:review', doc);

  return jsonOk({
    items: rows.map((r) => ({
      id: r.id,
      field: r.field,
      valueRaw: r.valueRaw,
      valueNorm: r.valueNorm,
      confidence: r.confidence,
      source: r.source,
      page: r.pageNumber,
      bbox: r.bbox ? JSON.parse(r.bbox) : null,
      status: r.status,
      isSuggestion: r.isSuggestion,
      toolVersion: r.toolVersion,
      reviewedAt: r.reviewedAt,
      file: fileMap.get(r.fileId) ? { id: r.fileId, name: fileMap.get(r.fileId)!.originalName } : null,
    })),
    canReview,
    counts: {
      total: rows.length,
      unreviewed: rows.filter((r) => r.status === 'UNREVIEWED' && !r.isSuggestion).length,
      confirmed: rows.filter((r) => r.status === 'CONFIRMED' || r.status === 'EDITED').length,
      suggestions: rows.filter((r) => r.isSuggestion && r.status === 'UNREVIEWED').length,
    },
  });
}
