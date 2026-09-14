// عملیات روی کار بازبینی: برداشت (assign)، حل (resolve)، لغو (cancel)
// حّل کار نیازمند مجوز بازبینی است؛ برداشت برای هر بینندهٔ مجاز سند ممکن است
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can, canViewDocument } from '@/lib/permissions';
import { audit } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;

  const task = await db.reviewTask.findUnique({ where: { id }, include: { document: true } });
  if (!task || !task.document) return jsonError('کار بازبینی یافت نشد.', 404, 'NOT_FOUND');
  const doc = task.document;
  if (!canViewDocument(ctx, doc)) return jsonError('دسترسی به این سند ندارید.', 403, 'FORBIDDEN');

  const body = await req.json().catch(() => null) as { action?: string; note?: string } | null;
  const action = body?.action;
  if (!['assign', 'resolve', 'cancel', 'reopen'].includes(action || '')) return jsonError('اقدام نامعتبر است.', 400);

  if (action === 'assign') {
    const updated = await db.reviewTask.update({
      where: { id },
      data: { assignedToId: auth.user.id, status: task.status === 'OPEN' ? 'IN_PROGRESS' : task.status },
    });
    return jsonOk({ assigned: true, status: updated.status });
  }

  if (!can(ctx, 'doc:review', doc)) return jsonError('حل/لغو کار بازبینی نیازمند مجوز بازبینی است.', 403, 'FORBIDDEN');

  if (action === 'resolve' || action === 'cancel') {
    const updated = await db.reviewTask.update({
      where: { id },
      data: {
        status: action === 'resolve' ? 'RESOLVED' : 'CANCELLED',
        resolvedById: auth.user.id,
        resolvedAt: new Date(),
        resolutionNote: (body?.note || '').slice(0, 400) || null,
      },
    });
    await audit({
      organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName,
      action: 'REVIEW_TASK_' + action.toUpperCase(), objectType: 'ReviewTask', objectId: id,
      detail: `reason=${task.reason} doc=${doc.docNumber}`,
    });
    return jsonOk({ status: updated.status });
  }

  // reopen
  const updated = await db.reviewTask.update({
    where: { id },
    data: { status: 'OPEN', assignedToId: null, resolvedById: null, resolvedAt: null, resolutionNote: null },
  });
  return jsonOk({ status: updated.status });
}
