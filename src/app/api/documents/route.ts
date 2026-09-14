// فهرست اسناد با فیلتر — همهٔ Queryها با فیلتر اجباری سازمان/پروژه‌های مجاز (انزوای داده)
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can, allowedCategoriesFor } from '@/lib/permissions';
import { normalizeCode, normalizeFa, candidateCodes, digitVariants } from '@/lib/normalize';

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);

  if (ctx.projectIds.size === 0) return jsonOk({ items: [], total: 0 });

  const sp = req.nextUrl.searchParams;
  const q = sp.get('q')?.trim() || '';
  const projectId = sp.get('projectId') || '';
  const unitId = sp.get('unitId') || '';
  const discipline = sp.get('discipline') || '';
  const docType = sp.get('docType') || '';
  const status = sp.get('status') || '';
  const confidentiality = sp.get('confidentiality') || '';
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(10, parseInt(sp.get('pageSize') || '25', 10) || 25));

  const allowed = Array.from(ctx.projectIds);
  // اگر projectId صریحاً خارج از دامنه مجاز بود، نتیجه خالی است (نه جایگزینی با دامنه مجاز)
  if (projectId && !allowed.includes(projectId)) {
    return jsonOk({ items: [], total: 0, page: 1, pageSize });
  }
  const projectFilter = projectId || undefined;

  const where: Record<string, unknown> = {
    organizationId: ctx.organizationId,
    projectId: projectFilter ? projectFilter : { in: allowed },
    // دسته‌بندی‌های محرمانگی مجاز کاربر (چندگزینه‌ای/همه) — منع پیش‌فرض
    confidentiality: { in: allowedCategoriesFor(ctx) },
  };
  if (unitId) where.unitId = unitId;
  if (discipline) where.discipline = discipline;
  if (docType) where.docType = docType;
  if (status) where.status = status;
  if (confidentiality) where.confidentiality = confidentiality;

  // جست‌وجو: دقیق روی شماره (نرمال‌شده، توکن‌به‌توکن) یا واژگانی روی عنوان
  // ارقام فارسی/لاتین معادل‌اند؛ بزرگ/کوچکی حروف لاتین تفکیک نمی‌شود
  if (q) {
    const codes = candidateCodes(q);
    const faQ = normalizeFa(q);
    const titleVariants = Array.from(new Set(digitVariants(faQ).flatMap((v) => [v, v.toLowerCase()]))).slice(0, 4);
    where.OR = [
      ...codes.map((c) => ({ docNumber: { contains: c } })),
      ...titleVariants.map((v) => ({ title: { contains: v } })),
    ];
  }

  const [total, rows] = await Promise.all([
    db.document.count({ where }),
    db.document.findMany({
      where,
      include: {
        project: { select: { code: true, name: true } },
        unit: { select: { code: true, name: true, area: { select: { code: true, name: true } } } },
        revisions: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, revisionCode: true, status: true } },
        docLinks: { take: 8, select: { linkType: true, rawRef: true, linkStatus: true, assetTag: { select: { tag: true } }, line: { select: { lineNumber: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const items = rows.map((d) => ({
    id: d.id,
    docNumber: d.docNumber,
    title: d.title,
    discipline: d.discipline,
    docType: d.docType,
    project: d.project,
    unit: d.unit ? { code: d.unit.code, name: d.unit.name, area: d.unit.area } : null,
    confidentiality: d.confidentiality,
    status: d.status,
    processingStatus: d.processingStatus,
    extractionStatus: d.extractionStatus,
    engineeringStatus: d.engineeringStatus,
    latestRevision: d.revisions[0] || null,
    links: d.docLinks.map((l) => ({
      type: l.linkType,
      ref: l.rawRef || l.assetTag?.tag || l.line?.lineNumber || '',
      status: l.linkStatus,
    })),
    isSample: d.isSample,
    updatedAt: d.updatedAt,
  }));

  return jsonOk({ items, total, page, pageSize });
}

// ایجاد شناسنامه سند
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  if (!can(ctx, 'doc:upload')) return jsonError('اجازه ایجاد سند را ندارید.', 403, 'FORBIDDEN');

  const body = await req.json().catch(() => null);
  if (!body) return jsonError('درخواست نامعتبر است.');
  const { docNumber, title, projectId, discipline, docType, unitId, confidentiality } = body as Record<string, string>;
  if (!docNumber?.trim() || !title?.trim() || !projectId) {
    return jsonError('شماره سند، عنوان و پروژه الزامی است.');
  }
  if (!ctx.projectIds.has(projectId)) return jsonError('پروژه انتخاب‌شده در دامنه دسترسی شما نیست.', 403, 'FORBIDDEN');

  const docNumberNorm = normalizeCode(docNumber.trim());
  const dup = await db.document.findFirst({
    where: { organizationId: ctx.organizationId, projectId, docNumber: docNumberNorm },
  });
  if (dup) {
    return jsonError(`در این پروژه سندی با شماره «${docNumberNorm}» ثبت شده است. شماره سند در دامنه پروژه یکتاست.`, 409, 'DUPLICATE');
  }

  const created = await db.document.create({
    data: {
      organizationId: ctx.organizationId,
      projectId,
      docNumber: docNumberNorm,
      docNumberRaw: docNumber.trim(),
      title: title.trim(),
      discipline: discipline || 'UNK',
      docType: docType || 'OTHER',
      unitId: unitId || null,
      confidentiality: confidentiality || 'INTERNAL',
      status: 'RECEIVED',
      createdById: auth.user.id,
    },
  });

  await import('@/lib/audit').then((m) => m.audit({
    organizationId: ctx.organizationId,
    actorId: auth.user.id,
    actorName: auth.user.fullName,
    action: 'DOC_CREATE',
    objectType: 'Document',
    objectId: created.id,
    detail: `docNumber=${created.docNumber} project=${projectId}`,
  }));

  return jsonOk({ id: created.id, docNumber: created.docNumber }, 201);
}
