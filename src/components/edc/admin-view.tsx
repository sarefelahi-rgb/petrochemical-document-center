'use client';
// پنل مدیریت — کاربران، ساختار پروژه، واژگان، تنظیمات، حسابرسی، داده نمونه
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { UserPlus, FolderPlus, BookOpen, Settings2, ScrollText, Database, Copy, Cpu, RotateCcw, Ban } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { api, fmtJalali, ROLE_LABELS, CONF_LABELS } from './api';

interface AdminUser { id: string; username: string; fullName: string; role: string; clearance: string; categoryAccess: string | null; isActive: boolean; mfaEnabled: boolean; lastLoginAt: string | null; isSample: boolean; lockedUntil: string | null; projectMemberships: Array<{ projectId: string; project: { code: string; name: string } }> }
interface Proj { id: string; code: string; name: string; isSample: boolean; areas: Array<{ id: string; code: string; name: string; units: Array<{ id: string; code: string; name: string }> }>; _count: { documents: number; memberships: number } }
interface Vocab { id: string; domain: string; code: string; label: string }
interface AuditRow { id: string; action: string; actorName: string | null; detail: string | null; ip: string | null; at: string }
interface SettingsMap { [k: string]: string }

export function AdminView({ orgName }: { orgName: string }) {
  const [tab, setTab] = useState('users');
  return (
    <div className="space-y-4" data-testid="admin-view">
      <h1 className="text-xl font-bold">مدیریت سامانه</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="users"><UserPlus className="h-4 w-4 ml-1" /> کاربران</TabsTrigger>
          <TabsTrigger value="structure"><FolderPlus className="h-4 w-4 ml-1" /> پروژه‌ها</TabsTrigger>
          <TabsTrigger value="vocab"><BookOpen className="h-4 w-4 ml-1" /> واژگان</TabsTrigger>
          <TabsTrigger value="settings"><Settings2 className="h-4 w-4 ml-1" /> تنظیمات</TabsTrigger>
          <TabsTrigger value="audit"><ScrollText className="h-4 w-4 ml-1" /> حسابرسی</TabsTrigger>
          <TabsTrigger value="processing"><Cpu className="h-4 w-4 ml-1" /> پردازش</TabsTrigger>
          <TabsTrigger value="sample"><Database className="h-4 w-4 ml-1" /> داده نمونه</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="structure"><StructureTab /></TabsContent>
        <TabsContent value="vocab"><VocabTab /></TabsContent>
        <TabsContent value="settings"><SettingsTab orgName={orgName} /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
        <TabsContent value="processing"><ProcessingTab /></TabsContent>
        <TabsContent value="sample"><SampleTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// انتخاب دسته‌بندی‌های محرمانگی — چندگزینه‌ای + گزینهٔ «همه»
// مقدار: null = سطح کلاسیک | "ALL" = همه | JSON array مثل ["PUBLIC","CONFIDENTIAL"]
function CategoryPicker({ value, onChange, idPrefix }: { value: string | null; onChange: (v: string | null) => void; idPrefix: string }) {
  const isAll = value === 'ALL';
  let cats: string[] = [];
  if (value && value.startsWith('[')) { try { cats = JSON.parse(value) as string[]; } catch { cats = []; } }
  const allKeys = Object.keys(CONF_LABELS);
  const toggle = (k: string) => {
    const next = cats.includes(k) ? cats.filter((c) => c !== k) : [...cats, k];
    // دستهٔ خالی مجاز نیست — حداقل PUBLIC
    onChange(next.filter((c) => c !== 'PUBLIC').length || next.includes('PUBLIC') ? JSON.stringify(allKeys.filter((kk) => (kk === 'PUBLIC' ? true : next.includes(kk)))) : null);
  };
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="دسته‌بندی‌های محرمانگی مجاز">
      <label className="flex items-center gap-1.5 text-sm rounded-lg border px-2.5 py-1.5 cursor-pointer bg-teal-700/5 border-teal-700/30" title="دسترسی به همهٔ دسته‌بندی‌ها">
        <input
          type="checkbox"
          id={`${idPrefix}-all`}
          checked={isAll}
          onChange={(e) => onChange(e.target.checked ? 'ALL' : JSON.stringify(['PUBLIC', 'INTERNAL']))}
          className="accent-teal-700"
        />
        <span className="font-medium">همه</span>
      </label>
      {allKeys.map((k) => (
        <label key={k} className={`flex items-center gap-1.5 text-sm rounded-lg border px-2.5 py-1.5 cursor-pointer ${isAll ? 'opacity-50' : ''}`}>
          <input
            type="checkbox"
            id={`${idPrefix}-${k}`}
            checked={isAll || cats.includes(k)}
            disabled={isAll}
            onChange={() => toggle(k)}
            className="accent-teal-700"
          />
          {CONF_LABELS[k]}
        </label>
      ))}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<Proj[]>([]);
  const [form, setForm] = useState({ username: '', fullName: '', role: 'ENGINEER', categoryAccess: JSON.stringify(['PUBLIC', 'INTERNAL']) as string | null, projects: [] as string[] });
  const [tempPw, setTempPw] = useState<{ username: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ users: AdminUser[] }>('/api/admin/users').then((r) => setUsers(r.users)).catch((e) => toast({ title: 'خطا', description: e.message, variant: 'destructive' }));
    api<{ projects: Proj[] }>('/api/admin/projects').then((r) => setProjects(r.projects)).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function createUser() {
    if (!form.username.trim() || !form.fullName.trim()) {
      toast({ title: 'نقص اطلاعات', description: 'نام کاربری و نام کامل الزامی است.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ tempPassword: string }>('/api/admin/users', {
        method: 'POST',
        json: {
          username: form.username, fullName: form.fullName, role: form.role,
          categoryAccess: form.categoryAccess === 'ALL' ? 'ALL' : form.categoryAccess ? JSON.parse(form.categoryAccess) : null,
          projectIds: form.projects,
        },
      });
      setTempPw({ username: form.username, password: r.tempPassword });
      setForm({ username: '', fullName: '', role: 'ENGINEER', categoryAccess: JSON.stringify(['PUBLIC', 'INTERNAL']), projects: [] });
      load();
    } catch (e) {
      toast({ title: 'ایجاد کاربر ناموفق', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  async function patchUser(id: string, data: Record<string, unknown>) {
    try { await api('/api/admin/users', { method: 'PATCH', json: { id, ...data } }); load(); }
    catch (e) { toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' }); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">کاربر جدید</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div className="space-y-1.5"><Label>نام کاربری</Label><Input dir="ltr" className="text-left" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>نام کامل</Label><Input dir="auto" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label>نقش</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(ROLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-5 space-y-1.5">
            <Label>دسته‌بندی‌های محرمانگی مجاز (چندگزینه‌ای — یا گزینهٔ «همه»)</Label>
            <CategoryPicker idPrefix="new-user" value={form.categoryAccess} onChange={(v) => setForm({ ...form, categoryAccess: v })} />
          </div>
          <div className="md:col-span-5 flex justify-end">
            <Button onClick={createUser} disabled={busy}>ایجاد کاربر</Button>
          </div>
          <div className="md:col-span-5">
            <Label className="mb-1.5 block">پروژه‌های مجاز (انزوای داده — منع پیش‌فرض)</Label>
            <div className="flex flex-wrap gap-3">
              {projects.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm rounded-lg border px-3 py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.projects.includes(p.id)}
                    onChange={(e) => setForm({ ...form, projects: e.target.checked ? [...form.projects, p.id] : form.projects.filter((x) => x !== p.id) })}
                  />
                  <span className="code-ltr">{p.code}</span> {p.name}
                </label>
              ))}
              {projects.length === 0 && <p className="text-sm text-muted-foreground">پروژه‌ای نیست — ابتدا از برگه «پروژه‌ها» بسازید.</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">کاربران</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium"><span dir="auto">{u.fullName}</span> <span dir="ltr" className="text-xs text-muted-foreground font-mono">({u.username})</span> {u.isSample && <span className="text-xs text-purple-700 dark:text-purple-300">(نمونه)</span>}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {ROLE_LABELS[u.role] || u.role} · دسته‌ها: {u.categoryAccess === 'ALL' ? 'همه' : u.categoryAccess && u.categoryAccess.startsWith('[') ? (JSON.parse(u.categoryAccess) as string[]).map((c) => CONF_LABELS[c] || c).join('، ') : CONF_LABELS[u.clearance] || u.clearance} · MFA: {u.mfaEnabled ? 'فعال' : 'غیرفعال'} · آخرین ورود: {fmtJalali(u.lastLoginAt, true)}
                </div>
                <div className="text-xs text-muted-foreground">پروژه‌ها: {u.projectMemberships.map((m) => m.project.code).join('، ') || '—'}</div>
              </div>
              <div className="flex gap-1.5 items-center flex-wrap">
                {u.lockedUntil && u.lockedUntil > new Date().toISOString() && (
                  <Button size="sm" variant="outline" onClick={() => patchUser(u.id, { unlock: true })}>رفع قفل</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => patchUser(u.id, { isActive: !u.isActive })}>
                  {u.isActive ? 'غیرفعال' : 'فعال'}
                </Button>
                <CategoryPicker
                  idPrefix={`cat-${u.id}`}
                  value={u.categoryAccess}
                  onChange={(v) => patchUser(u.id, { categoryAccess: v === 'ALL' ? 'ALL' : v ? JSON.parse(v) : null })}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!tempPw} onOpenChange={(o) => !o && setTempPw(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رمز اولیهٔ کاربر — فقط همین یک‌بار</DialogTitle>
            <DialogDescription>این رمز دوباره نمایش داده نمی‌شود. کاربر در اولین ورود موظف به تغییر آن است.</DialogDescription>
          </DialogHeader>
          {tempPw && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted p-3 font-mono text-sm" dir="ltr">
                <div>user: {tempPw.username}</div>
                <div className="flex items-center justify-between gap-2">pass: {tempPw.password}
                  <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(tempPw.password); toast({ title: 'کپی شد' }); }} aria-label="کپی رمز"><Copy className="h-4 w-4" /></Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">هیچ حساب پیش‌فرضی با رمز ثابت در سامانه وجود ندارد.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StructureTab() {
  const [projects, setProjects] = useState<Proj[]>([]);
  const [projForm, setProjForm] = useState({ code: '', name: '' });
  const [areaForm, setAreaForm] = useState({ projectId: '', code: '', name: '' });
  const [unitForm, setUnitForm] = useState({ areaId: '', code: '', name: '' });

  const load = useCallback(() => { api<{ projects: Proj[] }>('/api/admin/projects').then((r) => setProjects(r.projects)).catch(() => {}); }, []);
  useEffect(load, [load]);

  async function create(kind: string, payload: Record<string, string>) {
    try { await api('/api/admin/projects', { method: 'POST', json: { kind, ...payload } }); toast({ title: 'ایجاد شد' }); load(); }
    catch (e) { toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' }); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">پروژه جدید</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>کد</Label><Input dir="ltr" className="text-left" value={projForm.code} onChange={(e) => setProjForm({ ...projForm, code: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>نام</Label><Input value={projForm.name} onChange={(e) => setProjForm({ ...projForm, name: e.target.value })} /></div>
          </div>
          <Button onClick={() => create('project', projForm)}>ایجاد پروژه</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">ناحیه جدید</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={areaForm.projectId || undefined} onValueChange={(v) => setAreaForm({ ...areaForm, projectId: v })}>
            <SelectTrigger><SelectValue placeholder="پروژه" /></SelectTrigger>
            <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>کد ناحیه</Label><Input dir="ltr" className="text-left" value={areaForm.code} onChange={(e) => setAreaForm({ ...areaForm, code: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>نام ناحیه</Label><Input value={areaForm.name} onChange={(e) => setAreaForm({ ...areaForm, name: e.target.value })} /></div>
          </div>
          <Button onClick={() => create('area', areaForm)} disabled={!areaForm.projectId}>ایجاد ناحیه</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">واحد جدید</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={unitForm.areaId || undefined} onValueChange={(v) => setUnitForm({ ...unitForm, areaId: v })}>
            <SelectTrigger><SelectValue placeholder="ناحیه" /></SelectTrigger>
            <SelectContent>
              {projects.flatMap((p) => p.areas.map((a) => <SelectItem key={a.id} value={a.id}><span className="code-ltr">{p.code}</span> / {a.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>کد واحد</Label><Input dir="ltr" className="text-left" value={unitForm.code} onChange={(e) => setUnitForm({ ...unitForm, code: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>نام واحد</Label><Input value={unitForm.name} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} /></div>
          </div>
          <Button onClick={() => create('unit', unitForm)} disabled={!unitForm.areaId}>ایجاد واحد</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">ساختار فعلی</CardTitle></CardHeader>
        <CardContent className="space-y-2 max-h-80 overflow-y-auto thin-scroll">
          {projects.map((p) => (
            <div key={p.id} className="rounded-lg border px-3 py-2 text-sm">
              <div className="font-medium"><span className="code-ltr">{p.code}</span> {p.name} {p.isSample && <span className="text-xs text-purple-700 dark:text-purple-300">(نمونه)</span>}</div>
              <div className="text-xs text-muted-foreground mt-1">{p._count.documents} سند · {p._count.memberships} عضو</div>
              {p.areas.map((a) => (
                <div key={a.id} className="mr-3 mt-1 text-xs">
                  <div className="font-medium">{a.name} <span className="code-ltr">{a.code}</span></div>
                  <div className="mr-3 text-muted-foreground">{a.units.map((u) => <span key={u.id} className="mr-2"><span className="code-ltr">{u.code}</span> {u.name}</span>) || 'بدون واحد'}</div>
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function VocabTab() {
  const [items, setItems] = useState<Vocab[]>([]);
  const [form, setForm] = useState({ domain: 'DISCIPLINE', code: '', label: '' });
  const load = useCallback(() => { api<{ items: Vocab[] }>('/api/admin/vocabulary').then((r) => setItems(r.items)).catch(() => {}); }, []);
  useEffect(load, [load]);

  async function add() {
    try { await api('/api/admin/vocabulary', { method: 'POST', json: form }); setForm({ ...form, code: '', label: '' }); load(); }
    catch (e) { toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' }); }
  }

  const domains = [['DISCIPLINE', 'رشته مهندسی'], ['DOC_TYPE', 'نوع مدرک'], ['ORIGIN', 'مبدأ']] as const;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">افزودن به واژگان کنترل‌شده</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={form.domain} onValueChange={(v) => setForm({ ...form, domain: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{domains.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>کد</Label><Input dir="ltr" className="text-left" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>برچسب</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
          </div>
          <Button onClick={add}>افزودن</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">واژگان فعلی</CardTitle></CardHeader>
        <CardContent className="space-y-3 max-h-96 overflow-y-auto thin-scroll">
          {domains.map(([d, dLabel]) => (
            <div key={d}>
              <h4 className="text-sm font-medium mb-1">{dLabel}</h4>
              <div className="flex flex-wrap gap-1.5">
                {items.filter((i) => i.domain === d).map((i) => (
                  <span key={i.id} className="text-xs rounded-md border px-2 py-1">{i.label} <span className="code-ltr text-muted-foreground">{i.code}</span></span>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab({ orgName }: { orgName: string }) {
  const [settings, setSettings] = useState<SettingsMap>({});
  const load = useCallback(() => { api<{ settings: SettingsMap }>('/api/admin/settings').then((r) => setSettings(r.settings)).catch(() => {}); }, []);
  useEffect(load, [load]);

  async function save() {
    try {
      await api('/api/admin/settings', { method: 'PATCH', json: settings });
      toast({ title: 'تنظیمات ذخیره شد', description: 'نام سامانه پس از بازخوانی صفحه اعمال می‌شود.' });
    } catch (e) { toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' }); }
  }

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">تنظیمات سازمانی</CardTitle></CardHeader>
      <CardContent className="space-y-3 max-w-xl">
        <div className="space-y-1.5"><Label>نام سامانه</Label><Input value={settings['app.name'] || ''} onChange={(e) => setSettings({ ...settings, 'app.name': e.target.value })} /></div>
        <div className="space-y-1.5"><Label>نام سازمان</Label><Input value={settings['app.orgName'] || orgName} onChange={(e) => setSettings({ ...settings, 'app.orgName': e.target.value })} /></div>
        <div className="space-y-1.5">
          <Label>رنگ سازمانی</Label>
          <div className="flex gap-2 items-center">
            <input type="color" value={settings['app.primaryColor'] || '#0f766e'} onChange={(e) => setSettings({ ...settings, 'app.primaryColor': e.target.value })} className="w-10 h-10 rounded cursor-pointer" aria-label="انتخاب رنگ" />
            <span className="text-xs text-muted-foreground" dir="ltr">{settings['app.primaryColor'] || '#0f766e'}</span>
          </div>
        </div>
        <div className="space-y-1.5"><Label>سقف آپلود (مگابایت)</Label><Input type="number" min={1} max={512} value={settings['upload.maxMb'] || '120'} onChange={(e) => setSettings({ ...settings, 'upload.maxMb': e.target.value })} /></div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium">ورود دومرحله‌ای (MFA)</div>
            <div className="text-xs text-muted-foreground">فعال‌سازی برای مدیران و کاربران حساس — توصیهٔ تولید: روشن</div>
          </div>
          <Switch
            checked={(settings['auth.mfaEnabled'] || 'false') === 'true'}
            onCheckedChange={(v) => setSettings({ ...settings, 'auth.mfaEnabled': v ? 'true' : 'false' })}
            aria-label="ورود دومرحله‌ای"
          />
        </div>
        <Button onClick={save}>ذخیره تنظیمات</Button>
      </CardContent>
    </Card>
  );
}

function AuditTab() {
  const [events, setEvents] = useState<AuditRow[]>([]);
  useEffect(() => { api<{ events: AuditRow[] }>('/api/admin/audit').then((r) => setEvents(r.events)).catch(() => {}); }, []);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">حسابرسی — بدون محتوای محرمانه</CardTitle></CardHeader>
      <CardContent className="space-y-1 max-h-[480px] overflow-y-auto thin-scroll">
        {events.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-2 text-xs rounded-md bg-muted/40 px-3 py-1.5 flex-wrap">
            <span className="font-medium">{e.action}</span>
            <span className="text-muted-foreground truncate flex-1 min-w-0">{e.detail || ''}</span>
            <span>{e.actorName || '—'} · {fmtJalali(e.at, true)} · <span dir="ltr">{e.ip || '—'}</span></span>
          </div>
        ))}
        {events.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">رخدادی ثبت نشده است.</p>}
      </CardContent>
    </Card>
  );
}

function SampleTab() {
  const [info, setInfo] = useState<{ present: boolean; counts: { sampleDocs: number } } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api<{ present: boolean; counts: { sampleDocs: number } }>('/api/admin/sample-data').then(setInfo).catch(() => {}); }, []);
  useEffect(load, [load]);

  async function run(action: 'create' | 'purge') {
    setBusy(true);
    try {
      const r = await api<{ created?: boolean; purged?: boolean; sampleUsers?: Array<{ username: string; project: string }> }>('/api/admin/sample-data', { method: 'POST', json: { action } });
      if (action === 'create') {
        toast({ title: 'داده نمونه ساخته شد', description: `کاربران نمونه: ${r.sampleUsers?.map((u) => u.username).join('، ')}` });
      } else {
        toast({ title: 'داده نمونه به‌طور کامل حذف شد' });
      }
      load();
    } catch (e) { toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">داده آزمایشی برچسب‌خورده</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          داده نمونه شامل دو پروژه، کاربران نمونه، اسناد و فایل‌های PDF نمونه است و همهٔ رکوردها برچسب «نمونهٔ آموزشی» دارند.
          این داده از داده واقعی جدا است و حذف آن، فقط همین داده را پاک می‌کند.
        </p>
        <p>وضعیت: {info?.present ? `موجود (${info.counts.sampleDocs} سند نمونه)` : 'ناموجود'}</p>
        <div className="flex gap-2">
          <Button onClick={() => run('create')} disabled={busy}>ایجاد داده نمونه</Button>
          <Button variant="destructive" onClick={() => run('purge')} disabled={busy || !info?.present}>حذف کامل داده نمونه</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          برای آزمون انزوای داده: کاربران نمونه رمز تصادفی دارند؛ از برگه «کاربران» برای هر کاربر نمونه با «غیرفعال/فعال» و عضویت پروژه کار کنید یا کاربر واقعی بسازید و فقط به یک پروژه دسترسی دهید.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------- تب پردازش — مانیتور صف Worker (مرحله B) ----------

interface JobRow {
  id: string; type: string; status: string; stage: string; attempts: number; maxAttempts: number;
  fileId: string; documentId: string | null; correlationId: string | null; error: string | null;
  durationMs: number | null; createdAt: string; finishedAt: string | null; workerVersion: string | null;
  toolVersion: string | null; result: Record<string, unknown> | null;
  file: { originalName: string };
}
interface JobsData {
  jobs: JobRow[];
  stats: { byStatus: Record<string, number>; byType: Record<string, number>; queuedStale: number };
  worker: { heartbeat: { at: string; pid: number; version: string; versions?: Record<string, string> } | null; alive: boolean };
}

const JOB_TYPE_LABELS: Record<string, string> = {
  THUMBNAIL: 'بندانگشتی', TEXT_EXTRACT: 'استخراج متن', OCR: 'OCR', TITLE_BLOCK: 'شناسنامه',
};
const JOB_STATUS_LABELS: Record<string, string> = {
  QUEUED: 'در صف', RUNNING: 'در اجرا', DONE: 'انجام شد', FAILED: 'ناموفق', DEAD: 'Dead-letter', CANCELLED: 'لغوشده',
};
const JOB_STATUS_STYLE: Record<string, string> = {
  QUEUED: 'bg-sky-50 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  RUNNING: 'bg-amber-50 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  DONE: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  FAILED: 'bg-orange-50 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200',
  DEAD: 'bg-red-50 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  CANCELLED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function ProcessingTab() {
  const [data, setData] = useState<JobsData | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(() => {
    api<JobsData>(`/api/jobs?limit=50${statusFilter ? `&status=${statusFilter}` : ''}`).then(setData).catch((e) => toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' }));
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function retry(id: string) {
    try { await api(`/api/jobs/${id}`, { method: 'POST' }); toast({ title: 'کار بازپردازش شد' }); load(); }
    catch (e) { toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' }); }
  }
  async function cancel(id: string) {
    try { await api(`/api/jobs?id=${id}`, { method: 'DELETE' }); toast({ title: 'کار لغو شد' }); load(); }
    catch (e) { toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' }); }
  }

  const hb = data?.worker.heartbeat;
  return (
    <div className="space-y-3" data-testid="processing-tab">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${data?.worker.alive ? 'bg-emerald-500' : 'bg-red-500'}`} />
          Worker مستقل پردازش: {data?.worker.alive ? `فعال (v${hb?.version} · PID ${hb?.pid} · آخرین ضربان ${fmtJalali(hb?.at, true)})` : 'غیرفعال — کارها در صف می‌مانند تا راه‌اندازی شود'}
        </CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>ابزارها: {hb?.versions?.tesseract || '—'} · poppler {hb?.versions?.poppler || '—'} · OCR فارسی/انگلیسی (fas+eng)</p>
          <p>صف: {Object.entries(data?.stats.byStatus || {}).map(([k, v]) => `${JOB_STATUS_LABELS[k] || k}=${v}`).join(' · ') || 'خالی'}</p>
          <p>ایزوله‌سازی: اجرا با کاربر غیر ریشه · سقف حافظه ۱ گیگابایت · سقف زمان هر کار · بدون تماس شبکه · پاک‌سازی tmp پس از هر کار</p>
        </CardContent>
      </Card>

      <div className="flex gap-1 flex-wrap">
        {['', 'QUEUED', 'RUNNING', 'DONE', 'DEAD', 'CANCELLED'].map((s) => (
          <Button key={s || 'all'} size="sm" variant={statusFilter === s ? 'secondary' : 'ghost'} onClick={() => setStatusFilter(s)}>
            {s === '' ? 'همه' : JOB_STATUS_LABELS[s]}
          </Button>
        ))}
      </div>

      <div className="rounded-lg border divide-y">
        {data?.jobs.length === 0 && <p className="p-4 text-sm text-muted-foreground">کاری در صف نیست.</p>}
        {data?.jobs.map((j) => (
          <div key={j.id} className="p-3 text-xs space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={JOB_STATUS_STYLE[j.status]}>{JOB_STATUS_LABELS[j.status] || j.status}</Badge>
              <span className="font-bold">{JOB_TYPE_LABELS[j.type] || j.type}</span>
              <span className="text-muted-foreground" dir="ltr">{j.file.originalName.slice(0, 40)}</span>
              <span className="text-muted-foreground">· تلاش {j.attempts}/{j.maxAttempts}</span>
              {j.durationMs != null && <span className="text-muted-foreground">· {Math.round(j.durationMs / 100) / 10}s</span>}
              <span className="text-muted-foreground">· {fmtJalali(j.createdAt, true)}</span>
              {j.correlationId && <span className="text-muted-foreground font-mono" dir="ltr" title="شناسه هم‌بستگی زنجیره">corr: {j.correlationId.slice(0, 8)}…</span>}
              <div className="flex-1" />
              {['DEAD', 'FAILED', 'CANCELLED'].includes(j.status) && (
                <Button size="sm" variant="outline" onClick={() => retry(j.id)}><RotateCcw className="h-3.5 w-3.5" /> بازپردازش</Button>
              )}
              {['QUEUED', 'FAILED'].includes(j.status) && (
                <Button size="sm" variant="ghost" className="text-red-700" onClick={() => cancel(j.id)}><Ban className="h-3.5 w-3.5" /> لغو</Button>
              )}
            </div>
            {j.error && <p className="text-red-700 dark:text-red-300">خطا: {j.error}</p>}
            {j.result && !j.error && (
              <p className="text-muted-foreground" dir="auto">
                نتیجه: {Object.entries(j.result).filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean').map(([k, v]) => `${k}=${String(v).slice(0, 40)}`).join(' · ').slice(0, 180)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
