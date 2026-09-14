// گردش تأیید سند — دورهای بازبینی/تأیید
// سیاست §78: تأییدکننده به‌طور پیش‌فرض تأیید نهایی مدرک ارسالی خودش را انجام نمی‌دهد (منع خودتأییدی)؛
// پس از تأیید، فایل ویرایش‌شده جایگزین همان Revision نمی‌شود (ویرایش جدید ثبت می‌شود — آپلود جدا).
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can, canViewDocument, roleHas } from '@/lib/permissions';
import { audit } from '@/lib/audit';

const REVIEWER_ROLES = ['ADMIN', 'DOC_CONTROLLER', 'ENGINEER', 'REVIEWER', 'APPROVER'];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || !canViewDocument(ctx, doc)) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');

  const approvals = await db.docApproval.findMany({
    where: { documentId: id },
    orderBy: [{ round: 'asc' }, { createdAt: 'asc' }],
    include: { reviewer: { select: { id: true, fullName: true, role: true } } },
  });

  // داوطلبان بازبینی: نقش مناسب + عضو پروژهٔ سند + غیر از خود درخواست‌دهندهٔ هر دور
  const members = await db.projectMember.findMany({
    where: { projectId: doc.projectId },
    include: { user: { select: { id: true, fullName: true, role: true, isActive: true } } },
  });
  if (ctx.role === 'ADMIN') {
    const admins = await db.user.findMany({ where: { organizationId: ctx.organizationId, role: 'ADMIN', isActive: true }, select: { id: true, fullName: true, role: true, isActive: true } });
    for (const a of admins) if (!members.some((m) => m.user.id === a.id)) members.push({ id: `admin-${a.id}`, userId: a.id, projectId: doc.projectId, roleInProject: 'MEMBER', createdAt: new Date(), user: a });
  }
  const candidates = members
    .map((m) => m.user)
    .filter((u) => u.isActive && REVIEWER_ROLES.includes(u.role) && roleHas(u.role, 'doc:review') && u.id !== auth.user.id)
    .map((u) => ({ id: u.id, fullName: u.fullName, role: u.role }));

  const canManage = can(ctx, 'doc:edit', doc);
  const myPending = approvals.find((a) => a.reviewerId === auth.user.id && a.decision === 'PENDING');

  return jsonOk({
    items: approvals,
    candidates,
    canManage,
    myPending: myPending ? { id: myPending.id, round: myPending.round } : null,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action: string = body?.action || '';

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || !canViewDocument(ctx, doc)) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');

  // --- درخواست بازبینی/تأیید ---
  if (action === 'request') {
    if (!can(ctx, 'doc:edit', doc)) return jsonError('اجازه اصلاح این سند را ندارید.', 403, 'FORBIDDEN');
    const reviewerId: string = String(body?.reviewerId || '');
    const reviewer = await db.user.findUnique({ where: { id: reviewerId } });
    if (!reviewer || !reviewer.isActive || !roleHas(reviewer.role, 'doc:review')) {
      return jsonError('بازبین نامعتبر است.');
    }
    // منع خودتأییدی: بازبین نمی‌تواند خودِ درخواست‌دهنده باشد
    if (reviewerId === auth.user.id) return jsonError('تأییدکننده نمی‌تواند خودِ درخواست‌دهنده باشد (منع خودتأییدی).');

    const lastRound = await db.docApproval.findFirst({ where: { documentId: id }, orderBy: { round: 'desc' } });
    const round = (lastRound?.round || 0) + 1;
    const approval = await db.docApproval.create({
      data: {
        documentId: id, revisionId: doc.currentRevisionId, round, reviewerId,
        decision: 'PENDING', requestedById: auth.user.id,
      },
      include: { reviewer: { select: { fullName: true } } },
    });
    await db.cartableTask.create({
      data: {
        assigneeId: reviewerId, type: 'APPROVE',
        title: `بازبینی/تأیید سند ${doc.docNumber} — دور ${round}`,
        payload: JSON.stringify({ approvalId: approval.id, round, docNumber: doc.docNumber, docTitle: doc.title }),
        relatedDocId: id,
      },
    });
    await db.document.update({ where: { id }, data: { engineeringStatus: 'IN_REVIEW' } });
    await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'APPROVAL_REQUEST', objectType: 'document', objectId: id, detail: `round=${round} reviewer=${reviewer.username}` });
    return jsonOk({ item: approval });
  }

  // --- تصمیم بازبین (فقط بازبینِ همان دورِ در انتظار) ---
  if (action === 'decide') {
    const approvalId: string = String(body?.approvalId || '');
    const decision: string = String(body?.decision || '');
    if (!['APPROVED', 'CHANGES', 'REJECTED'].includes(decision)) return jsonError('تصمیم نامعتبر است.');
    const approval = await db.docApproval.findUnique({ where: { id: approvalId }, include: { reviewer: true } });
    if (!approval || approval.documentId !== id) return jsonError('رکورد تأیید یافت نشد.', 404, 'NOT_FOUND');
    if (approval.decision !== 'PENDING') return jsonError('این دور قبلاً تصمیم‌گیری شده است.');
    // منع خودتأییدی: فقط بازبین محول‌شده تصمیم می‌گیرد
    if (approval.reviewerId !== auth.user.id) return jsonError('فقط بازبین محول‌شده می‌تواند تصمیم بگیرد (منع خودتأییدی).', 403, 'FORBIDDEN');

    const updated = await db.docApproval.update({
      where: { id: approvalId },
      data: { decision, comment: String(body?.comment || '').slice(0, 500) || null, decidedAt: new Date() },
    });
    // بستن کار کارتابل مرتبط
    await db.cartableTask.updateMany({
      where: { assigneeId: auth.user.id, relatedDocId: id, type: 'APPROVE', status: 'OPEN' },
      data: { status: 'DONE', completedAt: new Date() },
    });

    if (decision === 'APPROVED') {
      // اگر همهٔ بازبین‌های این دور تأیید کردند → نسخهٔ جاری تأیید می‌شود (محور مهندسی مستقل)
      const roundApprovals = await db.docApproval.findMany({ where: { documentId: id, round: approval.round } });
      const allApproved = roundApprovals.every((a) => a.decision === 'APPROVED');
      if (allApproved) {
        await db.document.update({ where: { id }, data: { engineeringStatus: 'APPROVED' } });
        if (approval.revisionId) {
          await db.revision.update({
            where: { id: approval.revisionId },
            data: { status: 'APPROVED', approvedById: auth.user.id, approvedAt: new Date() },
          });
        }
      }
    } else if (decision === 'CHANGES') {
      await db.document.update({ where: { id }, data: { engineeringStatus: 'UNREVIEWED' } }); // بازگشت برای اصلاح
    }

    await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'APPROVAL_DECIDE', objectType: 'document', objectId: id, detail: `round=${approval.round} decision=${decision}` });
    return jsonOk({ item: updated });
  }

  return jsonError('اقدام نامعتبر است.');
}
