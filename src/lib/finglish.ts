// موتور فینگلیش — فهم فارسیِ نوشته‌شده با حروف لاتین (Finglish/Pinglish)
// هدف: پرسش کاربر ممکن است فینگلیش، فارسی، انگلیسی یا ترکیبی باشد؛ برای بازیابی اسناد
// هر توکن لاتینِ فارسی‌نما به کاندیدهای فارسی گسترش می‌یابد تا جست‌وجو در متن فارسی هم جواب دهد.
// لایه‌ها:
//  ۱) واژه‌نامهٔ پرکاربرد (دقیق‌ترین حالت)
//  ۲) قواعد آوانگاری: دی‌گراف‌ها (kh/sh/ch/gh/zh)، واکه‌های مرکب (oo/ee/aa/ou)، حرف پایانی
//  ۳) تصریف: پیشوند mi/nemi و پسوندهای ملکی/جمع/صرفی (am، ash، ha، tar، …)
// هیچ توکن انگلیسیِ فنی واقعی (مثل P&ID، API، PDF) فینگلیش فرض نمی‌شود.

// ---------- ۱) واژه‌نامهٔ پرکاربرد ----------
export const FINGLISH_WORDS: Record<string, string[]> = {
  // سلام و ادب
  salam: ['سلام'], hi: ['سلام'], drood: ['درود'], mamnoon: ['ممنون'], merci: ['مرسی'],
  sepas: ['سپاس'], tashakor: ['تشکر'], khaste: ['خسته'], nabashid: ['نباشید'], lotfan: ['لطفا'],
  // اسناد و مدارک
  madrak: ['مدرک'], madarek: ['مدارک'], sanad: ['سند'], asnad: ['اسناد'], naghshe: ['نقشه'],
  naghashi: ['نقشه'], map: ['نقشه'], document: ['سند'], file: ['فایل'], fail: ['فایل'],
  esnad: ['اسناد'], report: ['گزارش'], gozaresh: ['گزارش'], list: ['لیست'], fehrest: ['فهرست'],
  jadval: ['جدول'], copy: ['کپی'], 'photocopy': ['فتوکپی'], fotocopy: ['فتوکپی'], baznashri: ['بازنشری'],
  // مهندسی
  khat: ['خط'], khath: ['خط'], line: ['خط'], tag: ['برچسب'], borut: ['بروت'],
  material: ['متریال'], mavad: ['مواد'], lule: ['لوله'], luleh: ['لوله'], pipe: ['لوله'],
  sheyr: ['شیر'], shir: ['شیر'], valve: ['شیر'], pompe: ['پمپ'], pump: ['پمپ'],
  tank: ['مخزن'], makhzan: ['مخزن'], tashkhis: ['تشخیص'], abband: ['آب‌بند'],
  joshkar: ['جوشکاری'], weld: ['جوش'], varze: ['ورز'], emtehan: ['امتحان'],
  azmoon: ['آزمون'], test: ['آزمون'], bazresi: ['بازرسی'], inspection: ['بازرسی'],
  karkhane: ['کارخانه'], karvarzi: ['کارورزی'], projhe: ['پروژه'], project: ['پروژه'],
  vahed: ['واحد'], unit: ['واحد'], bakhsh: ['بخش'], separd: ['سپرد'],
  tahkim: ['تحکیم'], naghsheh: ['نقشه'], pandid: ['پی‌اند‌آی'], pid: ['پی‌اند‌آی'],
  isometric: ['ایزومتریک'], izometric: ['ایزومتریک'], datasheet: ['دیتاشیت'],
  flange: ['فلنج'], flanch: ['فلنج'], gasket: ['گسکت'], elbow: ['آب‌بند زانویی'],
  bolt: ['پیچ'], nut: ['مهره'], weldolet: ['ولدولت'], olet: ['اولت'],
  // پالایشگاهی
  reformer: ['رفورمر'], reactor: ['راکتور'], tower: ['برج'], borj: ['برج'],
  heatexchanger: ['مبدل حرارتی'], exchanger: ['مبدل'], mobadel: ['مبدل'],
  // اسناد مهندسی
  mto: ['ام‌تی‌او'], plotplan: ['پلان'], layout: ['چیدمان'], pfd: ['پی‌اف‌دی'],
  spes: ['اسپک'], spec: ['اسپک'], class: ['کلاس'], kelass: ['کلاس'], size: ['سایز'],
  ghatar: ['قطر'], diameter: ['قطر'], feshar: ['فشار'], pressure: ['فشار'],
  dama: ['دما'], hararat: ['حرارت'], temperature: ['دما'],
  // وضعیت و گردش
  tasvib: ['تأیید'], taied: ['تأیید'], tayid: ['تأیید'], approve: ['تأیید'],
  dastur: ['دستور'], tabe: ['تابع'], tasvir: ['تصویر'], aks: ['عکس'],
  rad: ['رد'], reject: ['رد'], void: ['ابطال'], batel: ['باطل'],
  nosxe: ['نسخه'], noskhe: ['نسخه'], revision: ['نسخه'], rev: ['نسخه'],
  tavabol: ['طغفول'], taghir: ['تغییر'], change: ['تغییر'], etelat: ['اطلاعات'],
  status: ['وضعیت'], vaziat: ['وضعیت'], vazeat: ['وضعیت'], halat: ['حالت'],
  jari: ['جاری'], ghabli: ['قبلی'], badi: ['بعدی'], jadid: ['جدید'], kohne: ['کهنه'],
  // فعل‌ها و پرسش‌ها
  hast: ['هست'], nist: ['نیست'], bod: ['بود'], mishe: ['می‌شود'], mikham: ['می‌خواهم'],
  mikhastam: ['می‌خواستم'], mikhaym: ['می‌خواهیم'], bebinam: ['ببینم'], bebin: ['ببین'],
  mikhham: ['می‌خواهم'], shode: ['شده'], shodeh: ['شده'], shodeha: ['شده‌ها'],
  begoo: ['بگو'], begu: ['بگو'], bedeh: ['بده'], bede: ['بده'], peyda: ['پیدا'], kon: ['کن'], konid: ['کنید'],
  bezar: ['بگذار'], begir: ['بگیر'], daryaft: ['دریافت'], ersal: ['ارسال'], ferestad: ['فرستاد'],
  bashad: ['باشد'], bashe: ['باشه'], chand: ['چند'], cheghadr: ['چقدر'], chist: ['چیست'], chiye: ['چیه'],
  neshan: ['نشان'], barresi: ['بررسی'], bargozari: ['برگزاری'],
  koja: ['کجا'], key: ['کی'], cherah: ['چرا'], che: ['چه'], kodam: ['کدام'],
  hame: ['همه'], hamash: ['همه'], faghat: ['فقط'], faqat: ['فقط'],
  khabar: ['خبر'], khabari: ['خبری'], hich: ['هیچ'], chetor: ['چطور'], chetori: ['چطوری'],
  khoob: ['خوب'], khoobi: ['خوبی'], agha: ['آقا'], khanom: ['خانم'],
  // پیشینه و زمان
  emrooz: ['امروز'], farda: ['فردا'], dirouz: ['دیروز'], sal: ['سال'], mah: ['ماه'],
  hafte: ['هفته'], rooz: ['روز'], tarikh: ['تاریخ'], date: ['تاریخ'], saat: ['ساعت'],
  // ماه‌های شمسی
  farvardin: ['فروردین'], ordibehesht: ['اردیبهشت'], khordad: ['خرداد'], tir: ['تیر'],
  mordad: ['مرداد'], shahrivar: ['شهریور'], mehr: ['مهر'], aban: ['آبان'],
  azar: ['آذر'], dey: ['دی'], bahman: ['بهمن'], esfand: ['اسفند'],
  // اعداد
  yek: ['یک'], do: ['دو'], se: ['سه'], chahar: ['چهار'], panj: ['پنج'], shesh: ['شش'],
  haft: ['هفت'], hasht: ['هشت'], noh: ['نه'], dah: ['ده'], bist: ['بیست'], sad: ['صد'], hezar: ['هزار'],
  // اشخاص و سازمان
  karbar: ['کاربر'], user: ['کاربر'], admin: ['مدیر'], modir: ['مدیر'], mohandes: ['مهندس'],
  company: ['شرکت'], sherkat: ['شرکت'], mosavvab: ['مصوب'], namayand: ['نمایند'],
  // کلمات متصل پرکاربرد
  baraye: ['برای'], az: ['از'], be: ['به'], dar: ['در'], in: ['این'], an: ['آن'],
  ba: ['با'], va: ['و'], ya: ['یا'], ta: ['تا'], ham: ['هم'], aan: ['آن'],
  inja: ['اینجا'], unja: ['آن‌جا'], alan: ['الان'], halah: ['الان'],
  bala: ['بالا'], payin: ['پایین'], chap: ['چپ'], rast: ['راست'],
  // فعل‌ها و کنش‌ها
  bekhun: ['بخوان'], bekhoon: ['بخوان'], khoonde: ['خوانده'], nevesht: ['نوشته'],
  benevis: ['بنویس'], peida: ['پیدا'], nashod: ['نشد'], shod: ['شد'], mishavad: ['می‌شود'],
  // کار و گردش اسناد
  bazdid: ['بازدید'], tahvil: ['تحویل'], daryafti: ['دریافتی'], gharardad: ['قرارداد'],
  contract: ['قرارداد'], peyvast: ['پیوست'], attachment: ['پیوست'], email: ['ایمیل'], imail: ['ایمیل'],
  kelid: ['کلید'], kilid: ['کلید'], mashin: ['ماشین'], machine: ['ماشین'], dastgah: ['دستگاه'],
  abzar: ['ابزار'], ghate: ['قطعه'], ghateat: ['قطعات'], kharabi: ['خرابی'],
  tamir: ['تعمیر'], tamirat: ['تعمیرات'], negahdari: ['نگهداری'], roghan: ['روغن'], oil: ['روغن'],
  bokhar: ['بخار'], steam: ['بخار'], barq: ['برق'], kargar: ['کارگر'], karmand: ['کارمند'],
  // محیط و مفاهیم
  hava: ['هوا'], gaz: ['گاز'], gas: ['گاز'], hazine: ['هزینه'], ghimat: ['قیمت'],
  zaman: ['زمان'], mosbat: ['مثبت'], manfi: ['منفی'], dakhel: ['داخل'], kharej: ['خارج'],
  birun: ['بیرون'], hamin: ['همین'], haman: ['همان'], digar: ['دیگر'], digeh: ['دیگه'],
  baad: ['بعد'], ghabl: ['قبل'], zir: ['زیر'], rooy: ['روی'], moroor: ['مرور'],
  // فرایند و اداری
  estelam: ['استعلام'], sefaresh: ['سفارش'], faktor: ['فاکتور'], bebakhshid: ['ببخشید'],
  natije: ['نتیجه'], natayej: ['نتایج'], etelaati: ['اطلاعاتی'], tasviri: ['تصویری'],
  fani: ['فنی'], mohandesi: ['مهندسی'], sakhteman: ['ساختمان'], makan: ['مکان'], masir: ['مسیر'],
  peymankar: ['پیمانکار'], karfarma: ['کارفرما'], taghirat: ['تغییرات'], ekhtelaf: ['اختلاف'],
  tafavot: ['تفاوت'], moshkel: ['مشکل'], erja: ['ارجاع'], shomare: ['شماره'], safhe: ['صفحه'],
  barge: ['برگه'], daftar: ['دفتر'], daftarche: ['دفترچه'], emza: ['امضا'], mohr: ['مهر'],
  darust: ['درست'], dorost: ['درست'], eshtebah: ['اشتباه'], monaseb: ['مناسب'],
};

