'use client';
// ویرایشگر نقشهٔ شماتیک مجتمع — فقط ادمین (تب «نقشهٔ مجتمع» در مدیریت سامانه)
//  · جابجایی بلوک‌ها با کشیدن (drag) و تغییر اندازه با دستگیرهٔ گوشه
//  · افزودن واحد/منطقه/تجهیز، ویرایش نام/کد/توضیح/رنگ، حذف با زیرشاخه‌ها
//  · نمایش/عدم‌نمایش هر گره (گره پنهان برای کاربران عادی دیده نمی‌شود)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  MapPin, Plus, Eye, EyeOff, Pencil, Trash2, Factory, Boxes, Wrench, ChevronLeft, Info, Loader2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { api } from './api';
import { toPersianDigits as toFa } from '@/lib/normalize';
import { MAP_VIEWBOX, MAP_COLORS, MAP_COLOR_LABELS } from '@/lib/plant-map';
import { SiteDecor, MapBlock, svgPointFrom } from './map-canvas';
import type { MapNodeLike } from './map-canvas';

interface NodeRow extends MapNodeLike {
  parentId: string | null;
  desc: string | null;
  visible: boolean;
}

type DragState = {
  id: string;
  mode: 'move' | 'resize';
  sx: number; sy: number; // نقطهٔ شروع در فضای viewBox
  ox: number; oy: number; ow: number; oh: number; // هندسهٔ آغازین
  moved: boolean;
};

const DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  UNIT: { w: 240, h: 110 },
  AREA: { w: 260, h: 120 },
  EQUIPMENT: { w: 230, h: 110 },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// نقطهٔ رنگ نمایشی در انتخابگر — کلاس کامل Tailwind برای JIT
const MAP_DOT_CLASSES: Record<string, string> = {
  primary: 'bg-primary', sky: 'bg-sky-500', cyan: 'bg-cyan-500', emerald: 'bg-emerald-500',
  amber: 'bg-amber-500', violet: 'bg-violet-500', rose: 'bg-rose-500',
};

