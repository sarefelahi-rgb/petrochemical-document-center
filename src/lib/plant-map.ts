// نقشهٔ شماتیک تعاملی مجتمع پتروشیمی بندر امام خمینی (رئیسی)
// سه سطح: واحد → منطقه → تجهیز → باز شدن اسناد و نقشه‌های مربوط (از طریق /api/dossier)
// چیدمان بلوک‌ها شماتیک است (نه نقشهٔ برداشت دقیق) و برای ناوبری اسناد طراحی شده است.

export interface MapEquipment {
  tag: string;   // شناسهٔ تجهیز — کلید اتصال به اسناد (AssetTag/DocLink)
  name: string;  // نام توصیفی
  kind: string;  // نوع تجهیز به فارسی (تلمبه، کمپرسور، ...)
}

export interface MapArea {
  id: string;
  name: string;
  desc?: string;
  equipment: MapEquipment[];
}

export type UnitFamily = 'olefin' | 'aromatic' | 'utility' | 'tank';

export interface MapUnit {
  id: string;
  code: string;   // کد کوتاه روی نقشه
  name: string;   // نام کامل واحد
  desc: string;
  family: UnitFamily;
  x: number; y: number; w: number; h: number; // موقعیت بلوک در viewBox
  areas: MapArea[];
}

export const FAMILY_LABELS: Record<UnitFamily, string> = {
  olefin: 'الفین و پلیمرها',
  aromatic: 'آروماتیک‌ها',
  utility: 'یوتیلیتی و سرویس‌ها',
  tank: 'مخازن و صادرات',
};

export const PLANT_NAME = 'پتروشیمی بندر امام خمینی (رئیسی)';

