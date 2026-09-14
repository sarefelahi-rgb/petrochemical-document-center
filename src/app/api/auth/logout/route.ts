// خروج — لغو نشست جاری
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, revokeSession, SESSION_COOKIE, cookieOptions } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { getClientIp } from '@/lib/guard';

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (user) {
    await revokeSession(user.sessionId);
    await audit({ organizationId: user.organizationId, actorId: user.id, actorName: user.fullName, action: 'LOGOUT', ip: getClientIp(req) });
  }
  const resp = NextResponse.json({ ok: true });
  resp.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
  return resp;
}
