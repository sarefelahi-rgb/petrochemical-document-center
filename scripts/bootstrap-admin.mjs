// بازسازی حساب مدیر با رمز شناخته‌شده (ادامهٔ اعتبارنامهٔ تحویل‌شده به کاربر) + سازمان
// اجرا: bun scripts/bootstrap-admin.mjs
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const db = new PrismaClient();
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin-Secure-2027x';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

const existing = await db.user.findFirst({ where: { role: 'ADMIN', isSample: false } });
if (existing) {
  await db.user.update({ where: { id: existing.id }, data: { passwordHash: hashPassword(PASSWORD), mfaEnabled: false, mustChangePassword: false, isActive: true } });
  console.log('ادمین موجود به‌روزرسانی شد:', existing.username);
} else {
  let org = await db.organization.findFirst();
  if (!org) org = await db.organization.create({ data: { name: 'مجتمع پتروشیمی بندر امام (نمونه)' } });
  await db.user.create({
    data: {
      username: 'admin',
      passwordHash: hashPassword(PASSWORD),
      fullName: 'مدیر سامانه',
      role: 'ADMIN',
      clearance: 'RESTRICTED',
      organizationId: org.id,
      mustChangePassword: false,
      mfaEnabled: false,
    },
  });
  console.log('ادمین ساخته شد (رمز: متغیر محیطی ADMIN_PASSWORD یا مقدار پیش‌فرض تحویل‌شده).');
}
await db.$disconnect();
