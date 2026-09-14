'use client';
// نمایشگر PDF مرحله B — pdf.js
// بزرگ‌نمایی عمیق · جابه‌جایی · چرخش · Fit · انتخاب شیت · جست‌وجوی درون‌مدرک با هایلایت
// لایهٔ متن قابل انتخاب · کادرهای استخراج · حاشیه‌نویسی · واترمارک پویا · نوار وضعیت همیشه پیداست
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { api, fmtJalali } from './api';
import { RevBadge, ConfBadge } from './badges';
import {
  ZoomIn, ZoomOut, RotateCw, Maximize2, ChevronRight, ChevronLeft, Search,
  StickyNote, MapPin, Highlighter, Eye, EyeOff, X, Loader2, Link2,
} from 'lucide-react';

export interface ViewerDocInfo {
  documentId: string;
  docNumber: string;
  title: string;
  revisionCode: string;
  revisionStatus: string;
  isValidRevision: boolean;
  docDate: string | null;
  confidentiality: string;
  isSample?: boolean;
}

export interface ViewerFile {
  id: string;
  name: string;
  mimeType: string;
}

export interface ViewerTarget {
  file: ViewerFile;
  doc: ViewerDocInfo;
  initialPage?: number;
  highlightRect?: [number, number, number, number] | null;
  searchQuery?: string | null;
}

interface ExtractRow {
  id: string; field: string; valueRaw: string; confidence: number; source: string;
  page: number | null; bbox: [number, number, number, number] | null; status: string; isSuggestion: boolean;
}
interface AnnotationRow {
  id: string; page: number; type: string; rect: [number, number, number, number] | null;
  text: string | null; color: string; resolved: boolean; author: string; mine: boolean; createdAt: string;
}

const FIELD_LABELS: Record<string, string> = {
  DOC_NUMBER: 'شماره سند', TITLE: 'عنوان', REV: 'نسخه', SHEET: 'شیت', SHEET_OF: 'از',
  TAG: 'Tag تجهیز', LINE: 'شماره خط', CLASS: 'کلاس', SIZE: 'سایز', SCALE: 'مقیاس', UNIT: 'واحد', PLANT: 'تاسیسات',
};

// pdfjs静态 بارگذاری تنبل
let pdfjsLib: typeof import('pdfjs-dist') | null = null;
async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const lib = await import('pdfjs-dist');
  lib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
  pdfjsLib = lib;
  return lib;
}

