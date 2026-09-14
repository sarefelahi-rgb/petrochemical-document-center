'use client';
// پروندهٔ تجهیز/خط — جست‌وجوی Tag یا شماره خط و نمایش گروهی مدارک مرتبط (مرحله C)
import { useCallback, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Search, FolderOpen, AlertTriangle } from 'lucide-react';
import { api } from './api';
import { SampleBadge } from './badges';

interface DossierDoc {
  documentId: string; docNumber: string; title: string; project: string; docType: string;
  revision: string | null; revStatus: string | null; status: string; confidentiality: string;
  linkStatus: string; linkRef: string;
}
interface DossierData {
  found: boolean; ref: string; message?: string;
  tag?: { tag: string; description: string | null; tagType: string } | null;
  line?: { lineNumber: string; spec: string | null; sizeClass: string | null; unit: string } | null;
  tagVisible?: boolean;
  groups: Array<{ label: string; docs: DossierDoc[] }>;
  suggested: number; confirmed: number; totalDocs: number;
}

export function DossierView({ initialRef, go }: { initialRef?: string; go: (view: string, param?: string) => void }) {
  const [ref, setRef] = useState(initialRef || '');
  const [data, setData] = useState<DossierData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (r: string) => {
    if (!r.trim()) return;
    setBusy(true); setError('');
    try {
      const res = await api<DossierData>(`/api/dossier?ref=${encodeURIComponent(r.trim())}`);
      setData(res);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }, []);

  return (
    <div className="space-y-4" data-testid="dossier-view">
      <div>
        <Button variant="ghost" size="sm" onClick={() => go('home')} className="mb-1"><ArrowRight className="h-4 w-4" /> صفحهٔ اصلی</Button>
        <h1 className="text-xl font-bold flex items-center gap-2"><FolderOpen className="h-5 w-5 text-teal-700" /> پروندهٔ تجهیز / خط</h1>
        <p className="text-sm text-muted-foreground mt-1">
          شناسهٔ یک تجهیز (Tag) یا خط (Line Number) را وارد کنید تا همهٔ مدارک مجاز مرتبط — نقشهٔ ساخت، GA، دیتاشیت،
          بازرسی، تست و ایزومتریک — به‌صورت گروه‌بندی‌شده نمایش داده شود.
        </p>
      </div>

      <div className="flex gap-2 max-w-xl">
        <Input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(ref)}
          placeholder="مثال: EA-308B یا 6-P-1183-B2A"
          className="code-ltr text-left"
          dir="ltr"
          aria-label="Tag یا شماره خط"
        />
        <Button onClick={() => load(ref)} disabled={busy || !ref.trim()}>
          <Search className="h-4 w-4" /> جست‌وجوی پرونده
        </Button>
      </div>

      {error && <Card className="border-red-300"><CardContent className="p-4 text-sm text-red-700 dark:text-red-300">{error}</CardContent></Card>}

      {busy && <Card><CardContent className="p-6 text-sm text-muted-foreground">در حال گردآوری مدارک مجاز…</CardContent></Card>}

      {data && !data.found && (
        <Card><CardContent className="p-6 space-y-2">
          <p className="font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> پرونده‌ای یافت نشد</p>
          <p className="text-sm text-muted-foreground">{data.message}</p>
        </CardContent></Card>
      )}

      {data && data.found && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">شناسه</div>
                <div className="code-ltr font-bold text-base">{data.tag?.tag || data.line?.lineNumber || data.ref}</div>
              </div>
              {data.tag?.description && <div><div className="text-xs text-muted-foreground">شرح</div><div>{data.tag.description}</div></div>}
              {data.line?.spec && <div><div className="text-xs text-muted-foreground">Spec</div><div className="code-ltr">{data.line.spec}</div></div>}
              {data.line?.unit && <div><div className="text-xs text-muted-foreground">واحد</div><div className="code-ltr">{data.line.unit}</div></div>}
              <div className="mr-auto flex gap-2">
                <Badge variant="outline" className="bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">رابطهٔ تأییدشده: {data.confirmed}</Badge>
                <Badge variant="outline" className="bg-amber-50 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">پیشنهادی: {data.suggested}</Badge>
              </div>
            </CardContent>
          </Card>

          {data.totalDocs === 0 && (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">
              برای این شناسه هیچ مدرکی در دامنهٔ دسترسی شما ثبت نشده است.
            </CardContent></Card>
          )}

          {data.groups.map((g) => (
            <Card key={g.label}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{g.label} <span className="text-sm font-normal text-muted-foreground">({g.docs.length} سند)</span></CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {g.docs.map((d) => (
                  <button
                    key={d.documentId}
                    onClick={() => go('document', d.documentId)}
                    className="block w-full text-right rounded-lg border px-3 py-2.5 hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="code-ltr font-semibold text-sm">{d.docNumber}</span>
                      <Badge variant="outline" className={d.linkStatus === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'}>
                        {d.linkStatus === 'CONFIRMED' ? 'تأییدشده' : 'پیشنهادی'}
                      </Badge>
                      {d.revision && <Badge variant="outline">Rev {d.revision}</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">{d.title}</div>
                  </button>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
