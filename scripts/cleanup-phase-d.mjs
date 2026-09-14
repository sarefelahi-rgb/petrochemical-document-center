// پاک‌سازی پسماند آزمون مرحله D + بازنشانی وضعیت ادمین
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const db = new PrismaClient();

async function main() {
  const proj = await db.project.findFirst({ where: { code: 'PRJ-TEST-D2' } });
  if (proj) {
    const docs = await db.document.findMany({ where: { projectId: proj.id }, select: { id: true } });
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
    await db.projectMember.deleteMany({ where: { projectId: proj.id } });
    await db.project.delete({ where: { id: proj.id } });
    for (const f of files) { try { fs.unlinkSync('data/objectstore/' + f.storageKey); } catch { } }
    console.log('پروژه آزمون D حذف شد');
  }
  await db.transmittal.deleteMany({ where: { number: { startsWith: 'TR-TEST-D' } } });
  await db.assetTag.deleteMany({ where: { tag: { in: ['EA-401D', 'EA-402D'] } } });
  // حذف گفتگوهای آزمون مراحل C/D
  const testUsers = await db.user.findMany({ where: { username: { startsWith: 'test-' } }, select: { id: true } });
  for (const u of testUsers) {
    await db.assistantMessage.deleteMany({ where: { conversation: { userId: u.id } } });
    await db.conversation.deleteMany({ where: { userId: u.id } });
  }
  // وضعیت ادمین: بدون تغییر اجباری رمز، بدون MFA (حالت عادی)
  await db.user.update({ where: { username: 'admin' }, data: { mustChangePassword: false, mfaEnabled: false, mfaSecret: null } });
  await db.setting.upsert({ where: { key: 'auth.mfaEnabled' }, update: { value: 'false' }, create: { key: 'auth.mfaEnabled', value: 'false' } });
  console.log('وضعیت ادمین بازنشانی شد؛ MFA غیرفعال است.');
}
main().finally(() => db.$disconnect());
