'use client';
// جزئیات سند — شناسنامه، سه محور وضعیت مستقل، ویرایش‌ها، فایل‌ها، نمایشگر مرحله B، استخراج و بازپردازش
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Download, Eye, Star, ArrowRight, ShieldCheck, FileQuestion, RefreshCw, Loader2, FolderOpen, Bot } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { api, fmtJalali, fmtSize, STATUS_LABELS, CONF_LABELS, PROC_LABELS } from './api';
import { StatusBadge, ConfBadge, RevBadge, SampleBadge } from './badges';
import { PdfViewerDialog, type ViewerTarget } from './pdf-viewer';
import { ExtractionPanel } from './extraction-panel';
import { ComparePanel } from './compare-panel';
import { MtoPanel } from './mto-panel';
import { ApprovalPanel } from './approval-panel';

interface DocDetail {
  id: string; docNumber: string; docNumberRaw: string; title: string;
  discipline: string; docType: string;
  project: { id: string; code: string; name: string };
  unit: { code: string; name: string; area: { code: string; name: string } } | null;
  origin: string | null; ownerUnit: string | null;
  confidentiality: string; status: string;
  processingStatus: string; extractionStatus: string; engineeringStatus: string;
  validRevisionId: string | null; isSample: boolean; createdAt: string; updatedAt: string;
  revisions: Array<{
    id: string; revisionCode: string; status: string; purpose: string | null;
    docDate: string | null; receivedDate: string; effectiveDate: string | null; isSample: boolean;
    files: Array<{ id: string; originalName: string; mimeType: string; size: number; sha256: string; kind: string; scanStatus: string; createdAt: string }>;
  }>;
  links: Array<{ type: string; ref: string; description: string | null; status: string }>;
}

interface Me { user: { role: string } }

