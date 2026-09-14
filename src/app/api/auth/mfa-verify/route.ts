// ورود — مرحله ۲: تأیید TOTP؛ ثبت اولیه برای مدیر
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sha256, createSession, cookieOptions, SESSION_COOKIE } from '@/lib/auth';
import { verifyTotp, otpauthUri } from '@/lib/totp';
import { getClientIp } from '@/lib/guard';
import { audit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  let body: { mfaToken?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'درخواست نامعتبر است.' }, { status: 400 });
  }
  const { mfaToken, code } = body;
  if (!mfaToken || !code) {
    return NextResponse.json({ error: 'کد دومرحله‌ای لازم است.' }, { status: 400 });
  }
  const challenge = await db.mfaChallenge.findUnique({ where: { tokenHash: sha256(mfaToken) }, include: { user: true } });
  if (!challenge || challenge.expiresAt < new Date()) {
    return NextResponse.json({ error: 'چالش ورود منقضی شده؛ دوباره وارد شوید.' }, { status: 401 });
  }
  const user = challenge.user;
  if (!user.mfaSecret) {
    return NextResponse.json({ error: 'MFA برای این حساب ثبت نشده است.' }, { status: 400 });
  }
  if (!verifyTotp(user.mfaSecret, code)) {
    await audit({ actorId: user.id, actorName: user.fullName, action: 'MFA_FAILED', ip });
    return NextResponse.json({ error: 'کد دومرحله‌ای نادرست است.' }, { status: 401 });
  }
  // فعال‌سازی MFA پس از ثبت اولیهٔ موفق
  if (!user.mfaEnabled) {
    await db.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    await audit({ organizationId: user.organizationId, actorId: user.id, actorName: user.fullName, action: 'MFA_ENABLED', ip });
  }
  await db.mfaChallenge.delete({ where: { id: challenge.id } });
  const token = await createSession(user.id, ip, req.headers.get('user-agent') || undefined);
  await audit({ organizationId: user.organizationId, actorId: user.id, actorName: user.fullName, action: 'LOGIN_MFA_OK', ip });

  const resp = NextResponse.json({
    ok: true,
    mustChangePassword: user.mustChangePassword,
    otpauthUri: otpauthUri(user.username, user.mfaSecret, 'مرکز اسناد مهندسی'),
    user: { username: user.username, fullName: user.fullName, role: user.role },
  });
  resp.cookies.set(SESSION_COOKIE, token, cookieOptions());
  return resp;
}
