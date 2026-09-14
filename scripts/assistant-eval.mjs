// ارزیاب دقت دستیار هوشمند — هدف: ۱۰۰ از ۱۰۰
// سؤالات از واقعیت‌های پایگاه‌داده ساخته می‌شوند (فیکسچر) و پاسخِ API دستیار به‌شدت راستی‌آزمایی می‌شود:
//   - پاسخ باید حاوی مقدار/کد درست باشد، منبع درست را استناد کند، و برای پرسش‌های بی‌جواب صادقانه سر باز زند.
// اجرا: ADMIN_PASSWORD=... bun scripts/assistant-eval.mjs
import { PrismaClient } from '@prisma/client';

const BASE = process.env.EVAL_BASE_URL || 'http://localhost:3000';
const db = new PrismaClient();

// ---------- نرمال‌سازی فارسی (هم‌ارز src/lib/normalize.ts) ----------
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
function toLatinDigits(s) {
  let out = '';
  for (const ch of s) { const p = PERSIAN_DIGITS.indexOf(ch); out += p >= 0 ? String(p) : ch; }
  return out;
}
function normalizeFa(input) {
  if (!input) return '';
  let s = String(input);
  s = s.replace(/[\u064A\u0649]/g, '\u06CC').replace(/\u0643/g, '\u06A9');
  s = s.replace(/[\u0622\u0623\u0625]/g, '\u0627').replace(/[\u064B-\u065F\u0670]/g, '');
  s = s.replace(/\u200C/g, ' ').replace(/[\u200F\u200E]/g, '');
  s = toLatinDigits(s).replace(/[\.\-_\(\)\[\]\/\\:,،؛]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}
const norm = (s) => normalizeFa(s || '');

const REFUSAL_MARKERS = ['یافت نشد', 'پیدا نشد', 'شاهد کافی', 'موجود نیست', 'ناخوانا'];

// ---------- ورود و فراخوانی دستیار ----------
async function login() {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) { console.error('❌ متغیر محیطی ADMIN_PASSWORD لازم است.'); process.exit(1); }
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: pw }),
  });
  const j = await r.json().catch(() => null);
  if (!j?.ok) throw new Error('ورود ناموفق: ' + JSON.stringify(j).slice(0, 200));
  const sc = r.headers.get('set-cookie');
  if (!sc) throw new Error('کوکی نشست دریافت نشد');
  return sc.split(';')[0];
}

