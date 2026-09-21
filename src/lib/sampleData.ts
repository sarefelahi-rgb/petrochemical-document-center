// داده نمونه برچسب‌خورده — قابل ایجاد و حذف کامل از پنل مدیر
// دو پروژه با کاربران جدا برای آزمون انزوا + فایل‌های PDF واقعی کوچک برای پیش‌نمایش
import { db } from '@/lib/db';
import { hashPassword, randomToken } from '@/lib/auth';
import { storeOriginal, ensureDirs } from '@/lib/storage';
import { normalizeCode, buildSearchNorm } from '@/lib/normalize';
import { enqueuePipelineForFile } from '@/lib/jobs';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// ساخت یک PDF تک‌صفحه‌ای معتبر و کوچک — با فونت واقعی فارسی (Vazirmatn) برای پشتیبانی کامل متن
export async function makeSamplePdf(lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontBytes = fs.readFileSync(path.join(process.cwd(), 'assets', 'fonts', 'Vazirmatn-Regular.ttf'));
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const page = pdf.addPage([842, 595]); // A4 افقی — شبیه نقشه
  const fs2 = 11;
  let y = 550;
  for (const line of lines) {
    // ارقام و کدهای مهندسی LTR می‌مانند؛ pdf-lib + fontkit شکل‌دهی فارسی را انجام می‌دهد
    const width = font.widthOfTextAtSize(line, fs2);
    page.drawText(line, { x: 60, y, size: fs2, font, color: rgb(0.1, 0.1, 0.12) });
    // خط کادر عنوان برای واقعی‌تر شدن اسکن کادر
    y -= 24;
  }
  page.drawRectangle({ x: 500, y: 40, width: 320, height: 90, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1 });
  const titleBlockLines = lines.slice(0, 4);
  let ty = 108;
  for (const l of titleBlockLines) {
    page.drawText(l.slice(0, 60), { x: 510, y: ty, size: 8, font, color: rgb(0.15, 0.15, 0.15) });
    ty -= 14;
  }
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

async function putFile(opts: { orgId: string; name: string; lines: string[]; uploaderId: string; userIdsInProject: string[] }) {
  const tmpPath = path.join(process.cwd(), 'data', 'tmp', `sample-${crypto.randomBytes(6).toString('hex')}.pdf`);
  fs.writeFileSync(tmpPath, await makeSamplePdf(opts.lines));
  const stored = await storeOriginal(tmpPath, opts.orgId, opts.name);
  fs.rmSync(tmpPath, { force: true });
  return stored;
}

export async function purgeSampleData() {
  // حذف کامل داده نمونه به ترتیب وابستگی
  // نکته: اسنادی که در پروژهٔ نمونه ساخته شده‌اند ولی پرچم isSample ندارند هم جزو دادهٔ نمونه‌اند
  const sampleDocs = await db.document.findMany({
    where: { OR: [{ isSample: true }, { project: { isSample: true } }] },
    select: { id: true },
  });
  const docIds = sampleDocs.map((d) => d.id);
  if (docIds.length > 0) {
    await db.docLink.deleteMany({ where: { documentId: { in: docIds } } });
    await db.favorite.deleteMany({ where: { documentId: { in: docIds } } });
    const revs = await db.revision.findMany({ where: { documentId: { in: docIds } }, select: { id: true } });
    const revIds = revs.map((r) => r.id);
    const files = await db.fileObject.findMany({ where: { revisionId: { in: revIds } }, select: { id: true, storageKey: true } });
    const fileIds = files.map((f) => f.id);
    // جداسازی پردازش (مرحله B) — مشتقات و صف‌ها و بازبینی‌ها و حاشیه‌نویسی‌ها
    const derivs = await db.derivativeObject.findMany({ where: { fileId: { in: fileIds } }, select: { storageKey: true } });
    for (const d of derivs) { try { fs.unlinkSync('data/objectstore/' + d.storageKey); } catch { } }
    await db.derivativeObject.deleteMany({ where: { fileId: { in: fileIds } } });
    await db.pageText.deleteMany({ where: { fileId: { in: fileIds } } });
    await db.docExtraction.deleteMany({ where: { documentId: { in: docIds } } });
    await db.processingJob.deleteMany({ where: { fileId: { in: fileIds } } });
    await db.annotation.deleteMany({ where: { fileId: { in: fileIds } } });
    await db.reviewTask.deleteMany({ where: { documentId: { in: docIds } } });
    await db.fileObject.deleteMany({ where: { id: { in: fileIds } } });
    await db.revision.deleteMany({ where: { id: { in: revIds } } });
    await db.cartableTask.deleteMany({ where: { relatedDocId: { in: docIds } } });
    await db.document.deleteMany({ where: { id: { in: docIds } } });
    for (const f of files) { try { fs.unlinkSync('data/objectstore/' + f.storageKey); } catch { } }
  }
  // پاک‌سازی روابط اسناد غیرنمونه به خطوط/تجهیزهای نمونه (پیش از حذف آن‌ها)
  const sampleLines = await db.line.findMany({ where: { isSample: true }, select: { id: true } });
  const sampleTags = await db.assetTag.findMany({ where: { isSample: true }, select: { id: true } });
  await db.docLink.deleteMany({
    where: { OR: [{ lineId: { in: sampleLines.map((l) => l.id) } }, { tagId: { in: sampleTags.map((t) => t.id) } }] },
  });
  await db.line.deleteMany({ where: { isSample: true } });
  await db.assetTag.deleteMany({ where: { isSample: true } });
  await db.unit.deleteMany({ where: { area: { project: { isSample: true } } } });
  await db.area.deleteMany({ where: { project: { isSample: true } } });
  await db.projectMember.deleteMany({ where: { project: { isSample: true } } });
  await db.project.deleteMany({ where: { isSample: true } });
  const sampleUsers = await db.user.findMany({ where: { isSample: true }, select: { id: true } });
  for (const u of sampleUsers) {
    await db.session.deleteMany({ where: { userId: u.id } });
    await db.mfaChallenge.deleteMany({ where: { userId: u.id } });
    await db.cartableTask.deleteMany({ where: { assigneeId: u.id } });
  }
  await db.user.deleteMany({ where: { isSample: true } });
  await db.setting.updateMany({ where: { key: 'app.sampleDataPresent' }, data: { value: 'false' } });
  return { purged: true, documentsRemoved: docIds.length };
}

export async function createSampleData(orgId: string, adminId: string) {
  ensureDirs();
  await purgeSampleData();

  // ساختار مجتمع (نمونه)
  const org = await db.organization.findUnique({ where: { id: orgId } });
  const orgName = org?.name || 'مجتمع نمونه';
  const p1 = await db.project.create({ data: { organizationId: orgId, code: 'PRJ-BI-1403', name: 'پروژه بهسازی واحد الف (نمونه)', isSample: true, description: 'داده آزمایشی با برچسب «نمونه» — قابل حذف کامل از همین بخش' } });
  const p2 = await db.project.create({ data: { organizationId: orgId, code: 'PRJ-BI-1404', name: 'پروژه توسعه واحد ب (نمونه)', isSample: true, description: 'پروژه دوم برای آزمون انزوای داده' } });
  const a1 = await db.area.create({ data: { projectId: p1.id, code: 'AREA-100', name: 'ناحیه ۱۰۰ — نمونه' } });
  const a2 = await db.area.create({ data: { projectId: p2.id, code: 'AREA-200', name: 'ناحیه ۲۰۰ — نمونه' } });
  const u1 = await db.unit.create({ data: { areaId: a1.id, code: 'U-110', name: 'واحد ۱۱۰ — نمونه' } });
  const u2 = await db.unit.create({ data: { areaId: a2.id, code: 'U-210', name: 'واحد ۲۱۰ — نمونه' } });

  const line1 = await db.line.create({ data: { unitId: u1.id, lineNumber: normalizeCode('6-P-1183-B2A'), sizeClass: '6" CL150', spec: 'CS150-A', isSample: true } });
  const line2 = await db.line.create({ data: { unitId: u1.id, lineNumber: normalizeCode('6-P-1184-B1A'), sizeClass: '4" CL150', spec: 'CS150-A', isSample: true } });
  const tag1 = await db.assetTag.create({ data: { tag: normalizeCode('EA-308B'), description: 'کویل هواخنک A — نمونه', tagType: 'EQUIPMENT', areaCode: 'AREA-100', isSample: true } });
  const tag2 = await db.assetTag.create({ data: { tag: normalizeCode('P-1101A'), description: 'پمپ سیرکولاسیون A — نمونه', tagType: 'EQUIPMENT', areaCode: 'AREA-100', isSample: true } });

  // کاربران نمونه (رمز تصادفی؛ نمایش داده نمی‌شود چون داده آزمایشی است و قابل حذف)
  const mkUser = async (username: string, fullName: string, role: string, clearance: string, projectIds: string[]) => {
    const u = await db.user.create({
      data: {
        username, fullName, role, clearance, organizationId: orgId,
        passwordHash: hashPassword(`Sample-${randomToken().slice(0, 10)}2`), mustChangePassword: true, isSample: true,
        projectMemberships: { create: projectIds.map((pid) => ({ projectId: pid })) },
      },
    });
    return u;
  };
  const eng1 = await mkUser('eng.sample1', 'کارشناس نمونه — اداره مهندسی عمومی', 'ENG_EXPERT', 'CONFIDENTIAL', [p1.id]);
  const eng2 = await mkUser('eng.sample2', 'کارشناس نمونه — پروژه ب', 'ENG_EXPERT', 'CONFIDENTIAL', [p2.id]);
  const head1 = await mkUser('head.sample1', 'رئیس نمونه — اداره مهندسی عمومی', 'ENG_HEAD', 'RESTRICTED', [p1.id, p2.id]);
  const tech1 = await mkUser('tech.sample1', 'رئیس نمونه — خدمات فنی فراورش یک', 'TECH_HEAD', 'CONFIDENTIAL', [p1.id, p2.id]);
  const office1 = await mkUser('office.sample1', 'مسئول دفتر نمونه — رئیس اداره مهندسی عمومی', 'OFFICE_MGR', 'INTERNAL', [p1.id, p2.id]);
  const ctr1 = await mkUser('ctr.sample1', 'پیمانکار نمونه — پروژه الف', 'CONTRACTOR', 'INTERNAL', [p1.id]);
  const ctr2 = await mkUser('ctr.sample2', 'پیمانکار نمونه — پروژه ب', 'CONTRACTOR', 'INTERNAL', [p2.id]);

  // اسناد نمونه با فایل PDF واقعی
  const mkDoc = async (o: {
    projectId: string; docNumber: string; title: string; discipline: string; docType: string;
    unitId?: string; confidentiality: string; rev: string; revStatus: string; lines: string[];
    tagId?: string; lineId?: string; uploaderId: string;
  }) => {
    const doc = await db.document.create({
      data: {
        organizationId: orgId, projectId: o.projectId,
        docNumber: normalizeCode(o.docNumber), docNumberRaw: o.docNumber,
        title: o.title, searchNorm: buildSearchNorm([o.title, normalizeCode(o.docNumber), o.docNumber]), discipline: o.discipline, docType: o.docType,
        unitId: o.unitId || null, confidentiality: o.confidentiality,
        status: o.revStatus === 'APPROVED' ? 'PUBLISHED' : 'IN_REVIEW',
        processingStatus: 'UPLOADED', extractionStatus: 'NOT_EXTRACTED', engineeringStatus: 'UNREVIEWED',
        isSample: true, createdById: adminId,
      },
    });
    const rev = await db.revision.create({
      data: { documentId: doc.id, revisionCode: o.rev, status: o.revStatus, purpose: 'AFB — نمونه', isSample: true, receivedDate: new Date() },
    });
    await db.document.update({ where: { id: doc.id }, data: { currentRevisionId: rev.id, validRevisionId: o.revStatus === 'APPROVED' ? rev.id : null } });
    const stored = await putFile({ orgId, name: `${o.docNumber}-R${o.rev}.pdf`, lines: o.lines, uploaderId: o.uploaderId, userIdsInProject: [] });
    const file = await db.fileObject.create({
      data: {
        revisionId: rev.id, kind: 'ORIGINAL', storageKey: stored.storageKey,
        originalName: `${o.docNumber}-R${o.rev}.pdf`, mimeType: 'application/pdf', size: stored.size,
        sha256: stored.sha256, scanStatus: 'CLEAN', scanNote: 'PDF', isSample: true, uploadedById: o.uploaderId,
      },
    });
    await db.docLink.create({
      data: { documentId: doc.id, linkType: o.tagId ? 'TAG' : 'LINE', tagId: o.tagId || null, lineId: o.lineId || null, linkStatus: 'CONFIRMED', isSample: true },
    });
    await db.cartableTask.create({
      data: { assigneeId: o.uploaderId, type: 'REVIEW', title: `بازبینی سند نمونه ${o.docNumber}`, relatedDocId: doc.id, payload: JSON.stringify({ documentId: doc.id }) },
    });
    // صف پردازش مرحله B — Worker مستقل متن/OCR و شناسنامه را استخراج می‌کند
    await enqueuePipelineForFile(file.id);
    return { doc, rev, file };
  };

  const sampleLabel = ['نمونهٔ آموزشی — داده واقعی نیست', `${orgName}`];
  const titleLine = (docNumber: string, rev: string) => `DOC NO: ${docNumber}  REV: ${rev}  SHEET 1 OF 1  SCALE: NTS`;

  await mkDoc({ projectId: p1.id, docNumber: '1183-ISO-0001', title: 'ایزومتریک خط 6-P-1183-B2A — نمونه', discipline: 'PIPING', docType: 'ISOMETRIC', unitId: u1.id, confidentiality: 'CONFIDENTIAL', rev: '2', revStatus: 'APPROVED', uploaderId: eng1.id, lineId: line1.id, lines: [...sampleLabel, 'ISOMETRIC DRAWING (SAMPLE)', titleLine('1183-ISO-0001', '2'), 'LINE: 6-P-1183-B2A  SIZE: 6"  CLASS: CL150', 'FROM: P-1101A  TO: EA-308B', 'REV 2 - APPROVED FOR CONSTRUCTION (SAMPLE)'] });
  await mkDoc({ projectId: p1.id, docNumber: '1101-PID-0001', title: 'P&ID واحد ۱۱۰ برگه ۱ — نمونه', discipline: 'PROCESS', docType: 'PID', unitId: u1.id, confidentiality: 'CONFIDENTIAL', rev: '1', revStatus: 'APPROVED', uploaderId: eng1.id, lineId: line2.id, lines: [...sampleLabel, 'P&ID SHEET 1 OF 1 (SAMPLE)', titleLine('1101-PID-0001', '1'), 'UNIT 110 - SAMPLE DATA', 'EQUIPMENT: P-1101A, EA-308B'] });
  await mkDoc({ projectId: p1.id, docNumber: '308B-DS-0001', title: 'دیتاشیت هواخنک EA-308B — نمونه', discipline: 'MECH', docType: 'DATASHEET', unitId: u1.id, confidentiality: 'INTERNAL', rev: '0', revStatus: 'APPROVED', uploaderId: eng1.id, tagId: tag1.id, lines: [...sampleLabel, 'DATASHEET (SAMPLE)', titleLine('308B-DS-0001', '0'), 'EQUIPMENT TAG: EA-308B', 'AIR COOLED HEAT EXCHANGER - SAMPLE'] });
  await mkDoc({ projectId: p1.id, docNumber: '1101-MTO-0001', title: 'Line List و MTO واحد ۱۱۰ — نمونه', discipline: 'PIPING', docType: 'LINELIST', unitId: u1.id, confidentiality: 'INTERNAL', rev: '3', revStatus: 'IN_REVIEW', uploaderId: eng1.id, lines: [...sampleLabel, 'LINE LIST (SAMPLE)', titleLine('1101-MTO-0001', '3'), 'LINE: 6-P-1183-B2A', 'LINE: 6-P-1184-B1A'] });
  await mkDoc({ projectId: p2.id, docNumber: '210-PID-0001', title: 'P&ID واحد ۲۱۰ برگه ۱ — نمونه (پروژه ب)', discipline: 'PROCESS', docType: 'PID', unitId: u2.id, confidentiality: 'CONFIDENTIAL', rev: '0', revStatus: 'IN_REVIEW', uploaderId: eng2.id, lines: [...sampleLabel, 'P&ID SHEET 1 OF 1 (SAMPLE)', titleLine('210-PID-0001', '0'), 'UNIT 210 - PROJECT 2 - SAMPLE'] });
  await mkDoc({ projectId: p2.id, docNumber: '210-ISO-0007', title: 'ایزومتریک خط 8-C-2101-A1A — نمونه (پروژه ب)', discipline: 'PIPING', docType: 'ISOMETRIC', unitId: u2.id, confidentiality: 'CONFIDENTIAL', rev: '0', revStatus: 'RECEIVED', uploaderId: eng2.id, lines: [...sampleLabel, 'ISOMETRIC DRAWING (SAMPLE)', titleLine('210-ISO-0007', '0'), 'LINE: 8-C-2101-A1A - PROJECT 2'] });

  await db.setting.upsert({ where: { key: 'app.sampleDataPresent' }, update: { value: 'true' }, create: { key: 'app.sampleDataPresent', value: 'true' } });
  await db.auditEvent.create({ data: { organizationId: orgId, actorId: adminId, action: 'SAMPLE_DATA_CREATE', detail: 'برچسب نمونه — قابل حذف کامل' } });

  return {
    created: true,
    projects: [p1.code, p2.code],
    sampleUsers: [
      { username: eng1.username, project: p1.code },
      { username: eng2.username, project: p2.code },
      { username: ctr1.username, project: p1.code },
      { username: ctr2.username, project: p2.code },
    ],
    note: 'کاربران نمونه رمز تصادفی دارند که عمداً نمایش داده نمی‌شود؛ برای آزمون انزوا از پنل مدیر برای آن‌ها رمز جدید تعیین کنید یا کاربر واقعی بسازید.',
  };
}
