// جست‌وجوی مرکز اسناد — دقیق (شماره/Tag/Line نرمال‌شده) + واژگانی روی عنوان + جست‌وجو در متن صفحات
// فقط اسناد مجاز؛ جست‌وجوی معنایی (Embedding) نیازمند اتصال سرویس مدل — در /api/system/status صادقانه اعلام شده
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk } from '@/lib/guard';
import { allowedCategoriesFor } from '@/lib/permissions';
import { normalizeCode, normalizeFa, candidateCodes, digitVariants, queryTokens, compactQuery } from '@/lib/normalize';
import { snippetAround } from '@/lib/contentSearch';

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const scope = req.nextUrl.searchParams.get('scope') || 'docs'; // docs | content
  const limit = Math.min(30, parseInt(req.nextUrl.searchParams.get('limit') || '12', 10) || 12);
  if (!q || ctx.projectIds.size === 0) return jsonOk({ items: [], semantic: false });

  const allowedConf = allowedCategoriesFor(ctx);
  const docWhere = {
    organizationId: ctx.organizationId,
    projectId: { in: Array.from(ctx.projectIds) },
    confidentiality: { in: allowedConf },
  };

  // ---------- جست‌وجو در متن صفحات (لایهٔ متن/OCR) — فراگیر: کل عبارت یا هر واژه ----------
  if (scope === 'content') {
    const qNorm = normalizeFa(q);
    if (qNorm.length < 2) return jsonOk({ items: [], semantic: false, note: 'پرسش حداقل ۲ نویسه.' });
    const cTokens = queryTokens(q);
    const pts = await db.pageText.findMany({
      where: {
        OR: [
          { textNormalized: { contains: qNorm } },
          ...cTokens.map((t) => ({ textNormalized: { contains: t } })),
        ],
        file: { revision: { document: docWhere } },
      },
      include: {
        file: { select: { id: true, originalName: true, revision: { select: { document: { select: { id: true, docNumber: true, docNumberRaw: true, title: true, project: { select: { code: true } }, revisions: { orderBy: { createdAt: 'desc' }, take: 1, select: { revisionCode: true } } } } } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 3,
    });

    const seen = new Map<string, { id: string; docNumber: string; title: string; project: string; revision: string | null; page: number; snippet: string; source: string; fileId: string; extraPages: number }>();
    for (const pt of pts) {
      const rev = pt.file.revision;
      if (!rev) continue;
      const d = rev.document;
      const revCode = d.revisions[0]?.revisionCode || null;
      const row = {
        id: d.id, docNumber: d.docNumberRaw || d.docNumber, title: d.title,
        project: d.project.code, revision: revCode,
        page: pt.pageNumber, snippet: snippetAround(pt.textRaw, qNorm),
        source: pt.source, fileId: pt.file.id, extraPages: 0,
      };
      if (!seen.has(d.id)) {
        seen.set(d.id, row);
      } else {
        // صفحه‌های دیگر همان سند به‌عنوان ردیف جدا برای لینک مستقیم صفحه
        const s = seen.get(d.id)!;
        s.extraPages += 1;
        if (s.extraPages <= 2 && pt.pageNumber !== s.page) {
          seen.set(`${d.id}#${pt.pageNumber}`, row);
        }
      }
    }
    return jsonOk({ items: Array.from(seen.values()).slice(0, limit), semantic: false, scope: 'content' });
  }

  // ---------- جست‌وجوی اسناد: دقیق + واژگانی ----------
  const codes = candidateCodes(q);
  const faQ = normalizeFa(q);

  // ۱) جست‌وجوی دقیق شماره سند / Tag / Line (روی کاندیدهای کد از پرسش آزاد)
  const byNumber = await db.document.findMany({
    where: { ...docWhere, OR: codes.map((c) => ({ docNumber: { contains: c } })) },
    include: { project: { select: { code: true } }, revisions: { orderBy: { createdAt: 'desc' }, take: 1, select: { revisionCode: true, status: true } } },
    take: limit,
    orderBy: { updatedAt: 'desc' },
  });

  const byLink = await db.docLink.findMany({
    where: {
      OR: [
        ...codes.map((c) => ({ assetTag: { tag: { contains: c } } })),
        ...codes.map((c) => ({ line: { lineNumber: { contains: c } } })),
        ...codes.map((c) => ({ rawRef: { contains: c } })),
      ],
      document: docWhere,
    },
    include: {
      document: { include: { project: { select: { code: true } }, revisions: { orderBy: { createdAt: 'desc' }, take: 1, select: { revisionCode: true, status: true } } } },
    },
    take: limit,
  });

  // ۲) جست‌وجوی واژگانی عنوان — نمایهٔ searchNorm (کل عبارت + هر واژه) + گونه‌های ارقام/حروف
  // عنوان در پایگاه‌داده متن خام است؛ searchNorm همان متن نرمال‌شده است (ی/ک/ارقام/فاصله/نیم‌فاصله یکسان)
  const titleVariants = faQ.length >= 2 ? Array.from(new Set(digitVariants(faQ).flatMap((v) => [v, v.toLowerCase()]))).slice(0, 4) : [];
  const tTokens = queryTokens(q);
  const qCompact = compactQuery(q);
  const byTitle = (titleVariants.length || tTokens.length) ? await db.document.findMany({
    where: {
      ...docWhere,
      OR: [
        ...(qCompact.length >= 2 ? [{ searchNorm: { contains: qCompact } }] : []),
        ...tTokens.map((t) => ({ searchNorm: { contains: t } })),
        ...titleVariants.map((v) => ({ title: { contains: v } })),
      ],
    },
    include: { project: { select: { code: true } }, revisions: { orderBy: { createdAt: 'desc' }, take: 1, select: { revisionCode: true, status: true } } },
    take: limit,
    orderBy: { updatedAt: 'desc' },
  }) : [];

  // ادغام و حذف تکرار
  const map = new Map<string, { id: string; docNumber: string; title: string; project: string; revision: string | null; revStatus: string | null; matched: string }>();
  const push = (d: typeof byNumber[number], matched: string) => {
    if (!map.has(d.id)) {
      map.set(d.id, {
        id: d.id, docNumber: d.docNumber, title: d.title,
        project: d.project?.code || '', revision: d.revisions[0]?.revisionCode || null,
        revStatus: d.revisions[0]?.status || null, matched,
      });
    }
  };
  for (const d of byNumber) push(d, 'شماره سند');
  for (const l of byLink) if (l.document) push(l.document as typeof byNumber[number], 'Tag/Line مرتبط');
  for (const d of byTitle) push(d, 'عنوان');

  return jsonOk({ items: Array.from(map.values()).slice(0, limit), semantic: false });
}
