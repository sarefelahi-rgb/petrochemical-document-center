// آزمون سرتاسری ویژگی‌های نوبت ۵:
//  ۱) جست‌وجوی بی‌محدودیت: بزرگ/کوچکی حروف + ارقام فارسی/لاتین معادل
//  ۲) بارگذاری فایل در دستیار هوش مصنوعی
//  ۳) پذیرش هوشمند ادمین: آپلود + دسته‌بندی خودکار + ویرایش + تأیید (تبدیل به سند) + حذف
//  ۴) ارسال کاربر + تأیید ادمین
//  ۵) دسته‌بندی چندگزینه‌ای محرمانگی + «همه»
import crypto from 'crypto';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`);
}

function makePdf(lines) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = lines.map((l, i) => `BT /F1 12 Tf 50 ${760 - i * 22} Td (${esc(l)}) Tj ET`).join('\n');
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'];
  let pdf = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offs.forEach((o) => { pdf += `${String(o).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

const RUN = Date.now();
const jar = { cookie: '' };
async function call(method, path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  let body = opts.body;
  if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.json); }
  if (jar.cookie && !opts.noCookie) headers['Cookie'] = jar.cookie;
  const resp = await fetch(BASE + path, { method, headers, body });
  const sc = resp.headers.get('set-cookie');
  if (sc && !opts.noCookie) jar.cookie = sc.split(';')[0];
  const ct = resp.headers.get('content-type') || '';
  const data = ct.includes('json') ? await resp.json().catch(() => null) : await resp.text();
  return { status: resp.status, data };
}

