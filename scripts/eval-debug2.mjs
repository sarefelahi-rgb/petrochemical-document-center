// دیباگ هدفمند موارد warned — نمایش دقیق موارد flag‌شده
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
    'محور مهندسی سند 1183-ISO-0001 در چه وضعیتی است؟',
    'مقدار تگ سند 1183-ISO-0001 دقیقاً چیست؟',
  ];
  for (const q of qs) {
    let res = await ask(cookie, { question: q });
    for (let i = 0; i < 4 && /موقتاً در دسترس نیست/.test(res.answer || ''); i++) {
      console.log(`… 429؛ انتظار ۴۵ ثانیه`);
      await new Promise((r) => setTimeout(r, 45000));
      res = await ask(cookie, { question: q });
    }
    console.log(`\n════════ «${q.slice(0, 40)}…» (verif=${res.verification}) ════════`);
    console.log(res.answer);
    await db.conversation.delete({ where: { id: res.conversationId } }).catch(() => {});
    await new Promise((r) => setTimeout(r, 15000));
  }
}
main().finally(() => db.$disconnect());