// ---------- ۱.۵) گسترش معکوس: فارسی → لاتین/فینگلیش ----------
// اسناد مهندسی معمولاً انگلیسی‌نویسی دارند (حاشیه‌نویسی P&ID، دیتاشیت)؛ وقتی کاربر فارسی می‌پرسد،
// معادل‌های لاتین هم وارد بازیابی می‌شوند تا متن انگلیسی/فینگلیش داخل اسناد هم پیدا شود.
export const PERSIAN_TO_LATIN: Record<string, string[]> = {
  'پمپ': ['pump', 'pomp'], 'شیر': ['valve', 'valv'], 'مبدل': ['exchanger', 'heat exchanger'],
  'فلنج': ['flange'], 'لوله': ['pipe', 'piping'], 'مخزن': ['tank', 'vessel'], 'برج': ['tower', 'column'],
  'راکتور': ['reactor'], 'بازرسی': ['inspection'], 'جوش': ['weld', 'welding'], 'خط': ['line'],
  'برچسب': ['tag'], 'نقشه': ['drawing', 'iso'], 'ایزومتریک': ['isometric', 'iso'],
  'دیتاشیت': ['datasheet'], 'گزارش': ['report'], 'متریال': ['material'], 'کلاس': ['class'],
  'سایز': ['size'], 'قطر': ['diameter'], 'فشار': ['pressure'], 'دما': ['temperature'],
  'تأیید': ['approved'], 'تایید': ['approved'], 'نسخه': ['revision', 'rev'], 'پروژه': ['project'],
  'واحد': ['unit'], 'آزمون': ['test'], 'گسکت': ['gasket'], 'پیچ': ['bolt'], 'مهره': ['nut'],
  'پلان': ['plot plan', 'plan'], 'چیدمان': ['layout'], 'اسپک': ['spec', 'specification'],
  'ضخامت': ['thickness'], 'استاندارد': ['standard'], 'تعمیر': ['maintenance', 'repair'],
  'تعمیرات': ['maintenance'], 'کالیبراسیون': ['calibration'], 'قرارداد': ['contract'],
  'پیمانکار': ['contractor'], 'کارفرما': ['client'], 'ترنسمیتال': ['transmittal'],
  'ام‌تی‌او': ['mto'], 'امتی‌او': ['mto'], 'پی‌اند‌آی': ['p&id', 'pid'], 'پی اف دی': ['pfd'],
  'روغن': ['oil'], 'بخار': ['steam'], 'گاز': ['gas'], 'هوا': ['air'], 'برق': ['electrical'],
  'سفارش': ['order', 'po'], 'فاکتور': ['invoice'], 'امضا': ['signature'], 'صفحه': ['page', 'sheet'],
};

