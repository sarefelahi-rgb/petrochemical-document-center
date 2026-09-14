'use client';
// مقایسهٔ دو ویرایش سند — تفاوت واژه‌ای متن صفحات + هشدار صداقت برای OCR (مرحله C)
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GitCompareArrows, AlertTriangle } from 'lucide-react';
import { api, fmtJalali, REV_STATUS_LABELS } from './api';

interface RevOpt { id: string; revisionCode: string; status: string; purpose: string | null; docDate: string | null; receivedDate: string }
interface ComparePage {
  page: number; added: number; removed: number;
  aSource?: string | null; bSource?: string | null; aAbsent?: boolean; bAbsent?: boolean;
  samples?: Array<{ a?: string; b?: string }>;
}
interface CompareData {
  a: RevOpt; b: RevOpt;
  doc: { id: string; docNumber: string; title: string };
  pages: ComparePage[];
  summary: { totalAdded: number; totalRemoved: number; wordsA: number; wordsB: number; changeRatio: number | null; pagesCompared: number; scanWarning: boolean };
  note: string;
}

export function ComparePanel({ documentId, revisions }: { documentId: string; revisions: RevOpt[] }) {
  const [revA, setRevA] = useState<string>('');
  const [revB, setRevB] = useState<string>('');
  const [data, setData] = useState<CompareData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (revisions.length >= 2) {
      setRevA(revisions[1].id); // قدیمی‌تر
      setRevB(revisions[0].id); // جدیدتر
    }
  }, [revisions]);

  const run = useCallback(async () => {
    if (!revA || !revB || revA === revB) return;
    setBusy(true); setError('');
    try {
      const r = await api<CompareData>(`/api/documents/${documentId}/compare?a=${revA}&b=${revB}`);
      setData(r);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }, [documentId, revA, revB]);

  if (revisions.length < 2) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><GitCompareArrows className="h-4 w-4" /> مقایسهٔ نسخه‌ها</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">برای مقایسه، حداقل دو ویرایش با فایل پردازش‌شده لازم است.</CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="compare-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><GitCompareArrows className="h-4 w-4" /> مقایسهٔ نسخه‌ها</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">تفاوت واژه‌ای متن صفحات (لایهٔ متن/OCR) — جای بازبینی مهندسی نقشه را نمی‌گیرد.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={revA} onValueChange={setRevA}>
            <SelectTrigger className="w-40" aria-label="ویرایش پایه"><SelectValue placeholder="ویرایش پایه" /></SelectTrigger>
            <SelectContent>
              {revisions.map((r) => (
                <SelectItem key={r.id} value={r.id}>Rev {r.revisionCode} ({fmtJalali(r.receivedDate)})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">پایه ← مقایسه با</span>
          <Select value={revB} onValueChange={setRevB}>
            <SelectTrigger className="w-40" aria-label="ویرایش مقایسه"><SelectValue placeholder="ویرایش مقایسه" /></SelectTrigger>
            <SelectContent>
              {revisions.map((r) => (
                <SelectItem key={r.id} value={r.id}>Rev {r.revisionCode} ({fmtJalali(r.receivedDate)})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={run} disabled={busy || !revA || !revB || revA === revB}>مقایسه</Button>
        </div>

        {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}

        {busy && <p className="text-sm text-muted-foreground">در حال مقایسهٔ متن صفحات…</p>}

        {data && (
          <div className="space-y-3" data-testid="compare-result">
            <div className="flex flex-wrap gap-4 text-sm rounded-lg bg-muted/40 px-3 py-2">
              <span>واژه‌های پایه (Rev {data.a.revisionCode}): <b className="code-ltr">{data.summary.wordsA}</b></span>
              <span>واژه‌های مقایسه (Rev {data.b.revisionCode}): <b className="code-ltr">{data.summary.wordsB}</b></span>
              <span className="text-emerald-700 dark:text-emerald-300">افزوده: <b className="code-ltr">{data.summary.totalAdded}</b></span>
              <span className="text-red-700 dark:text-red-300">حذف‌شده: <b className="code-ltr">{data.summary.totalRemoved}</b></span>
              <span>شاخص تغییر: <b className="code-ltr">{data.summary.changeRatio != null ? `${data.summary.changeRatio}٪` : '—'}</b></span>
            </div>

            {data.summary.scanWarning && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>یکی از نسخه‌ها OCR است؛ بخشی از تفاوت‌ها می‌تواند ناشی از خطای خواندن باشد نه تغییر واقعی طراحی. «تفاوت قطعی» فقط با بازبینی کارشناس تأیید می‌شود.</span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm border rounded-lg">
                <thead className="bg-muted/60 text-xs">
                  <tr>
                    <th className="p-2 text-right">صفحه</th>
                    <th className="p-2 text-right">افزوده</th>
                    <th className="p-2 text-right">حذف‌شده</th>
                    <th className="p-2 text-right">منبع متن (پایه/مقایسه)</th>
                    <th className="p-2 text-right">نمونهٔ تغییر</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pages.map((p) => {
                    const changed = p.added + p.removed > 0;
                    return (
                      <tr key={p.page} className={`border-t ${changed ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                        <td className="p-2 font-medium">{p.page}</td>
                        <td className="p-2 code-ltr">{p.aAbsent ? '—' : p.added}</td>
                        <td className="p-2 code-ltr">{p.bAbsent ? '—' : p.removed}</td>
                        <td className="p-2 text-xs text-muted-foreground">{p.aSource || '—'} / {p.bSource || '—'}</td>
                        <td className="p-2 text-xs max-w-72 truncate" dir="ltr">
                          {p.samples?.length ? p.samples.slice(0, 3).map((s) => `${s.a ? `−${s.a}` : ''}${s.a && s.b ? ' ' : ''}${s.b ? `+${s.b}` : ''}`).join(' | ') : (changed ? 'جابه‌جایی واژه‌ها' : 'بدون تغییر')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground leading-5">{data.note}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