async function ask(cookie, body) {
  const r = await fetch(`${BASE}/api/assistant`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  if (!j || j.error) throw new Error('خطای API دستیار: ' + JSON.stringify(j).slice(0, 200));
  return j;
}

// فراخوانی با تحمل خطای گذرای سقف نرخ (fallback واژگانی = تلاش مجدد)
async function askWithRetry(cookie, body, maxTries = 4) {
  for (let i = 1; i <= maxTries; i++) {
    const res = await ask(cookie, body);
    if (!/موقتاً در دسترس نیست/.test(res.answer || '')) return res;
    if (i < maxTries) {
      console.log(`   … سرویس مدل موقتاً در سقف نرخ؛ انتظار ۴۵ ثانیه و تلاش مجدد (${i}/${maxTries - 1})`);
      await new Promise((r) => setTimeout(r, 45000));
    }
  }
  return ask(cookie, body);
}

// انتظار برای آماده‌شدن سرویس مدل (عبور از پنجرهٔ سقف نرخ) — حداکثر ۸ دقیقه
async function waitForModel(cookie) {
  for (let i = 0; i < 16; i++) {
    const res = await ask(cookie, { question: 'سلام' });
    const degraded = /موقتاً در دسترس نیست/.test(res.answer || '');
    if (!degraded) { console.log('▶ سرویس مدل آماده است.'); await db.conversation.delete({ where: { id: res.conversationId } }).catch(() => {}); return; }
    console.log(`… سرویس مدل در سقف نرخ است؛ انتظار ۳۰ ثانیه (تلاش ${i + 1}/16)`);
    await db.conversation.delete({ where: { id: res.conversationId } }).catch(() => {});
    await new Promise((r) => setTimeout(r, 30000));
  }
  console.log('⚠️ سرویس مدل پس از ۸ دقیقه هم در دسترس نشد — ارزیابی در حالت واژگانی ادامه می‌یابد.');
}

// ---------- ساخت پروندهٔ ارزیابی از واقعیت‌های پایگاه‌داده ----------
async function buildCases() {
  const cases = [];
  const docs = await db.document.findMany({
    orderBy: { createdAt: 'asc' },
    include: { project: { select: { code: true } }, revisions: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  // ۱) وارونِ عنوان → شمارهٔ سند (۶ سند نخست با عنوان متمایز)
  for (const d of docs.slice(0, 6)) {
    cases.push({
      id: `title:${d.docNumber}`, group: 'شناسایی',
      q: `سندی با عنوان «${d.title}» ثبت شده است. شمارهٔ دقیق آن سند چیست؟`,
      expectDoc: d.docNumber, docStrictCitation: false,
    });
  }

  // ۲) وضعیت محور مهندسی (۳ سند)
  const ENG_LABELS = { UNREVIEWED: ['UNREVIEWED', 'بازبینی نشده', 'بازبینی نشده است', 'بازبینی نشده‌است'] };
  for (const d of docs.slice(0, 3)) {
    const acc = ENG_LABELS[d.engineeringStatus] || [d.engineeringStatus];
    cases.push({
      id: `eng:${d.docNumber}`, group: 'وضعیت',
      q: `محور مهندسی سند ${d.docNumber} در چه وضعیتی است؟`,
      expectDoc: d.docNumber, expectContainsAny: acc, docStrictCitation: false,
    });
  }

  // ۳) مقدار فیلد استخراج‌شده (کادر عنوان) — ۴ مورد متمایز
  const exts = await db.docExtraction.findMany({
    where: { field: { in: ['LINE', 'CLASS', 'SCALE', 'TAG'] }, valueRaw: { not: '' } },
    include: { document: { select: { docNumber: true } } },
    orderBy: { confidence: 'desc' }, take: 60,
  });
  const seenField = new Set();
  for (const e of exts) {
    if (seenField.has(e.document.docNumber + ':' + e.field)) continue;
    if (!/^[A-Za-z0-9\-_.]+$/.test(e.valueRaw.trim())) continue;
    seenField.add(e.document.docNumber + ':' + e.field);
    const FA = { LINE: 'خط', CLASS: 'کلاس', SCALE: 'مقیاس', TAG: 'تگ' };
    cases.push({
      id: `ext:${e.document.docNumber}:${e.field}`, group: 'استخراج',
      q: `مقدار ${FA[e.field] || e.field} سند ${e.document.docNumber} دقیقاً چیست؟`,
      expectDoc: e.document.docNumber, expectContains: [e.valueRaw.trim()], docStrictCitation: false,
    });
    if (seenField.size >= 4) break;
  }

  // ۴) منبع‌یابی: خط → سند (اتصال متقاطع؛ استناد سخت‌گیرانه)
  const lineExts = exts.filter((e) => e.field === 'LINE' && /^[\d]+-[A-Z]-[\d]+/.test(e.valueRaw.trim()));
  for (const e of lineExts.slice(0, 3)) {
    cases.push({
      id: `prov:${e.valueRaw.trim()}`, group: 'منبع‌یابی',
      q: `خط ${e.valueRaw.trim()} در کدام سند آمده است؟ شمارهٔ سند را بده.`,
      expectDoc: e.document.docNumber, docStrictCitation: true,
    });
  }

  // ۵) تگ مشترک بین چند سند
  const tagExts = exts.filter((e) => e.field === 'TAG' && /^EA-/.test(e.valueRaw.trim()));
  if (tagExts.length) {
    const tag = tagExts[0].valueRaw.trim();
    const docNums = tagExts.map((e) => ({ num: e.document.docNumber, tag: e.valueRaw.trim() })).filter((x) => x.tag === tag).map((x) => x.num);
    cases.push({
      id: `tag:${tag}`, group: 'منبع‌یابی',
      q: `تگ ${tag} مربوط به کدام اسناد است؟`,
      expectContainsAny: docNums, docStrictCitation: false,
    });
  }

  // ۶) شمارش کل + شمارش پروژه‌ای (پاسخ باید عیناً از آمار دیتابیس باشد)
  const total = await db.document.count();
  cases.push({ id: 'count:total', group: 'شمارش', q: `در کل سامانه چند سند ثبت شده است؟ فقط عدد را بگو.`, expectContains: [String(total)] });
  const perProj = await db.document.groupBy({ by: ['projectId'], _count: true });
  if (perProj.length) {
    const p0 = perProj.sort((a, b) => b._count - a._count)[0];
    const proj = await db.project.findUnique({ where: { id: p0.projectId }, select: { code: true } });
    if (proj) cases.push({ id: `count:proj:${proj.code}`, group: 'شمارش', q: `در پروژهٔ ${proj.code} چند سند داریم؟`, expectContains: [String(p0._count)] });
  }

  // ۷) سر باز زنی صادقانه از پرسش بی‌جواب
  cases.push({
    id: 'refuse:fabrication', group: 'صداقت',
    q: `گرید پلیمری ZQ-9999-X در کدام سند ذکر شده و دانسیتهٔ آن چقدر است؟`,
    refuse: true,
  });

  // ۸) محدودهٔ سند (docId): کلاس خط از استخراج کادر عنوان
  const classExt = exts.find((e) => e.field === 'CLASS' && e.valueRaw.trim());
  if (classExt) {
    const cd = await db.document.findUnique({ where: { id: classExt.documentId }, select: { docNumber: true } });
    if (cd) cases.push({
      id: `scope:${cd.docNumber}`, group: 'محدودهٔ سند', docId: classExt.documentId,
      q: `کلاس این خط چیست؟`,
      expectContains: [classExt.valueRaw.trim()], expectDoc: cd.docNumber, docStrictCitation: false,
    });
  }

  // ۹) گفتگوی چندنوبتی: ویرایش جاری با ضمیر «همین سند»
  const iso = docs.find((d) => d.docNumber.includes('1183-ISO-0001')) || docs[0];
  if (iso) {
    const rev = iso.revisions[0]?.revisionCode || '0';
    cases.push({
      id: 'multiturn:rev', group: 'حافظهٔ گفتگو', multi: true,
      q1: `سند ${iso.docNumber} چیست و چه محتوایی دارد؟`,
      q2: `نسخهٔ جاری همین سند چند است؟`,
      expectDoc: iso.docNumber, expectPattern: `\\b${rev}\\b`,
    });
  }

  return cases;
}

// ---------- سنجش ----------
function citationsDocNumbers(cites) {
  return (cites || []).map((c) => norm(c.docNumber || '')).filter(Boolean);
}
function judge(c, res) {
  const ans = norm(res.answer || '');
  const citeNums = citationsDocNumbers(res.citations);
  const docNum = norm(c.expectDoc || '');
  const reasons = [];

  if (c.expectDoc) {
    const inCites = docNum ? citeNums.some((n) => n.includes(docNum)) : false;
    const inAnswer = docNum ? ans.includes(docNum) : false;
    if (c.docStrictCitation ? !inCites : !(inCites || inAnswer)) {
      reasons.push(`استناد سند «${c.expectDoc}» ${c.docStrictCitation ? 'در منابع' : 'در منابع یا پاسخ'} یافت نشد (منابع: ${citeNums.slice(0, 4).join('، ') || '—'})`);
    }
  }
  if (c.expectContains && !c.expectContains.every((v) => ans.includes(norm(v)))) {
    reasons.push(`عبارت الزامی «${c.expectContains.join('، ')}» در پاسخ نیست`);
  }
  if (c.expectContainsAny && !c.expectContainsAny.some((v) => ans.includes(norm(v)))) {
    reasons.push(`هیچ‌کدام از گزینه‌های «${c.expectContainsAny.join(' | ')}» در پاسخ نیست`);
  }
  if (c.expectPattern && !new RegExp(c.expectPattern).test(ans)) {
    reasons.push(`الگوی «${c.expectPattern}» در پاسخ نیست`);
  }
  if (c.refuse) {
    if (!REFUSAL_MARKERS.some((m) => ans.includes(norm(m)))) reasons.push('پاسخ صادقانه (سر باز زنی) شناسایی نشد');
  }
  return reasons;
}

// ---------- اجرا ----------
async function main() {
  const cookie = await login();
  const cases = await buildCases();
  console.log(`▶ تعداد پرونده‌های ارزیابی: ${cases.length}\n`);
  await waitForModel(cookie);
  const results = [];
  const convIds = [];
  for (const c of cases) {
    try {
      let res;
      if (c.multi) {
        const r1 = await askWithRetry(cookie, { question: c.q1 });
        convIds.push(r1.conversationId);
        res = await askWithRetry(cookie, { question: c.q2, conversationId: r1.conversationId });
      } else {
        res = await askWithRetry(cookie, { question: c.q, docId: c.docId || undefined });
        convIds.push(res.conversationId);
      }
      const reasons = judge(c, res);
      results.push({ id: c.id, group: c.group, pass: reasons.length === 0, reasons, mode: res.mode, verification: res.verification, citations: (res.citations || []).length });
      console.log(`${reasons.length === 0 ? '✅' : '❌'} [${c.group}] ${c.id}${reasons.length ? '\n    ' + reasons.join('\n    ') : ''}   (mode=${res.mode} verif=${res.verification} cites=${(res.citations || []).length})`);
      // فاصلهٔ ملایم بین درخواست‌ها برای احترام به سقف نرخ سرویس مدل
      await new Promise((r) => setTimeout(r, 4000));
    } catch (e) {
      results.push({ id: c.id, group: c.group, pass: false, reasons: [String(e.message || e)] });
      console.log(`💥 [${c.group}] ${c.id} — ${e.message}`);
    }
  }
  // پاک‌سازی گفتگوهای ارزیابی
  for (const id of convIds.filter(Boolean)) {
    await db.conversation.delete({ where: { id } }).catch(() => {});
  }
  const passed = results.filter((r) => r.pass).length;
  const score = `${passed}/${results.length}`;
  const byVerif = {};
  results.forEach((r) => { byVerif[r.verification || '-'] = (byVerif[r.verification || '-'] || 0) + 1; });
  console.log(`\n════════ نتیجهٔ ارزیابی دقت دستیار: ${score} ════════`);
  console.log(`   راستی‌آزمایی: ${JSON.stringify(byVerif)}`);
  const { writeFileSync } = await import('fs');
  writeFileSync('docs/assistant-eval-results.json', JSON.stringify({ score, at: new Date().toISOString(), base: BASE, results }, null, 2));
  console.log('   گزارش: docs/assistant-eval-results.json');
  process.exit(passed === results.length ? 0 : 1);
}
main().finally(() => db.$disconnect());
