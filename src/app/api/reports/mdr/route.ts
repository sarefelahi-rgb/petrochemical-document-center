// رجیستر مدارک (MDR) — خروجی کنترل مدارک بر پایهٔ پروژه با وضعیت، نسخهٔ معتبر و ترنسمیتال‌ها
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { audit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId') || '';
  if (!projectId || !ctx.projectIds.has(projectId)) return jsonError('پروژه نامعتبر یا خارج از دسترسی شماست.', 403, 'FORBIDDEN');

  const docs = await db.document.findMany({
    where: { projectId, organizationId: ctx.organizationId },
    include: {
      project: { select: { code: true } },
      unit: { select: { code: true } },
      revisions: { orderBy: { createdAt: 'desc' }, select: { id: true, revisionCode: true, status: true, receivedDate: true, docDate: true, purpose: true } },
      transmittalItems: { include: { transmittal: { select: { number: true, status: true, direction: true, sentAt: true } } }, take: 5 },
    },
    orderBy: { docNumber: 'asc' },
  });

  const rows = docs.map((d) => {
    const current = d.revisions[0] || null;
    const valid = d.revisions.find((r) => r.id === d.validRevisionId) || current;
    const lastTr = d.transmittalItems.sort((a, b) => (b.transmittal.sentAt?.getTime() || 0) - (a.transmittal.sentAt?.getTime() || 0))[0];
    return {
      docNumber: d.docNumber,
      title: d.title,
      project: d.project.code,
      unit: d.unit?.code || '',
      discipline: d.discipline,
      docType: d.docType,
      origin: d.origin || '',
      confidentiality: d.confidentiality,
      status: d.status,
      engineeringStatus: d.engineeringStatus,
      currentRevision: current?.revisionCode || '',
      validRevision: valid?.revisionCode || '',
      revisionStatus: current?.status || '',
      purpose: current?.purpose || '',
      docDate: current?.docDate?.toISOString().slice(0, 10) || '',
      receivedDate: current?.receivedDate?.toISOString().slice(0, 10) || '',
      lastTransmittal: lastTr ? `${lastTr.transmittal.number} (${lastTr.transmittal.direction === 'IN' ? 'ورودی' : 'خروجی'})` : '',
      isSample: d.isSample,
    };
  });

  if (url.searchParams.get('format') === 'csv') {
    const headers = ['شماره سند', 'عنوان', 'پروژه', 'واحد', 'رشته', 'نوع', 'مبدأ', 'محرمانگی', 'وضعیت سند', 'وضعیت مهندسی', 'نسخهٔ جاری', 'نسخهٔ معتبر', 'وضعیت نسخه', 'هدف صدور', 'تاریخ مدرک', 'تاریخ دریافت', 'آخرین ترنسمیتال'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines: string[][] = [headers as string[], ...rows.map((r): string[] => [r.docNumber, r.title, r.project, r.unit, r.discipline, r.docType, r.origin, r.confidentiality, r.status, r.engineeringStatus, r.currentRevision, r.validRevision, r.revisionStatus, r.purpose, r.docDate, r.receivedDate, r.lastTransmittal].map(esc))];
    const csv = '\uFEFF' + lines.map((l) => l.join(',')).join('\n');
    await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'MDR_EXPORT', detail: `project=${projectId} rows=${rows.length}` });
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="MDR-${Date.now()}.csv"` } });
  }

  await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'MDR_VIEW', detail: `project=${projectId} rows=${rows.length}` });
  return jsonOk({ rows });
}
