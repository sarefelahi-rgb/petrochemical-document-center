// ورود — مرحله ۱: اعتبارسنجی رمز؛ برای مدیران، صدور چالش MFA
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, sha256, createSession, cookieOptions, SESSION_COOKIE } from '@/lib/auth';
import { getClientIp } from '@/lib/guard';
import { rateLimit, resetRateLimit } from '@/lib/settings';
import { audit } from '@/lib/audit';
import crypto from 'crypto';

const MAX_FAILED = 5;
const LOCK_MINUTES = 5;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  // محدودیت نرخ حافظه‌ای در استقرار تولید فعال است؛ در توسعه، قفل حساب (پایگاه داده) کنترل اصلی است
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    const rl = rateLimit(`login:ip:${ip}`, 20, 10 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json({ error: `تلاش‌های زیاد از این نشانی؛ ${rl.retryAfterSec} ثانیه بعد دوباره تلاش کنید.` }, { status: 429 });
    }
  }

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'درخواست نامعتبر است.' }, { status: 400 });
  }
  const username = (body.username || '').trim().toLowerCase();
  const password = body.password || '';
  if (!username || !password) {
    return NextResponse.json({ error: 'نام کاربری و رمز عبور لازم است.' }, { status: 400 });
  }

  if (isProd) {
    const rlUser = rateLimit(`login:user:${username}`, MAX_FAILED + 3, 5 * 60 * 1000);
    if (!rlUser.ok) {
      await audit({ action: 'LOGIN_RATELIMIT', detail: `username=${username}`, ip });
      return NextResponse.json({ error: `تلاش‌های زیاد برای این کاربر؛ چند دقیقه بعد تلاش کنید.` }, { status: 429 });
    }
  }

  const user = await db.user.findUnique({ where: { username } });
  const genericError = 'نام کاربری یا رمز عبور نادرست است.';
  if (!user || !user.isActive) {
    await audit({ action: 'LOGIN_FAILED', detail: `username=${username}`, ip });
    return NextResponse.json({ error: genericError }, { status: 401 });
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const waitSec = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
    return NextResponse.json({ error: `حساب موقتاً قفل است؛ ${waitSec} ثانیه بعد تلاش کنید.` }, { status: 423 });
  }

  if (!verifyPassword(password, user.passwordHash)) {
    const failed = user.failedAttempts + 1;
    const lockedUntil = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null;
    await db.user.update({ where: { id: user.id }, data: { failedAttempts: failed, lockedUntil } });
    await audit({ actorId: user.id, actorName: user.fullName, action: 'LOGIN_FAILED', detail: `attempt=${failed}`, ip });
    if (lockedUntil) {
      return NextResponse.json({ error: `پنج تلاش ناموفق؛ حساب ${LOCK_MINUTES} دقیقه قفل شد.` }, { status: 423 });
    }
    return NextResponse.json({ error: genericError }, { status: 401 });
  }

  await db.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
  resetRateLimit(`login:user:${username}`);
  await audit({ organizationId: user.organizationId, actorId: user.id, actorName: user.fullName, action: 'LOGIN', ip });

  // ورود دومرحله‌ای: فقط در صورت فعال‌بودن تنظیم سامانه (auth.mfaEnabled) — فعلاً غیرفعال
  const { isMfaEnabled } = await import('@/lib/settings');
  if (await isMfaEnabled()) {
    if (user.role === 'ADMIN' || user.mfaEnabled) {
      if (!user.mfaEnabled) {
        // ثبت اولیه MFA: secret یک‌بار نمایش داده می‌شود
        const { generateTotpSecret } = await import('@/lib/totp');
        const secret = generateTotpSecret();
        await db.user.update({ where: { id: user.id }, data: { mfaSecret: secret } });
        const token = crypto.randomBytes(24).toString('hex');
        await db.mfaChallenge.create({
          data: { tokenHash: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
        });
        return NextResponse.json({ mfaEnroll: true, mfaToken: token, mfaSecret: secret });
      }
      const token = crypto.randomBytes(24).toString('hex');
      await db.mfaChallenge.create({
        data: { tokenHash: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
      });
      return NextResponse.json({ mfaRequired: true, mfaToken: token });
    }
  }

  const token = await createSession(user.id, ip, req.headers.get('user-agent') || undefined);
  const resp = NextResponse.json({
    ok: true,
    mustChangePassword: user.mustChangePassword,
    user: { username: user.username, fullName: user.fullName, role: user.role },
  });
  resp.cookies.set(SESSION_COOKIE, token, cookieOptions());
  return resp;
}
