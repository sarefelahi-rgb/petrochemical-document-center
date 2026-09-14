import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const dead = await db.processingJob.findMany({ where: { status: 'DEAD' }, include: { file: true } });
for (const d of dead) {
  console.log('job:', d.id, d.type, '| file:', d.fileId, '| storageKey:', d.file?.storageKey, '| revId:', d.file?.revisionId, '| origName:', d.file?.originalName, '| size:', d.file?.size);
}
const orphans = await db.fileObject.findMany({ where: { revisionId: null } });
console.log('orphan files (no revision):', orphans.length, orphans.map(f => f.id + ':' + f.originalName).join(', '));
await db.$disconnect();
