// توکن دانلود کوتاه‌عمر و یک‌بارمصرف — حافظه‌ای (در تولید چندنودی: جدول DB یا Redis)
import crypto from 'crypto';

const tokens = new Map<string, { fileId: string; userId: string; expiresAt: number; used: boolean }>();

export function issueDownloadToken(fileId: string, userId: string, ttlMs = 2 * 60 * 1000): string {
  const token = crypto.randomBytes(32).toString('hex');
  tokens.set(token, { fileId, userId, expiresAt: Date.now() + ttlMs, used: false });
  for (const [k, v] of tokens) if (v.expiresAt < Date.now()) tokens.delete(k);
  return token;
}

export function consumeDownloadToken(token: string, fileId: string, userId: string): boolean {
  const t = tokens.get(token);
  if (!t || t.used || t.expiresAt < Date.now() || t.fileId !== fileId || t.userId !== userId) return false;
  t.used = true;
  return true;
}
