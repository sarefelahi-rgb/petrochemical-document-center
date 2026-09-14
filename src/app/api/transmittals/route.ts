// ترنسمیتال ورودی/خروجی — فهرست و ایجاد (سیاست §79)
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can } from '@/lib/permissions';
import { audit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();

  const rows = await db.transmittal.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(q ? { OR: [{ number: { contains: q } }, { party: { contains: q } }, { purpose: { contains: q } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: { items: { select: { id: true } } },
    take: 100,
  });

  return jsonOk({
    items: rows.map((t) => ({
      id: t.id, number: t.number, direction: t.direction, party: t.party, purpose: t.purpose,
      status: t.status, sentAt: t.sentAt, ackAt: t.ackAt, note: t.note, itemCount: t.items.length,
      createdAt: t.createdAt,
    })),
    canManage: can(ctx, 'doc:edit') || can(ctx, 'admin:manage'),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  if (!can(ctx, 'doc:edit') && !can(ctx, 'admin:manage')) {
    return jsonError('اجازه مدیریت ترنسمیتال را ندارید.', 403, 'FORBIDDEN');
  }
  const body = await req.json().catch(() => null);
  const number = String(body?.number || '').trim().slice(0, 80);
  const direction = body?.direction === 'IN' ? 'IN' : body?.direction === 'OUT' ? 'OUT' : '';
  const party = String(body?.party || '').trim().slice(0, 160);
  if (!number || !direction || !party) return jsonError('شماره، جهت و طرف سازمانی الزامی است.');

  const exists = await db.transmittal.findUnique({ where: { number } });
  if (exists) return jsonError('شماره ترنسمیتال تکراری است.', 409, 'DUPLICATE');

  const t = await db.transmittal.create({
    data: {
      organizationId: ctx.organizationId, number, direction, party,
      purpose: String(body?.purpose || '').slice(0, 300) || null,
      status: 'DRAFT',
      note: String(body?.note || '').slice(0, 500) || null,
      createdById: auth.user.id,
    },
  });
  await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'TRANSMITTAL_CREATE', objectType: 'transmittal', objectId: t.id, detail: `number=${number} dir=${direction}` });
  return jsonOk({ item: t });
}
