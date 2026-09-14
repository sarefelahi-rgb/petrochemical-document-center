'use client';
// برچسب‌های وضعیت — رنگ تنها نشانهٔ وضعیت نیست؛ متن برچسب همراه رنگ است
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, CONF_LABELS, REV_STATUS_LABELS } from './api';

export function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    RECEIVED: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
    PROCESSING: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
    INCOMPLETE: 'bg-orange-100 text-orange-900 dark:bg-orange-900/50 dark:text-orange-200',
    IN_REVIEW: 'bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200',
    APPROVED: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200',
    PUBLISHED: 'bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-200',
    SUPERSEDED: 'bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200 line-through',
    ARCHIVED: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    VOID: 'bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-200',
  };
  return <Badge variant="outline" className={cls[status] || ''}>{STATUS_LABELS[status] || status}</Badge>;
}

export function ConfBadge({ conf }: { conf: string }) {
  const cls: Record<string, string> = {
    PUBLIC: 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200',
    INTERNAL: 'bg-slate-50 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200',
    CONFIDENTIAL: 'bg-amber-50 text-amber-900 border-amber-400 dark:bg-amber-900/40 dark:text-amber-200',
    RESTRICTED: 'bg-red-50 text-red-900 border-red-400 dark:bg-red-900/40 dark:text-red-200',
  };
  return <Badge variant="outline" className={cls[conf] || ''}>{CONF_LABELS[conf] || conf}</Badge>;
}

export function RevBadge({ code, status, valid }: { code: string; status: string; valid?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="outline" className="code-ltr font-mono" dir="ltr">R{code}</Badge>
      {valid && <Badge className="bg-teal-600 text-white">نسخه معتبر</Badge>}
      {status === 'SUPERSEDED' && <Badge variant="outline" className="bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">منسوخ</Badge>}
      <span className="sr-only">{REV_STATUS_LABELS[status] || status}</span>
    </span>
  );
}

export function SampleBadge() {
  return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-900/40 dark:text-purple-200">نمونهٔ آموزشی</Badge>;
}
