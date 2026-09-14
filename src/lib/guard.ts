// کمکی‌های API: پاسخ یکسان، گارد دسترسی، ساخت AccessContext با عضویت صریح پروژه
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser, SessionUser } from '@/lib/auth';
import { AccessContext, can as canCap, canViewDocument } from '@/lib/permissions';

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: message, code: code || 'ERROR' }, { status });
}

export async function requireUser(): Promise<{ user: SessionUser } | { resp: NextResponse }> {
  const user = await getSessionUser();
  if (!user) return { resp: jsonError('ابتدا وارد سامانه شوید.', 401, 'UNAUTHENTICATED') };
  return { user };
}

// AccessContext با فهرست صریح پروژه‌های مجاز — منع پیش‌فرض
export async function buildAccessContext(user: SessionUser): Promise<AccessContext> {
  const memberships = await db.projectMember.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  });
  const projectIds = new Set(memberships.map((m) => m.projectId));
  // مدیر سامانه عضویت خودکار در همهٔ پروژه‌های سازمان خودش دارد (نه سازمان‌های دیگر)
  if (user.role === 'ADMIN') {
    const orgProjects = await db.project.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true },
    });
    for (const p of orgProjects) projectIds.add(p.id);
  }
  return {
    role: user.role,
    clearance: user.clearance,
    categoryAccess: user.categoryAccess ?? null,
    organizationId: user.organizationId,
    projectIds,
  };
}

export function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}

export { canCap as can, canViewDocument };
