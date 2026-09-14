'use client';
// پذیرش هوشمند اسناد — بارگذاری فایل، شناسایی و دسته‌بندی خودکار با هوش مصنوعی
// ادمین: ویرایش/حذف/تأیید (تبدیل به سند رسمی) / رد / طبقه‌بندی مجدد
// کاربر: ارسال فایل با استخراج و دسته‌بندی خودکار + پیگیری وضعیت تأیید ادمین
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UploadCloud, Inbox, Sparkles, Pencil, Trash2, Check, X, RefreshCw, FileText, Info, Loader2, SendHorizonal } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { api, fmtJalali, fmtSize, CONF_LABELS } from './api';

interface Proj { id: string; code: string; name: string }
interface VocabItem { domain: string; code: string; label: string }
interface AiFields {
  docNumber?: string | null; title?: string | null; projectCode?: string | null; projectId?: string | null;
  discipline?: string | null; docType?: string | null; unitCode?: string | null; revision?: string | null;
  confidentiality?: string | null; tags?: string[]; summary?: string | null;
}
interface IntakeItem {
  id: string; status: string; source: string; originalName: string; mimeType: string; size: number;
  sha256: string; note: string | null; pageCount: number | null; textSource: string | null;
  hasText: boolean; extractedSample: string; ai: AiFields | null; aiConfidence: number | null; aiNote: string | null;
  reviewNote: string | null; uploader: { fullName: string; username: string } | null;
  document: { id: string; docNumber: string; title: string } | null; createdAt: string; reviewedAt: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  CLASSIFIED: { label: 'پیش‌نویس ادمین', cls: 'bg-sky-700/10 text-sky-700' },
  PENDING_APPROVAL: { label: 'در انتظار تأیید مدیر', cls: 'bg-amber-700/10 text-amber-700' },
  APPROVED: { label: 'تأییدشده (سند رسمی)', cls: 'bg-emerald-700/10 text-emerald-700' },
  REJECTED: { label: 'ردشده', cls: 'bg-red-700/10 text-red-700' },
};

