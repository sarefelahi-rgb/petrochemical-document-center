// درخت ساختار: پروژه → ناحیه → واحد (فقط دامنه مجاز کاربر) + شمارش واقعی اسناد
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk } from '@/lib/guard';

export async function GET() {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  if (ctx.projectIds.size === 0) return jsonOk({ projects: [] });

  const projects = await db.project.findMany({
    where: { id: { in: Array.from(ctx.projectIds) }, organizationId: ctx.organizationId },
    include: {
      areas: {
        include: {
          units: {
            include: { _count: { select: { documents: true } } },
          },
        },
      },
    },
    orderBy: { code: 'asc' },
  });

  // شمارش سند هر واحد فقط از اسناد مجاز کاربر (سطح محرمانگی)
  const CLEARANCE_ORDER: Record<string, number> = { PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2, RESTRICTED: 3 };
  const userLevel = CLEARANCE_ORDER[ctx.clearance] ?? 1;
  const docs = await db.document.groupBy({
    by: ['unitId'],
    where: {
      organizationId: ctx.organizationId,
      projectId: { in: Array.from(ctx.projectIds) },
      confidentiality: { in: Object.entries(CLEARANCE_ORDER).filter(([, v]) => v <= userLevel).map(([k]) => k) },
    },
    _count: { id: true },
  });
  const countByUnit = new Map(docs.map((d) => [d.unitId || '', d._count.id]));

  const data = projects.map((p) => ({
    id: p.id, code: p.code, name: p.name,
    areas: p.areas.map((a) => ({
      id: a.id, code: a.code, name: a.name,
      units: a.units.map((u) => ({
        id: u.id, code: u.code, name: u.name,
        docCount: countByUnit.get(u.id) || 0,
      })),
    })),
  }));

  return jsonOk({ projects: data });
}
