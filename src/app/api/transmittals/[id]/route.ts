// ترنسمیتال — جزئیات، افزودن/حذف قلم، تغییر وضعیت، حذف (فقط پیش‌نویس)
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can, canViewDocument } from '@/lib/permissions';
import { audit } from '@/lib/audit';

async function loadOrgScoped(id: string, organizationId: string) {
  return db.transmittal.findFirst({ where: { id, organizationId }, include: { items: { include: { document: { select: { id: true, docNumber: true, title: true, status: true } } } } } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;
  const t = await loadOrgScoped(id, ctx.organizationId);
  if (!t) return jsonError('ترنسمیتال یافت نشد.', 404, 'NOT_FOUND');
  // اقلام فقط از اسناد مجاز
  const items: Array<{ id: string; documentId: string; docNumber: string; title: string; docStatus: string; revisionId: string | null; note: string | null }> = [];
  for (const it of t.items) {
    if (!canViewDocument(ctx, it.document as unknown as { organizationId: string; projectId: string; confidentiality: string })) continue;
    items.push({ id: it.id, documentId: it.documentId, docNumber: it.document.docNumber, title: it.document.title, docStatus: it.document.status, revisionId: it.revisionId, note: it.note });
  }
  return jsonOk({ item: { ...t, items: undefined }, items, canManage: can(ctx, 'doc:edit') || can(ctx, 'admin:manage') });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  if (!can(ctx, 'doc:edit') && !can(ctx, 'admin:manage')) return jsonError('اجازه مدیریت ترنسمیتال را ندارید.', 403, 'FORBIDDEN');
  const { id } = await params;
  const t = await loadOrgScoped(id, ctx.organizationId);
  if (!t) return jsonError('ترنسمیتال یافت نشد.', 404, 'NOT_FOUND');
  const body = await req.json().catch(() => null);
  const action: string = body?.action || '';

  if (action === 'add-item') {
    const documentId: string = String(body?.documentId || '');
    const doc = await db.document.findUnique({ where: { id: documentId } });
    if (!doc || !canViewDocument(ctx, doc)) return jsonError('سند یافت نشد یا دسترسی ندارید.', 404, 'NOT_FOUND');
    const revisionId = String(body?.revisionId || '') || doc.currentRevisionId || null;
    try {
      const item = await db.transmittalItem.create({ data: { transmittalId: id, documentId, revisionId, note: String(body?.note || '').slice(0, 200) || null } });
      return jsonOk({ item });
    } catch {
      return jsonError('این سند قبلاً به ترنسمیتال اضافه شده است.', 409, 'DUPLICATE');
    }
  }

  if (action === 'remove-item') {
    const itemId: string = String(body?.itemId || '');
    await db.transmittalItem.deleteMany({ where: { id: itemId, transmittalId: id } });
    return jsonOk({ ok: true });
  }

  if (action === 'set-status') {
    const status = String(body?.status || '');
    if (!['DRAFT', 'SENT', 'ACKNOWLEDGED', 'CLOSED'].includes(status)) return jsonError('وضعیت نامعتبر است.');
    if (t.status !== 'DRAFT' && status === 'DRAFT') return jsonError('وضعیت ارسال‌شده به پیش‌نویس بازنمی‌گردد.');
    // اصلاح وضعیت سند تاریخچهٔ ارسال گذشته را تغییر نمی‌دهد — فقط وضعیت ترنسمیتال جاری به‌روز می‌شود
    const updated = await db.transmittal.update({
      where: { id },
      data: {
        status,
        sentAt: status === 'SENT' ? (t.sentAt || new Date()) : t.sentAt,
        ackAt: status === 'ACKNOWLEDGED' ? (t.ackAt || new Date()) : t.ackAt,
      },
    });
    await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'TRANSMITTAL_STATUS', objectType: 'transmittal', objectId: id, detail: `→ ${status}` });
    return jsonOk({ item: updated });
  }

  return jsonError('اقدام نامعتبر است.');
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  if (!can(ctx, 'doc:edit') && !can(ctx, 'admin:manage')) return jsonError('اجازه مدیریت ترنسمیتال را ندارید.', 403, 'FORBIDDEN');
  const { id } = await params;
  const t = await loadOrgScoped(id, ctx.organizationId);
  if (!t) return jsonError('ترنسمیتال یافت نشد.', 404, 'NOT_FOUND');
  if (t.status !== 'DRAFT') return jsonError('فقط ترنسمیتال در وضعیت پیش‌نویس حذف می‌شود.');
  await db.transmittalItem.deleteMany({ where: { transmittalId: id } });
  await db.transmittal.delete({ where: { id } });
  await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'TRANSMITTAL_DELETE', objectType: 'transmittal', objectId: id, detail: `number=${t.number}` });
  return jsonOk({ ok: true });
}
