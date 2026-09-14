// بازپردازش کامل فایل — اصلاح انسانی تأییدشده بازنویسی نمی‌شود؛ نتیجهٔ جدید «پیشنهاد» می‌شود
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can, canViewDocument } from '@/lib/permissions';
import { enqueueReprocess } from '@/lib/jobs';
import { audit } from '@/lib/audit';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;

  const file = await db.fileObject.findUnique({
    where: { id },
    include: { revision: { include: { document: true } } },
  });
  if (!file || !file.revision?.document) return jsonError('فایل یافت نشد.', 404, 'NOT_FOUND');
  const doc = file.revision.document;
  if (!canViewDocument(ctx, doc)) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');
  if (!can(ctx, 'doc:edit', doc)) return jsonError('اجازه بازپردازش این سند را ندارید.', 403, 'FORBIDDEN');
  if (file.quarantine || file.scanStatus === 'REJECTED') return jsonError('فایل قرنطینه قابل پردازش نیست.', 400);

  const result = await enqueueReprocess(file.id);
  await audit({
    organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName,
    action: 'REPROCESS', objectType: 'FileObject', objectId: file.id,
    detail: `doc=${doc.docNumber} corr=${result.correlationId}`,
  });

  return jsonOk({
    ...result,
    note: result.processable
      ? 'پردازش مجدد در صف قرار گرفت. مقادیر تأییدشدهٔ انسانی حفظ می‌شود و نتایج جدید به‌عنوان «پیشنهاد» ثبت می‌شوند.'
      : 'این فرمت پردازش متنی ندارد.',
  });
}
