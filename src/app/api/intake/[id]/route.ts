// مدیریت قلم پذیرش — ویرایش فیلدها، طبقه‌بندی مجدد، تأیید (تبدیل به سند)، رد، حذف
// مجوز: ادمین همهٔ اعمال؛ کاربر فقط حذف اقلام در انتظار خودش
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError, getClientIp } from '@/lib/guard';
import { runClassification, parseFields, approveAsDocument, fieldsFromAi } from '@/lib/intake';
import { audit } from '@/lib/audit';
import fs from 'fs';
import path from 'path';
import { OBJECT_ROOT } from '@/lib/storage';

export const maxDuration = 150;

async function loadItem(id: string, organizationId: string) {
  return db.intakeItem.findFirst({ where: { id, organizationId }, include: { uploader: { select: { id: true, fullName: true } } } });
}

// ویرایش فیلدهای طبقه‌بندی (ادمین) — پیش از تأیید نهایی
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  if (auth.user.role !== 'ADMIN') return jsonError('این عملیات نیازمند نقش مدیر سامانه است.', 403, 'FORBIDDEN');
  const { id } = await params;
  const item = await loadItem(id, ctx.organizationId);
  if (!item) return jsonError('قلم پذیرش یافت نشد.', 404, 'NOT_FOUND');
  if (item.status === 'APPROVED') return jsonError('این قلم به سند تبدیل شده و قابل ویرایش نیست.', 409, 'LOCKED');

  const body = await req.json().catch(() => null);
  if (!body) return jsonError('درخواست نامعتبر است.');

  const { fields: current, projects } = await parseFields(item.aiJson, ctx.organizationId);
  const next = { ...current };
  if (typeof body.docNumber === 'string') next.docNumber = body.docNumber.trim().slice(0, 80) || null;
  if (typeof body.title === 'string') next.title = body.title.trim().slice(0, 200) || null;
  if (typeof body.projectId === 'string') {
    const p = projects.find((pp) => pp.id === body.projectId);
    next.projectId = p ? p.id : null;
    next.projectCode = p ? p.code : null;
  }
  if (typeof body.discipline === 'string') next.discipline = body.discipline.trim().slice(0, 20) || null;
  if (typeof body.docType === 'string') next.docType = body.docType.trim().slice(0, 20) || null;
  if (typeof body.unitId === 'string') next.unitCode = body.unitId || null;
  if (typeof body.revisionCode === 'string') next.revision = body.revisionCode.trim().slice(0, 12) || null;
  if (typeof body.confidentiality === 'string' && ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'].includes(body.confidentiality)) {
    next.confidentiality = body.confidentiality;
  }

  await db.intakeItem.update({
    where: { id: item.id },
    data: { aiJson: JSON.stringify(next), aiNote: body.note === undefined ? item.aiNote : String(body.note || '') },
  });
  await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'INTAKE_EDIT', objectType: 'IntakeItem', objectId: item.id, detail: `fields=${Object.keys(body).join(',')}`, ip: getClientIp(req) });
  return jsonOk({ ok: true, fields: next });
}

// طبقه‌بندی مجدد با مدل
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  if (auth.user.role !== 'ADMIN') return jsonError('این عملیات نیازمند نقش مدیر سامانه است.', 403, 'FORBIDDEN');
  const { id } = await params;
  const item = await loadItem(id, ctx.organizationId);
  if (!item) return jsonError('قلم پذیرش یافت نشد.', 404, 'NOT_FOUND');
  if (item.status === 'APPROVED') return jsonError('این قلم به سند تبدیل شده است.', 409, 'LOCKED');

  const cls = await runClassification({
    fileName: item.originalName,
    mimeType: item.mimeType,
    text: item.extractedText || '',
    organizationId: ctx.organizationId,
  });
  if (!cls.ai) return jsonError(cls.note || 'طبقه‌بندی مجدد ناموفق بود.', 502, 'MODEL_ERROR');

  const projects = await db.project.findMany({ where: { organizationId: ctx.organizationId, isActive: true }, select: { id: true, code: true } });
  const fields = fieldsFromAi(cls.ai, projects);
  await db.intakeItem.update({
    where: { id: item.id },
    data: { aiJson: JSON.stringify(fields), aiConfidence: cls.confidence, aiNote: cls.note || null },
  });
  await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'INTAKE_RECLASSIFY', objectType: 'IntakeItem', objectId: item.id, detail: `conf=${cls.confidence.toFixed(2)}`, ip: getClientIp(req) });
  return jsonOk({ ok: true, fields, aiConfidence: cls.confidence });
}

