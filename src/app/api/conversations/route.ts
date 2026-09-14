// فهرست گفتگوهای کاربر برای ساید‌بار دستیار — فقط گفتگوهای خودِ کاربر (انزوای کامل)
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, jsonOk } from '@/lib/guard';

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const q = req.nextUrl.searchParams.get('q')?.trim() || '';
  const convs = await db.conversation.findMany({
    where: {
      userId: auth.user.id,
      ...(q ? { title: { contains: q } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: {
      id: true, title: true, createdAt: true,
      _count: { select: { messages: true } },
    },
  });
  return jsonOk({
    conversations: convs.map((c) => ({
      id: c.id, title: c.title, createdAt: c.createdAt, messageCount: c._count.messages,
    })),
  });
}
