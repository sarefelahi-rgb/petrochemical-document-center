// بارگذاری فایل سند — بازسازی‌شده (نسخهٔ بازیابی‌شده از دسترفتن مسیر)
// قرارداد آزمون‌ها (A/B/D):
//  - FormData: file, documentId, revisionId?, opId (یکتا؛ تکرار → 409)
//  - 201: { id, file:{id}, sha256, duplicateOf, label, processing:{processable,queued,correlationId} }
//  - امضای نادرست → 422 {code:'QUARANTINED'} + ثبت فایل در قرنطینه
//  - SHA-256 بر مبنای محتوا؛ تکرار محتوا → duplicateOf
//  - PDF/تصویر → زنجیرهٔ THUMBNAIL+TEXT_EXTRACT/OCR؛ DOCX/بقیه → بدون صف (processable=false)
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError, getClientIp } from '@/lib/guard';
import { can } from '@/lib/permissions';
import { checkFile, MAX_UPLOAD_MB } from '@/lib/filesec';
import { storeOriginal, quarantineFile, ensureDirs, TMP_ROOT } from '@/lib/storage';
import { enqueuePipelineForFile } from '@/lib/jobs';
import { audit } from '@/lib/audit';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  if (!can(ctx, 'doc:upload')) return jsonError('اجازه بارگذاری فایل ندارید.', 403, 'FORBIDDEN');

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError('درخواست multipart نامعتبر است.');
  }

  const file = form.get('file');
  const documentId = String(form.get('documentId') || '');
  const revisionIdRaw = String(form.get('revisionId') || '');
  const opId = String(form.get('opId') || '');
  if (!(file instanceof File)) return jsonError('فایل ارسال نشده است.');
  if (!documentId) return jsonError('شناسه سند الزامی است.');
  if (!opId || opId.length > 120) return jsonError('شناسه عملیات (opId) الزامی است.');
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return jsonError(`حجم فایل از سقف ${MAX_UPLOAD_MB} مگابایت بیشتر است.`);

  // سند باید در سازمان کاربر و در دامنهٔ دسترسی او باشد (منع پیش‌فرض)
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.organizationId !== ctx.organizationId) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');
  if (!can(ctx, 'doc:upload', doc)) return jsonError('اجازه بارگذاری روی این سند را ندارید.', 403, 'FORBIDDEN');

  // opId یکتا — جلوی ثبت تکراری در retry/ارسال دوباره
  try {
    await db.uploadOp.create({ data: { opId } });
  } catch {
    return jsonError('این شناسه عملیات قبلاً ثبت شده است؛ ارسال تکراری مجاز نیست.', 409, 'DUPLICATE_OP');
  }

  ensureDirs();
  const buf = Buffer.from(await file.arrayBuffer());
  const originalName = path.basename(file.name || 'file').slice(0, 200);
  const check = checkFile(originalName, buf);

  // فایل موقت برای محاسبهٔ SHA-256 و انتقال به مخزن
  const tmpPath = path.join(TMP_ROOT, `up-${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${originalName.replace(/[^\w.\-]/g, '_')}`);
  fs.writeFileSync(tmpPath, buf);

  const auditBase = {
    organizationId: ctx.organizationId,
    actorId: auth.user.id,
    actorName: auth.user.fullName,
    ip: getClientIp(req),
  };

  // --- قرنطینه: امضای نادرست / PDF رمزشده / حجم صفر ---
  if (!check.ok) {
    const qKey = quarantineFile(tmpPath, originalName);
    await db.fileObject.create({
      data: {
        revisionId: null,
        kind: 'ORIGINAL',
        storageKey: qKey,
        originalName,
        mimeType: file.type || check.mime,
        size: buf.length,
        sha256: crypto.createHash('sha256').update(buf).digest('hex'),
        quarantine: true,
        scanStatus: 'REJECTED',
        scanNote: check.reason || 'نامشخص',
        uploadedById: auth.user.id,
      },
    });
    await db.document.update({ where: { id: doc.id }, data: { processingStatus: 'QUARANTINED' } }).catch(() => { });
    await audit({ ...auditBase, action: 'FILE_QUARANTINED', objectType: 'FileObject', objectId: doc.id, detail: `name=${originalName} reason=${check.reason}` });
    fs.unlinkSync(tmpPath);
    return jsonError(check.reason || 'فایل قرنطینه شد.', 422, 'QUARANTINED');
  }

  // اتصال به ویرایش: ویرایش صریح، یا آخرین ویرایش سند، یا ساخت خودکار «0»
  let rev = revisionIdRaw
    ? await db.revision.findFirst({ where: { id: revisionIdRaw, documentId: doc.id } })
    : await db.revision.findFirst({ where: { documentId: doc.id }, orderBy: { createdAt: 'desc' } });
  if (!rev) {
    rev = await db.revision.create({ data: { documentId: doc.id, revisionCode: '0', status: 'RECEIVED' } });
  }
  // ویرایش جاری سند همگام می‌ماند (پایهٔ گردش تأیید و شناسنامه)
  if (doc.currentRevisionId !== rev.id) {
    await db.document.update({ where: { id: doc.id }, data: { currentRevisionId: rev.id } }).catch(() => { });
  }

  // ذخیرهٔ اصل تغییرناپذیر + ردیف فایل
  const stored = await storeOriginal(tmpPath, ctx.organizationId, originalName);
  fs.unlinkSync(tmpPath);
  const dup = await db.fileObject.findFirst({ where: { sha256: stored.sha256, quarantine: false }, orderBy: { createdAt: 'asc' }, select: { id: true } });

  const created = await db.fileObject.create({
    data: {
      revisionId: rev.id,
      kind: 'ORIGINAL',
      storageKey: stored.storageKey,
      originalName,
      mimeType: check.mime,
      size: stored.size,
      sha256: stored.sha256,
      quarantine: false,
      scanStatus: 'CLEAN',
      uploadedById: auth.user.id,
    },
  });
  await db.uploadOp.update({ where: { opId }, data: { fileId: created.id } }).catch(() => { });

  // زنجیرهٔ پردازش (PDF: THUMBNAIL+TEXT_EXTRACT، تصویر: THUMBNAIL+OCR، بقیه: بدون صف)
  const processing = await enqueuePipelineForFile(created.id);

  await audit({ ...auditBase, action: 'FILE_UPLOAD', objectType: 'FileObject', objectId: created.id, detail: `doc=${doc.docNumber} rev=${rev.revisionCode} sha256=${stored.sha256.slice(0, 12)} size=${stored.size} dup=${dup ? dup.id : 'no'} queued=${processing.queued.length}` });

  return jsonOk({
    id: created.id,
    file: { id: created.id },
    revisionId: rev.id,
    label: check.label,
    previewable: check.previewable,
    sha256: stored.sha256,
    size: stored.size,
    duplicateOf: dup && dup.id !== created.id ? dup.id : null,
    processing: {
      processable: processing.processable,
      queued: processing.queued,
      correlationId: processing.correlationId,
    },
  }, 201);
}
