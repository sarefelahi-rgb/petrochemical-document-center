'use client';
// گزارش‌ها — داشبورد کیفیت واقعی + وضعیت صادقانه قابلیت‌ها
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, PlugZap, Hourglass, BarChart3 } from 'lucide-react';
import { api, fmtJalali } from './api';
import { ConfBadge } from './badges';

interface Reports {
  totals: { total: number; incomplete: number; processing: number; quarantined: number; unlinked: number; noRevision: number };
  byConfidentiality: Array<{ key: string; count: number }>;
  byDiscipline: Array<{ key: string; count: number }>;
  recentAudit: Array<{ action: string; actorName: string | null; at: string; detail: string | null }>;
  projectScope: number;
}
interface Capability { key: string; label: string; available: boolean; note: string }

export function ReportsView() {
  const [data, setData] = useState<Reports | null>(null);
  const [caps, setCaps] = useState<Capability[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Reports>('/api/reports').then(setData).catch((e) => setError(e.message));
    api<{ capabilities: Capability[] }>('/api/system/status').then((r) => setCaps(r.capabilities)).catch(() => {});
  }, []);

  const quality = [
    { label: 'شناسنامه ناقص', value: data?.totals.incomplete ?? 0, warn: true },
    { label: 'روابط حل‌نشده (بدون Tag/Line)', value: data?.totals.unlinked ?? 0, warn: true },
    { label: 'نسخه مبهم (بدون ویرایش)', value: data?.totals.noRevision ?? 0, warn: true },
    { label: 'در انتظار پردازش', value: data?.totals.processing ?? 0, warn: false },
    { label: 'فایل قرنطینه', value: data?.totals.quarantined ?? 0, warn: true },
  ];

  return (
    <div className="space-y-4" data-testid="reports-view">
      <h1 className="text-xl font-bold">گزارش‌ها و وضعیت سامانه</h1>
      {error && <Card className="border-red-300"><CardContent className="p-4 text-sm text-red-700 dark:text-red-300">{error}</CardContent></Card>}

      {!data && !error && <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>}

      {data && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> کیفیت داده — شمارش واقعی ({data.projectScope} پروژه در دامنه شما)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div className="rounded-lg border p-3"><div className="text-2xl font-bold">{data.totals.total}</div><div className="text-xs text-muted-foreground mt-1">کل اسناد</div></div>
                {quality.map((q) => (
                  <div key={q.label} className="rounded-lg border p-3">
                    <div className={`text-2xl font-bold ${q.warn && q.value > 0 ? 'text-amber-700 dark:text-amber-400' : ''}`}>{q.value}</div>
                    <div className="text-xs text-muted-foreground mt-1 leading-4">{q.label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium mb-2">توزیع بر پایه محرمانگی</h3>
                  <div className="space-y-1.5">
                    {data.byConfidentiality.map((c) => (
                      <div key={c.key} className="flex items-center justify-between text-sm">
                        <ConfBadge conf={c.key} /><span className="font-medium">{c.count}</span>
                      </div>
                    ))}
                    {data.byConfidentiality.length === 0 && <p className="text-sm text-muted-foreground">داده‌ای نیست.</p>}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-2">توزیع بر پایه رشته</h3>
                  <div className="space-y-1.5">
                    {data.byDiscipline.map((c) => (
                      <div key={c.key} className="flex items-center justify-between text-sm">
                        <span className="code-ltr">{c.key}</span><span className="font-medium">{c.count}</span>
                      </div>
                    ))}
                    {data.byDiscipline.length === 0 && <p className="text-sm text-muted-foreground">داده‌ای نیست.</p>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">آخرین رخدادها</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {data.recentAudit.map((a, i) => (
                <div key={i} className="flex items-center justify-between text-xs rounded-md bg-muted/40 px-3 py-1.5">
                  <span className="font-medium">{a.action}</span>
                  <span className="text-muted-foreground truncate max-w-[45%]">{a.detail || ''}</span>
                  <span className="text-muted-foreground">{a.actorName || '—'} · {fmtJalali(a.at, true)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">وضعیت قابلیت‌ها (صادقانه)</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">هیچ قابلیت نصب‌نشده‌ای به‌عنوان فعال معرفی نمی‌شود.</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {caps.map((c) => (
            <div key={c.key} className="flex items-start gap-2 rounded-lg border px-3 py-2.5">
              {c.available
                ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                : c.note.startsWith('نیازمند')
                  ? <PlugZap className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  : <Hourglass className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />}
              <div className="min-w-0">
                <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                  {c.label}
                  <Badge variant="outline" className={c.available ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'}>
                    {c.available ? 'فعال' : c.note.startsWith('نیازمند') ? 'نیازمند اتصال/نصب' : 'اجرا نشده'}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{c.note}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
