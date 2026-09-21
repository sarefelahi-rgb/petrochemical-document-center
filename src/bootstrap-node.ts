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
      console.error('[bootstrap] خطای خودترمیم‌سازی:', (e as Error)?.message || e);
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

// ساخت جدول‌ها — idempotent: هر بار اجرا می‌شود؛ جدول/ایندکس موجود دست نمی‌خورد
// (CREATE IF NOT EXISTS) تا جدول‌های جاافتاده در پایگاه‌دادهٔ نسخه‌های پیشین هم ساخته شوند
async function ensureSchema(db: unknown): Promise<void> {
  const client = db as {
    $queryRawUnsafe: <T>(q: string) => Promise<T>;
    $executeRawUnsafe: (q: string) => Promise<number>;
  };

  const schemaPath = locateSchemaSql();
  if (!schemaPath) throw new Error('prisma/schema.sql یافت نشد');
  const raw = fs.readFileSync(schemaPath, 'utf8');
  const sql = raw
    .replace(/CREATE TABLE /g, 'CREATE TABLE IF NOT EXISTS ')
    .replace(/CREATE UNIQUE INDEX /g, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
    .replace(/CREATE INDEX /g, 'CREATE INDEX IF NOT EXISTS ');

  // هر دستور با «;» و خط جدید جدا شده؛ کامنت‌های «--» حذف می‌شوند
  const chunks = sql
    .split(/;\s*\n/)
    .map((c) => c.replace(/^--[^\n]*$/gm, '').trim())
    .filter((c) => c.length > 0);

  let created = 0;
  const before = await client.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type='table'",
  );
  const tablesBefore = new Set(before.map((r) => r.name));

  for (const stmt of chunks) {
    try {
      await client.$executeRawUnsafe(stmt);
    } catch (e) {
      // «جدول از قبل هست» در حالت عادی با IF NOT EXISTS رخ نمی‌دهد؛ بی‌خطر رد می‌شود
      if (!/already exists/i.test((e as Error)?.message || '')) throw e;
    }
  }

  const after = await client.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type='table'",
  );
  created = after.filter((r) => !tablesBefore.has(r.name)).length;
  if (created > 0) console.log(`[bootstrap] ${created} جدول جاافتاده ساخته شد.`);
}

// همگام‌سازی ستون‌ها — اگر پایگاه‌دادهٔ قدیمی فاقد ستون‌های schema.sql باشد (drift)،
// ستون‌های جاافتاده با ALTER TABLE اضافه می‌شوند؛ پایگاه‌داده هر نسخه‌ای خودترمیم می‌شود
async function syncColumns(client: {
  $queryRawUnsafe: <T>(q: string) => Promise<T>;
  $executeRawUnsafe: (q: string) => Promise<number>;
}): Promise<void> {
  const schemaPath = locateSchemaSql();
  if (!schemaPath) return;
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const tableRe = /CREATE TABLE "([A-Za-z]+)" \(([\s\S]*?)\n\);/g;
  let added = 0;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(sql)) !== null) {
    const table = m[1];
    const body = m[2];
    let cols: Array<{ name: string }>;
    try {
      cols = await client.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info('${table}')`);
    } catch { continue; }
    if (!Array.isArray(cols) || cols.length === 0) continue; // جدول نیست → ensureSchema می‌سازد
    const existing = new Set(cols.map((c) => c.name));
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim().replace(/,$/, '');
      const col = /^"([A-Za-z]+)"\s+(.+)$/.exec(line);
      if (!col) continue; // CONSTRAINT یا خط دیگر
      const [, name, def] = col;
      if (existing.has(name)) continue;
      // NOT NULL بدون DEFAULT روی جدول پرشده قابل افزودن نیست — رد می‌شود (ستون‌های کلید از ابتدا وجود دارند)
      if (/\bNOT NULL\b/.test(def) && !/\bDEFAULT\b/.test(def)) {
        console.warn(`[bootstrap] ستون «${table}.${name}» NOT NULL بدون DEFAULT — افزودن خودکار ممکن نیست.`);
        continue;
      }
      await client.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${def}`);
      added += 1;
    }
  }
  if (added > 0) console.log(`[bootstrap] ${added} ستون جاافتاده به پایگاه‌داده اضافه شد.`);
}

