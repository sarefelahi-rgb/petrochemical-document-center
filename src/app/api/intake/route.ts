// پذیرش هوشمند اسناد — ارسال فایل توسط ادمین/کاربر + فهرست
// کاربر: فایل می‌فرستد، سامانه خودکار استخراج و دسته‌بندی می‌کند و برای تأیید به ادمین می‌رود
// ادمین: آپلود مستقیم با دسته‌بندی خودکار (وضعیت پیش‌نویس؛ اختیار ویرایش/حذف/ثبت با خودش)
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError, getClientIp } from '@/lib/guard';
import { checkFile, MAX_UPLOAD_MB } from '@/lib/filesec';
import { storeOriginal, ensureDirs, TMP_ROOT } from '@/lib/storage';
import { extractFromFile } from '@/lib/extract';
import { runClassification, fieldsFromAi } from '@/lib/intake';
import { audit } from '@/lib/audit';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const maxDuration = 150;

const SOFT_SYNC_MB = 60;

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const isAdmin = auth.user.role === 'ADMIN';
  const status = req.nextUrl.searchParams.get('status') || '';
  const mine = req.nextUrl.searchParams.get('mine') === '1';

  const where: Record<string, unknown> = { organizationId: ctx.organizationId };
  if (!isAdmin || mine) where.uploaderId = auth.user.id;
  if (status) where.status = status;

  const items = await db.intakeItem.findMany({
    where,
    include: {
      uploader: { select: { fullName: true, username: true } },
      document: { select: { id: true, docNumber: true, docNumberRaw: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return jsonOk({
    items: items.map((it) => ({
      id: it.id,
      status: it.status,
      source: it.source,
      originalName: it.originalName,
      mimeType: it.mimeType,
      size: it.size,
      sha256: it.sha256.slice(0, 12),
      note: it.note,
      pageCount: it.pageCount,
      textSource: it.textSource,
      textChars: (it.extractedText || '').length,
      hasText: (it.extractedText || '').trim().length > 0,
      extractedSample: (it.extractedText || '').slice(0, 400),
      ai: it.aiJson ? JSON.parse(it.aiJson) : null,
      aiConfidence: it.aiConfidence,
      aiNote: it.aiNote,
      reviewNote: it.reviewNote,
      uploader: it.uploader ? { fullName: it.uploader.fullName, username: it.uploader.username } : null,
      document: it.document ? { id: it.document.id, docNumber: it.document.docNumberRaw || it.document.docNumber, title: it.document.title } : null,
      createdAt: it.createdAt,
      reviewedAt: it.reviewedAt,
    })),
    isAdmin,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const isAdmin = auth.user.role === 'ADMIN';

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError('درخواست multipart نامعتبر است.');
  }
  const file = form.get('file');
  const note = String(form.get('note') || '').slice(0, 1000) || null;
  const autoApprove = String(form.get('autoApprove') || '') === '1';
  if (!(file instanceof File)) return jsonError('فایل ارسال نشده است.');
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return jsonError(`حجم فایل از سقف ${MAX_UPLOAD_MB} مگابایت بیشتر است.`);

  const buf = Buffer.from(await file.arrayBuffer());
  const originalName = path.basename(file.name || 'file').slice(0, 200);
  const check = checkFile(originalName, buf);
  if (!check.ok) return jsonError(check.reason || 'فایل مجاز نیست.', 422, 'QUARANTINED');

  const ext = (originalName.match(/\.[a-zA-Z0-9]+$/) || [''])[0].toLowerCase();
  const needsOcr = check.mime.startsWith('image/') || ['.tif', '.tiff'].includes(ext);
  if (needsOcr && file.size > SOFT_SYNC_MB * 1024 * 1024) {
    return jsonError(`فایل تصویری ${Math.round(file.size / 1024 / 1024)} مگابایتی — برای OCR پایدار، حجم را کاهش دهید.`, 413, 'TOO_LARGE_SYNC');
  }

  ensureDirs();
  const tmpPath = path.join(TMP_ROOT, `in-${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${originalName.replace(/[^\w.\-]/g, '_')}`);
  fs.writeFileSync(tmpPath, buf);
  let extraction;
  try {
    extraction = await extractFromFile(tmpPath, originalName);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* بی‌خطر */ }
  }

  const tmpStore = path.join(TMP_ROOT, `inst-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext.slice(0, 12)}`);
  fs.writeFileSync(tmpStore, buf);
  const stored = await storeOriginal(tmpStore, ctx.organizationId, originalName);
  try { fs.unlinkSync(tmpStore); } catch { /* بی‌خطر */ }

  // طبقه‌بندی خودکار با مدل زبانی
  const cls = await runClassification({
    fileName: originalName,
    mimeType: check.mime,
    text: extraction.text || '',
    organizationId: ctx.organizationId,
  });
  const projects = await db.project.findMany({ where: { organizationId: ctx.organizationId, isActive: true }, select: { id: true, code: true } });
  const fields = fieldsFromAi(cls.ai, projects);

  // ادمین → پیش‌نویس (اختیار ویرایش/حذف/ثبت با خودش)؛ کاربر → در انتظار تأیید ادمین
  const status = isAdmin ? (autoApprove ? 'PENDING_APPROVAL' : 'CLASSIFIED') : 'PENDING_APPROVAL';

  const item = await db.intakeItem.create({
    data: {
      organizationId: ctx.organizationId,
      uploaderId: auth.user.id,
      source: isAdmin ? 'ADMIN' : 'USER',
      status,
      originalName,
      mimeType: check.mime,
      size: stored.size,
      sha256: stored.sha256,
      storageKey: stored.storageKey,
      note,
      extractedText: (extraction.text || '').slice(0, 400000),
      textSource: extraction.source || null,
      pageCount: extraction.pageCount ?? null,
      aiJson: cls.ai ? JSON.stringify(fields) : null,
      aiConfidence: cls.ai ? cls.confidence : null,
      aiNote: cls.note || extraction.note || extraction.error || null,
    },
  });

  await audit({
    organizationId: ctx.organizationId,
    actorId: auth.user.id,
    actorName: auth.user.fullName,
    action: 'INTAKE_SUBMIT',
    objectType: 'IntakeItem',
    objectId: item.id,
    detail: `name=${originalName} source=${isAdmin ? 'ADMIN' : 'USER'} classified=${!!cls.ai} conf=${cls.confidence.toFixed(2)} textChars=${(extraction.text || '').length}`,
    ip: getClientIp(req),
  });

  return jsonOk({
    id: item.id,
    status,
    extraction: {
      ok: extraction.ok,
      source: extraction.source || null,
      pageCount: extraction.pageCount ?? null,
      textChars: (extraction.text || '').length,
      note: extraction.note || extraction.error || null,
    },
    ai: cls.ai,
    aiConfidence: cls.confidence,
    aiNote: cls.note,
    fields,
  }, 201);
}
