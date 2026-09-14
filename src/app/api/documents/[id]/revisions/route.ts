// ثبت ویرایش (Revision) جدید برای سند — پس از تأیید، فایل ویرایش‌شده جایگزین همان Revision نمی‌شود
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can } from '@/lib/permissions';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');
  if (!can(ctx, 'doc:upload', doc)) return jsonError('اجازه افزودن ویرایش را ندارید.', 403, 'FORBIDDEN');

  const body = await req.json().catch(() => null);
  const revisionCode = (body?.revisionCode || '').trim();
  if (!revisionCode) return jsonError('کد ویرایش لازم است (مثال: 0، A، P1).');

  const dup = await db.revision.findUnique({ where: { documentId_revisionCode: { documentId: id, revisionCode } } });
  if (dup) return jsonError(`ویرایش «${revisionCode}» از قبل ثبت شده است.`, 409, 'DUPLICATE');

  const created = await db.revision.create({
    data: {
      documentId: id,
      revisionCode,
      purpose: body?.purpose || null,
      docDate: body?.docDate ? new Date(body.docDate) : null,
      effectiveDate: body?.effectiveDate ? new Date(body.effectiveDate) : null,
    },
  });
  // آخرین ویرایش ثبت‌شده به‌عنوان «جاری»؛ «نسخه معتبر» جداگانه توسط مدیر اسناد تعیین می‌شود
  await db.document.update({ where: { id }, data: { currentRevisionId: created.id } });
  await import('@/lib/audit').then((m) => m.audit({
    organizationId: ctx.organizationId,
    actorId: auth.user.id,
    actorName: auth.user.fullName,
    action: 'REVISION_CREATE',
    objectType: 'Revision',
    objectId: created.id,
    detail: `doc=${doc.docNumber} rev=${revisionCode}`,
  }));
  return jsonOk({ id: created.id, revisionCode: created.revisionCode }, 201);
}

// تعیین «نسخه معتبر برای استفاده» — فقط مدیر اسناد/مدیر سامانه
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');
  if (!can(ctx, 'doc:edit', doc)) return jsonError('اجازه تعیین نسخه معتبر را ندارید.', 403, 'FORBIDDEN');

  const body = await req.json().catch(() => null);
  const { revisionId, newStatus, newEngineeringStatus } = body || {};
  const data: Record<string, unknown> = {};
  if (revisionId) {
    const rev = await db.revision.findFirst({ where: { id: revisionId, documentId: id } });
    if (!rev) return jsonError('ویرایش انتخابی به این سند تعلق ندارد.', 400);
    data.validRevisionId = revisionId;
    // ویرایش‌های قبلی منسوخ می‌شوند
    await db.revision.updateMany({ where: { documentId: id, id: { not: revisionId }, status: 'APPROVED' }, data: { status: 'SUPERSEDED' } });
    await db.revision.update({ where: { id: revisionId }, data: { status: 'APPROVED' } });
  }
  if (newStatus) data.status = newStatus;
  if (newEngineeringStatus) data.engineeringStatus = newEngineeringStatus;
  await db.document.update({ where: { id }, data });
  await import('@/lib/audit').then((m) => m.audit({
    organizationId: ctx.organizationId,
    actorId: auth.user.id,
    actorName: auth.user.fullName,
    action: 'DOC_VALID_REV_SET',
    objectType: 'Document',
    objectId: id,
    detail: `revisionId=${revisionId || '-'} status=${newStatus || '-'}`,
  }));
  return jsonOk({ ok: true });
}
