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
  jadval: ['جدول'], copy: ['کپی'], phot copy: ['فتوکپی'], baznashri: ['بازنشری'],
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
  spes: ['اسپک'], spec: ['اسپک'], class: ['کلاس'], kelass: ['کلاس'], size: ['سایز'],
  ghatar: ['قطر'], diameter: ['قطر'], feshar: ['فشار'], pressure: ['فشار'],
  dama: ['دما'], hararat: ['حرارت'], temperature: ['دما'],
  // وضعیت و گردش
  tasvib: ['تأیید'], taied: ['تأیید'], tayid: ['تأیید'], approve: ['تأیید'],
  rad: ['رد'], reject: ['رد'], void: ['ابطال'], batel: ['باطل'],
  nosxe: ['نسخه'], noskhe: ['نسخه'], revision: ['نسخه'], rev: ['نسخه'],
  tavabol: ['طغفول'], taghir: ['تغییر'], change: ['تغییر'], etelat: ['اطلاعات'],
  status: ['وضعیت'], vaziat: ['وضعیت'], vazeat: ['وضعیت'], halat: ['حالت'],
  jari: ['جاری'], ghabli: ['قبلی'], badi: ['بعدی'], jadid: ['جدید'], kohne: ['کهنه'],
  // فعل‌ها و پرسش‌ها
  hast: ['هست'], nist: ['نیست'], bod: ['بود'], mishe: ['می‌شود'], mikham: ['می‌خواهم'],
  begoo: ['بگو'], begu: ['بگو'], bedeh: ['بده'], peyda: ['پیدا'], kon: ['کن'], konid: ['کنید'],
  bashad: ['باشد'], chand: ['چند'], cheghadr: ['چقدر'], chist: ['چیست'], chiye: ['چیه'],
  koja: ['کجا'], key: ['کی'], cherah: ['چرا'], che: ['چه'], kodam: ['کدام'],
  hame: ['همه'], hamash: ['همه'], faghat: ['فقط'], faqat: ['فقط'],
  // پیشینه و زمان
  emrooz: ['امروز'], farda: ['فردا'], dirouz: ['دیروز'], sal: ['سال'], mah: ['ماه'],
  hafte: ['هفته'], rooz: ['روز'], tarikh: ['تاریخ'], date: ['تاریخ'], saat: ['ساعت'],
  // اشخاص و سازمان
  karbar: ['کاربر'], user: ['کاربر'], admin: ['مدیر'], modir: ['مدیر'], mohandes: ['مهندس'],
  company: ['شرکت'], sherkat: ['شرکت'], mosavvab: ['مصوب'], namayand: ['نمایند'],
  // کلمات متصل پرکاربرد
  baraye: ['برای'], az: ['از'], be: ['به'], dar: ['در'], in: ['این'], an: ['آن'],
  ba: ['با'], va: ['و'], ya: ['یا'], ta: ['تا'], ham: ['هم'], aan: ['آن'],
  inja: ['اینجا'], unja: ['آن‌جا'], alan: ['الان'], halah: ['الان'],
  bala: ['بالا'], payin: ['پایین'], chap: ['چپ'], rast: ['راست'],
};

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

export function analyzeFinglishToken(token: string): FinglishInfo {
  const t = token.trim();
  if (!looksFinglish(t)) return { isFinglish: false, persian: [], original: t };
  const dict = FINGLISH_WORDS[t.toLowerCase()];
  if (dict) return { isFinglish: true, persian: dict, original: t };
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
