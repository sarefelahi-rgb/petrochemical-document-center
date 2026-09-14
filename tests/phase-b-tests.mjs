// آزمون‌های پذیرش مرحله B — خواندن و یافتن
// اجرا: bun tests/phase-b-tests.mjs  (سرور dev روی 3000 و پایگاه داده در دسترس باشد)
// پوشش: صف پردازش و Worker، استخراج لایهٔ متن، OCR فارسی/انگلیسی، استخراج شناسنامه با اطمینان،
// جست‌وجوی درون‌مدرک با مختصات، مشتق‌ها، صف بازبینی، ایمنی پردازش مجدد، Dead-letter و Retry،
// لینک صفحه، حاشیه‌نویسی، مدیریت فایل پردازش‌نشده، انزوا و مجوزها
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import { spawn } from 'child_process';

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

const jars = new Map();
async function call(as, path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
  if (jars.has(as)) headers['Cookie'] = jars.get(as);
  const resp = await fetch(BASE + path, { ...opts, headers });
  const setCookie = resp.headers.get('set-cookie');
  if (setCookie) jars.set(as, setCookie.split(';')[0]);
  const text = await resp.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 80) }; }
  return { status: resp.status, data };
}

function normCode(s) {
  const P = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
  let out = '';
  for (const ch of s) { const p = P.indexOf(ch); if (p >= 0) { out += String(p); continue; } const a = AR.indexOf(ch); if (a >= 0) { out += String(a); continue; } out += ch; }
  return out.replace(/\s+/g, '').toUpperCase();
}

// PDF متنی با pdf-lib (فارسی + انگلیسی) — همسان با sampleData
async function makeTextPdf(lines) {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fs.readFileSync('assets/fonts/Vazirmatn-Regular.ttf'), { subset: true });
  const page = pdf.addPage([842, 595]);
  let y = 520;
  for (const l of lines) {
    page.drawText(l, { x: 60, y, size: 12, font, color: rgb(0.1, 0.1, 0.12) });
    y -= 26;
  }
  return Buffer.from(await pdf.save());
}