export function MapEditorTab() {
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [form, setForm] = useState<null | {
    isNew: boolean; id?: string; kind: string; parentId: string | null;
    name: string; code: string; desc: string; color: string; visible: boolean;
    x: number; y: number; w: number; h: number;
  }>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NodeRow | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const nodesRef = useRef<NodeRow[]>([]);
  nodesRef.current = nodes;

  const load = useCallback(() => {
    setLoading(true);
    api<{ nodes: NodeRow[] }>('/api/map')
      .then((r) => setNodes(r.nodes))
      .catch((e) => toast({ title: 'خطا در بارگذاری نقشه', description: (e as Error).message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const parentOfLevel = areaId ?? unitId ?? null; // والدِ گره‌های سطح فعلی
  const children = useMemo(() => nodes.filter((n) => n.parentId === parentOfLevel), [nodes, parentOfLevel]);
  const childCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) if (n.parentId) m.set(n.parentId, (m.get(n.parentId) || 0) + 1);
    return m;
  }, [nodes]);
  const equipmentUnder = useCallback((uid: string) => {
    let c = 0;
    for (const z of nodes.filter((n) => n.parentId === uid)) c += childCount.get(z.id) || 0;
    return c;
  }, [nodes, childCount]);

  const unit = unitId ? byId.get(unitId) || null : null;
  const area = areaId ? byId.get(areaId) || null : null;
  const childKind = areaId ? 'EQUIPMENT' : unitId ? 'AREA' : 'UNIT';
  const ADD_LABEL = childKind === 'UNIT' ? 'واحد جدید' : childKind === 'AREA' ? 'منطقهٔ جدید' : 'تجهیز جدید';

  // ---------- درگ: جابجایی و تغییر اندازه ----------
  const beginDrag = (e: React.PointerEvent, n: NodeRow, mode: 'move' | 'resize') => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // گرفتن پوینتر روی SVG — حرکت حتی خارج از بلوک/بوم هم دنبال می‌شود
    try { svgRef.current?.setPointerCapture(e.pointerId); } catch { }
    const p = svgPointFrom(e, svgRef.current!);
    dragRef.current = { id: n.id, mode, sx: p.x, sy: p.y, ox: n.x, oy: n.y, ow: n.w, oh: n.h, moved: false };
    setDraggingId(n.id);
  };

  const onSvgPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !svgRef.current) return;
    const p = svgPointFrom(e, svgRef.current);
    if (Math.abs(p.x - d.sx) > 3 || Math.abs(p.y - d.sy) > 3) d.moved = true;
    if (!d.moved) return;
    setNodes((prev) => prev.map((m) => {
      if (m.id !== d.id) return m;
      if (d.mode === 'move') {
        return { ...m, x: Math.round(clamp(d.ox + p.x - d.sx, 0, MAP_VIEWBOX.w - m.w)), y: Math.round(clamp(d.oy + p.y - d.sy, 0, MAP_VIEWBOX.h - m.h)) };
      }
      return {
        ...m,
        w: Math.round(clamp(d.ow + p.x - d.sx, 90, MAP_VIEWBOX.w - m.x)),
        h: Math.round(clamp(d.oh + p.y - d.sy, 60, MAP_VIEWBOX.h - m.y)),
      };
    }));
  };

  const onSvgPointerUp = async () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDraggingId(null);
    if (!d) return;
    if (!d.moved) {
      // کلیک ساده: انتخاب بلوک (نمایش دستگیرهٔ تغییر اندازه)؛ کلیک دوباره روی همان بلوک → ویرایش
      if (selId !== d.id) setSelId(d.id);
      else {
        const n = nodesRef.current.find((m) => m.id === d.id);
        if (n) openEdit(n);
      }
      return;
    }
    const n = nodesRef.current.find((m) => m.id === d.id);
    if (!n) return;
    try {
      await api('/api/map', { method: 'PATCH', json: d.mode === 'move' ? { id: d.id, x: n.x, y: n.y } : { id: d.id, w: n.w, h: n.h } });
      toast({ title: 'ذخیره شد', description: `${n.name} — ${d.mode === 'move' ? 'محل بلوک' : 'اندازهٔ بلوک'} به‌روزرسانی شد.` });
    } catch (e) {
      toast({ title: 'ذخیرهٔ موقعیت ناموفق', description: (e as Error).message, variant: 'destructive' });
      load();
    }
  };

  // ---------- فرم افزودن/ویرایش ----------
  const openCreate = () => {
    const i = children.length;
    const size = DEFAULT_SIZE[childKind];
    setForm({
      isNew: true, kind: childKind, parentId: parentOfLevel,
      name: '', code: '', desc: '', color: childKind === 'EQUIPMENT' ? 'primary' : (children[i - 1]?.color || 'primary'),
      visible: true,
      x: 60 + (i % 3) * 330, y: 80 + Math.floor(i / 3) * 190,
      w: size.w, h: size.h,
    });
  };

  const openEdit = (n: NodeRow) => {
    setSelId(n.id);
    setForm({
      isNew: false, id: n.id, kind: n.kind, parentId: n.parentId,
      name: n.name, code: n.code || '', desc: n.desc || '', color: n.color, visible: n.visible,
      x: n.x, y: n.y, w: n.w, h: n.h,
    });
  };
  const saveForm = async () => {
    if (!form) return;
    if (!form.name.trim()) { toast({ title: 'نقص اطلاعات', description: 'نام گره الزامی است.', variant: 'destructive' }); return; }
    if (form.isNew && form.kind === 'EQUIPMENT' && !form.code.trim()) {
      toast({ title: 'نقص اطلاعات', description: 'برای تجهیز، کد/تگ الزامی است (کلید پیوند اسناد).', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      if (form.isNew) {
        await api('/api/map', {
          method: 'POST',
          json: { kind: form.kind, parentId: form.parentId, name: form.name, code: form.code || null, desc: form.desc || null, color: form.color, x: form.x, y: form.y, w: form.w, h: form.h },
        });
        toast({ title: 'افزوده شد', description: `${form.name} روی نقشه ساخته شد.` });
      } else {
        await api('/api/map', {
          method: 'PATCH',
          json: { id: form.id, name: form.name, code: form.code || null, desc: form.desc || null, color: form.color, visible: form.visible, x: form.x, y: form.y, w: form.w, h: form.h },
        });
        toast({ title: 'ذخیره شد', description: 'تغییرات گره اعمال شد.' });
      }
      setForm(null); setSelId(null);
      load();
    } catch (e) {
      toast({ title: 'ذخیره ناموفق', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const toggleVisible = async (n: NodeRow) => {
    try {
      await api('/api/map', { method: 'PATCH', json: { id: n.id, visible: !n.visible } });
      setNodes((prev) => prev.map((m) => (m.id === n.id ? { ...m, visible: !m.visible } : m)));
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const r = await api<{ deleted: number }>(`/api/map?id=${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' });
      toast({ title: 'حذف شد', description: `${deleteTarget.name} و ${toFa(r.deleted - 1)} زیرشاخهٔ آن از نقشه حذف شد.` });
      // اگر گره حذف‌شده در مسیر ناوبری فعلی است، یک سطح بالا برو
      if (deleteTarget.id === areaId) setAreaId(null);
      if (deleteTarget.id === unitId) { setAreaId(null); setUnitId(null); }
      setDeleteTarget(null); setSelId(null);
      load();
    } catch (e) {
      toast({ title: 'حذف ناموفق', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  if (loading) {
    return <div className="rounded-xl border p-8 flex items-center justify-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin ml-2" /> در حال بارگذاری نقشه…</div>;
  }

  return (
    <div className="space-y-4" data-testid="map-editor">
      {/* راهنما و افزودن */}
      <div className="rounded-xl border bg-muted/30 p-3 flex items-start gap-2 flex-wrap justify-between">
        <p className="text-xs leading-5 flex items-start gap-1.5 text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          بلوک را <b>بکشید</b> تا جابجا شود · <b>کلیک</b> بلوک را انتخاب می‌کند (دستگیرهٔ گوشه = تغییر اندازه) · <b>کلیک دوباره</b> = ویرایش · چشم در فهرست = نمایش/عدم‌نمایش
        </p>
        <Button size="sm" onClick={openCreate} data-testid="map-add-node">
          <Plus className="h-4 w-4" /> {ADD_LABEL}
        </Button>
      </div>

      {/* نان‌بری ویرایشگر */}
      <nav aria-label="مسیر ویرایش نقشه" className="flex items-center gap-1 flex-wrap text-sm">
        <button onClick={() => { setUnitId(null); setAreaId(null); setSelId(null); }} className={`rounded-lg px-2 py-1 hover:bg-accent flex items-center gap-1 ${!unitId ? 'bg-accent font-medium' : ''}`}>
          <MapPin className="h-4 w-4 text-primary" /> سایت مجتمع
        </button>
        {unit && (
          <>
            <ChevronLeft className="h-4 w-4 text-muted-foreground" aria-hidden />
            <button onClick={() => { setAreaId(null); setSelId(null); }} className={`rounded-lg px-2 py-1 hover:bg-accent ${!areaId ? 'bg-accent font-medium' : ''}`}>
              {unit.name}
            </button>
          </>
        )}
        {area && (
          <>
            <ChevronLeft className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="px-2 py-1 rounded-lg bg-accent font-medium">{area.name}</span>
          </>
        )}
      </nav>

      {/* بوم ویرایش */}
      <div className="glass rounded-2xl p-3 sm:p-4">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${MAP_VIEWBOX.w} ${MAP_VIEWBOX.h}`}
          className="w-full h-auto rounded-xl touch-none select-none"
          data-testid="map-editor-canvas"
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onPointerLeave={onSvgPointerUp}
        >
          {!areaId && <SiteDecor />}
          {children.map((n) => (
            <MapBlock
              key={n.id}
              node={n}
              selected={selId === n.id || draggingId === n.id}
              dimmed={!n.visible}
              showHandle={selId === n.id}
              meta={
                n.kind === 'UNIT'
                  ? `${toFa(childCount.get(n.id) || 0)} منطقه · ${toFa(equipmentUnder(n.id))} تجهیز`
                  : n.kind === 'AREA'
                    ? `${toFa(childCount.get(n.id) || 0)} تجهیز`
                    : n.desc || undefined
              }
              onPointerDown={(e) => beginDrag(e, n, 'move')}
              onHandlePointerDown={(e) => beginDrag(e, n, 'resize')}
            />
          ))}
        </svg>
      </div>

      {/* فهرست گره‌های همین سطح — نمایش/عدم‌نمایش و میان‌بر ویرایش/حذف */}
      <div className="space-y-1.5" data-testid="map-editor-list">
        {children.length === 0 && (
          <p className="text-sm text-muted-foreground px-1">گره‌ای در این سطح نیست — با دکمهٔ «{ADD_LABEL}» اولین بلوک را بسازید.</p>
        )}
        {children.map((n) => (
          <div key={n.id} className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${n.visible ? '' : 'opacity-60'}`}>
            <button className="flex items-center gap-2 min-w-0 text-right flex-1 hover:bg-accent rounded-lg px-1 py-0.5" onClick={() => { if (n.kind !== 'EQUIPMENT') { if (n.kind === 'UNIT') { setUnitId(n.id); setAreaId(null); } else { setAreaId(n.id); } setSelId(null); } else { openEdit(n); } }} title={n.kind === 'EQUIPMENT' ? 'ویرایش' : 'ورود و ویرایش فرزندان'}>
              {n.kind === 'UNIT' ? <Factory className="h-4 w-4 text-primary shrink-0" /> : n.kind === 'AREA' ? <Boxes className="h-4 w-4 text-primary shrink-0" /> : <Wrench className="h-4 w-4 text-primary shrink-0" />}
              {n.code && <span className="code-ltr text-xs font-bold bg-accent rounded px-1.5 py-0.5 shrink-0">{n.code}</span>}
              <span className="text-sm truncate">{n.name}</span>
              {!n.visible && <span className="chip shrink-0">پنهان</span>}
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="icon" variant="ghost" title={n.visible ? 'عدم نمایش برای کاربران' : 'نمایش برای کاربران'} onClick={() => toggleVisible(n)} aria-label={n.visible ? `پنهان کردن ${n.name}` : `نمایش ${n.name}`}>
                {n.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
              </Button>
              <Button size="icon" variant="ghost" title="ویرایش" onClick={() => openEdit(n)} aria-label={`ویرایش ${n.name}`}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" title="حذف با زیرشاخه‌ها" className="text-red-600 hover:text-red-700 hover:bg-red-500/10" onClick={() => setDeleteTarget(n)} aria-label={`حذف ${n.name}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* دیالوگ افزودن/ویرایش گره */}
      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto thin-scroll" data-testid="map-node-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {form?.isNew ? <Plus className="h-5 w-5 text-primary" /> : <Pencil className="h-5 w-5 text-primary" />}
              {form?.isNew ? ADD_LABEL : 'ویرایش گرهٔ نقشه'}
            </DialogTitle>
            <DialogDescription>
              {form?.kind === 'UNIT' ? 'بلوک واحد در نمای سایت' : form?.kind === 'AREA' ? 'بلوک منطقه داخل واحد' : 'بلوک تجهیز داخل منطقه — کد/تگ کلید پیوند اسناد است'}
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>نام</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: واحد بازیافت گاز" />
              </div>
              <div className="space-y-1.5">
                <Label>کد / تگ {form.kind === 'EQUIPMENT' && <span className="text-red-600">*</span>}</Label>
                <Input dir="ltr" className="text-left code-ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={form.kind === 'UNIT' ? 'OLF' : 'H-101A'} />
              </div>
              <div className="space-y-1.5">
                <Label>رنگ بلوک</Label>
                <Select value={form.color} onValueChange={(v) => setForm({ ...form, color: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MAP_COLORS.map((c) => (
                      <SelectItem key={c} value={c}>
                        <span className="inline-flex items-center gap-2">
                          <span className={`inline-block h-3 w-3 rounded-full ${MAP_DOT_CLASSES[c]}`} />
                          {MAP_COLOR_LABELS[c]}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>توضیح کوتاه (زیر نام در بلوک)</Label>
                <Input value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
              </div>

              {!form.isNew && (
                <div className="col-span-2 flex items-center justify-between rounded-xl border px-3 py-2.5">
                  <div className="space-y-0.5">
                    <Label htmlFor="map-node-visible">نمایش برای کاربران</Label>
                    <p className="text-xs text-muted-foreground">با خاموش کردن، گره (و مسیر ورود به آن) از دید کاربران عادی پنهان می‌شود.</p>
                  </div>
                  <Switch id="map-node-visible" checked={form.visible} onCheckedChange={(v) => setForm({ ...form, visible: v })} />
                </div>
              )}

              <div className="col-span-2 grid grid-cols-4 gap-2">
                {(['x', 'y', 'w', 'h'] as const).map((k) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-xs">{k === 'x' ? 'موقعیت X' : k === 'y' ? 'موقعیت Y' : k === 'w' ? 'عرض' : 'ارتفاع'}</Label>
                    <Input dir="ltr" type="number" className="text-left h-9" value={Math.round(form[k])} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) || 0 })} />
                  </div>
                ))}
              </div>
              <p className="col-span-2 text-[11px] text-muted-foreground">مختصات در بوم ۱۰۰۰×{toFa(MAP_VIEWBOX.h)} است؛ می‌توانید بلوک را مستقیم روی بوم بکشید.</p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {form && !form.isNew && (
              <Button variant="destructive" className="ml-auto" onClick={() => { const n = byId.get(form.id!); if (n) { setForm(null); setDeleteTarget(n); } }}>
                <Trash2 className="h-4 w-4" /> حذف
              </Button>
            )}
            <Button variant="outline" onClick={() => setForm(null)}>انصراف</Button>
            <Button onClick={saveForm} disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأیید حذف */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md" data-testid="map-delete-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400"><Trash2 className="h-5 w-5" /> حذف گرهٔ نقشه</DialogTitle>
            <DialogDescription>
              «{deleteTarget?.name}» و تمام زیرشاخه‌های آن (مناطق و تجهیزات) از نقشه حذف می‌شوند. اسناد حذف نمی‌شوند اما پیوند نقشه از بین می‌رود.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>انصراف</Button>
            <Button variant="destructive" onClick={doDelete} disabled={busy}>{busy ? 'در حال حذف…' : 'حذف قطعی'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
