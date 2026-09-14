// پیام‌های یک گفتگو + تغییرنام + حذف — فقط مالک گفتگو
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, jsonOk, jsonError } from '@/lib/guard';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const { id } = await params;
  const conv = await db.conversation.findFirst({ where: { id, userId: auth.user.id } });
  if (!conv) return jsonError('گفت‌وگو یافت نشد.', 404, 'NOT_FOUND');
  const messages = await db.assistantMessage.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  return jsonOk({
    conversation: { id: conv.id, title: conv.title, createdAt: conv.createdAt },
    messages: messages.map((m) => ({
      id: m.id, role: m.role, content: m.content, citations: m.citations ? JSON.parse(m.citations) : [], createdAt: m.createdAt,
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const title = (body?.title || '').trim();
  if (!title) return jsonError('عنوان را بنویسید.');
  const conv = await db.conversation.findFirst({ where: { id, userId: auth.user.id } });
  if (!conv) return jsonError('گفت‌وگو یافت نشد.', 404, 'NOT_FOUND');
  await db.conversation.update({ where: { id }, data: { title: title.slice(0, 80) } });
  return jsonOk({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const { id } = await params;
  const conv = await db.conversation.findFirst({ where: { id, userId: auth.user.id } });
  if (!conv) return jsonError('گفت‌وگو یافت نشد.', 404, 'NOT_FOUND');
  await db.assistantMessage.deleteMany({ where: { conversationId: id } });
  await db.conversation.delete({ where: { id } });
  return jsonOk({ ok: true });
}
