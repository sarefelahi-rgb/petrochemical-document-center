'use client';
// دستیار اسناد — رابط گفت‌وگویی به سبک چت‌جی‌پی‌تی
// ساختار: ساید‌بار سوابق (فهرست گفت‌وگوهای ذخیره‌شده در پایگاه داده) + ناحیه چت با ارجاع‌های کلیک‌پذیر
// هیچ پاسخ ساختگی تولید نمی‌شود؛ نبود شاهد صادقانه اعلام می‌شود.
import { useCallback, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  SendHorizonal, MessageSquarePlus, MoreVertical, Pencil, Trash2, Search,
  Bot, PanelRightClose, PanelRightOpen, FileText, X, Sparkles, Globe, ScanText, Lock, Paperclip, FileUp,
  ThumbsUp, ThumbsDown, BrainCircuit,
} from 'lucide-react';
import { api, fmtJalali } from './api';
import { toPersianDigits } from '@/lib/normalize';

interface Citation {
  documentId: string; docNumber: string; title: string; project: string;
  revision: string | null; revStatus: string | null; page?: number | null; snippet?: string | null;
  source?: 'internal' | 'web' | 'vision'; url?: string;
}
interface Turn { role: 'USER' | 'ASSISTANT'; content: string; citations?: Citation[]; mode?: string; fileChip?: { name: string; meta: string }; id?: string; learned?: boolean }
interface ConvItem { id: string; title: string; createdAt: string; messageCount: number }

const EXAMPLES = [
  'آخرین ایزومتریک معتبر خط 6-P-1183-B2A را پیدا کن',
  'مدارک ساخت و بازرسی EA-308B را جمع کن',
  'کادر عنوان P&ID واحد ۱۱۰ چه اطلاعات دارد؟',
  'درباره متریال خط 4-C-101-A1A چه چیزی در اسناد هست؟',
];

