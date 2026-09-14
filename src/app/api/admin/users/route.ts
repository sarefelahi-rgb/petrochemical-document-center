// مدیریت کاربران — فقط مدیر سامانه
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, jsonOk, jsonError, getClientIp } from '@/lib/guard';
import { hashPassword, passwordPolicyError, randomToken } from '@/lib/auth';
import { audit } from '@/lib/audit';

async function requireAdmin() {
  const auth = await requireUser();
  if ('resp' in auth) return auth;
  if (auth.user.role !== 'ADMIN') return { resp: jsonError('این بخش نیازمند نقش مدیر سامانه است.', 403, 'FORBIDDEN') };
  return auth;
}

export async function GET() {
  const auth = await requireAdmin();
  if ('resp' in auth) return auth.resp;
  const users = await db.user.findMany({
    where: { organizationId: auth.user.organizationId },
    select: {
      id: true, username: true, fullName: true, role: true, clearance: true, isActive: true,
      mfaEnabled: true, lastLoginAt: true, isSample: true, lockedUntil: true,
      projectMemberships: { select: { projectId: true, project: { select: { code: true, name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return jsonOk({ users });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('resp' in auth) return auth.resp;
  const body = await req.json().catch(() => null);
  const { username, fullName, role, clearance, projectIds, isSample } = body || {};
  if (!username?.trim() || !fullName?.trim() || !role) return jsonError('نام کاربری، نام کامل و نقش الزامی است.');
  const uname = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(uname)) return jsonError('نام کاربری: ۳ تا ۳۰ نویسه لاتین/عدد/نقطه/خط تیره.');
  const dup = await db.user.findUnique({ where: { username: uname } });
  if (dup) return jsonError('این نام کاربری قبلاً ثبت شده است.', 409, 'DUPLICATE');

  // رمز تصادفی یک‌بارمصرف — نمایش یک‌بار به مدیر؛ تغییر اجباری در اولین ورود
  const tempPassword = `Edc-${randomToken().slice(0, 8)}9`;
  const created = await db.user.create({
    data: {
      username: uname,
      passwordHash: hashPassword(tempPassword),
      fullName: fullName.trim(),
      role,
      clearance: clearance || 'INTERNAL',
      organizationId: auth.user.organizationId,
      mustChangePassword: true,
      mfaEnabled: role === 'ADMIN', // مدیر در اولین ورود MFA ثبت می‌کند
      isSample: Boolean(isSample),
      projectMemberships: Array.isArray(projectIds)
        ? { create: projectIds.filter((pid: string) => typeof pid === 'string').map((pid: string) => ({ projectId: pid })) }
        : undefined,
    },
  });
  await audit({ organizationId: auth.user.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'USER_CREATE', objectType: 'User', objectId: created.id, detail: `username=${uname} role=${role}`, ip: getClientIp(req) });
  return jsonOk({ id: created.id, tempPassword, note: 'این رمز فقط یک‌بار نمایش داده می‌شود. کاربر در اولین ورود موظف به تغییر آن است.' }, 201);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ('resp' in auth) return auth.resp;
  const body = await req.json().catch(() => null);
  const { id, isActive, clearance, role, projectIds, unlock } = body || {};
  if (!id) return jsonError('شناسه کاربر لازم است.');
  const target = await db.user.findUnique({ where: { id } });
  if (!target || target.organizationId !== auth.user.organizationId) return jsonError('کاربر یافت نشد.', 404, 'NOT_FOUND');
  if (target.id === auth.user.id && isActive === false) return jsonError('غیرفعال‌کردن حساب خودتان مجاز نیست.');

  const data: Record<string, unknown> = {};
  if (typeof isActive === 'boolean') data.isActive = isActive;
  if (clearance) data.clearance = clearance;
  if (role) data.role = role;
  if (unlock) { data.lockedUntil = null; data.failedAttempts = 0; }
  await db.user.update({ where: { id }, data });

  if (Array.isArray(projectIds)) {
    await db.projectMember.deleteMany({ where: { userId: id } });
    if (projectIds.length > 0) {
      await db.projectMember.createMany({ data: projectIds.map((pid: string) => ({ userId: id, projectId: pid })) });
    }
  }
  await audit({ organizationId: auth.user.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'USER_UPDATE', objectType: 'User', objectId: id, detail: `fields=${Object.keys(data).join(',') || '-'} projects=${Array.isArray(projectIds) ? projectIds.length : '-'}`, ip: getClientIp(req) });
  return jsonOk({ ok: true });
}