export function reverseExpansion(question: string): string[] {
  const toks = question.split(/[^\u0600-\u06FF\u200c]+/).map((t) => t.trim()).filter(Boolean);
  const out = new Set<string>();
  for (const t of toks) {
    const base = t.replace(/(های|ها)$/u, '');
    const m = PERSIAN_TO_LATIN[t] || PERSIAN_TO_LATIN[base];
    if (m) m.forEach((x) => out.add(x.toLowerCase()));
  }
  return Array.from(out).slice(0, 12);
}

// ---------- ۲) آوانگاری قاعده‌بنیاد ----------
const DIGRAPHS: Record<string, string[]> = {
  kh: ['خ'], gh: ['ق', 'غ'], sh: ['ش'], ch: ['چ'], zh: ['ژ'], th: ['ت'], ph: ['ف'],
};
const SINGLES: Record<string, string[]> = {
  a: ['ا'], b: ['ب'], c: ['ک'], d: ['د'], e: ['ا'], f: ['ف'], g: ['گ'], h: ['ه'],
  i: ['ی'], j: ['ج'], k: ['ک'], l: ['ل'], m: ['م'], n: ['ن'], o: ['و'], p: ['پ'],
  q: ['ق'], r: ['ر'], s: ['س'], t: ['ت'], u: ['و'], v: ['و'], w: ['و'], x: ['خ'],
  y: ['ی'], z: ['ز'],
};