export function AssistantView({ go, initialDocId }: { go: (view: string, param?: string) => void; initialDocId?: string }) {
  const [convs, setConvs] = useState<ConvItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // محدودهٔ سند: پرسش از دستیار محدود به کل اطلاعات یک سند (از «پرسش از دستیار دربارهٔ این سند»)
  const [docScope, setDocScope] = useState<{ id: string; docNumber: string; title: string } | null>(null);
  const [allowWeb, setAllowWeb] = useState(false); // جست‌وجوی وب اختیاری — فقط متن پرسش ارسال می‌شود
  const [visionPage, setVisionPage] = useState(''); // خواندن تصویری صفحه (فقط در محدودهٔ سند)
  // فایل بارگذاری‌شده در گفت‌وگو — دستیار متن استخراج‌شدهٔ آن را به‌عنوان شاهد می‌خواند
  const [attachedFile, setAttachedFile] = useState<{ id: string; name: string; meta: string } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  // یادگیرنده: وضعیت بازخورد هر پیام + دیالوگ تصحیح برای 👎 + پیام نتیجهٔ یادگیری
  const [fbState, setFbState] = useState<Record<number, 'UP' | 'DOWN'>>({});
  const [downFor, setDownFor] = useState<number | null>(null);
  const [downComment, setDownComment] = useState('');
  const [downExpected, setDownExpected] = useState('');
  const [notice, setNotice] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!initialDocId) { setDocScope(null); return; }
    api<{ id: string; docNumber: string; docNumberRaw: string; title: string }>(`/api/documents/${initialDocId}`)
      .then((d) => setDocScope({ id: d.id, docNumber: d.docNumberRaw || d.docNumber, title: d.title }))
      .catch(() => setDocScope(null));
  }, [initialDocId]);

  const loadConvs = useCallback(async (sq = '') => {
    try {
      const r = await api<{ conversations: ConvItem[] }>(`/api/conversations${sq ? `?q=${encodeURIComponent(sq)}` : ''}`);
      setConvs(r.conversations);
    } catch { /* خطای بی‌صدا برای ساید‌بار — چت اصلی مستقل کار می‌کند */ }
  }, []);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, busy]);

  function autoGrow() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }

  async function openConv(id: string) {
    setSidebarOpen(false);
    if (busy || id === activeId) return;
    setError('');
    try {
      const r = await api<{ conversation: { id: string; title: string }; messages: Array<{ id: string; role: string; content: string; citations: Citation[] }> }>(`/api/conversations/${id}`);
      setActiveId(r.conversation.id);
      setTurns(r.messages.map((m) => ({ role: m.role as 'USER' | 'ASSISTANT', content: m.content, citations: m.citations, id: m.id })));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function newChat() {
    if (busy) return;
    setActiveId(null); setTurns([]); setError(''); setSidebarOpen(false);
    setDocScope(null); setVisionPage(''); setAttachedFile(null);
    setQ(''); if (taRef.current) taRef.current.style.height = 'auto';
  }

  // بارگذاری فایل در دستیار: استخراج اطلاعات + خلاصهٔ مدل + ثبت شاهد برای پرسش‌های بعدی
  async function uploadFile(f: File) {
    if (busy || uploadingFile) return;
    setUploadingFile(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', f);
      if (activeId) fd.append('conversationId', activeId);
      const r = await api<{
        conversationId: string; assistantFileId: string; answer: string; citations: Citation[];
        extraction: { fileName: string; label: string; size: number; source: string | null; pageCount: number | null; textChars: number; note: string | null; ok: boolean };
      }>('/api/assistant/upload', { method: 'POST', body: fd });
      setActiveId(r.conversationId);
      setAttachedFile({
        id: r.assistantFileId,
        name: r.extraction.fileName,
        meta: `${r.extraction.label}${r.extraction.source ? ` · ${r.extraction.source === 'OCR' ? 'OCR' : r.extraction.source === 'TEXT_LAYER' ? 'لایهٔ متنی' : r.extraction.source === 'OFFICE' ? 'آفیس' : 'متن'}` : ''}${r.extraction.pageCount ? ` · ${r.extraction.pageCount} صفحه` : ''} · ${r.extraction.textChars.toLocaleString('fa-IR')} نویسه`,
      });
      setTurns((prev) => [
        ...prev,
        { role: 'USER', content: `بارگذاری فایل «${r.extraction.fileName}» — اطلاعات آن را استخراج کن.`, fileChip: { name: r.extraction.fileName, meta: r.extraction.label } },
        { role: 'ASSISTANT', content: r.answer, citations: r.citations },
      ]);
      loadConvs(search);
    } catch (e) {
      setError((e as Error).message);
    } finally { setUploadingFile(false); }
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setTurns((prev) => [...prev, { role: 'USER', content: text }]);
    setQ(''); setBusy(true); setError('');
    if (taRef.current) taRef.current.style.height = 'auto';
    try {
      const r = await api<{ answer: string; citations: Citation[]; conversationId: string | null; mode: string; messageId?: string; learned?: boolean }>('/api/assistant', {
        method: 'POST', json: {
          question: text, conversationId: activeId,
          docId: docScope?.id || undefined,
          assistantFileId: attachedFile?.id || undefined,
          web: allowWeb,
          visionPage: docScope && visionPage ? parseInt(visionPage, 10) || undefined : undefined,
        },
      });
      setTurns((prev) => [...prev, { role: 'ASSISTANT', content: r.answer, citations: r.citations, mode: r.mode, id: r.messageId, learned: r.learned }]);
      if (r.learned) setNotice('این پاسخ با حافظهٔ یادگیرندهٔ سامانه (تجربهٔ بازخوردهای قبلی) تقویت شد.');
      if (r.conversationId) {
        setActiveId(r.conversationId);
        loadConvs(search);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  async function doRename() {
    if (!renameId || !renameTitle.trim()) return;
    try {
      await api(`/api/conversations/${renameId}`, { method: 'PATCH', json: { title: renameTitle } });
      setRenameId(null); loadConvs(search);
    } catch (e) { setError((e as Error).message); }
  }

  async function doDelete() {
    if (!deleteId) return;
    try {
      await api(`/api/conversations/${deleteId}`, { method: 'DELETE' });
      if (deleteId === activeId) { setActiveId(null); setTurns([]); }
      setDeleteId(null); loadConvs(search);
    } catch (e) { setError((e as Error).message); }
  }

  // ---------- یادگیرنده: ثبت بازخورد 👍/👎 — دستیار از آن می‌آموزد ----------
  function flashNotice(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice((cur) => (cur === msg ? '' : cur)), 6000);
  }

  async function sendFeedback(idx: number, rating: 'UP' | 'DOWN', extra?: { comment?: string; expectedAnswer?: string }) {
    const t = turns[idx];
    if (!t?.id) return;
    try {
      const r = await api<{ learned: boolean; message: string }>('/api/assistant/feedback', {
        method: 'POST',
        json: { messageId: t.id, rating, comment: extra?.comment || undefined, expectedAnswer: extra?.expectedAnswer || undefined },
      });
      setFbState((prev) => ({ ...prev, [idx]: rating }));
      setDownFor(null); setDownComment(''); setDownExpected('');
      flashNotice(r.message);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submitDown() {
    if (downFor == null) return;
    await sendFeedback(downFor, 'DOWN', { comment: downComment, expectedAnswer: downExpected });
  }

  // ---------- رندر Markdown پاسخ دستیار (سبک چت‌جی‌پی‌تی) ----------
  // dir=auto روی هر بلاک: پاراگراف فارسی راست‌چین، پاراگراف انگلیسی چپ‌چین
  const mdComponents = {
    p: (props: React.HTMLAttributes<HTMLParagraphElement>) => <p dir="auto" className="mb-2 last:mb-0 text-start" {...props} />,
    strong: (props: React.HTMLAttributes<HTMLElement>) => <strong className="font-bold" {...props} />,
    em: (props: React.HTMLAttributes<HTMLElement>) => <em className="italic" {...props} />,
    ul: (props: React.HTMLAttributes<HTMLUListElement>) => <ul className="list-disc pr-5 mb-2 space-y-1" {...props} />,
    ol: (props: React.HTMLAttributes<HTMLOListElement>) => <ol className="list-decimal pr-5 mb-2 space-y-1" {...props} />,
    li: (props: React.HTMLAttributes<HTMLLIElement>) => <li dir="auto" className="leading-6 text-start" {...props} />,
    h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h3 dir="auto" className="font-bold text-base mb-1 text-start" {...props} />,
    h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h3 dir="auto" className="font-bold text-base mb-1 text-start" {...props} />,
    h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h3 dir="auto" className="font-bold mb-1 text-start" {...props} />,
    code: (props: React.HTMLAttributes<HTMLElement>) => <code className="code-ltr rounded bg-muted px-1 py-0.5 text-xs" {...props} />,
    blockquote: (props: React.HTMLAttributes<HTMLElement>) => <blockquote dir="auto" className="border-r-2 border-teal-700/50 pr-3 text-muted-foreground mb-2 text-start" {...props} />,
  };

  const activeTitle = convs.find((c) => c.id === activeId)?.title || (activeId ? 'گفت‌وگو' : 'گفت‌وگوی جدید');

  // ---------- ساید‌بار سوابق ----------
  const sidebar = (
    <div className="flex flex-col h-full w-72" data-testid="assistant-sidebar">
      <div className="p-3 space-y-2">
        <Button onClick={newChat} className="w-full justify-start gap-2" aria-label="گفت‌وگوی جدید">
          <MessageSquarePlus className="h-4 w-4" /> گفت‌وگوی جدید
        </Button>
        <div className="relative">
          <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="جست‌وجو در سوابق…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); loadConvs(e.target.value); }}
            className="pr-8 h-9 text-sm"
            aria-label="جست‌وجو در سوابق گفت‌وگو"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll px-2 pb-3 space-y-0.5" role="list" aria-label="سوابق گفت‌وگو">
        {convs.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6 px-3 leading-5">
            هنوز گفت‌وگویی ذخیره نشده است. اولین پرسش را بپرسید.
          </p>
        )}
        {convs.map((c) => (
          <div
            key={c.id}
            role="listitem"
            className={`group relative rounded-xl text-sm transition-all ${c.id === activeId ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25' : 'hover:bg-accent/80'}`}
          >
            <button onClick={() => openConv(c.id)} className="block w-full text-right px-3 py-2.5" title={c.title}>
              <span dir="auto" className="block truncate font-medium leading-5 text-start">{c.title}</span>
              <span className={`block text-[11px] mt-0.5 ${c.id === activeId ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                {fmtJalali(c.createdAt)} · {toPersianDigits(String(c.messageCount))} پیام
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`absolute left-1.5 top-2 p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 ${c.id === activeId ? 'text-primary-foreground' : 'text-muted-foreground'}`}
                  aria-label={`گزینه‌های ${c.title}`}
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => { setRenameId(c.id); setRenameTitle(c.title); }}>
                  <Pencil className="h-3.5 w-3.5 ml-2" /> تغییر نام
                </DropdownMenuItem>
                <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setDeleteId(c.id)}>
                  <Trash2 className="h-3.5 w-3.5 ml-2" /> حذف گفت‌وگو
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
      <p className="border-t border-border/60 p-3 text-[11px] leading-4 text-muted-foreground">
        گفت‌وگوها فقط برای کاربر شما ذخیره می‌شوند و مجوز اسناد در هر پاسخ رعایت می‌گردد.
      </p>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-11.5rem)] min-h-[28rem] -my-2" data-testid="assistant-view">
      {/* ساید‌بار — دسکتاپ */}
      <aside className="hidden md:block shrink-0 rounded-2xl glass glass-sheen overflow-hidden">{sidebar}</aside>

      {/* ساید‌بار — موبایل (روی‌هم) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-label="سوابق گفت‌وگو">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="absolute right-0 top-0 h-full">{sidebar}</div>
        </div>
      )}

      {/* ناحیه چت */}
      <section className="flex-1 min-w-0 flex flex-col md:pr-4" aria-label="ناحیه چت با دستیار">
        {/* سربرگ چت */}
        <div className="flex items-center gap-2 pb-3">
          <Button variant="outline" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="نمایش سوابق">
            <PanelRightOpen className="h-4 w-4" />
          </Button>
          {activeId && (
            <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={newChat} aria-label="بستن گفت‌وگوی فعلی">
              <PanelRightClose className="h-4 w-4" />
            </Button>
          )}
          <h1 dir="auto" className="text-sm font-semibold truncate">{activeTitle}</h1>
          {docScope && (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-700/10 text-teal-800 dark:text-teal-200 px-2.5 py-1 text-[11px] max-w-[260px]" title={`محدوده: ${docScope.title}`}>
              <Lock className="h-3 w-3 shrink-0" />
              <span className="code-ltr font-semibold truncate">{docScope.docNumber}</span>
              <button onClick={() => { setDocScope(null); setVisionPage(''); }} aria-label="برداشتن محدودهٔ سند"><X className="h-3 w-3" /></button>
            </span>
          )}
          <span className="mr-auto text-[11px] text-muted-foreground flex items-center gap-1">
            <Bot className="h-3.5 w-3.5" /> پاسخ فقط بر شواهد اسناد مجاز شما
          </span>
        </div>

        {/* پیام‌ها */}
        <div className="flex-1 overflow-y-auto overscroll-contain thin-scroll rounded-2xl glass glass-sheen px-3 sm:px-6 py-5 space-y-5" data-testid="assistant-messages">
          {turns.length === 0 && !busy && (
            <div className="max-w-xl mx-auto text-center space-y-4 pt-8">
              <div className="mx-auto w-12 h-12 rounded-full bg-teal-700/10 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-teal-700" />
              </div>
              <h2 className="text-lg font-bold">با اسناد مهندسی گفت‌وگو کنید</h2>
              <p className="text-sm text-muted-foreground leading-6">
                شماره سند، شماره خط، Tag تجهیز یا موضوع را بپرسید. دستیار شناسنامه، متن صفحات (OCR و لایهٔ متنی)،
                استخراج‌ها، MTO و گردش تأیید اسنادِ مجاز شما را می‌خواند؛ تحلیل می‌کند، اطلاعات استخراج می‌کند
                و هر ادعا به منبع ارجاع می‌دهد.
              </p>
              <div className="space-y-2 pt-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => ask(ex)}
                    className="block w-full text-right rounded-xl glass px-4 py-3 text-sm hover:border-primary/40 hover:shadow-md transition-all"
                  >
                    <span className="text-primary ml-1.5">«</span>{ex}<span className="text-primary mr-1.5">»</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) =>
            t.role === 'USER' ? (
              <div key={i} className="flex justify-start" data-testid="msg-user">
                <div className="bubble-user rounded-2xl rounded-tr-md px-4 py-3 max-w-[85%] text-sm leading-6 whitespace-pre-wrap" dir="auto" data-bidi="auto">
                  {t.fileChip && (
                    <span className="flex items-center gap-2 rounded-lg bg-white/15 px-2.5 py-1.5 mb-2 max-w-xs" dir="ltr">
                      <FileUp className="h-4 w-4 shrink-0" />
                      <span className="truncate text-xs font-medium" title={t.fileChip.name}>{t.fileChip.name}</span>
                      <span className="shrink-0 rounded bg-white/20 px-1.5 py-0.5 text-[10px]">{t.fileChip.meta}</span>
                    </span>
                  )}
                  {t.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex gap-2.5 max-w-full" data-testid="msg-assistant">
                <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mt-0.5">
                  <Bot className="h-[18px] w-[18px] text-primary" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="rounded-2xl rounded-tl-md glass glass-sheen px-4 py-3 text-sm leading-7 md-bidi" data-testid="assistant-content">
                    <Markdown components={mdComponents}>{t.content}</Markdown>
                  </div>
                  {/* نوار بازخورد — دستیار از شما یاد می‌گیرد */}
                  <div className="flex items-center gap-1 pr-1" data-testid="assistant-feedback">
                    <button
                      onClick={() => sendFeedback(i, 'UP')}
                      disabled={!t.id || fbState[i] === 'UP'}
                      className={`p-1.5 rounded-lg transition-all hover:bg-accent ${fbState[i] === 'UP' ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                      title="پاسخ خوب بود — دستیار این پاسخ را یاد می‌گیرد"
                      aria-label="بازخورد مثبت"
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { setDownFor(i); setDownComment(''); setDownExpected(''); }}
                      disabled={!t.id || fbState[i] === 'DOWN'}
                      className={`p-1.5 rounded-lg transition-all hover:bg-accent ${fbState[i] === 'DOWN' ? 'text-red-600 bg-red-500/10' : 'text-muted-foreground'}`}
                      title="پاسخ دقیق نبود — پاسخ درست را به دستیار بیاموزید"
                      aria-label="بازخورد منفی"
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </button>
                    {t.learned && (
                      <span className="chip ml-1" title="این پاسخ با دانش آموخته‌شده از بازخوردهای کاربران تقویت شده است">
                        <BrainCircuit className="h-3 w-3 text-primary" /> تقویت‌شده با حافظهٔ یادگیرنده
                      </span>
                    )}
                  </div>
                  {t.citations && t.citations.length > 0 && (
                    <div className="space-y-1.5" data-testid="assistant-citations">
                      <p className="text-xs font-medium text-muted-foreground">منابع ({toPersianDigits(String(t.citations.length))}):</p>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {t.citations.map((c, ci) =>
                          c.source === 'web' ? (
                            <a
                              key={`w:${ci}`}
                              href={c.url || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-right rounded-lg border border-sky-300/60 bg-sky-50/60 dark:bg-sky-900/20 px-3 py-2 hover:bg-accent transition-colors"
                            >
                              <span className="flex items-center gap-1.5 text-xs">
                                <Globe className="h-3 w-3 shrink-0 text-sky-700" />
                                <span dir="auto" className="font-semibold truncate text-start">{c.title}</span>
                                <span className="shrink-0 rounded bg-sky-700/10 text-sky-700 px-1.5 py-0.5 text-[10px]">وب</span>
                              </span>
                              {c.snippet && <span dir="auto" className="block text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-4 text-start">{c.snippet}</span>}
                              <span className="block text-[10px] text-sky-700 mt-1 truncate" dir="ltr">{c.url}</span>
                            </a>
                          ) : (
                            <button
                              key={`${c.documentId}:${ci}`}
                              onClick={() => go('document', c.documentId)}
                              className="text-right rounded-lg border bg-background px-3 py-2 hover:bg-accent hover:border-teal-700/40 transition-colors"
                            >
                              <span className="flex items-center gap-1.5 text-xs">
                                <FileText className="h-3 w-3 shrink-0 text-teal-700" />
                                <span className="code-ltr font-semibold truncate">{c.docNumber}</span>
                                {c.source === 'vision' && <span className="shrink-0 rounded bg-violet-700/10 text-violet-700 px-1.5 py-0.5 text-[10px]">خوانش تصویری</span>}
                                {c.page != null && (
                                  <span className="shrink-0 rounded bg-teal-700/10 text-teal-700 px-1.5 py-0.5 text-[10px] font-medium">
                                    صفحهٔ {toPersianDigits(String(c.page))}
                                  </span>
                                )}
                              </span>
                              <span dir="auto" className="block text-[11px] text-muted-foreground mt-1 truncate text-start">{c.title}</span>
                              {c.snippet && <span dir="auto" className="block text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-2 leading-4 text-start">{c.snippet}</span>}
                              <span className="block text-[11px] text-muted-foreground mt-1">
                                پروژه <span className="code-ltr">{c.project || '—'}</span> · Rev <span className="code-ltr">{c.revision || '—'}</span>
                              </span>
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {busy && (
            <div className="flex gap-2.5" data-testid="assistant-typing">
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Bot className="h-[18px] w-[18px] text-primary" />
              </div>
              <div className="rounded-2xl rounded-tl-md glass glass-sheen px-4 py-3">
                <span className="inline-flex gap-1 items-center" aria-label="در حال پردازش">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="text-xs text-muted-foreground mr-2">در حال جست‌وجوی اسناد مجاز و تولید پاسخ مستند…</span>
                </span>
              </div>
            </div>
          )}
          {uploadingFile && (
            <div className="flex gap-2.5" data-testid="assistant-uploading">
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Bot className="h-[18px] w-[18px] text-primary" />
              </div>
              <div className="rounded-2xl rounded-tl-md glass glass-sheen px-4 py-3">
                <span className="inline-flex gap-1 items-center" aria-label="در حال استخراج فایل">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="text-xs text-muted-foreground mr-2">در حال استخراج اطلاعات فایل (متن/OCR) و تحلیل آن…</span>
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* پیام نتیجهٔ یادگیری */}
        {notice && (
          <div className="mt-2 flex items-center gap-2 rounded-xl glass-strong glass-sheen px-3 py-2 text-sm text-foreground" data-testid="learning-notice" role="status">
            <BrainCircuit className="h-4 w-4 shrink-0 text-primary" />
            <span dir="auto" className="flex-1">{notice}</span>
            <button onClick={() => setNotice('')} aria-label="بستن پیام"><X className="h-4 w-4" /></button>
          </div>
        )}

        {error && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            <span dir="auto">{error}</span>
            <button onClick={() => setError('')} aria-label="بستن خطا"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* ورودی پیام */}
        <div className="pt-3">
          {/* ابزارهای پرسش: بارگذاری فایل + جست‌وجوی وب + خواندن تصویری صفحه */}
          <div className="flex items-center gap-3 flex-wrap pb-2 px-1 text-xs">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile || busy}
              className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 hover:bg-accent transition-colors disabled:opacity-50"
              title="بارگذاری فایل (PDF، تصویر، Word، Excel، متن) — دستیار اطلاعات آن را استخراج و تحلیل می‌کند"
              aria-label="بارگذاری فایل در گفت‌وگو"
            >
              <Paperclip className="h-3.5 w-3.5 text-teal-700" /> بارگذاری فایل
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.docx,.xlsx,.csv,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f);
                e.target.value = '';
              }}
            />
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none" title="فقط متن پرسش شما به موتور جست‌وجو ارسال می‌شود؛ محتوای اسناد هرگز بیرون نمی‌رود">
              <input type="checkbox" checked={allowWeb} onChange={(e) => setAllowWeb(e.target.checked)} className="accent-teal-700" />
              <Globe className="h-3.5 w-3.5 text-sky-700" /> جست‌وجوی وب (اختیاری)
            </label>
            {docScope && (
              <label className="inline-flex items-center gap-1.5" title="مدل بینایی تصویر صفحه را می‌خواند — مکمل OCR برای دقت بالاتر">
                <ScanText className="h-3.5 w-3.5 text-violet-700" />
                خواندن تصویری صفحهٔ:
                <Input
                  type="number" min={1} className="h-7 w-20 text-xs"
                  value={visionPage}
                  onChange={(e) => setVisionPage(e.target.value)}
                  placeholder="مثلاً ۱"
                  aria-label="شماره صفحه برای خواندن تصویری"
                />
              </label>
            )}
          </div>
          {/* فایل پیوست گفت‌وگو */}
          {attachedFile && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 mb-2 max-w-md" data-testid="assistant-attached-file">
              <FileText className="h-4 w-4 shrink-0 text-teal-700" />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium" dir="ltr" title={attachedFile.name}>{attachedFile.name}</span>
                <span className="block text-[10px] text-muted-foreground" dir="ltr">{attachedFile.meta}</span>
              </div>
              <button onClick={() => setAttachedFile(null)} aria-label="برداشتن فایل پیوست" className="p-1 rounded hover:bg-accent">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl glass-strong glass-sheen p-2 focus-within:border-primary/50 transition-colors">
            <textarea
              ref={taRef}
              value={q}
              rows={1}
              dir="auto"
              onChange={(e) => { setQ(e.target.value); autoGrow(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(q); }
              }}
              placeholder="پرسش خود را بنویسید… (Enter ارسال · Shift+Enter خط جدید)"
              aria-label="متن پرسش"
              className="flex-1 resize-none bg-transparent text-sm leading-6 outline-none max-h-40 px-2 py-1.5"
            />
            <Button onClick={() => ask(q)} disabled={busy || !q.trim()} size="icon" className="rounded-xl shrink-0" aria-label="ارسال پرسش">
              <SendHorizonal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* دیالوگ تغییر نام */}
      <Dialog open={!!renameId} onOpenChange={(o) => !o && setRenameId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>تغییر نام گفت‌وگو</DialogTitle></DialogHeader>
          <Input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} aria-label="عنوان جدید" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameId(null)}>انصراف</Button>
            <Button onClick={doRename} disabled={!renameTitle.trim()}>ذخیره</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ بازخورد منفی — تصحیح کاربر = بهترین منبع یادگیری */}
      <Dialog open={downFor != null} onOpenChange={(o) => { if (!o) setDownFor(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-primary" /> آموزش دستیار</DialogTitle>
            <DialogDescription>
              پاسخ دقیق نبود. اگر پاسخ درست را بنویسید، دستیار آن را یاد می‌گیرد و از این پس پاسخ‌های مشابه را اصلاح می‌کند. (هر دو کادر اختیاری است)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>پاسخ درست چه بود؟</Label>
              <textarea
                dir="auto"
                rows={3}
                value={downExpected}
                onChange={(e) => setDownExpected(e.target.value)}
                className="w-full rounded-lg border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/50"
                placeholder="مثلاً: سایز خط ۶ اینچ است نه ۴ اینچ…"
                aria-label="پاسخ درست"
              />
            </div>
            <div className="space-y-1.5">
              <Label>توضیح (اختیاری)</Label>
              <Input value={downComment} onChange={(e) => setDownComment(e.target.value)} placeholder="چه چیزی اشتباه بود؟" aria-label="توضیح بازخورد" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDownFor(null)}>انصراف</Button>
            <Button onClick={submitDown} disabled={!downExpected.trim() && !downComment.trim()}>ثبت و یادگیری</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ حذف */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>حذف گفت‌وگو</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground leading-6">این گفت‌وگو و همهٔ پیام‌های آن برای همیشه حذف می‌شود. ادامه می‌دهید؟</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>انصراف</Button>
            <Button variant="destructive" onClick={doDelete}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
