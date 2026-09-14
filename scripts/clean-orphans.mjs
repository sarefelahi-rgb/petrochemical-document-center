import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
// پاک‌سازی پسماند آزمون: فایل یتیم بدون ویرایش + کارهایش
const orphans = await db.fileObject.findMany({ where: { revisionId: null } });
for (const f of orphans) {
  await db.processingJob.deleteMany({ where: { fileId: f.id } });
  await db.derivativeObject.deleteMany({ where: { fileId: f.id } });
  await db.pageText.deleteMany({ where: { fileId: f.id } });
  await db.docExtraction.deleteMany({ where: { fileId: f.id } });
  await db.fileObject.delete({ where: { id: f.id } });
  console.log('removed orphan file:', f.id, f.originalName);
}
await db.$disconnect();
