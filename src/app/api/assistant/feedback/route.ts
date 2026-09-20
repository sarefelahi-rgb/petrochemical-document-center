// ثبت بازخورد کاربر روی پاسخ دستیار — موتور یادگیری مداوم
// 👍 → الگوی پرسش/پاسخ آموخته و تقویت می‌شود؛ 👎 + پاسخ درست → تصحیح آموخته می‌شود.
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, jsonOk, jsonError } from '@/lib/guard';
import { learnFromFeedback } from '@/lib/learning';
import { audit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const body = await req.json().catch(() => null);
  const messageId = String(body?.messageId || '');
  const rating = body?.rating === 'UP' ? 'UP' : body?.rating === 'DOWN' ? 'DOWN' : null;
  if (!messageId || !rating) return jsonError('پارامترهای بازخورد ناقص است.');
  const comment = String(body?.comment || '').slice(0, 1000) || null;
  const expectedAnswer = String(body?.expectedAnswer || '').slice(0, 4000) || null;

  // پیام باید متعلق به گفت‌وگوی خود کاربر و پاسخ دستیار باشد
  const msg = await db.assistantMessage.findFirst({
    where: { id: messageId, role: 'ASSISTANT', conversation: { userId: auth.user.id } },
    select: { id: true, content: true, conversationId: true },
  });
  if (!msg) return jsonError('پیام یافت نشد.', 404, 'NOT_FOUND');

  // پرسش متناظر: آخرین پیام کاربر پیش از این پاسخ
  const qMsg = await db.assistantMessage.findFirst({
    where: { conversationId: msg.conversationId, role: 'USER', createdAt: { lt: new Date(Date.now() + 1000) } },
    orderBy: { createdAt: 'desc' },
    select: { content: true },
  });

  const existing = await db.assistantFeedback.findUnique({
    where: { messageId_userId: { messageId, userId: auth.user.id } },
  });

  const fb = existing
    ? await db.assistantFeedback.update({
        where: { id: existing.id },
        data: { rating, comment, expectedAnswer },
      })
    : await db.assistantFeedback.create({
        data: {
          messageId: msg.id,
          conversationId: msg.conversationId,
          userId: auth.user.id,
          organizationId: auth.user.organizationId,
          rating,
          comment,
          expectedAnswer,
          question: qMsg?.content?.slice(0, 1000) || null,
          answerSnapshot: msg.content.slice(0, 1500),
        },
      });

  const learn = await learnFromFeedback({
    organizationId: auth.user.organizationId,
    userId: auth.user.id,
    question: qMsg?.content || '',
    answer: msg.content,
    rating: rating as 'UP' | 'DOWN',
    expectedAnswer,
    comment,
  });

  await audit({
    organizationId: auth.user.organizationId,
    actorId: auth.user.id,
    actorName: auth.user.fullName,
    action: 'ASSISTANT_FEEDBACK',
    detail: `rating=${rating} learned=${learn.learned ? 'yes' : 'no'} messageId=${msg.id.slice(0, 8)}`,
  });

  return jsonOk({
    ok: true,
    feedbackId: fb.id,
    learned: learn.learned,
    message: learn.learned
      ? rating === 'UP'
        ? 'سپاس! دستیار این پاسخ را آموخت و در پاسخ‌های بعدی دقیق‌تر می‌شود.'
        : 'تصحیح شما آموخته شد — از این پس پاسخ‌های مشابه اصلاح می‌شود.'
      : 'بازخورد شما ثبت شد.',
  });
}
