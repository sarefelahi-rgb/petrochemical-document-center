// منطق پذیرش هوشمند اسناد — طبقه‌بندی خودکار با مدل زبانی + تبدیل به سند رسمی
// اصل صداقت: پیشنهاد مدل «پیشنهاد» است؛ تأیید نهایی و ویرایش با کارشناس/ادمین
import { db } from '@/lib/db';
import { chatComplete } from '@/lib/modelGateway';
import { normalizeCode } from '@/lib/normalize';
import { audit } from '@/lib/audit';

export interface AiSuggestion {
  docNumber: string | null;
  title: string | null;
  projectCode: string | null;
  discipline: string | null;
  docType: string | null;
  unitCode: string | null;
  revision: string | null;
  confidentiality: string | null;
  tags: string[];
  summary: string | null;
}

const CONF_KEYS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'];

function safeJsonParse(raw: string): AiSuggestion | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() && v.trim() !== 'null' ? v.trim().slice(0, 200) : null);
    const tags = Array.isArray(obj.tags) ? obj.tags.filter((t): t is string => typeof t === 'string').slice(0, 8) : [];
    const conf = str(obj.confidentiality);
    return {
      docNumber: str(obj.docNumber),
      title: str(obj.title),
      projectCode: str(obj.projectCode)?.toUpperCase() || null,
      discipline: str(obj.discipline)?.toUpperCase() || null,
      docType: str(obj.docType)?.toUpperCase() || null,
      unitCode: str(obj.unitCode),
      revision: str(obj.revision)?.slice(0, 12) || null,
      confidentiality: conf && CONF_KEYS.includes(conf.toUpperCase()) ? conf.toUpperCase() : null,
      tags,
      summary: str(obj.summary),
    };
  } catch {
    return null;
  }
}

// طبقه‌بندی خودکار فایل بر پایهٔ نام فایل + متن استخراج‌شده
export async function runClassification(opts: {
  fileName: string;
  mimeType: string;
  text: string;
  organizationId: string;
}): Promise<{ ai: AiSuggestion | null; confidence: number; note: string; available: boolean }> {
  const [projects, vocab] = await Promise.all([
    db.project.findMany({ where: { organizationId: opts.organizationId, isActive: true }, select: { code: true, name: true } }),
    db.vocabulary.findMany({ where: { domain: { in: ['DISCIPLINE', 'DOC_TYPE'] } }, select: { domain: true, code: true, label: true } }),
  ]);
  const disciplines = vocab.filter((v) => v.domain === 'DISCIPLINE').slice(0, 40);
  const docTypes = vocab.filter((v) => v.domain === 'DOC_TYPE').slice(0, 60);

  const textSlice = (opts.text || '').slice(0, 6000);
  const prompt = [
    'تو کارشناس طبقه‌بندی مدارک مهندسی پتروشیمی هستی. با توجه به «نام فایل» و «متن استخراج‌شده»، مشخصات مدرک را تشخیص بده.',
    'خروجی فقط و فقط JSON معتبر با این ساختار باشد (بدون هیچ توضیح اضافه):',
    '{"docNumber": string|null, "title": string|null, "projectCode": string|null, "discipline": string|null, "docType": string|null, "unitCode": string|null, "revision": string|null, "confidentiality": string|null, "tags": string[], "summary": string|null, "confidence": number}',
    'قواعد:',
    '- docNumber: شماره مدرک اگر در نام فایل یا کادر عنوان پیدا شد (مثل 6-P-1183-B2A یا X-AR-1001)؛ وگرنه null.',
    '- title: عنوان کوتاه مدرک (فارسی یا انگلیسی) بر اساس محتوا.',
    `- projectCode: فقط یکی از این کدها: ${projects.map((p) => p.code).join('، ') || '—'}؛ اگر مطمئن نیستی null.`,
    `- discipline: فقط از این واژگان: ${disciplines.map((d) => d.code).join('، ') || 'UNK'}؛ وگرنه null.`,
    `- docType: فقط از این واژگان: ${docTypes.map((d) => d.code).join('، ') || 'OTHER'}؛ وگرنه null.`,
    '- confidentiality: یکی از PUBLIC | INTERNAL | CONFIDENTIAL | RESTRICTED بر اساس نشانه‌های محرمانگی متن (کلماتی مثل محرمانه/confidential/stamp)؛ پیش‌فرض INTERNAL.',
    '- tags: حداکثر ۸ کلیدواژه فنی.',
    '- summary: خلاصهٔ یک‌خطی محتوای مدرک.',
    '- confidence: عدد 0 تا 1 برای اطمینان کل تشخیص. اگر اطلاعات ناکافی است مقدارها را null بگذار — هیچ چیز از خودت نساز.',
    '',
    `نام فایل: ${opts.fileName}`,
    `نوع فایل: ${opts.mimeType}`,
    'متن استخراج‌شده:',
    textSlice || '(متنی استخراج نشده — فقط از نام فایل کمک بگیر و صادقانه confidence پایین بده)',
  ].join('\n');

  const res = await chatComplete(
    [
      { role: 'system', content: 'تو یک موتور طبقه‌بندی مدرک هستی. خروجی فقط JSON معتبر باشد.' },
      { role: 'user', content: prompt },
    ],
    { timeoutMs: 90_000, maxAttempts: 2 },
  );
  if (!res.ok) {
    return { ai: null, confidence: 0, note: `سرویس مدل در دسترس نبود (${res.error || 'خطای نامشخص'}) — طبقه‌بندی دستی لازم است.`, available: false };
  }
  const ai = safeJsonParse(res.content);
  if (!ai) {
    return { ai: null, confidence: 0, note: 'پاسخ مدل قابل تفسیر نبود — طبقه‌بندی دستی لازم است.', available: true };
  }
  const conf = typeof (JSON.parse(res.content.match(/\{[\s\S]*\}/)?.[0] || '{}') as { confidence?: unknown }).confidence === 'number'
    ? (JSON.parse(res.content.match(/\{[\s\S]*\}/)?.[0] || '{}') as { confidence: number }).confidence
    : 0.5;
  return { ai, confidence: Math.max(0, Math.min(1, conf)), note: '', available: true };
}

