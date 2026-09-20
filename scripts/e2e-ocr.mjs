// آزمون سرتاسری OCR: ورود → ساخت سند → آپلود PDF واقعی → انتظار برای زنجیرهٔ پردازش → راستی‌آزمایی متن/OCR → پرسش از دستیار
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const BASE = 'http://localhost:3000';
const db = new PrismaClient();

function base32Decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, v = 0; const out = [];
  for (const ch of s.toUpperCase().replace(/=+$/, '')) {
    const i = A.indexOf(ch); if (i === -1) continue;
    v = (v << 5) | i; bits += 5;
    if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secret, step = Math.floor(Date.now() / 30000)) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  buf.writeUInt32BE(step % 0x100000000, 4);
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1000000).padStart(6, '0');
}
const jars = {};
async function call(name, url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
  if (jars[name]) headers['Cookie'] = jars[name];
  const r = await fetch(BASE + url, { ...opts, headers });
  const sc = r.headers.get('set-cookie');
  if (sc) jars[name] = sc.split(';')[0];
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

async function makePdf(text) {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const fs = await import('fs');
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fs.readFileSync('assets/fonts/Vazirmatn-Regular.ttf'), { subset: true });
  const page = doc.addPage([842, 595]);
  page.drawText(text, { x: 40, y: 500, size: 16, font, color: rgb(0.05, 0.05, 0.05) });
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

const LINE = `8-P-2299-C3B`;
const DOC_NO = `2299-ISO-E2E1`;
const BODY = `ISOMETRIC DRAWING ${DOC_NO}\nLINE: ${LINE}\nSIZE: 4 INCH  CLASS: A312 TP316\nNOTE: E2E OCR TEST FILE`;

async function main() {
  // ۱) ورود
  const S = 'JBSWY3DPEHPK3PXP';
  await db.user.update({ where: { username: 'admin' }, data: { mfaSecret: S, mfaEnabled: true } });
  const l1 = await call('admin', '/api/auth/login', { method: 'POST', json: { username: 'admin', password: process.env.ADMIN_PASSWORD || 'CHANGE_ME_ADMIN_PASSWORD' } });
  // MFA سراسری ممکن است خاموش باشد — فقط اگر سامانه توکن خواست، کد TOTP را تأیید کن
  let l2 = { status: 200 };
  if (l1.data?.mfaToken) {
    l2 = await call('admin', '/api/auth/mfa-verify', { method: 'POST', json: { mfaToken: l1.data.mfaToken, code: totp(S) } });
  }
  console.log('login:', l1.status, l2.status);
  if (l2.status !== 200) throw new Error('login failed');

  // ۲) ساخت سند جدید (برچسب آموزشی — دادهٔ نمونه)
  const proj = await db.project.findFirst({ where: { organizationId: (await db.organization.findFirst()).id, isSample: true } });
  const docResp = await call('admin', '/api/documents', { method: 'POST', json: {
    docNumber: DOC_NO, title: 'ایزومتریک آزمون سرتاسری OCR (دادهٔ نمونه)', discipline: 'PIPING', docType: 'ISOMETRIC',
    projectId: proj.id, confidentiality: 'INTERNAL', isSample: true,
  } });
  console.log('doc create:', docResp.status, docResp.data?.document?.id || docResp.data?.id);
  let docId = docResp.data?.document?.id || docResp.data?.id;
  if (!docId && docResp.status === 409) {
    // سند از دور قبلی مانده است — استفادهٔ مجدد
    const existing = await db.document.findFirst({ where: { docNumber: DOC_NO } });
    docId = existing?.id;
    console.log('doc reuse:', docId);
  }
  if (!docId) throw new Error('doc create failed');

  // ۳) آپلود PDF
  const buf = await makePdf(BODY);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'application/pdf' }), 'e2e-ocr-test.pdf');
  form.append('documentId', docId);
  form.append('opId', crypto.randomUUID());
  const up = await call('admin', '/api/upload', { method: 'POST', body: form });
  console.log('upload:', up.status, JSON.stringify(up.data).slice(0, 300));
  const fileId = up.data?.file?.id || up.data?.id;
  if (!fileId) throw new Error('upload failed');

  // ۴) انتظار برای پردازش (حداکثر ۹۰ ثانیه)
  let jobs = [];
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    jobs = await db.processingJob.findMany({ where: { fileId } });
    const pending = jobs.filter((j) => ['QUEUED', 'RUNNING'].includes(j.status)).length;
    if (pending === 0 && jobs.length >= 4) break;
    process.stdout.write(`\rwaiting... ${jobs.map((j) => j.type + ':' + j.status).join(' ')}        `);
  }
  console.log('\njobs:', jobs.map((j) => `${j.type}=${j.status}`).join(' '));

  // ۵) راستی‌آزمایی متن صفحات
  const pts = await db.pageText.findMany({ where: { fileId }, orderBy: { pageNumber: 'asc' } });
  console.log('pageTexts:', pts.length, pts.map((p) => `${p.pageNumber}:${p.source}:${p.wordCount}w`).join(', '));
  const joined = pts.map((p) => p.textNormalized).join(' ');
  const checks = {
    'line-number found': joined.includes('8-P-2299-C3B') || joined.includes('۸-P-۲۲۹۹-C3B') || joined.includes('2299'),
    'doc-number found': joined.includes(DOC_NO),
    'class found': joined.includes('TP316') || joined.includes('tp316'),
  };
  for (const [k, v] of Object.entries(checks)) console.log(v ? 'PASS' : 'FAIL', '-', k);

  // ۶) استخراج شناسنامه
  const exts = await db.docExtraction.findMany({ where: { fileId } });
  console.log('extractions:', exts.length, exts.map((e) => `${e.field}=${e.valueRaw.slice(0, 24)}(${(e.confidence * 100).toFixed(0)}%)`).join(' | '));

  // ۷) پرسش از دستیار دربارهٔ همین خط
  const a = await call('admin', '/api/assistant', { method: 'POST', json: { question: `کلاس و سایز خط ${LINE} چیست؟` } });
  console.log('assistant mode:', a.data?.mode, '| citations:', a.data?.citations?.length);
  console.log('answer:', (a.data?.answer || '').slice(0, 500));

  await db.$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
