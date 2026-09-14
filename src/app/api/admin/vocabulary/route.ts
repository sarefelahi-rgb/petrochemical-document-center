// واژگان کنترل‌شده (رشته مهندسی، نوع مدرک، محرمانگی، مبدأ) — قابل مدیریت از پنل مدیر
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, jsonOk, jsonError } from '@/lib/guard';
import { audit } from '@/lib/audit';

const DEFAULTS: Array<{ domain: string; code: string; label: string; order: number }> = [
  { domain: 'DISCIPLINE', code: 'PIPING', label: 'لوله‌کشی', order: 1 },
  { domain: 'DISCIPLINE', code: 'PROCESS', label: 'فرایند', order: 2 },
  { domain: 'DISCIPLINE', code: 'MECH', label: 'مکانیک تجهیزات', order: 3 },
  { domain: 'DISCIPLINE', code: 'ELEC', label: 'برق', order: 4 },
  { domain: 'DISCIPLINE', code: 'INST', label: 'ابزار دقیق', order: 5 },
  { domain: 'DISCIPLINE', code: 'CIVIL', label: 'عمران و سازه', order: 6 },
  { domain: 'DISCIPLINE', code: 'HSE', label: 'HSE', order: 7 },
  { domain: 'DISCIPLINE', code: 'UNK', label: 'نامشخص', order: 99 },
  { domain: 'DOC_TYPE', code: 'ISOMETRIC', label: 'ایزومتریک', order: 1 },
  { domain: 'DOC_TYPE', code: 'PID', label: 'P&ID', order: 2 },
  { domain: 'DOC_TYPE', code: 'PFD', label: 'PFD', order: 3 },
  { domain: 'DOC_TYPE', code: 'DATASHEET', label: 'دیتاشیت', order: 4 },
  { domain: 'DOC_TYPE', code: 'LINELIST', label: 'Line List', order: 5 },
  { domain: 'DOC_TYPE', code: 'GA', label: 'نقشه GA', order: 6 },
  { domain: 'DOC_TYPE', code: 'LAYOUT', label: 'Layout / Plot Plan', order: 7 },
  { domain: 'DOC_TYPE', code: 'SINGLELINE', label: 'تک‌خطی برق', order: 8 },
  { domain: 'DOC_TYPE', code: 'LOOP', label: 'Loop / Hook-up', order: 9 },
  { domain: 'DOC_TYPE', code: 'VENDOR', label: 'مدارک فروشنده', order: 10 },
  { domain: 'DOC_TYPE', code: 'REPORT', label: 'گزارش/بازرسی/تست', order: 11 },
  { domain: 'DOC_TYPE', code: 'OTHER', label: 'سایر', order: 99 },
  { domain: 'ORIGIN', code: 'INTERNAL', label: 'داخلی', order: 1 },
  { domain: 'ORIGIN', code: 'CONTRACTOR', label: 'پیمانکار', order: 2 },
  { domain: 'ORIGIN', code: 'VENDOR', label: 'فروشنده', order: 3 },
];

async function ensureDefaults() {
  const count = await db.vocabulary.count();
  if (count === 0) {
    await db.vocabulary.createMany({ data: DEFAULTS });
  }
}

export async function GET() {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  await ensureDefaults();
  const items = await db.vocabulary.findMany({ orderBy: [{ domain: 'asc' }, { order: 'asc' }] });
  return jsonOk({ items });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  if (!['ADMIN', 'DOC_CONTROLLER'].includes(auth.user.role)) return jsonError('اجازه مدیریت واژگان را ندارید.', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => null);
  const { domain, code, label } = body || {};
  if (!['DISCIPLINE', 'DOC_TYPE', 'ORIGIN'].includes(domain)) return jsonError('دامنه واژگان نامعتبر است.');
  if (!code?.trim() || !label?.trim()) return jsonError('کد و برچسب الزامی است.');
  const created = await db.vocabulary.create({ data: { domain, code: code.trim().toUpperCase(), label: label.trim(), order: 50 } });
  await audit({ organizationId: auth.user.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'VOCAB_CREATE', detail: `${domain}:${created.code}` });
  return jsonOk({ id: created.id }, 201);
}
