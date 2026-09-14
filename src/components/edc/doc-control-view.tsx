'use client';
// کنترل مدارک (مرحله D) — ترنسمیتال ورودی/خروجی + رجیستر MDR با خروجی CSV
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { api, fmtJalali } from './api';
import { FileStack, Plus, Search, Download, Trash2, Send, MailCheck, Lock, FileSpreadsheet, X } from 'lucide-react';

interface TrItem { id: string; docNumber: string; title: string; docStatus: string; revisionId: string | null; note: string | null }
interface Transmittal {
  id: string; number: string; direction: string; party: string; purpose: string | null;
  status: string; sentAt: string | null; ackAt: string | null; note: string | null;
  itemCount?: number; createdAt: string;
}
interface MdrRow {
  docNumber: string; title: string; project: string; unit: string; discipline: string; docType: string;
  origin: string; confidentiality: string; status: string; engineeringStatus: string;
  currentRevision: string; validRevision: string; revisionStatus: string; purpose: string;
  docDate: string; receivedDate: string; lastTransmittal: string; isSample: boolean;
}

const TR_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'پیش‌نویس', cls: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200' },
  SENT: { label: 'ارسال‌شده', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' },
  ACKNOWLEDGED: { label: 'رسید تأیید', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  CLOSED: { label: 'بسته‌شده', cls: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200' },
};

export function DocControlView({ go }: { go: (view: string, param?: string) => void }) {
  return (
    <div className="space-y-4" data-testid="doc-control-view">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><FileStack className="h-5 w-5 text-teal-700" /> کنترل مدارک</h1>
        <p className="text-sm text-muted-foreground">ترنسمیتال ورودی/خروجی، رجیستر MDR و خروجی بستهٔ مدارک — اصلاح وضعیت سند، تاریخچهٔ ارسال گذشته را تغییر نمی‌دهد.</p>
      </div>
      <Tabs defaultValue="transmittal">
        <TabsList>
          <TabsTrigger value="transmittal">ترنسمیتال‌ها</TabsTrigger>
          <TabsTrigger value="mdr">رجیستر MDR</TabsTrigger>
        </TabsList>
        <TabsContent value="transmittal"><TransmittalTab go={go} /></TabsContent>
        <TabsContent value="mdr"><MdrTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function TransmittalTab({ go }: { go: (view: string, param?: string) => void }) {
  const [items, setItems] = useState<Transmittal[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<{ t: Transmittal; items: TrItem[]; canManage: boolean } | null>(null);
  const [form, setForm] = useState({ number: '', direction: 'OUT', party: '', purpose: '' });
  const [busy, setBusy] = useState(false);
  const [docQuery, setDocQuery] = useState('');
  const [docHits, setDocHits] = useState<Array<{ id: string; docNumber: string; title: string }>>([]);

  const load = useCallback((sq = '') => {
    api<{ items: Transmittal[]; canManage: boolean }>(`/api/transmittals${sq ? `?q=${encodeURIComponent(sq)}` : ''}`)
      .then((r) => { setItems(r.items); setCanManage(r.canManage); })
      .catch((e) => toast({ title: 'خطا', description: e.message, variant: 'destructive' }));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function openDetail(t: Transmittal) {
    try {
      const r = await api<{ item: Transmittal; items: TrItem[]; canManage: boolean }>(`/api/transmittals/${t.id}`);
      setDetail({ t: r.item, items: r.items, canManage: r.canManage });
      setDocQuery(''); setDocHits([]);
    } catch (e) { toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' }); }
  }

  async function create() {
    setBusy(true);
    try {
      await api('/api/transmittals', { method: 'POST', json: form });
      setCreateOpen(false);
      setForm({ number: '', direction: 'OUT', party: '', purpose: '' });
      toast({ title: 'ترنسمیتال ایجاد شد (پیش‌نویس)' });
      load(q);
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  async function searchDocs(sq: string) {
    setDocQuery(sq);
    if (sq.trim().length < 2) { setDocHits([]); return; }
    try {
      const r = await api<{ items: Array<{ id: string; docNumber: string; title: string }> }>(`/api/search?q=${encodeURIComponent(sq)}&limit=8`);
      setDocHits(r.items);
    } catch { setDocHits([]); }
  }

  async function addItem(documentId: string) {
    if (!detail) return;
    try {
      await api(`/api/transmittals/${detail.t.id}`, { method: 'PATCH', json: { action: 'add-item', documentId } });
      toast({ title: 'سند به فهرست اضافه شد' });
      openDetail(detail.t);
    } catch (e) { toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' }); }
  }

  async function setStatus(status: string) {
    if (!detail) return;
    try {
      await api(`/api/transmittals/${detail.t.id}`, { method: 'PATCH', json: { action: 'set-status', status } });
      toast({ title: 'وضعیت به‌روزرسانی شد' });
      openDetail(detail.t); load(q);
    } catch (e) { toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' }); }
  }

  async function removeItem(itemId: string) {
    if (!detail) return;
    await api(`/api/transmittals/${detail.t.id}`, { method: 'PATCH', json: { action: 'remove-item', itemId } }).catch(() => {});
    openDetail(detail.t);
  }

  async function deleteTr() {
    if (!detail) return;
    try {
      await api(`/api/transmittals/${detail.t.id}`, { method: 'DELETE' });
      setDetail(null); toast({ title: 'حذف شد' }); load(q);
    } catch (e) { toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' }); }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <span>ارسال رسمی مدارک (Transmittal)</span>
          <span className="flex-1" />
          <div className="relative w-56">
            <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="جست‌وجو…" className="pr-8 h-9 text-sm" value={q} onChange={(e) => { setQ(e.target.value); load(e.target.value); }} />
          </div>
          {canManage && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> ترنسمیتال جدید</Button>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">ترنسمیتی ثبت نشده است.</p>}
        {items.map((t) => {
          const st = TR_STATUS[t.status] || TR_STATUS.DRAFT;
          return (
            <button key={t.id} onClick={() => openDetail(t)} className="w-full text-right flex items-center justify-between gap-2 flex-wrap rounded-lg border px-3 py-2.5 hover:bg-accent transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className={t.direction === 'IN' ? 'bg-sky-50 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'}>
                  {t.direction === 'IN' ? 'ورودی' : 'خروجی'}
                </Badge>
                <span className="code-ltr font-semibold">{t.number}</span>
                <span className="text-sm text-muted-foreground truncate">{t.party}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {t.purpose && <span className="truncate max-w-[180px]">{t.purpose}</span>}
                <Badge className={st.cls}>{st.label}</Badge>
                <span>{t.itemCount ?? 0} قلم · {fmtJalali(t.createdAt)}</span>
              </div>
            </button>
          );
        })}
      </CardContent>

      {/* ایجاد */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>ترنسمیتال جدید</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>شماره *</Label><Input dir="ltr" className="text-left" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="TR-2026-001" /></div>
            <div className="space-y-1">
              <Label>جهت *</Label>
              <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OUT">خروجی</SelectItem>
                  <SelectItem value="IN">ورودی</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1"><Label>طرف سازمانی (فرستنده/گیرنده) *</Label><Input value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} placeholder="شرکت مهندسی …" /></div>
            <div className="col-span-2 space-y-1"><Label>هدف ارسال</Label><Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="برای ساخت / بازبینی / اطلاع" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>انصراف</Button>
            <Button disabled={busy || !form.number.trim() || !form.party.trim()} onClick={create}>ایجاد پیش‌نویس</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* جزئیات */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <span className="code-ltr">{detail.t.number}</span>
                  <Badge variant="outline">{detail.t.direction === 'IN' ? 'ورودی' : 'خروجی'}</Badge>
                  <Badge className={(TR_STATUS[detail.t.status] || TR_STATUS.DRAFT).cls}>{(TR_STATUS[detail.t.status] || TR_STATUS.DRAFT).label}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="text-sm space-y-1 text-muted-foreground">
                <p>طرف: <span className="font-medium text-foreground">{detail.t.party}</span>{detail.t.purpose ? ` — هدف: ${detail.t.purpose}` : ''}</p>
                {detail.t.sentAt && <p>تاریخ ارسال: {fmtJalali(detail.t.sentAt, true)}{detail.t.ackAt ? ` · رسید: ${fmtJalali(detail.t.ackAt, true)}` : ''}</p>}
              </div>

              {detail.canManage && (
                <div className="space-y-2 rounded-lg border p-3">
                  <Label className="text-xs">افزودن سند به فهرست (جست‌وجوی شماره/عنوان/Tag)</Label>
                  <Input placeholder="حداقل ۲ نویسه…" value={docQuery} onChange={(e) => searchDocs(e.target.value)} />
                  {docHits.length > 0 && (
                    <div className="max-h-36 overflow-y-auto rounded-lg border divide-y">
                      {docHits.map((d) => (
                        <button key={d.id} onClick={() => addItem(d.id)} className="w-full text-right px-3 py-2 text-xs hover:bg-accent flex items-center justify-between gap-2">
                          <span className="code-ltr font-semibold">{d.docNumber}</span>
                          <span dir="auto" className="truncate max-w-[55%] text-muted-foreground">{d.title}</span>
                          <Plus className="h-3.5 w-3.5 text-teal-700 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg border divide-y">
                {detail.items.length === 0 && <p className="text-sm text-muted-foreground p-3">قلمی ثبت نشده است.</p>}
                {detail.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <button className="text-right min-w-0 group" onClick={() => { setDetail(null); go('document', it.docNumber ? '' : ''); }} title="مشاهده سند">
                      <span className="code-ltr font-semibold group-hover:underline">{it.docNumber}</span>
                      <span dir="auto" className="block text-xs text-muted-foreground truncate max-w-[380px] text-start">{it.title}</span>
                    </button>
                    {detail.canManage && (
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeItem(it.id)} title="حذف قلم"><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {detail.canManage && (
                <DialogFooter className="flex-wrap gap-2">
                  {detail.t.status === 'DRAFT' && (
                    <>
                      <Button variant="destructive" size="sm" onClick={deleteTr}><Trash2 className="h-4 w-4" /> حذف پیش‌نویس</Button>
                      <Button size="sm" onClick={() => setStatus('SENT')}><Send className="h-4 w-4" /> ثبت ارسال</Button>
                    </>
                  )}
                  {detail.t.status === 'SENT' && (
                    <Button size="sm" onClick={() => setStatus('ACKNOWLEDGED')}><MailCheck className="h-4 w-4" /> ثبت رسید</Button>
                  )}
                  {detail.t.status === 'ACKNOWLEDGED' && (
                    <Button size="sm" variant="outline" onClick={() => setStatus('CLOSED')}><Lock className="h-4 w-4" /> بستن</Button>
                  )}
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function MdrTab() {
  const [projects, setProjects] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [projectId, setProjectId] = useState('');
  const [rows, setRows] = useState<MdrRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ projects: Array<{ id: string; code: string; name: string }> }>('/api/tree')
      .then((r) => { setProjects(r.projects); if (r.projects[0]) setProjectId(r.projects[0].id); })
      .catch(() => {});
  }, []);

  const load = useCallback((pid: string) => {
    if (!pid) return;
    setBusy(true);
    api<{ rows: MdrRow[] }>(`/api/reports/mdr?projectId=${pid}`)
      .then((r) => setRows(r.rows))
      .catch((e) => toast({ title: 'خطا', description: e.message, variant: 'destructive' }))
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(projectId), 0);
    return () => clearTimeout(t);
  }, [projectId, load]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <FileSpreadsheet className="h-4 w-4" /> رجیستر مدارک (MDR)
          <span className="flex-1" />
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="پروژه…" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {projectId && (
            <Button size="sm" variant="outline" onClick={() => { window.location.assign(`/api/reports/mdr?projectId=${projectId}&format=csv`); }}>
              <Download className="h-4 w-4" /> خروجی CSV
            </Button>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">وضعیت سه‌محور، نسخهٔ جاری/معتبر و آخرین ترنسمیتال هر سند — برچسب دادهٔ نمونه حفظ می‌شود.</p>
      </CardHeader>
      <CardContent>
        {busy && <p className="text-sm text-muted-foreground">در حال بارگذاری…</p>}
        {!busy && rows.length === 0 && <p className="text-sm text-muted-foreground">سندی برای این پروژه در دسترس شما نیست.</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" data-testid="mdr-table">
              <thead>
                <tr className="bg-muted/60 text-muted-foreground">
                  <th className="p-2 text-right border">شماره سند</th>
                  <th className="p-2 text-right border">عنوان</th>
                  <th className="p-2 text-center border">رشته</th>
                  <th className="p-2 text-center border">نسخهٔ جاری</th>
                  <th className="p-2 text-center border">نسخهٔ معتبر</th>
                  <th className="p-2 text-center border">وضعیت سند</th>
                  <th className="p-2 text-center border">وضعیت مهندسی</th>
                  <th className="p-2 text-center border">دریافت</th>
                  <th className="p-2 text-center border">آخرین ترنسمیتال</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.docNumber} className="hover:bg-accent/40">
                    <td className="p-2 border code-ltr font-semibold">{r.docNumber}{r.isSample ? <span className="text-[10px] text-amber-700 mr-1">(نمونه)</span> : ''}</td>
                    <td className="p-2 border max-w-[240px] truncate" title={r.title}>{r.title}</td>
                    <td className="p-2 border text-center code-ltr">{r.discipline}</td>
                    <td className="p-2 border text-center code-ltr">{r.currentRevision || '—'}</td>
                    <td className="p-2 border text-center code-ltr">{r.validRevision || '—'}</td>
                    <td className="p-2 border text-center">{r.status}</td>
                    <td className="p-2 border text-center">{r.engineeringStatus}</td>
                    <td className="p-2 border text-center whitespace-nowrap">{r.receivedDate || '—'}</td>
                    <td className="p-2 border text-center code-ltr">{r.lastTransmittal || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
