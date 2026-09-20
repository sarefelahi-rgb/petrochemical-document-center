// اصلاح هوشمند متن OCR با مدل زبانی — ارتقای دقت خوانش
// متن خام OCR صفحه‌ها به مدل داده می‌شود تا خطاهای شناخته‌شدهٔ OCR (نویسه‌های عربی/فارسی،
// واژه‌های شکسته، فاصله‌ها، رسم‌الخط) بدون تغییر در اعداد/کدها/معنا اصلاح شود.
// هیچ صفحهٔ REVIEWED بازنویسی نمی‌شود؛ خروجی با برچسب aiPolished ذخیره می‌شود.
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { canViewDocument } from '@/lib/permissions';
import { chatComplete } from '@/lib/modelGateway';
import { normalizeFa } from '@/lib/normalize';
import { audit } from '@/lib/audit';

export const maxDuration = 150;

const POLISH_SYSTEM = [
  'تو ویراستار حرفه‌ای متن‌های خروجی OCR مدارک مهندسی هستی.',
  'وظیفه: خطاهای OCR را در متن زیر اصلاح کن — بدون تغییر در معنا:',
  '• نویسه‌های عربی به فارسی درست (ي→ی، ك→ک، ة→ه، أ/إ→ا) و ارقام عربی/فارسی به فارسی',
  '• واژه‌های به‌هم‌چسبیده یا شکسته را درست کن؛ فاصله‌گذاری و نیم‌فاصلهٔ فارسی را اصلاح کن',
  '• نویسه‌های نویز (علائم نامفهوم تکراری، ستاره‌های OCR) را حذف کن',
  '• کدهای مهندسی، شماره‌ها، سایزها و مقادیر فنی را «عیناً» نگه دار — هرگز عدد یا کد را تغییر/حدس نزن',
  '• هیچ چیز جدید اضافه نکن و هیچ بخشی را خلاصه نکن؛ فقط همان متن اصلاح‌شده را خروجی بده.',
  'خروجی: فقط متن اصلاح‌شده، بدون هیچ توضیح یا مقدمه.',
].join('\n');

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const { id } = await params;
  const ctx = await buildAccessContext(auth.user);

  const file = await db.fileObject.findUnique({
    where: { id },
    select: { id: true, originalName: true, revisionId: true },
  });
  if (!file?.revisionId) return jsonError('فایل یافت نشد.', 404, 'NOT_FOUND');
  const rev = await db.revision.findUnique({
    where: { id: file.revisionId },
    select: { document: { select: { id: true, organizationId: true, projectId: true, confidentiality: true, docNumber: true } } },
  });
  if (!rev) return jsonError('فایل یافت نشد.', 404, 'NOT_FOUND');
  if (!canViewDocument(ctx, rev.document)) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');

  const pages = await db.pageText.findMany({
    where: { fileId: id, source: 'OCR', status: { not: 'REVIEWED' }, wordCount: { gte: 4 } },
    orderBy: { pageNumber: 'asc' },
    take: 30,
  });
  const pending = pages.filter((p) => !p.aiPolished);
  if (!pending.length) {
    return jsonOk({ polished: 0, skipped: 0, message: 'همهٔ صفحات این فایل قبلاً اصلاح هوشمند شده‌اند یا متنی برای اصلاح ندارند.' });
  }

  let polished = 0;
  const BATCH = 4;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const input = batch
      .map((p) => `<<<صفحهٔ ${p.pageNumber}>>>\n${p.textRaw.slice(0, 6000)}`)
      .join('\n\n');
    const res = await chatComplete(
      [
        { role: 'system', content: POLISH_SYSTEM },
        { role: 'user', content: input },
      ],
      { timeoutMs: 110_000, maxAttempts: 2 },
    );
    if (!res.ok) continue;
    // تجزیهٔ خروجی بر اساس برچسب صفحه‌ها
    const chunks = res.content.split(/<<<صفحهٔ\s*(\d+)>>>/);
    const pageMap = new Map<number, string>();
    for (let c = 1; c < chunks.length - 1; c += 2) {
      const pageNo = parseInt(chunks[c], 10);
      const text = chunks[c + 1]?.trim() || '';
      if (pageNo && text) pageMap.set(pageNo, text);
    }
    if (!pageMap.size && batch.length === 1) pageMap.set(batch[0].pageNumber, res.content.trim());
    for (const p of batch) {
      const fixed = pageMap.get(p.pageNumber);
      if (!fixed) continue;
      // گارد سلامت: متن اصلاح‌شده باید هم‌اندازهٔ منطقی متن اصلی باشد (۶۰٪..۱۴۰٪)
      const ratio = fixed.length / Math.max(1, p.textRaw.length);
      if (ratio < 0.6 || ratio > 1.4 || fixed.length < 20) continue;
      await db.pageText.update({
        where: { id: p.id },
        data: {
          textRaw: fixed,
          textNormalized: normalizeFa(fixed),
          wordCount: fixed.split(/\s+/).filter(Boolean).length,
          aiPolished: true,
          polishedAt: new Date(),
        },
      });
      polished += 1;
    }
  }

  await audit({
    organizationId: rev.document.organizationId,
    actorId: auth.user.id,
    actorName: auth.user.fullName,
    action: 'OCR_AI_POLISH',
    detail: `file=${id.slice(0, 8)} polished=${polished}/${pending.length}`,
  });

  return jsonOk({
    polished,
    skipped: pending.length - polished,
    message: polished > 0
      ? `متن ${polished} صفحه با مدل هوشمند اصلاح و ارتقا یافت. جست‌وجو و دستیار اکنون متن دقیق‌تری می‌بینند.`
      : 'اصلاح هوشمند این بار انجام نشد (سرویس مدل در دسترس نبود یا متن‌ها کوتاه بودند) — بعداً دوباره تلاش کنید.',
  });
}
