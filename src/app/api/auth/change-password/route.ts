// تغییر رمز — اجباری در اولین ورود؛ پس از تغییر، همهٔ نشست‌ها لغو و ورود مجدد لازم است
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser, hashPassword, verifyPassword, passwordPolicyError, revokeAllUserSessions, SESSION_COOKIE, cookieOptions } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { getClientIp } from '@/lib/guard';

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'ابتدا وارد سامانه شوید.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { currentPassword, newPassword } = body as { currentPassword?: string; newPassword?: string };
  const dbUser = await db.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return NextResponse.json({ error: 'کاربر یافت نشد.' }, { status: 404 });

  if (!verifyPassword(currentPassword || '', dbUser.passwordHash)) {
    return NextResponse.json({ error: 'رمز فعلی نادرست است.' }, { status: 403 });
  }
  const policyErr = passwordPolicyError(newPassword || '');
  if (policyErr) return NextResponse.json({ error: policyErr }, { status: 400 });
  if (verifyPassword(newPassword || '', dbUser.passwordHash)) {
    return NextResponse.json({ error: 'رمز جدید نباید با رمز فعلی یکسان باشد.' }, { status: 400 });
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(newPassword!), mustChangePassword: false },
  });
  await audit({ organizationId: user.organizationId, actorId: user.id, actorName: user.fullName, action: 'PASSWORD_CHANGED', ip: getClientIp(req) });
  // لغو همهٔ نشست‌ها؛ کاربر دوباره وارد می‌شود
  await revokeAllUserSessions(user.id);
  const resp = NextResponse.json({ ok: true, relogin: true });
  resp.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
  return resp;
}
