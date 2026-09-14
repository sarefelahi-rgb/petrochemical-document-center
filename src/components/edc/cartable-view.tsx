'use client';
// کارتابل شخصی — وظایف باز/انجام‌شده
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, CheckCircle2 } from 'lucide-react';
import { api, fmtJalali } from './api';

interface Task { id: string; type: string; title: string; status: string; dueAt: string | null; createdAt: string; relatedDocId: string | null }

const TYPE_LABELS: Record<string, string> = {
  REVIEW: 'بازبینی', APPROVE: 'تأیید', INCOMPLETE_METADATA: 'تکمیل شناسنامه', UPLOAD_FOLLOWUP: 'پیگیری بارگذاری',
};

export function CartableView({ go }: { go: (view: string, param?: string) => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [show, setShow] = useState<'OPEN' | 'DONE' | 'ALL'>('OPEN');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ tasks: Task[]; openCount: number }>(`/api/cartable?status=${show}`).then((r) => { setTasks(r.tasks); setOpenCount(r.openCount); }).catch((e) => setError(e.message));
  }, [show]);

  useEffect(load, [load]);

  async function complete(t: Task) {
    await api('/api/cartable', { method: 'PATCH', json: { id: t.id, status: 'DONE' } });
    load();
  }

  return (
    <div className="space-y-4" data-testid="cartable-view">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">کارتابل من</h1>
        <div className="flex gap-2">
          {(['OPEN', 'DONE', 'ALL'] as const).map((s) => (
            <Button key={s} size="sm" variant={show === s ? 'default' : 'outline'} onClick={() => setShow(s)}>
              {s === 'OPEN' ? `باز (${openCount})` : s === 'DONE' ? 'انجام‌شده' : 'همه'}
            </Button>
          ))}
        </div>
      </div>
      {error && <Card><CardContent className="p-4 text-sm text-red-700 dark:text-red-300">{error}</CardContent></Card>}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" /> وظایف</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {tasks.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">وظیفه‌ای در این دسته نیست.</p>}
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{t.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex gap-2">
                  <Badge variant="outline" className="bg-slate-50 dark:bg-slate-800">{TYPE_LABELS[t.type] || t.type}</Badge>
                  <span>{fmtJalali(t.createdAt, true)}</span>
                  {t.dueAt && <span className="text-amber-700 dark:text-amber-400">مهلت: {fmtJalali(t.dueAt)}</span>}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {t.relatedDocId && <Button size="sm" variant="outline" onClick={() => go('document', t.relatedDocId!)}>مشاهده سند</Button>}
                {t.status === 'OPEN' && <Button size="sm" onClick={() => complete(t)}><CheckCircle2 className="h-4 w-4" /> انجام شد</Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
