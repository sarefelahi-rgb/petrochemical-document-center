// آزمون انتها-به-انتهای دستیار ارتقایافته: فینگلیش، انگلیسی، آپلود فایل + پرسش از آن
const BASE = 'http://localhost:3000';

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASSWORD }),
  });
  const sc = r.headers.get('set-cookie');
  return sc.split(';')[0];
}

const cookie = await login();
console.log('ورود: OK');

// ---------- ۱) پرسش فینگلیش ----------
{
  const r = await fetch(`${BASE}/api/assistant`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ question: 'salam, madarek lule 6-P-1183 ro neshan bede' }),
  });
  const j = await r.json();
  console.log('\n=== فینگلیش: "salam, madarek lule 6-P-1183 ro neshan bede"');
  console.log('mode:', j.mode, '| verif:', j.verification, '| cites:', j.citations?.length);
  console.log('پاسخ:', (j.answer || '').slice(0, 300).replace(/\n+/g, ' ⏎ '));
}

// ---------- ۲) پرسش انگلیسی ----------
{
  const r = await fetch(`${BASE}/api/assistant`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ question: 'How many documents do I have in project PRJ-BI-1403?' }),
  });
  const j = await r.json();
  console.log('\n=== انگلیسی: "How many documents in PRJ-BI-1403?"');
  console.log('mode:', j.mode, '| verif:', j.verification);
  console.log('پاسخ:', (j.answer || '').slice(0, 250).replace(/\n+/g, ' ⏎ '));
}

// ---------- ۳) آپلود فایل MD + پرسش از محتوای آن ----------
const md = `# گزارش آزمون فشار خط 9-A-3301-C1B

خط لوله 9-A-3301-C1B طبق دیتاشیت شیر V-7701 امروز آزمون فشار شد.
نتیجه: افت فشار صفر بار در ۳۰ دقیقه — تأیید شد.
نکته: گسکت فلنج شماره F-220 جایگزین شد.
`;
const form = new FormData();
form.append('file', new File([md], 'pressure-test-report.md', { type: 'text/markdown' }));
{
  const r = await fetch(`${BASE}/api/assistant/upload`, { method: 'POST', headers: { Cookie: cookie }, body: form });
  const j = await r.json();
  console.log('\n=== آپلود فایل MD');
  console.log('ok:', r.status, '| extraction:', JSON.stringify(j.extraction || j).slice(0, 220));
  const convId = j.conversationId;

  // پرسش پیگیری دربارهٔ فایل (فینگلیش!)
  const r2 = await fetch(`${BASE}/api/assistant`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ question: 'natije azmoon feshar khat 9-A-3301 chi shod? gasket ham che?', conversationId: convId, assistantFileId: j.assistantFileId }),
  });
  const j2 = await r2.json();
  console.log('\n=== پرسش فینگلیش از فایل بارگذاری‌شده');
  console.log('mode:', j2.mode, '| verif:', j2.verification, '| cites:', j2.citations?.length);
  console.log('پاسخ:', (j2.answer || '').slice(0, 350).replace(/\n+/g, ' ⏎ '));
}