const LATIN_TOKEN_RE = /^[a-zA-Z][a-zA-Z'\-]{2,}$/;

// واژه‌های انگلیسی فنی/رایج که نباید فینگلیش فرض شوند
const ENGLISH_KEEP = new Set([
  'pid', 'pandid', 'pdf', 'cad', 'api', 'sql', 'http', 'https', 'www', 'com', 'mto',
  'the', 'and', 'for', 'with', 'from', 'all', 'any', 'find', 'show', 'give', 'me',
  'what', 'where', 'when', 'how', 'which', 'who', 'why', 'is', 'are', 'was', 'were',
  'please', 'thanks', 'hello', 'help', 'need', 'want', 'get', 'set', 'put', 'list',
  'document', 'documents', 'file', 'files', 'report', 'reports', 'project', 'projects',
  'drawing', 'drawings', 'search', 'filter', 'export', 'import', 'update', 'delete',
  'status', 'revision', 'revisions', 'title', 'number', 'page', 'pages', 'date',
  'approve', 'approved', 'pending', 'rejected', 'draft', 'archive',
]);

function looksFinglish(tok: string): boolean {
  const t = tok.toLowerCase();
  if (!LATIN_TOKEN_RE.test(t)) return false;
  if (ENGLISH_KEEP.has(t)) return false;
  // باید دست‌کم یک واکه داشته باشد (توکن بی‌واکه مثل P-1183 کد است نه فینگلیش)
  if (!/[aeiou]/.test(t)) return false;
  // نسبت صامت/واکهٔ معقول — در فینگلیش توالی واکه‌ها کم است ولی digraph رایج
  return true;
}

// تولید کاندیدهای فارسی از یک توکن فینگلیش (حداکثر maxCands کاندید)
export function transliterateFinglish(word: string, maxCands = 4): string[] {
  const out = new Set<string>();
  const rec = (rest: string, acc: string) => {
    if (out.size >= maxCands * 3) return; // سقف تولید
    if (rest === '') { if (acc.length >= 2) out.add(acc); return; }
    const two = rest.slice(0, 2);
    if (DIGRAPHS[two]) {
      for (const fa of DIGRAPHS[two]) rec(rest.slice(2), acc + fa);
      return;
    }
    // واکه‌های مرکب رایج
    if (rest.startsWith('oo')) { rec(rest.slice(2), acc + 'و'); return; }
    if (rest.startsWith('ou')) { rec(rest.slice(2), acc + 'و'); return; }
    if (rest.startsWith('aa')) { rec(rest.slice(2), acc + 'ا'); return; }
    if (rest.startsWith('ee')) { rec(rest.slice(2), acc + 'ی'); return; }
    if (rest.startsWith('ei')) { rec(rest.slice(2), acc + 'ی'); return; }
    const ch0 = rest[0];
    if (SINGLES[ch0]) {
      for (const fa of SINGLES[ch0]) rec(rest.slice(1), acc + fa);
    } else if (/[A-Z]/.test(rest[0])) {
      rec(rest.slice(1), acc + rest[0].toLowerCase());
    } else {
      rec(rest.slice(1), acc + ch0);
    }
  };
  let base = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!base) return [];
  // پسوندهای رایج را جدا کن تا ریشه پیدا شود (baste-ha → baste)
  const suffixes = ['tarin', 'tar', 'haye', 'haaye', 'ha', 'am', 'at', 'ash', 'and', 'im', 'id', 'an', 'e'];
  let root = base;
  let suffix = '';
  for (const s of suffixes) {
    if (base.length > s.length + 2 && base.endsWith(s)) {
      root = base.slice(0, base.length - s.length);
      suffix = s;
      break;
    }
  }
  rec(root, '');
  // حذف فرم‌های بی‌معنی خیلی کوتاه و تکراری‌های زائد
  const cands = Array.from(out).filter((c) => c.length >= 2);
  // پسوند: در فارسی پیوسته (ها/تر/…) یا ملکی جدا با نیم‌فاصله — جست‌وجو با فرم پیوسته هم سودمند است
  if (suffix && cands.length) {
    const more: string[] = [];
    for (const c of cands.slice(0, maxCands)) {
      if (['ha', 'tar', 'tarin', 'haye', 'haaye'].includes(suffix)) {
        more.push(c + (suffix === 'haye' || suffix === 'haaye' ? 'های' : suffix === 'ha' ? 'ها' : suffix));
      } else if (['am', 'at', 'ash', 'and', 'im', 'id'].includes(suffix)) {
        // ضمیر متصل — بدون گسترهٔ معنایی، حذف (ریشه کفایت می‌کند)
      } else if (suffix === 'e') {
        more.push(c + 'ه');
      }
    }
    cands.push(...more);
  }
  return Array.from(new Set(cands)).slice(0, maxCands);
}

