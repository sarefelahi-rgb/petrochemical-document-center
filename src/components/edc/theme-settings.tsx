'use client';
// تنظیمات ظاهری — انتخاب رنگ سازمانی، فونت و اندازهٔ متن
// تنظیمات در localStorage ذخیره و بلافاصله روی متغیرهای CSS اعمال می‌شود.
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Check } from 'lucide-react';
import { COLOR_OPTIONS, FONT_OPTIONS, SIZE_OPTIONS, LS_KEYS, applyThemeFromStorage } from '@/lib/theme';

export function ThemeSettings({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  // فقط هنگام باز بودن سوار می‌شود (رندر شرطی در والد) — پس خواندن حافظه در مقدار اولیه امن است
  const read = (key: string, dflt: string): string => {
    try { return localStorage.getItem(key) || dflt; } catch { return dflt; }
  };
  const [colorId, setColorId] = useState(() => read(LS_KEYS.color, 'blue'));
  const [fontId, setFontId] = useState(() => read(LS_KEYS.font, 'vazir'));
  const [sizeId, setSizeId] = useState(() => read(LS_KEYS.size, 'medium'));

  const pickColor = (id: string) => {
    setColorId(id);
    try { localStorage.setItem(LS_KEYS.color, id); } catch { }
    applyThemeFromStorage();
  };
  const pickFont = (id: string) => {
    setFontId(id);
    try { localStorage.setItem(LS_KEYS.font, id); } catch { }
    applyThemeFromStorage();
  };
  const pickSize = (id: string) => {
    setSizeId(id);
    try { localStorage.setItem(LS_KEYS.size, id); } catch { }
    applyThemeFromStorage();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto thin-scroll">
        <DialogHeader>
          <DialogTitle>تنظیمات ظاهری</DialogTitle>
          <DialogDescription>رنگ سازمانی، فونت و اندازهٔ متن را به سلیقهٔ خود انتخاب کنید؛ تنظیمات ذخیره می‌شود.</DialogDescription>
        </DialogHeader>

        <section aria-label="رنگ سازمانی" className="space-y-2">
          <h3 className="text-sm font-semibold">رنگ سازمانی</h3>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="انتخاب رنگ">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c.id}
                role="radio"
                aria-checked={colorId === c.id}
                onClick={() => pickColor(c.id)}
                className={`group rounded-xl border p-2 flex flex-col items-center gap-1.5 transition-all hover:border-primary/60 ${colorId === c.id ? 'border-primary ring-2 ring-ring/40' : ''}`}
              >
                <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-sm" style={{ background: c.swatch }}>
                  {colorId === c.id && <Check className="h-4 w-4" />}
                </span>
                <span className="text-[11px] leading-4 text-center">{c.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="فونت" className="space-y-2">
          <h3 className="text-sm font-semibold">فونت</h3>
          <div className="space-y-1.5" role="radiogroup" aria-label="انتخاب فونت">
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.id}
                role="radio"
                aria-checked={fontId === f.id}
                onClick={() => pickFont(f.id)}
                className={`w-full rounded-xl border px-3 py-2.5 flex items-center justify-between transition-all hover:border-primary/60 ${fontId === f.id ? 'border-primary ring-2 ring-ring/40' : ''}`}
              >
                <span className="text-sm" style={{ fontFamily: f.stack }}>نمونه: مرکز هوشمند اسناد ۱۲۳ ABC</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {f.label}
                  {fontId === f.id && <Check className="h-4 w-4 text-primary" />}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="اندازهٔ متن" className="space-y-2">
          <h3 className="text-sm font-semibold">اندازهٔ متن</h3>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="اندازهٔ متن">
            {SIZE_OPTIONS.map((s) => (
              <button
                key={s.id}
                role="radio"
                aria-checked={sizeId === s.id}
                onClick={() => pickSize(s.id)}
                className={`rounded-xl border py-2.5 text-sm transition-all hover:border-primary/60 ${sizeId === s.id ? 'border-primary bg-primary/10 ring-2 ring-ring/40 font-semibold' : ''}`}
              >
                {s.label} <span className="text-[11px] text-muted-foreground">({s.px}پیکسل)</span>
              </button>
            ))}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
