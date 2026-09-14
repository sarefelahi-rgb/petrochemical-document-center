// اطلاعات کاربر جاری + قابلیت‌ها
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { db } from '@/lib/db';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError('ابتدا وارد سامانه شوید.', 401, 'UNAUTHENTICATED');
  const ctx = await buildAccessContext(user);
  const org = await db.organization.findUnique({ where: { id: user.organizationId } });
  return jsonOk({
    user: { username: user.username, fullName: user.fullName, role: user.role, clearance: user.clearance, mustChangePassword: user.mustChangePassword },
    orgName: org?.name || '',
    projectCount: ctx.projectIds.size,
  });
}
