#!/usr/bin/env node
// پشتیبان‌گیری هماهنگ — مرحله E
// محتوا: پایگاه داده (SQLite) + اصل فایل‌ها (objectstore/originals) + مشتقات + قرنطینه + فایل اعتبارنامه‌های اولیه
// سیاست §109: نسخهٔ پشتیبان خارج از دسترس مستقیم سامانه نگهداری و با timestamp نام‌گذاری می‌شود.
// توجه: بازیابی فقط با تمرین Restore روی محیط مجزا تأیید می‌شود — موفقیت Backup به‌تنهایی کافی نیست.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'data');
const DB = path.join(ROOT, 'db', 'custom.db');
const BACKUP_ROOT = process.env.BACKUP_DIR || path.join(DATA, 'backups');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(BACKUP_ROOT, `backup-${stamp}`);
fs.mkdirSync(dest, { recursive: true });

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) n += copyDir(s, d);
    else { fs.copyFileSync(s, d); n++; }
  }
  return n;
}

// ۱) پایگاه داده — با دستور پشتیبان‌گیری SQLite برای سازگاری (safe copy)
const dbDest = path.join(dest, 'database');
fs.mkdirSync(dbDest, { recursive: true });
try {
  execSync(`sqlite3 "${DB}" ".backup '${path.join(dbDest, 'custom.db')}'"`, { stdio: 'pipe' });
  console.log('DB backup: sqlite3 .backup OK');
} catch {
  fs.copyFileSync(DB, path.join(dbDest, 'custom.db'));
  console.log('DB backup: raw copy (sqlite3 CLI not found — برنامه‌ریزی تولید: sqlite3 نصب شود)');
}

// ۲) مخزن اشیا
const objDest = path.join(dest, 'objectstore');
const originals = copyDir(path.join(DATA, 'objectstore', 'originals'), path.join(objDest, 'originals'));
const derivatives = copyDir(path.join(DATA, 'objectstore', 'derivatives'), path.join(objDest, 'derivatives'));
const quarantine = copyDir(path.join(DATA, 'quarantine'), path.join(dest, 'quarantine'));
copyDir(path.join(DATA, 'tessdata'), path.join(dest, 'tessdata'));

// ۳) مانیفست + checksum
const { createHash } = await import('crypto');
function hashFile(p) {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
const dbFile = path.join(dbDest, 'custom.db');
const manifest = {
  createdAt: new Date().toISOString(),
  db: { path: 'database/custom.db', sha256: fs.existsSync(dbFile) ? hashFile(dbFile) : null },
  objectstore: { originals, derivatives },
  quarantine: { files: quarantine },
  counts: {},
};
fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`Backup OK → ${dest}`);
console.log(`  originals=${originals} derivatives=${derivatives} quarantine=${quarantine}`);
console.log('یادآوری: بازیابی باید روی محیط مجزا تمرین شود (scripts/restore.mjs).');
