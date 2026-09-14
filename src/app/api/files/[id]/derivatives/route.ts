// سرو مشتق مجاز: تصویر صفحه یا بندانگشتی — با کنترل دسترسی سمت سرور
// مشتق در مخزن جدا از اصل نگهداری می‌شود و با ابطال دسترسی فوراً غیرقابل دسترس می‌شود
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonError, getClientIp } from '@/lib/guard';
import { can, canViewDocument } from '@/lib/permissions';
import { readObject, objectExists } from '@/lib/storage';
import { audit } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;
  const kind = req.nextUrl.searchParams.get('kind') || 'PAGE_IMAGE'; // PAGE_IMAGE | THUMB
  const page = parseInt(req.nextUrl.searchParams.get('page') || '0', 10) || null;

  const file = await db.fileObject.findUnique({
    where: { id },
    include: { revision: { include: { document: true } } },
  });
  if (!file || !file.revision?.document) return jsonError('فایل یافت نشد.', 404, 'NOT_FOUND');
  const doc = file.revision.document;

  // سندِ خارج از دسترس، برای کاربر «وجود ندارد» — 404 نه 403 (بدون افشای وجود سند)
  if (!canViewDocument(ctx, doc)) return jsonError('فایل یافت نشد.', 404, 'NOT_FOUND');

  // مجوز محتوا — همان مجوز پیش‌نمایش اصل
  if (!can(ctx, 'doc:content', doc)) {
    await audit({
      organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName,
      action: 'DERIVATIVE_DENIED', objectType: 'FileObject', objectId: id, ip: getClientIp(req),
    });
    return jsonError('اجازه مشاهده محتوای این سند را ندارید.', 403, 'FORBIDDEN');
  }

  const deriv = await db.derivativeObject.findFirst({
    where: { fileId: id, kind, pageNumber: kind === 'THUMB' ? null : page },
    orderBy: { createdAt: 'desc' },
  });
  if (!deriv || !objectExists(deriv.storageKey)) {
    return jsonError('مشتق درخواستی هنوز تولید نشده است.', 404, 'NOT_READY');
  }

  const buf = readObject(deriv.storageKey);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': deriv.mimeType || 'image/png',
      'Content-Length': String(buf.length),
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
