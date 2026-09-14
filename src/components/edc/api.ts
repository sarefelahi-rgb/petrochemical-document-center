'use client';
// کمکی‌های سمت کلاینت: فراخوانی API، قالب‌ها، برچسب وضعیت‌ها

export async function api<T = unknown>(url: string, options?: RequestInit & { json?: unknown }): Promise<T> {
  const init: RequestInit = { ...options, credentials: 'same-origin' };
  if (options?.json !== undefined) {
    init.body = JSON.stringify(options.json);
    init.headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  }
  const resp = await fetch(url, init);
  const text = await resp.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!resp.ok) {
    const err = (data as { error?: string })?.error || `خطای ${resp.status}`;
    const e = new Error(err) as Error & { status?: number };
    e.status = resp.status;
    throw e;
  }
  return data as T;
}

export const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'دریافت‌شده', PROCESSING: 'در پردازش', INCOMPLETE: 'ناقص', IN_REVIEW: 'در بازبینی',
  APPROVED: 'تأییدشده', PUBLISHED: 'منتشرشده', SUPERSEDED: 'منسوخ', ARCHIVED: 'بایگانی', VOID: 'لغوشده',
};

export const PROC_LABELS: Record<string, string> = {
  UPLOADED: 'بارگذاری‌شده (بدون استخراج)', QUARANTINED: 'قرنطینه', PROCESSED: 'پردازش‌شده', FAILED: 'ناموفق',
};

export const CONF_LABELS: Record<string, string> = {
  PUBLIC: 'عمومی', INTERNAL: 'داخلی', CONFIDENTIAL: 'محرمانه', RESTRICTED: 'بسیار محرمانه',
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'مدیر سامانه', DOC_CONTROLLER: 'مدیر اسناد', ENGINEER: 'مهندس رشته', REVIEWER: 'بازبین',
  APPROVER: 'تأییدکننده', OPERATOR: 'بهره‌بردار', CONTRACTOR: 'پیمانکار', AUDITOR: 'ممیز',
};

export const REV_STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'دریافت‌شده', IN_REVIEW: 'در بازبینی', APPROVED: 'تأییدشده', SUPERSEDED: 'منسوخ', VOID: 'لغوشده',
};

export const LINK_STATUS_LABELS: Record<string, string> = {
  SUGGESTED: 'پیشنهادی', CONFIRMED: 'تأییدشده',
};

export function fmtJalali(date: string | null | undefined, withTime = false): string {
  if (!date) return '—';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    const fmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', withTime
      ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
      : { year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(d);
  } catch { return '—'; }
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بایت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} کیلوبایت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`;
}
