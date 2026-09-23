'use client';
// نقشهٔ تعاملی مجتمع — فقط نمای شماتیک، خوانده‌شده از پایگاه‌داده (جدول MapNode)
// گره‌ها را ادمین از پنل مدیریت (تب «نقشهٔ مجتمع») تنظیم می‌کند: جابجایی، افزودن، ویرایش، حذف، نمایش
// سه سطح ناوبری: سایت (واحدها) → مناطق واحد → تجهیزات منطقه؛ کلیک تجهیز → پروندهٔ اسناد و نقشه‌ها
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MapPin, Layers, Factory, ExternalLink,
  Waves, Wrench, ChevronLeft, CircleAlert, Map as MapIcon, EyeOff,
} from 'lucide-react';
import { api } from './api';
import { toPersianDigits as toFa } from '@/lib/normalize';
import { StatusBadge, ConfBadge } from './badges';
import { PLANT_NAME, MAP_VIEWBOX } from '@/lib/plant-map';
import { SiteDecor, MapBlock, MAP_CHIP_CLASSES } from './map-canvas';
import type { MapNodeLike } from './map-canvas';

interface MapNodeRow extends MapNodeLike {
  parentId: string | null;
  desc: string | null;
  visible: boolean;
}

interface DossierDoc {
  documentId: string; docNumber: string; title: string; project: string; docType: string;
  revision: string | null; revStatus: string | null; status: string; confidentiality: string;
  linkStatus: string; linkRef: string;
}
interface DossierResp {
  found: boolean; ref?: string; message?: string;
  tag?: { tag: string; description: string | null; tagType: string } | null;
  groups?: Array<{ label: string; docs: DossierDoc[] }>;
  totalDocs?: number; suggested?: number; confirmed?: number;
}

