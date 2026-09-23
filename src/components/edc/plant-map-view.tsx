'use client';
// نقشهٔ تعاملی مجتمع پتروشیمی بندر امام — سه سطح ناوبری: سایت → واحد → منطقه → تجهیز
// کلیک روی تجهیز، پروندهٔ اسناد و نقشه‌های آن (P&ID، ایزومتریک، دیتاشیت و ...) را باز می‌کند.
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MapPin, Layers, Factory, ArrowLeft, FileText, ExternalLink,
  Flame, Waves, Compass, Boxes, Wrench, ChevronLeft, CircleAlert, Satellite, Map as MapIcon,
} from 'lucide-react';
import { api } from './api';
import { toPersianDigits as toFa } from '@/lib/normalize';
import { StatusBadge, ConfBadge } from './badges';
import { PLANT_UNITS, PLANT_NAME, FAMILY_LABELS, unitEquipmentCount } from '@/lib/plant-map';
import type { MapUnit, MapArea, UnitFamily } from '@/lib/plant-map';

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

const FAMILY_CLASSES: Record<UnitFamily, string> = {
  olefin: 'fill-sky-500/10 stroke-sky-600/60 hover:fill-sky-500/25 dark:stroke-sky-400/70',
  aromatic: 'fill-amber-500/10 stroke-amber-600/60 hover:fill-amber-500/25 dark:stroke-amber-400/70',
  utility: 'fill-emerald-500/10 stroke-emerald-600/60 hover:fill-emerald-500/25 dark:stroke-emerald-400/70',
  tank: 'fill-violet-500/10 stroke-violet-600/60 hover:fill-violet-500/25 dark:stroke-violet-400/70',
};

const FAMILY_CHIP: Record<UnitFamily, string> = {
  olefin: 'bg-sky-600/10 text-sky-800 dark:text-sky-300',
  aromatic: 'bg-amber-600/10 text-amber-800 dark:text-amber-300',
  utility: 'bg-emerald-600/10 text-emerald-800 dark:text-emerald-300',
  tank: 'bg-violet-600/10 text-violet-800 dark:text-violet-300',
};

/** شکستن نام واحد به حداکثر دو خط برای متن داخل بلوک نقشه */
function splitName(name: string): [string, string | null] {
  const clean = name.replace(/^واحد\s+/, '');
  if (clean.length <= 18) return [clean, null];
  const words = clean.split(' ');
  let l1 = '';
  let i = 0;
  while (i < words.length && (l1 + ' ' + words[i]).trim().length <= 18) { l1 = (l1 + ' ' + words[i]).trim(); i++; }
  const rest = words.slice(i).join(' ');
  return [l1 || clean, rest || null];
}

