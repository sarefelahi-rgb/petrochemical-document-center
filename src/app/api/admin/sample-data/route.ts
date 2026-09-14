// ایجاد/حذف داده نمونه — فقط مدیر سامانه
import { NextRequest } from 'next/server';
import { requireUser, jsonOk, jsonError } from '@/lib/guard';
import { createSampleData, purgeSampleData } from '@/lib/sampleData';
import { getSettings } from '@/lib/settings';
import { audit } from '@/lib/audit';

export async function GET() {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  if (auth.user.role !== 'ADMIN') return jsonError('اجازه این عملیات را ندارید.', 403, 'FORBIDDEN');
  const s = await getSettings();
  const counts = {
    sampleDocs: await db_documentSampleCount(),
  };
  return jsonOk({ present: s['app.sampleDataPresent'] === 'true', counts });
}

async function db_documentSampleCount(): Promise<number> {
  const { db } = await import('@/lib/db');
  return db.document.count({ where: { isSample: true } });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  if (auth.user.role !== 'ADMIN') return jsonError('اجازه این عملیات را ندارید.', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  if (body?.action === 'create') {
    const result = await createSampleData(auth.user.organizationId, auth.user.id);
    return jsonOk(result);
  }
  if (body?.action === 'purge') {
    const result = await purgeSampleData();
    await audit({ organizationId: auth.user.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'SAMPLE_DATA_PURGE', detail: `documents=${result.documentsRemoved}` });
    return jsonOk(result);
  }
  return jsonError('اقدام نامعتبر است.');
}