export function PlantMapView({ go }: { go: (view: string, param?: string) => void }) {
  const [nodes, setNodes] = useState<MapNodeRow[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selUnitId, setSelUnitId] = useState<string | null>(null);
  const [selAreaId, setSelAreaId] = useState<string | null>(null);
  const [dossierTag, setDossierTag] = useState<string | null>(null);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossier, setDossier] = useState<DossierResp | null>(null);
  const [dossierError, setDossierError] = useState('');

  useEffect(() => {
    api<{ nodes: MapNodeRow[] }>('/api/map')
      .then((r) => {
        // ادمین همهٔ گره‌ها (حتی پنهان) را از سرور می‌گیرد؛ نمای کاربر فقط گره‌های نمایان را می‌کشد
        setNodes(r.nodes.filter((n) => n.visible));
      })
      .catch((e) => setLoadError((e as Error).message));
  }, []);

  const childrenOf = useCallback(
    (pid: string | null) => (nodes || []).filter((n) => n.parentId === pid),
    [nodes],
  );

  const byId = useMemo(() => new Map((nodes || []).map((n) => [n.id, n])), [nodes]);

  // شمارش فرزندان مستقیم و تجهیزات زیر یک واحد (برای متن روی بلوک‌ها)
  const childCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes || []) if (n.parentId) m.set(n.parentId, (m.get(n.parentId) || 0) + 1);
    return m;
  }, [nodes]);

  const equipmentUnderUnit = useCallback((unitId: string) => {
    let c = 0;
    for (const z of childrenOf(unitId)) c += childCount.get(z.id) || 0;
    return c;
  }, [childrenOf, childCount]);

  const openDossier = useCallback(async (tag: string) => {
    setDossierTag(tag); setDossierOpen(true); setDossierLoading(true); setDossier(null); setDossierError('');
    try {
      const r = await api<DossierResp>(`/api/dossier?ref=${encodeURIComponent(tag)}`);
      setDossier(r);
    } catch (e) {
      setDossierError((e as Error).message);
    } finally {
      setDossierLoading(false);
    }
  }, []);

  const openDoc = (docId: string) => { setDossierOpen(false); go('document', docId); };

  const backToSite = () => { setSelUnitId(null); setSelAreaId(null); };
  const backToUnit = () => setSelAreaId(null);

  const selUnit = selUnitId ? byId.get(selUnitId) || null : null;
  const selArea = selAreaId ? byId.get(selAreaId) || null : null;

  if (loadError) {
    return (
      <div className="glass rounded-2xl p-5 text-sm text-red-700 dark:text-red-400 flex items-center gap-2" data-testid="plant-map-error">
        <CircleAlert className="h-4 w-4" /> بارگذاری نقشه ناموفق بود: {loadError}
      </div>
    );
  }

  if (!nodes) {
    return (
      <div className="space-y-3" data-testid="plant-map-loading">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 text-sm space-y-2" data-testid="plant-map-empty">
        <p className="flex items-center gap-2 font-medium"><MapIcon className="h-4 w-4 text-primary" /> نقشهٔ مجتمع هنوز تنظیم نشده است.</p>
        <p className="text-muted-foreground leading-6">
          مدیر سامانه می‌تواند از «مدیریت سامانه ← نقشهٔ مجتمع» بلوک‌های واحد، منطقه و تجهیز را اضافه کند و نقشه را تنظیم نماید.
        </p>
      </div>
    );
  }

  // ---------- سطح ۳: تجهیزات منطقه (شماتیک) ----------
  if (selUnit && selArea) {
    const equipment = childrenOf(selArea.id);
    return (
      <div className="space-y-4" data-testid="plant-map-area">
        <Breadcrumb unit={selUnit} area={selArea} onSite={backToSite} onUnit={backToUnit} />
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 flex-wrap">
            <Wrench className="h-5 w-5 text-primary" />
            <h2 className="font-bold">{selArea.name}</h2>
            <span className="chip">{toFa(equipment.length)} تجهیز</span>
            {selArea.desc && <span className="text-sm text-muted-foreground">— {selArea.desc}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">برای مشاهدهٔ مدارک و نقشه‌های هر تجهیز، روی بلوک آن کلیک کنید.</p>
        </div>
        <MapCanvas>
          {equipment.map((eq) => (
            <MapBlock
              key={eq.id} node={eq}
              meta={eq.desc || undefined}
              onClick={() => { if (eq.code) openDossier(eq.code); }}
              ariaLabel={`باز کردن مدارک تجهیز ${eq.code || eq.name}`}
            />
          ))}
        </MapCanvas>
        <ChipsRow items={equipment} onPick={(n) => n.code && openDossier(n.code)} />
        <DossierDialog
          open={dossierOpen} onOpenChange={setDossierOpen} tag={dossierTag}
          loading={dossierLoading} data={dossier} error={dossierError} onOpenDoc={openDoc}
        />
      </div>
    );
  }

  // ---------- سطح ۲: مناطق واحد (شماتیک) ----------
  if (selUnit) {
    const areas = childrenOf(selUnit.id);
    return (
      <div className="space-y-4" data-testid="plant-map-unit">
        <Breadcrumb unit={selUnit} onSite={backToSite} />
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 flex-wrap">
            <Factory className="h-5 w-5 text-primary" />
            <h2 className="font-bold">{selUnit.name}</h2>
          </div>
          {selUnit.desc && <p className="text-sm text-muted-foreground mt-1">{selUnit.desc}</p>}
          <p className="text-xs text-muted-foreground mt-1">
            {toFa(areas.length)} منطقه · {toFa(equipmentUnderUnit(selUnit.id))} تجهیز ثبت‌شده روی نقشه — برای دیدن تجهیزات روی هر منطقه کلیک کنید.
          </p>
        </div>
        <MapCanvas>
          {areas.map((a) => (
            <MapBlock
              key={a.id} node={a}
              meta={`${toFa(childCount.get(a.id) || 0)} تجهیز`}
              onClick={() => setSelAreaId(a.id)}
            />
          ))}
        </MapCanvas>
        <ChipsRow items={areas} onPick={(n) => setSelAreaId(n.id)} />
        <DossierDialog
          open={dossierOpen} onOpenChange={setDossierOpen} tag={dossierTag}
          loading={dossierLoading} data={dossier} error={dossierError} onOpenDoc={openDoc}
        />
      </div>
    );
  }

  // ---------- سطح ۱: نقشهٔ سایت — واحدها ----------
  const units = childrenOf(null);
  return (
    <div className="space-y-4" data-testid="plant-map-site">
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <Factory className="h-5 w-5 text-primary" />
          <h2 className="font-bold">نقشهٔ تعاملی {PLANT_NAME}</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          روی هر واحد کلیک کنید تا مناطق آن، سپس تجهیزات و نقشه‌های مربوط به هر تجهیز باز شود.
        </p>
      </div>

      <MapCanvas withDecor>
        {units.map((u) => (
          <MapBlock
            key={u.id} node={u}
            meta={`${toFa(childCount.get(u.id) || 0)} منطقه · ${toFa(equipmentUnderUnit(u.id))} تجهیز`}
            onClick={() => setSelUnitId(u.id)}
          />
        ))}
      </MapCanvas>

      {/* فهرست سریع واحدها — موبایل */}
      <div className="md:hidden flex gap-2 overflow-x-auto thin-scroll pb-1" aria-label="دسترسی سریع واحدها">
        {units.map((u) => (
          <button key={u.id} onClick={() => setSelUnitId(u.id)} className="shrink-0 rounded-xl glass px-3 py-2 text-sm whitespace-nowrap hover:border-primary/50">
            {u.code && <span className="code-ltr font-semibold">{u.code}</span>} · {u.name.replace(/^واحد\s+/, '')}
          </button>
        ))}
      </div>

      <DossierDialog
        open={dossierOpen} onOpenChange={setDossierOpen} tag={dossierTag}
        loading={dossierLoading} data={dossier} error={dossierError} onOpenDoc={openDoc}
      />
    </div>
  );
}

