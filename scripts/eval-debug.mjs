// دیباگ گیت راستی‌آزمایی: نمایش کامل پاسخ‌ها و موارد flag‌شده
import { PrismaClient } from '@prisma/client';
const BASE = process.env.EVAL_BASE_URL || 'http://localhost:3000';
const db = new PrismaClient();

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASSWORD }) });
  const j = await r.json();
  if (!j.ok) throw new Error('login failed');
  return r.headers.get('set-cookie').split(';')[0];
}
async function ask(cookie, body) {
  const r = await fetch(`${BASE}/api/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });
  return r.json();
}

async function main() {
  const cookie = await login();
  const qs = [
    { label: 'TITLE', body: { question: 'سندی با عنوان «P&ID واحد ۱۱۰ برگه ۱ — نمونه» ثبت شده است. شمارهٔ دقیق آن سند چیست؟' } },
    { label: 'COUNT', body: { question: 'در کل سامانه چند سند ثبت شده است؟ فقط عدد را بگو.' } },
    { label: 'CONTENT', body: { question: 'خلاصهٔ سند 1183-ISO-0001 را بده و بگو چه اطلاعاتی دارد.' } },
  ];
  for (const q of qs) {
    const res = await ask(cookie, q.body);
    console.log(`\n════════ ${q.label} (verif=${res.verification}) ════════`);
    console.log(res.answer);
    const flagged = (res.answer.match(/⚠️[^\n]*/g) || []);
    if (flagged.length) console.log('>>> FLAGGED:', flagged.join(' | '));
    if (q.label === 'CONTENT') {
      const r2 = await ask(cookie, { question: 'نسخهٔ جاری همین سند چند است؟', conversationId: res.conversationId });
      console.log(`\n════════ MULTITURN (verif=${r2.verification}) ════════`);
      console.log(r2.answer);
    }
    await db.conversation.delete({ where: { id: res.conversationId } }).catch(() => {});
  }
}
main().finally(() => db.$disconnect());
