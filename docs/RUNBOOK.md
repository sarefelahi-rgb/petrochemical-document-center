# RUNBOOK — بهره‌برداری، پشتیبان‌گیری و بازیابی

## معماری در یک نگاه
- رابط/API: Next.js (پورت ۳۰۰۰) — `./node_modules/.bin/next dev -p 3000`
- Worker پردازش اسناد (OCR/Thumbnail/Text/TitleBlock): `bun worker/worker.ts`
- پایگاه داده: SQLite در `db/custom.db` (تولید: PostgreSQL توصیه می‌شود)
- مخزن فایل: `data/objectstore/originals/` (اصل تغییرناپذیر SHA-256) + `derivatives/`
- قرنطینه: `data/quarantine/` | دادهٔ زبان OCR: `data/tessdata/` (fas+eng)
- صفحه وضعیت قابلیت‌ها: `GET /api/system/status` (صادقانه؛ نصب‌نشده‌ها «نیازمند اتصال»)

## پشتیبان‌گیری
```bash
node scripts/backup.mjs                 # مقصد پیش‌فرض: data/backups/backup-<timestamp>/
BACKUP_DIR=/srv/backups node scripts/backup.mjs
```
محتوا: DB (با `sqlite3 .backup`)، اصل فایل‌ها، مشتقات، قرنطینه، tessdata + `manifest.json` با SHA-256.
- در cron (نمونه، روزانه ۰۲:۳۰): `30 2 * * * cd /path/to/app && BACKUP_DIR=/srv/backups node scripts/backup.mjs >> data/backups/backup.log 2>&1`
- نسخهٔ پشتیبان را خارج از دسترس مستقیم سامانه نگه دارید (دیسک/آبجکت‌استور جدا؛ ترجیحاً تغییرناپذیر).
- موفقیت Backup به‌تنهایی کافی نیست — تمرین Restore الزامی است.

## بازیابی (فقط محیط مجزا/آزمایشی)
```bash
node scripts/restore.mjs <مسیر پشتیبان> --dry-run   # ابتدا آزمایشی
node scripts/restore.mjs <مسیر پشتیبان>             # واقعی
```
پس از بازیابی: سرور و Worker را ری‌استارت کنید و دستی این موارد را بیازمایید:
۱) ورود و فهرست اسناد  ۲) پیش‌نمایش یک PDF  ۳) یک پرسش از دستیار  ۴) جست‌وجوی متن صفحه

## عملیات روزانه
- سلامت Worker: `GET /api/system/status` → `worker.alive` و شمارش صف (queued/running/dead)
- کارهای مرده: پنل مدیریت ← پردازش، یا `scripts/requeue-dead.mjs`
- رویداد حسابرسی: پنل مدیریت ← حسابرسی (بدون محتوای محرمانه در لاگ)

## امنیت
- رمز ادمین اولیه: `data/initial-admin-credentials.txt` — پس از استقرار سازمانی حذف شود
- ورود دومرحله‌ای (MFA/TOTP): با کلید «پنل مدیریت ← تنظیمات» فعال/غیرفعال می‌شود؛ **توصیهٔ تولید: روشن**
- نشست‌ها: انقضای بیکاری + عمر کل؛ تغییر رمز همهٔ نشست‌ها را لغو می‌کند
- دانلود فقط با توکن یک‌بارمصرف (۲ دقیقه)؛ قرنطینهٔ فایل با امضای نامعتبر خودکار است

## محدودیت‌های شناخته‌شده (صادقانه)
- توسعه تک‌نودی با SQLite و صف پایگاه‌داده‌ای؛ چندنودی: صف با Workerهای متعدد قابل مصرف است
- Embedding معنایی و تبدیل CAD و OIDC/SAML: «نیازمند اتصال» — در `/api/system/status` دیده می‌شود
