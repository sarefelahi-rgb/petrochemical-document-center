// مقایسهٔ دو ویرایش سند — تفاوت متن صفحات (لایهٔ متن یا OCR)
// صداقت (سیاست §55): برای اسکن‌ها بخشی از تفاوت ناشی از کیفیت/چرخش OCR است؛
// «تفاوت قطعی» از «احتمال تغییر» جدا می‌شود و خروجی فقط سطح واژه است، نه تأیید مهندسی.
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError, canViewDocument } from '@/lib/guard';
import { normalizeFa } from '@/lib/normalize';

type Ctx = { params: Promise<{ id: string }> };

function tokenize(t: string): string[] {
  return normalizeFa(t).split(/\s+/).filter((w) => w.length > 0);
}

// LCS کلاسیک روی واژه‌ها — برای صفحات محدود مقیاس‌پذیر است
function diffWords(a: string[], b: string[]): { added: number; removed: number; pairs: Array<{ a?: string; b?: string }> } {
  const n = a.length, m = b.length;
  const MAX = 1500; // محافظت از حافظه — صفحات بسیار بلند به برش واژه‌ای
  const A = a.slice(0, MAX), B = b.slice(0, MAX);
  const an = A.length, bn = B.length;
  const dp: Uint16Array[] = Array.from({ length: an + 1 }, () => new Uint16Array(bn + 1));
  for (let i = an - 1; i >= 0; i--) {
    for (let j = bn - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: Array<{ a?: string; b?: string }> = [];
  let added = 0, removed = 0;
  let i = 0, j = 0;
  while (i < an && j < bn) {
    if (A[i] === B[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { pairs.push({ a: A[i] }); removed++; i++; }
    else { pairs.push({ b: B[j] }); added++; j++; }
  }
  while (i < an) { pairs.push({ a: A[i] }); removed++; i++; }
  while (j < bn) { pairs.push({ b: B[j] }); added++; j++; }
  return { added, removed, pairs };
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;
  const a = req.nextUrl.searchParams.get('a');
  const b = req.nextUrl.searchParams.get('b');
  if (!a || !b || a === b) return jsonError('دو ویرایش متفاوت را انتخاب کنید.');

  const doc = await db.document.findUnique({
    where: { id },
    include: { revisions: { select: { id: true, revisionCode: true, status: true, purpose: true, docDate: true, receivedDate: true } } },
  });
  if (!doc || !canViewDocument(ctx, doc)) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');

  const revA = doc.revisions.find((r) => r.id === a);
  const revB = doc.revisions.find((r) => r.id === b);
  if (!revA || !revB) return jsonError('ویرایش انتخابی متعلق به این سند نیست.', 404, 'NOT_FOUND');

  async function pagesOf(revId: string) {
    const files = await db.fileObject.findMany({ where: { revisionId: revId, quarantine: false }, select: { id: true } });
    const pts = await db.pageText.findMany({
      where: { fileId: { in: files.map((f) => f.id) } },
      orderBy: [{ fileId: 'asc' }, { pageNumber: 'asc' }],
      select: { pageNumber: true, textRaw: true, source: true, ocrConfidence: true },
    });
    return pts;
  }

  const [pa, pb] = await Promise.all([pagesOf(a), pagesOf(b)]);
  const pageNumbers = Array.from(new Set([...pa.map((p) => p.pageNumber), ...pb.map((p) => p.pageNumber)])).sort((x, y) => x - y);

  const pages = pageNumbers.slice(0, 20).map((pn) => {
    const ta = pa.find((p) => p.pageNumber === pn)?.textRaw || '';
    const tb = pb.find((p) => p.pageNumber === pn)?.textRaw || '';
    if (!ta && !tb) return { page: pn, added: 0, removed: 0, aAbsent: true, bAbsent: true };
    const d = diffWords(tokenize(ta), tokenize(tb));
    const changedPairs = d.pairs.filter((p) => p.a && p.b).slice(0, 12);
    return {
      page: pn,
      added: d.added, removed: d.removed,
      aSource: pa.find((p) => p.pageNumber === pn)?.source || null,
      bSource: pb.find((p) => p.pageNumber === pn)?.source || null,
      aAbsent: !ta, bAbsent: !tb,
      samples: changedPairs,
    };
  });

  const totalAdded = pages.reduce((s, p) => s + p.added, 0);
  const totalRemoved = pages.reduce((s, p) => s + p.removed, 0);
  const wordB = pb.reduce((s, p) => s + tokenize(p.textRaw).length, 0);
  const wordA = pa.reduce((s, p) => s + tokenize(p.textRaw).length, 0);

  return jsonOk({
    a: revA, b: revB,
    doc: { id: doc.id, docNumber: doc.docNumber, title: doc.title },
    pages,
    summary: {
      totalAdded, totalRemoved,
      wordsA: wordA, wordsB: wordB,
      changeRatio: wordB > 0 ? Math.round(((totalAdded + totalRemoved) / Math.max(1, wordB)) * 100) : null,
      pagesCompared: pages.length,
      scanWarning: pa.some((p) => p.source === 'OCR') || pb.some((p) => p.source === 'OCR'),
    },
    note: 'این مقایسه واژه‌ای و خودکار است؛ برای اسکن‌ها بخشی از تفاوت می‌تواند ناشی از خطای OCR باشد. تشخیص تغییر قطعی طراحی با بازبینی کارشناس است.',
  });
}