// تأیید/رد
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  if (auth.user.role !== 'ADMIN') return jsonError('تأیید/رد فقط توسط مدیر سامانه انجام می‌شود.', 403, 'FORBIDDEN');
  const { id } = await params;
  const item = await loadItem(id, ctx.organizationId);
  if (!item) return jsonError('قلم پذیرش یافت نشد.', 404, 'NOT_FOUND');

  const body = await req.json().catch(() => null);
  const action = body?.action;
  const reviewNote = typeof body?.reviewNote === 'string' ? body.reviewNote.slice(0, 500) : undefined;

  if (action === 'reject') {
    if (item.status === 'APPROVED') return jsonError('قلم تأییدشده قابل رد نیست.', 409, 'LOCKED');
    await db.intakeItem.update({
      where: { id: item.id },
      data: { status: 'REJECTED', reviewedById: auth.user.id, reviewedAt: new Date(), reviewNote: reviewNote || null },
    });
    await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'INTAKE_REJECT', objectType: 'IntakeItem', objectId: item.id, detail: `name=${item.originalName} note=${reviewNote || '-'}`, ip: getClientIp(req) });
    return jsonOk({ ok: true, status: 'REJECTED' });
  }

  if (action === 'approve') {
    const res = await approveAsDocument({
      itemId: item.id,
      fields: {
        projectId: body?.fields?.projectId,
        docNumber: body?.fields?.docNumber,
        title: body?.fields?.title,
        discipline: body?.fields?.discipline,
        docType: body?.fields?.docType,
        unitId: body?.fields?.unitId,
        confidentiality: body?.fields?.confidentiality,
        revisionCode: body?.fields?.revisionCode,
      },
      reviewerId: auth.user.id,
      reviewerName: auth.user.fullName,
      reviewNote,
    });
    if (!res.ok) return jsonError(res.error, 400, 'APPROVE_FAILED');
    return jsonOk({ ok: true, status: 'APPROVED', documentId: res.documentId, docNumber: res.docNumber });
  }

  return jsonError('عملیات نامعتبر است (approve/reject).');
}

// حذف قلم — ادمین هر قلم غیر تأییدشده؛ کاربر فقط اقلام در انتظار خودش
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;
  const item = await loadItem(id, ctx.organizationId);
  if (!item) return jsonError('قلم پذیرش یافت نشد.', 404, 'NOT_FOUND');

  const isAdmin = auth.user.role === 'ADMIN';
  if (!isAdmin && item.uploaderId !== auth.user.id) return jsonError('اجازه حذف این قلم را ندارید.', 403, 'FORBIDDEN');
  if (!isAdmin && item.status !== 'PENDING_APPROVAL') return jsonError('فقط اقلام «در انتظار تأیید» قابل حذف هستند.', 409, 'LOCKED');
  if (item.status === 'APPROVED') return jsonError('قلم تأییدشده به سند تبدیل شده و از اینجا حذف نمی‌شود.', 409, 'LOCKED');

  // حذف فایل از مخزن اگر توسط سند دیگری اشاره نشده باشد
  const usedElsewhere = await db.fileObject.findFirst({ where: { sha256: item.sha256 }, select: { id: true } });
  if (!usedElsewhere) {
    try {
      const abs = path.resolve(path.join(OBJECT_ROOT, item.storageKey));
      if (abs.startsWith(path.resolve(OBJECT_ROOT)) && fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch { /* بی‌خطر */ }
  }
  await db.intakeItem.delete({ where: { id: item.id } });
  await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'INTAKE_DELETE', objectType: 'IntakeItem', objectId: item.id, detail: `name=${item.originalName} by=${isAdmin ? 'admin' : 'user'}`, ip: getClientIp(req) });
  return jsonOk({ ok: true });
}
