// تصمیم کارشناس روی مقدار استخراج‌شده: تأیید / اصلاح / رد
// مقادیر حیاتی تا تأیید کارشناس «استخراج‌شده، تأییدنشده» می‌مانند — حدس سامانه جای بازبینی را نمی‌گیرد
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can, canViewDocument } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { normalizeFa, normalizeCode } from '@/lib/normalize';

const FIELD_CODES = new Set(['DOC_NUMBER', 'LINE', 'TAG', 'REV', 'SHEET', 'SHEET_OF', 'CLASS', 'UNIT', 'PLANT']);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;

  const ex = await db.docExtraction.findUnique({ where: { id }, include: { document: true } });
  if (!ex) return jsonError('رکورد استخراج یافت نشد.', 404, 'NOT_FOUND');
  const doc = ex.document;
  if (!canViewDocument(ctx, doc)) return jsonError('رکورد استخراج یافت نشد.', 404, 'NOT_FOUND');
  if (!can(ctx, 'doc:review', doc)) return jsonError('اجازه بازبینی مقادیر استخراجی را ندارید.', 403, 'FORBIDDEN');

  const body = await req.json().catch(() => null) as { action?: string; value?: string } | null;
  const action = body?.action;
  if (!['confirm', 'edit', 'reject', 'accept_suggestion'].includes(action || '')) {
    return jsonError('اقدام نامعتبر است (confirm/edit/reject/accept_suggestion).', 400);
  }

  // پیشنهاد پردازش مجدد فقط پس از مقایسه قابل تأیید است
  if (ex.isSuggestion && !['confirm', 'accept_suggestion', 'reject'].includes(action || '')) {
    return jsonError('این ردیف پیشنهاد پردازش مجدد است؛ تأیید یا رد کنید.', 400);
  }

  const data: Record<string, unknown> = { reviewedById: auth.user.id, reviewedAt: new Date() };
  if (action === 'confirm' || action === 'accept_suggestion') {
    // در تأیید پیشنهاد، مقدار تأییدشدهٔ قبلی همان فیلد منسوخ (REJECTED) می‌شود
    if (ex.isSuggestion) {
      await db.docExtraction.updateMany({
        where: { fileId: ex.fileId, field: ex.field, status: { in: ['CONFIRMED', 'EDITED'] }, isSuggestion: false },
        data: { status: 'REJECTED' },
      });
    }
    data.status = 'CONFIRMED';
    data.isSuggestion = false;
  } else if (action === 'edit') {
    const val = (body?.value || '').trim();
    if (!val) return jsonError('مقدار اصلاح‌شده خالی است.', 400);
    if (val.length > 200) return jsonError('مقدار اصلاح‌شده بلندتر از حد مجاز است.', 400);
    data.status = 'EDITED';
    data.valueRaw = val;
    data.valueNorm = FIELD_CODES.has(ex.field) ? normalizeCode(val) : normalizeFa(val);
    data.isSuggestion = false;
    if (ex.isSuggestion) {
      await db.docExtraction.updateMany({
        where: { fileId: ex.fileId, field: ex.field, status: { in: ['CONFIRMED', 'EDITED'] }, isSuggestion: false },
        data: { status: 'REJECTED' },
      });
    }
  } else {
    data.status = 'REJECTED';
  }

  const updated = await db.docExtraction.update({ where: { id }, data });

  // وضعیت محور مستقل استخراج: اگر همهٔ مقادیر غیر ردشده تأیید شدند → VERIFIED
  const remaining = await db.docExtraction.findMany({
    where: { fileId: ex.fileId, isSuggestion: false, status: { not: 'REJECTED' } },
    select: { status: true },
  });
  const allConfirmed = remaining.length > 0 && remaining.every((r) => r.status === 'CONFIRMED' || r.status === 'EDITED');
  await db.document.update({
    where: { id: doc.id },
    data: { extractionStatus: allConfirmed ? 'VERIFIED' : 'EXTRACTED_UNREVIEWED' },
  });

  await audit({
    organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName,
    action: 'EXTRACTION_REVIEW', objectType: 'DocExtraction', objectId: id,
    detail: `field=${ex.field} action=${action} doc=${doc.docNumber}`, // بدون محتوای محرمانه
  });

  return jsonOk({ updated: updated.id, status: updated.status, extractionStatus: allConfirmed ? 'VERIFIED' : 'EXTRACTED_UNREVIEWED' });
}
