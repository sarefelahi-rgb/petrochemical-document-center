// مدیریت حافظهٔ یادگیرندهٔ دستیار — فقط ادمین
// GET    فهرست دانش‌های آموخته‌شده + آمار یادگیری
// POST   افزودن دانش دستی (آموزش صریح توسط ادمین)
// PATCH  فعال/غیرفعال، تغییر وزن یا ویرایش پاسخ
// DELETE حذف دانش
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, jsonOk, jsonError } from '@/lib/guard';
import { learningStats, extractKeywords } from '@/lib/learning';
import { normalizeFa } from '@/lib/normalize';

async function requireAdmin() {
  const auth = await requireUser();
  if ('resp' in auth) return auth;
  if (auth.user.role !== 'ADMIN') return { resp: jsonError('فقط مدیر سامانه به مدیریت یادگیری دسترسی دارد.', 403, 'FORBIDDEN') };
  return auth;
}

export async function GET() {
  const auth = await requireAdmin();
  if ('resp' in auth) return auth.resp;
  const [entries, stats] = await Promise.all([
    db.learnedKnowledge.findMany({
      where: { organizationId: auth.user.organizationId },
      orderBy: [{ active: 'desc' }, { weight: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
      include: { createdBy: { select: { fullName: true } } },
    }),
    learningStats(auth.user.organizationId),
  ]);
  return jsonOk({
    entries: entries.map((e) => ({
      id: e.id, question: e.question, answer: e.answer, source: e.source,
      weight: e.weight, useCount: e.useCount, upvotes: e.upvotes, downvotes: e.downvotes,
      active: e.active, createdBy: e.createdBy?.fullName || '—', updatedAt: e.updatedAt,
    })),
    stats,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('resp' in auth) return auth.resp;
  const body = await req.json().catch(() => null);
  const question = String(body?.question || '').trim();
  const answer = String(body?.answer || '').trim();
  if (question.length < 3 || answer.length < 3) return jsonError('پرسش و پاسخ را کامل بنویسید.');
  const entry = await db.learnedKnowledge.create({
    data: {
      organizationId: auth.user.organizationId,
      question: normalizeFa(question).slice(0, 500),
      keywords: extractKeywords(question).join('، '),
      answer: answer.slice(0, 4000),
      source: 'MANUAL',
      weight: 1.5,
      createdById: auth.user.id,
    },
  });
  return jsonOk({ ok: true, id: entry.id });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ('resp' in auth) return auth.resp;
  const body = await req.json().catch(() => null);
  const id = String(body?.id || '');
  if (!id) return jsonError('شناسهٔ دانش لازم است.');
  const data: { active?: boolean; weight?: number; answer?: string } = {};
  if (typeof body?.active === 'boolean') data.active = body.active;
  if (typeof body?.weight === 'number' && body.weight >= 0 && body.weight <= 3) data.weight = body.weight;
  if (typeof body?.answer === 'string' && body.answer.trim()) data.answer = body.answer.trim().slice(0, 4000);
  if (!Object.keys(data).length) return jsonError('تغییری ارسال نشده است.');
  const res = await db.learnedKnowledge.updateMany({ where: { id, organizationId: auth.user.organizationId }, data });
  if (res.count === 0) return jsonError('دانش یافت نشد.', 404, 'NOT_FOUND');
  return jsonOk({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if ('resp' in auth) return auth.resp;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!id) return jsonError('شناسهٔ دانش لازم است.');
  const res = await db.learnedKnowledge.deleteMany({ where: { id, organizationId: auth.user.organizationId } });
  if (res.count === 0) return jsonError('دانش یافت نشد.', 404, 'NOT_FOUND');
  return jsonOk({ ok: true });
}
