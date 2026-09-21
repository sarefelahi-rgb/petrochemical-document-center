'use client';
// ورود — دو مرحله‌ای برای مدیران (MFA)؛ تغییر اجباری رمز در اولین ورود
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { api } from './api';

type Stage =
  | { kind: 'form' }
  | { kind: 'mfa'; token: string; enroll?: string };

export function LoginView({ onLoggedIn }: { onLoggedIn: (mustChange: boolean) => void }) {
  const [stage, setStage] = useState<Stage>({ kind: 'form' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setInfo(''); setBusy(true);
    try {
      const r = await api<{ ok?: boolean; mfaEnroll?: boolean; mfaRequired?: boolean; mfaToken?: string; mfaSecret?: string; mustChangePassword?: boolean }>('/api/auth/login', { method: 'POST', json: { username, password } });
      if (r.mfaEnroll) {
        setStage({ kind: 'mfa', token: r.mfaToken!, enroll: r.mfaSecret });
        setInfo('برای امنیت سامانه، ورود دومرحله‌ای برای مدیران الزامی است. کد نشان‌داده‌شده را در اپ Authenticator (مانند Google Authenticator) وارد کنید و کد ۶ رقمی تولیدشده را در کادر زیر بنویسید.');
      } else if (r.mfaRequired) {
        setStage({ kind: 'mfa', token: r.mfaToken! });
      } else {
        onLoggedIn(!!r.mustChangePassword);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const st = stage as { kind: 'mfa'; token: string };
      const r = await api<{ ok?: boolean; mustChangePassword?: boolean }>('/api/auth/mfa-verify', { method: 'POST', json: { mfaToken: st.token, code } });
      onLoggedIn(!!r.mustChangePassword);
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 text-white flex items-center justify-center text-2xl font-bold shadow-xl shadow-teal-700/30">س</div>
          <h1 className="text-2xl font-bold leading-relaxed">مرکز هوشمند اسناد اداره مهندسی عمومی فراورش یک</h1>
          <p className="text-sm text-muted-foreground">سامانه سازمانی مدیریت اسناد و نقشه‌های مهندسی</p>
        </div>

        {stage.kind === 'form' && (
          <Card className="glass-strong glass-sheen rounded-2xl">
            <CardHeader>
              <CardTitle>ورود به سامانه</CardTitle>
              <CardDescription>با حساب سازمانی خود وارد شوید.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">نام کاربری</Label>
                  <Input id="username" dir="ltr" className="text-left" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">رمز عبور</Label>
                  <Input id="password" type="password" dir="ltr" className="text-left" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                {error && <Alert variant="destructive"><AlertDescription dir="auto">{error}</AlertDescription></Alert>}
                <Button type="submit" className="w-full" disabled={busy}>{busy ? 'در حال بررسی…' : 'ورود'}</Button>
                <p className="text-xs text-muted-leading text-muted-foreground">
                  پنج تلاش ناموفق باعث قفل موقت حساب می‌شود.
                </p>
              </form>
            </CardContent>
          </Card>
        )}

        {stage.kind === 'mfa' && (
          <Card className="glass-strong glass-sheen rounded-2xl">
            <CardHeader>
              <CardTitle>ورود دومرحله‌ای</CardTitle>
              <CardDescription>کد ۶ رقمی اپ Authenticator را وارد کنید.</CardDescription>
            </CardHeader>
            <CardContent>
              {'enroll' in stage && stage.enroll && (
                <Alert className="mb-4">
                  <AlertDescription>
                    <p className="font-medium mb-1">ثبت اولیهٔ MFA — این کد یک‌بار نمایش داده می‌شود:</p>
                    <code dir="ltr" className="block text-left font-mono text-sm bg-muted p-2 rounded select-all">{stage.enroll}</code>
                    <p className="text-xs mt-2">در اپ Authenticator گزینهٔ «Enter a setup key» را انتخاب و کد بالا را وارد کنید.</p>
                  </AlertDescription>
                </Alert>
              )}
              <form onSubmit={submitMfa} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">کد یک‌بارمصرف</Label>
                  <Input id="code" dir="ltr" className="text-center font-mono text-lg tracking-widest" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
                </div>
                {error && <Alert variant="destructive"><AlertDescription dir="auto">{error}</AlertDescription></Alert>}
                <Button type="submit" className="w-full" disabled={busy}>تأیید و ورود</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {info && <Alert><AlertDescription>{info}</AlertDescription></Alert>}
      </div>
    </div>
  );
}
