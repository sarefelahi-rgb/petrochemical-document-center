'use client';
// اجزای مشترک نقشهٔ شماتیک — بین نمای کاربر (plant-map-view) و ویرایشگر ادمین (map-editor)
// پس‌زمینهٔ تزئینی سایت، بلوک کلیک‌پذیر، پالت رنگ و کمکی‌های متن
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Compass, Flame } from 'lucide-react';
import { MAP_VIEWBOX } from '@/lib/plant-map';

export interface MapNodeLike {
  id: string;
  kind: string; // UNIT | AREA | EQUIPMENT
  code: string | null;
  name: string;
  x: number; y: number; w: number; h: number;
  color: string;
}

// کلاس‌های رنگ بلوک — باید رشته‌های کامل Tailwind باشند (JIT آن‌ها را می‌بیند)
export const MAP_BLOCK_CLASSES: Record<string, string> = {
  primary: 'fill-primary/10 stroke-primary/60 hover:fill-primary/25 dark:stroke-primary/70',
  sky: 'fill-sky-500/10 stroke-sky-600/60 hover:fill-sky-500/25 dark:stroke-sky-400/70',
  cyan: 'fill-cyan-500/10 stroke-cyan-600/60 hover:fill-cyan-500/25 dark:stroke-cyan-400/70',
  emerald: 'fill-emerald-500/10 stroke-emerald-600/60 hover:fill-emerald-500/25 dark:stroke-emerald-400/70',
  amber: 'fill-amber-500/10 stroke-amber-600/60 hover:fill-amber-500/25 dark:stroke-amber-400/70',
  violet: 'fill-violet-500/10 stroke-violet-600/60 hover:fill-violet-500/25 dark:stroke-violet-400/70',
  rose: 'fill-rose-500/10 stroke-rose-600/60 hover:fill-rose-500/25 dark:stroke-rose-400/70',
};

export const MAP_CHIP_CLASSES: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  sky: 'bg-sky-600/10 text-sky-800 dark:text-sky-300',
  cyan: 'bg-cyan-600/10 text-cyan-800 dark:text-cyan-300',
  emerald: 'bg-emerald-600/10 text-emerald-800 dark:text-emerald-300',
  amber: 'bg-amber-600/10 text-amber-800 dark:text-amber-300',
  violet: 'bg-violet-600/10 text-violet-800 dark:text-violet-300',
  rose: 'bg-rose-600/10 text-rose-800 dark:text-rose-300',
};

/** شکستن نام به حداکثر دو خط برای متن داخل بلوک */
export function splitName(name: string): [string, string | null] {
  const clean = name.replace(/^واحد\s+/, '');
  if (clean.length <= 20) return [clean, null];
  const words = clean.split(' ');
  let l1 = '';
  let i = 0;
  while (i < words.length && (l1 + ' ' + words[i]).trim().length <= 20) { l1 = (l1 + ' ' + words[i]).trim(); i++; }
  const rest = words.slice(i).join(' ');
  return [l1 || clean, rest || null];
}

/** پس‌زمینهٔ تزئینی سطح سایت: محوطه، جاده‌ها، شمال و فلر — ثابت و غیرکلیک‌پذیر */
export function SiteDecor() {
  return (
    <g aria-hidden>
      {/* محوطهٔ سایت */}
      <rect x="20" y="20" width={MAP_VIEWBOX.w - 40} height={MAP_VIEWBOX.h - 40} rx="18" className="fill-muted stroke-border" strokeWidth="2" />
      {/* جاده‌های اصلی */}
      <rect x="20" y="172" width={MAP_VIEWBOX.w - 40} height="22" className="fill-background stroke-border/50" strokeWidth="1" />
      <rect x="20" y="327" width={MAP_VIEWBOX.w - 40} height="22" className="fill-background stroke-border/50" strokeWidth="1" />
      <rect x="332" y="20" width="20" height={MAP_VIEWBOX.h - 40} className="fill-background stroke-border/50" strokeWidth="1" />
      <rect x="712" y="20" width="20" height={MAP_VIEWBOX.h - 40} className="fill-background stroke-border/50" strokeWidth="1" />
      {/* شمال */}
      <g className="fill-muted-foreground">
        <text x="940" y="48" fontSize="13" textAnchor="middle" className="fill-foreground select-none">شمال</text>
        <Compass x="930" y="56" width="20" height="20" />
      </g>
      {/* فلر */}
      <g>
        <circle cx="905" cy="265" r="9" className="fill-red-500/20 stroke-red-500/70" strokeWidth="2" />
        <Flame x="899" y="259" width="12" height="12" className="text-red-500" />
        <text x="905" y="292" fontSize="12" textAnchor="middle" className="fill-foreground select-none">فلر</text>
      </g>
    </g>
  );
}

