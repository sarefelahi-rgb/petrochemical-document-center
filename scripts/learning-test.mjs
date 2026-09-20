// آزمون سرتاسری هوش مصنوعی یادگیرنده — حلقهٔ کامل بازخورد → یادگیری → پاسخ تقویت‌شده
// ۱) ورود ادمین  ۲) پرسش ۱  ۳) بازخورد 👍 → باید در حافظه ذخیره شود
// ۴) پرسش مشابه → باید learned=true (دانش آموخته تزریق شده)
// ۵) پرسش ۲ + بازخورد 👎 با «پاسخ درست» → تصحیح آموخته می‌شود
// ۶) پرسش دوبارهٔ همان موضوع → learned=true  ۷) پنل مدیریت: GET /api/assistant/learn
const BASE = 'http://localhost:3000';
let cookie = '';

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(opts.headers || {}),
    },
  });
  const setc = res.headers.getSetCookie?.() || [];
  if (setc.length) cookie = setc.map((c) => c.split(';')[0]).join('; ');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${body?.error || JSON.stringify(body).slice(0, 200)}`);
  return body;
}

const results = [];
function check(name, cond, extra = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
}

async function ask(question) {
  const r = await api('/api/assistant', { method: 'POST', body: JSON.stringify({ question }) });
  return r;
}

console.log('— ورود ادمین');
const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'Admin-Secure-2027x' }) });
check('ورود ادمین', login.ok === true);

console.log('— پاک‌سازی حافظهٔ دورهای قبل (idempotent)');
try {
  const pre = await api('/api/assistant/learn');
  for (const e of pre.entries) await api(`/api/assistant/learn?id=${e.id}`, { method: 'DELETE' });
  console.log(`  حذف ${pre.entries.length} دانش قدیمی`);
} catch { /* اگر مدیر نیست بی‌خیال */ }

console.log('— نوبت ۱: پرسش اولیه');
const q1 = 'سلام! لطفاً یک معرفی کوتاه از توانایی‌هایت بده';
const a1 = await ask(q1);
check('پاسخ نوبت ۱ دریافت شد', !!a1.answer && a1.answer.length > 20, `mode=${a1.mode} len=${a1.answer?.length}`);
check('messageId برگشت', !!a1.messageId);
check('نوبت ۱ بدون دانش آموخته (هنوز)', a1.learned === false);

console.log('— بازخورد 👍 روی پاسخ نوبت ۱');
const fb1 = await api('/api/assistant/feedback', { method: 'POST', body: JSON.stringify({ messageId: a1.messageId, rating: 'UP' }) });
check('بازخورد ثبت شد', fb1.ok === true);
check('دستیار آموخت (learned=true)', fb1.learned === true, fb1.message || '');

console.log('— نوبت ۲: پرسش مشابه (باید از حافظه تقویت شود)');
const a2 = await ask('یک معرفی کوتاه از توانایی‌هایت بده');
check('پاسخ نوبت ۲ دریافت شد', !!a2.answer);
check('پاسخ با حافظهٔ یادگیرنده تقویت شد (learned=true)', a2.learned === true, `learnedCount=${a2.learnedCount}`);

console.log('— نوبت ۳: پرسش فنی + بازخورد 👎 با پاسخ درست');
const q3 = 'سایز خط 6-P-1183-B2A چند است؟';
const a3 = await ask(q3);
check('پاسخ نوبت ۳ دریافت شد', !!a3.answer, `mode=${a3.mode}`);
const fb2 = await api('/api/assistant/feedback', {
  method: 'POST',
  body: JSON.stringify({ messageId: a3.messageId, rating: 'DOWN', expectedAnswer: 'سایز خط 6-P-1183-B2A طبق شناسنامهٔ سامانه ۶ اینچ است.', comment: 'آزمون یادگیری: تصحیح سایز' }),
});
check('تصحیح 👎 ثبت و آموخته شد', fb2.learned === true, fb2.message || '');

console.log('— نوبت ۴: پرسش دوبارهٔ همان موضوع فنی');
const a4 = await ask('سایز خط 6-P-1183-B2A؟');
check('پاسخ نوبت ۴ با دانش تصحیح‌شده تقویت شد', a4.learned === true, `learnedCount=${a4.learnedCount}`);

console.log('— پنل مدیریت: فهرست حافظهٔ یادگیرنده');
const admin = await api('/api/assistant/learn');
check('آمار یادگیری دریافت شد', !!admin.stats && admin.stats.learned >= 2, `learned=${admin.stats?.learned} feedbacks=${admin.stats?.feedbacks} satisfaction=${admin.stats?.satisfaction}`);
check('ورودی‌های آموخته موجود است', admin.entries.length >= 2, `entries=${admin.entries.length}`);

const pass = results.filter((r) => r.pass).length;
console.log(`\nنتیجه: ${pass}/${results.length} PASS`);
process.exit(pass === results.length ? 0 : 1);