// ---------- ۳) API اصلی ----------
export interface FinglishInfo {
  isFinglish: boolean;
  persian: string[];   // کاندیدهای فارسی
  original: string;
}

// فاصلهٔ لِوِنشتاین ≤1 — تحمل غلط تایپی در واژه‌های فینگلیش (madarekk → madarek)
function lev1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  if (i < la || j < lb) diff++;
  return diff <= 1;
}

export function analyzeFinglishToken(token: string): FinglishInfo {
  const t = token.trim();
  if (!looksFinglish(t)) return { isFinglish: false, persian: [], original: t };
  const lower = t.toLowerCase();
  const dict = FINGLISH_WORDS[lower];
  if (dict) return { isFinglish: true, persian: dict, original: t };
  // پسوند را جدا کن و ریشه را هم در واژه‌نامه ببین (pumpha → pump → پمپ، valveha → valve → شیر)
  const suffixes = ['tarin', 'haye', 'haaye', 'tar', 'ha', 'am', 'at', 'ash', 'and', 'im', 'id', 'an', 'e'];
  for (const s of suffixes) {
    if (lower.length > s.length + 2 && lower.endsWith(s)) {
      const rootDict = FINGLISH_WORDS[lower.slice(0, lower.length - s.length)];
      if (rootDict) return { isFinglish: true, persian: rootDict, original: t };
      break;
    }
  }
  // تحمل غلط تایپی: نزدیک‌ترین کلید واژه‌نامه (فاصلهٔ ویرایشی ≤۱) — فقط برای توکن‌های ≥۵ نویسه
  if (lower.length >= 5) {
    for (const k of Object.keys(FINGLISH_WORDS)) {
      if (Math.abs(k.length - lower.length) <= 1 && lev1(k, lower)) {
        return { isFinglish: true, persian: FINGLISH_WORDS[k], original: t };
      }
    }
  }
  const cands = transliterateFinglish(t);
  return { isFinglish: cands.length > 0, persian: cands, original: t };
}

