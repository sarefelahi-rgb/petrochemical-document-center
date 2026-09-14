'use client';
// پنل MTO/BOM سند — ردیف‌های دستی + پیشنهاد مدل زبانی + تأیید/رد/ویرایش/حذف
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { api } from './api';
import { Loader2, Sparkles, Plus, Check, X, Pencil, Trash2, TableProperties } from 'lucide-react';

interface MtoRow {
  id: string; rawDesc: string; normDesc: string | null; material: string | null;
  sizeMain: string | null; sizeBranch: string | null; cls: string | null; schedule: string | null;
  endConn: string | null; unit: string; qty: number; source: string; status: string;
  note: string | null; pageNumber: number | null; rowLabel: string | null;
}

export function MtoPanel({ documentId, canEdit }: { documentId: string; canEdit: boolean }) {
  const [rows, setRows] = useState<MtoRow[]>([]);
  const [canEditState, setCanEditState] = useState(canEdit);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ rawDesc: '', material: '', sizeMain: '', sizeBranch: '', cls: '', schedule: '', endConn: '', unit: 'EA', qty: '' });

  const load = useCallback(() => {
    api<{ items: MtoRow[]; canEdit: boolean }>(`/api/documents/${documentId}/mto`)
      .then((r) => { setRows(r.items); setCanEditState(r.canEdit); })
      .catch(() => {});
  }, [documentId]);
  useEffect(load, [load]);

  async function suggest() {
    setBusy(true);
    try {
      const r = await api<{ created: number }>(`/api/documents/${documentId}/mto`, { method: 'POST', json: { action: 'suggest' } });
      toast({ title: 'پیشنهاد مدل ثبت شد', description: `${r.created} ردیف پیشنهادی — تا تأیید کارشناس «پیشنهاد» می‌مانند.` });
      load();
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  async function addRow() {
    if (!form.rawDesc.trim()) { toast({ title: 'شرح ردیف الزامی است', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await api(`/api/documents/${documentId}/mto`, {
        method: 'POST',
        json: { action: 'add', row: { ...form, qty: Number(form.qty) || 0 } },
      });
      setAddOpen(false);
      setForm({ rawDesc: '', material: '', sizeMain: '', sizeBranch: '', cls: '', schedule: '', endConn: '', unit: 'EA', qty: '' });
      toast({ title: 'ردیف اضافه شد' });
      load();
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  async function rowAction(id: string, action: string) {
    try {
      await api(`/api/mto/row/${id}`, { method: 'PATCH', json: { action } });
      load();
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    }
  }

  async function deleteRow(id: string) {
    try {
      await api(`/api/mto/row/${id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    }
  }

  const confirmed = rows.filter((r) => r.status === 'CONFIRMED').length;
  const suggested = rows.filter((r) => r.status === 'SUGGESTED').length;

  return (
    <Card data-testid="mto-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <TableProperties className="h-4 w-4" /> MTO / BOM سند
          <Badge variant="outline">{rows.length} ردیف · {confirmed} تأییدشده{suggested ? ` · ${suggested} پیشنهاد مدل` : ''}</Badge>
          <span className="flex-1" />
          {canEditState && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={suggest} title="استخراج پیشنهادی جدول متریال از متن صفحات با مدل زبانی">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} استخراج با مدل
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> افزودن ردیف</Button>
            </>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">ردیف‌های پیشنهادی مدل تا تأیید کارشناس در جمع‌ها لحاظ نمی‌شوند؛ منبع هر ردیف حفظ می‌شود.</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 && <p className="text-sm text-muted-foreground">ردیفی ثبت نشده است. با «استخراج با مدل» از متن صفحات پیشنهاد بگیرید یا دستی اضافه کنید.</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/60 text-muted-foreground">
                  <th className="p-2 text-right border">شرح (عین مدرک)</th>
                  <th className="p-2 text-right border">متریال</th>
                  <th className="p-2 text-center border">سایز اصلی</th>
                  <th className="p-2 text-center border">انشعاب</th>
                  <th className="p-2 text-center border">کلاس</th>
                  <th className="p-2 text-center border">Sch</th>
                  <th className="p-2 text-center border">End</th>
                  <th className="p-2 text-center border">واحد</th>
                  <th className="p-2 text-center border">مقدار</th>
                  <th className="p-2 text-center border">وضعیت</th>
                  {canEditState && <th className="p-2 text-center border">عملیات</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.status === 'SUGGESTED' ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}>
                    <td className="p-2 border max-w-[220px] truncate" title={r.rawDesc}>{r.rawDesc}{r.rowLabel ? <span className="text-muted-foreground"> ({r.rowLabel})</span> : ''}</td>
                    <td className="p-2 border code-ltr">{r.material || '—'}</td>
                    <td className="p-2 border text-center code-ltr">{r.sizeMain || '—'}</td>
                    <td className="p-2 border text-center code-ltr">{r.sizeBranch || '—'}</td>
                    <td className="p-2 border text-center code-ltr">{r.cls || '—'}</td>
                    <td className="p-2 border text-center code-ltr">{r.schedule || '—'}</td>
                    <td className="p-2 border text-center code-ltr">{r.endConn || '—'}</td>
                    <td className="p-2 border text-center code-ltr">{r.unit}</td>
                    <td className="p-2 border text-center font-medium">{r.qty}</td>
                    <td className="p-2 border text-center">
                      {r.status === 'CONFIRMED' ? <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">تأییدشده</Badge>
                        : r.status === 'SUGGESTED' ? <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">پیشنهاد مدل</Badge>
                        : <Badge variant="outline">ردشده</Badge>}
                    </td>
                    {canEditState && (
                      <td className="p-2 border text-center whitespace-nowrap">
                        {r.status === 'SUGGESTED' && (
                          <>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => rowAction(r.id, 'confirm')} title="تأیید"><Check className="h-3.5 w-3.5 text-emerald-700" /></Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => rowAction(r.id, 'reject')} title="رد"><X className="h-3.5 w-3.5 text-red-700" /></Button>
                          </>
                        )}
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteRow(r.id)} title="حذف"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" /> افزودن ردیف MTO</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1"><Label>شرح *</Label><Input value={form.rawDesc} onChange={(e) => setForm({ ...form, rawDesc: e.target.value })} /></div>
            <div className="space-y-1"><Label>متریال</Label><Input dir="ltr" className="text-left" value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} placeholder="CS / SS316" /></div>
            <div className="space-y-1"><Label>کلاس</Label><Input dir="ltr" className="text-left" value={form.cls} onChange={(e) => setForm({ ...form, cls: e.target.value })} /></div>
            <div className="space-y-1"><Label>سایز اصلی</Label><Input dir="ltr" className="text-left" value={form.sizeMain} onChange={(e) => setForm({ ...form, sizeMain: e.target.value })} placeholder={'2"'} /></div>
            <div className="space-y-1"><Label>سایز انشعاب</Label><Input dir="ltr" className="text-left" value={form.sizeBranch} onChange={(e) => setForm({ ...form, sizeBranch: e.target.value })} /></div>
            <div className="space-y-1"><Label>Schedule</Label><Input dir="ltr" className="text-left" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} /></div>
            <div className="space-y-1"><Label>End Connection</Label><Input dir="ltr" className="text-left" value={form.endConn} onChange={(e) => setForm({ ...form, endConn: e.target.value })} placeholder="RF / BW / SW" /></div>
            <div className="space-y-1"><Label>واحد</Label><Input dir="ltr" className="text-left" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="EA / M / KG" /></div>
            <div className="space-y-1"><Label>مقدار</Label><Input type="number" min="0" step="any" dir="ltr" className="text-left" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>انصراف</Button>
            <Button disabled={busy} onClick={addRow}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ثبت ردیف'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
