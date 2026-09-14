// جزئیات سند + ویرایش‌ها — کنترل دسترسی سند-به-سند
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can, canViewDocument } from '@/lib/permissions';

async function getDocForUser(id: string, ctx: Awaited<ReturnType<typeof buildAccessContext>>) {
  const doc = await db.document.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, code: true, name: true } },
      unit: { select: { code: true, name: true, area: { select: { code: true, name: true } } } },
      revisions: {
        orderBy: { createdAt: 'desc' },
        include: { files: { select: { id: true, originalName: true, mimeType: true, size: true, sha256: true, kind: true, scanStatus: true, createdAt: true } } },
      },
      docLinks: { include: { assetTag: { select: { tag: true, description: true } }, line: { select: { lineNumber: true } } } },
    },
  });
  if (!doc) return null;
  if (!canViewDocument(ctx, doc)) return null; // منع پیش‌فرض — حتی وجود فایل هم فاش نمی‌شود
  return doc;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;
  const doc = await getDocForUser(id, ctx);
  if (!doc) return jsonError('سند یافت نشد یا مجاز به مشاهده آن نیستید.', 404, 'NOT_FOUND');

  return jsonOk({
    id: doc.id,
    docNumber: doc.docNumber,
    docNumberRaw: doc.docNumberRaw || doc.docNumber,
    title: doc.title,
    discipline: doc.discipline,
    docType: doc.docType,
    project: doc.project,
    unit: doc.unit,
    origin: doc.origin,
    ownerUnit: doc.ownerUnit,
    confidentiality: doc.confidentiality,
    status: doc.status,
    processingStatus: doc.processingStatus,
    extractionStatus: doc.extractionStatus,
    engineeringStatus: doc.engineeringStatus,
    validRevisionId: doc.validRevisionId,
    isSample: doc.isSample,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    revisions: doc.revisions.map((r) => ({
      id: r.id,
      revisionCode: r.revisionCode,
      status: r.status,
      purpose: r.purpose,
      docDate: r.docDate,
      receivedDate: r.receivedDate,
      effectiveDate: r.effectiveDate,
      isSample: r.isSample,
      files: r.files,
    })),
    links: doc.docLinks.map((l) => ({
      type: l.linkType,
      ref: l.rawRef || l.assetTag?.tag || l.line?.lineNumber || '',
      description: l.assetTag?.description || null,
      status: l.linkStatus,
    })),
  });
}

// اصلاح شناسنامه (بدون دست‌زدن به تاریخچه ویرایش‌ها)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');
  if (!can(ctx, 'doc:edit', doc)) return jsonError('اجازه اصلاح این سند را ندارید.', 403, 'FORBIDDEN');

  const body = await req.json().catch(() => null);
  if (!body) return jsonError('درخواست نامعتبر است.');
  const data: Record<string, unknown> = {};
  for (const key of ['title', 'discipline', 'docType', 'unitId', 'confidentiality', 'origin', 'ownerUnit', 'status'] as const) {
    if (key in body) data[key] = body[key] === '' ? null : body[key];
  }
  if ('title' in body && !String(body.title).trim()) return jsonError('عنوان نمی‌تواند خالی باشد.');
  const updated = await db.document.update({ where: { id }, data });
  await import('@/lib/audit').then((m) => m.audit({
    organizationId: ctx.organizationId,
    actorId: auth.user.id,
    actorName: auth.user.fullName,
    action: 'DOC_UPDATE',
    objectType: 'Document',
    objectId: id,
    detail: `fields=${Object.keys(data).join(',')}`,
  }));
  return jsonOk({ ok: true, id: updated.id });
}
