// عملیات روی یک کار پردازش: بازپردازش (Retry) کار ناموفق/Dead-letter
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can } from '@/lib/permissions';
import { audit } from '@/lib/audit';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  if (!can(ctx, 'processing:manage')) return jsonError('دسترسی ندارید.', 403, 'FORBIDDEN');
  const { id } = await params;

  const job = await db.processingJob.findUnique({ where: { id } });
  if (!job) return jsonError('کار یافت نشد.', 404, 'NOT_FOUND');
  if (!['DEAD', 'FAILED', 'CANCELLED'].includes(job.status)) {
    return jsonError('فقط کار ناموفق/مرده/لغوشده قابل بازپردازش است.', 400, 'BAD_STATE');
  }

  const updated = await db.processingJob.update({
    where: { id },
    data: {
      status: 'QUEUED', stage: 'queued', availableAt: new Date(), claimedAt: null,
      startedAt: null, finishedAt: null, error: null, attempts: 0,
    },
  });

  await audit({
    organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName,
    action: 'JOB_RETRY', objectType: 'ProcessingJob', objectId: id,
    detail: `type=${job.type} file=${job.fileId}`,
  });

  return jsonOk({ retried: true, jobId: updated.id });
}
