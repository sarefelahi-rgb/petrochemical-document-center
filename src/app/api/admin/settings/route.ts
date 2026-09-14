// تنظیمات سازمانی (نام سامانه، رنگ سازمانی، سقف آپلود) — قابل تنظیم از پنل مدیر
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, jsonOk, jsonError } from '@/lib/guard';
import { getSettings, setSetting } from '@/lib/settings';
import { audit } from '@/lib/audit';

export async function GET() {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const settings = await getSettings();
  return jsonOk({ settings });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  if (auth.user.role !== 'ADMIN') return jsonError('اجازه تغییر تنظیمات را ندارید.', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return jsonError('درخواست نامعتبر است.');
  const allowed = ['app.name', 'app.orgName', 'app.primaryColor', 'app.accentColor', 'upload.maxMb'];
  for (const [k, v] of Object.entries(body)) {
    if (!allowed.includes(k)) continue;
    if (k === 'upload.maxMb') {
      const n = parseInt(String(v), 10);
      if (!(n >= 1 && n <= 512)) return jsonError('سقف آپلود باید بین ۱ تا ۵۱۲ مگابایت باشد.');
      await setSetting(k, String(n));
    } else if (k.startsWith('app.') && typeof v === 'string' && v.trim()) {
      await setSetting(k, v.trim().slice(0, 80));
    }
  }
  await audit({ organizationId: auth.user.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'SETTINGS_UPDATE', detail: Object.keys(body).join(',') });
  const settings = await getSettings();
  return jsonOk({ settings });
}
