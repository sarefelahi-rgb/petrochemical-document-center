// پرونده تجهیز / خط — جمع‌آوری مدارک مرتبط با یک Tag یا Line (مرحله C)
// خروجی گروه‌بندی‌شده بر اساس نوع مدرک؛ روابط پیشنهادی و تأییدشده با برچسب متفاوت (سیاست §68)
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { normalizeFa } from '@/lib/normalize';
import { audit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const ref = (req.nextUrl.searchParams.get('ref') || '').trim();
  if (!ref) return jsonError('Tag تجهیز یا شماره خط را وارد کنید.');
  const norm = normalizeFa(ref).toUpperCase();

  const allowedConf = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'].slice(
    0, ({ PUBLIC: 1, INTERNAL: 2, CONFIDENTIAL: 3, RESTRICTED: 4 } as Record<string, number>)[ctx.clearance] || 2,
  );

  // یافتن تجهیز یا خط
  const tag = await db.assetTag.findFirst({ where: { OR: [{ tag: { contains: norm } }, { tag: ref }] } });
  const line = await db.line.findFirst({ where: { lineNumber: { contains: norm } }, include: { unit: { include: { area: { include: { project: true } } } } } });

  // مجوز: خط باید در پروژهٔ مجاز باشد
  const allowedProjects = Array.from(ctx.projectIds);
  const lineAllowed = line ? allowedProjects.includes(line.unit.area.project.id) : false;
  const lineVisible = lineAllowed ? line : null;

  // مدارک مرتبط — فقط پروژه‌های مجاز + محرمانگی مجاز
  const links = await db.docLink.findMany({
    where: {
      OR: [
        ...(tag ? [{ tagId: tag.id }] : []),
        ...(lineVisible ? [{ lineId: lineVisible.id }] : []),
        { rawRef: { contains: norm } },
      ],
      document: { organizationId: ctx.organizationId, projectId: { in: allowedProjects }, confidentiality: { in: allowedConf } },
    },
    include: {
      document: { include: { project: { select: { code: true } }, revisions: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, revisionCode: true, status: true } } } },
      assetTag: true, line: true,
    },
    take: 60,
  });

  if (!tag && !lineVisible && links.length === 0) {
    return jsonOk({ found: false, ref, message: 'تجهیز یا خطی با این شناسه در دامنهٔ دسترسی شما یافت نشد. ممکن است ثبت نشده یا خارج از پروژه‌های مجاز شما باشد.' });
  }

  // گروه‌بندی بر اساس نوع مدرک
  const TYPE_LABELS: Record<string, string> = {
    ISOMETRIC: 'ایزومتریک', PID: 'P&ID', PFD: 'PFD', GA: 'نقشهٔ GA', FABRICATION: 'نقشهٔ ساخت',
    DATASHEET: 'دیتاشیت', VENDOR: 'مدارک فروشنده', INSPECTION: 'بازرسی', TEST: 'تست', SUPPORT: 'ساپورت و تنش',
    LAYOUT: 'لی‌اوت', STRESS: 'تنش', SPEC: 'مشخصات فنی', MTO: 'MTO/BOM', OTHER: 'سایر',
  };
  const groupsMap = new Map<string, Array<Record<string, unknown>>>();
  let suggested = 0, confirmed = 0;
  for (const l of links) {
    const d = l.document;
    if (!d) continue;
    if (l.linkStatus === 'CONFIRMED') confirmed++; else suggested++;
    const g = TYPE_LABELS[d.docType] || 'سایر';
    if (!groupsMap.has(g)) groupsMap.set(g, []);
    groupsMap.get(g)!.push({
      documentId: d.id, docNumber: d.docNumber, title: d.title,
      project: d.project?.code || '', docType: d.docType,
      revision: d.revisions[0]?.revisionCode || null, revStatus: d.revisions[0]?.status || null,
      status: d.status, confidentiality: d.confidentiality,
      linkStatus: l.linkStatus, linkRef: l.assetTag?.tag || l.line?.lineNumber || l.rawRef || norm,
    });
  }
  const groups = Array.from(groupsMap.entries()).map(([label, docs]) => ({ label, docs }));

  await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'DOSSIER_VIEW', detail: `ref=${norm} docs=${links.length}` });

  return jsonOk({
    found: true, ref: norm,
    tag: tag ? { tag: tag.tag, description: tag.description, tagType: tag.tagType } : null,
    line: lineVisible ? { lineNumber: lineVisible.lineNumber, spec: lineVisible.spec, sizeClass: lineVisible.sizeClass, unit: `${lineVisible.unit.area.code}/${lineVisible.unit.code}` } : null,
    tagVisible: !!tag,
    groups, suggested, confirmed,
    totalDocs: links.length,
  });
}
