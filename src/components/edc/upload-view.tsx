'use client';
// بارگذاری مدارک — چندفایلی، پیشرفت واقعی، لغو، تلاش مجدد، ثبت شناسنامه، CSV متادیتا
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { UploadCloud, X, RotateCcw, FileSpreadsheet, Info } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { api } from './api';

interface Proj { id: string; code: string; name: string; areas: Array<{ id: string; code: string; name: string; units: Array<{ id: string; code: string; name: string }> }> }
interface VocabItem { domain: string; code: string; label: string }

interface UploadItem {
  id: string; file: File; status: 'pending' | 'uploading' | 'done' | 'error' | 'cancelled';
  progress: number; error?: string; result?: { sha256: string; duplicateOf: string | null; label: string };
}

function genOpId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function UploadView({ go }: { go: (view: string, param?: string) => void }) {
  const [projects, setProjects] = useState<Proj[]>([]);
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [projectId, setProjectId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [title, setTitle] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [docType, setDocType] = useState('');
  const [revisionCode, setRevisionCode] = useState('0');
  const [confidentiality, setConfidentiality] = useState('INTERNAL');
  const [items, setItems] = useState<UploadItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [docId, setDocId] = useState('');
  const [csvMode, setCsvMode] = useState(false);
  const [revisionId, setRevisionId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrs = useRef<Map<string, XMLHttpRequest>>(new Map());

  useEffect(() => {
    api<{ projects: Proj[] }>('/api/tree').then((r) => setProjects(r.projects)).catch(() => {});
    api<{ items: VocabItem[] }>('/api/admin/vocabulary').then((r) => setVocab(r.items)).catch(() => {});
  }, []);

  const disciplines = vocab.filter((v) => v.domain === 'DISCIPLINE');
  const docTypes = vocab.filter((v) => v.domain === 'DOC_TYPE');
  const selProject = projects.find((p) => p.id === projectId);
  const units = selProject?.areas.flatMap((a) => a.units.map((u) => ({ ...u, areaName: a.name }))) || [];

  const addFiles = (files: FileList | File[]) => {
    const next = Array.from(files).map((f) => ({ id: genOpId(), file: f, status: 'pending' as const, progress: 0 }));
    setItems((prev) => [...prev, ...next]);
  };

  const removeItem = (id: string) => {
    const xhr = xhrs.current.get(id);
    if (xhr) xhr.abort();
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const retryItem = (item: UploadItem) => {
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: 'pending', progress: 0, error: undefined } : i));
  };

  // آپلود واقعی با XHR برای درصد پیشرفت و لغو
  const uploadItem = (item: UploadItem) => new Promise<void>((resolve) => {
    if (!docId) {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: 'error', error: 'ابتدا شناسنامه سند را ثبت کنید.' } : i));
      resolve(); return;
    }
    const xhr = new XMLHttpRequest();
    xhrs.current.set(item.id, xhr);
    const form = new FormData();
    form.append('file', item.file);
    form.append('documentId', docId);
    form.append('opId', item.id);
    if (revisionId) form.append('revisionId', revisionId);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, progress: pct, status: 'uploading' } : i));
      }
    };
    xhr.onload = () => {
      xhrs.current.delete(item.id);
      try {
        const resp = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) {
          setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: 'done', progress: 100, result: resp } : i));
          toast({ title: 'فایل ذخیره شد', description: resp.duplicateOf ? 'هشدار: محتوای یکسانی قبلاً ثبت شده است.' : `SHA-256 تأیید شد: ${resp.sha256?.slice(0, 12)}…` });
        } else {
          setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: 'error', error: resp.error || `خطای ${xhr.status}` } : i));
        }
      } catch {
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: 'error', error: 'پاسخ نامعتبر از سرور' } : i));
      }
      resolve();
    };
    xhr.onerror = () => {
      xhrs.current.delete(item.id);
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: 'error', error: 'قطع شبکه — با «تلاش مجدد» دوباره بفرستید.' } : i));
      resolve();
    };
    xhr.onabort = () => {
      xhrs.current.delete(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      resolve();
    };
    xhr.open('POST', '/api/upload');
    xhr.withCredentials = true;
    xhr.send(form);
  });

  const createPassportAndRevision = async (): Promise<string | null> => {
    if (!projectId || !docNumber.trim() || !title.trim()) {
      toast({ title: 'اطلاعات ناقص', description: 'پروژه، شماره سند و عنوان الزامی است.', variant: 'destructive' });
      return null;
    }
    setCreating(true);
    try {
      const r = await api<{ id: string }>('/api/documents', { method: 'POST', json: { docNumber, title, projectId, discipline: discipline || 'UNK', docType: docType || 'OTHER', unitId: unitId || undefined, confidentiality } });
      const rev = await api<{ id: string }>(`/api/documents/${r.id}/revisions`, { method: 'POST', json: { revisionCode: revisionCode || '0' } });
      setDocId(r.id); setRevisionId(rev.id);
      toast({ title: 'شناسنامه و ویرایش ثبت شد', description: `شماره سند: ${docNumber}` });
      return r.id;
    } catch (e) {
      toast({ title: 'ثبت شناسنامه ناموفق', description: (e as Error).message, variant: 'destructive' });
      return null;
    } finally { setCreating(false); }
  };

  const startUploads = async () => {
    if (!docId) {
      const created = await createPassportAndRevision();
      if (!created) return;
    }
    const pending = items.filter((i) => i.status === 'pending' || i.status === 'error');
    // ترتیبی ولی با نگه‌داشتن وضعیت هر فایل
    for (const it of pending) {
      await uploadItem(it);
    }
  };

  const cancelAll = () => {
    for (const [, xhr] of xhrs.current) xhr.abort();
  };

  const onCsvFile = async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) throw new Error('فایل CSV خالی است.');
      const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const requiredCols = ['docnumber', 'title', 'projectcode', 'revision'];
      if (!requiredCols.every((c) => header.some((h) => h.replace(/\s/g, '').includes(c)))) {
        throw new Error('ستون‌های الزامی: docNumber, title, projectCode, revision');
      }
      const allProjects = (await api<{ projects: Proj[] }>('/api/admin/projects')).projects;
      const byCode = new Map(allProjects.map((p) => [p.code, p.id]));
      let created = 0;
      for (const line of lines.slice(1)) {
        const cols = line.split(',');
        const get = (name: string) => {
          const idx = header.findIndex((h) => h.includes(name));
          return idx >= 0 ? (cols[idx] || '').trim().replace(/^"|"$/g, '') : '';
        };
        const pid = byCode.get(get('projectcode').toUpperCase());
        if (!pid || !get('docnumber') || !get('title')) continue;
        try {
          const doc = await api<{ id: string }>('/api/documents', { method: 'POST', json: { docNumber: get('docnumber'), title: get('title'), projectId: pid, discipline: get('discipline') || 'UNK', docType: get('doctype') || 'OTHER', confidentiality: get('confidentiality') || 'INTERNAL' } });
          await api(`/api/documents/${doc.id}/revisions`, { method: 'POST', json: { revisionCode: get('revision') || '0' } });
          created += 1;
        } catch { /* ردیف نامعتبر رد می‌شود و در پایان گزارش می‌گیریم */ }
      }
      toast({ title: 'ورود CSV کامل شد', description: `${created} سند ایجاد شد. فایل‌های هر سند را جداگانه بارگذاری کنید.` });
    } catch (e) {
      toast({ title: 'خطای CSV', description: (e as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4" data-testid="upload-view">
      <h1 className="text-xl font-bold">بارگذاری مدارک</h1>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          جریان کار: ثبت شناسنامه → بارگذاری فایل → بررسی امنیتی و SHA-256 → ثبت اصل تغییرناپذیر در مخزن.
          فایل‌های PDF/تصویر/Office/CAD پذیرفته می‌شوند؛ فایل‌های CAD بدون مبدل فقط نگهداری می‌شوند (استخراج محتوایی: نیازمند نصب سرویس پردازش).
        </AlertDescription>
      </Alert>

      {/* شناسنامه */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">۱) شناسنامه سند</CardTitle>
          {docId && <p className="text-xs text-emerald-700 dark:text-emerald-400">شناسنامه ثبت شد — فایل‌ها به این سند اضافه می‌شوند. برای سند جدید، فرم را تغییر دهید و دوباره ثبت کنید.</p>}
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>پروژه *</Label>
            <Select value={projectId || undefined} onValueChange={(v) => { setProjectId(v); setUnitId(''); }}>
              <SelectTrigger><SelectValue placeholder="انتخاب پروژه" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}><span className="code-ltr">{p.code}</span> {p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>واحد (اختیاری)</Label>
            <Select value={unitId || 'none'} onValueChange={(v) => setUnitId(v === 'none' ? '' : v)} disabled={!projectId}>
              <SelectTrigger><SelectValue placeholder="انتخاب واحد" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">نامعلوم</SelectItem>
                {units.map((u) => <SelectItem key={u.id} value={u.id}><span className="code-ltr">{u.code}</span> {u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>شماره سند * <span className="text-xs text-muted-foreground">(در پروژه یکتا)</span></Label>
            <Input dir="ltr" className="text-left font-mono" placeholder="1183-ISO-0001" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} disabled={!!docId} />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label>عنوان *</Label>
            <Input placeholder="مثال: ایزومتریک خط 6-P-1183-B2A" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!!docId} />
          </div>
          <div className="space-y-1.5">
            <Label>ویرایش (Revision)</Label>
            <Input dir="ltr" className="text-left" placeholder="0" value={revisionCode} onChange={(e) => setRevisionCode(e.target.value)} disabled={!!docId} />
          </div>
          <div className="space-y-1.5">
            <Label>رشته</Label>
            <Select value={discipline || 'UNK'} onValueChange={setDiscipline} disabled={!!docId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {disciplines.map((d) => <SelectItem key={d.code} value={d.code}>{d.label} <span className="code-ltr text-xs">{d.code}</span></SelectItem>)}
                <SelectItem value="UNK">نامعلوم</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>نوع مدرک</Label>
            <Select value={docType || 'OTHER'} onValueChange={setDocType} disabled={!!docId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {docTypes.map((d) => <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>)}
                <SelectItem value="OTHER">سایر</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>سطح محرمانگی</Label>
            <Select value={confidentiality} onValueChange={setConfidentiality} disabled={!!docId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC">عمومی</SelectItem>
                <SelectItem value="INTERNAL">داخلی</SelectItem>
                <SelectItem value="CONFIDENTIAL">محرمانه</SelectItem>
                <SelectItem value="RESTRICTED">بسیار محرمانه</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={createPassportAndRevision} disabled={creating || !!docId} className="w-full">
              {docId ? 'ثبت شد' : creating ? 'در حال ثبت…' : 'ثبت شناسنامه و ویرایش'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* فایل‌ها */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">۲) فایل‌ها</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-teal-600 hover:bg-accent/40 transition-colors"
            role="button"
            aria-label="انتخاب یا کشیدن فایل‌ها"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          >
            <UploadCloud className="h-10 w-10 mx-auto text-teal-700 dark:text-teal-400 mb-2" />
            <p className="font-medium">فایل‌ها را اینجا بکشید یا کلیک کنید</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, TIFF, PNG, JPEG, DOCX, XLSX, DWG, DXF — سقف هر فایل ۱۲۰ مگابایت</p>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
          </div>

          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="truncate">{it.file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{(it.file.size / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                    {it.status === 'uploading' && <Progress value={it.progress} className="h-1.5 mt-1.5" />}
                    {it.status === 'pending' && <div className="text-xs text-muted-foreground mt-1">در صف ارسال</div>}
                    {it.status === 'done' && <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 font-mono" dir="ltr">SHA-256 OK · {it.result?.sha256.slice(0, 16)}…{it.result?.duplicateOf ? ' · تکراری!' : ''}</div>}
                    {it.status === 'error' && <div className="text-xs text-red-700 dark:text-red-400 mt-1">{it.error}</div>}
                  </div>
                  {it.status === 'uploading' && <Button size="icon" variant="ghost" onClick={() => { const xhr = xhrs.current.get(it.id); xhr?.abort(); }} aria-label="لغو"><X className="h-4 w-4" /></Button>}
                  {it.status === 'error' && <Button size="sm" variant="outline" onClick={() => retryItem(it)}><RotateCcw className="h-4 w-4" /> تلاش مجدد</Button>}
                  {it.status === 'pending' && <Button size="icon" variant="ghost" onClick={() => removeItem(it.id)} aria-label="حذف"><X className="h-4 w-4" /></Button>}
                </div>
              ))}
              <div className="flex gap-2">
                <Button onClick={startUploads} disabled={!items.some((i) => i.status === 'pending' || i.status === 'error')}>شروع بارگذاری</Button>
                <Button variant="outline" onClick={cancelAll}>لغو همه</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ورود فهرست متادیتا */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> ورود فهرست متادیتا</CardTitle>
          <div className="flex items-center gap-2 text-sm mt-1"><Switch checked={csvMode} onCheckedChange={setCsvMode} id="csv-toggle" /> <Label htmlFor="csv-toggle">فعال‌سازی ورود CSV</Label></div>
        </CardHeader>
        {csvMode && (
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">ستون‌ها: docNumber, title, projectCode, revision, discipline, docType, confidentiality — کدگذاری UTF-8. سند بدون فایل، شناسنامه اولیه ثبت می‌کند.</p>
            <Input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onCsvFile(e.target.files[0])} />
            <Alert>
              <AlertDescription className="text-xs">
                ورود XLSX در این نمونه «نیازمند نصب پشتیبان» است؛ فعلاً CSV پشتیبانی می‌شود. فایل‌های خود اسناد جداگانه بارگذاری شوند.
              </AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
