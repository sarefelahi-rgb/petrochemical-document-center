// عملیات روی یک ردیف MTO — تأیید/اصلاح/رد/حذف (فقط کاربر دارای doc:edit)
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can, canViewDocument } from '@/lib/permissions';
import { audit } from '@/lib/audit';

async function loadGuarded(id: string) {
  const auth = await requireUser();
  if ('resp' in auth) return { resp: auth.resp } as const;
  const ctx = await buildAccessContext(auth.user);
  const row = await db.mtoRow.findUnique({ where: { id }, include: { document: true } });
  if (!row || !canViewDocument(ctx, row.document)) return { resp: jsonError('ردیف یافت نشد.', 404, 'NOT_FOUND') } as const;
  if (!can(ctx, 'doc:edit', row.document)) return { resp: jsonError('اجازه اصلاح این سند را ندارید.', 403, 'FORBIDDEN') } as const;
  return { auth, ctx, row } as const;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await loadGuarded((await params).id);
  if ('resp' in g) return g.resp;
  const { auth, ctx, row } = g;
  const body = await req.json().catch(() => null);
  const action: string = body?.action || 'edit';

  if (action === 'confirm' || action === 'reject') {
    const updated = await db.mtoRow.update({
      where: { id: row.id },
      data: { status: action === 'confirm' ? 'CONFIRMED' : 'REJECTED' },
    });
    await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'MTO_ROW_DECIDE', objectType: 'document', objectId: row.documentId, detail: `row=${row.id} → ${updated.status}` });
    return jsonOk({ item: updated });
  }

  // ویرایش فیلدها — مقدار ویرایش‌شدهٔ انسانی حفظ می‌شود
  const b = body?.row || {};
  const updated = await db.mtoRow.update({
    where: { id: row.id },
    data: {
      rowLabel: b.rowLabel !== undefined ? String(b.rowLabel || '').slice(0, 60) || null : undefined,
      rawDesc: b.rawDesc !== undefined ? String(b.rawDesc || '').slice(0, 300) || row.rawDesc : undefined,
      normDesc: b.normDesc !== undefined ? String(b.normDesc || '').slice(0, 300) || null : undefined,
      material: b.material !== undefined ? String(b.material || '').slice(0, 120) || null : undefined,
      sizeMain: b.sizeMain !== undefined ? String(b.sizeMain || '').slice(0, 40) || null : undefined,
      sizeBranch: b.sizeBranch !== undefined ? String(b.sizeBranch || '').slice(0, 40) || null : undefined,
      cls: b.cls !== undefined ? String(b.cls || '').slice(0, 40) || null : undefined,
      schedule: b.schedule !== undefined ? String(b.schedule || '').slice(0, 40) || null : undefined,
      endConn: b.endConn !== undefined ? String(b.endConn || '').slice(0, 40) || null : undefined,
      unit: b.unit !== undefined ? String(b.unit || 'EA').slice(0, 16) || 'EA' : undefined,
      qty: b.qty !== undefined ? (Number.isFinite(Number(b.qty)) && Number(b.qty) >= 0 ? Number(b.qty) : row.qty) : undefined,
      status: 'CONFIRMED', // ویرایش انسانی = تأیید
    },
  });
  await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'MTO_ROW_EDIT', objectType: 'document', objectId: row.documentId, detail: `row=${row.id}` });
  return jsonOk({ item: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await loadGuarded((await params).id);
  if ('resp' in g) return g.resp;
  const { auth, ctx, row } = g;
  await db.mtoRow.delete({ where: { id: row.id } });
  await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'MTO_ROW_DELETE', objectType: 'document', objectId: row.documentId, detail: `row=${row.id}` });
  return jsonOk({ ok: true });
}
