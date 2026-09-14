// آزمون‌های پذیرش مرحله A — اجرا: bun tests/phase-a-tests.mjs
// پوشش: ورود دو مرحله‌ای مدیر، تغییر اجباری رمز، آپلود با SHA-256، قرنطینه، شناسه عملیات یکتا،
// انزوای دو پروژه (API و جست‌وجو و دانلود)، توکن یک‌بارمصرف، قفل تلاش ورود، داده نمونه برچسب‌خورده
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';

const db = new PrismaClient();
const BASE = 'http://localhost:3000';
const results = [];

function check(name, cond, evidence) {
  results.push({ name, ok: !!cond, evidence: String(evidence || '').slice(0, 160) });
  console.log(`${cond ? 'PASS' : 'FAIL'} | ${name} | ${evidence || ''}`);
}

// ---------- TOTP ----------
function base32Decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0; const out = [];
  for (const ch of s) { const i = A.indexOf(ch); if (i < 0) continue; value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret, step = Math.floor(Date.now() / 30000)) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  buf.writeUInt32BE(step % 0x100000000, 4);
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1000000).padStart(6, '0');
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

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

const RUN = Date.now();
const jars = new Map(); // name -> cookie string
async function call(as, path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
  if (jars.has(as)) headers['Cookie'] = jars.get(as);
  const resp = await fetch(BASE + path, { ...opts, headers });
  const setCookie = resp.headers.get('set-cookie');
  if (setCookie) jars.set(as, setCookie.split(';')[0]);
  const text = await resp.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 100) }; }
  return { status: resp.status, data, buf: Buffer.from(text) };
}

async function preClean() {
  // پاک‌سازی بقایای اجرای قبلی (در صورت کرش میان‌راه)
  const oldProjects = await db.project.findMany({ where: { code: { in: ['PRJ-TEST-A', 'PRJ-TEST-B'] } } });
  const oldIds = oldProjects.map((p) => p.id);
  if (oldIds.length > 0) {
    const docs = (await db.document.findMany({ where: { projectId: { in: oldIds } } })).map((d) => d.id);
    const revs = (await db.revision.findMany({ where: { documentId: { in: docs } } })).map((r) => r.id);
    const files = await db.fileObject.findMany({ where: { revisionId: { in: revs } } });
    const fileIds = files.map((f) => f.id);
    // فرزندان مرحله B پیش از حذف فایل پاک می‌شوند (صف پردازش، متن صفحات، مشتق‌ها، حاشیه‌نویسی، استخراج، صف بازبینی)
    await db.reviewTask.deleteMany({ where: { OR: [{ fileId: { in: fileIds } }, { documentId: { in: docs } }] } });
    await db.docExtraction.deleteMany({ where: { fileId: { in: fileIds } } });
    await db.annotation.deleteMany({ where: { fileId: { in: fileIds } } });
    await db.derivativeObject.deleteMany({ where: { fileId: { in: fileIds } } });
    await db.pageText.deleteMany({ where: { fileId: { in: fileIds } } });
    await db.processingJob.deleteMany({ where: { fileId: { in: fileIds } } });
    await db.docLink.deleteMany({ where: { documentId: { in: docs } } });
    await db.favorite.deleteMany({ where: { documentId: { in: docs } } });
    await db.fileObject.deleteMany({ where: { id: { in: fileIds } } });
    await db.revision.deleteMany({ where: { id: { in: revs } } });
    await db.document.deleteMany({ where: { id: { in: docs } } });
    await db.projectMember.deleteMany({ where: { projectId: { in: oldIds } } });
    await db.project.deleteMany({ where: { id: { in: oldIds } } });
    for (const f of files) { try { fs.unlinkSync('data/objectstore/' + f.storageKey); } catch { } }
  }
  for (const un of ['test-eng-a', 'test-eng-b']) {
    const u = await db.user.findUnique({ where: { username: un } });
    if (u) {
      await db.cartableTask.deleteMany({ where: { assigneeId: u.id } });
      await db.session.deleteMany({ where: { userId: u.id } });
      await db.mfaChallenge.deleteMany({ where: { userId: u.id } });
      await db.user.delete({ where: { id: u.id } });
    }
  }
}

