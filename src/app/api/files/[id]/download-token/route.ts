// صدور توکن دانلود کوتاه‌عمر (۲ دقیقه، یک‌بارمصرف) — لینک غیرعمومی
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can } from '@/lib/permissions';
import { issueDownloadToken } from '@/lib/downloadTokens';
import { audit } from '@/lib/audit';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;

  const file = await db.fileObject.findUnique({
    where: { id },
    include: { revision: { include: { document: true } } },
  });
  if (!file || !file.revision?.document) return jsonError('فایل یافت نشد.', 404, 'NOT_FOUND');
  const doc = file.revision.document;
  if (!can(ctx, 'doc:download', doc)) return jsonError('اجازه دریافت این فایل را ندارید.', 403, 'FORBIDDEN');

  const token = issueDownloadToken(id, auth.user.id);

  await audit({
    organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName,
    action: 'DOWNLOAD_TOKEN_ISSUED', objectType: 'FileObject', objectId: id,
    detail: `doc=${doc.docNumber} file=${file.originalName.slice(0, 50)}`,
  });

  return jsonOk({
    url: `/api/files/${id}/download?token=${token}`,
    expiresInSec: 120,
    fileName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    sha256: file.sha256,
  });
}
