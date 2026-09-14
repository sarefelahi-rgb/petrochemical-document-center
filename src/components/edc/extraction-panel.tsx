'use client';
// پنل شناسنامهٔ استخراج‌شده — «استخراج‌شده، تأییدنشده» تا تصمیم کارشناس
// تأیید / اصلاح / رد · پیشنهادهای پردازش مجدد جدا نشان داده می‌شوند · امتیاز مدل «دقت اثبات‌شده» نیست
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { api } from './api';
import { Check, Pencil, X, Sparkles, Loader2, ScanText, ScanLine } from 'lucide-react';

const FIELD_LABELS: Record<string, string> = {
  DOC_NUMBER: 'شماره سند', TITLE: 'عنوان', REV: 'نسخه', SHEET: 'شیت', SHEET_OF: 'از شیت',
  TAG: 'Tag تجهیز', LINE: 'شماره خط', CLASS: 'کلاس', SIZE: 'سایز', SCALE: 'مقیاس', UNIT: 'واحد', PLANT: 'تاسیسات', NOTE: 'یادداشت',
};

interface Row {
  id: string; field: string; valueRaw: string; confidence: number; source: string;
  page: number | null; bbox: [number, number, number, number] | null;
  status: string; isSuggestion: boolean; reviewedAt: string | null;
  file: { id: string; name: string } | null;
}

export function ExtractionPanel({ documentId, onOpenPage }: { documentId: string; onOpenPage: (fileId: string, page: number, rect: [number, number, number, number] | null) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [counts, setCounts] = useState({ total: 0, unreviewed: 0, confirmed: 0, suggestions: 0 });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<{ items: Row[]; canReview: boolean; counts: typeof counts }>(`/api/documents/${documentId}/extractions`)
      .then((r) => { setRows(r.items); setCanReview(r.canReview); setCounts(r.counts); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [documentId]);
  useEffect(load, [load]);

  async function act(id: string, action: string, value?: string) {
    setBusy(id);
    try {
      await api(`/api/extractions/${id}`, { method: 'PATCH', json: { action, value } });
      toast({ title: action === 'confirm' ? 'مقدار تأیید شد' : action === 'reject' ? 'مقدار رد شد' : 'مقدار اصلاح شد' });
      setEditing(null);
      load();
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  const main = rows.filter((r) => !r.isSuggestion);
  const suggestions = rows.filter((r) => r.isSuggestion);

  return (
    <Card data-testid="extraction-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <ScanText className="h-4 w-4" /> شناسنامهٔ استخراج‌شده از مدرک
          {counts.total > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {counts.confirmed} تأییدشده · {counts.unreviewed} در انتظار بازبینی
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          مقادیر حیاتی تا تأیید کارشناس «استخراج‌شده، تأییدنشده» هستند؛ حدس زدن عدد ناخوانا ممنوع است و امتیاز مدل دقت اثبات‌شده نیست.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">در حال بارگذاری…</p>}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">هنوز مقداری استخراج نشده است. پس از پردازش فایل توسط Worker، مقادیر کادر عنوان اینجا نمایش داده می‌شود.</p>
        )}
        {main.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 flex-wrap" data-testid={`extraction-${r.field}`}>
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-20 shrink-0">{FIELD_LABELS[r.field] || r.field}</span>
              {editing === r.id ? (
                <Input className="h-7 w-52 text-sm" dir="auto" value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus />
              ) : (
                <span className="code-ltr text-sm font-medium truncate max-w-72" dir="auto">{r.valueRaw}</span>
              )}
              <ConfidenceChip confidence={r.confidence} source={r.source} />
              {r.status === 'CONFIRMED' && <Badge className="bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" variant="outline">تأییدشده</Badge>}
              {r.status === 'EDITED' && <Badge className="bg-sky-50 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" variant="outline">اصلاح‌شده</Badge>}
              {r.status === 'REJECTED' && <Badge variant="outline" className="text-muted-foreground">ردشده</Badge>}
              {r.status === 'UNREVIEWED' && <Badge variant="outline" className="bg-amber-50 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">تأییدنشده</Badge>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {r.page != null && (
                <Button size="sm" variant="ghost" onClick={() => onOpenPage(r.file?.id || '', r.page as number, r.bbox)} title="نمایش در صفحه و محدودهٔ منبع">
                  <ScanLine className="h-4 w-4" /> ص {toFa(r.page)}
                </Button>
              )}
              {canReview && r.status !== 'REJECTED' && editing !== r.id && (
                <>
                  {r.status !== 'CONFIRMED' && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-700" disabled={busy === r.id} onClick={() => act(r.id, 'confirm')} aria-label="تأیید"><Check className="h-4 w-4" /></Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy === r.id} onClick={() => { setEditing(r.id); setEditValue(r.valueRaw); }} aria-label="اصلاح"><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-700" disabled={busy === r.id} onClick={() => act(r.id, 'reject')} aria-label="رد"><X className="h-4 w-4" /></Button>
                </>
              )}
              {editing === r.id && (
                <>
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r.id, 'edit', editValue)}>ثبت</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>انصراف</Button>
                </>
              )}
            </div>
          </div>
        ))}

        {/* پیشنهادهای پردازش مجدد — جایگزین مقدار تأییدشده نمی‌شوند */}
        {suggestions.length > 0 && (
          <div className="pt-2 space-y-2">
            <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setShowSuggestions((v) => !v)}>
              <Sparkles className="h-4 w-4 text-amber-500" /> پیشنهادهای پردازش مجدد ({toFa(suggestions.length)}) — مقادیر تأییدشده دست‌نخورده مانده‌اند
            </button>
            {showSuggestions && suggestions.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-amber-400/60 bg-amber-50/40 dark:bg-amber-900/10 px-3 py-2 flex-wrap">
                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{FIELD_LABELS[r.field] || r.field}</span>
                  <span className="code-ltr text-sm font-medium truncate" dir="auto">{r.valueRaw}</span>
                  <ConfidenceChip confidence={r.confidence} source={r.source} />
                  <Badge variant="outline" className="bg-amber-50 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">پیشنهاد</Badge>
                </div>
                <div className="flex items-center gap-1">
                  {r.page != null && (
                    <Button size="sm" variant="ghost" onClick={() => onOpenPage(r.file?.id || '', r.page as number, r.bbox)}>
                      <ScanLine className="h-4 w-4" /> ص {toFa(r.page)}
                    </Button>
                  )}
                  {canReview && (
                    <>
                      <Button size="sm" variant="outline" className="text-emerald-700" disabled={busy === r.id} onClick={() => act(r.id, 'accept_suggestion')}>پذیرش پیشنهاد</Button>
                      <Button size="sm" variant="ghost" className="text-red-700" disabled={busy === r.id} onClick={() => act(r.id, 'reject')}>رد</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfidenceChip({ confidence, source }: { confidence: number; source: string }) {
  const pct = Math.round(confidence * 100);
  const tone = pct >= 85 ? 'text-emerald-700 dark:text-emerald-300' : pct >= 60 ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-300';
  return (
    <span className="text-[10px] inline-flex items-center gap-1" title={`امتیاز مدل — دقت اثبات‌شده نیست · منبع: ${source === 'OCR' ? 'OCR' : 'لایهٔ متن PDF'}`}>
      <span className={`font-bold ${tone}`}>{toFa(pct)}٪</span>
      {source === 'OCR' ? <ScanLine className="h-3 w-3 text-muted-foreground" /> : <ScanText className="h-3 w-3 text-muted-foreground" />}
    </span>
  );
}

function toFa(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);
}

export { FIELD_LABELS };
