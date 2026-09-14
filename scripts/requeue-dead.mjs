import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
// بازگرداندن کارهای DEAD به صف (شکست گذرا) — بدون بازنویسی اصلاح انسانی
const dead = await db.processingJob.findMany({ where: { status: 'DEAD' } });
for (const j of dead) {
  await db.processingJob.update({ where: { id: j.id }, data: { status: 'QUEUED', attempts: 0, availableAt: new Date(), error: null } });
  console.log('requeued:', j.id, j.type);
}
await db.$disconnect();