export function PlantMapView({ go }: { go: (view: string, param?: string) => void }) {
  const [selUnit, setSelUnit] = useState<MapUnit | null>(null);
  const [selArea, setSelArea] = useState<MapArea | null>(null);
  const [dossierTag, setDossierTag] = useState<string | null>(null);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossier, setDossier] = useState<DossierResp | null>(null);
  const [dossierError, setDossierError] = useState('');
  const [siteMode, setSiteMode] = useState<'sat' | 'schematic'>('sat');

  const openUnit = (u: MapUnit) => { setSelUnit(u); setSelArea(null); };
  const backToSite = () => { setSelUnit(null); setSelArea(null); };
  const backToUnit = () => setSelArea(null);

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

  // ---------- سطح ۳: تجهیزات منطقه ----------
  if (selUnit && selArea) {
    return (
      <div className="space-y-4" data-testid="plant-map-area">
        <Breadcrumb unit={selUnit} area={selArea} onSite={backToSite} onUnit={backToUnit} />
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 flex-wrap">
            <Wrench className="h-5 w-5 text-primary" />
            <h2 className="font-bold">{selArea.name}</h2>
            <span className="chip">{toFa(selArea.equipment.length)} تجهیز</span>
          </div>
          {selArea.desc && <p className="text-sm text-muted-foreground mt-1">{selArea.desc}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {selArea.equipment.map((eq) => (
            <button
              key={eq.tag}
              onClick={() => openDossier(eq.tag)}
              className="text-right rounded-2xl glass p-4 transition-all hover:border-primary/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`باز کردن مدارک تجهیز ${eq.tag}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="code-ltr font-bold text-sm">{eq.tag}</span>
                <span className="chip">{eq.kind}</span>
              </div>
              <div className="text-sm mt-2 leading-6">{eq.name}</div>
              <div className="flex items-center gap-1 text-xs text-primary mt-2">
                <FileText className="h-3.5 w-3.5" /> مشاهدهٔ نقشه‌ها و مدارک <ArrowLeft className="h-3 w-3" />
              </div>
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

  // ---------- سطح ۲: مناطق واحد ----------
  if (selUnit) {
    return (
      <div className="space-y-4" data-testid="plant-map-unit">
        <Breadcrumb unit={selUnit} onSite={backToSite} />
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 flex-wrap">
            <Factory className="h-5 w-5 text-primary" />
            <h2 className="font-bold">{selUnit.name}</h2>
            <span className={`chip ${FAMILY_CHIP[selUnit.family]}`}>{FAMILY_LABELS[selUnit.family]}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{selUnit.desc}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {toFa(selUnit.areas.length)} منطقه · {toFa(unitEquipmentCount(selUnit))} تجهیز ثبت‌شده روی نقشه — برای دیدن تجهیزات روی هر منطقه کلیک کنید.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {selUnit.areas.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelArea(a)}
              className="text-right rounded-2xl glass p-4 transition-all hover:border-primary/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`ورود به منطقهٔ ${a.name}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm">{a.name}</span>
                <MapPin className="h-4 w-4 text-primary shrink-0" />
              </div>
              {a.desc && <div className="text-xs text-muted-foreground mt-1">{a.desc}</div>}
              <div className="text-xs text-muted-foreground mt-2">{toFa(a.equipment.length)} تجهیز</div>
              <div className="flex flex-wrap gap-1 mt-2">
                {a.equipment.slice(0, 3).map((eq) => <span key={eq.tag} className="code-ltr text-[11px] rounded-md bg-accent px-1.5 py-0.5">{eq.tag}</span>)}
                {a.equipment.length > 3 && <span className="text-[11px] text-muted-foreground px-1">…</span>}
              </div>
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

  // ---------- سطح ۱: نقشهٔ سایت ----------
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

      <div className="glass rounded-2xl p-3 sm:p-4 relative">
        {/* نوع نمایش: تصویر ماهواره‌ای واقعی یا شماتیک */}
        <div className="flex items-center gap-1.5 px-1 pb-3" role="tablist" aria-label="نوع نمایش نقشه">
          <Button size="sm" variant={siteMode === 'sat' ? 'default' : 'outline'} onClick={() => setSiteMode('sat')} aria-pressed={siteMode === 'sat'}>
            <Satellite className="h-4 w-4" /> نمای ماهواره‌ای (واقعی)
          </Button>
          <Button size="sm" variant={siteMode === 'schematic' ? 'default' : 'outline'} onClick={() => setSiteMode('schematic')} aria-pressed={siteMode === 'schematic'}>
            <MapIcon className="h-4 w-4" /> نمای شماتیک
          </Button>
        </div>

        {siteMode === 'sat' && (
          <div data-testid="plant-map-sat">
            <div className="relative">
              <img
                src="/plant-map/bipc-satellite.jpg"
                alt="تصویر ماهواره‌ای واقعی منطقهٔ ویژهٔ پتروشیمی ماهشهر (بندر امام) با اسکله‌های صادراتی"
                className="w-full h-auto rounded-xl select-none"
                draggable={false}
              />
              {PLANT_UNITS.map((u) => u.sat && (
                <button
                  key={u.id}
                  onClick={() => openUnit(u)}
                  aria-label={`${u.name} — نمایش مناطق`}
                  title={`${u.name} — ${FAMILY_LABELS[u.family]}`}
                  className="group absolute rounded-lg border-2 border-white/80 bg-white/10 hover:bg-primary/30 hover:border-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ left: `${u.sat.x}%`, top: `${u.sat.y}%`, width: `${u.sat.w}%`, height: `${u.sat.h}%` }}
                >
                  <span className="code-ltr absolute inset-x-0 top-1 mx-auto w-max rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-bold text-white group-hover:bg-primary transition-colors">{u.code}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground leading-5 px-2 pt-2">
              تصویر ماهواره‌ای واقعی منطقهٔ ویژهٔ پتروشیمی ماهشهر — بندر امام (۲۰۲۳) شامل اسکله‌های صادراتی و مخازن؛
              محدودهٔ بلوک‌ها برای ناوبری اسناد تقریبی است. برای چیدمان واضح و دقیق، «نمای شماتیک» را ببینید.
            </p>
          </div>
        )}

        {siteMode === 'schematic' && (
        <svg viewBox="0 0 1000 495" className="w-full h-auto rounded-xl" role="group" aria-label={`نقشهٔ سایت ${PLANT_NAME}`}>
          {/* محوطهٔ سایت */}
          <rect x="20" y="20" width="960" height="470" rx="18" className="fill-muted stroke-border" strokeWidth="2" />
          {/* جاده‌های اصلی */}
          <rect x="20" y="172" width="960" height="22" className="fill-background stroke-border/50" strokeWidth="1" />
          <rect x="20" y="327" width="960" height="22" className="fill-background stroke-border/50" strokeWidth="1" />
          <rect x="332" y="20" width="20" height="470" className="fill-background stroke-border/50" strokeWidth="1" />
          <rect x="712" y="20" width="20" height="470" className="fill-background stroke-border/50" strokeWidth="1" />
          {/* شمال */}
          <g className="fill-muted-foreground" aria-hidden>
            <text x="940" y="48" fontSize="13" textAnchor="middle" className="fill-foreground">شمال</text>
            <Compass x="930" y="56" width="20" height="20" />
          </g>
          {/* فلر — تزئینی */}
          <g aria-hidden>
            <circle cx="905" cy="265" r="9" className="fill-red-500/20 stroke-red-500/70" strokeWidth="2" />
            <Flame x="899" y="259" width="12" height="12" className="text-red-500" />
            <text x="905" y="292" fontSize="12" textAnchor="middle" className="fill-foreground">فلر</text>
          </g>

          {/* واحدها */}
          {PLANT_UNITS.map((u) => {
            const [l1, l2] = splitName(u.name);
            return (
              <g
                key={u.id}
                role="button"
                tabIndex={0}
                aria-label={`${u.name} — نمایش مناطق`}
                className="cursor-pointer group/unit"
                onClick={() => openUnit(u)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openUnit(u); } }}
              >
                <rect
                  x={u.x} y={u.y} width={u.w} height={u.h} rx="12"
                  strokeWidth={2}
                  className={`${FAMILY_CLASSES[u.family]} transition-all focus:outline-none focus-visible:stroke-[4]`}
                />
                <text x={u.x + u.w / 2} y={u.y + 30} textAnchor="middle" fontSize="17" fontWeight="700" className="fill-foreground code-ltr">{u.code}</text>
                <text x={u.x + u.w / 2} y={u.y + 54} textAnchor="middle" fontSize="13" className="fill-foreground">{l1}</text>
                {l2 && <text x={u.x + u.w / 2} y={u.y + 72} textAnchor="middle" fontSize="13" className="fill-foreground">{l2}</text>}
                <text x={u.x + u.w / 2} y={u.y + u.h - 14} textAnchor="middle" fontSize="11" className="fill-muted-foreground">
                  {toFa(u.areas.length)} منطقه · {toFa(unitEquipmentCount(u))} تجهیز
                </text>
              </g>
            );
          })}
        </svg>
        )}

        {/* راهنما */}
        <div className="flex flex-wrap items-center gap-2 px-2 pb-1">
          {(Object.keys(FAMILY_LABELS) as UnitFamily[]).map((f) => (
            <span key={f} className={`chip ${FAMILY_CHIP[f]}`}><Boxes className="h-3 w-3" /> {FAMILY_LABELS[f]}</span>
          ))}
        </div>
      </div>

      {/* فهرست سریع واحدها — موبایل */}
      <div className="md:hidden flex gap-2 overflow-x-auto thin-scroll pb-1" aria-label="دسترسی سریع واحدها">
        {PLANT_UNITS.map((u) => (
          <button key={u.id} onClick={() => openUnit(u)} className="shrink-0 rounded-xl glass px-3 py-2 text-sm whitespace-nowrap hover:border-primary/50">
            <span className="code-ltr font-semibold">{u.code}</span> · {u.name.replace(/^واحد\s+/, '')}
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

function Breadcrumb({ unit, area, onSite, onUnit }: { unit: MapUnit; area?: MapArea; onSite: () => void; onUnit?: () => void }) {
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
            <p className="flex items-center gap-2 text-amber-700 dark:text-amber-400"><CircleAlert className="h-4 w-4" /> مدارکی برای این تجهیز یافت نشد.</p>
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