export const PLANT_UNITS: MapUnit[] = [
  {
    id: 'olf', code: 'OLF', name: 'واحد الفین (اتیلن و پروپیلن)', family: 'olefin',
    desc: 'قلب مجتمع — کرکینگ نفتا و تولید اتیلن/پروپیلن',
    x: 45, y: 50, w: 280, h: 115,
    areas: [
      { id: 'olf-fur', name: 'کوره‌های کرکینگ', desc: 'پیرولیز نفتا در دمای بالا', equipment: [
        { tag: 'H-101A', name: 'کوره کرکینگ «الف»', kind: 'کوره' },
        { tag: 'H-101B', name: 'کوره کرکینگ «ب»', kind: 'کوره' },
        { tag: 'D-102', name: 'درام کوئنچ گاز کرک', kind: 'درام' },
      ] },
      { id: 'olf-comp', name: 'فشردن گاز کرک', desc: 'کمپرسورهای پنج‌مرحله‌ای و مبردها', equipment: [
        { tag: 'C-201', name: 'کمپرسور گاز کرک', kind: 'کمپرسور' },
        { tag: 'C-301', name: 'کمپرسور اتیلن مبرد', kind: 'کمپرسور' },
        { tag: 'C-351', name: 'کمپرسور پروپیلن مبرد', kind: 'کمپرسور' },
      ] },
      { id: 'olf-cold', name: 'بخش سرد و بازیابی', desc: 'جداسازی کرایوژنیک و برج‌ها', equipment: [
        { tag: 'T-401', name: 'برج دمتانایزر', kind: 'برج تقطیر' },
        { tag: 'T-402', name: 'برج دی‌اتانایزر', kind: 'برج تقطیر' },
        { tag: 'E-418', name: 'مبدل سرد کریوژنیک', kind: 'مبدل حرارتی' },
      ] },
    ],
  },
  {
    id: 'ldpe', code: 'LDPE', name: 'واحد پلی‌اتیلن سبک', family: 'olefin',
    desc: 'پلیمریزاسیون اتیلن فشاربالا (اتوکلاو)',
    x: 350, y: 50, w: 170, h: 115,
    areas: [
      { id: 'ldpe-comp', name: 'فشردن تغذیه', equipment: [
        { tag: 'C-1101', name: 'کمپرسور ثانویه اتیلن', kind: 'کمپرسور' },
        { tag: 'E-1102', name: 'خنک‌کن گاز تغذیه', kind: 'مبدل حرارتی' },
      ] },
      { id: 'ldpe-reactor', name: 'راکتور اتوکلاو', equipment: [
        { tag: 'R-1201', name: 'راکتور اتوکلاو پلیمریزاسیون', kind: 'راکتور' },
        { tag: 'D-1202', name: 'جداکننده فشاربالا', kind: 'درام' },
      ] },
      { id: 'ldpe-extr', name: 'اکستروژن و بارگیری', equipment: [
        { tag: 'X-1301', name: 'اکسترودر پلی‌اتیلن', kind: 'اکسترودر' },
        { tag: 'P-1302', name: 'تلمبه پودر', kind: 'تلمبه' },
      ] },
    ],
  },
  {
    id: 'hdpe', code: 'HDPE', name: 'واحد پلی‌اتیلن سنگین', family: 'olefin',
    desc: 'پلیمریزاسیون با کاتالیزور زیگلر-ناتا (راکتور لوپ)',
    x: 540, y: 50, w: 170, h: 115,
    areas: [
      { id: 'hdpe-loop', name: 'راکتور لوپ', equipment: [
        { tag: 'R-2101', name: 'راکتور لوپ', kind: 'راکتور' },
        { tag: 'C-2201', name: 'کمپرسور سیرکولاسیون', kind: 'کمپرسور' },
      ] },
      { id: 'hdpe-sep', name: 'جداکننده و بازیافت', equipment: [
        { tag: 'D-2202', name: 'جداکننده فشاربالا', kind: 'درام' },
        { tag: 'C-2301', name: 'کمپرسور بازیافت اتان', kind: 'کمپرسور' },
      ] },
      { id: 'hdpe-extr', name: 'اکستروژن', equipment: [
        { tag: 'X-2301', name: 'اکسترودر پلی‌اتیلن', kind: 'اکسترودر' },
        { tag: 'P-2302', name: 'تلمبه اسلری', kind: 'تلمبه' },
      ] },
    ],
  },
  {
    id: 'pp', code: 'PP', name: 'واحد پلی‌پروپیلن', family: 'olefin',
    desc: 'پلیمریزاسیون پروپیلن در راکتور حلقه‌ای',
    x: 730, y: 50, w: 170, h: 115,
    areas: [
      { id: 'pp-loop', name: 'راکتور حلقه', equipment: [
        { tag: 'R-3101', name: 'راکتور حلقه‌ای', kind: 'راکتور' },
        { tag: 'C-3201', name: 'کمپرسور سیرکولاسیون', kind: 'کمپرسور' },
      ] },
      { id: 'pp-dry', name: 'خشک‌کن و احیاء', equipment: [
        { tag: 'D-3202', name: 'درام خشک‌کن پودر', kind: 'درام' },
        { tag: 'E-3210', name: 'خنک‌کن نیتروژن', kind: 'مبدل حرارتی' },
      ] },
      { id: 'pp-extr', name: 'اکستروژن', equipment: [
        { tag: 'X-3301', name: 'اکسترودر پلی‌پروپیلن', kind: 'اکسترودر' },
        { tag: 'P-3310', name: 'تلمبه پودر', kind: 'تلمبه' },
      ] },
    ],
  },
  {
    id: 'eoeg', code: 'EO/EG', name: 'واحد اتیلن اکساید و گلیکول', family: 'olefin',
    desc: 'اکسیداسیون اتیلن و تولید مونو/دی‌اتیلن گلیکول',
    x: 45, y: 205, w: 200, h: 115,
    areas: [
      { id: 'eoeg-ox', name: 'اکسیداسیون', equipment: [
        { tag: 'R-4101', name: 'راکتور اکسیداسیون اتیلن', kind: 'راکتور' },
        { tag: 'C-4102', name: 'کمپرسور گاز چرخشی', kind: 'کمپرسور' },
      ] },
      { id: 'eoeg-co2', name: 'جذب و بازیابی CO2', equipment: [
        { tag: 'T-4201', name: 'برج جذب دی‌اکسیدکربن', kind: 'برج تقطیر' },
        { tag: 'P-4205', name: 'تلمبه محلول کربنات', kind: 'تلمبه' },
      ] },
      { id: 'eoeg-eg', name: 'تولید گلیکول', equipment: [
        { tag: 'R-4301', name: 'راکتور آب‌پختی گلیکول', kind: 'راکتور' },
        { tag: 'T-4305', name: 'برج تقطیر MEG', kind: 'برج تقطیر' },
      ] },
    ],
  },
  {
    id: 'aro', code: 'ARO', name: 'واحد آرامات‌ها', family: 'aromatic',
    desc: 'ریفرمینگ کاتالیستی و تولید بنزین/تولوئن/زایلن',
    x: 270, y: 205, w: 190, h: 115,
    areas: [
      { id: 'aro-ref', name: 'ریفرمینگ کاتالیستی', equipment: [
        { tag: 'H-5101', name: 'کوره ریفرمینگ', kind: 'کوره' },
        { tag: 'R-5102', name: 'راکتور ریفرمر', kind: 'راکتور' },
      ] },
      { id: 'aro-dist', name: 'تقطیر آرامات‌ها', equipment: [
        { tag: 'T-5201', name: 'برج بازیابی بنزین', kind: 'برج تقطیر' },
        { tag: 'T-5202', name: 'برج تولوئن', kind: 'برج تقطیر' },
      ] },
      { id: 'aro-ext', name: 'استخراج با حلال', equipment: [
        { tag: 'E-5301', name: 'برج استخراج سولفولان', kind: 'مبدل/استخراجور' },
        { tag: 'P-5302', name: 'تلمبه حلال', kind: 'تلمبه' },
      ] },
    ],
  },
  {
    id: 'px', code: 'PX', name: 'واحد پارازایلین', family: 'aromatic',
    desc: 'جداسازی پارازایلین با جذب و بلورسازی',
    x: 485, y: 205, w: 190, h: 115,
    areas: [
      { id: 'px-abs', name: 'جذب و جداسازی', equipment: [
        { tag: 'E-6101', name: 'مبدل واحد جذب', kind: 'مبدل حرارتی' },
        { tag: 'P-6102', name: 'تلمبه خوراک', kind: 'تلمبه' },
      ] },
      { id: 'px-iso', name: 'ایزومریزاسیون', equipment: [
        { tag: 'R-6201', name: 'راکتور ایزومریزاسیون', kind: 'راکتور' },
        { tag: 'H-6202', name: 'هیتر ورودی راکتور', kind: 'کوره' },
      ] },
      { id: 'px-cry', name: 'بلورسازی', equipment: [
        { tag: 'CR-6301', name: 'بلورساز پارازایلین', kind: 'بلورساز' },
        { tag: 'X-6302', name: 'سانتریفیوژ جداسازی جامد', kind: 'سانتریفیوژ' },
      ] },
    ],
  },
  {
    id: 'ut', code: 'UT', name: 'یوتیلیتی و سرویس‌های جانبی', family: 'utility',
    desc: 'بخار، برق، آب خنک‌کن، هوای ابزار و نیتروژن',
    x: 45, y: 360, w: 280, h: 120,
    areas: [
      { id: 'ut-steam', name: 'تولید بخار و برق', equipment: [
        { tag: 'B-7001', name: 'دیگ بخار شمارهٔ ۱', kind: 'دیگ بخار' },
        { tag: 'B-7002', name: 'دیگ بخار شمارهٔ ۲', kind: 'دیگ بخار' },
        { tag: 'TB-7003', name: 'توربوژنراتور', kind: 'توربین' },
      ] },
      { id: 'ut-cool', name: 'چرخهٔ آب خنک‌کن', equipment: [
        { tag: 'CT-7101', name: 'برج خنک‌کن شمارهٔ ۱', kind: 'برج خنک‌کن' },
        { tag: 'P-7102', name: 'تلمبه آب خنک‌کن', kind: 'تلمبه' },
      ] },
      { id: 'ut-air', name: 'هوای ابزار و نیتروژن', equipment: [
        { tag: 'C-7201', name: 'کمپرسور هوای ابزار', kind: 'کمپرسور' },
        { tag: 'V-7301', name: 'مخزن نیتروژن مایع', kind: 'مخزن تحت فشار' },
      ] },
    ],
  },
  {
    id: 'tk', code: 'TK', name: 'مخازن و تاسیسات صادراتی', family: 'tank',
    desc: 'انبارش فرآورده‌ها و بارگیری دریایی از اسکله‌ها',
    x: 350, y: 360, w: 550, h: 120,
    areas: [
      { id: 'tk-store', name: 'مخازن فرآورده', equipment: [
        { tag: 'TK-8001', name: 'مخزن سقف شناور نفتا', kind: 'مخزن ذخیره' },
        { tag: 'TK-8002', name: 'مخزن کروی LPG', kind: 'مخزن تحت فشار' },
        { tag: 'V-8003', name: 'مخزن اتیلن تحت فشار', kind: 'مخزن تحت فشار' },
      ] },
      { id: 'tk-marine', name: 'بارگیری دریایی', desc: 'اتصال به اسکله‌های صادراتی', equipment: [
        { tag: 'P-8101', name: 'تلمبه بارگیری اسکله', kind: 'تلمبه' },
        { tag: 'X-8102', name: 'لودینگ آرام عرشه', kind: 'لودینگ آرام' },
      ] },
    ],
  },
];

export function unitEquipmentCount(u: MapUnit): number {
  return u.areas.reduce((s, a) => s + a.equipment.length, 0);
}
