'use client';
// مرکز اسناد — درخت مجتمع/ناحیه/واحد + فهرست فیلترپذیر + جدول/کارت + ذخیره جست‌وجو + علاقه‌مندی
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronDown, Search, Star, LayoutGrid, Table2, Bookmark, X, FileText } from 'lucide-react';
import { api, STATUS_LABELS, CONF_LABELS } from './api';
import { toPersianDigits } from '@/lib/normalize';
import { StatusBadge, ConfBadge, SampleBadge } from './badges';

interface TreeNode { id: string; code: string; name: string; areas?: Array<{ id: string; code: string; name: string; units: Array<{ id: string; code: string; name: string; docCount: number }> }> }
interface DocRow {
  id: string; docNumber: string; title: string; discipline: string; docType: string;
  project: { code: string; name: string };
  unit: { code: string; name: string; area: { code: string; name: string } } | null;
  confidentiality: string; status: string; processingStatus: string; isSample: boolean;
  latestRevision: { revisionCode: string; status: string } | null; updatedAt: string;
}

const SAVED_KEY = 'edc_saved_searches_v1'; // ترجیح نمایشی کاربر — داده اصلی اینجا ذخیره نمی‌شود

export function DocumentCenter({ go, refreshFavorites, favoriteIds }: {
  go: (view: string, param?: string) => void;
  refreshFavorites: () => void;
  favoriteIds: Set<string>;
}) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selProject, setSelProject] = useState('');
  const [selUnit, setSelUnit] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [conf, setConf] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [contentHits, setContentHits] = useState<Array<{ id: string; docNumber: string; title: string; project: string; revision: string | null; page: number; snippet: string; source: string }> | null>(null);
  const [contentSearching, setContentSearching] = useState(false);
  const [saved, setSaved] = useState<Array<{ name: string; q: string; status: string; conf: string; project: string }>>(() => {
    try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; }
  });

  const loadTree = useCallback(() => {
    api<{ projects: TreeNode[] }>('/api/tree').then((r) => setTree(r.projects)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const fetchDocs = useCallback((p = 1) => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(p), pageSize: '20' });
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (conf) params.set('confidentiality', conf);
    if (selUnit) params.set('unitId', selUnit);
    else if (selProject) params.set('projectId', selProject);
    api<{ items: DocRow[]; total: number }>(`/api/documents?${params}`)
      .then((r) => { setRows(r.items); setTotal(r.total); setPage(p); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [q, status, conf, selProject, selUnit]);

  useEffect(() => {
    const t = setTimeout(() => fetchDocs(1), 0);
    return () => clearTimeout(t);
  }, [selProject, selUnit, status, conf]); // جست‌وجوی q با دکمه

  const toggle = (id: string) => {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const pages = Math.max(1, Math.ceil(total / 20));

  const saveSearch = () => {
    const next = [{ name: q || (status ? STATUS_LABELS[status] : 'همه اسناد'), q, status, conf, project: selProject }, ...saved].slice(0, 6);
    setSaved(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  };

  // جست‌وجو در متن صفحات (لایهٔ متن یا OCR) — نتیجه با لینک مستقیم صفحه
  const searchContent = async () => {
    if (q.trim().length < 2) return;
    setContentSearching(true);
    try {
      const r = await api<{ items: typeof contentHits }>(`/api/search?scope=content&q=${encodeURIComponent(q)}&limit=12`);
      setContentHits(r.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setContentSearching(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="document-center">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">مرکز اسناد</h1>
        <div className="flex items-center gap-2">
          <Button variant={viewMode === 'table' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('table')} aria-label="نمای جدولی"><Table2 className="h-4 w-4" /></Button>
          <Button variant={viewMode === 'cards' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('cards')} aria-label="نمای کارتی"><LayoutGrid className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* درخت ساختار */}
        <Card className="h-fit">
          <CardContent className="p-2">
            <ScrollArea className="h-[480px] thin-scroll">
              <button
                onClick={() => { setSelProject(''); setSelUnit(''); }}
                className={`w-full text-right px-3 py-2 rounded-lg text-sm font-medium ${!selProject && !selUnit ? 'bg-teal-700 text-white' : 'hover:bg-accent'}`}
              >
                همهٔ دامنه من
              </button>
              {tree.map((p) => (
                <div key={p.id} className="mt-1">
                  <div className="flex items-center">
                    <button onClick={() => toggle(p.id)} className="p-1.5" aria-label={`باز و بسته کردن ${p.name}`}>
                      {expanded.has(p.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => { setSelProject(p.id); setSelUnit(''); }}
                      className={`flex-1 text-right px-2 py-1.5 rounded-lg text-sm font-medium ${selProject === p.id && !selUnit ? 'bg-teal-700 text-white' : 'hover:bg-accent'}`}
                    >
                      {p.name} <span className="code-ltr text-xs opacity-70">{p.code}</span>
                    </button>
                  </div>
                  {expanded.has(p.id) && p.areas?.map((a) => (
                    <div key={a.id} className="mr-6">
                      <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{a.name} <span className="code-ltr">{a.code}</span></div>
                      {a.units.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => { setSelProject(p.id); setSelUnit(u.id); }}
                          className={`w-[95%] mr-4 text-right px-2 py-1.5 rounded-lg text-sm flex justify-between ${selUnit === u.id ? 'bg-teal-700 text-white' : 'hover:bg-accent'}`}
                        >
                          <span>{u.name} <span className="code-ltr text-xs">{u.code}</span></span>
                          <span className="text-xs opacity-75">{u.docCount}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
              {tree.length === 0 && <p className="text-sm text-muted-foreground p-3">پروژه‌ای در دامنه دسترسی شما نیست.</p>}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* فهرست اسناد */}
        <div className="space-y-3">
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="شماره سند، Tag، شماره خط یا عنوان…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchDocs(1)}
                    className="pr-9"
                    dir="auto"
                    aria-label="جست‌وجو در اسناد"
                  />
                </div>
                <Button onClick={() => fetchDocs(1)} disabled={loading}>{loading ? '…' : 'جست‌وجو'}</Button>
                <Button variant="outline" onClick={searchContent} disabled={contentSearching} title="جست‌وجو در متن صفحات (لایهٔ متن یا OCR)">
                  <FileText className="h-4 w-4" /> {contentSearching ? '…' : 'در متن مدارک'}
                </Button>
                <Button variant="outline" onClick={saveSearch} title="ذخیره این جست‌وجو"><Bookmark className="h-4 w-4" /></Button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="وضعیت" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همهٔ وضعیت‌ها</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={conf || 'all'} onValueChange={(v) => setConf(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="محرمانگی" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همهٔ سطوح</SelectItem>
                    {Object.entries(CONF_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                {saved.length > 0 && (
                  <Select onValueChange={(v) => { const s = saved[Number(v)]; if (s) { setQ(s.q); setStatus(s.status); setConf(s.conf); setSelProject(s.project); } }}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="جست‌وجوهای ذخیره‌شده" /></SelectTrigger>
                    <SelectContent>
                      {saved.map((s, i) => <SelectItem key={i} value={String(i)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {(q || status || conf) && (
                  <Button variant="ghost" size="sm" onClick={() => { setQ(''); setStatus(''); setConf(''); }}><X className="h-4 w-4" /> پاک‌کردن فیلترها</Button>
                )}
              </div>

              {/* نتایج جست‌وجوی درون‌مدرک با لینک مستقیم صفحه */}
              {contentHits !== null && (
                <div className="rounded-lg border bg-muted/20 p-2 space-y-1" data-testid="content-search-results">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">نتایج جست‌وجو در متن صفحات ({contentHits.length > 0 ? `${toPersianDigits(String(contentHits.length))} تطبیق` : 'بدون نتیجه'})</p>
                    <Button size="sm" variant="ghost" onClick={() => setContentHits(null)}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                  {contentHits.length === 0 && <p className="text-xs text-muted-foreground">در متن صفحات مدارک مجاز شما تطبیقی یافت نشد. مدارک پردازش‌نشده در جست‌وجوی متن نمی‌آیند (به‌عنوان فایل قابل مدیریت‌اند).</p>}
                  {contentHits.map((h, i) => (
                    <button key={i} onClick={() => go('document', h.id)} className="block w-full text-right text-xs rounded px-2 py-1.5 hover:bg-accent">
                      <span className="code-ltr font-bold">{h.docNumber}</span>
                      <span className="text-muted-foreground"> · <span dir="auto">{h.title}</span> · <span className="code-ltr">{h.project}</span>{h.revision ? ` · R${h.revision}` : ''}</span>
                      <Badge variant="outline" className="mx-1">صفحه {toPersianDigits(String(h.page))}</Badge>
                      <Badge variant="outline">{h.source === 'OCR' ? 'OCR' : 'متن'}</Badge>
                      <div dir="auto" className="text-muted-foreground truncate text-start">{h.snippet.slice(0, 120)}</div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {error && <Card className="border-red-300"><CardContent className="p-3 text-sm text-red-700 dark:text-red-300">{error}</CardContent></Card>}

          {viewMode === 'table' ? (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">شماره سند</TableHead>
                      <TableHead className="text-right">عنوان</TableHead>
                      <TableHead className="text-right">واحد</TableHead>
                      <TableHead className="text-right">Rev</TableHead>
                      <TableHead className="text-right">وضعیت</TableHead>
                      <TableHead className="text-right">محرمانگی</TableHead>
                      <TableHead className="w-10"><span className="sr-only">علاقه‌مندی</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((d) => (
                      <TableRow key={d.id} className="cursor-pointer" onClick={() => go('document', d.id)}>
                        <TableCell className="font-medium"><span className="code-ltr">{d.docNumber}</span></TableCell>
                        <TableCell className="max-w-[280px]"><div dir="auto" className="truncate text-start">{d.title}</div></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.unit ? <span className="code-ltr">{d.unit.code}</span> : '—'}</TableCell>
                        <TableCell><span className="code-ltr text-xs">{d.latestRevision?.revisionCode || '—'}</span></TableCell>
                        <TableCell><StatusBadge status={d.status} /></TableCell>
                        <TableCell><ConfBadge conf={d.confidentiality} /></TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={async () => { await api(`/api/documents/${d.id}/favorite`, { method: 'POST' }); refreshFavorites(); fetchDocs(page); }}
                            aria-label="افزودن/حذف علاقه‌مندی"
                          >
                            <Star className={`h-4 w-4 ${favoriteIds.has(d.id) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!loading && rows.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                        سندی در این دامنه یافت نشد. فیلترها را تغییر دهید یا از «بارگذاری مدارک» سند جدید ثبت کنید.
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {rows.map((d) => (
                <Card key={d.id} className="cursor-pointer hover:border-teal-600 transition-colors" onClick={() => go('document', d.id)}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <span className="code-ltr font-bold text-sm">{d.docNumber}</span>
                      <button onClick={(e) => { e.stopPropagation(); api(`/api/documents/${d.id}/favorite`, { method: 'POST' }).then(refreshFavorites); }} aria-label="علاقه‌مندی">
                        <Star className={`h-4 w-4 ${favoriteIds.has(d.id) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                      </button>
                    </div>
                    <div dir="auto" className="text-sm text-muted-foreground line-clamp-2 min-h-10 text-start">{d.title}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {d.isSample && <SampleBadge />}
                      <StatusBadge status={d.status} />
                      <ConfBadge conf={d.confidentiality} />
                    </div>
                    <div className="text-xs text-muted-foreground"><span className="code-ltr">{d.project.code}</span>{d.unit ? ` · ${d.unit.code}` : ''} · R{d.latestRevision?.revisionCode || '—'}</div>
                  </CardContent>
                </Card>
              ))}
              {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground col-span-full text-center py-8">سندی یافت نشد.</p>}
            </div>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => fetchDocs(page - 1)}>قبلی</Button>
              <span className="text-sm text-muted-foreground">صفحه {toPersianDigits(String(page))} از {toPersianDigits(String(pages))} — {toPersianDigits(String(total))} سند</span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => fetchDocs(page + 1)}>بعدی</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
