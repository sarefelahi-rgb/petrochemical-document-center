// حاشیه‌نویسی صفحات — لایهٔ جدا از اصل سند؛ نظر/پین/هایلایت وابسته به نسخهٔ مشخص
// اصل سند هرگز تغییر نمی‌کند؛ حاشیه‌نویسی دارای نویسنده، زمان و مجوز است
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can, canViewDocument } from '@/lib/permissions';
import { audit } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;
  const page = parseInt(req.nextUrl.searchParams.get('page') || '0', 10) || null;

  const file = await db.fileObject.findUnique({ where: { id }, include: { revision: { include: { document: true } } } });
  if (!file || !file.revision?.document) return jsonError('فایل یافت نشد.', 404, 'NOT_FOUND');
  if (!can(ctx, 'doc:content', file.revision.document)) return jsonError('اجازه مشاهده محتوای این سند را ندارید.', 403, 'FORBIDDEN');

  const items = await db.annotation.findMany({
    where: { fileId: id, ...(page ? { page } : {}) },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { fullName: true, username: true } } },
  });

  return jsonOk({
    items: items.map((a) => ({
      id: a.id, page: a.page, type: a.type, rect: a.rect ? JSON.parse(a.rect) : null,
      text: a.text, color: a.color, resolved: a.resolved,
      author: a.author?.fullName || 'نامشخص', authorId: a.authorId,
      mine: a.authorId === auth.user.id,
      createdAt: a.createdAt,
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;

  const file = await db.fileObject.findUnique({ where: { id }, include: { revision: { include: { document: true } } } });
  if (!file || !file.revision?.document) return jsonError('فایل یافت نشد.', 404, 'NOT_FOUND');
  const doc = file.revision.document;
  if (!canViewDocument(ctx, doc)) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');
  if (!can(ctx, 'doc:content', doc)) return jsonError('اجازه مشاهده محتوای این سند را ندارید.', 403, 'FORBIDDEN');
  if (file.quarantine) return jsonError('فایل قرنطینه قابل حاشیه‌نویسی نیست.', 400);

  const body = await req.json().catch(() => null) as {
    page?: number; type?: string; rect?: number[]; text?: string; color?: string;
  } | null;
  const page = body?.page || 0;
  const type = body?.type || 'PIN';
  if (page < 1 || page > 2000) return jsonError('شماره صفحه نامعتبر است.', 400);
  if (!['HIGHLIGHT', 'PIN', 'NOTE'].includes(type)) return jsonError('نوع حاشیه‌نویسی نامعتبر است.', 400);
  if (body?.rect && (!Array.isArray(body.rect) || body.rect.length !== 4 || body.rect.some((n) => typeof n !== 'number' || n < -0.01 || n > 1.01))) {
    return jsonError('مختصات نامعتبر است (نرمال 0..1).', 400);
  }
  if ((body?.text || '').length > 1000) return jsonError('متن یادداشت بلندتر از حد مجاز است.', 400);

  const created = await db.annotation.create({
    data: {
      revisionId: file.revisionId!, fileId: id, page,
      type,
      rect: body?.rect ? JSON.stringify(body.rect) : null,
      text: (body?.text || '').slice(0, 1000) || null,
      color: /^#[0-9a-fA-F]{6}$/.test(body?.color || '') ? body!.color! : '#facc15',
      authorId: auth.user.id,
    },
  });

  await audit({
    organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName,
    action: 'ANNOTATION_CREATE', objectType: 'Annotation', objectId: created.id,
    detail: `doc=${doc.docNumber} page=${page} type=${type}`,
  });

  return jsonOk({ id: created.id }, 201);
}
