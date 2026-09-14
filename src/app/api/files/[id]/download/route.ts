// دانلود با توکن یک‌بارمصرف کوتاه‌عمر — کنترل مجوز در لحظهٔ دانلود
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonError } from '@/lib/guard';
import { can } from '@/lib/permissions';
import { consumeDownloadToken } from '@/lib/downloadTokens';
import { readObject, objectExists } from '@/lib/storage';
import { audit } from '@/lib/audit';
import { getClientIp } from '@/lib/guard';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const { id } = await params;
  const token = req.nextUrl.searchParams.get('token') || '';
  if (!token) return jsonError('دسترسی مستقیم به فایل مجاز نیست؛ توکن لازم است.', 401, 'TOKEN_REQUIRED');

  const file = await db.fileObject.findUnique({
    where: { id },
    include: { revision: { include: { document: true } } },
  });
  if (!file || !file.revision?.document) return jsonError('فایل یافت نشد.', 404, 'NOT_FOUND');
  const doc = file.revision.document;

  // مجوز در لحظهٔ دانلود — ابطال دسترسی فوراً اعمال می‌شود
  const ctx = await buildAccessContext(auth.user);
  if (!can(ctx, 'doc:download', doc)) {
    await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'DOWNLOAD_DENIED', objectType: 'FileObject', objectId: id, ip: getClientIp(req) });
    return jsonError('اجازه دریافت این فایل را ندارید.', 403, 'FORBIDDEN');
  }
  if (!consumeDownloadToken(token, id, auth.user.id)) {
    return jsonError('توکن نامعتبر یا منقضی است؛ دوباره درخواست دهید.', 401, 'TOKEN_INVALID');
  }
  if (file.quarantine || file.scanStatus === 'REJECTED') {
    return jsonError('این فایل قرنطینه است و قابل دریافت نیست.', 403, 'QUARANTINED');
  }
  if (!objectExists(file.storageKey)) {
    return jsonError('فایل در مخزن یافت نشد؛ با مدیر سامانه تماس بگیرید.', 404, 'MISSING_OBJECT');
  }

  const buf = readObject(file.storageKey);
  await audit({
    organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName,
    action: 'DOWNLOAD', objectType: 'FileObject', objectId: id,
    detail: `doc=${doc.docNumber} size=${file.size}`,
    ip: getClientIp(req),
  });

  const inline = req.nextUrl.searchParams.get('inline') === '1';
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.size),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
