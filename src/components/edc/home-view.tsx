'use client';
// صفحه اصلی — سه اقدام اصلی + کارتابل + مدارک اخیر + نیازمند بررسی + وضعیت پردازش
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Upload, MessageSquareText, ClipboardList, FileClock, AlertTriangle, ArrowLeft } from 'lucide-react';
import { api, fmtJalali } from './api';
import { toPersianDigits as toFa } from '@/lib/normalize';
import { StatusBadge, ConfBadge, SampleBadge } from './badges';

interface HomeData {
  openTasks: number;
  recentDocs: Array<{ id: string; docNumber: string; title: string; updatedAt: string; status: string; confidentiality: string; isSample: boolean }>;
  needsReview: Array<{ id: string; title: string; type: string; relatedDocId: string | null }>;
  totals: { total: number; incomplete: number; processing: number; quarantined: number };
  projectScope: number;
}

export function HomeView({ userName, go }: { userName: string; go: (view: string, param?: string) => void }) {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<HomeData>('/api/reports').then(setData).catch((e) => setError(e.message));
  }, []);

  const actions = [
    { key: 'search', icon: Search, title: 'جست‌وجوی سند', desc: 'با شماره خط، Tag تجهیز یا عنوان' },
    { key: 'upload', icon: Upload, title: 'بارگذاری مدارک', desc: 'فایل‌ها و تشکیل شناسنامه' },
    { key: 'assistant', icon: MessageSquareText, title: 'پرسش از اسناد', desc: 'پاسخ مستند با ارجاع' },
  ];

  return (
    <div className="space-y-6" data-testid="home-view">
      <div>
        <h1 className="text-xl font-bold">سلام، <span dir="auto">{userName}</span></h1>
        <p className="text-sm text-muted-foreground mt-1">سه اقدام اصلی — از خانه تا نتیجه حداکثر سه گام</p>
      </div>

      {/* سه اقدام اصلی */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {actions.map((a) => (
          <button
            key={a.key}
            onClick={() => go(a.key)}
            className="group text-right rounded-xl border bg-card p-6 transition-all hover:border-teal-600 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
          >
            <a.icon className="h-8 w-8 text-teal-700 dark:text-teal-400 mb-3" aria-hidden />
            <div className="font-bold group-hover:text-teal-700 dark:group-hover:text-teal-400">{a.title}</div>
            <div className="text-sm text-muted-foreground mt-1">{a.desc}</div>
          </button>
        ))}
      </div>

      {error && <Card className="border-red-300"><CardContent className="p-4 text-sm text-red-700 dark:text-red-300">{error}</CardContent></Card>}

      {!data && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" />
        </div>
      )}

      {data && (
        <>
          {/* وضعیت پردازش */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card><CardContent className="p-4"><div className="text-2xl font-bold">{toFa(data.totals.total)}</div><div className="text-xs text-muted-foreground mt-1">اسناد در دامنه شما ({toFa(data.projectScope)} پروژه)</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{toFa(data.totals.processing)}</div><div className="text-xs text-muted-foreground mt-1">در انتظار پردازش استخراج</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{toFa(data.totals.incomplete)}</div><div className="text-xs text-muted-foreground mt-1">شناسنامه ناقص</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-2xl font-bold text-red-700 dark:text-red-400">{toFa(data.totals.quarantined)}</div><div className="text-xs text-muted-foreground mt-1">فایل قرنطینه</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-2xl font-bold">{toFa(data.openTasks)}</div><div className="text-xs text-muted-foreground mt-1">وظیفه باز در کارتابل</div></CardContent></Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* کارتابل */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" /> کارتابل من</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.needsReview.length === 0 && <p className="text-sm text-muted-foreground">وظیفه بازی ندارید.</p>}
                {data.needsReview.slice(0, 4).map((t) => (
                  <button key={t.id} onClick={() => t.relatedDocId && go('document', t.relatedDocId)} className="w-full text-right flex items-center justify-between rounded-lg border p-3 hover:bg-accent">
                    <span dir="auto" className="text-sm text-start">{t.title}</span>
                    <ArrowLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
                <Button variant="ghost" size="sm" className="w-full" onClick={() => go('cartable')}>مشاهده کارتابل</Button>
              </CardContent>
            </Card>

            {/* مدارک اخیر */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FileClock className="h-4 w-4" /> مدارک اخیر</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.recentDocs.length === 0 && <p className="text-sm text-muted-foreground">سندی ثبت نشده است. از «بارگذاری مدارک» شروع کنید یا داده نمونه بسازید.</p>}
                {data.recentDocs.map((d) => (
                  <button key={d.id} onClick={() => go('document', d.id)} className="w-full text-right rounded-lg border p-3 hover:bg-accent">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="code-ltr font-medium text-sm">{d.docNumber}</span>
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {d.isSample && <SampleBadge />}
                        <ConfBadge conf={d.confidentiality} />
                        <StatusBadge status={d.status} />
                      </span>
                    </div>
                    <div dir="auto" className="text-sm text-muted-foreground mt-1 line-clamp-1 text-start">{d.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{fmtJalali(d.updatedAt, true)}</div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>

          {data.totals.quarantined > 0 && (
            <Card className="border-amber-300 dark:border-amber-800">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">فایل قرنطینه‌شده وجود دارد</p>
                  <p className="text-muted-foreground mt-1">فایل‌های قرنطینه وارد جست‌وجو و دستیار نمی‌شوند تا رفع مشکل و تأیید مجدد.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
