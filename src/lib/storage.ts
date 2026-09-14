// مخزن فایل پایدار — اصل تغییرناپذیر + مشتقات جدا + SHA-256
// Adapter: دیسک محلی (استقرار نمونه). برای تولید: مخزن سازگار با S3 طبق سند
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_ROOT = path.join(process.cwd(), 'data');
export const OBJECT_ROOT = path.join(DATA_ROOT, 'objectstore');
export const QUARANTINE_ROOT = path.join(DATA_ROOT, 'quarantine');
export const TMP_ROOT = path.join(DATA_ROOT, 'tmp');

export function ensureDirs() {
  for (const d of [OBJECT_ROOT, QUARANTINE_ROOT, TMP_ROOT]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// ذخیره اصل: مسیر بر اساس SHA-256 (تغییرناپذیر، قابلیت دی‌دوپ)
export async function storeOriginal(tmpPath: string, orgId: string, originalName: string): Promise<{
  storageKey: string; sha256: string; size: number;
}> {
  ensureDirs();
  const sha = await sha256File(tmpPath);
  const size = fs.statSync(tmpPath).size;
  const ext = path.extname(originalName).toLowerCase().slice(0, 12) || '.bin';
  const storageKey = path.posix.join('originals', orgId, sha.slice(0, 2), `${sha}${ext}`);
  const abs = path.join(OBJECT_ROOT, storageKey);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (!fs.existsSync(abs)) {
    fs.copyFileSync(tmpPath, abs); // اصل: کپی اتمیک؛ tmp حذف می‌شود
  }
  return { storageKey, sha256: sha, size };
}

export function storeDerivative(orgId: string, name: string, content: Buffer): string {
  ensureDirs();
  const sha = crypto.createHash('sha256').update(content).digest('hex');
  const storageKey = path.posix.join('derivatives', orgId, sha.slice(0, 2), `${sha}-${name}`);
  const abs = path.join(OBJECT_ROOT, storageKey);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return storageKey;
}

export function readObject(storageKey: string): Buffer {
  const abs = path.join(OBJECT_ROOT, storageKey);
  // جلوگیری از Path Traversal
  const resolved = path.resolve(abs);
  if (!resolved.startsWith(path.resolve(OBJECT_ROOT))) throw new Error('invalid path');
  return fs.readFileSync(resolved);
}

export function quarantineFile(tmpPath: string, originalName: string): string {
  ensureDirs();
  const key = path.posix.join(`${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${path.basename(originalName).slice(0, 80)}`);
  const abs = path.join(QUARANTINE_ROOT, key);
  fs.copyFileSync(tmpPath, abs);
  return path.posix.join('quarantine', key);
}

export function objectExists(storageKey: string): boolean {
  try {
    return fs.existsSync(path.join(OBJECT_ROOT, storageKey));
  } catch { return false; }
}
