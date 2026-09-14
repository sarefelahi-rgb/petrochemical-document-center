// مانیتور صف پردازش — فهرست کارها، آمار، وضعیت Worker (مدیریت پردازش)
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  if (!can(ctx, 'processing:manage')) return jsonError('دسترسی به مانیتور پردازش ندارید.', 403, 'FORBIDDEN');

  const status = req.nextUrl.searchParams.get('status') || undefined;
  const type = req.nextUrl.searchParams.get('type') || undefined;
  const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get('limit') || '40', 10) || 40);

  const [jobs, groupByStatus, groupByType, queuedStale] = await Promise.all([
    db.processingJob.findMany({
      where: { ...(status ? { status } : {}), ...(type ? { type } : {}) },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
      select: {
        id: true, type: true, status: true, stage: true, attempts: true, maxAttempts: true,
        fileId: true, documentId: true, correlationId: true, error: true, durationMs: true,
        availableAt: true, createdAt: true, finishedAt: true, workerVersion: true, toolVersion: true,
        resultJson: true,
        file: { select: { originalName: true } },
      },
    }),
    db.processingJob.groupBy({ by: ['status'], _count: { _all: true } }),
    db.processingJob.groupBy({ by: ['type'], _count: { _all: true } }),
    db.processingJob.count({ where: { status: 'QUEUED', availableAt: { lte: new Date(Date.now() - 60000) } } }),
  ]);

  const hbRow = await db.setting.findUnique({ where: { key: 'worker.heartbeat' } });
  let heartbeat: { at: string; pid: number; version: string; versions?: Record<string, string> } | null = null;
  if (hbRow) { try { heartbeat = JSON.parse(hbRow.value); } catch { heartbeat = null; } }
  const alive = !!heartbeat && Date.now() - new Date(heartbeat.at).getTime() < 90000;

  return jsonOk({
    jobs: jobs.map((j) => ({ ...j, result: j.resultJson ? safeParse(j.resultJson) : null, resultJson: undefined })),
    stats: {
      byStatus: Object.fromEntries(groupByStatus.map((g) => [g.status, g._count._all])),
      byType: Object.fromEntries(groupByType.map((g) => [g.type, g._count._all])),
      queuedStale,
    },
    worker: { heartbeat, alive },
  });
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

// ابطال کار — فقط کار در صف یا ناموفق
export async function DELETE(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  if (!can(ctx, 'processing:manage')) return jsonError('دسترسی ندارید.', 403, 'FORBIDDEN');
  const id = req.nextUrl.searchParams.get('id') || '';
  const job = await db.processingJob.findUnique({ where: { id } });
  if (!job) return jsonError('کار یافت نشد.', 404, 'NOT_FOUND');
  if (!['QUEUED', 'FAILED'].includes(job.status)) return jsonError('فقط کار در صف یا ناموفق قابل لغو است.', 400);
  await db.processingJob.update({ where: { id }, data: { status: 'CANCELLED', stage: 'cancelled', finishedAt: new Date() } });
  return jsonOk({ cancelled: true });
}
