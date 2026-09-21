// مشاهده حسابرسی — فقط مدیر سامانه؛ بدون محتوای محرمانه در لاگ
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, jsonOk, jsonError } from '@/lib/guard';

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  if (auth.user.role !== 'ADMIN') return jsonError('اجازه مشاهده حسابرسی را ندارید.', 403, 'FORBIDDEN');
  const take = Math.min(200, parseInt(req.nextUrl.searchParams.get('take') || '80', 10) || 80);
  const events = await db.auditEvent.findMany({
    where: { organizationId: auth.user.organizationId },
    orderBy: { at: 'desc' },
    take,
    select: { id: true, action: true, actorName: true, objectType: true, objectId: true, detail: true, ip: true, at: true },
  });
  return jsonOk({ events });
}
