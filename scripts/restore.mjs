#!/usr/bin/env node
// بازیابی از پشتیبان — فقط روی محیط مجزا/آزمایشی اجرا شود (سیاست §109)
// استفاده: node scripts/restore.mjs <مسیر پشتیبان> [--dry-run]
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const backupDir = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!backupDir || !fs.existsSync(backupDir)) {
  console.error('مسیر پشتیبان معتبر بدهید: node scripts/restore.mjs <مسیر> [--dry-run]');
  process.exit(1);
}
const manifestPath = path.join(backupDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('manifest.json یافت نشد — پشتیبان ناقص است.');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
console.log(`Restore ${dryRun ? '(DRY-RUN)' : ''} از پشتیبان ${manifest.createdAt}`);

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) n += copyDir(s, d);
    else {
      if (!dryRun) { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); }
      n++;
    }
  }
  return n;
}

const dbSrc = path.join(backupDir, 'database', 'custom.db');
const dbDst = path.join(ROOT, 'db', 'custom.db');
if (fs.existsSync(dbSrc)) {
  if (!dryRun) fs.copyFileSync(dbSrc, dbDst);
  console.log(`DB ${dryRun ? '[خواهد رفت]' : 'بازیابی شد'} → ${dbDst}`);
}
const obj = copyDir(path.join(backupDir, 'objectstore'), path.join(ROOT, 'data', 'objectstore'));
const q = copyDir(path.join(backupDir, 'quarantine'), path.join(ROOT, 'data', 'quarantine'));
console.log(`objectstore=${obj} quarantine=${q} ${dryRun ? '[آزمایشی]' : 'بازیابی شد'}`);
console.log('پس از بازیابی: سرور و Worker را ری‌استارت کنید و یک پرسش دستی از جست‌وجو/پیش‌نمایش را بیازمایید.');
