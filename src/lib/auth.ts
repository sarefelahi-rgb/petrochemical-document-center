// احراز هویت نشست‌محور — scrypt، کوکی HttpOnly، انقضای بیکاری و عمر کل، لغو نشست
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';

export const SESSION_COOKIE = 'edc_session';
export const IDLE_TTL_MS = 30 * 60 * 1000; // انقضای بیکاری: ۳۰ دقیقه
export const HARD_TTL_MS = 12 * 60 * 60 * 1000; // عمر کل: ۱۲ ساعت

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, salt, hash] = stored.split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const candidate = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export function sha256(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function passwordPolicyError(pw: string): string | null {
  if (!pw || pw.length < 10) return 'رمز عبور باید حداقل ۱۰ نویسه باشد.';
  if (!/[a-zA-Z]/.test(pw) && !/[\u0600-\u06FF]/.test(pw)) return 'رمز عبور باید حداقل یک حرف داشته باشد.';
  if (!/\d/.test(pw)) return 'رمز عبور باید حداقل یک رقم داشته باشد.';
  return null;
}

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  clearance: string;
  categoryAccess: string | null; // "ALL" | JSON array | null (legacy سطح)
  organizationId: string;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  sessionId: string;
}

// بازیابی کاربر جاری از کوکی؛ در صورت انقضا/لغو null برمی‌گرداند
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = sha256(token);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session || session.revokedAt) return null;
  const now = new Date();
  if (now > session.idleExpiresAt || now > session.hardExpiresAt) return null;
  if (!session.user.isActive) return null;
  // تمدید کنترل‌شدهٔ بیکاری
  const newIdle = new Date(now.getTime() + IDLE_TTL_MS);
  if (newIdle.getTime() - session.idleExpiresAt.getTime() > 60 * 1000) {
    await db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: now, idleExpiresAt: newIdle },
    });
  }
  return {
    id: session.user.id,
    username: session.user.username,
    fullName: session.user.fullName,
    role: session.user.role,
    clearance: session.user.clearance,
    categoryAccess: session.user.categoryAccess ?? null,
    organizationId: session.user.organizationId,
    mustChangePassword: session.user.mustChangePassword,
    mfaEnabled: session.user.mfaEnabled,
    sessionId: session.id,
  };
}

export async function createSession(userId: string, ip?: string, userAgent?: string): Promise<string> {
  const token = randomToken();
  const now = new Date();
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      ip: ip || null,
      userAgent: userAgent?.slice(0, 250) || null,
      idleExpiresAt: new Date(now.getTime() + IDLE_TTL_MS),
      hardExpiresAt: new Date(now.getTime() + HARD_TTL_MS),
    },
  });
  return token;
}

export async function revokeSession(sessionId: string) {
  await db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }).catch(() => {});
}

export async function revokeAllUserSessions(userId: string) {
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
}
