'use client';
// گردش تأیید سند — دورهای بازبینی، منع خودتأییدی، تصمیم بازبین محول‌شده
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { api, ROLE_LABELS } from './api';
import { CheckCircle2, Hourglass, XCircle, UserCheck, FileCheck2 } from 'lucide-react';

interface Approval {
  id: string; round: number; decision: string; comment: string | null;
  decidedAt: string | null; createdAt: string; revisionId: string | null;
  reviewer: { id: string; fullName: string; role: string };
}

export function ApprovalPanel({ documentId, canEdit }: { documentId: string; canEdit: boolean }) {
  const [items, setItems] = useState<Approval[]>([]);
  const [candidates, setCandidates] = useState<Array<{ id: string; fullName: string; role: string }>>([]);
  const [myPending, setMyPending] = useState<{ id: string; round: number } | null>(null);
  const [canManage, setCanManage] = useState(canEdit);
  const [reqOpen, setReqOpen] = useState(false);
  const [reviewerId, setReviewerId] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ items: Approval[]; candidates: Array<{ id: string; fullName: string; role: string }>; canManage: boolean; myPending: { id: string; round: number } | null }>(`/api/documents/${documentId}/approvals`)
      .then((r) => { setItems(r.items); setCandidates(r.candidates); setCanManage(r.canManage); setMyPending(r.myPending); })
      .catch(() => {});
  }, [documentId]);
  useEffect(load, [load]);

  async function request() {
    if (!reviewerId) { toast({ title: 'بازبین را انتخاب کنید', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await api(`/api/documents/${documentId}/approvals`, { method: 'POST', json: { action: 'request', reviewerId } });
      toast({ title: 'بازبینی محول شد', description: 'کار در کارتابل بازبین ثبت گردید (منع خودتأییدی رعایت شد).' });
      setReqOpen(false); setReviewerId('');
      load();
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  async function decide(decision: 'APPROVED' | 'CHANGES' | 'REJECTED') {
    if (!myPending) return;
    setBusy(true);
    try {
      await api(`/api/documents/${documentId}/approvals`, { method: 'POST', json: { action: 'decide', approvalId: myPending.id, decision, comment } });
      toast({ title: decision === 'APPROVED' ? 'تأیید ثبت شد' : decision === 'CHANGES' ? 'بازگشت برای اصلاح ثبت شد' : 'رد ثبت شد' });
      setComment('');
      load();
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  const DEC: Record<string, { label: string; cls: string }> = {
    PENDING: { label: 'در انتظار', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200' },
    APPROVED: { label: 'تأیید', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
    CHANGES: { label: 'اصلاح لازم', cls: 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200' },
    REJECTED: { label: 'رد', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
  };

  return (
    <Card data-testid="approval-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <FileCheck2 className="h-4 w-4" /> گردش تأیید
          <span className="flex-1" />
          {canManage && <Button size="sm" variant="outline" onClick={() => setReqOpen(true)}><UserCheck className="h-4 w-4" /> محول بازبینی/تأیید</Button>}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">تأییدکننده نمی‌تواند مدرک ارسالی خودش را تأیید نهایی کند؛ پس از تأیید همهٔ بازبین‌های دور، نسخهٔ جاری «تأییدشده» می‌شود (فایل جدید همیشه ویرایش جدید ثبت می‌کند).</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">دوری از گردش تأیید ثبت نشده است.</p>}
        {items.map((a) => {
          const d = DEC[a.decision] || DEC.PENDING;
          return (
            <div key={a.id} className="flex items-center justify-between gap-2 flex-wrap rounded-lg border px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">دور {a.round}</Badge>
                <span className="font-medium">{a.reviewer.fullName}</span>
                <span className="text-xs text-muted-foreground">({ROLE_LABELS[a.reviewer.role] || a.reviewer.role})</span>
              </div>
              <div className="flex items-center gap-2">
                {a.comment && <span className="text-xs text-muted-foreground max-w-[240px] truncate" title={a.comment}>«{a.comment}»</span>}
                <Badge className={d.cls}>
                  {a.decision === 'PENDING' ? <Hourglass className="h-3 w-3 ml-1" /> : a.decision === 'APPROVED' ? <CheckCircle2 className="h-3 w-3 ml-1" /> : <XCircle className="h-3 w-3 ml-1" />}
                  {d.label}
                </Badge>
              </div>
            </div>
          );
        })}

        {myPending && (
          <div className="rounded-lg border-2 border-dashed border-teal-600/40 bg-teal-50/40 dark:bg-teal-900/10 p-3 space-y-2">
            <p className="text-sm font-medium">بازبینی محول به شما (دور {myPending.round}) — تصمیم بگیرید:</p>
            <Input placeholder="نظر (اختیاری)…" value={comment} onChange={(e) => setComment(e.target.value)} />
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800" disabled={busy} onClick={() => decide('APPROVED')}>تأیید نسخهٔ جاری</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => decide('CHANGES')}>بازگشت برای اصلاح</Button>
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => decide('REJECTED')}>رد</Button>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>محول بازبینی/تأیید</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>بازبین / تأییدکننده (غیر از خود شما)</Label>
              <Select value={reviewerId} onValueChange={setReviewerId}>
                <SelectTrigger><SelectValue placeholder="انتخاب کنید…" /></SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.fullName} — {ROLE_LABELS[c.role] || c.role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {candidates.length === 0 && <p className="text-xs text-muted-foreground">داوطلبی (به‌جز شما) با نقش بازبینی در پروژه نیست.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqOpen(false)}>انصراف</Button>
            <Button disabled={busy || !reviewerId} onClick={request}>{busy ? 'در حال ثبت…' : 'ثبت محولی'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
