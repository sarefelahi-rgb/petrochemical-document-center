// استخراج شناسنامهٔ مدرک (کادر عنوان) — الگوهای مهندسی + تقویت با ثبت‌های پروژه
// قاعدهٔ اعتماد: حدس زدن عدد ناخوانا ممنوع؛ مقادیر تا تأیید کارشناس «استخراج‌شده، تأییدنشده»
import { normalizeCode, normalizeFa, type PageWords, type W, type Db } from './base';

export interface Candidate {
  field: string;     // DOC_NUMBER | TITLE | REV | SHEET | SHEET_OF | TAG | LINE | CLASS | SIZE | SCALE | UNIT | PLANT | NOTE
  valueRaw: string;
  valueNorm: string | null;
  confidence: number;
  page: number;
  bbox: [number, number, number, number]; // نرمال 0..1
}

// اتحاد کادر واژه‌ها
function unionBox(words: W[]): [number, number, number, number] {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const w of words) {
    x0 = Math.min(x0, w.x); y0 = Math.min(y0, w.y);
    x1 = Math.max(x1, w.x + w.w); y1 = Math.max(y1, w.y + w.h);
  }
  if (x1 < x0) return [0, 0, 0, 0];
  return [x0, y0, x1 - x0, y1 - y0];
}

interface Match { text: string; groups: string[]; words: W[]; index: number; }

// جست‌وجوی الگو روی رشتهٔ واژه‌ها با نگاشت نتیجه به واژه‌ها (برای bbox) — گروه‌ها حفظ می‌شوند
function matchWords(words: W[], re: RegExp): Match[] {
  if (words.length === 0) return [];
  const joined = words.map((w) => w.t).join(' ');
  const starts: number[] = [];
  let pos = 0;
  for (const w of words) { starts.push(pos); pos += w.t.length + 1; }
  const out: Match[] = [];
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = rx.exec(joined)) !== null && guard++ < 200) {
    if (m[0].length === 0) { rx.lastIndex++; continue; }
    const s = m.index, e = m.index + m[0].length;
    const inWords = words.filter((_, i) => starts[i] < e && starts[i] + words[i].t.length >= s);
    if (inWords.length) out.push({ text: m[0], groups: m.slice(1), words: inWords, index: s });
  }
  return out;
}

interface Registry { docNumberNorm: string | null; tagSet: Set<string>; lineSet: Set<string>; }

async function loadRegistry(db: Db, documentId: string | null, _projectId: string | null): Promise<Registry> {
  const doc = documentId ? await db.document.findUnique({ where: { id: documentId }, select: { docNumber: true } }) : null;
  // فقط برای تقویت اطمینان استفاده می‌شود — داده‌ای به کاربر نشت نمی‌کند
  const tags = await db.assetTag.findMany({ select: { tag: true } }).catch(() => []);
  const lines = await db.line.findMany({ select: { lineNumber: true } }).catch(() => []);
  return {
    docNumberNorm: doc ? normalizeCode(doc.docNumber) : null,
    tagSet: new Set(tags.map((t) => normalizeCode(t.tag))),
    lineSet: new Set(lines.map((l) => normalizeCode(l.lineNumber))),
  };
}

function positionBoost(bbox: [number, number, number, number]): number {
  // کادر عنوان معمولاً پایین صفحه است
  const cy = bbox[1] + bbox[3] / 2;
  return cy > 0.55 ? 0.05 : 0;
}

