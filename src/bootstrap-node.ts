// خودترمیم‌سازی هنگام راه‌اندازی — فقط Node.js runtime (با import شرطی از instrumentation.ts)
// اگر پایگاه‌داده خالی باشد: سازمان + ادمین + دادهٔ نمونه ساخته می‌شود تا سامانه در هر محیط تازه
// (از جمله استقرار پیش‌نمایش پلتفرم) بلافاصله قابل استفاده باشد و سلامت‌سنجی پاس شود.
// اجرا غیرمسدودکننده: سرور بلافاصله بالا می‌آید؛ بذرکاری در پس‌زمینه انجام می‌شود.

const AUTOBOOT_DELAY_MS = 1500;

export function scheduleBootstrap(): void {
  setTimeout(() => {
    bootstrap().catch((e) => {
      console.error('[bootstrap] خطای خودترمیم‌سازی:', e?.message || e);
    });
  }, AUTOBOOT_DELAY_MS);
}

export async function bootstrap(): Promise<void> {
  const { db } = await import('./lib/db');

  try {
    // ۱) اگر کاربری وجود دارد، سامانه مقداردهی شده است
    const userCount = await db.user.count();
    if (userCount > 0) return;

    console.log('[bootstrap] پایگاه‌داده خالی است — ساخت سازمان، ادمین و دادهٔ نمونه…');

    // ۲) سازمان
    let org = await db.organization.findFirst();
    if (!org) {
      org = await db.organization.create({ data: { name: 'مجتمع پتروشیمی بندر امام (نمونه)' } });
    }

    // ۳) ادمین — هش scrypt همان قالب src/lib/auth.ts؛ رمز از متغیر محیطی یا مقدار تحویل‌شده
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

    // ۴) دادهٔ نمونهٔ برچسب‌خورده — تا دستیار و جست‌وجو از ابتدا محتوای واقعی داشته باشند
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
