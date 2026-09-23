// اجرای یک‌باره: دادهٔ نمونهٔ پیوندی نقشهٔ تعاملی برای پایگاه دادهٔ موجود
import { seedPlantMapSampleData } from '../src/lib/sampleData';
import { db } from '../src/lib/db';

(async () => {
  const org = await db.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!org) { console.error('no organization found'); process.exit(1); }
  const r = await seedPlantMapSampleData(org.id);
  console.log('result:', JSON.stringify(r));
  const tags = await db.assetTag.count();
  const docs = await db.document.count();
  const links = await db.docLink.count({ where: { tagId: { not: null } } });
  console.log(`assetTags=${tags} documents=${docs} tagLinks=${links}`);
  await db.$disconnect();
})();
