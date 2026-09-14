// صف بازبینی — فهرست کارهای بازبینی استخراج/کیفیت در دامنهٔ دسترسی کاربر
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk } from '@/lib/guard';
import { canViewDocument } from '@/lib/permissions';

const REASON_LABELS: Record<string, string> = {
  LOW_CONFIDENCE: 'اطمینان پایین استخراج',
  LOW_QUALITY: 'کیفیت پایین اسکن / متن ناخوانا',
  OCR_FAILED: 'شکست پردازش OCR',
  MANUAL: 'درخواست بازبینی دستی',
};

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const status = req.nextUrl.searchParams.get('status') || 'OPEN';

  const tasks = await db.reviewTask.findMany({
    where: { ...(status === 'ALL' ? {} : { status }) },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      document: { select: { id: true, docNumber: true, docNumberRaw: true, title: true, projectId: true, organizationId: true, confidentiality: true, isSample: true } },
      assignee: { select: { fullName: true, username: true } },
    },
  });

  // فیلتر دسترسی — منع پیش‌فرض؛ سند غیرمجاز در فهرست ظاهر نمی‌شود
  const visible = tasks.filter((t) => t.document && canViewDocument(ctx, t.document));

  return jsonOk({
    items: visible.map((t) => ({
      id: t.id,
      reason: t.reason,
      reasonLabel: REASON_LABELS[t.reason] || t.reason,
      detail: t.detail,
      payload: t.payload ? JSON.parse(t.payload) : null,
      status: t.status,
      assignee: t.assignee?.fullName || null,
      resolvedAt: t.resolvedAt,
      resolutionNote: t.resolutionNote,
      createdAt: t.createdAt,
      document: t.document ? {
        id: t.document.id, docNumber: t.document.docNumberRaw || t.document.docNumber,
        title: t.document.title, isSample: t.document.isSample,
      } : null,
      fileId: t.fileId,
    })),
  });
}
