// راه‌اندازی اولیه: سازمان + حساب مدیر با رمز تصادفی (بدون رمز ثابت)
// اجرا: bun scripts/seed.ts
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const db = new PrismaClient();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

async function main() {
  const existing = await db.user.findFirst({ where: { role: 'ADMIN', isSample: false } });
  if (existing) {
    console.log('حساب مدیر از قبل وجود دارد. کاری انجام نشد.');
    return;
  }
  const org = await db.organization.create({ data: { name: 'مجتمع پتروشیمی بندر امام (نمونه)' } });
  const password = `Edc-${crypto.randomBytes(6).toString('hex')}-A1`;
  const admin = await db.user.create({
    data: {
      username: 'admin',
      passwordHash: hashPassword(password),
      fullName: 'مدیر سامانه',
      role: 'ADMIN',
      clearance: 'RESTRICTED',
      organizationId: org.id,
      mustChangePassword: true,
      mfaEnabled: false, // در اولین ورود ثبت می‌شود (الزامی)
    },
  });
  // عضویت مدیر در هیچ پروژه‌ای لازم نیست؛ مدیر خودکار به همهٔ پروژه‌های سازمانش دسترسی دارد
  const credFile = path.join(process.cwd(), 'data', 'initial-admin-credentials.txt');
  fs.writeFileSync(credFile, `نام کاربری: admin\nرمز اولیه: ${password}\n\nتوجه: این رمز در اولین ورود باید تغییر کند و MFA ثبت شود.\nاین فایل پس از اولین ورود قابل حذف است.\n`, { mode: 0o600 });
  console.log('سازمان و مدیر اولیه ساخته شد.');
  console.log(`اعتبارنامه اولیه در فایل ${credFile} نوشته شد (رمز تصادفی — بدون رمز ثابت).`);
  console.log(`admin id: ${admin.id}`);
}

main().finally(() => db.$disconnect());
