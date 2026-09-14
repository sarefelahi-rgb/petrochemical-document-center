'use client';
// پوستهٔ برنامه — ناوبری اصلی + هدر + زمینه روشن/تیره + تغییر اجباری رمز اولین ورود
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Home, FolderOpen, Upload, Bot, ClipboardList, BarChart3, Settings, LogOut, Moon, Sun, KeyRound, ScanSearch, FolderSearch, FileStack, Inbox } from 'lucide-react';
import { api, ROLE_LABELS } from './api';
import { HomeView } from './home-view';
import { DocumentCenter } from './document-center';
import { DocumentDetail } from './document-detail';
import { UploadView } from './upload-view';
import { IntakeView } from './intake-view';
import { CartableView } from './cartable-view';
import { ReviewQueueView } from './review-queue-view';
import { ReportsView } from './reports-view';
import { AssistantView } from './assistant-view';
import { DossierView } from './dossier-view';
import { DocControlView } from './doc-control-view';
import { AdminView } from './admin-view';

export interface MeInfo {
  user: { username: string; fullName: string; role: string; clearance: string; mustChangePassword: boolean };
  orgName: string;
  projectCount: number;
}

const NAV = [
  { key: 'assistant', label: 'دستیار هوشمند', icon: Bot },
  { key: 'home', label: 'خانه', icon: Home },
  { key: 'documents', label: 'مرکز اسناد', icon: FolderOpen },
  { key: 'intake', label: 'پذیرش اسناد', icon: Inbox },
  { key: 'dossier', label: 'پروندهٔ تجهیز', icon: FolderSearch },
  { key: 'doc-control', label: 'کنترل مدارک', icon: FileStack },
  { key: 'cartable', label: 'کارتابل', icon: ClipboardList },
  { key: 'review-queue', label: 'صف بازبینی', icon: ScanSearch },
  { key: 'reports', label: 'گزارش‌ها', icon: BarChart3 },
];

