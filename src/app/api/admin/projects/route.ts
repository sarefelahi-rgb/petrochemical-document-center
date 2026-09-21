// مدیریت پروژه‌ها/نواحی/واحدها — فقط مدیر سامانه یا مدیر اسناد
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, jsonOk, jsonError, getClientIp } from '@/lib/guard';
import { audit } from '@/lib/audit';

async function requireManager() {
  const auth = await requireUser();
  if ('resp' in auth) return auth;
  if (!['ADMIN', 'ENG_EXPERT', 'ENG_HEAD'].includes(auth.user.role)) return { resp: jsonError('اجازه مدیریت ساختار پروژه را ندارید.', 403, 'FORBIDDEN') };
  return auth;
}

export async function GET() {
  const auth = await requireManager();
  if ('resp' in auth) return auth.resp;
  const projects = await db.project.findMany({
    where: { organizationId: auth.user.organizationId },
    include: { areas: { include: { units: true } }, _count: { select: { documents: true, memberships: true } } },
    orderBy: { code: 'asc' },
  });
  return jsonOk({ projects });
}

export async function POST(req: NextRequest) {
  const auth = await requireManager();
  if ('resp' in auth) return auth.resp;
  const body = await req.json().catch(() => null);
  const { kind, code, name, projectId, parentId, description } = body || {};

  if (kind === 'project') {
    if (!code?.trim() || !name?.trim()) return jsonError('کد و نام پروژه الزامی است.');
    const dup = await db.project.findFirst({ where: { organizationId: auth.user.organizationId, code: code.trim() } });
    if (dup) return jsonError('پروژه‌ای با این کد وجود دارد.', 409, 'DUPLICATE');
    const created = await db.project.create({
      data: { organizationId: auth.user.organizationId, code: code.trim().toUpperCase(), name: name.trim(), description: description || null },
    });
    await audit({ organizationId: auth.user.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'PROJECT_CREATE', objectType: 'Project', objectId: created.id, ip: getClientIp(req) });
    return jsonOk({ id: created.id }, 201);
  }
  if (kind === 'area') {
    if (!projectId || !code?.trim() || !name?.trim()) return jsonError('پروژه، کد و نام ناحیه الزامی است.');
    const project = await db.project.findFirst({ where: { id: projectId, organizationId: auth.user.organizationId } });
    if (!project) return jsonError('پروژه یافت نشد.', 404);
    const created = await db.area.create({ data: { projectId, code: code.trim().toUpperCase(), name: name.trim() } });
    return jsonOk({ id: created.id }, 201);
  }
  if (kind === 'unit') {
    if (!parentId || !code?.trim() || !name?.trim()) return jsonError('ناحیه، کد و نام واحد الزامی است.');
    const area = await db.area.findFirst({ where: { id: parentId, project: { organizationId: auth.user.organizationId } } });
    if (!area) return jsonError('ناحیه یافت نشد.', 404);
    const created = await db.unit.create({ data: { areaId: parentId, code: code.trim().toUpperCase(), name: name.trim() } });
    return jsonOk({ id: created.id }, 201);
  }
  return jsonError('نوع ساختار نامعتبر است.');
}
