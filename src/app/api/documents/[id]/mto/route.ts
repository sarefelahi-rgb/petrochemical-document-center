// MTO/BOM سند — GET ردیف‌ها + POST (افزودن دستی / پیشنهاد با مدل زبانی از متن صفحات)
// سیاست §70: شرح خام، نرمال‌شده، متریال، سایز، کلاس، Sch، EndConn، واحد، مقدار و منبع حفظ می‌شود؛
// ردیف‌های پیشنهادی مدل تا تأیید کارشناس «پیشنهاد» می‌مانند.
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError } from '@/lib/guard';
import { can, canViewDocument } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { chatComplete, gatewayCircuitOpen } from '@/lib/modelGateway';

export const maxDuration = 150;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');
  if (!canViewDocument(ctx, doc)) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');
  if (!can(ctx, 'doc:content', doc)) return jsonError('اجازه مشاهده این سند را ندارید.', 403, 'FORBIDDEN');

  const rows = await db.mtoRow.findMany({
    where: { documentId: id },
    orderBy: { createdAt: 'asc' },
  });
  const canEdit = can(ctx, 'doc:edit', doc);

  return jsonOk({
    items: rows,
    canEdit,
    counts: {
      total: rows.length,
      confirmed: rows.filter((r) => r.status === 'CONFIRMED').length,
      suggested: rows.filter((r) => r.status === 'SUGGESTED').length,
    },
  });
}

interface MtoInput {
  rowLabel?: string; rawDesc?: string; normDesc?: string; material?: string;
  sizeMain?: string; sizeBranch?: string; cls?: string; schedule?: string; endConn?: string;
  unit?: string; qty?: number; pageNumber?: number;
}

function sanitize(r: MtoInput) {
  return {
    rowLabel: (r.rowLabel || '').slice(0, 60) || null,
    rawDesc: (r.rawDesc || '').slice(0, 300),
    normDesc: (r.normDesc || '').slice(0, 300) || null,
    material: (r.material || '').slice(0, 120) || null,
    sizeMain: (r.sizeMain || '').slice(0, 40) || null,
    sizeBranch: (r.sizeBranch || '').slice(0, 40) || null,
    cls: (r.cls || '').slice(0, 40) || null,
    schedule: (r.schedule || '').slice(0, 40) || null,
    endConn: (r.endConn || '').slice(0, 40) || null,
    unit: (r.unit || 'EA').slice(0, 16) || 'EA',
    qty: Number.isFinite(r.qty) && Number(r.qty) >= 0 ? Number(r.qty) : 0,
    pageNumber: Number.isInteger(r.pageNumber) && Number(r.pageNumber) >= 1 ? Number(r.pageNumber) : null,
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action: string = body?.action || 'add';

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');
  if (!canViewDocument(ctx, doc)) return jsonError('سند یافت نشد.', 404, 'NOT_FOUND');

  // --- پیشنهاد ردیف‌های MTO با مدل زبانی از متن صفحات (خروجی فقط پیشنهاد است) ---
  if (action === 'suggest') {
    if (!can(ctx, 'doc:edit', doc)) return jsonError('اجازه اصلاح این سند را ندارید.', 403, 'FORBIDDEN');
    if (gatewayCircuitOpen()) return jsonError('سرویس مدل زبانی موقتاً در دسترس نیست؛ بعداً تلاش کنید.', 503, 'MODEL_UNAVAILABLE');
    const pageTexts = await db.pageText.findMany({
      where: { file: { quarantine: false, revision: { documentId: id } } },
      orderBy: { pageNumber: 'asc' },
      take: 10,
    });
    const corpus = pageTexts.map((p) => `— صفحهٔ ${p.pageNumber}:\n${p.textRaw.slice(0, 4000)}`).join('\n').slice(0, 24000);
    if (!corpus.trim()) return jsonError('این سند هنوز متن صفحه (لایهٔ متنی/OCR) ندارد؛ ابتدا فایل را پردازش کنید.', 400, 'NO_TEXT');

    const result = await chatComplete(
      [
        { role: 'system', content: 'تو استخراج‌کنندهٔ جدول MTO/BOM از مدارک مهندسی هستی. فقط JSON معتبر خروجی بده، بدون هیچ متن دیگری. هر مقدار ناخوانا را null بگذار — هیچ چیز را حدس نزن.' },
        { role: 'user', content:
          'از متن زیر همهٔ ردیف‌های متریال/MTO را استخراج کن. خروجی دقیقاً این شکل: {"rows":[{"rowLabel":"...","rawDesc":"عین شرح","material":"...","sizeMain":"...","sizeBranch":null,"cls":"...","schedule":null,"endConn":null,"unit":"M|EA|...","qty":123,"pageNumber":1}]}\n' +
          'قواعد: qty عدد است؛ واحد از جدول؛ اگر ردیفی مطمئن نیستی حذفش کن. حداکثر ۴۰ ردیف.\n\nمتن سند:\n' + corpus },
      ],
      { timeoutMs: 120_000 },
    );
    if (!result.ok) return jsonError(`استخراج با مدل ناموفق بود: ${result.error || 'خطای نامشخص'}`, 502, 'MODEL_FAILED');
    let parsed: { rows?: MtoInput[] };
    try {
      const m = result.content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : result.content);
    } catch {
      return jsonError('خروجی مدل قابل تفسیر نبود؛ دوباره تلاش کنید.', 502, 'MODEL_PARSE_FAILED');
    }
    const rows = Array.isArray(parsed.rows) ? parsed.rows.slice(0, 40) : [];
    const created: Array<{ id: string }> = [];
    for (const r of rows) {
      const s = sanitize(r);
      if (!s.rawDesc) continue;
      created.push(await db.mtoRow.create({
        data: {
          documentId: id,
          revisionId: doc.currentRevisionId,
          ...s,
          source: 'LLM_SUGGESTION',
          status: 'SUGGESTED',
          note: 'پیشنهاد مدل زبانی — نیازمند تأیید کارشناس',
          createdById: auth.user.id,
        },
      }));
    }
    await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'MTO_SUGGEST', objectType: 'document', objectId: id, detail: `created=${created.length}` });
    return jsonOk({ created: created.length, items: created });
  }

  // --- افزودن دستی ردیف ---
  if (!can(ctx, 'doc:edit', doc)) return jsonError('اجازه اصلاح این سند را ندارید.', 403, 'FORBIDDEN');
  const s = sanitize(body?.row || {});
  if (!s.rawDesc) return jsonError('شرح ردیف لازم است.');
  const row = await db.mtoRow.create({
    data: { documentId: id, revisionId: doc.currentRevisionId, ...s, source: 'MANUAL', status: 'CONFIRMED', createdById: auth.user.id },
  });
  await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'MTO_ROW_ADD', objectType: 'document', objectId: id, detail: `row=${row.id}` });
  return jsonOk({ item: row });
}
