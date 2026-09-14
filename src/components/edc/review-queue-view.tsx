'use client';
// صف بازبینی — کارهای خودکار (اطمینان پایین، کیفیت پایین، شکست OCR) و درخواست‌های دستی
// حل کار نیازمند مجوز بازبینی است؛ سند غیرمجاز اصلاً در فهرست نمی‌آید
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { api, fmtJalali } from './api';
import { SampleBadge } from './badges';
import { ClipboardCheck, ChevronLeft, Loader2, CheckCheck, Ban, UserCheck } from 'lucide-react';

interface Task {
  id: string;
  reason: string;
  reasonLabel: string;
  detail: string | null;
  payload: { fields?: Array<{ field: string; value: string; confidence: number; page: number }>; emptyPages?: number[]; avgConfidence?: number; source?: string; suggestions?: number } | null;
  status: string;
  assignee: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  document: { id: string; docNumber: string; title: string; isSample: boolean } | null;
  fileId: string | null;
}

const REASON_STYLE: Record<string, string> = {
  LOW_CONFIDENCE: 'bg-amber-50 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  LOW_QUALITY: 'bg-orange-50 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200',
  OCR_FAILED: 'bg-red-50 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  MANUAL: 'bg-sky-50 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
};

export function ReviewQueueView({ go, refresh }: { go: (view: string, param?: string) => void; refresh?: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState('OPEN');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api<{ items: Task[] }>(`/api/review-tasks?status=${status}`)
      .then((r) => setTasks(r.items))
      .catch((e) => toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [status]);
  useEffect(load, [load]);

  async function act(id: string, action: string, note?: string) {
    setBusy(id);
    try {
      await api(`/api/review-tasks/${id}`, { method: 'PATCH', json: { action, note } });
      toast({ title: action === 'resolve' ? 'کار بازبینی حل شد' : action === 'assign' ? 'به شما محول شد' : 'لغو شد' });
      load();
      refresh?.();
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4" data-testid="review-queue">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> صف بازبینی</h1>
          <p className="text-sm text-muted-foreground mt-1">
            مواردی که پردازش خودکار برای تصمیم کارشناس ارسال کرده است: اطمینان پایین، اسکن کم‌کیفیت، شکست OCR یا درخواست دستی.
            تصمیم نهایی با کارشناس است.
          </p>
        </div>
        <div className="flex gap-1">
          {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'ALL'].map((s) => (
            <Button key={s} size="sm" variant={status === s ? 'secondary' : 'ghost'} onClick={() => setStatus(s)}>
              {s === 'OPEN' ? 'باز' : s === 'IN_PROGRESS' ? 'در جریان' : s === 'RESOLVED' ? 'حل‌شده' : 'همه'}
            </Button>
          ))}
        </div>
      </div>

      {loading && <Card><CardContent className="p-6 text-sm text-muted-foreground">در حال بارگذاری…</CardContent></Card>}
      {!loading && tasks.length === 0 && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          {status === 'OPEN' ? 'صف بازبینی خالی است — همهٔ موارد بررسی شده‌اند.' : 'موردی در این وضعیت نیست.'}
        </CardContent></Card>
      )}

      {tasks.map((t) => (
        <Card key={t.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
              <Badge className={REASON_STYLE[t.reason] || ''} variant="outline">{t.reasonLabel}</Badge>
              <button className="code-ltr font-bold hover:underline" onClick={() => go('document', t.document?.id)}>{t.document?.docNumber}</button>
              {t.document?.isSample && <SampleBadge />}
              <span className="text-xs font-normal text-muted-foreground">{fmtJalali(t.createdAt, true)}</span>
              {t.assignee && <span className="text-xs text-muted-foreground">· بازبین: {t.assignee}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {t.detail && <p className="text-muted-foreground">{t.detail}</p>}
            {t.payload?.fields && (
              <div className="flex flex-wrap gap-1.5">
                {t.payload.fields.map((f, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {f.field}: {String(f.value).slice(0, 24)} ({Math.round(f.confidence * 100)}٪)
                  </Badge>
                ))}
              </div>
            )}
            {t.payload?.emptyPages && t.payload.emptyPages.length > 0 && (
              <p className="text-xs text-muted-foreground">صفحات بی‌متن: {t.payload.emptyPages.join('، ')}</p>
            )}
            {t.payload?.suggestions && <p className="text-xs text-muted-foreground">تعداد پیشنهاد: {t.payload.suggestions}</p>}
            {t.status === 'RESOLVED' && t.resolutionNote && <p className="text-xs">یادداشت حل: {t.resolutionNote}</p>}
            <div className="flex gap-2 pt-1 flex-wrap">
              {t.status !== 'RESOLVED' && t.status !== 'CANCELLED' && (
                <>
                  <Button size="sm" variant="outline" disabled={busy === t.id} onClick={() => { if (t.fileId) go('document', t.document?.id); else go('document', t.document?.id); }}>
                    <ChevronLeft className="h-4 w-4" /> بازکردن سند
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === t.id} onClick={() => act(t.id, 'assign')}>
                    <UserCheck className="h-4 w-4" /> برداشت برای بازبینی
                  </Button>
                  <Button size="sm" disabled={busy === t.id} onClick={() => act(t.id, 'resolve', 'بررسی و تأیید کارشناس')}>
                    {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />} حل
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-700" disabled={busy === t.id} onClick={() => act(t.id, 'cancel', 'غیرمرتبط')}>
                    <Ban className="h-4 w-4" /> لغو
                  </Button>
                </>
              )}
              {t.status === 'RESOLVED' && (
                <Button size="sm" variant="ghost" disabled={busy === t.id} onClick={() => act(t.id, 'reopen')}>بازگشایی</Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
