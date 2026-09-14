// حسابرسی — ثبت اقدام بدون افشای محتوای محرمانه در لاگ
import { db } from '@/lib/db';

export async function audit(entry: {
  organizationId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  objectType?: string;
  objectId?: string;
  detail?: string;
  ip?: string;
}) {
  try {
    await db.auditEvent.create({
      data: {
        organizationId: entry.organizationId || null,
        actorId: entry.actorId || null,
        actorName: entry.actorName || null,
        action: entry.action,
        objectType: entry.objectType || null,
        objectId: entry.objectId || null,
        detail: entry.detail ? entry.detail.slice(0, 400) : null, // برش — بدون محتوای سند
        ip: entry.ip || null,
      },
    });
  } catch (e) {
    console.error('audit-fail', e);
  }
}