/** بلوک نقشه — مستطیل گردگوشه با کد، نام (حداکثر دو خط) و متن پایه اختیاری */
export function MapBlock({
  node, selected = false, dimmed = false, interactive = true, meta, showHandle = false,
  onPointerDown, onHandlePointerDown, onClick, ariaLabel,
}: {
  node: MapNodeLike;
  selected?: boolean;
  dimmed?: boolean; // گره پنهان‌شده — در ویرایشگر با شفافیت و خط‌چین دیده می‌شود
  interactive?: boolean;
  meta?: string;
  showHandle?: boolean; // دستگیرهٔ تغییر اندازه (فقط ویرایشگر)
  onPointerDown?: (e: ReactPointerEvent) => void;
  onHandlePointerDown?: (e: ReactPointerEvent) => void;
  onClick?: (e: ReactMouseEvent) => void;
  ariaLabel?: string;
}) {
  const cls = MAP_BLOCK_CLASSES[node.color] || MAP_BLOCK_CLASSES.primary;
  const [l1, l2] = splitName(node.name);
  const showCode = !!node.code && node.code !== node.name;
  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      data-node-id={node.id}
      role={interactive && onClick ? 'button' : undefined}
      tabIndex={interactive && onClick ? 0 : undefined}
      aria-label={ariaLabel || (interactive && onClick ? `${node.name}${node.code ? ` (${node.code})` : ''}` : undefined)}
      className={`${interactive ? 'cursor-pointer' : ''} group/node focus:outline-none`}
      opacity={dimmed ? 0.35 : undefined}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onKeyDown={onClick ? (e: ReactKeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (onClick as unknown as (ev: unknown) => void)(e); } } : undefined}
    >
      <rect
        width={node.w} height={node.h} rx="12"
        strokeWidth={selected ? 4 : 2}
        strokeDasharray={dimmed ? '6 4' : undefined}
        className={`${cls} transition-all focus:outline-none`}
      />
      {showCode && (
        <text x={node.w / 2} y="30" textAnchor="middle" fontSize="17" fontWeight="700" className="fill-foreground code-ltr select-none" style={{ pointerEvents: 'none' }}>{node.code}</text>
      )}
      <text x={node.w / 2} y={showCode ? 54 : 42} textAnchor="middle" fontSize="13" className="fill-foreground select-none" style={{ pointerEvents: 'none' }}>{l1}</text>
      {l2 && (
        <text x={node.w / 2} y={showCode ? 72 : 60} textAnchor="middle" fontSize="13" className="fill-foreground select-none" style={{ pointerEvents: 'none' }}>{l2}</text>
      )}
      {meta && (
        <text x={node.w / 2} y={node.h - 14} textAnchor="middle" fontSize="11" className="fill-muted-foreground select-none" style={{ pointerEvents: 'none' }}>{meta}</text>
      )}
      {showHandle && (
        <circle
          cx={node.w} cy={node.h} r="9"
          className="fill-primary stroke-background cursor-nwse-resize"
          strokeWidth="2.5"
          data-handle-for={node.id}
          onPointerDown={onHandlePointerDown}
        />
      )}
      {selected && (
        <rect
          x="0" y="0" width={node.w} height={node.h} rx="12"
          fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5"
          className="text-primary pointer-events-none"
        />
      )}
    </g>
  );
}

/** تبدیل مختصات رویداد پوینتر به فضای viewBox — مشترک بین درگ و جای‌گذاری */
export function svgPointFrom(e: { clientX: number; clientY: number }, svg: SVGSVGElement): { x: number; y: number } {
  const r = svg.getBoundingClientRect();
  const scale = MAP_VIEWBOX.w / Math.max(1, r.width);
  return { x: (e.clientX - r.left) * scale, y: (e.clientY - r.top) * scale };
}