// نتیجهٔ طبقه‌بندی → ردیف فیلدهای قابل ویرایش (برای ذخیره در aiJson)
export interface IntakeFields extends AiSuggestion { projectId: string | null }

export function fieldsFromAi(ai: AiSuggestion | null, projects: Array<{ id: string; code: string }>): IntakeFields {
  const projCode = ai?.projectCode || null;
  const matched = projCode ? projects.find((p) => normalizeCode(p.code) === normalizeCode(projCode)) : undefined;
  return {
    docNumber: ai?.docNumber || null,
    title: ai?.title || null,
    projectCode: matched?.code || projCode || null,
    projectId: matched?.id || null,
    discipline: ai?.discipline || null,
    docType: ai?.docType || null,
    unitCode: ai?.unitCode || null,
    revision: ai?.revision || null,
    confidentiality: ai?.confidentiality || null,
    tags: ai?.tags || [],
    summary: ai?.summary || null,
  };
}

export async function parseFields(raw: string | null, organizationId: string): Promise<{ fields: IntakeFields; projects: Array<{ id: string; code: string; name: string }> }> {
  const projects = await db.project.findMany({ where: { organizationId, isActive: true }, select: { id: true, code: true, name: true } });
  let ai: AiSuggestion | null = null;
  if (raw) {
    try { ai = safeJsonParse(raw); } catch { ai = null; }
  }
  return { fields: fieldsFromAi(ai, projects), projects };
}