// مهاجرت‌های سبک و قدرتی (idempotent) — روی پایگاه‌دادهٔ موجود هم اجرا می‌شود
async function runMigrations(db: unknown): Promise<void> {
  const client = db as {
    $queryRawUnsafe: <T>(q: string) => Promise<T>;
    $executeRawUnsafe: (q: string) => Promise<number>;
    user: { updateMany: (a: unknown) => Promise<unknown> };
    setting: {
      updateMany: (a: unknown) => Promise<unknown>;
      findUnique: (a: unknown) => Promise<{ value?: string } | null>;
      upsert: (a: unknown) => Promise<unknown>;
    };
    document: { findMany: (a: unknown) => Promise<Array<{ id: string; title: string; docNumber: string; docNumberRaw: string | null }>>; update: (a: unknown) => Promise<unknown> };
  };

  try {
    const step = async (name: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (e) { console.error(`[bootstrap] مهاجرت «${name}» ناموفق:`, (e as Error)?.message || e); }
    };

    // الف) مهاجرت نقش‌های قدیمی → ۶ نقش رسمی (تصمیم بهره‌بردار ۱۴۰۵)
    const roleMap: Array<[string, string[]]> = [
      ['ENG_EXPERT', ['ENGINEER', 'AUDITOR']],
      ['ENG_HEAD', ['APPROVER']],
      ['TECH_HEAD', ['REVIEWER']],
      ['OFFICE_MGR', ['OPERATOR', 'DOC_CONTROLLER']],
    ];
    for (const [next, olds] of roleMap) {
      await step(`role:${next}`, async () => {
        const r = await client.user.updateMany({ where: { role: { in: olds } }, data: { role: next } }) as { count?: number };
        if ((r?.count ?? 0) > 0) console.log(`[bootstrap] مهاجرت نقش: ${olds.join('/')} → ${next}`);
      });
    }

    // ب) مهاجرت نام سامانه — فقط اگر هنوز مقدار پیشین ذخیره شده باشد
    await step('app.name', async () => {
      const { APP_NAME, LEGACY_APP_NAMES } = await import('./lib/app-name');
      await client.setting.updateMany({ where: { key: 'app.name', value: { in: LEGACY_APP_NAMES } }, data: { value: APP_NAME } });
    });

    // ب۲) نام سازمان نمونهٔ پیشین → نام واحد بهره‌بردار (فقط برای مقدار placeholder)
    await step('org.name', async () => {
      const orgRows = await client.$queryRawUnsafe<Array<{ id: string; name: string }>>("SELECT id, name FROM Organization WHERE name IN ('مجتمع پتروشیمی بندر امام (نمونه)', 'مجتمع نمونه')");
      if (Array.isArray(orgRows) && orgRows.length > 0) {
        await client.$executeRawUnsafe("UPDATE Organization SET name = 'اداره مهندسی عمومی فراورش یک' WHERE id IN (" + orgRows.map((r) => `'${r.id.replace(/'/g, '')}'`).join(',') + ')');
        console.log('[bootstrap] نام سازمان به «اداره مهندسی عمومی فراورش یک» به‌روزرسانی شد.');
      }
    });

    // ج) همگام‌سازی ستون‌های جاافتاده همهٔ جدول‌ها (شامل searchNorm و هر drift دیگری)
    await step('columns:sync', async () => {
      await syncColumns(client);
    });

    // د) نمایهٔ جست‌وجوی فراگیر — بازسازی کامل هنگام تغییر فرمت (v2 = فشرده بی‌فاصله) یا اسنادِ فاقد نمایه
    await step('searchNorm:backfill', async () => {
      const { buildSearchNorm } = await import('./lib/normalize');
      const INDEX_VERSION = 'compact-v2';
      const marker = await client.setting.findUnique({ where: { key: 'searchNorm.indexVersion' } });
      const needsFullRebuild = marker?.value !== INDEX_VERSION;
      const missing = needsFullRebuild
        ? await client.document.findMany({ select: { id: true, title: true, docNumber: true, docNumberRaw: true }, take: 2000 })
        : await client.document.findMany({ where: { searchNorm: null }, select: { id: true, title: true, docNumber: true, docNumberRaw: true }, take: 500 });
      for (const d of missing) {
        await client.document.update({
          where: { id: d.id },
          data: { searchNorm: buildSearchNorm([d.title, d.docNumber, d.docNumberRaw]) },
        });
      }
      if (missing.length > 0) {
        await client.setting.upsert({ where: { key: 'searchNorm.indexVersion' }, update: { value: INDEX_VERSION }, create: { key: 'searchNorm.indexVersion', value: INDEX_VERSION } });
        console.log(`[bootstrap] نمایهٔ جست‌وجوی ${missing.length} سند ${needsFullRebuild ? '(بازسازی کامل)' : 'ساخته'} شد.`);
      }
    });
  } catch (e) {
    console.error('[bootstrap] مهاجرت‌ها ناموفق (غیرمرگ‌آور):', (e as Error)?.message || e);
  }
}

export async function bootstrap(): Promise<void> {
  const { db } = await import('./lib/db');

  try {
    // ۰) دایرکتوری‌های runtime — در محیط تازه وجود ندارند
    try {
      const { ensureDirs } = await import('./lib/storage');
      ensureDirs();
    } catch (e) {
      console.error('[bootstrap] ساخت دایرکتوری‌ها ناموفق (غیرمرگ‌آور):', (e as Error)?.message || e);
    }

    // ۱) جدول‌ها — در پایگاه‌دادهٔ تازه باید کامل ساخته شوند
    await ensureSchema(db);

    // ۱.۵) مهاجرت‌های سبک — همیشه قبل از خروج زودهنگام اجرا می‌شود
    await runMigrations(db);

    // ۲) اگر کاربری وجود دارد، سامانه مقداردهی شده است
    const userCount = await db.user.count();
    if (userCount > 0) return;

    console.log('[bootstrap] پایگاه‌داده خالی است — ساخت سازمان، ادمین و دادهٔ نمونه…');

    // ۳) سازمان
    let org = await db.organization.findFirst();
    if (!org) {
      org = await db.organization.create({ data: { name: 'اداره مهندسی عمومی فراورش یک' } });
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
        console.error('[bootstrap] بذرکاری دادهٔ نمونه ناموفق (غیرمرگ‌آور):', (e as Error)?.message || e);
      }
    }
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

scheduleBootstrap();
