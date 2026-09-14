'use client';
// نقطه ورود — جریان ورود → پوستهٔ برنامه (مسیر یکتا؛ ناوبری داخلی)
import { useCallback, useEffect, useState } from 'react';
import { LoginView } from '@/components/edc/login-view';
import { AppShell, MeInfo } from '@/components/edc/app-shell';
import { api } from '@/components/edc/api';

export default function Page() {
  const [me, setMe] = useState<MeInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(() => {
    setLoading(true);
    api<MeInfo>('/api/auth/me')
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let alive = true;
    api<MeInfo>('/api/auth/me')
      .then((d) => { if (alive) setMe(d); })
      .catch(() => { if (alive) setMe(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground">در حال بارگذاری…</div>
      </div>
    );
  }

  if (!me) {
    return <LoginView onLoggedIn={loadMe} />;
  }

  return <AppShell me={me} onLogout={() => { setMe(null); }} goHome={loadMe} />;
}