/** بوم SVG مشترک — اندازهٔ ثابت با مقیاس‌پذیری خودکار */
function MapCanvas({ children, withDecor = false }: { children: React.ReactNode; withDecor?: boolean }) {
  return (
    <div className="glass rounded-2xl p-3 sm:p-4">
      <svg
        viewBox={`0 0 ${MAP_VIEWBOX.w} ${MAP_VIEWBOX.h}`}
        className="w-full h-auto rounded-xl"
        role="group"
        aria-label={`نقشهٔ شماتیک ${PLANT_NAME}`}
      >
        {withDecor && <SiteDecor />}
        {children}
      </svg>
    </div>
  );
}

/** ردیف چیپ‌های دسترسی سریع — زیر نقشه در سطوح منطقه و تجهیز */
function ChipsRow({ items, onPick }: { items: MapNodeRow[]; onPick: (n: MapNodeRow) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="دسترسی سریع">
      {items.map((n) => (
        <button
          key={n.id}
          onClick={() => onPick(n)}
          className={`rounded-lg px-2.5 py-1.5 text-xs transition-all hover:shadow-sm ${MAP_CHIP_CLASSES[n.color] || MAP_CHIP_CLASSES.primary}`}
        >
          {n.code && <span className="code-ltr font-semibold">{n.code}</span>}
          {n.code ? ' · ' : ''}{n.name}
        </button>
      ))}
    </div>
  );
}

function Breadcrumb({ unit, area, onSite, onUnit }: { unit: MapNodeLike; area?: MapNodeLike; onSite: () => void; onUnit?: () => void }) {
  return (
    <nav aria-label="مسیر نقشه" className="flex items-center gap-1 flex-wrap text-sm">
      <button onClick={onSite} className="rounded-lg px-2 py-1 hover:bg-accent flex items-center gap-1">
        <MapPin className="h-4 w-4 text-primary" /> نقشهٔ مجتمع
      </button>
      <ChevronLeft className="h-4 w-4 text-muted-foreground" aria-hidden />
      <button onClick={onUnit || (() => { })} disabled={!onUnit} className="rounded-lg px-2 py-1 hover:bg-accent disabled:hover:bg-transparent font-medium">
        {unit.name}
      </button>
      {area && (
        <>
          <ChevronLeft className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="px-2 py-1 rounded-lg bg-accent font-medium">{area.name}</span>
        </>
      )}
    </nav>
  );
}

function DossierDialog({
  open, onOpenChange, tag, loading, data, error, onOpenDoc,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; tag: string | null;
  loading: boolean; data: DossierResp | null; error: string; onOpenDoc: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto thin-scroll" data-testid="equipment-dossier">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            مدارک و نقشه‌های <span className="code-ltr">{tag}</span>
          </DialogTitle>
          <DialogDescription>
            {data?.found
              ? `${toFa(data.totalDocs || 0)} مدرک مرتبط — گروه‌بندی‌شده بر اساس نوع مدرک`
              : 'پروندهٔ تجهیز'}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" /><Skeleton className="h-14" /><Skeleton className="h-14" />
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-red-700 dark:text-red-400 flex items-center gap-2"><CircleAlert className="h-4 w-4" /> {error}</p>
        )}

        {!loading && !error && data && !data.found && (
          <div className="text-sm space-y-2">
            <p className="flex items-center gap-2 text-amber-700 dark:text-amber-400"><EyeOff className="h-4 w-4" /> مدارکی برای این تجهیز یافت نشد.</p>
            <p className="text-muted-foreground leading-6">{data.message || 'ممکن است هنوز سندی به این تجهیز پیوند نشده یا خارج از دسترسی شما باشد.'}</p>
          </div>
        )}

        {!loading && !error && data?.found && (
          <div className="space-y-4">
            {data.tag?.description && (
              <p className="text-sm text-muted-foreground">{data.tag.description}</p>
            )}
            {data.groups?.map((g) => (
              <section key={g.label} aria-label={g.label} className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Waves className="h-4 w-4 text-primary" /> {g.label}
                  <span className="text-xs text-muted-foreground">({toFa(g.docs.length)} مدرک)</span>
                </h3>
                {g.docs.map((d) => (
                  <div key={d.documentId + d.linkRef} className="rounded-xl border p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="code-ltr font-semibold text-sm">{d.docNumber}</span>
                        <span className="chip">{d.revision ? `نسخهٔ ${toFa(d.revision)}` : '—'}</span>
                        <ConfBadge conf={d.confidentiality} />
                        {d.linkStatus === 'SUGGESTED' && <span className="chip">پیوند پیشنهادی</span>}
                      </div>
                      <div dir="auto" className="text-sm text-muted-foreground line-clamp-1 text-start">{d.title}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={d.status} />
                      <Button size="sm" onClick={() => onOpenDoc(d.documentId)}>
                        <ExternalLink className="h-3.5 w-3.5" /> باز کردن
                      </Button>
                    </div>
                  </div>
                ))}
              </section>
            ))}
            <p className="text-[11px] text-muted-foreground">
              پوندها بر اساس پایگاه دادهٔ اسناد ساخته شده‌اند؛ پیوندهای «پیشنهادی» استخراج ماشینی هستند و پس از تأیید در کنترل مدارک قطعی می‌شوند.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