async function main() {
  const pw = fs.readFileSync('data/initial-admin-credentials.txt', 'utf8').match(/رمز عبور فعلی: (\S+)/)?.[1];
  const login = await call('POST', '/api/auth/login', { json: { username: 'admin', password: pw } });
  check('ورود ادمین', login.status === 200, `status=${login.status}`);

  // ---------- ۱) جست‌وجوی بی‌محدودیت ----------
  const pdf1 = makePdf(['NEW PIPING SPEC DOC', 'LINE: 6-P-1183-B2A', 'MATERIAL: CARBON STEEL A106']);
  const fd0 = new FormData();
  fd0.append('file', new Blob([pdf1], { type: 'application/pdf' }), 'norm-test.pdf');
  fd0.append('documentId', 'none');

  // ساخت سند نمونه برای آزمون جست‌وجو
  const projects = (await call('GET', '/api/admin/projects')).data.projects;
  const proj = projects.find((p) => !p.isSample) || projects[0];
  const docNum = `NORM-${Math.floor(Math.random() * 9000 + 1000)}`;
  const d = await call('POST', '/api/documents', { json: { docNumber: docNum, title: 'Piping Specification AND قطر خط ۱۲۰۰', projectId: proj.id, discipline: 'PIPING', docType: 'SPEC', confidentiality: 'INTERNAL' } });
  check('ایجاد سند آزمون جست‌وجو', d.status === 201, `status=${d.status} ${JSON.stringify(d.data)}`);
  const docId = d.data.id;

  // جست‌وجو با حروف کوچک (سند با حروف بزرگ)
  const s1 = await call('GET', `/api/search?q=${docNum.toLowerCase()}`);
  check('۱-الف جست‌وجو با حروف کوچک، سند با حروف بزرگ', (s1.data?.items || []).some((i) => i.id === docId), `items=${s1.data?.items?.length}`);
  // جست‌وجو با ارقام فارسی
  const persianNum = docNum.replace('NORM-', 'NORM-').replace(/[0-9]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'[+c]);
  const s2 = await call('GET', `/api/search?q=${encodeURIComponent(persianNum)}`);
  check('۱-ب جست‌وجو با ارقام فارسی، سند با ارقام لاتین', (s2.data?.items || []).some((i) => i.id === docId), `q=${persianNum} items=${s2.data?.items?.length}`);
  // جست‌وجوی عنوان با ارقام فارسی
  const s3 = await call('GET', `/api/documents?q=${encodeURIComponent('قطر خط ۱۲۰۰')}`);
  check('۱-ج فهرست اسناد: عنوان با ارقام فارسی یافت می‌شود', (s3.data?.items || []).some((i) => i.id === docId), `total=${s3.data?.total}`);
  const s4 = await call('GET', `/api/documents?q=${encodeURIComponent('piping specification and')}`);
  check('۱-د فهرست اسناد: حروف کوچک/بزرگ بی‌اثر', (s4.data?.items || []).some((i) => i.id === docId), `total=${s4.data?.total}`);

  // ---------- ۵) دسته‌بندی چندگزینه‌ای + «همه» ----------
  const users = (await call('GET', '/api/admin/users')).data.users;
  const target = users.find((u) => u.username !== 'admin');
  if (target) {
    const p1 = await call('PATCH', '/api/admin/users', { json: { id: target.id, categoryAccess: ['PUBLIC', 'CONFIDENTIAL'] } });
    const u1 = (await call('GET', '/api/admin/users')).data.users.find((u) => u.id === target.id);
    check('۵-الف دسته‌بندی چندگزینه‌ای ذخیره شد', p1.status === 200 && u1?.categoryAccess?.includes('CONFIDENTIAL') && u1?.categoryAccess?.includes('PUBLIC') && !u1?.categoryAccess?.includes('INTERNAL'), JSON.stringify(u1?.categoryAccess));
    const p2 = await call('PATCH', '/api/admin/users', { json: { id: target.id, categoryAccess: 'ALL' } });
    const u2 = (await call('GET', '/api/admin/users')).data.users.find((u) => u.id === target.id);
    check('۵-ب گزینهٔ «همه» ذخیره شد', p2.status === 200 && u2?.categoryAccess === 'ALL', u2?.categoryAccess);
    const p3 = await call('PATCH', '/api/admin/users', { json: { id: target.id, categoryAccess: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] } });
    const u3 = (await call('GET', '/api/admin/users')).data.users.find((u) => u.id === target.id);
    check('۵-ج چهار دسته = معادل همه در ترتیب', p3.status === 200 && u3?.clearance === 'RESTRICTED', `clearance=${u3?.clearance}`);
    // بازگرداندن به حالت پیش‌فرض سطح
    await call('PATCH', '/api/admin/users', { json: { id: target.id, categoryAccess: null, clearance: 'CONFIDENTIAL' } });
  }

  // ---------- ۳) پذیرش هوشمند ادمین ----------
  const intakePdf = makePdf(['PIPE SUPPORT STANDARD', 'DOC NO: PS-STD-2251', 'PROJECT: PETROCHEM UNIT 200', 'CLASS: CS150 SIZE: 4 INCH', 'This document specifies pipe support design requirements.']);
  const fd1 = new FormData();
  fd1.append('file', new Blob([intakePdf], { type: 'application/pdf' }), `PS-STD-2251-R0-${RUN}.pdf`);
  fd1.append('note', 'استاندارد پشتیبانی لوله');
  const up1 = await call('POST', '/api/intake', { body: fd1, headers: {} });
  check('۳-الف آپلود ادمین در پذیرش + استخراج', up1.status === 201 && up1.data?.extraction?.ok === true && up1.data?.extraction?.textChars > 50, `status=${up1.status} chars=${up1.data?.extraction?.textChars} src=${up1.data?.extraction?.source}`);
  check('۳-ب دسته‌بندی خودکار هوش مصنوعی اجرا شد', up1.data?.id && (up1.data?.ai !== null || up1.data?.aiNote), `ai=${JSON.stringify(up1.data?.ai)?.slice(0, 160)}`);
  const itemId = up1.data?.id;

  // فهرست
  const list1 = await call('GET', '/api/intake?status=CLASSIFIED');
  check('۳-ج فهرست پیش‌نویس ادمین', (list1.data?.items || []).some((i) => i.id === itemId), `items=${list1.data?.items?.length}`);

  // ویرایش فیلدها
  const ed1 = await call('PATCH', `/api/intake/${itemId}`, { json: { docNumber: `PS-STD-2251`, title: 'استاندارد پشتیبانی لوله', confidentiality: 'INTERNAL' } });
  check('۳-د ویرایش اطلاعات شناسایی‌شده', ed1.status === 200 && ed1.data?.fields?.title === 'استاندارد پشتیبانی لوله', `status=${ed1.status}`);

  // تأیید → سند رسمی
  const ap1 = await call('PUT', `/api/intake/${itemId}`, { json: { action: 'approve', fields: { projectId: proj.id } } });
  check('۳-ه تأیید → تبدیل به سند رسمی', ap1.status === 200 && ap1.data?.documentId, `status=${ap1.status} doc=${ap1.data?.docNumber} err=${ap1.data?.error}`);
  if (ap1.data?.documentId) {
    const docDetail = await call('GET', `/api/documents/${ap1.data.documentId}`);
    check('۳-و سند جدید با فایل و پردازش', docDetail.status === 200 && docDetail.data?.title === 'استاندارد پشتیبانی لوله', `title=${docDetail.data?.title} processing=${docDetail.data?.processingStatus}`);
  }

  // حذف قلم تأییدشده → ممنوع
  const del1 = await call('DELETE', `/api/intake/${itemId}`);
  check('۳-ز حذف قلم تأییدشده ممنوع', del1.status === 409, `status=${del1.status}`);

  // ---------- ۲) بارگذاری فایل در دستیار ----------
  const helpPdf = makePdf(['MATERIAL SAFETY DATA SHEET', 'PRODUCT: TOLUENE', 'FLASH POINT: 4 C', 'HAZARD: FLAMMABLE LIQUID CLASS 3']);
  const fd2 = new FormData();
  fd2.append('file', new Blob([helpPdf], { type: 'application/pdf' }), `msds-toluene-${RUN}.pdf`);
  const au1 = await call('POST', '/api/assistant/upload', { body: fd2, headers: {} });
  check('۲-الف بارگذاری فایل در دستیار + استخراج', au1.status === 200 && au1.data?.assistantFileId && au1.data?.extraction?.ok, `status=${au1.status} chars=${au1.data?.extraction?.textChars}`);
  check('۲-ب پاسخ مدل/واژگانی دربارهٔ فایل', (au1.data?.answer || '').length > 30, `answer=${(au1.data?.answer || '').slice(0, 100)}…`);
  const convId = au1.data?.conversationId;
  const fileId = au1.data?.assistantFileId;

  // پرسش بعدی دربارهٔ همان فایل در همان گفت‌وگو
  const q1 = await call('POST', '/api/assistant', { json: { question: 'در فایل بارگذاری‌شده، نقطه اشتعال محصول چیست؟', conversationId: convId, assistantFileId: fileId } });
  check('۲-ج پرسش بعدی با شاهد فایل', q1.status === 200 && (q1.data?.citations || []).some((c) => (c.title || '').includes('msds-toluene')), `citations=${JSON.stringify(q1.data?.citations)?.slice(0, 120)}`);

  // ---------- ۴) ارسال کاربر + تأیید ادمین ----------
  // کاربر آزمون: OPERATOR با دسته‌بندی محدود
  const mkU = await call('POST', '/api/admin/users', { json: { username: `t-op-${RUN}`, fullName: 'اپراتور آزمون پذیرش', role: 'OPERATOR', categoryAccess: ['PUBLIC', 'INTERNAL'], projectIds: [proj.id] } });
  check('۴-الف ساخت کاربر با دسته‌بندی چندگزینه‌ای', mkU.status === 201 && mkU.data?.tempPassword, `status=${mkU.status}`);
  const userPw = mkU.data?.tempPassword;
  jar.cookie = '';
  const uLogin = await call('POST', '/api/auth/login', { json: { username: `t-op-${RUN}`, password: userPw } });
  if (uLogin.data?.mustChangePassword) {
    await call('POST', '/api/auth/change-password', { json: { currentPassword: userPw, newPassword: 'UserPass-99x' } });
    await call('POST', '/api/auth/login', { json: { username: `t-op-${RUN}`, password: 'UserPass-99x' } });
  }
  check('۴-ب ورود کاربر', jar.cookie !== '', '');

  const userPdf = makePdf(['VALVE DATA SHEET', 'TAG: XV-2277', 'SIZE: 6 INCH CLASS 300', 'VENDOR: PETRO VALVE CO']);
  const fd3 = new FormData();
  fd3.append('file', new Blob([userPdf], { type: 'application/pdf' }), `valve-datasheet-${RUN}.pdf`);
  fd3.append('note', 'دیتاشیت شیر برای ثبت در سامانه');
  const uUp = await call('POST', '/api/intake', { body: fd3, headers: {} });
  check('۴-ج ارسال کاربر → در انتظار تأیید', uUp.status === 201 && uUp.data?.status === 'PENDING_APPROVAL', `status=${uUp.status} state=${uUp.data?.status}`);
  const userItemId = uUp.data?.id;

  // کاربر اجازه تأیید ندارد
  const uApprove = await call('PUT', `/api/intake/${userItemId}`, { json: { action: 'approve' } });
  check('۴-د کاربر اجازه تأیید ندارد (403)', uApprove.status === 403, `status=${uApprove.status}`);

  // کاربر فهرست خودش را می‌بیند
  const uList = await call('GET', '/api/intake');
  check('۴-ه فهرست ارسال‌های کاربر', (uList.data?.items || []).some((i) => i.id === userItemId), `items=${uList.data?.items?.length}`);
  check('۴-و کاربر isAdmin=false', uList.data?.isAdmin === false, '');

  // کاربر می‌تواند ارسال در انتظار خودش را حذف کند؟ (برای آزمون، یک ارسال دیگر می‌سازیم و حذف می‌کنیم)
  const userPdf2 = makePdf(['DUMMY SHEET FOR DELETE TEST', 'REF: DEL-0001']);
  const fd4 = new FormData();
  fd4.append('file', new Blob([userPdf2], { type: 'application/pdf' }), `del-test-${RUN}.pdf`);
  const uUp2 = await call('POST', '/api/intake', { body: fd4, headers: {} });
  const uDel = await call('DELETE', `/api/intake/${uUp2.data?.id}`);
  check('۴-ز کاربر ارسال در انتظار خودش را حذف می‌کند', uDel.status === 200, `status=${uDel.status}`);

  // ادمین تأیید می‌کند
  jar.cookie = '';
  await call('POST', '/api/auth/login', { json: { username: 'admin', password: pw } });
  const aApprove = await call('PUT', `/api/intake/${userItemId}`, { json: { action: 'approve', fields: { projectId: proj.id }, reviewNote: 'تأیید شد' } });
  check('۴-ح ادمین ارسال کاربر را تأیید می‌کند', aApprove.status === 200 && aApprove.data?.documentId, `status=${aApprove.status} doc=${aApprove.data?.docNumber}`);

  // گزارش
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n== نتیجه: ${pass}/${results.length} PASS ==`);
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((e) => { console.error('CRASH:', e); process.exit(1); });