// PDF اسکن‌نما: متن → SVG → JPEG (sharp) → تصویر داخل PDF — لایهٔ متن ندارد
async function makeScannedPdf(lines) {
  const sharp = (await import('sharp')).default;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="874"><rect width="100%" height="100%" fill="white"/>${lines.map((l, i) => `<text x="90" y="${90 + i * 44}" font-family="DejaVu Sans, Vazirmatn, sans-serif" font-size="24" fill="#111">${esc(l)}</text>`).join('')}</svg>`;
  const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const img = await pdf.embedJpg(jpeg);
  const page = pdf.addPage([842, 595]);
  page.drawImage(img, { x: 0, y: 0, width: 842, height: 595 });
  return Buffer.from(await pdf.save());
}

async function uploadPdf(as, documentId, buf, name) {
  const fd = new FormData();
  fd.append('file', new Blob([buf]), name || 'test.pdf');
  fd.append('documentId', documentId);
  fd.append('opId', crypto.randomUUID());
  const resp = await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: jars.get(as) }, body: fd });
  const data = await resp.json().catch(() => null);
  return { status: resp.status, data };
}

async function waitFor(desc, fn, timeoutMs = 90000, intervalMs = 1500) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { if (await fn()) return true; } catch { }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  console.log(`TIMEOUT | ${desc}`);
  return false;
}

async function waitJobsDone(fileId, timeoutMs = 120000) {
  return waitFor(`jobs done for ${fileId}`, async () => {
    const jobs = await db.processingJob.findMany({ where: { fileId } });
    if (jobs.length === 0) return false;
    // همهٔ کارهای زنجیره یا DONE/DEAD/CANCELLED باشند و هیچ QUEUED/RUNNING نمانده باشد
    return jobs.every((j) => ['DONE', 'DEAD', 'CANCELLED'].includes(j.status));
  }, timeoutMs);
}

async function main() {
  console.log('== آزمون‌های مرحله B ==');

  // --- پاک‌سازی بقایای اجرای قبلی ---
  const oldUsers = await db.user.findMany({ where: { username: { in: ['test-eng-b2', 'test-eng-b3', 'test-aud-b2', 'test-ctr-b2'] } }, select: { id: true } });
  for (const u of oldUsers) {
    await db.session.deleteMany({ where: { userId: u.id } });
    await db.mfaChallenge.deleteMany({ where: { userId: u.id } });
    await db.cartableTask.deleteMany({ where: { assigneeId: u.id } });
    await db.projectMember.deleteMany({ where: { userId: u.id } });
    await db.favorite.deleteMany({ where: { userId: u.id } });
    await db.annotation.deleteMany({ where: { authorId: u.id } });
    await db.reviewTask.updateMany({ where: { assignedToId: u.id }, data: { assignedToId: null } });
    await db.reviewTask.updateMany({ where: { resolvedById: u.id }, data: { resolvedById: null } });
    await db.docExtraction.updateMany({ where: { reviewedById: u.id }, data: { reviewedById: null } });
    await db.fileObject.updateMany({ where: { uploadedById: u.id }, data: { uploadedById: null } });
    await db.auditEvent.deleteMany({ where: { actorId: u.id } });
    await db.user.delete({ where: { id: u.id } });
  }
  const oldProj = await db.project.findFirst({ where: { code: 'PRJ-TEST-B2' } });
  if (oldProj) {
    const docs = await db.document.findMany({ where: { projectId: oldProj.id }, select: { id: true } });
    const revs = await db.revision.findMany({ where: { documentId: { in: docs.map((d) => d.id) } }, select: { id: true } });
    const files = await db.fileObject.findMany({ where: { revisionId: { in: revs.map((r) => r.id) } }, select: { id: true, storageKey: true } });
    await db.docExtraction.deleteMany({ where: { fileId: { in: files.map((f) => f.id) } } });
    await db.processingJob.deleteMany({ where: { fileId: { in: files.map((f) => f.id) } } });
    await db.pageText.deleteMany({ where: { fileId: { in: files.map((f) => f.id) } } });
    await db.derivativeObject.deleteMany({ where: { fileId: { in: files.map((f) => f.id) } } });
    await db.annotation.deleteMany({ where: { fileId: { in: files.map((f) => f.id) } } });
    await db.reviewTask.deleteMany({ where: { documentId: { in: docs.map((d) => d.id) } } });
    await db.fileObject.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
    await db.revision.deleteMany({ where: { id: { in: revs.map((r) => r.id) } } });
    await db.docLink.deleteMany({ where: { documentId: { in: docs.map((d) => d.id) } } });
    await db.document.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
    await db.projectMember.deleteMany({ where: { projectId: oldProj.id } });
    await db.project.delete({ where: { id: oldProj.id } });
    for (const f of files) { try { fs.unlinkSync('data/objectstore/' + f.storageKey); } catch { } }
  }

  // راه‌اندازی Worker آزمون (اگر Worker دائمی فعال باشد، همان صف مشترک را پردازش می‌کند)
  const workerProc = spawn('bun', ['worker/worker.ts'], { stdio: 'ignore', detached: false });
  process.on('exit', () => { try { workerProc.kill('SIGTERM'); } catch { } });

  // --- ورود مدیر ---
  // MFA برای این مجموعه آزمون صریحاً فعال می‌شود (حالت عادی سامانه: غیرفعال طبق تصمیم بهره‌بردار)
  const credTxt = fs.readFileSync('data/initial-admin-credentials.txt', 'utf8');
  const adminPw = credTxt.match(/(?:رمز اولیه|رمز عبور فعلی): (\S+)/)?.[1];
  const TEST_SECRET = 'JBSWY3DPEHPK3PXP';
  await db.setting.upsert({ where: { key: 'auth.mfaEnabled' }, update: { value: 'true' }, create: { key: 'auth.mfaEnabled', value: 'true' } });
  await db.user.update({ where: { username: 'admin' }, data: { mfaSecret: TEST_SECRET, mfaEnabled: true } });
  const l1 = await call('admin', '/api/auth/login', { method: 'POST', json: { username: 'admin', password: adminPw } });
  const l2 = await call('admin', '/api/auth/mfa-verify', { method: 'POST', json: { mfaToken: l1.data.mfaToken, code: totp(TEST_SECRET) } });
  check('B-00 ورود مدیر با MFA', l2.status === 200, `status=${l2.status}`);

  // --- ساختار آزمون: پروژه و کاربران ---
  const mkP = await call('admin', '/api/admin/projects', { method: 'POST', json: { kind: 'project', code: 'PRJ-TEST-B2', name: 'پروژه آزمون B' } });
  const projects = (await call('admin', '/api/admin/projects')).data.projects;
  const proj = projects.find((p) => p.code === 'PRJ-TEST-B2');
  check('B-00 ایجاد پروژه آزمون', mkP.status === 201 || proj, `code=PRJ-TEST-B2`);

  // کاربران با رمز موقت یک‌بارمصرف + تغییر اجباری رمز در اولین ورود
  async function mkUser(username, fullName, role, clearance, projectIds) {
    const created = await call('admin', '/api/admin/users', { method: 'POST', json: { username, fullName, role, clearance, projectIds } });
    if (created.status !== 201) return { ok: false, status: created.status, temp: null };
    const temp = created.data?.tempPassword || created.data?.password;
    return { ok: true, temp, status: created.status };
  }
  const engC = await mkUser('test-eng-b2', 'مهندس آزمون B', 'ENGINEER', 'CONFIDENTIAL', [proj.id]);
  const eng2C = await mkUser('test-eng-b3', 'مهندس پروژه دیگر', 'ENGINEER', 'CONFIDENTIAL', []);
  const audC = await mkUser('test-aud-b2', 'ممیز آزمون B', 'AUDITOR', 'RESTRICTED', [proj.id]);
  const ctrC = await mkUser('test-ctr-b2', 'پیمانکار آزمون B', 'CONTRACTOR', 'INTERNAL', [proj.id]);
  check('B-00 ایجاد کاربران آزمون با رمز موقت', engC.ok && eng2C.ok && audC.ok && ctrC.ok, `eng=${engC.status} aud=${audC.status} ctr=${ctrC.status}`);

  // ورود + تغییر اجباری رمز + ورود مجدد (همان جریان فاز A)
  const NEW_PW = 'B2-Pass-2026x';
  async function loginFlow(as, username, tempPw) {
    const l = await call(as, '/api/auth/login', { method: 'POST', json: { username, password: tempPw } });
    if (l.status !== 200) return l.status;
    await call(as, '/api/auth/change-password', { method: 'POST', json: { currentPassword: tempPw, newPassword: NEW_PW } });
    const l2 = await call(as, '/api/auth/login', { method: 'POST', json: { username, password: NEW_PW } });
    return l2.status;
  }
  const engLogin = await loginFlow('eng', 'test-eng-b2', engC.temp);
  await loginFlow('aud', 'test-aud-b2', audC.temp);
  await loginFlow('ctr', 'test-ctr-b2', ctrC.temp);
  await loginFlow('eng2', 'test-eng-b3', eng2C.temp);
  const engMe = await call('eng', '/api/auth/me');
  check('B-00 ورود مهندس', engLogin === 200 && engMe.status === 200, `login=${engLogin} me=${engMe.status}`);

  // --- سند ۱: PDF متنی با محتوای مهندسی ---
  const doc1 = await call('admin', '/api/documents', {
    method: 'POST', json: {
      projectId: proj.id, docNumber: '7741-ISO-0042', title: 'ایزومتریک آزمون خط 4-P-7741-C1A — مرحله B',
      discipline: 'PIPING', docType: 'ISOMETRIC', confidentiality: 'INTERNAL',
    },
  });
  check('B-01 ایجاد سند متنی', doc1.status === 201, `status=${doc1.status}`);
  const up1 = await uploadPdf('admin', doc1.data.id, await makeTextPdf([
    'نمونهٔ آزمون مرحله B — داده آزمایشی',
    'ISOMETRIC DRAWING TEST',
    'DOC NO: 7741-ISO-0042  REV: 4  SHEET 2 OF 3  SCALE: 1:50',
    'LINE: 4-P-7741-C1A  SIZE: 4"  CLASS: CS150',
    'EQUIPMENT: P-2201A, EA-4402B',
    'UNIT 240 - TEST DATA',
  ]));
  check('B-02 آپلود → صف پردازش ایجاد شد', up1.status === 201 && up1.data.processing?.queued?.length >= 2, `queued=${up1.data?.processing?.queued?.map((j) => j.type).join(',')}`);
  const file1 = up1.data.id;

  const done1 = await waitJobsDone(file1);
  const jobs1 = await db.processingJob.findMany({ where: { fileId: file1 }, select: { type: true, status: true, stage: true, attempts: true, correlationId: true } });
  check('B-03 Worker زنجیره را کامل پردازش کرد (TEXT_EXTRACT→TITLE_BLOCK)', done1 && jobs1.every((j) => j.status === 'DONE'), jobs1.map((j) => `${j.type}:${j.status}`).join(','));
  const corrCount = new Set(jobs1.map((j) => j.correlationId)).size;
  check('B-04 شناسه هم‌بستگی زنجیره یکسان', corrCount === 1, `correlations=${corrCount}`);

  const docState1 = await call('admin', `/api/documents/${doc1.data.id}`);
  check('B-05 وضعیت پردازش سند: PROCESSED', docState1.data.processingStatus === 'PROCESSED', `processingStatus=${docState1.data.processingStatus}`);
  check('B-06 وضعیت استخراج: EXTRACTED_UNREVIEWED (استخراج‌شده، تأییدنشده)', docState1.data.extractionStatus === 'EXTRACTED_UNREVIEWED', `extractionStatus=${docState1.data.extractionStatus}`);

  // --- صفحات و منبع متن ---
  const pages1 = await call('admin', `/api/files/${file1}/pages`);
  check('B-07 API صفحات: شمارش و منبع لایهٔ متن', pages1.status === 200 && pages1.data.pageCount === 1 && pages1.data.pages[0]?.source === 'TEXT_LAYER', `pageCount=${pages1.data?.pageCount} source=${pages1.data?.pages?.[0]?.source}`);
  check('B-08 مشتق تصویر صفحه و بندانگشتی ثبت شده', pages1.data.derivatives.pageImages.includes(1) && pages1.data.derivatives.hasThumb, `pageImages=${JSON.stringify(pages1.data?.derivatives?.pageImages)}`);

  // --- استخراج شناسنامه ---
  const ext1 = await call('admin', `/api/documents/${doc1.data.id}/extractions`);
  const byField = Object.fromEntries((ext1.data?.items || []).map((r) => [r.field, r]));
  const dn = byField.DOC_NUMBER, ln = byField.LINE, rv = byField.REV, sh = byField.SHEET, tag = byField.TAG;
  check('B-09 استخراج شماره سند با تطابق ثبت (اطمینان بالا)', dn && normCode(dn.valueRaw) === normCode('7741-ISO-0042') && dn.confidence >= 0.85, `DOC_NUMBER=${dn?.valueRaw} conf=${dn?.confidence?.toFixed(2)}`);
  check('B-10 استخراج شماره خط', ln && normCode(ln.valueRaw) === normCode('4-P-7741-C1A'), `LINE=${ln?.valueRaw}`);
  check('B-11 استخراج REV/شیت', rv?.valueRaw === '4' && sh?.valueRaw === '2', `REV=${rv?.valueRaw} SHEET=${sh?.valueRaw}`);
  check('B-12 استخراج Tag تجهیز', tag && ['P-2201A', 'EA-4402B'].includes(tag.valueRaw), `TAG=${tag?.valueRaw}`);
  check('B-13 مختصات bbox نرمال برای هایلایت', dn?.bbox && dn.bbox.every((v) => v >= 0 && v <= 1), `bbox=${JSON.stringify(dn?.bbox?.map((v) => Number(v.toFixed(2))))}`);
  check('B-14 وضعیت فیلدها: UNREVIEWED تا تأیید کارشناس', rv?.status === 'UNREVIEWED' && !rv.isSuggestion, `status=${rv?.status}`);

  // --- جست‌وجو درون‌مدرک با مختصات ---
  const cs1 = await call('admin', `/api/documents/${doc1.data.id}/content-search?q=ISOMETRIC`);
  check('B-15 جست‌وجوی درون‌مدرک: نتیجه با صفحه و rects', cs1.status === 200 && cs1.data.total >= 1 && cs1.data.matches[0]?.rects?.length >= 1, `total=${cs1.data?.total} page=${cs1.data?.matches?.[0]?.page}`);
  const cs2 = await call('admin', `/api/documents/${doc1.data.id}/content-search?q=آزمون`);
  check('B-16 جست‌وجوی فارسی نرمال‌شده در متن صفحه', cs2.data?.total >= 1, `total=${cs2.data?.total}`);
  const cs3 = await call('admin', `/api/search?scope=content&q=7741-ISO-0042`);
  check('B-17 جست‌وجوی سراسری scope=content با لینک صفحه', cs3.data?.items?.some((i) => i.id === doc1.data.id && i.page >= 1), `items=${cs3.data?.items?.length}`);

  // --- مشتق‌ها: تصویر صفحه ---
  const dt = await call('admin', `/api/files/${file1}/download-token`, { method: 'POST' });
  const pageImgResp = await fetch(`${BASE}/api/files/${file1}/derivatives?kind=PAGE_IMAGE&page=1`, { headers: { Cookie: jars.get('admin') } });
  const pageImgBuf = Buffer.from(await pageImgResp.arrayBuffer());
  check('B-18 سرو تصویر صفحه (PNG) با کنترل دسترسی', pageImgResp.status === 200 && pageImgBuf.subarray(1, 4).toString('ascii') === 'PNG', `status=${pageImgResp.status} bytes=${pageImgBuf.length}`);
  const thumbResp = await fetch(`${BASE}/api/files/${file1}/derivatives?kind=THUMB`, { headers: { Cookie: jars.get('admin') } });
  check('B-19 سرو بندانگشتی', thumbResp.status === 200, `status=${thumbResp.status}`);

  // --- تأیید کارشناس روی فیلد ---
  const patch1 = await call('admin', `/api/extractions/${dn.id}`, { method: 'PATCH', json: { action: 'confirm' } });
  check('B-20 تأیید مقدار استخراجی', patch1.status === 200 && patch1.data.status === 'CONFIRMED', `status=${patch1.data?.status}`);

  // --- سند ۲: اسکن (بدون لایه متن) → OCR فارسی/انگلیسی ---
  const doc2 = await call('admin', '/api/documents', {
    method: 'POST', json: {
      projectId: proj.id, docNumber: '7742-PID-0007', title: 'P&ID اسکن‌شده آزمون OCR — مرحله B',
      discipline: 'PROCESS', docType: 'PID', confidentiality: 'INTERNAL',
    },
  });
  const up2 = await uploadPdf('admin', doc2.data.id, await makeScannedPdf([
    'ISOMETRIC OCR TEST SCAN',
    'DOC NO: 7742-PID-0007  REV: 1',
    'LINE: 4-P-7742-B2A  SCALE: NTS',
  ]));
  check('B-21 آپلود اسکن → صف OCR', up2.status === 201 && up2.data.processing?.processable, `status=${up2.status}`);
  const file2 = up2.data.id;
  const done2 = await waitJobsDone(file2, 180000);
  const jobs2 = await db.processingJob.findMany({ where: { fileId: file2 }, select: { type: true, status: true } });
  const ocrJob = jobs2.find((j) => j.type === 'OCR');
  check('B-22 OCR کامل شد', done2 && ocrJob?.status === 'DONE', jobs2.map((j) => `${j.type}:${j.status}`).join(','));

  const pages2 = await call('admin', `/api/files/${file2}/pages`);
  check('B-23 متن صفحه از منبع OCR با اطمینان', pages2.data.pages[0]?.source === 'OCR' && pages2.data.pages[0]?.ocrConfidence > 0, `source=${pages2.data?.pages?.[0]?.source} conf=${pages2.data?.pages?.[0]?.ocrConfidence?.toFixed?.(2)}`);
  const ocrCS = await call('admin', `/api/documents/${doc2.data.id}/content-search?q=SCAN`);
  check('B-24 جست‌وجو در متن OCR یافت شد', ocrCS.data?.total >= 1, `total=${ocrCS.data?.total}`);

  // --- اسکن بی‌متن → صف بازبینی (کیفیت پایین) ---
  const doc3 = await call('admin', '/api/documents', {
    method: 'POST', json: { projectId: proj.id, docNumber: '7743-DS-0001', title: 'اسکن بی‌متن آزمون صف بازبینی', discipline: 'MECH', docType: 'DATASHEET', confidentiality: 'INTERNAL' },
  });
  const sharp = (await import('sharp')).default;
  const blankJpeg = await sharp({ create: { width: 600, height: 400, channels: 3, background: 'white' } }).jpeg().toBuffer();
  const { PDFDocument: PD3 } = await import('pdf-lib');
  const blankPdf = await PD3.create();
  const bimg = await blankPdf.embedJpg(blankJpeg);
  const bpage = blankPdf.addPage([842, 595]);
  bpage.drawImage(bimg, { x: 0, y: 0, width: 842, height: 595 });
  const up3 = await uploadPdf('admin', doc3.data.id, Buffer.from(await blankPdf.save()));
  const file3 = up3.data.id;
  await waitJobsDone(file3, 180000);
  const rt3 = await call('admin', '/api/review-tasks?status=OPEN');
  const task3 = (rt3.data?.items || []).find((t) => t.fileId === file3 && t.reason === 'LOW_QUALITY');
  check('B-25 اسکن بی‌متن → کار بازبینی LOW_QUALITY', !!task3, `reason=${task3?.reason} detail=${task3?.detail?.slice(0, 60)}`);

  // --- گردش کار بازبینی ---
  const assign = await call('admin', `/api/review-tasks/${task3.id}`, { method: 'PATCH', json: { action: 'assign' } });
  check('B-26 برداشت کار بازبینی', assign.status === 200 && assign.data.status === 'IN_PROGRESS', `status=${assign.data?.status}`);
  const resolve = await call('admin', `/api/review-tasks/${task3.id}`, { method: 'PATCH', json: { action: 'resolve', note: 'بررسی شد — اسکن بی‌محتواست' } });
  check('B-27 حل کار بازبینی با یادداشت', resolve.status === 200 && resolve.data.status === 'RESOLVED', `status=${resolve.data?.status}`);

  // --- پردازش مجدد: مقدار انسانی بازنویسی نمی‌شود؛ جدید «پیشنهاد» است ---
  const ext1b = await call('admin', `/api/documents/${doc1.data.id}/extractions`);
  const revRow = ext1b.data.items.find((r) => r.field === 'REV');
  const editRev = await call('admin', `/api/extractions/${revRow.id}`, { method: 'PATCH', json: { action: 'edit', value: '9' } });
  check('B-28 اصلاح انسانی مقدار REV به ۹', editRev.status === 200 && editRev.data.status === 'EDITED', `status=${editRev.data?.status}`);
  const rp = await call('admin', `/api/files/${file1}/reprocess`, { method: 'POST' });
  check('B-29 درخواست بازپردازش', rp.status === 200 && rp.data.processable, `status=${rp.status}`);
  const rpDone = await waitJobsDone(file1, 120000);
  const ext1c = await call('admin', `/api/documents/${doc1.data.id}/extractions`);
  const revAfter = ext1c.data.items.find((r) => r.field === 'REV' && !r.isSuggestion && (r.status === 'EDITED' || r.status === 'CONFIRMED'));
  const revSuggestion = ext1c.data.items.find((r) => r.field === 'REV' && r.isSuggestion && r.status === 'UNREVIEWED');
  check('B-30 مقدار اصلاح‌شدهٔ انسانی پس از بازپردازش دست‌نخورده ماند', rpDone && revAfter?.valueRaw === '9', `REV=${revAfter?.valueRaw}`);
  check('B-31 نتیجهٔ جدید به‌عنوان پیشنهاد ثبت شد (نه جایگزین)', !!revSuggestion && revSuggestion.valueRaw !== '9', `suggestion=${revSuggestion?.valueRaw}`);

  // --- تأیید همهٔ فیلدهای غیر پیشنهادی → VERIFIED ---
  const ext1d = await call('admin', `/api/documents/${doc1.data.id}/extractions`);
  for (const row of ext1d.data.items.filter((r) => !r.isSuggestion && r.status === 'UNREVIEWED')) {
    await call('admin', `/api/extractions/${row.id}`, { method: 'PATCH', json: { action: row.valueRaw === revAfter.valueRaw && row.field === 'REV' ? 'confirm' : 'confirm' } });
  }
  const docState1b = await call('admin', `/api/documents/${doc1.data.id}`);
  check('B-32 پس از تأیید همه: وضعیت استخراج VERIFIED', docState1b.data.extractionStatus === 'VERIFIED', `extractionStatus=${docState1b.data.extractionStatus}`);

  // --- Dead-letter و Retry ---
  const doc4 = await call('admin', '/api/documents', {
    method: 'POST', json: { projectId: proj.id, docNumber: '7744-ISO-0009', title: 'آزمون Dead-letter', discipline: 'PIPING', docType: 'ISOMETRIC', confidentiality: 'INTERNAL' },
  });
  const goodBuf = await makeTextPdf(['DEAD LETTER TEST', 'LINE: 4-P-7744-A1A']);
  const up4 = await uploadPdf('admin', doc4.data.id, goodBuf);
  const file4 = up4.data.id;
  // خراب‌کردن اصل در مخزن — شبیه‌سازی خطای پردازش
  const f4 = await db.fileObject.findUnique({ where: { id: file4 } });
  const abs4 = `data/objectstore/${f4.storageKey}`;
  const originalBytes = fs.readFileSync(abs4);
  fs.writeFileSync(abs4, Buffer.from('CORRUPTED-NOT-A-PDF'));
  const dlDone = await waitFor('dead-letter', async () => {
    const jobs = await db.processingJob.findMany({ where: { fileId: file4, type: 'TEXT_EXTRACT' } });
    return jobs.some((j) => j.status === 'DEAD');
  }, 180000, 2000);
  const deadJob = await db.processingJob.findFirst({ where: { fileId: file4, type: 'TEXT_EXTRACT', status: 'DEAD' } });
  check('B-33 شکست تکرارشونده → Dead-letter با ثبت خطا', dlDone && deadJob?.attempts === 3 && !!deadJob.error, `attempts=${deadJob?.attempts} err=${deadJob?.error?.slice(0, 50)}`);
  const doc4State = await call('admin', `/api/documents/${doc4.data.id}`);
  check('B-34 وضعیت سند پس از Dead-letter: FAILED (صادقانه)', doc4State.data.processingStatus === 'FAILED', `processingStatus=${doc4State.data.processingStatus}`);
  const rt4 = await call('admin', '/api/review-tasks?status=OPEN');
  check('B-35 شکست پردازش → کار بازبینی خودکار', (rt4.data?.items || []).some((t) => t.fileId === file4), `items=${rt4.data?.items?.length}`);

  // بازیابی فایل → Retry از مانیتور
  fs.writeFileSync(abs4, originalBytes);
  const retry = await call('admin', `/api/jobs/${deadJob.id}`, { method: 'POST' });
  check('B-36 بازپردازش کار Dead-letter از مانیتور', retry.status === 200, `status=${retry.status}`);
  const retryDone = await waitFor('retry done', async () => {
    const jobs = await db.processingJob.findMany({ where: { fileId: file4, type: 'TEXT_EXTRACT' } });
    return jobs.every((j) => ['DONE', 'DEAD', 'CANCELLED'].includes(j.status)) && jobs.some((j) => j.status === 'DONE');
  }, 120000, 2000);
  const doc4b = await call('admin', `/api/documents/${doc4.data.id}`);
  check('B-37 پس از Retry و بازیابی فایل: پردازش موفق', retryDone && doc4b.data.processingStatus === 'PROCESSED', `processingStatus=${doc4b.data?.processingStatus}`);

  // --- حاشیه‌نویسی ---
  const ann1 = await call('admin', `/api/files/${file1}/annotations`, { method: 'POST', json: { page: 1, type: 'HIGHLIGHT', rect: [0.1, 0.1, 0.3, 0.05], text: 'بازبینی این محدوده' } });
  check('B-38 ایجاد هایلایت روی صفحه', ann1.status === 201, `status=${ann1.status}`);
  const annList = await call('eng', `/api/files/${file1}/annotations`);
  check('B-39 فهرست حاشیه‌نویسی برای کاربر مجاز', annList.status === 200 && annList.data.items.length >= 1, `items=${annList.data?.items?.length}`);
  const annResolve = await call('admin', `/api/annotations/${ann1.data.id}`, { method: 'PATCH', json: { resolved: true } });
  check('B-40 حل حاشیه‌نویسی توسط نویسنده', annResolve.status === 200 && annResolve.data.resolved === true, `status=${annResolve.status}`);
  const annDel = await call('eng', `/api/annotations/${ann1.data.id}`, { method: 'DELETE' });
  check('B-41 حذف حاشیه‌نویسی توسط غیرنویسنده/غیرمدیر: ممنوع', annDel.status === 403, `status=${annDel.status}`);

  // --- مجوزها و انزوا ---
  const eng2Pages = await call('eng2', `/api/files/${file1}/pages`);
  const eng2CS = await call('eng2', `/api/documents/${doc1.data.id}/content-search?q=ISOMETRIC`);
  const eng2Ext = await call('eng2', `/api/documents/${doc1.data.id}/extractions`);
  const eng2Img = await fetch(`${BASE}/api/files/${file1}/derivatives?kind=PAGE_IMAGE&page=1`, { headers: { Cookie: jars.get('eng2') } });
  check('B-42 انزوا: کاربر خارج از پروژه به صفحات/متن/استخراج/تصویر دسترسی ندارد', eng2Pages.status === 404 && eng2CS.status === 404 && eng2Ext.status === 404 && eng2Img.status === 404, `pages=${eng2Pages.status} cs=${eng2CS.status} ext=${eng2Ext.status} img=${eng2Img.status}`);
  const audCS = await call('aud', `/api/documents/${doc1.data.id}/content-search?q=ISOMETRIC`);
  check('B-43 ممیز (بدون doc:content) → 403', audCS.status === 403, `status=${audCS.status}`);
  const ctrExt = await call('ctr', `/api/documents/${doc1.data.id}/extractions`);
  check('B-44 پیمانکار عضو: مشاهده استخراج ممکن', ctrExt.status === 200, `status=${ctrExt.status}`);
  const ctrConfirm = await call('ctr', `/api/extractions/${revRow.id}`, { method: 'PATCH', json: { action: 'confirm' } });
  check('B-45 پیمانکار: تأیید مقدار استخراجی ممنوع (doc:review ندارد)', ctrConfirm.status === 403, `status=${ctrConfirm.status}`);
  const engJobs = await call('eng', '/api/jobs');
  check('B-46 مانیتور پردازش فقط برای مدیر پردازش', engJobs.status === 403, `status=${engJobs.status}`);

  // --- فایل پردازش‌نشده به‌عنوان فایل قابل مدیریت ---
  const doc5 = await call('admin', '/api/documents', {
    method: 'POST', json: { projectId: proj.id, docNumber: '7745-VND-001', title: 'دیتاشیت فروشنده (Word) — بدون پردازش متنی', discipline: 'MECH', docType: 'DATASHEET', confidentiality: 'INTERNAL' },
  });
  const zipBuf = Buffer.concat([Buffer.from('PK\x03\x04'), crypto.randomBytes(64)]);
  const fd5 = new FormData();
  fd5.append('file', new Blob([zipBuf]), 'vendor-datasheet.docx');
  fd5.append('documentId', doc5.data.id);
  fd5.append('opId', crypto.randomUUID());
  const up5resp = await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: jars.get('admin') }, body: fd5 });
  const up5 = { status: up5resp.status, data: await up5resp.json().catch(() => null) };
  check('B-47 DOCX: بدون صف پردازش (قابل مدیریت به‌عنوان فایل)', up5.status === 201 && up5.data?.processing?.processable === false && up5.data?.processing?.queued?.length === 0, `processable=${up5.data?.processing?.processable} queued=${up5.data?.processing?.queued?.length}`);
  const doc5State = await call('admin', `/api/documents/${doc5.data.id}`);
  check('B-48 وضعیت پردازش DOCX همان UPLOADED می‌ماند', doc5State.data.processingStatus === 'UPLOADED', `processingStatus=${doc5State.data?.processingStatus}`);
  const tok5 = await call('admin', `/api/files/${up5.data.id}/download-token`, { method: 'POST' });
  check('B-49 فایل پردازش‌نشده همچنان قابل دریافت است', tok5.status === 200, `status=${tok5.status}`);

  // --- وضعیت سامانه ---
  const status = await call('admin', '/api/system/status');
  const caps = Object.fromEntries((status.data?.capabilities || []).map((c) => [c.key, c]));
  check('B-50 وضعیت صادقانه: Worker فعال', caps.worker_pipeline?.available === true, `note=${caps.worker_pipeline?.note?.slice(0, 60)}`);
  check('B-51 وضعیت صادقانه: OCR فعال با Worker و داده زبان', caps.ocr?.available === true, `note=${caps.ocr?.note?.slice(0, 60)}`);
  check('B-52 وضعیت صادقانه: صف بازبینی و لینک صفحه فعال', caps.review_queue?.available === true && caps.page_links?.available === true, `rq=${caps.review_queue?.available} pl=${caps.page_links?.available}`);

  // --- مانیتور پردازش: آمار و صف ---
  const jobsList = await call('admin', '/api/jobs?limit=50');
  check('B-53 مانیتور: فهرست کارها با وضعیت Worker', jobsList.status === 200 && jobsList.data.jobs.length >= 5 && typeof jobsList.data.worker.alive === 'boolean', `jobs=${jobsList.data?.jobs?.length} alive=${jobsList.data?.worker?.alive}`);

  workerProc.kill('SIGTERM');

  // --- خلاصه ---
  // بازگرداندن تنظیم MFA به حالت سامانه (غیرفعال طبق تصمیم بهره‌بردار)
  await db.setting.upsert({ where: { key: 'auth.mfaEnabled' }, update: { value: 'false' }, create: { key: 'auth.mfaEnabled', value: 'false' } });
  await db.user.update({ where: { username: 'admin' }, data: { mfaEnabled: false } });
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n== نتیجه مرحله B: ${pass}/${results.length} PASS ==`);
  fs.writeFileSync('docs/test-results-phase-b.json', JSON.stringify({ at: new Date().toISOString(), total: results.length, pass, results }, null, 2));
  await db.$disconnect();
  process.exit(pass === results.length ? 0 : 1);
}

main().catch(async (e) => {
  console.error('خطای مهلک آزمون:', e);
  await db.$disconnect();
  process.exit(1);
});
