// جست‌وجو در متن صفحات سند (لایهٔ متن یا OCR) — نتیجه با شماره صفحه و مختصات هایلایت
// پیش از بازیابی مجوز کاربر اعمال می‌شود؛ سند غیرمجاز در نتایج ظاهر نمی‌شود
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can, canViewDocument } from '@/lib/permissions';
import { searchInDocument } from '@/lib/contentSearch';
import { normalizeFa } from '@/lib/normalize';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const fileIdFilter = req.nextUrl.searchParams.get('fileId') || null;
  if (!q) return jsonOk({ matches: [], total: 0, note: 'پرسش خالی است.' });
  if (q.length < 2) return jsonOk({ matches: [], total: 0, note: 'پرسش حداقل ۲ نویسه.' });

  const doc = await db.document.findUnique({ where: { id }, include: { revisions: { include: { files: true } } } });
  if (!doc) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');
  if (!canViewDocument(ctx, doc)) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');
  if (!can(ctx, 'doc:content', doc)) return jsonError('اجازه مشاهده محتوای این سند را ندارید.', 403, 'FORBIDDEN');

  // فقط فایل‌های اصل تمیز
  const files = doc.revisions.flatMap((r) => r.files).filter((f) => !f.quarantine && f.scanStatus !== 'REJECTED' && (!fileIdFilter || f.id === fileIdFilter));
  if (files.length === 0) return jsonOk({ matches: [], total: 0, note: 'فایل قابل جست‌وجو نیست.' });

  let allMatches: ReturnType<typeof searchInDocument>['matches'] = [];
  let pagesSearched = 0;
  const fileNotes: string[] = [];

  for (const f of files.slice(0, 4)) {
    const pageTexts = await db.pageText.findMany({
      where: { fileId: f.id },
      select: { pageNumber: true, source: true, ocrConfidence: true },
    });
    if (pageTexts.length === 0) {
      fileNotes.push(`فایل «${f.originalName.slice(0, 40)}» هنوز پردازش نشده یا متن استخراج نشده است.`);
      continue;
    }
    const r = searchInDocument({
      orgId: ctx.organizationId, fileId: f.id, maxPage: Math.max(...pageTexts.map((p) => p.pageNumber)),
      query: q, pageTexts,
    });
    pagesSearched += r.pagesSearched;
    allMatches = allMatches.concat(r.matches.map((m) => ({ ...m, fileId: f.id, fileName: f.originalName })));
  }

  allMatches.sort((a, b) => a.page - b.page);
  const qNorm = normalizeFa(q);
  return jsonOk({
    query: q, queryNormalized: qNorm,
    matches: allMatches.slice(0, 40),
    total: allMatches.length,
    pagesSearched,
    notes: fileNotes,
  });
}
