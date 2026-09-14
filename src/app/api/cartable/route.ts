// کارتابل شخصی — وظایف باز من
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, jsonOk, jsonError } from '@/lib/guard';

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const status = req.nextUrl.searchParams.get('status') || 'OPEN';
  const tasks = await db.cartableTask.findMany({
    where: { assigneeId: auth.user.id, status: status === 'ALL' ? undefined : status },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const openCount = await db.cartableTask.count({ where: { assigneeId: auth.user.id, status: 'OPEN' } });
  return jsonOk({ tasks, openCount });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const body = await req.json().catch(() => null);
  if (!body?.id) return jsonError('شناسه وظیفه لازم است.');
  const task = await db.cartableTask.findUnique({ where: { id: body.id } });
  if (!task || task.assigneeId !== auth.user.id) return jsonError('وظیفه یافت نشد.', 404, 'NOT_FOUND');
  await db.cartableTask.update({
    where: { id: task.id },
    data: { status: body.status === 'OPEN' ? 'OPEN' : body.status === 'CANCELLED' ? 'CANCELLED' : 'DONE', completedAt: new Date() },
  });
  return jsonOk({ ok: true });
}
