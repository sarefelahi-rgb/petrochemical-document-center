// تنظیمات سامانه (نام سازمان، رنگ سازمانی، سهمیه‌ها) + محدودیت نرخ حافظه‌ای
import { db } from '@/lib/db';

export const DEFAULT_SETTINGS: Record<string, string> = {
  'app.name': 'مرکز هوشمند اسناد مهندسی',
  'app.orgName': 'مجتمع پتروشیمی بندر امام (نمونه)',
  'app.primaryColor': '#0f766e',
  'app.accentColor': '#b45309',
  'upload.maxMb': '120',
  'app.sampleDataPresent': 'false',
  // ورود دومرحله‌ای — طبق تصمیم بهره‌بردار فعلاً غیرفعال است؛ در استقرار تولید «true» شود
  'auth.mfaEnabled': 'false',
};

export async function getSetting(key: string): Promise<string> {
  const row = await db.setting.findUnique({ where: { key } }).catch(() => null);
  return row?.value ?? DEFAULT_SETTINGS[key] ?? '';
}

export async function isMfaEnabled(): Promise<boolean> {
  return (await getSetting('auth.mfaEnabled')) === 'true';
}

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function setSetting(key: string, value: string) {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

// ---------- محدودیت نرخ (حافظه‌ای؛ در تولید چندنودی: Redis) ----------
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count > max) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}