// تبدیل قلم پذیرش به سند رسمی + ویرایش + فایل + صف پردازش
export async function approveAsDocument(opts: {
  itemId: string;
  fields: {
    projectId?: string; docNumber?: string; title?: string; discipline?: string; docType?: string;
    unitId?: string; confidentiality?: string; revisionCode?: string;
  };
  reviewerId: string;
  reviewerName: string;
  reviewNote?: string;
}): Promise<{ ok: true; documentId: string; docNumber: string } | { ok: false; error: string }> {
  const item = await db.intakeItem.findUnique({ where: { id: opts.itemId } });
  if (!item) return { ok: false, error: 'قلم پذیرش یافت نشد.' };
  if (item.status === 'APPROVED') return { ok: false, error: 'این قلم قبلاً به سند تبدیل شده است.' };

  const organizationId = item.organizationId;
  const projects = await db.project.findMany({ where: { organizationId, isActive: true }, select: { id: true, code: true } });

  // فیلدها: اولویت با مقدار ویرایش‌شده؛ در نبودش از پیشنهاد مدل
  const { fields: aiFields } = await parseFields(item.aiJson, organizationId);
  const projectId = opts.fields.projectId || aiFields.projectId || '';
  const project = projects.find((p) => p.id === projectId);
  if (!project) return { ok: false, error: 'پروژه مقصد مشخص نیست — ابتدا پروژه را انتخاب و ذخیره کنید.' };

  // شماره سند: ویرایش‌شده → پیشنهاد مدل → از نام فایل؛ یکتا در پروژه
  const baseNum = normalizeCode(
    opts.fields.docNumber || aiFields.docNumber || item.originalName.replace(/\.[a-zA-Z0-9]+$/, '').slice(0, 60) || 'DOC',
  ).replace(/[^A-Z0-9\-_.]/g, '') || 'DOC';
  let docNumber = baseNum;
  for (let i = 2; i <= 50; i++) {
    const dup = await db.document.findFirst({ where: { organizationId, projectId, docNumber } });
    if (!dup) break;
    docNumber = `${baseNum}-A${i}`;
  }

  const title = (opts.fields.title || aiFields.title || item.originalName.replace(/\.[a-zA-Z0-9]+$/, '')).slice(0, 200);
  const unit = aiFields.unitCode && !opts.fields.unitId
    ? await db.unit.findFirst({ where: { code: normalizeCode(aiFields.unitCode), area: { project: { id: projectId } } }, select: { id: true } })
    : null;

  const created = await db.document.create({
    data: {
      organizationId,
      projectId,
      docNumber,
      docNumberRaw: opts.fields.docNumber || aiFields.docNumber || docNumber,
      title,
      discipline: opts.fields.discipline || aiFields.discipline || 'UNK',
      docType: opts.fields.docType || aiFields.docType || 'OTHER',
      unitId: opts.fields.unitId || unit?.id || null,
      confidentiality: opts.fields.confidentiality || aiFields.confidentiality || 'INTERNAL',
      origin: item.source === 'ADMIN' ? 'ADMIN_UPLOAD' : 'USER_SUBMISSION',
      status: 'RECEIVED',
      createdById: opts.reviewerId,
    },
  });

  const rev = await db.revision.create({
    data: {
      documentId: created.id,
      revisionCode: (opts.fields.revisionCode || aiFields.revision || '0').slice(0, 12) || '0',
      status: 'RECEIVED',
    },
  });
  await db.document.update({ where: { id: created.id }, data: { currentRevisionId: rev.id } });

  const file = await db.fileObject.create({
    data: {
      revisionId: rev.id,
      kind: 'ORIGINAL',
      storageKey: item.storageKey,
      originalName: item.originalName,
      mimeType: item.mimeType,
      size: item.size,
      sha256: item.sha256,
      quarantine: false,
      scanStatus: 'CLEAN',
      uploadedById: opts.reviewerId,
    },
  });

  const { enqueuePipelineForFile } = await import('@/lib/jobs');
  await enqueuePipelineForFile(file.id);

  await db.intakeItem.update({
    where: { id: item.id },
    data: {
      status: 'APPROVED',
      documentId: created.id,
      reviewedById: opts.reviewerId,
      reviewedAt: new Date(),
      reviewNote: opts.reviewNote || item.reviewNote || null,
    },
  });

  await audit({
    organizationId,
    actorId: opts.reviewerId,
    actorName: opts.reviewerName,
    action: 'INTAKE_APPROVED',
    objectType: 'Document',
    objectId: created.id,
    detail: `intake=${item.id} docNumber=${docNumber} project=${project.code} file=${file.id}`,
  });

  return { ok: true, documentId: created.id, docNumber };
}
