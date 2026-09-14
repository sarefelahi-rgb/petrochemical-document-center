// علاقه‌مندی سند
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { canViewDocument } from '@/lib/permissions';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || !canViewDocument(ctx, doc)) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');
  const existing = await db.favorite.findUnique({ where: { userId_documentId: { userId: auth.user.id, documentId: id } } });
  if (existing) {
    await db.favorite.delete({ where: { id: existing.id } });
    return jsonOk({ favorite: false });
  }
  await db.favorite.create({ data: { userId: auth.user.id, documentId: id } });
  return jsonOk({ favorite: true });
}
