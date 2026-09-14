// ویرایش/حذف حاشیه‌نویسی — نویسنده یا مدیر؛ حل (resolve) توسط نویسنده یا دارای doc:edit
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

  const ann = await db.annotation.findUnique({ where: { id }, include: { file: { include: { revision: { include: { document: true } } } } } });
  if (!ann || !ann.file.revision?.document) return jsonError('حاشیه‌نویسی یافت نشد.', 404, 'NOT_FOUND');
  if (!canViewDocument(ctx, ann.file.revision.document)) return jsonError('دسترسی ندارید.', 403, 'FORBIDDEN');

  const body = await req.json().catch(() => null) as { resolved?: boolean; text?: string; color?: string } | null;
  const data: Record<string, unknown> = {};
  if (typeof body?.resolved === 'boolean') {
    // حل: نویسنده یا دارای doc:edit
    if (ann.authorId !== auth.user.id && !can(ctx, 'doc:edit', ann.file.revision.document)) {
      return jsonError('فقط نویسنده یا مدیر سند می‌تواند حاشیه‌نویسی را حل کند.', 403, 'FORBIDDEN');
    }
    data.resolved = body.resolved;
  }
  if (typeof body?.text === 'string') {
    if (ann.authorId !== auth.user.id) return jsonError('فقط نویسنده می‌تواند متن را ویرایش کند.', 403, 'FORBIDDEN');
    data.text = body.text.slice(0, 1000);
  }
  if (body?.color && /^#[0-9a-fA-F]{6}$/.test(body.color) && ann.authorId === auth.user.id) data.color = body.color;

  const updated = await db.annotation.update({ where: { id }, data });
  return jsonOk({ id: updated.id, resolved: updated.resolved });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;

  const ann = await db.annotation.findUnique({ where: { id }, include: { file: { include: { revision: { include: { document: true } } } } } });
  if (!ann || !ann.file.revision?.document) return jsonError('حاشیه‌نویسی یافت نشد.', 404, 'NOT_FOUND');
  const doc = ann.file.revision.document;
  if (!canViewDocument(ctx, doc)) return jsonError('دسترسی ندارید.', 403, 'FORBIDDEN');
  // حذف: نویسنده یا مدیر سامانه (حذف توسط دیگران مسیر بازبینی را مخفی می‌کند)
  if (ann.authorId !== auth.user.id && ctx.role !== 'ADMIN') {
    return jsonError('فقط نویسنده یا مدیر سامانه می‌تواند حاشیه‌نویسی را حذف کند.', 403, 'FORBIDDEN');
  }

  await db.annotation.delete({ where: { id } });
  await audit({
    organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName,
    action: 'ANNOTATION_DELETE', objectType: 'Annotation', objectId: id,
    detail: `doc=${doc.docNumber} page=${ann.page}`,
  });
  return jsonOk({ deleted: true });
}