export function AppShell({ me, onLogout, goHome }: { me: MeInfo; onLogout: () => void; goHome: () => void }) {
  const [view, setView] = useState('assistant'); // دستیار هوشمند — صفحهٔ اول سامانه
  const [param, setParam] = useState('');
  const [pageTarget, setPageTarget] = useState<{ page: number; rect?: [number, number, number, number] | null; query?: string | null } | null>(null);
  const [dark, setDark] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [pwOpen, setPwOpen] = useState(me.user.mustChangePassword);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwError, setPwError] = useState('');
  const [appName, setAppName] = useState('مرکز هوشمند اسناد مهندسی');

  useEffect(() => {
    const t = setTimeout(() => {
      const isDark = localStorage.getItem('edc_theme') === 'dark';
      setDark(isDark);
      document.documentElement.classList.toggle('dark', isDark);
    }, 0);
    api<{ settings: Record<string, string> }>('/api/admin/settings')
      .then((r) => { if (r.settings['app.name']) setAppName(r.settings['app.name']); })
      .catch(() => {});
    // لینک صفحه (مرحله B): ?view=document&doc=…&page=N&q=…
    const t2 = setTimeout(() => {
      const qs = new URLSearchParams(window.location.search);
      const viewParam = qs.get('view');
      const docParam = qs.get('doc');
      if (viewParam === 'document' && docParam) {
        setView('document');
        setParam(docParam);
        const page = parseInt(qs.get('page') || '1', 10) || 1;
        let rect: [number, number, number, number] | null = null;
        const rectRaw = qs.get('rect');
        if (rectRaw) { try { const a = JSON.parse(rectRaw); if (Array.isArray(a) && a.length === 4) rect = [Number(a[0]), Number(a[1]), Number(a[2]), Number(a[3])]; } catch { } }
        setPageTarget({ page, rect, query: qs.get('q') });
        window.history.replaceState({}, '', '/');
      }
    }, 0);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, []);

  const refreshFavorites = () => { /* نمایش ستاره از پاسخ فهرست به‌روزرسانی می‌شود */ };

  function go(v: string, p?: string) {
    setView(v); setParam(p || '');
    if (v !== 'document') setPageTarget(null);
    window.scrollTo({ top: 0 });
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('edc_theme', next ? 'dark' : 'light');
  }

  async function submitPassword() {
    setPwError('');
    if (newPw !== newPw2) { setPwError('تکرار رمز جدید یکسان نیست.'); return; }
    try {
      await api('/api/auth/change-password', { method: 'POST', json: { currentPassword: curPw, newPassword: newPw } });
      // نشست‌ها لغو شد؛ ورود مجدد لازم است
      onLogout();
    } catch (e) {
      setPwError((e as Error).message);
    }
  }

  const isAdmin = me.user.role === 'ADMIN';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* هدر */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => go('assistant')} className="flex items-center gap-2 min-w-0" title="صفحهٔ اول: دستیار هوشمند">
              <span className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center text-sm font-bold shrink-0">س</span>
              <span className="font-bold truncate">{appName}</span>
            </button>
            <span className="hidden md:inline text-xs text-muted-foreground truncate">— {me.orgName}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={dark ? 'زمینه روشن' : 'زمینه تیره'}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setPwOpen(true)} aria-label="تغییر رمز"><KeyRound className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={onLogout} aria-label="خروج"><LogOut className="h-4 w-4" /></Button>
            <div className="text-xs text-left hidden sm:block">
              <div className="font-medium leading-4">{me.user.fullName}</div>
              <div className="text-muted-foreground">{ROLE_LABELS[me.user.role] || me.user.role}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 flex flex-col md:flex-row gap-6">
        {/* ناوبری کناری */}
        <nav className="md:w-52 shrink-0 space-y-1" aria-label="منوی اصلی">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => go(n.key)}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${view === n.key || (n.key === 'documents' && view === 'document') ? 'bg-teal-700 text-white' : 'hover:bg-accent'}`}
              aria-current={view === n.key ? 'page' : undefined}
            >
              <n.icon className="h-4 w-4 shrink-0" /> {n.label}
            </button>
          ))}
          {isAdmin && (
            <button
              onClick={() => go('admin')}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${view === 'admin' ? 'bg-teal-700 text-white' : 'hover:bg-accent'}`}
            >
              <Settings className="h-4 w-4 shrink-0" /> مدیریت
            </button>
          )}
        </nav>

        {/* محتوا */}
        <main className="flex-1 min-w-0">
          {view === 'home' && <HomeView userName={me.user.fullName} go={go} />}
          {view === 'documents' && <DocumentCenter go={go} refreshFavorites={refreshFavorites} favoriteIds={favorites} />}
          {view === 'document' && <DocumentDetail docId={param} go={go} openPageTarget={pageTarget} />}
          {view === 'upload' && <UploadView go={go} />}
          {view === 'intake' && <IntakeView isAdmin={me.user.role === 'ADMIN'} />}
          {view === 'assistant' && <AssistantView go={go} initialDocId={param} />}
          {view === 'dossier' && <DossierView initialRef={param} go={go} />}
          {view === 'cartable' && <CartableView go={go} />}
          {view === 'review-queue' && <ReviewQueueView go={go} />}
          {view === 'reports' && <ReportsView />}
          {view === 'doc-control' && <DocControlView go={go} />}
          {view === 'admin' && isAdmin && <AdminView orgName={me.orgName} />}
          {view === 'admin' && !isAdmin && <p className="text-sm text-muted-foreground">دسترسی ندارید.</p>}
        </main>
      </div>

      <footer className="border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-3 text-xs text-muted-foreground flex flex-wrap justify-between gap-2">
          <span>{appName} — سامانهٔ مدیریت اسناد و نقشه‌های پتروشیمی</span>
          <span>دستیار هوشمند، MTO، گردش تأیید و کنترل مدارک فعال است — وضعیت کامل در «گزارش‌ها»</span>
        </div>
      </footer>

      {/* تغییر اجباری/اختیاری رمز */}
      <Dialog open={pwOpen} onOpenChange={(o) => { if (me.user.mustChangePassword) return; setPwOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{me.user.mustChangePassword ? 'تغییر اجباری رمز عبور' : 'تغییر رمز عبور'}</DialogTitle>
            <DialogDescription>
              {me.user.mustChangePassword
                ? 'برای ادامهٔ کار باید رمز خود را تغییر دهید. پس از تغییر، دوباره وارد می‌شوید.'
                : 'پس از تغییر، همهٔ نشست‌ها لغو و ورود مجدد لازم می‌شود.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>رمز فعلی</Label><Input type="password" dir="ltr" className="text-left" value={curPw} onChange={(e) => setCurPw(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>رمز جدید (حداقل ۱۰ نویسه شامل رقم)</Label><Input type="password" dir="ltr" className="text-left" value={newPw} onChange={(e) => setNewPw(e.target.value)} minLength={10} /></div>
            <div className="space-y-1.5"><Label>تکرار رمز جدید</Label><Input type="password" dir="ltr" className="text-left" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} minLength={10} /></div>
            {pwError && <p className="text-sm text-red-700 dark:text-red-400">{pwError}</p>}
            <div className="flex gap-2 justify-end">
              {!me.user.mustChangePassword && <Button variant="outline" onClick={() => setPwOpen(false)}>انصراف</Button>}
              <Button onClick={submitPassword}>ثبت رمز جدید</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
