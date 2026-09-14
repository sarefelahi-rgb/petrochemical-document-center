// تجمیع MTO/BOM روی مجموعه‌ای از اسناد مجاز — جمع دقیق روی ردیف‌های تأییدشده
// سیاست §70: تطبیق اقلام فقط با کلید فنی (متریال+سایز اصلی+سایز انشعاب+کلاس+Sch+EndConn+واحد)؛
// کمبود مشخصات یا اختلاف واحد مانع ادغام خودکار است؛ منبع هر ردیف حفظ می‌شود.
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { canViewDocument } from '@/lib/permissions';
import { audit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const body = await req.json().catch(() => null);
  const documentIds: string[] = Array.isArray(body?.documentIds) ? body.documentIds.slice(0, 200) : [];
  if (!documentIds.length) return jsonError('حداقل یک سند انتخاب کنید.');

  // انزوا: فقط اسناد مجاز — اسناد غیرمجاز بی‌صدا حذف می‌شوند
  const docs = await db.document.findMany({
    where: { id: { in: documentIds }, organizationId: ctx.organizationId, projectId: { in: Array.from(ctx.projectIds) }, confidentiality: { in: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'].slice(0, ({ PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2, RESTRICTED: 3 } as Record<string, number>)[ctx.clearance] + 1) } },
    select: { id: true, docNumber: true, title: true },
  });
  if (!docs.length) return jsonError('به هیچ‌یک از اسناد انتخابی دسترسی ندارید.', 403, 'FORBIDDEN');
  const allowedIds = new Set(docs.map((d) => d.id));
  const docMap = new Map(docs.map((d) => [d.id, d]));

  const rows = await db.mtoRow.findMany({
    where: { documentId: { in: Array.from(allowedIds) }, status: 'CONFIRMED' },
    orderBy: { createdAt: 'asc' },
  });

  // کلید فنی — فیلد ناقص یا نامعلوم => کلید «ناقص:...» که با دیگران ادغام نمی‌شود
  const groups = new Map<string, {
    key: string; rawDesc: string; material: string | null; sizeMain: string | null; sizeBranch: string | null;
    cls: string | null; schedule: string | null; endConn: string | null; unit: string;
    qty: number; sources: Array<{ documentId: string; docNumber: string; rowId: string; qty: number; rawDesc: string }>;
    incomplete: boolean;
  }>();

  for (const r of rows) {
    const d = docMap.get(r.documentId)!;
    const incomplete = !r.material || !r.sizeMain || !r.unit;
    const key = incomplete
      ? `INC:${r.id}` // ردیف ناقص هرگز ادغام نمی‌شود
      : [r.material, r.sizeMain, r.sizeBranch || '-', r.cls || '-', r.schedule || '-', r.endConn || '-', r.unit].join('|');
    const g = groups.get(key);
    if (g) {
      g.qty += r.qty;
      g.sources.push({ documentId: r.documentId, docNumber: d.docNumber, rowId: r.id, qty: r.qty, rawDesc: r.rawDesc });
    } else {
      groups.set(key, {
        key, rawDesc: r.rawDesc, material: r.material, sizeMain: r.sizeMain, sizeBranch: r.sizeBranch,
        cls: r.cls, schedule: r.schedule, endConn: r.endConn, unit: r.unit,
        qty: r.qty,
        sources: [{ documentId: r.documentId, docNumber: d.docNumber, rowId: r.id, qty: r.qty, rawDesc: r.rawDesc }],
        incomplete,
      });
    }
  }

  const items = Array.from(groups.values()).sort((a, b) => (a.incomplete === b.incomplete ? b.qty - a.qty : a.incomplete ? 1 : -1));
  await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'MTO_AGGREGATE', detail: `docs=${allowedIds.size} rows=${rows.length} groups=${items.length}` });

  return jsonOk({
    documents: docs.map((d) => ({ id: d.id, docNumber: d.docNumber, title: d.title })),
    items,
    totals: { rows: rows.length, groups: items.length, incomplete: items.filter((i) => i.incomplete).length },
    note: 'جمع فقط روی ردیف‌های تأییدشده انجام شده است. ردیف‌های ناقص (بدون متریال/سایز/واحد) جدا و بدون ادغام گزارش می‌شوند.',
  });
}
