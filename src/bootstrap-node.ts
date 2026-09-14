// خودترمیم‌سازی هنگام راه‌اندازی — فقط Node.js runtime (با import شرطی از instrumentation.ts)
// وظایف در محیط تازه (از جمله استقرار پیش‌نمایش پلتفرم):
//   ۱) ساخت دایرکتوری‌های runtime (db، data/objectstore و ...)
//   ۲) ساخت کامل جدول‌های پایگاه‌داده از prisma/schema.sql (بدون نیاز به CLI)
//   ۳) بذرکاری: سازمان + ادمین + دادهٔ نمونه تا سلامت‌سنجی deploy پاس شود
// اجرا غیرمسدودکننده: سرور بلافاصله بالا می‌آید؛ بذرکاری در پس‌زمینه انجام می‌شود.

import fs from 'fs';
import path from 'path';

const AUTOBOOT_DELAY_MS = 1200;

export function scheduleBootstrap(): void {
  setTimeout(() => {
    bootstrap().catch((e) => {
      console.error('[bootstrap] خطای خودترمیم‌سازی:', e?.message || e);
    });
  }, AUTOBOOT_DELAY_MS);
}

// یافتن prisma/schema.sql در محیط‌های مختلف (dev، standalone، پوشهٔ تودرتو)
function locateSchemaSql(): string | null {
  const candidates = [
    path.join(process.cwd(), 'prisma', 'schema.sql'),
    path.join(process.cwd(), '..', 'prisma', 'schema.sql'),
    path.join(process.cwd(), 'schema.sql'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

// ساخت جدول‌ها اگر پایگاه‌داده خالی باشد — DDL استاندارد Prisma (CREATE TABLE/INDEX)
async function ensureSchema(db: unknown): Promise<void> {
  const client = db as {
    $queryRawUnsafe: <T>(q: string) => Promise<T>;
    $executeRawUnsafe: (q: string) => Promise<number>;
  };
  const rows = await client.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='User'",
  );
  if (rows && rows.length > 0) return;

  const schemaPath = locateSchemaSql();
  if (!schemaPath) throw new Error('prisma/schema.sql یافت نشد');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // هر دستور با «;» و خط جدید جدا شده؛ کامنت‌های «--» حذف می‌شوند
  const chunks = sql
    .split(/;\s*\n/)
    .map((c) => c.replace(/^--[^\n]*$/gm, '').trim())
    .filter((c) => c.length > 0);

  for (const stmt of chunks) {
    await client.$executeRawUnsafe(stmt);
  }
  console.log(`[bootstrap] ساختار پایگاه‌داده ساخته شد (${chunks.length} دستور DDL).`);
}

export async function bootstrap(): Promise<void> {
  const { db } = await import('./lib/db');

  try {
    // ۰) دایرکتوری‌های runtime — در محیط تازه وجود ندارند
    try {
      const { ensureDirs } = await import('./lib/storage');
      ensureDirs();
    } catch (e) {
      console.error('[bootstrap] ساخت دایرکتوری‌ها ناموفق (غیرمرگ‌آور):', e?.message || e);
    }

    // ۱) جدول‌ها — در پایگاه‌دادهٔ تازه باید کامل ساخته شوند
    await ensureSchema(db);

    // ۲) اگر کاربری وجود دارد، سامانه مقداردهی شده است
    const userCount = await db.user.count();
    if (userCount > 0) return;

    console.log('[bootstrap] پایگاه‌داده خالی است — ساخت سازمان، ادمین و دادهٔ نمونه…');

    // ۳) سازمان
    let org = await db.organization.findFirst();
    if (!org) {
      org = await db.organization.create({ data: { name: 'مجتمع پتروشیمی بندر امام (نمونه)' } });
    }

    // ۴) ادمین — هش scrypt همان قالب src/lib/auth.ts؛ رمز از متغیر محیطی یا مقدار تحویل‌شده
    const crypto = await import('crypto');
    const password = process.env.ADMIN_PASSWORD || 'Admin-Secure-2027x';
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const passwordHash = `scrypt$${salt}$${hash}`;

    await db.user.create({
      data: {
        username: 'admin',
        passwordHash,
        fullName: 'مدیر سامانه',
        role: 'ADMIN',
        clearance: 'RESTRICTED',
        organizationId: org.id,
        mustChangePassword: false,
        mfaEnabled: false,
      },
    });
    console.log('[bootstrap] حساب admin ساخته شد.');

    // ۵) دادهٔ نمونهٔ برچسب‌خورده — تا دستیار و جست‌وجو از ابتدا محتوای واقعی داشته باشند
    if (process.env.SEED_SAMPLE_ON_BOOT !== '0') {
      try {
        const admin = await db.user.findFirst({ where: { username: 'admin' } });
        if (admin) {
          const { createSampleData } = await import('./lib/sampleData');
          const res = await createSampleData(org.id, admin.id);
          console.log('[bootstrap] دادهٔ نمونه ساخته شد:', JSON.stringify(res).slice(0, 300));
        }
      } catch (e) {
        console.error('[bootstrap] بذرکاری دادهٔ نمونه ناموفق (غیرمرگ‌آور):', e?.message || e);
      }
    }
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

scheduleBootstrap();