export function DocumentDetail({ docId, go, openPageTarget }: { docId: string; go: (view: string, param?: string) => void; openPageTarget?: { page: number; rect?: [number, number, number, number] | null; query?: string | null } | null }) {
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const [viewerTarget, setViewerTarget] = useState<ViewerTarget | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reprocessing, setReprocessing] = useState<string | null>(null);

  const load = useCallback(() => {
    api<DocDetail>(`/api/documents/${docId}`).then(setDoc).catch((e) => { if (e.status === 404) setNotFound(true); else setError(e.message); });
  }, [docId]);

  useEffect(() => {
    load();
    api<Me>('/api/auth/me').then(setMe).catch(() => {});
  }, [load]);

  const isManager = me?.user.role === 'ADMIN' || me?.user.role === 'DOC_CONTROLLER';
  const canEdit = me?.user.role === 'ADMIN' || me?.user.role === 'DOC_CONTROLLER' || me?.user.role === 'ENGINEER';

  // بازکردن نمایشگر با هدف صفحه/هایلایت (لینک صفحه از ارجاع‌ها یا URL)
  function openViewerFile(f: DocDetail['revisions'][number]['files'][number], r: DocDetail['revisions'][number], target?: { page?: number; rect?: [number, number, number, number] | null; query?: string | null }) {
    if (!doc) return;
    setViewerTarget({
      file: { id: f.id, name: f.originalName, mimeType: f.mimeType },
      doc: {
        documentId: docId, docNumber: doc.docNumberRaw, title: doc.title,
        revisionCode: r.revisionCode, revisionStatus: r.status,
        isValidRevision: doc.validRevisionId === r.id,
        docDate: r.docDate, confidentiality: doc.confidentiality, isSample: doc.isSample,
      },
      initialPage: target?.page || 1,
      highlightRect: target?.rect || null,
      searchQuery: target?.query || null,
    });
  }

  async function openFile(fileId: string, name: string, mime: string, inline: boolean, rev?: DocDetail['revisions'][number], target?: { page?: number; rect?: [number, number, number, number] | null; query?: string | null }) {
    if (inline && rev) { openViewerFile(rev.files.find((f) => f.id === fileId)!, rev, target); return; }
    if (inline && rev === undefined) {
      // در حالت بدون ویرایش (ارجاع داخلی) — یافتن ویرایش فایل
      const found = doc?.revisions.find((r) => r.files.some((f) => f.id === fileId));
      if (found) { openViewerFile(found.files.find((f) => f.id === fileId)!, found, target); return; }
    }
    try {
      const r = await api<{ url: string }>(`/api/files/${fileId}/download-token`, { method: 'POST' });
      window.location.assign(r.url);
    } catch (e) {
      toast({ title: 'دریافت فایل', description: (e as Error).message, variant: 'destructive' });
    }
  }

  // لینک صفحه از URL (?view=document&doc=…&page=N)
  useEffect(() => {
    if (!doc || !openPageTarget) return;
    const rev = doc.revisions.find((r) => r.files.length > 0);
    if (rev && rev.files[0]) {
      openViewerFile(rev.files[0], rev, { page: openPageTarget.page, rect: openPageTarget.rect, query: openPageTarget.query });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, openPageTarget]);

  async function reprocess(fileId: string) {
    setReprocessing(fileId);
    try {
      const r = await api<{ note: string }>(`/api/files/${fileId}/reprocess`, { method: 'POST' });
      toast({ title: 'بازپردازش در صف قرار گرفت', description: r.note });
      load();
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setReprocessing(null);
    }
  }

  async function setValidRev(revId: string) {
    try {
      await api(`/api/documents/${docId}/revisions`, { method: 'PATCH', json: { revisionId: revId } });
      toast({ title: 'نسخه معتبر تعیین شد', description: 'ویرایش‌های قبلی تأییدشده منسوخ می‌شوند.' });
      load();
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    }
  }

  async function toggleFavorite() {
    await api(`/api/documents/${docId}/favorite`, { method: 'POST' });
    toast({ title: 'علاقه‌مندی به‌روزرسانی شد' });
  }

  if (notFound) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <FileQuestion className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="font-medium">سند یافت نشد یا مجاز به مشاهده آن نیستید.</p>
          <p className="text-sm text-muted-foreground">اگر انتظار دسترسی دارید، با مدیر اسناد تماس بگیرید.</p>
          <Button variant="outline" onClick={() => go('documents')}><ArrowRight className="h-4 w-4" /> بازگشت به مرکز اسناد</Button>
        </CardContent>
      </Card>
    );
  }

  if (error) return <Card><CardContent className="p-6 text-sm text-red-700 dark:text-red-300">{error}</CardContent></Card>;
  if (!doc) return <Card><CardContent className="p-6 text-sm text-muted-foreground">در حال بارگذاری…</CardContent></Card>;

  const previewable = (mime: string) => mime === 'application/pdf' || mime.startsWith('image/');

  return (
    <div className="space-y-4" data-testid="document-detail">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Button variant="ghost" size="sm" onClick={() => go('documents')} className="mb-1"><ArrowRight className="h-4 w-4" /> مرکز اسناد</Button>
          <h1 className="text-xl font-bold flex items-center gap-2 flex-wrap">
            <span className="code-ltr">{doc.docNumberRaw}</span>
            {doc.isSample && <SampleBadge />}
          </h1>
          <p className="text-sm text-muted-foreground">{doc.title}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => go('assistant', docId)} title="پرسش از دستیار هوشمند محدود به همین سند — خواندن کل اطلاعات مجاز">
            <Bot className="h-4 w-4" /> پرسش از دستیار دربارهٔ این سند
          </Button>
          <Button variant="outline" onClick={toggleFavorite}><Star className="h-4 w-4" /> علاقه‌مندی</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* شناسنامه */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">شناسنامه سند</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Field label="پروژه" value={<><span className="code-ltr">{doc.project.code}</span> {doc.project.name}</>} />
            <Field label="ناحیه / واحد" value={doc.unit ? <><span className="code-ltr">{doc.unit.area.code}/{doc.unit.code}</span> {doc.unit.name}</> : 'نامعلوم'} />
            <Field label="رشته" value={<span className="code-ltr">{doc.discipline}</span>} />
            <Field label="نوع مدرک" value={<span className="code-ltr">{doc.docType}</span>} />
            <Field label="مبدأ" value={doc.origin ? <span className="code-ltr">{doc.origin}</span> : 'نامعلوم'} />
            <Field label="مالک" value={doc.ownerUnit || 'نامعلوم'} />
            <Field label="تاریخ ثبت" value={fmtJalali(doc.createdAt)} />
            <Field label="آخرین تغییر" value={fmtJalali(doc.updatedAt, true)} />
            <Field label="سطح محرمانگی" value={<ConfBadge conf={doc.confidentiality} />} />
            <Field label="وضعیت مهندسی سند" value={<StatusBadge status={doc.status} />} />
            <Field label="وضعیت پردازش فایل" value={<Badge variant="outline" className="bg-slate-50 dark:bg-slate-800">{PROC_LABELS[doc.processingStatus] || doc.processingStatus}</Badge>} />
            <Field label="وضعیت استخراج" value={<Badge variant="outline" className="bg-slate-50 dark:bg-slate-800">
              {doc.extractionStatus === 'NOT_EXTRACTED' ? 'استخراج نشده' : doc.extractionStatus === 'VERIFIED' ? 'تأییدشده' : 'استخراج‌شده، تأییدنشده'}
            </Badge>} />
          </CardContent>
        </Card>

        {/* روابط */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> ارتباط‌ها</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {doc.links.length === 0 && <p className="text-muted-foreground">ارتباط Tag/Line ثبت نشده است.</p>}
            {doc.links.map((l, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="code-ltr font-medium">{l.ref || '—'}</span>
                <Badge variant="outline" className={l.status === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'}>
                  {l.type === 'TAG' ? 'تجهیز' : 'خط'} · {l.status === 'CONFIRMED' ? 'تأییدشده' : 'پیشنهادی'}
                </Badge>
              </div>
            ))}
            {doc.links.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => go('dossier', doc.links[0].ref)}
              >
                <FolderOpen className="h-4 w-4" /> پروندهٔ تجهیز / خط مرتبط
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ویرایش‌ها و فایل‌ها */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ویرایش‌ها (Revision) و فایل‌ها</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">آخرین فایل بارگذاری‌شده لزوماً «نسخه معتبر برای استفاده» نیست؛ مدیر اسناد نسخه معتبر را تعیین می‌کند.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {doc.revisions.length === 0 && <p className="text-sm text-muted-foreground">ویرایشی ثبت نشده است.</p>}
          {doc.revisions.map((r) => (
            <div key={r.id} className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <RevBadge code={r.revisionCode} status={r.status} valid={doc.validRevisionId === r.id} />
                  <StatusBadge status={r.status === 'SUPERSEDED' ? 'SUPERSEDED' : doc.status} />
                </div>
                {isManager && doc.validRevisionId !== r.id && (
                  <Button size="sm" variant="outline" onClick={() => setValidRev(r.id)}>تعیین به‌عنوان نسخه معتبر</Button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                <span>دریافت: {fmtJalali(r.receivedDate)}</span>
                <span>تاریخ مدرک: {fmtJalali(r.docDate)}</span>
                <span>تاریخ اثرگذاری: {fmtJalali(r.effectiveDate)}</span>
                <span>هدف: {r.purpose || 'نامعلوم'}</span>
              </div>
              <Separator />
              {r.files.length === 0 && <p className="text-sm text-muted-foreground">فایلی برای این ویرایش ثبت نشده است.</p>}
              {r.files.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 flex-wrap rounded-lg bg-muted/40 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{f.originalName}</div>
                    <div className="text-xs text-muted-foreground font-mono" dir="ltr">SHA-256: {f.sha256.slice(0, 16)}… · {fmtSize(f.size)}</div>
                  </div>
                  <div className="flex gap-2">
                    {previewable(f.mimeType) && (
                      <Button size="sm" variant="outline" onClick={() => openFile(f.id, f.originalName, f.mimeType, true, r)}>
                        <Eye className="h-4 w-4" /> نمایشگر
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openFile(f.id, f.originalName, f.mimeType, false)}>
                      <Download className="h-4 w-4" /> دانلود
                    </Button>
                    {canEdit && (f.mimeType === 'application/pdf' || f.mimeType.startsWith('image/')) && (
                      <Button size="sm" variant="ghost" disabled={reprocessing === f.id} onClick={() => reprocess(f.id)} title="پردازش مجدد — مقادیر تأییدشده حفظ می‌شود">
                        {reprocessing === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} بازپردازش
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* شناسنامهٔ استخراج‌شده — مرحله B */}
      <ExtractionPanel
        documentId={docId}
        onOpenPage={(fileId, page, rect) => openFile(fileId, '', 'application/pdf', true, undefined, { page, rect })}
      />

      {/* مقایسهٔ نسخه‌ها — مرحله C */}
      <ComparePanel documentId={docId} revisions={doc.revisions} />

      {/* گردش تأیید — مرحله D */}
      <ApprovalPanel documentId={docId} canEdit={canEdit} />

      {/* MTO/BOM — مرحله D */}
      <MtoPanel documentId={docId} canEdit={canEdit} />

      {/* نمایشگر مرحله B */}
      <PdfViewerDialog target={viewerTarget} onClose={() => setViewerTarget(null)} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}