export async function extractTitleBlock(db: Db, pages: PageWords[], opts: {
  documentId: string | null; revisionId: string | null; projectId: string | null; source: 'TEXT_LAYER' | 'OCR'; ocrConf?: number;
}): Promise<Candidate[]> {
  const reg = await loadRegistry(db, opts.documentId, opts.projectId);
  const out: Candidate[] = [];
  const srcFactor = opts.source === 'OCR' ? Math.max(0.4, Math.min(1, opts.ocrConf ?? 0.75)) : 1;

  const push = (c: Candidate) => {
    c.confidence = Math.max(0.05, Math.min(0.98, c.confidence * srcFactor));
    out.push(c);
  };

  for (const pg of pages) {
    const words = pg.words;
    if (words.length === 0) continue;

    // شماره سند: الگوی ۴ بخشی با رشتهٔ ۲+ حرفی در بخش دوم (تمایز از شمارهٔ خط مثل ۶-P-1183-B2A)
    for (const m of matchWords(words, /\b\d{1,6}-[A-Z]{2,6}-\d{3,5}-[A-Z0-9]{1,6}\b/g)) {
      const val = m.text.trim();
      const norm = normalizeCode(val);
      const isReg = reg.docNumberNorm && norm === reg.docNumberNorm;
      const bbox = unionBox(m.words);
      push({
        field: 'DOC_NUMBER', valueRaw: val, valueNorm: norm,
        confidence: (isReg ? 0.92 : 0.7) + positionBoost(bbox),
        page: pg.page, bbox,
      });
    }

    // شماره سند سه‌بخشی: 1183-ISO-0001 — ادامهٔ کد ۴ بخشی را می‌پذیرد تا دوباره شمارش نشود
    for (const m of matchWords(words, /\b\d{1,6}-[A-Z]{2,6}-\d{1,5}\b(?!\s*-\s*\w)/g)) {
      const val = m.text.trim();
      const norm = normalizeCode(val);
      // اگر همان رشته به‌صورت ۴ بخشی هم منطبق شده، اینجا تکراری است
      const bbox = unionBox(m.words);
      push({
        field: 'DOC_NUMBER', valueRaw: val, valueNorm: norm,
        confidence: (reg.docNumberNorm && norm === reg.docNumberNorm ? 0.92 : 0.6) + positionBoost(bbox),
        page: pg.page, bbox,
      });
    }

    // خط: الگوی ۶-P-1183-B2A — بخش دوم ۱ تا ۴ حرف
    for (const m of matchWords(words, /\b\d{1,3}-[A-Z]{1,4}-\d{3,5}-[A-Z0-9]{2,5}\b/g)) {
      const val = m.text.trim();
      const norm = normalizeCode(val);
      const known = reg.lineSet.has(norm);
      const bbox = unionBox(m.words);
      push({
        field: 'LINE', valueRaw: val, valueNorm: norm,
        confidence: (known ? 0.9 : 0.62) + positionBoost(bbox),
        page: pg.page, bbox,
      });
    }

    // Tag تجهیز: EA-308B / P-1101A — الگوی مستقل (جزئی از الگوی خط نیست)
    for (const m of matchWords(words, /(?<![\d-])\b[A-Z]{1,4}-\d{2,5}[A-Z]?\b(?![\d-])/g)) {
      const val = m.text.trim();
      const norm = normalizeCode(val);
      if (/^\d/.test(norm)) continue;
      const known = reg.tagSet.has(norm);
      const bbox = unionBox(m.words);
      push({
        field: 'TAG', valueRaw: val, valueNorm: norm,
        confidence: (known ? 0.9 : 0.55) + positionBoost(bbox),
        page: pg.page, bbox,
      });
    }

    // شیت: SHEET n OF m
    const sheetMatches = matchWords(words, /\b(?:SHEET|SH\.?)\s*[.:]?\s*(\d{1,3})\s*(?:OF|\/|از)\s*(\d{1,3})\b/gi);
    for (const m of sheetMatches) {
      const sheetNo = m.groups[0], sheetTotal = m.groups[1];
      if (!sheetNo || !sheetTotal) continue;
      const bbox = unionBox(m.words);
      push({ field: 'SHEET', valueRaw: sheetNo, valueNorm: sheetNo, confidence: 0.8 + positionBoost(bbox), page: pg.page, bbox });
      push({ field: 'SHEET_OF', valueRaw: sheetTotal, valueNorm: sheetTotal, confidence: 0.8 + positionBoost(bbox), page: pg.page, bbox });
    }

    // Revision: REV n — گروه از خود تطبیق استخراج می‌شود (بدون اسکن مجدد)
    const revMatches = matchWords(words, /\b(?:REV|REVISION)\s*[.:]?\s*([0-9]{1,2}|[A-Z])\b(?!\s*(?:OF|\/))/gi);
    const seenRev = new Set<string>();
    for (const m of revMatches) {
      const val = (m.groups[0] || '').toUpperCase();
      if (!val) continue;
      if (seenRev.has(val)) continue;
      seenRev.add(val);
      const bbox = unionBox(m.words);
      push({ field: 'REV', valueRaw: val, valueNorm: val, confidence: 0.72 + positionBoost(bbox), page: pg.page, bbox });
    }

    // Scale / Class / Size / Unit / Plant
    const kvPatterns: Array<{ field: string; re: RegExp; valGroup: number }> = [
      { field: 'SCALE', re: /\bSCALE\s*[.:]?\s*(\d{1,4}[.:]\d{1,4}|NTS|NONE)\b/gi, valGroup: 1 },
      { field: 'CLASS', re: /\bCL(?:ASS)?\s*[.:]?\s*([A-Z]{1,4}\d{2,4}[A-Z]?|CL\d{2,4})\b/gi, valGroup: 1 },
      { field: 'SIZE', re: /\bSIZE\s*[.:]?\s*(\d{1,2}(?:\.\d)?["″]?(?:\s?[A-Z]{1,2}\b)?)/gi, valGroup: 1 },
      { field: 'UNIT', re: /\bUNIT\s*[.:]?\s*(\d{2,3}|[A-Z0-9-]{2,8})\b/gi, valGroup: 1 },
      { field: 'PLANT', re: /\bPLANT\s*[.:]?\s*([A-Z0-9-]{2,16})\b/gi, valGroup: 1 },
    ];
    for (const kp of kvPatterns) {
      for (const m of matchWords(words, kp.re)) {
        const vm = m.text.match(new RegExp(kp.re.source, 'i'));
        if (!vm || !vm[kp.valGroup]) continue;
        const val = vm[kp.valGroup].trim();
        if (val.length < 1 || val.length > 20) continue;
        const bbox = unionBox(m.words);
        push({
          field: kp.field, valueRaw: val, valueNorm: normalizeFa(val).replace(/\s+/g, ' '),
          confidence: 0.68 + positionBoost(bbox), page: pg.page, bbox,
        });
      }
    }

    // عنوان: کلمهٔ کلیدی TITLE / عنوان
    for (const kw of [/TITLE\s*[.:]?\s*/gi, /عنوان\s*[:.]?\s*/g]) {
      for (const m of matchWords(words, kw)) {
        // واژه‌های بعد از کلیدواژه در همان خط
        const keyY = m.words[0]?.y ?? 0;
        const keyXEnd = Math.max(...m.words.map((w) => w.x + w.w));
        const lineWords = words
          .filter((w) => Math.abs(w.y - keyY) < Math.max(0.02, (m.words[0]?.h || 0.02) * 0.8))
          .filter((w) => w.x >= keyXEnd - 0.005 && w.x < 0.99)
          .sort((a, b) => a.x - b.x)
          .slice(0, 14);
        const val = lineWords.map((w) => w.t).join(' ').replace(/[\s|.]+$/, '').trim();
        if (val.length < 4 || val.length > 90) continue;
        const bbox = unionBox([...m.words, ...lineWords]);
        push({
          field: 'TITLE', valueRaw: val, valueNorm: normalizeFa(val),
          confidence: 0.55 + positionBoost(bbox), page: pg.page, bbox,
        });
        break; // در هر صفحه فقط اولین عنوان
      }
    }
  }

  // حذف تکرار (field+valueNorm) — بالاترین اطمینان بماند؛ TAG/LINE محدود به ۱۲ مورد
  const best = new Map<string, Candidate>();
  for (const c of out) {
    const key = `${c.field}::${c.valueNorm || c.valueRaw}`;
    const prev = best.get(key);
    if (!prev || c.confidence > prev.confidence) best.set(key, c);
  }
  const merged = Array.from(best.values());
  const tags = merged.filter((c) => c.field === 'TAG').sort((a, b) => b.confidence - a.confidence).slice(0, 12);
  const lines = merged.filter((c) => c.field === 'LINE').sort((a, b) => b.confidence - a.confidence).slice(0, 12);
  const rest = merged.filter((c) => c.field !== 'TAG' && c.field !== 'LINE');
  return [...rest, ...tags, ...lines];
}
