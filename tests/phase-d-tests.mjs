// آزمون‌های پذیرش مرحله D — کنترل سازمانی: MTO، گردش تأیید (منع خودتأییدی)، ترنسمیتال، MDR،
// دستیار با محدودهٔ سند، ورود بدون MFA (حالت پیش‌فرض)، پشتیبان‌گیری
// اجرا: bun tests/phase-d-tests.mjs (سرور dev روی 3000 + Worker فعال باشد)
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import { execSync } from 'child_process';

const db = new PrismaClient();
const BASE = 'http://localhost:3000';
const results = [];

function check(name, cond, evidence) {
  results.push({ name, ok: !!cond, evidence: String(evidence || '').slice(0, 160) });
  console.log(`${cond ? 'PASS' : 'FAIL'} | ${name} | ${evidence || ''}`);
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

async function uploadPdf(as, documentId, buf, name, revisionId = '') {
  const fd = new FormData();
  fd.append('file', new Blob([buf]), name || 'test.pdf');
  fd.append('documentId', documentId);
  if (revisionId) fd.append('revisionId', revisionId);
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
    return jobs.every((j) => ['DONE', 'DEAD', 'CANCELLED'].includes(j.status));
  }, timeoutMs);
}

async function main() {
  console.log('== آزمون‌های مرحله D ==');

  // --- پاک‌سازی بقایای اجرای قبلی ---
  const oldUsers = await db.user.findMany({ where: { username: { in: ['test-eng-d2', 'test-ctr-d2', 'test-apr-d2'] } }, select: { id: true } });
  for (const u of oldUsers) {
    await db.session.deleteMany({ where: { userId: u.id } });
    await db.mfaChallenge.deleteMany({ where: { userId: u.id } });
    await db.cartableTask.deleteMany({ where: { assigneeId: u.id } });
    await db.projectMember.deleteMany({ where: { userId: u.id } });
    await db.docApproval.deleteMany({ where: { reviewerId: u.id } });
    await db.auditEvent.deleteMany({ where: { actorId: u.id } });
    await db.user.delete({ where: { id: u.id } });
  }
  const oldProj = await db.project.findFirst({ where: { code: 'PRJ-TEST-D2' } });
  if (oldProj) {
    const docs = await db.document.findMany({ where: { projectId: oldProj.id }, select: { id: true } });
    const revs = await db.revision.findMany({ where: { documentId: { in: docs.map((d) => d.id) } }, select: { id: true } });
    const files = await db.fileObject.findMany({ where: { revisionId: { in: revs.map((r) => r.id) } }, select: { id: true, storageKey: true } });
    await db.transmittalItem.deleteMany({ where: { documentId: { in: docs.map((d) => d.id) } } });
    await db.docApproval.deleteMany({ where: { documentId: { in: docs.map((d) => d.id) } } });
    await db.mtoRow.deleteMany({ where: { documentId: { in: docs.map((d) => d.id) } } });
    await db.docExtraction.deleteMany({ where: { fileId: { in: files.map((f) => f.id) } } });
    await db.processingJob.deleteMany({ where: { fileId: { in: files.map((f) => f.id) } } });
    await db.pageText.deleteMany({ where: { fileId: { in: files.map((f) => f.id) } } });
    await db.derivativeObject.deleteMany({ where: { fileId: { in: files.map((f) => f.id) } } });
    await db.reviewTask.deleteMany({ where: { documentId: { in: docs.map((d) => d.id) } } });
    await db.cartableTask.deleteMany({ where: { relatedDocId: { in: docs.map((d) => d.id) } } });
    await db.fileObject.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
    await db.revision.deleteMany({ where: { id: { in: revs.map((r) => r.id) } } });
    await db.docLink.deleteMany({ where: { documentId: { in: docs.map((d) => d.id) } } });
    await db.document.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
    await db.projectMember.deleteMany({ where: { projectId: oldProj.id } });
    await db.project.delete({ where: { id: oldProj.id } });
    for (const f of files) { try { fs.unlinkSync('data/objectstore/' + f.storageKey); } catch { } }
  }
  await db.transmittal.deleteMany({ where: { number: { startsWith: 'TR-TEST-D' } } });
  await db.assetTag.deleteMany({ where: { tag: { in: ['EA-401D', 'EA-402D'] } } });

  // --- اطمینان از حالت پیش‌فرض: MFA غیرفعال ---
  await db.setting.upsert({ where: { key: 'auth.mfaEnabled' }, update: { value: 'false' }, create: { key: 'auth.mfaEnabled', value: 'false' } });
  await db.user.update({ where: { username: 'admin' }, data: { mfaEnabled: false } });

  // --- ورود مدیر بدون MFA (حالت پیش‌فرض سامانه) ---
  const credTxt = fs.readFileSync('data/initial-admin-credentials.txt', 'utf8');
  const adminPw = credTxt.match(/(?:رمز اولیه|رمز عبور فعلی): (\S+)/)?.[1];
  const l0 = await call('admin', '/api/auth/login', { method: 'POST', json: { username: 'admin', password: adminPw } });
  check('D-00 ورود مستقیم مدیر بدون MFA (غیرفعال)', l0.status === 200 && l0.data.ok === true && !l0.data.mfaRequired && !l0.data.mfaEnroll, `status=${l0.status} ok=${l0.data?.ok}`);

  // --- ساختار آزمون ---
  await call('admin', '/api/admin/projects', { method: 'POST', json: { kind: 'project', code: 'PRJ-TEST-D2', name: 'پروژه آزمون D' } });
  const projects = (await call('admin', '/api/admin/projects')).data.projects;
  const proj = projects.find((p) => p.code === 'PRJ-TEST-D2');
  const NEW_PW = 'D2-Pass-2026x';

  async function mkUser(username, fullName, role, clearance, projectIds) {
    const created = await call('admin', '/api/admin/users', { method: 'POST', json: { username, fullName, role, clearance, projectIds } });
    return created.status === 201 ? created.data?.tempPassword || created.data?.password : null;
  }
  async function loginFlow(as, username, tempPw) {
    const l = await call(as, '/api/auth/login', { method: 'POST', json: { username, password: tempPw } });
    if (l.status !== 200) return l.status;
    await call(as, '/api/auth/change-password', { method: 'POST', json: { currentPassword: tempPw, newPassword: NEW_PW } });
    const l2 = await call(as, '/api/auth/login', { method: 'POST', json: { username, password: NEW_PW } });
    return l2.status;
  }
  const engTemp = await mkUser('test-eng-d2', 'مهندس آزمون D', 'ENGINEER', 'CONFIDENTIAL', [proj.id]);
  const ctrTemp = await mkUser('test-ctr-d2', 'پیمانکار آزمون D', 'CONTRACTOR', 'INTERNAL', [proj.id]);
  const aprTemp = await mkUser('test-apr-d2', 'تأییدکننده آزمون D', 'APPROVER', 'CONFIDENTIAL', [proj.id]);
  const engLogin = await loginFlow('eng', 'test-eng-d2', engTemp);
  await loginFlow('ctr', 'test-ctr-d2', ctrTemp);
  const aprLogin = await loginFlow('apr', 'test-apr-d2', aprTemp);
  check('D-00 ورود کاربران آزمون', engLogin === 200 && aprLogin === 200, `eng=${engLogin} apr=${aprLogin}`);

  // --- اسناد آزمون ---
  const mkDoc = (docNumber, title, docType, confidentiality) => call('admin', '/api/documents', {
    method: 'POST', json: { projectId: proj.id, docNumber, title, discipline: 'PIPING', docType, confidentiality },
  });
  const docIso = await mkDoc('8800-ISO-0600', 'ایزومتریک آزمون D خط 6-P-8800-C1A', 'ISOMETRIC', 'INTERNAL');
  const docIso2 = await mkDoc('8800-ISO-0601', 'ایزومتریک دوم آزمون D همان خط', 'ISOMETRIC', 'INTERNAL');
  const docSecret = await mkDoc('8888-SP-0999', 'مشخصات محرمانه آزمون D', 'SPEC', 'RESTRICTED');
  check('D-00 ساخت اسناد آزمون', docIso.status === 201 && docIso2.status === 201 && docSecret.status === 201, `iso=${docIso.status} iso2=${docIso2.status} sec=${docSecret.status}`);

  const upIso = await uploadPdf('admin', docIso.data.id, await makeTextPdf([
    'داده آزمایشی آموزشی — مرحله D',
    'ISOMETRIC DRAWING',
    'DOC NO: 8800-ISO-0600  REV: 0',
    'LINE: 6-P-8800-C1A  SIZE: 4 INCH  CLASS: CS150',
    'MTO: GATE VALVE 4 INCH CS CLASS CS150 RF QTY 6',
  ]));
  const processed = await waitJobsDone(upIso.data.id);
  check('D-00 پردازش کامل سند آزمون', !!processed, `done=${processed}`);

  // ================= MTO =================
  // D-01: افزودن دستی ردیف
  const rAdd1 = await call('admin', `/api/documents/${docIso.data.id}/mto`, {
    method: 'POST', json: { action: 'add', row: { rawDesc: 'GATE VALVE 4"', material: 'CS', sizeMain: '4"', cls: 'CS150', endConn: 'RF', unit: 'EA', qty: 4, pageNumber: 1 } },
  });
  const rAdd2 = await call('admin', `/api/documents/${docIso.data.id}/mto`, {
    method: 'POST', json: { action: 'add', row: { rawDesc: 'GATE VALVE 4" (adjoining sheet)', material: 'CS', sizeMain: '4"', cls: 'CS150', endConn: 'RF', unit: 'EA', qty: 2 } },
  });
  const rAdd3 = await call('admin', `/api/documents/${docIso.data.id}/mto`, {
    method: 'POST', json: { action: 'add', row: { rawDesc: 'ELBOW 90 LR', material: 'CS', sizeMain: '4"', cls: 'CS150', unit: 'EA', qty: 3 } },
  });
  const rAdd4 = await call('admin', `/api/documents/${docIso.data.id}/mto`, {
    method: 'POST', json: { action: 'add', row: { rawDesc: 'ردیف ناقص آزمون', unit: 'EA', qty: 9 } }, // بدون متریال/سایز → ادغام نمی‌شود
  });
  check('D-01 افزودن دستی ردیف‌های MTO', rAdd1.status === 200 && rAdd2.status === 200 && rAdd4.status === 200, `a=${rAdd1.status} b=${rAdd2.status} c=${rAdd3.status} d=${rAdd4.status}`);

  // D-02: ردیف‌های پیشنهادی مدل از متن صفحه (خروجی صادقانه؛ شمارش ≥ 0 و وضعیت SUGGESTED)
  const rSug = await call('admin', `/api/documents/${docIso.data.id}/mto`, { method: 'POST', json: { action: 'suggest' } });
  const sugOk = rSug.status === 200 && Array.isArray(rSug.data.items || []) && (rSug.data.created || 0) >= 0
    && (rSug.data.items || []).every((x) => x.status === 'SUGGESTED' && x.source === 'LLM_SUGGESTION');
  check('D-02 پیشنهاد MTO با مدل زبانی (تا تأیید کارشناس «پیشنهاد»)', sugOk, `status=${rSug.status} created=${rSug.data?.created}`);

  // D-03: تجمیع دقیق روی ردیف‌های تأییدشده با کلید فنی + جداسازی ردیف ناقص
  const agg = await call('eng', '/api/mto/aggregate', { method: 'POST', json: { documentIds: [docIso.data.id, docIso2.data.id] } });
  const gValve = (agg.data.items || []).find((g) => g.material === 'CS' && g.sizeMain === '4"' && g.endConn === 'RF');
  const gIncomplete = (agg.data.items || []).find((g) => g.incomplete);
  check('D-03 تجمیع MTO: جمع دقیق روی کلید فنی', agg.status === 200 && gValve && gValve.qty === 6 && gValve.sources.length === 2,
    `valveQty=${gValve?.qty} sources=${gValve?.sources?.length}`);
  check('D-03 ردیف ناقص بدون ادغام جدا می‌شود', !!gIncomplete && gIncomplete.qty === 9, `incompleteQty=${gIncomplete?.qty}`);

  // D-04: انزوا — سند RESTRICTED در تجمیع برای کاربر CONFIDENTIAL دیده نمی‌شود
  const rowSecret = await call('admin', `/api/documents/${docSecret.data.id}/mto`, {
    method: 'POST', json: { action: 'add', row: { rawDesc: 'SECRET VALVE', material: 'SS', sizeMain: '2"', unit: 'EA', qty: 100 } },
  });
  const aggEng = await call('eng', '/api/mto/aggregate', { method: 'POST', json: { documentIds: [docIso.data.id, docSecret.data.id] } });
  const leakedSecret = (aggEng.data.items || []).some((g) => g.material === 'SS' && g.qty === 100);
  check('D-04 انزوا: ردیف سند RESTRICTED از تجمیع مهندس حذف است', rowSecret.status === 200 && aggEng.status === 200 && !leakedSecret, `leak=${leakedSecret}`);

  // ================= گردش تأیید =================
  // D-05: منع خودتأییدی — درخواست بازبینی از خودِ درخواست‌دهنده رد می‌شود
  const selfReq = await call('admin', `/api/documents/${docIso.data.id}/approvals`, { method: 'POST', json: { action: 'request', reviewerId: (await call('admin', '/api/auth/me')).data.user.id } });
  check('D-05 منع خودتأییدی: محول به خود رد می‌شود', selfReq.status === 400, `status=${selfReq.status}`);

  // D-06: داوطلبان شامل خودِ درخواست‌دهنده نیست
  const apprList = await call('admin', `/api/documents/${docIso.data.id}/approvals`);
  const meAdmin = (await call('admin', '/api/auth/me')).data.user;
  const adminInCandidates = (apprList.data.candidates || []).some((c) => c.fullName?.includes('مدیر سامانه'));
  check('D-06 فهرست بازبینان بدون خودِ درخواست‌دهنده', apprList.status === 200 && !adminInCandidates, `candidates=${apprList.data.candidates?.length}`);

  // D-07: محول به تأییدکننده + ساخت کار کارتابل + وضعیت مهندسی IN_REVIEW
  const aprUser = await db.user.findUnique({ where: { username: 'test-apr-d2' } });
  const req1 = await call('admin', `/api/documents/${docIso.data.id}/approvals`, { method: 'POST', json: { action: 'request', reviewerId: aprUser.id } });
  const engDocAfterReq = await call('eng', `/api/documents/${docIso.data.id}`);
  const cartableApr = await db.cartableTask.findFirst({ where: { assigneeId: aprUser.id, relatedDocId: docIso.data.id, type: 'APPROVE', status: 'OPEN' } });
  check('D-07 محول بازبینی + کار کارتابل + IN_REVIEW', req1.status === 200 && !!cartableApr && engDocAfterReq.data.engineeringStatus === 'IN_REVIEW',
    `req=${req1.status} task=${!!cartableApr} eng=${engDocAfterReq.data?.engineeringStatus}`);

  // D-08: تصمیم توسط غیرمحول رد می‌شود (مهندس نه درخواست‌دهنده است نه بازبین)
  const wrongDecide = await call('eng', `/api/documents/${docIso.data.id}/approvals`, { method: 'POST', json: { action: 'decide', approvalId: req1.data.item.id, decision: 'APPROVED' } });
  check('D-08 تصمیم غیر از بازبین محول‌شده 403', wrongDecide.status === 403, `status=${wrongDecide.status}`);

  // D-09: تأیید توسط بازبین محول → نسخهٔ جاری APPROVED + کار کارتابل بسته می‌شود
  const jarsBackup = jars.get('apr');
  const decide = await call('apr', `/api/documents/${docIso.data.id}/approvals`, { method: 'POST', json: { action: 'decide', approvalId: req1.data.item.id, decision: 'APPROVED', comment: 'مطابق مشخصات است' } });
  const docAfterApr = await call('apr', `/api/documents/${docIso.data.id}`);
  const revAfterApr = await db.revision.findFirst({ where: { documentId: docIso.data.id, revisionCode: '0' } });
  const taskClosed = await db.cartableTask.findUnique({ where: { id: cartableApr.id } });
  check('D-09 تأیید دور → نسخهٔ جاری APPROVED', decide.status === 200 && docAfterApr.data.engineeringStatus === 'APPROVED' && revAfterApr.status === 'APPROVED',
    `dec=${decide.status} eng=${docAfterApr.data?.engineeringStatus} rev=${revAfterApr.status}`);
  check('D-09 کار کارتابل پس از تصمیم بسته شد', taskClosed.status === 'DONE', `task=${taskClosed.status}`);
  if (!jarsBackup) jars.delete('apr'); else jars.set('apr', jarsBackup);

  // ================= ترنسمیتال =================
  // D-10: ایجاد + منع شماره تکراری
  const tr1 = await call('admin', '/api/transmittals', { method: 'POST', json: { number: 'TR-TEST-D-0001', direction: 'OUT', party: 'شرکت مهندسی آزمون', purpose: 'برای ساخت' } });
  const trDup = await call('admin', '/api/transmittals', { method: 'POST', json: { number: 'TR-TEST-D-0001', direction: 'OUT', party: 'تکراری' } });
  check('D-10 ایجاد ترنسمیتال + منع تکرار شماره', tr1.status === 200 && trDup.status === 409, `c=${tr1.status} dup=${trDup.status}`);

  // D-11: افزودن قلم + وضعیت SENT با تاریخ ارسال
  const trAdd = await call('admin', `/api/transmittals/${tr1.data.item.id}`, { method: 'PATCH', json: { action: 'add-item', documentId: docIso.data.id } });
  const trDupItem = await call('admin', `/api/transmittals/${tr1.data.item.id}`, { method: 'PATCH', json: { action: 'add-item', documentId: docIso.data.id } });
  const trSent = await call('admin', `/api/transmittals/${tr1.data.item.id}`, { method: 'PATCH', json: { action: 'set-status', status: 'SENT' } });
  check('D-11 افزودن قلم (منع تکرار قلم) + ارسال', trAdd.status === 200 && trDupItem.status === 409 && trSent.status === 200 && !!trSent.data.item.sentAt,
    `add=${trAdd.status} dup=${trDupItem.status} sent=${trSent.status}`);

  // D-12: افزودن سند خارج از دسترسی 404 (مهندس CONFIDENTIAL نمی‌تواند سند RESTRICTED ببیند)
  const trForbidden = await call('eng', `/api/transmittals/${tr1.data.item.id}`, { method: 'PATCH', json: { action: 'add-item', documentId: docSecret.data.id } });
  check('D-12 انزوا: افزودن سند غیرمجاز به ترنسمیتال 404', trForbidden.status === 403 || trForbidden.status === 404, `status=${trForbidden.status}`);

  // D-13: بازگشت SENT به DRAFT ممنوع؛ حذف غیر DRAFT ممنوع؛ ACK → CLOSED
  const backToDraft = await call('admin', `/api/transmittals/${tr1.data.item.id}`, { method: 'PATCH', json: { action: 'set-status', status: 'DRAFT' } });
  const deleteSent = await call('admin', `/api/transmittals/${tr1.data.item.id}`, { method: 'DELETE' });
  const ack = await call('admin', `/api/transmittals/${tr1.data.item.id}`, { method: 'PATCH', json: { action: 'set-status', status: 'ACKNOWLEDGED' } });
  const close = await call('admin', `/api/transmittals/${tr1.data.item.id}`, { method: 'PATCH', json: { action: 'set-status', status: 'CLOSED' } });
  check('D-13 چرخه وضعیت: SENT→DRAFT ممنوع، حذف غیر DRAFT ممنوع، ACK→CLOSED',
    backToDraft.status === 400 && deleteSent.status === 400 && ack.status === 200 && close.status === 200,
    `back=${backToDraft.status} del=${deleteSent.status} ack=${ack.status} close=${close.status}`);

  // ================= MDR =================
  // D-14: رجیستر MDR — ردیف سند + CSV با BOM
  const mdr = await call('eng', `/api/reports/mdr?projectId=${proj.id}`);
  const mdrRow = (mdr.data.rows || []).find((r) => r.docNumber === '8800-ISO-0600');
  check('D-14 رجیستر MDR شامل سند با وضعیت و ترنسمیتال', mdr.status === 200 && !!mdrRow && mdrRow.lastTransmittal.includes('TR-TEST-D-0001'),
    `rows=${mdr.data.rows?.length} lastTr=${mdrRow?.lastTransmittal}`);
  const mdrCsv = await fetch(`${BASE}/api/reports/mdr?projectId=${proj.id}&format=csv`, { headers: { Cookie: jars.get('eng') } });
  const csvBytes = new Uint8Array(await mdrCsv.arrayBuffer());
  const hasBom = csvBytes[0] === 0xEF && csvBytes[1] === 0xBB && csvBytes[2] === 0xBF;
  const csvHead = new TextDecoder().decode(csvBytes.slice(3, 60));
  check('D-14 خروجی CSV با BOM و هدر فارسی', mdrCsv.status === 200 && hasBom && csvHead.includes('شماره سند'), `status=${mdrCsv.status} bom=${hasBom} head=${csvHead.slice(0, 30)}`);

  // ================= دستیار — محدودهٔ سند =================
  // D-15: پرسش محدود به سند — شناسنامه کامل + MTO + گردش تأیید در شواهد
  const aScope = await call('eng', '/api/assistant', { method: 'POST', json: { question: 'شناسنامه و وضعیت این سند و ردیف‌های متریال آن را جمع‌بندی کن', docId: docIso.data.id } });
  const scopeCited = (aScope.data.citations || []).some((c) => c.docNumber === '8800-ISO-0600');
  const scopeHasMto = (aScope.data.citations || []).some((c) => (c.snippet || '').includes('MTO') || (c.snippet || '').includes('GATE VALVE'));
  check('D-15 دستیار با محدودهٔ سند پاسخ مستند می‌دهد', aScope.status === 200 && scopeCited && scopeHasMto, `status=${aScope.status} cited=${scopeCited} mto=${scopeHasMto}`);

  // D-16: انزوا — پیمانکار به سند RESTRICTED با docId دسترسی ندارد (404)
  const aSecret = await call('ctr', '/api/assistant', { method: 'POST', json: { question: 'مشخصات این سند چیست؟', docId: docSecret.data.id } });
  check('D-16 انزوای محدودهٔ سند برای غیرمجاز 404', aSecret.status === 404, `status=${aSecret.status}`);

  // ================= پشتیبان‌گیری =================
  // D-17: اسکریپت پشتیبان‌گیری — مانیفست + checksum
  let backupOk = false, backupEvidence = '';
  try {
    const out = execSync('node scripts/backup.mjs', { cwd: process.cwd(), encoding: 'utf8', timeout: 120000 });
    const m = out.match(/Backup OK → (\S+)/);
    const manifest = JSON.parse(fs.readFileSync(`${m[1]}/manifest.json`, 'utf8'));
    backupOk = !!manifest.db?.sha256 && manifest.db.sha256.length === 64;
    backupEvidence = `db=${manifest.db?.sha256?.slice(0, 12)}… originals=${manifest.objectstore?.originals}`;
    // پاک‌سازی پشتیبان آزمون
    execSync(`rm -rf "${m[1]}"`);
  } catch (e) { backupEvidence = e.message; }
  check('D-17 پشتیبان‌گیری هماهنگ با مانیفست و SHA-256', backupOk, backupEvidence);

  // --- نتیجه ---
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n== نتیجه مرحله D: ${pass}/${results.length} PASS ==`);
  fs.writeFileSync('docs/test-results-phase-d.json', JSON.stringify({ generatedAt: new Date().toISOString(), phase: 'D', total: results.length, passed: pass, results }, null, 2));
  await db.$disconnect();
  process.exit(pass === results.length ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