export function IntakeView({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [tab, setTab] = useState<string>(isAdmin ? 'CLASSIFIED' : 'PENDING_APPROVAL');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ name: string; step: string } | null>(null);
  const [note, setNote] = useState('');
  const [projects, setProjects] = useState<Proj[]>([]);
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [editItem, setEditItem] = useState<IntakeItem | null>(null);
  const [editFields, setEditFields] = useState<AiFields>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: IntakeItem[] }>(`/api/intake${tab ? `?status=${tab}` : ''}`);
      setItems(r.items);
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    }
  }, [tab]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<{ projects: Proj[] }>('/api/tree').then((r) => setProjects(r.projects)).catch(() => { });
    api<{ items: VocabItem[] }>('/api/admin/vocabulary').then((r) => setVocab(r.items)).catch(() => { });
  }, []);

  const disciplines = vocab.filter((v) => v.domain === 'DISCIPLINE');
  const docTypes = vocab.filter((v) => v.domain === 'DOC_TYPE');

  // آپلود با استخراج + دسته‌بندی خودکار (فایل‌به‌فایل برای نمایش مرحله)
  async function uploadFiles(files: FileList | File[]) {
    for (const f of Array.from(files)) {
      setUploading({ name: f.name, step: 'بارگذاری و استخراج متن…' });
      const fd = new FormData();
      fd.append('file', f);
      if (note.trim()) fd.append('note', note.trim());
      try {
        const r = await api<{ id: string; status: string; ai: AiFields | null; aiConfidence: number; extraction: { ok: boolean; source: string | null; textChars: number } }>('/api/intake', { method: 'POST', body: fd });
        setUploading({ name: f.name, step: 'دسته‌بندی هوشمند…' });
        toast({
          title: 'فایل ثبت شد',
          description: r.ai
            ? `دسته‌بندی خودکار با اطمینان ${(r.aiConfidence * 100).toFixed(0)}٪ انجام شد${r.extraction.source ? ` (${r.extraction.source === 'OCR' ? 'OCR' : r.extraction.source === 'TEXT_LAYER' ? 'لایهٔ متنی' : 'آفیس/متن'})` : ''}.`
            : 'استخراج انجام شد اما دسته‌بندی خودکار در دسترس نبود — به‌صورت دستی تکمیل کنید.',
        });
      } catch (e) {
        toast({ title: `خطا در «${f.name}»`, description: (e as Error).message, variant: 'destructive' });
      }
    }
    setUploading(null); setNote(''); load();
  }

  async function doApprove(it: IntakeItem, silent = false) {
    setBusyId(it.id);
    try {
      const r = await api<{ docNumber: string; documentId: string }>(`/api/intake/${it.id}`, {
        method: 'PUT',
        json: { action: 'approve', fields: it.ai?.projectId ? { projectId: it.ai.projectId } : undefined, reviewNote: silent ? undefined : undefined },
      });
      toast({ title: 'به سند رسمی تبدیل شد', description: `شماره سند: ${r.docNumber}` });
      load();
    } catch (e) {
      toast({ title: 'تأیید ناموفق', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusyId(null); }
  }

  async function doReject(it: IntakeItem) {
    setBusyId(it.id);
    try {
      await api(`/api/intake/${it.id}`, { method: 'PUT', json: { action: 'reject', reviewNote: 'رد توسط مدیر' } });
      toast({ title: 'رد شد' });
      load();
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusyId(null); }
  }

  async function doDelete(it: IntakeItem) {
    setBusyId(it.id);
    try {
      await api(`/api/intake/${it.id}`, { method: 'DELETE' });
      toast({ title: 'حذف شد' });
      load();
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusyId(null); }
  }

  async function doReclassify(it: IntakeItem) {
    setBusyId(it.id);
    try {
      await api(`/api/intake/${it.id}`, { method: 'POST' });
      toast({ title: 'طبقه‌بندی مجدد انجام شد' });
      load();
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusyId(null); }
  }

  function openEdit(it: IntakeItem) {
    setEditItem(it);
    setEditFields({ ...(it.ai || {}) });
  }

  async function saveEdit() {
    if (!editItem) return;
    setBusyId(editItem.id);
    try {
      await api(`/api/intake/${editItem.id}`, { method: 'PATCH', json: { ...editFields, unitId: editFields.unitCode || undefined, revisionCode: editFields.revision || undefined } });
      toast({ title: 'ذخیره شد' });
      setEditItem(null); load();
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusyId(null); }
  }

  const tabs: Array<{ key: string; label: string }> = isAdmin
    ? [
      { key: 'CLASSIFIED', label: 'پیش‌نویس من' },
      { key: 'PENDING_APPROVAL', label: 'در انتظار تأیید' },
      { key: 'APPROVED', label: 'تأییدشده' },
      { key: 'REJECTED', label: 'ردشده' },
    ]
    : [
      { key: 'PENDING_APPROVAL', label: 'ارسال‌های من' },
      { key: 'APPROVED', label: 'تأییدشده' },
      { key: 'REJECTED', label: 'ردشده' },
    ];

  return (
    <div className="space-y-4" data-testid="intake-view">
      <h1 className="text-xl font-bold">پذیرش هوشمند اسناد</h1>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          {isAdmin
            ? 'فایل‌های اسناد پروژه را با هر پسوند مجاز (PDF، تصویر، Word، Excel، CSV، متن) بارگذاری کنید؛ هوش مصنوعی متن را استخراج و سند را شناسایی و دسته‌بندی می‌کند. اختیار ویرایش، حذف و ثبت نهایی با شماست.'
            : 'فایل خود را ارسال کنید؛ سامانه به‌صورت خودکار اطلاعات را استخراج و دسته‌بندی می‌کند و پرونده برای تأیید مدیر سامانه ارسال می‌شود. وضعیت ارسال را همین‌جا می‌بینید.'}
        </AlertDescription>
      </Alert>

      {/* بارگذاری */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><UploadCloud className="h-4 w-4 text-teal-700" /> ارسال فایل برای شناسایی و دسته‌بندی خودکار</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length && !uploading) uploadFiles(e.dataTransfer.files); }}
            onClick={() => !uploading && inputRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-teal-600 hover:bg-accent/40 transition-colors"
            role="button" aria-label="انتخاب یا کشیدن فایل‌ها برای پذیرش هوشمند" tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          >
            <UploadCloud className="h-8 w-8 mx-auto text-teal-700 dark:text-teal-400 mb-2" />
            <p className="font-medium text-sm">فایل‌ها را اینجا بکشید یا کلیک کنید</p>
            <p className="text-xs text-muted-foreground mt-1">PDF، PNG/JPEG، TIFF، DOCX، XLSX، CSV، TXT — سقف هر فایل ۱۲۰ مگابایت</p>
            <input ref={inputRef} type="file" multiple className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.docx,.xlsx,.csv,.txt"
              onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ''; }} />
          </div>
          {!isAdmin && (
            <div className="space-y-1.5">
              <Label htmlFor="intake-note">یادداشت برای مدیر (اختیاری)</Label>
              <Input id="intake-note" value={note} onChange={(e) => setNote(e.target.value)} dir="auto" placeholder="مثال: ایزومتریک به‌روزشدهٔ خط 1183" />
            </div>
          )}
          {uploading && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm" data-testid="intake-uploading">
              <Loader2 className="h-4 w-4 animate-spin text-teal-700" />
              <span className="truncate" dir="ltr">{uploading.name}</span>
              <span className="text-xs text-muted-foreground">— {uploading.step}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* فهرست اقلام */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Inbox className="h-4 w-4 text-teal-700" /> {isAdmin ? 'صف پذیرش' : 'ارسال‌های من'}</CardTitle>
          <Tabs value={tab} onValueChange={setTab} className="mt-2">
            <TabsList className="flex-wrap h-auto">
              {tabs.map((t) => <TabsTrigger key={t.key} value={t.key} className="text-xs">{t.label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">موردی در این وضعیت نیست.</p>}
          {items.map((it) => {
            const st = STATUS_META[it.status] || { label: it.status, cls: '' };
            const conf = it.aiConfidence != null ? `اطمینان ${(it.aiConfidence * 100).toFixed(0)}٪` : '';
            return (
              <div key={it.id} className="rounded-xl border p-3 space-y-2" data-testid="intake-item">
                <div className="flex flex-wrap items-center gap-2">
                  <FileText className="h-4 w-4 text-teal-700 shrink-0" />
                  <span className="font-medium text-sm truncate max-w-[16rem]" dir="ltr" title={it.originalName}>{it.originalName}</span>
                  <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                  <span className="text-[11px] text-muted-foreground">{fmtSize(it.size)} · {fmtJalali(it.createdAt, true)}</span>
                  {it.uploader && <span className="text-[11px] text-muted-foreground">· ارسال: <span dir="auto">{it.uploader.fullName}</span></span>}
                  {it.note && <span dir="auto" className="text-[11px] text-muted-foreground w-full text-start">یادداشت: «{it.note}»</span>}
                </div>

                {/* پیشنهاد هوش مصنوعی */}
                {it.ai && (
                  <div className="rounded-lg bg-muted/40 p-2.5 text-xs space-y-1" data-testid="intake-ai">
                    <p className="flex items-center gap-1.5 font-medium text-teal-800 dark:text-teal-300">
                      <Sparkles className="h-3.5 w-3.5" /> دسته‌بندی خودکار {conf && <span className="font-normal text-muted-foreground">({conf})</span>}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                      <p>شماره: <span className="code-ltr font-medium">{it.ai.docNumber || '—'}</span></p>
                      <p className="col-span-2 md:col-span-3 truncate">عنوان: <span dir="auto" className="font-medium">{it.ai.title || '—'}</span></p>
                      <p>پروژه: <span className="code-ltr font-medium">{it.ai.projectCode || '—'}</span></p>
                      <p>رشته: <span className="code-ltr">{it.ai.discipline || '—'}</span></p>
                      <p>نوع: <span className="code-ltr">{it.ai.docType || '—'}</span></p>
                      <p>محرمانگی: <span className="font-medium">{it.ai.confidentiality ? (CONF_LABELS[it.ai.confidentiality] || it.ai.confidentiality) : '—'}</span></p>
                    </div>
                    {it.ai.summary && <p dir="auto" className="text-muted-foreground leading-5 text-start">خلاصه: {it.ai.summary}</p>}
                    {it.aiNote && <p className="text-amber-700 dark:text-amber-400">{it.aiNote}</p>}
                  </div>
                )}
                {!it.ai && it.aiNote && <p className="text-xs text-amber-700 dark:text-amber-400">{it.aiNote}</p>}

                {/* نمونهٔ متن استخراج‌شده */}
                {it.hasText && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">متن استخراج‌شده ({it.textSource === 'OCR' ? 'OCR' : it.textSource === 'TEXT_LAYER' ? 'لایهٔ متنی' : 'فایل'}{it.pageCount ? `، ${it.pageCount} صفحه` : ''})</summary>
                    <p className="mt-1.5 rounded bg-muted/40 p-2 leading-5 max-h-40 overflow-y-auto whitespace-pre-wrap" dir="auto">{it.extractedSample}…</p>
                  </details>
                )}
                {!it.hasText && <p className="text-xs text-muted-foreground">متن قابل استخراجی یافت نشد{it.textSource === null ? ' (فایل بدون محتوای متنی یا فرمت غیرمتنی)' : ''}.</p>}

                {/* وضعیت نهایی */}
                {it.status === 'APPROVED' && it.document && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">✓ سند رسمی: <span className="code-ltr font-medium">{it.document.docNumber}</span> — <span dir="auto">«{it.document.title}»</span></p>
                )}
                {it.status === 'REJECTED' && it.reviewNote && <p className="text-xs text-red-700 dark:text-red-400">دلیل رد: {it.reviewNote}</p>}

                {/* اعمال */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {isAdmin && it.status !== 'APPROVED' && (
                    <>
                      <Button size="sm" onClick={() => doApprove(it)} disabled={busyId === it.id}>
                        {busyId === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} ثبت به‌عنوان سند
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(it)} disabled={busyId === it.id}>
                        <Pencil className="h-3.5 w-3.5" /> ویرایش
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => doReclassify(it)} disabled={busyId === it.id}>
                        <RefreshCw className="h-3.5 w-3.5" /> طبقه‌بندی مجدد
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => doReject(it)} disabled={busyId === it.id}>
                        <X className="h-3.5 w-3.5" /> رد
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => doDelete(it)} disabled={busyId === it.id}>
                        <Trash2 className="h-3.5 w-3.5" /> حذف
                      </Button>
                    </>
                  )}
                  {!isAdmin && it.status === 'PENDING_APPROVAL' && (
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => doDelete(it)} disabled={busyId === it.id}>
                      <Trash2 className="h-3.5 w-3.5" /> حذف ارسال
                    </Button>
                  )}
                  {!isAdmin && it.status === 'PENDING_APPROVAL' && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <SendHorizonal className="h-3 w-3" /> برای تأیید به مدیر سامانه ارسال شد
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* دیالوگ ویرایش (ادمین) */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ویرایش اطلاعات شناسایی‌شده</DialogTitle>
            <DialogDescription dir="ltr" className="truncate">{editItem?.originalName}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>شماره سند</Label>
              <Input dir="ltr" className="text-left font-mono" value={editFields.docNumber || ''} onChange={(e) => setEditFields({ ...editFields, docNumber: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>ویرایش (Revision)</Label>
              <Input dir="ltr" className="text-left" value={editFields.revision || ''} onChange={(e) => setEditFields({ ...editFields, revision: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>عنوان</Label>
              <Input dir="auto" value={editFields.title || ''} onChange={(e) => setEditFields({ ...editFields, title: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>پروژه *</Label>
              <Select value={editFields.projectId || undefined} onValueChange={(v) => setEditFields({ ...editFields, projectId: v, projectCode: projects.find((p) => p.id === v)?.code || null })}>
                <SelectTrigger><SelectValue placeholder="انتخاب پروژه" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}><span className="code-ltr">{p.code}</span> {p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>رشته</Label>
              <Select value={editFields.discipline || 'UNK'} onValueChange={(v) => setEditFields({ ...editFields, discipline: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {disciplines.map((d) => <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>)}
                  <SelectItem value="UNK">نامعلوم</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>نوع مدرک</Label>
              <Select value={editFields.docType || 'OTHER'} onValueChange={(v) => setEditFields({ ...editFields, docType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {docTypes.map((d) => <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>)}
                  <SelectItem value="OTHER">سایر</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>سطح محرمانگی</Label>
              <Select value={editFields.confidentiality || 'INTERNAL'} onValueChange={(v) => setEditFields({ ...editFields, confidentiality: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONF_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>انصراف</Button>
            <Button onClick={saveEdit} disabled={busyId !== null}>ذخیره</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
