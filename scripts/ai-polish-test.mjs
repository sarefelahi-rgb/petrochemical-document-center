// آزمون سیم‌کشی API «اصلاح هوشمند متن OCR» — مسیر، مجوز و پاسخ‌های منطقی
const BASE = 'http://localhost:3000';
let cookie = '';

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...(opts.headers || {}) },
  });
  const setc = res.headers.getSetCookie?.() || [];
  if (setc.length) cookie = setc.map((c) => c.split(';')[0]).join('; ');
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const l = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'Admin-Secure-2027x' }) });
  if (l.status !== 200) throw new Error('login failed');

  // فایل PDF نمونه با متن OCR از داده‌های نمونه
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  const pt = await db.pageText.findFirst({
    where: { source: 'OCR', wordCount: { gte: 4 } },
    select: { fileId: true },
    orderBy: { createdAt: 'desc' },
  });
  const anyFile = await db.fileObject.findFirst({ where: { mimeType: 'application/pdf', quarantine: false }, select: { id: true, originalName: true }, orderBy: { createdAt: 'desc' } });
  const fileId = pt?.fileId || anyFile?.id;
  if (!fileId) { console.log('⚠ هیچ فایل PDF در DB نیست — آزمون سیم‌کشی رد شد'); process.exit(0); }
  console.log('فایل آزمون:', fileId, '| OCR page exists:', !!pt);

  const r = await api(`/api/files/${fileId}/ai-polish`, { method: 'POST' });
  console.log('ai-polish:', r.status, JSON.stringify(r.body).slice(0, 200));
  const okShape = r.status === 200 && typeof r.body.polished === 'number' && typeof r.body.message === 'string';
  console.log(`${okShape ? '✓' : '✗'} ساختار پاسخ درست (polished+message)`);
  // اگر صفحهٔ OCR متن‌دار بود و مدل در دسترس، انتظار polished>=0 (ممکن است صفر باشد اگر قبلاً polished شده)
  console.log(`${r.body.polished !== undefined ? '✓' : '✗'} فیلد polished برگشت`);

  // عدم دسترسی کاربر بی‌مجور: فایل ناموجود → 404
  const r2 = await api(`/api/files/nonexistent-id/ai-polish`, { method: 'POST' });
  console.log(`${r2.status === 404 ? '✓' : '✗'} فایل ناموجود → 404 (${r2.status})`);

  await db.$disconnect();
  process.exit(okShape && r2.status === 404 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
