// داشبورد کیفیت داده — شمارش‌های واقعی از پایگاه داده (بدون آمار ساختگی)
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk } from '@/lib/guard';

export async function GET() {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const base = { organizationId: ctx.organizationId, projectId: { in: Array.from(ctx.projectIds) } };

  const [total, incomplete, processing, quarantined, unlinked, noRevision, byConf, byDiscipline, recentAudit, openTasks, myTasks, recentDocs] = await Promise.all([
    db.document.count({ where: base }),
    db.document.count({ where: { ...base, status: 'INCOMPLETE' } }),
    db.document.count({ where: { ...base, processingStatus: { in: ['UPLOADED', 'QUARANTINED'] } } }),
    db.fileObject.count({ where: { quarantine: true } }),
    db.document.count({ where: { ...base, docLinks: { none: {} } } }),
    db.document.count({ where: { ...base, revisions: { none: {} } } }),
    db.document.groupBy({ by: ['confidentiality'], where: base, _count: { id: true } }),
    db.document.groupBy({ by: ['discipline'], where: base, _count: { id: true } }),
    db.auditEvent.findMany({ orderBy: { at: 'desc' }, take: 8, select: { action: true, actorName: true, at: true, detail: true } }),
    db.cartableTask.count({ where: { assigneeId: auth.user.id, status: 'OPEN' } }),
    db.cartableTask.findMany({ where: { assigneeId: auth.user.id, status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 8 }),
    db.document.findMany({
      where: base,
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: { id: true, docNumber: true, title: true, updatedAt: true, status: true, confidentiality: true, isSample: true },
    }),
  ]);

  return jsonOk({
    totals: { total, incomplete, processing, quarantined, unlinked, noRevision },
    byConfidentiality: byConf.map((g) => ({ key: g.confidentiality, count: g._count.id })),
    byDiscipline: byDiscipline.map((g) => ({ key: g.discipline, count: g._count.id })),
    recentDocs,
    recentAudit,
    openTasks,
    needsReview: myTasks.map((t) => ({ id: t.id, title: t.title, type: t.type, relatedDocId: t.relatedDocId })),
    projectScope: ctx.projectIds.size,
  });
}