export function PdfViewerDialog({ target, onClose }: { target: ViewerTarget | null; onClose: () => void }) {
  if (!target) return null;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] flex flex-col p-3 gap-2" dir="rtl">
        <DialogHeader className="hidden"><DialogTitle>نمایشگر</DialogTitle><DialogDescription /></DialogHeader>
        <PdfViewer target={target} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function PdfViewer({ target, onClose }: { target: ViewerTarget; onClose: () => void }) {
  const { file, doc } = target;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(target.initialPage || 1);
  const [scale, setScale] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [fit, setFit] = useState<'width' | 'page' | 'free'>('width');
  const [searchOpen, setSearchOpen] = useState(!!target.searchQuery);
  const [query, setQuery] = useState(target.searchQuery || '');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Array<{ page: number; snippet: string; rects: Array<[number, number, number, number]>; source: string }>>([]);
  const [activeResult, setActiveResult] = useState(-1);
  const [showTextLayer, setShowTextLayer] = useState(true);
  const [showExtractions, setShowExtractions] = useState(true);
  const [extractions, setExtractions] = useState<ExtractRow[]>([]);
  const [annotations, setAnnotations] = useState<AnnotationRow[]>([]);
  const [annTool, setAnnTool] = useState<'none' | 'PIN' | 'NOTE' | 'HIGHLIGHT'>('none');

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<{ numPages: number; getPage: (n: number) => Promise<PdfPage> } | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void; promise: Promise<unknown> } | null>(null);
  const [me, setMe] = useState<{ fullName: string } | null>(null);

  interface PdfPage {
    getViewport: (o: { scale: number; rotation?: number }) => { width: number; height: number };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void>; cancel: () => void };
    getTextContent: () => Promise<{ items: Array<{ str?: string; transform?: number[]; width?: number; height?: number }> }>;
    streamTextContent: () => unknown;
    cleanup: () => void;
  }

  // نشست کاربر برای واترمارک
  useEffect(() => { api<{ user: { fullName: string } }>('/api/auth/me').then((r) => setMe(r.user ? { fullName: r.user.fullName } : null)).catch(() => {}); }, []);

  // بارگذاری PDF با توکن تازه
  const loadPdf = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await api<{ url: string }>(`/api/files/${file.id}/download-token`, { method: 'POST' });
      const resp = await fetch(r.url, { credentials: 'same-origin' });
      if (!resp.ok) throw new Error('دریافت فایل ناموفق بود');
      const data = await resp.arrayBuffer();
      const lib = await loadPdfjs();
      const pdfDoc = (await lib.getDocument({ data }).promise) as unknown as NonNullable<typeof pdfDocRef.current>;
      pdfDocRef.current = pdfDoc;
      setPageCount(pdfDoc.numPages);
      const meta = await api<{ items: ExtractRow[] }>(`/api/documents/${doc.documentId}/extractions`).catch(() => null);
      if (meta?.items) setExtractions(meta.items as unknown as ExtractRow[]);
      setLoading(false);
    } catch (e) {
      setError((e as Error).message || 'خطا در بارگذاری');
      setLoading(false);
    }
     
  }, [file.id, doc.documentId]);

  useEffect(() => { loadPdf(); }, [loadPdf]);

  // رندر صفحهٔ جاری
  useEffect(() => {
    let cancelled = false;
    async function render() {
      const pdfDoc = pdfDocRef.current;
      const canvas = canvasRef.current;
      if (!pdfDoc || !canvas || loading) return;
      const pageNum = Math.min(Math.max(1, page), pdfDoc.numPages);
      const pg = (await pdfDoc.getPage(pageNum)) as PdfPage;
      const container = containerRef.current;
      const base = pg.getViewport({ scale: 1, rotation });
      let effScale = scale;
      if (fit !== 'free' && container) {
        const availW = container.clientWidth - 36;
        const availH = container.clientHeight - 36;
        effScale = fit === 'width' ? availW / base.width : Math.min(availW / base.width, availH / base.height);
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pg.getViewport({ scale: effScale * dpr, rotation });
      const ctx = canvas.getContext('2d');
      if (!ctx || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;
      renderTaskRef.current?.cancel();
      const task = pg.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
      // لایهٔ متن
      const tl = textLayerRef.current;
      if (tl) {
        tl.innerHTML = '';
        tl.style.width = `${viewport.width / dpr}px`;
        tl.style.height = `${viewport.height / dpr}px`;
        if (showTextLayer) {
          const lib = await loadPdfjs();
          const textContent = await pg.streamTextContent();
           
          const layer = new (lib as any).TextLayer({ textContentSource: textContent, container: tl, viewport });
          await layer.render();
        }
      }
    }
    render().catch((e) => { if (!cancelled && (e as Error)?.name !== 'RenderingCancelledException') console.error('render', e); });
    return () => { cancelled = true; };
  }, [page, scale, rotation, fit, loading, showTextLayer, pageCount]);

  // هایلایت هدف از ارجاع (لینک صفحه)
  useEffect(() => {
    if (!loading && target.initialPage && target.highlightRect) {
      flashRect(target.highlightRect);
    }
     
  }, [loading]);

  function flashRect(rect: [number, number, number, number]) {
    const wrap = canvasWrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:${rect[0] * 100}%;top:${rect[1] * 100}%;width:${rect[2] * 100}%;height:${rect[3] * 100}%;background:rgba(250,204,21,.45);border:2px solid #f59e0b;border-radius:2px;pointer-events:none;z-index:30;transition:opacity 1.2s`;
    wrap.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; }, 1200);
    setTimeout(() => el.remove(), 2600);
  }

  // حاشیه‌نویسی‌ها
  const loadAnnotations = useCallback(() => {
    api<{ items: AnnotationRow[] }>(`/api/files/${file.id}/annotations`).then((r) => setAnnotations(r.items)).catch(() => {});
  }, [file.id]);
  useEffect(() => { if (!loading) loadAnnotations(); }, [loading, loadAnnotations]);

  async function createAnnotation(rect: [number, number, number, number], kind: string) {
    let text: string | null = null;
    if (kind === 'NOTE' || kind === 'PIN') {
      text = window.prompt('متن یادداشت:') || null;
      if (text === null) return;
    }
    try {
      await api(`/api/files/${file.id}/annotations`, { method: 'POST', json: { page, type: kind, rect, text } });
      loadAnnotations();
    } catch (e) {
      toast({ title: 'حاشیه‌نویسی', description: (e as Error).message, variant: 'destructive' });
    }
  }

  // درگ رسم حاشیه‌نویسی
  function onCanvasPointerDown(e: React.PointerEvent) {
    if (annTool === 'none') return;
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const wrapEl = wrap;
    const rect = wrap.getBoundingClientRect();
    const startX = (e.clientX - rect.left) / rect.width;
    const startY = (e.clientY - rect.top) / rect.height;
    let ghost: HTMLDivElement | null = null;
    function move(ev: PointerEvent) {
      const cx = (ev.clientX - rect.left) / rect.width;
      const cy = (ev.clientY - rect.top) / rect.height;
      if (annTool === 'PIN') return;
      if (!ghost) {
        ghost = document.createElement('div');
        ghost.style.cssText = 'position:absolute;background:rgba(250,204,21,.3);border:1px dashed #d97706;pointer-events:none;z-index:40';
        wrapEl.appendChild(ghost);
      }
      const x0 = Math.min(startX, cx), y0 = Math.min(startY, cy);
      ghost.style.left = `${x0 * 100}%`; ghost.style.top = `${y0 * 100}%`;
      ghost.style.width = `${Math.abs(cx - startX) * 100}%`; ghost.style.height = `${Math.abs(cy - startY) * 100}%`;
    }
    function up(ev: PointerEvent) {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      ghost?.remove();
      const cx = (ev.clientX - rect.left) / rect.width;
      const cy = (ev.clientY - rect.top) / rect.height;
      if (annTool === 'PIN') {
        createAnnotation([startX, startY, 0.02, 0.02], 'PIN');
      } else {
        const x0 = Math.min(startX, cx), y0 = Math.min(startY, cy);
        const w = Math.abs(cx - startX), h = Math.abs(cy - startY);
        if (w > 0.01 && h > 0.005) createAnnotation([x0, y0, w, h], annTool);
      }
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // جست‌وجوی درون‌مدرک — نتیجه با شماره صفحه و مختصات
  async function runSearch(q?: string) {
    const qq = (q ?? query).trim();
    if (qq.length < 2) return;
    setSearching(true);
    try {
      const r = await api<{ matches: Array<{ page: number; snippet: string; rects: Array<[number, number, number, number]>; source: string }>; total: number; notes: string[] }>(
        `/api/documents/${doc.documentId}/content-search?q=${encodeURIComponent(qq)}&fileId=${file.id}`,
      );
      setResults(r.matches);
      setActiveResult(r.matches.length > 0 ? 0 : -1);
      if (r.matches.length > 0) {
        setPage(r.matches[0].page);
      } else {
        toast({ title: 'یافت نشد', description: r.notes?.[0] || 'در متن صفحات این فایل تطبیقی پیدا نشد.' });
      }
    } catch (e) {
      toast({ title: 'جست‌وجو', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  }

  function gotoResult(i: number) {
    if (i < 0 || i >= results.length) return;
    setActiveResult(i);
    setPage(results[i].page);
    for (const r of results[i].rects.slice(0, 4)) flashRect(r);
  }

  const pageExtractions = extractions.filter((x) => x.page === page && x.bbox);
  const pageAnnotations = annotations.filter((a) => a.page === page);

  return (
    <div className="flex flex-col h-full min-h-0 gap-2" data-testid="pdf-viewer">
      {/* نوار وضعیت همیشه قابل مشاهده — الزام سند [۵۳] */}
      <div className="flex items-center justify-between gap-2 flex-wrap rounded-lg border bg-muted/40 px-3 py-1.5 text-xs" data-testid="viewer-statusbar">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="code-ltr font-bold text-sm">{doc.docNumber}</span>
          <RevBadge code={doc.revisionCode} status={doc.revisionStatus} valid={doc.isValidRevision} />
          {!doc.isValidRevision && <Badge variant="outline" className="text-amber-800 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-200">این فایل لزوماً نسخه معتبر نیست</Badge>}
          <ConfBadge conf={doc.confidentiality} />
          {doc.isSample && <Badge variant="outline">نمونه</Badge>}
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <span>شیت {toFa(page)} از {toFa(pageCount)}</span>
          <span>تاریخ مدرک: {fmtJalali(doc.docDate)}</span>
        </div>
      </div>

      {/* نوار ابزار */}
      <div className="flex items-center gap-1.5 flex-wrap rounded-lg border px-2 py-1.5">
        <Button variant="ghost" size="icon" onClick={() => { setPage((p) => Math.max(1, p - 1)); }} disabled={page <= 1} aria-label="صفحه قبل"><ChevronRight className="h-4 w-4" /></Button>
        <Input
          className="w-14 h-8 text-center" dir="ltr" value={page}
          onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= 1 && v <= (pageCount || 9999)) setPage(v); }}
          aria-label="شماره صفحه"
        />
        <span className="text-xs text-muted-foreground">/ {toFa(pageCount)}</span>
        <Button variant="ghost" size="icon" onClick={() => { setPage((p) => Math.min(pageCount, p + 1)); }} disabled={page >= pageCount} aria-label="صفحه بعد"><ChevronLeft className="h-4 w-4" /></Button>

        <div className="w-px h-6 bg-border mx-1" />
        <Button variant="ghost" size="icon" onClick={() => { setFit('free'); setScale((s) => Math.max(0.4, s - 0.25)); }} aria-label="کوچک‌نمایی"><ZoomOut className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => { setFit('free'); setScale((s) => Math.min(6, s + 0.25)); }} aria-label="بزرگ‌نمایی"><ZoomIn className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" className={fit === 'width' ? 'bg-accent' : ''} onClick={() => setFit('width')}>Fit عرض</Button>
        <Button variant="ghost" size="sm" className={fit === 'page' ? 'bg-accent' : ''} onClick={() => setFit('page')} aria-label="Fit to page"><Maximize2 className="h-3.5 w-3.5" /> Fit صفحه</Button>
        <Button variant="ghost" size="icon" onClick={() => setRotation((r) => (r + 90) % 360)} aria-label="چرخش"><RotateCw className="h-4 w-4" /></Button>

        <div className="w-px h-6 bg-border mx-1" />
        {pageCount > 0 && (
          <Select value={String(page)} onValueChange={(v) => setPage(parseInt(v, 10))}>
            <SelectTrigger className="w-36 h-8 text-xs" aria-label="انتخاب شیت"><SelectValue placeholder="انتخاب شیت" /></SelectTrigger>
            <SelectContent className="max-h-64">
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>شیت {toFa(n)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="w-px h-6 bg-border mx-1" />
        <Button variant={searchOpen ? 'secondary' : 'ghost'} size="sm" onClick={() => setSearchOpen((o) => !o)}><Search className="h-4 w-4" /> جست‌وجو در مدرک</Button>
        <Button variant="ghost" size="sm" onClick={() => setShowTextLayer((v) => !v)} aria-label="لایه متن">
          {showTextLayer ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} متن
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowExtractions((v) => !v)}><Eye className="h-4 w-4" /> استخراج‌ها</Button>

        <div className="w-px h-6 bg-border mx-1" />
        <Button variant={annTool === 'PIN' ? 'secondary' : 'ghost'} size="sm" onClick={() => setAnnTool(annTool === 'PIN' ? 'none' : 'PIN')} aria-label="پین"><MapPin className="h-4 w-4" /></Button>
        <Button variant={annTool === 'NOTE' ? 'secondary' : 'ghost'} size="sm" onClick={() => setAnnTool(annTool === 'NOTE' ? 'none' : 'NOTE')} aria-label="یادداشت"><StickyNote className="h-4 w-4" /></Button>
        <Button variant={annTool === 'HIGHLIGHT' ? 'secondary' : 'ghost'} size="sm" onClick={() => setAnnTool(annTool === 'HIGHLIGHT' ? 'none' : 'HIGHLIGHT')} aria-label="هایلایت"><Highlighter className="h-4 w-4" /></Button>
        {annTool !== 'none' && <span className="text-xs text-amber-700 dark:text-amber-400">ابزار فعال — روی صفحه کلیک/درگ کنید</span>}

        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => {
          const url = `${window.location.origin}/?view=document&doc=${doc.documentId}&page=${page}`;
          navigator.clipboard?.writeText(url).then(() => toast({ title: 'لینک صفحه کپی شد', description: `صفحه ${toFa(page)} — این لینک همان صفحه و محدوده را باز می‌کند.` }));
        }} aria-label="کپی لینک صفحه"><Link2 className="h-4 w-4" /> لینک صفحه</Button>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="بستن"><X className="h-4 w-4" /></Button>
      </div>

      {/* جست‌وجوی درون‌مدرک */}
      {searchOpen && (
        <div className="flex items-center gap-2 rounded-lg border px-2 py-1.5 flex-wrap">
          <Input
            className="h-8 flex-1 min-w-48" placeholder="جست‌وجو در متن صفحات (لایهٔ متن یا OCR)…" value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
            autoFocus
          />
          <Button size="sm" onClick={() => runSearch()} disabled={searching}>{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} جست‌وجو</Button>
          {results.length > 0 && (
            <>
              <Badge variant="outline">{toFa(results.length)} نتیجه در {toFa(new Set(results.map((r) => r.page)).size)} صفحه · منبع: {results[0].source === 'OCR' ? 'OCR' : 'لایهٔ متن'}</Badge>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" onClick={() => gotoResult((activeResult - 1 + results.length) % results.length)}>قبلی</Button>
                <Button size="sm" variant="outline" onClick={() => gotoResult((activeResult + 1) % results.length)}>بعدی</Button>
              </div>
            </>
          )}
          {results.length > 0 && (
            <div className="w-full max-h-24 overflow-auto space-y-1 mt-1">
              {results.map((r, i) => (
                <button key={i} onClick={() => gotoResult(i)} className={`block w-full text-right text-xs rounded px-2 py-1.5 hover:bg-accent ${i === activeResult ? 'bg-accent' : ''}`}>
                  <span className="code-ltr font-medium">ص {toFa(r.page)}</span> — {r.snippet.slice(0, 110)}…
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* بوم نمایش */}
      <div ref={containerRef} className="flex-1 min-h-0 rounded-lg border bg-slate-100 dark:bg-slate-900 overflow-auto relative" style={{ direction: 'ltr' }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground bg-background/70 z-50">
            <Loader2 className="h-5 w-5 animate-spin" /> در حال بارگذاری فایل…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm z-50">
            <p className="text-red-700 dark:text-red-300">{error}</p>
            <Button size="sm" variant="outline" onClick={loadPdf}>تلاش مجدد (توکن تازه)</Button>
          </div>
        )}
        {/* واترمارک پویا با هویت کاربر و زمان — الزام سند [۵۷] */}
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden select-none" aria-hidden>
          {Array.from({ length: 24 }, (_, i) => (
            <span
              key={i}
              className="absolute text-[11px] text-foreground/[0.07] whitespace-nowrap font-medium"
              style={{ left: `${(i % 4) * 25 + 4}%`, top: `${Math.floor(i / 4) * 17 + 6}%`, transform: 'rotate(-24deg)' }}
            >
              {me?.fullName || 'کاربر'} · {fmtJalali(new Date().toISOString(), true)} · محرمانگی: {doc.confidentiality}
            </span>
          ))}
        </div>
        <div className="min-h-full w-max mx-auto p-4">
          <div ref={canvasWrapRef} className="relative shadow-lg" onPointerDown={onCanvasPointerDown} style={{ cursor: annTool === 'none' ? 'default' : 'crosshair' }}>
            <canvas ref={canvasRef} className="block" />
            <div ref={textLayerRef} className={`pdfTextLayer ${showTextLayer ? '' : 'hidden'}`} />
            {/* کادرهای استخراج شناسنامه — با اطمینان و منبع */}
            {showExtractions && pageExtractions.map((x) => x.bbox && (
              <div
                key={x.id}
                title={`${FIELD_LABELS[x.field] || x.field}: ${x.valueRaw} (اطمینان ${Math.round(x.confidence * 100)}٪ · ${x.source === 'OCR' ? 'OCR' : 'لایهٔ متن'}${x.isSuggestion ? ' · پیشنهاد' : ''})`}
                className="absolute border-2 border-teal-600/60 bg-teal-500/10 hover:bg-teal-500/25 cursor-help rounded-[2px] z-10"
                style={{ left: `${x.bbox[0] * 100}%`, top: `${x.bbox[1] * 100}%`, width: `${x.bbox[2] * 100}%`, height: `${x.bbox[3] * 100}%` }}
              />
            ))}
            {/* حاشیه‌نویسی‌ها */}
            {pageAnnotations.map((a) => a.rect && (
              a.type === 'HIGHLIGHT' ? (
                <div key={a.id} title={`${a.author}: ${a.text || 'هایلایت'}`} className="absolute cursor-help z-10 rounded-[2px]" style={{ left: `${a.rect[0] * 100}%`, top: `${a.rect[1] * 100}%`, width: `${a.rect[2] * 100}%`, height: `${a.rect[3] * 100}%`, background: a.color + '55', border: `1px solid ${a.color}` }} />
              ) : (
                <div key={a.id} title={`${a.author}: ${a.text || a.type}`} className="absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-help" style={{ left: `${a.rect[0] * 100}%`, top: `${a.rect[1] * 100}%` }}>
                  <span className="block w-5 h-5 rounded-full border-2 border-white shadow" style={{ background: a.color }} />
                </div>
              )
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function toFa(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);
}