// گسترش پرسش: از پرسش آزاد، توکن‌های فینگلیش را می‌یابد و معادل‌های فارسی برمی‌گرداند
// خروجی: توکن‌های فارسیِ اضافه برای بازیابی + تشخیص اینکه آیا پرسش فینگلیش دارد
export function finglishExpansion(question: string): { tokens: string[]; hasFinglish: boolean } {
  const raw = question.split(/[^\p{L}\p{N}\-']+/u).filter(Boolean);
  const tokens = new Set<string>();
  let hasFinglish = false;
  for (const tok of raw) {
    if (!/[a-zA-Z]/.test(tok)) continue;
    const info = analyzeFinglishToken(tok);
    if (info.isFinglish) {
      hasFinglish = true;
      info.persian.forEach((p) => tokens.add(p));
    }
  }
  return { tokens: Array.from(tokens).slice(0, 8), hasFinglish };
}

// بازنویسی پرسش برای مدل: معادل‌های فارسی کنار اصل عبارت — مدل فینگلیش را درست بفهمد
export function finglishNoteForModel(question: string): string {
  const { tokens, hasFinglish } = finglishExpansion(question);
  if (!hasFinglish || tokens.length === 0) return '';
  return `پرسش کاربر حاوی فینگلیش (فارسی با حروف لاتین) است. معادل‌های فارسی شناسایی‌شده: ${tokens.join('، ')}. اگر بخشی از پرسش فینگلیش است، آن را درست تفسیر کن و در پاسخ فارسیِ درست را به کار ببر.`;
}

// تشخیص زبان غالب پرسش — برای پاسخ‌دهی هم‌زبان کاربر
export function dominantLanguage(question: string): 'fa' | 'en' | 'finglish' | 'mixed' {
  const persianChars = (question.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (question.match(/[a-zA-Z]/g) || []).length;
  const total = persianChars + latinChars;
  if (total === 0) return 'fa';
  const { hasFinglish } = finglishExpansion(question);
  if (persianChars / total > 0.7) return 'fa';
  if (latinChars / total > 0.7) return hasFinglish ? 'finglish' : 'en';
  return hasFinglish ? 'finglish' : 'mixed';
}