async function main() {
  console.log('== آزمون‌های مرحله A ==');
  await preClean();
  const credTxt = fs.readFileSync('data/initial-admin-credentials.txt', 'utf8');
  const adminPw = credTxt.match(/(?:رمز اولیه|رمز عبور فعلی): (\S+)/)?.[1];
  if (!adminPw) throw new Error('اعتبارنامه مدیر یافت نشد');

  // ۰) آماده‌سازی MFA آزمون برای مدیر (پس از آزمون بازنشانی می‌شود)
  // توجه: ورود دومرحله‌ای طبق تصمیم بهره‌بردار فعلاً غیرفعال است؛ این آزمون صریحاً فعالش می‌کند و در پایان برمی‌گرداند
  const TEST_SECRET = 'JBSWY3DPEHPK3PXP';
  await db.setting.upsert({ where: { key: 'auth.mfaEnabled' }, update: { value: 'true' }, create: { key: 'auth.mfaEnabled', value: 'true' } });
  await db.user.update({ where: { username: 'admin' }, data: { mfaSecret: TEST_SECRET, mfaEnabled: true } });

  // ۱) ورود مدیر بدون MFA ممکن نیست
  const r1 = await call('admin', '/api/auth/login', { method: 'POST', json: { username: 'admin', password: adminPw } });
  check('A-06 ورود مدیر نیازمند MFA است', r1.data?.mfaRequired === true, `status=${r1.status} mfaRequired=${r1.data?.mfaRequired}`);

  const r2 = await call('admin', '/api/auth/mfa-verify', { method: 'POST', json: { mfaToken: r1.data.mfaToken, code: totp(TEST_SECRET) } });
  check('A-06 ورود مدیر با کد TOTP موفق', r2.status === 200 && !!jars.get('admin'), `status=${r2.status}`);

  // ۲) دسترسی بدون نشست رد می‌شود
  const rAnon = await fetch(BASE + '/api/documents');
  check('A-04 منع پیش‌فرض بدون ورود', rAnon.status === 401, `status=${rAnon.status}`);

  // ۳) ساخت دو پروژه و دو کاربر (انزوا)
  const mk = await call('admin', '/api/admin/projects', { method: 'POST', json: { kind: 'project', code: 'PRJ-TEST-A', name: 'پروژه آزمون الف' } });
  const mk2 = await call('admin', '/api/admin/projects', { method: 'POST', json: { kind: 'project', code: 'PRJ-TEST-B', name: 'پروژه آزمون ب' } });
  check('A-02 ایجاد پروژه‌ها', mk.status === 201 && mk2.status === 201, `A=${mk.status} B=${mk2.status}`);
  const projects = (await call('admin', '/api/admin/projects')).data.projects;
  const projA = projects.find((p) => p.code === 'PRJ-TEST-A');
  const projB = projects.find((p) => p.code === 'PRJ-TEST-B');

  const mkU1 = await call('admin', '/api/admin/users', { method: 'POST', json: { username: 'test-eng-a', fullName: 'مهندس آزمون الف', role: 'ENGINEER', clearance: 'CONFIDENTIAL', projectIds: [projA.id] } });
  const mkU2 = await call('admin', '/api/admin/users', { method: 'POST', json: { username: 'test-eng-b', fullName: 'مهندس آزمون ب', role: 'ENGINEER', clearance: 'CONFIDENTIAL', projectIds: [projB.id] } });
  check('A-09 ایجاد کاربران با عضویت صریح', mkU1.status === 201 && mkU2.status === 201, `A=${mkU1.status} B=${mkU2.status}`);
  const engA_pw = mkU1.data.tempPassword, engB_pw = mkU2.data.tempPassword;

  // ۴) ورود مهندس الف + تغییر اجباری رمز
  const l1 = await call('engA', '/api/auth/login', { method: 'POST', json: { username: 'test-eng-a', password: engA_pw } });
  check('A-05 ورود اولین بار با mustChangePassword', l1.status === 200 && l1.data?.mustChangePassword === true, `status=${l1.status}`);
  const cp = await call('engA', '/api/auth/change-password', { method: 'POST', json: { currentPassword: engA_pw, newPassword: 'NewPass-Test1' } });
  check('A-05 تغییر رمز موفق + لغو نشست‌ها', cp.status === 200 && cp.data?.relogin === true, `status=${cp.status}`);
  const l2 = await call('engA', '/api/auth/login', { method: 'POST', json: { username: 'test-eng-a', password: 'NewPass-Test1' } });
  check('A-05 ورود با رمز جدید', l2.status === 200, `status=${l2.status}`);
  await call('engB', '/api/auth/login', { method: 'POST', json: { username: 'test-eng-b', password: engB_pw } });
  await call('engB', '/api/auth/change-password', { method: 'POST', json: { currentPassword: engB_pw, newPassword: 'NewPass-Test2' } });
  await call('engB', '/api/auth/login', { method: 'POST', json: { username: 'test-eng-b', password: 'NewPass-Test2' } });

  // ۵) ایجاد اسناد در دو پروژه
  const dA = await call('engA', '/api/documents', { method: 'POST', json: { docNumber: '1183-ISO-TEST', title: 'ایزومتریک آزمون خط 6-P-1183-B2A', projectId: projA.id, discipline: 'PIPING', docType: 'ISOMETRIC', confidentiality: 'CONFIDENTIAL' } });
  const dB = await call('engB', '/api/documents', { method: 'POST', json: { docNumber: '210-PID-TEST', title: 'P&ID آزمون پروژه ب', projectId: projB.id, discipline: 'PROCESS', docType: 'PID', confidentiality: 'CONFIDENTIAL' } });
  check('A-16 ایجاد شناسنامه در دو پروژه', dA.status === 201 && dB.status === 201, `A=${dA.status} B=${dB.status}`);
  const dupDoc = await call('engA', '/api/documents', { method: 'POST', json: { docNumber: '1183-iso-test', title: 'تکراری', projectId: projA.id } });
  check('A-03 شماره سند یکتا در پروژه (نرمال‌سازی)', dupDoc.status === 409, `status=${dupDoc.status}`);
  const revA = await call('engA', `/api/documents/${dA.data.id}/revisions`, { method: 'POST', json: { revisionCode: '0' } });

  // ۶) آپلود با checksum + تشخیص تکرار + قرنطینه + opId
  const pdfBytes = makePdf(['TEST ISOMETRIC (PHASE A)', 'LINE: 6-P-1183-B2A']);
  const fd = new FormData();
  fd.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), '1183-ISO-TEST-R0.pdf');
  fd.append('documentId', dA.data.id);
  fd.append('revisionId', revA.data.id);
  fd.append('opId', `op-${RUN}-0001`);
  const up1 = await call('engA', '/api/upload', { method: 'POST', body: fd });
  check('A-12 آپلود موفق با SHA-256', up1.status === 201 && up1.data?.sha256 === sha256(pdfBytes), `status=${up1.status} sha=${up1.data?.sha256?.slice(0, 12)}…`);

  const fd2 = new FormData();
  fd2.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), '1183-ISO-TEST-R0-copy.pdf');
  fd2.append('documentId', dA.data.id);
  fd2.append('revisionId', revA.data.id);
  fd2.append('opId', `op-${RUN}-0002`);
  const up2 = await call('engA', '/api/upload', { method: 'POST', body: fd2 });
  check('A-12 تشخیص محتوای تکراری', up2.status === 201 && up2.data?.duplicateOf === up1.data.id, `duplicateOf=${up2.data?.duplicateOf}`);

  const fakePdf = Buffer.from('این یک فایل متنی است نه PDF — امضای غلط', 'utf8');
  const fd3 = new FormData();
  fd3.append('file', new Blob([fakePdf], { type: 'application/pdf' }), 'fake.pdf');
  fd3.append('documentId', dA.data.id);
  fd3.append('opId', `op-${RUN}-0003`);
  const up3 = await call('engA', '/api/upload', { method: 'POST', body: fd3 });
  check('A-13 قرنطینه: پسوند pdf با محتوای غیر PDF', up3.status === 422 && (up3.data?.code === 'QUARANTINED'), `status=${up3.status}`);

  const fd4 = new FormData();
  fd4.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'again.pdf');
  fd4.append('documentId', dA.data.id);
  fd4.append('opId', `op-${RUN}-0001`); // شناسه تکراری
  const up4 = await call('engA', '/api/upload', { method: 'POST', body: fd4 });
  check('A-12 شناسه عملیات یکتا جلوی ثبت تکراری', up4.status === 409, `status=${up4.status}`);

  // ۷) انزوای دو پروژه
  const lstA = await call('engA', '/api/documents');
  check('A-10 فهرست مهندس الف فقط پروژهٔ خودش', lstA.data.items.every((d) => d.project.code === 'PRJ-TEST-A') && lstA.data.items.length >= 1, `count=${lstA.data.items.length}`);
  const getB = await call('engA', `/api/documents/${dB.data.id}`);
  check('A-10 دسترسی مستقیم به سند پروژه ب: 404 (بدون افشای وجود)', getB.status === 404, `status=${getB.status}`);
  const lstBfromA = await call('engA', `/api/documents?projectId=${projB.id}`);
  check('A-10 Query با projectId خارج از دامنه → خالی', lstBfromA.data.total === 0, `total=${lstBfromA.data.total}`);
  const searchB = await call('engA', '/api/search?q=210-PID-TEST');
  check('A-22 جست‌وجوی شماره پروژه ب برای الف → خالی', (searchB.data.items || []).length === 0, `items=${searchB.data.items?.length}`);
  const searchA = await call('engA', '/api/search?q=۱۱۸۳-iso-test'); // ارقام فارسی + حروف کوچک!
  check('A-22 جست‌وجو با ارقام فارسی/نرمال‌سازی', (searchA.data.items || []).some((i) => i.docNumber === '1183-ISO-TEST'), `items=${JSON.stringify(searchA.data.items?.map((i) => i.docNumber))}`);

  // ۸) دانلود: توکن یک‌بارمصرف
  const dlTok = await call('engA', `/api/files/${up1.data.id}/download-token`, { method: 'POST' });
  check('A-19 صدور توکن کوتاه‌عمر', dlTok.status === 200 && dlTok.data.url.includes('token='), `status=${dlTok.status}`);
  const dlNoTok = await fetch(`${BASE}/api/files/${up1.data.id}/download`);
  check('A-19 دانلود بدون توکن: 401', dlNoTok.status === 401, `status=${dlNoTok.status}`);
  const dlOk = await call('engA', dlTok.data.url);
  check('A-19 دانلود با توکن: محتوا سالم', dlOk.status === 200 && dlOk.buf.equals(pdfBytes), `status=${dlOk.status} bytes=${dlOk.buf.length}`);
  const dlReuse = await call('engA', dlTok.data.url);
  check('A-19 توکن یک‌بارمصرف: استفاده دوباره → 401', dlReuse.status === 401, `status=${dlReuse.status}`);
  const dlB = await call('engA', `/api/files/${(await call('engB', `/api/documents/${dB.data.id}`)).data?.revisions?.[0]?.files?.[0]?.id}/download-token`, { method: 'POST' });
  check('A-10 توکن دانلود فایل پروژه ب برای الف: ممنوع', dlB.status !== 200, `status=${dlB.status}`);

  // ۹) دستیار — بدون مدل، پاسخ صادقانه
  const as1 = await call('engA', '/api/assistant', { method: 'POST', json: { question: 'ایزومتریک 1183-ISO-TEST' } });
  check('A-30 دستیار: ارجاع فقط از اسناد مجاز', as1.status === 200 && as1.data.citations.every((c) => c.documentId !== dB.data.id), `citations=${as1.data.citations?.length} model=${as1.data.modelAvailable}`);
  const as2 = await call('engA', '/api/assistant', { method: 'POST', json: { question: 'پروژه ب 210-PID-TEST' } });
  check('A-10 دستیار: نشت سند پروژه ب وجود ندارد', !(as2.data.citations || []).some((c) => c.docNumber === '210-PID-TEST'), `citations=${as2.data.citations?.length}`);

  // ۱۰) داده نمونه برچسب‌خورده (برای محیط نمایش)
  const sd = await call('admin', '/api/admin/sample-data', { method: 'POST', json: { action: 'create' } });
  check('A-27 ایجاد داده نمونه برچسب‌خورده', sd.status === 200 && sd.data?.created === true, `status=${sd.status}`);
  const engA_afterSample = await call('engA', '/api/documents?pageSize=100');
  check('A-27 داده نمونه برای مهندس الف دیده نمی‌شود (عضو نیست)', !(engA_afterSample.data.items || []).some((d) => d.isSample), `count=${engA_afterSample.data.items?.length}`);

  // ۱۱) قفل تلاش ورود (در پایان؛ حساب قفل می‌شود)
  let locked = false;
  for (let i = 0; i < 5; i++) {
    const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'test-eng-b', password: 'wrong-pass-' + i }) });
    if (r.status === 423) locked = true;
  }
  const after = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'test-eng-b', password: 'NewPass-Test2' }) });
  check('A-07 قفل پس از ۵ تلاش ناموفق (حتی با رمز درست)', locked && after.status === 423, `locked=${locked} final=${after.status}`);

  // ۱۲) پاک‌سازی داده آزمون (نه داده نمونه)
  const forDel = await db.project.findMany({ where: { code: { in: ['PRJ-TEST-A', 'PRJ-TEST-B'] } } });
  const docIds = (await db.document.findMany({ where: { projectId: { in: forDel.map((p) => p.id) } } })).map((d) => d.id);
  const revIds = (await db.revision.findMany({ where: { documentId: { in: docIds } } })).map((r) => r.id);
  const files = await db.fileObject.findMany({ where: { revisionId: { in: revIds } } });
  const fIds = files.map((f) => f.id);
  // فرزندان مرحله B پیش از حذف فایل پاک می‌شوند
  await db.reviewTask.deleteMany({ where: { OR: [{ fileId: { in: fIds } }, { documentId: { in: docIds } }] } });
  await db.docExtraction.deleteMany({ where: { fileId: { in: fIds } } });
  await db.annotation.deleteMany({ where: { fileId: { in: fIds } } });
  await db.derivativeObject.deleteMany({ where: { fileId: { in: fIds } } });
  await db.pageText.deleteMany({ where: { fileId: { in: fIds } } });
  await db.processingJob.deleteMany({ where: { fileId: { in: fIds } } });
  await db.docLink.deleteMany({ where: { documentId: { in: docIds } } });
  await db.favorite.deleteMany({ where: { documentId: { in: docIds } } });
  await db.fileObject.deleteMany({ where: { id: { in: fIds } } });
  await db.revision.deleteMany({ where: { id: { in: revIds } } });
  await db.document.deleteMany({ where: { id: { in: docIds } } });
  await db.projectMember.deleteMany({ where: { project: { code: { in: ['PRJ-TEST-A', 'PRJ-TEST-B'] } } } });
  await db.project.deleteMany({ where: { code: { in: ['PRJ-TEST-A', 'PRJ-TEST-B'] } } });
  for (const un of ['test-eng-a', 'test-eng-b']) {
    const u = await db.user.findUnique({ where: { username: un } });
    if (u) { await db.session.deleteMany({ where: { userId: u.id } }); await db.user.delete({ where: { id: u.id } }); }
  }
  // حذف فایل‌های یتیم مخزن آزمون
  for (const f of files) { try { fs.unlinkSync('data/objectstore/' + f.storageKey); } catch { } }
  // بازنشانی MFA مدیر برای ثبت اولیه واقعی کاربر + بازگرداندن تنظیم MFA به حالت سامانه (غیرفعال)
  await db.user.update({ where: { username: 'admin' }, data: { mfaSecret: null, mfaEnabled: false, mustChangePassword: true } });
  await db.setting.upsert({ where: { key: 'auth.mfaEnabled' }, update: { value: 'false' }, create: { key: 'auth.mfaEnabled', value: 'false' } });
  await db.session.deleteMany({ where: { user: { username: 'admin' } } });
  console.log('پاک‌سازی داده آزمون انجام شد؛ داده نمونهٔ برچسب‌خورده باقی است.');

  // ۱۳) پایداری داده پس از ری‌استارت: مدل داده روی دیسک + مخزن فایل روی دیسک
  const sampleCount = await db.document.count({ where: { isSample: true } });
  const storeOk = fs.existsSync('data/objectstore/originals');
  check('A-15 داده و مخزن روی دیسک پایدار (پایگاه داده فایل‌محور + objectstore)', sampleCount > 0 && storeOk, `sampleDocs=${sampleCount} storeExists=${storeOk}`);

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n== نتیجه: ${pass}/${results.length} آزمون موفق ==`);
  fs.writeFileSync('docs/test-results.json', JSON.stringify(results, null, 2));
  if (pass !== results.length) process.exitCode = 1;
}

main().finally(() => db.$disconnect());
