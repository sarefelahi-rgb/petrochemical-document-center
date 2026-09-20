// موتور یادگیرندهٔ دستیار — سامانه از بازخورد کاربران می‌آموزد و خودش را تقویت می‌کند
// سه مکانیزم:
//   ۱) حافظهٔ آموخته (LearnedKnowledge): پرسش→پاسخ آموخته‌شده از بازخوردها/تصحیح‌ها؛
//      در پاسخ‌های بعدی به‌عنوان دانش اولویت‌دار به مدل تزریق می‌شود.
//   ۲) بوست بازیابی تطبیقی: اسنادی که پاسخ‌هایشان 👤 تأیید شده در جست‌وجو تقویت و
//      اسنادی که پاسخ نامناسب دادند تضعیف می‌شوند (کیفیت بازیابی با استفاده بهتر می‌شود).
//   ۳) آمار یادگیری برای پنل مدیریت.
import { db } from '@/lib/db';
import { normalizeFa } from '@/lib/normalize';

// توقف‌واژه‌های سبک برای استخراج کلیدواژه از پرسش
const STOP = new Set([
  'این', 'آن', 'برای', 'که', 'با', 'از', 'به', 'در', 'است', 'هست', 'هستند', 'دارد', 'دارند',
  'شده', 'شود', 'باشد', 'تا', 'هم', 'یا', 'و', 'هر', 'چه', 'چیست', 'کدام', 'چند', 'لطفا', 'لطفاً',
  'می', 'را', 'بر', 'درباره', 'کن', 'کنید', 'بده', 'بگو', 'نشان', 'فقط', 'همه', 'بین', 'روی', 'اگر',
  'چون', 'باید', 'مورد', 'بوده', 'بود', 'خواهد', 'چگونه', 'چطور', 'کجا', 'سلام', 'ممنون', 'سپاس',
  'اسناد', 'سند', 'پروژه', 'دستیار', 'های', 'هایی', 'چی', 'کنه', 'kerem', 'lotfan', 'az', 'be', 'ba', 'va', 'dar',
]);

export function extractKeywords(q: string, max = 8): string[] {
  const norm = normalizeFa(q);
  const toks = Array.from(new Set(
    norm.split(/[\s،,\.;:؟?!()«»"']+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !STOP.has(t)),
  ));
  return toks.slice(0, max);
}

export interface LearnedEntry {
  id: string;
  question: string;
  answer: string;
  source: string;
  weight: number;
  score: number;
}

// ---------- ۱) بازیابی دانش آموخته‌شده مرتبط با پرسش ----------
// توجه: در Turbopack هر route نمونهٔ ماژول خودش را دارد؛ کش باید روی globalThis
// مشترک باشد تا پاک‌سازی پس از یادگیری در همهٔ routeها دیده شود.
const LEARNED_CACHE_MS = 10_000;
type LearnedRow = Awaited<ReturnType<typeof loadLearned>>[number];
interface LearnedCache { at: number; rows: LearnedRow[] }
interface LearningCacheStore { learned?: Map<string, LearnedCache>; boost?: Map<string, BoostCache> }
const cacheStore = globalThis as typeof globalThis & { __edcLearningCache?: LearningCacheStore };
const learnedCache = (cacheStore.__edcLearningCache ??= {}).learned ??= new Map<string, LearnedCache>();

async function loadLearned(organizationId: string) {
  return db.learnedKnowledge.findMany({
    where: { organizationId, active: true, weight: { gt: 0.05 } },
    orderBy: [{ weight: 'desc' }, { updatedAt: 'desc' }],
    take: 300,
  });
}

export async function getLearnedEntries(organizationId: string, q: string, top = 3): Promise<LearnedEntry[]> {
  if (!q.trim()) return [];
  const cached = learnedCache.get(organizationId);
  let rows: Awaited<ReturnType<typeof loadLearned>>;
  if (cached && Date.now() - cached.at < LEARNED_CACHE_MS) {
    rows = cached.rows;
  } else {
    rows = await loadLearned(organizationId);
    learnedCache.set(organizationId, { at: Date.now(), rows });
  }
  if (!rows.length) return [];

  const normQ = normalizeFa(q);
  const qToks = new Set(extractKeywords(q, 14));
  const scored: LearnedEntry[] = [];
  for (const r of rows) {
    const kwField = `${r.question} ${r.keywords || ''}`;
    const kwToks = normalizeFa(kwField).split(/[\s،,;]+/).filter(Boolean);
    let overlap = 0;
    for (const t of qToks) {
      if (kwToks.some((k) => k === t || (t.length >= 4 && k.includes(t)) || (k.length >= 4 && t.includes(k)))) overlap += 1;
    }
    // تطبیق مستقیم زیررشته — قوی‌ترین سیگنال (پرسش تکراری)
    const direct = normQ.length >= 6 && normalizeFa(r.question).includes(normQ) ? 1 : 0;
    if (overlap === 0 && !direct) continue;
    const score = direct * 4 + overlap * 1.5 + r.weight * 0.8 + Math.min(r.upvotes, 5) * 0.15 - Math.min(r.downvotes, 5) * 0.2;
    scored.push({ id: r.id, question: r.question, answer: r.answer, source: r.source, weight: r.weight, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, top);
}

export async function markLearnedUsed(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.learnedKnowledge.updateMany({ where: { id: { in: ids } }, data: { useCount: { increment: 1 } } }).catch(() => {});
}

// ---------- ۲) بوست/تضعیف تطبیقی اسناد در بازیابی (از بازخوردها) ----------
const BOOST_CACHE_MS = 60_000;
interface BoostCache { at: number; map: Map<string, number> }
const boostCache = (cacheStore.__edcLearningCache ??= {}).boost ??= new Map<string, BoostCache>();

export async function getDocBoosts(organizationId: string): Promise<Map<string, number>> {
  const cached = boostCache.get(organizationId);
  if (cached && Date.now() - cached.at < BOOST_CACHE_MS) return cached.map;
  const map = new Map<string, number>();
  try {
    const fbs = await db.assistantFeedback.findMany({
      where: { organizationId, rating: { in: ['UP', 'DOWN'] } },
      select: { rating: true, message: { select: { citations: true } } },
      orderBy: { createdAt: 'desc' },
      take: 600,
    });
    for (const fb of fbs) {
      if (!fb.message.citations) continue;
      let cits: Array<{ documentId?: string }> = [];
      try { cits = JSON.parse(fb.message.citations); } catch { continue; }
      const delta = fb.rating === 'UP' ? 0.5 : -0.75;
      for (const c of cits) {
        const id = c?.documentId;
        if (!id) continue;
        map.set(id, Math.max(-3, Math.min(3, (map.get(id) || 0) + delta)));
      }
    }
  } catch { /* آمار افتاد — بازیابی عادی */ }
  boostCache.set(organizationId, { at: Date.now(), map });
  return map;
}

// ---------- ۳) ثبت بازخورد و تولید/تعدیل دانش آموخته‌شده ----------
export async function learnFromFeedback(opts: {
  organizationId: string;
  userId: string;
  question: string;
  answer: string;
  rating: 'UP' | 'DOWN';
  expectedAnswer?: string | null;
  comment?: string | null;
}): Promise<{ learned: boolean; entryId?: string }> {
  const { organizationId, userId, question, answer, rating } = opts;
  const normQ = normalizeFa(question).slice(0, 500);
  const existing = await db.learnedKnowledge.findFirst({
    where: { organizationId, question: { contains: normQ.slice(0, 60) } },
    orderBy: { updatedAt: 'desc' },
  });

  if (rating === 'UP') {
    // پاسخ خوب → الگوی پرسش/پاسخ آموخته می‌شود (هرچه بیشتر تأیید شود قوی‌تر)
    if (existing) {
      await db.learnedKnowledge.update({
        where: { id: existing.id },
        data: { upvotes: { increment: 1 }, weight: Math.min(3, existing.weight + 0.25) },
      });
      learnedCache.delete(organizationId);
      return { learned: true, entryId: existing.id };
    }
    if (answer.trim().length < 40) return { learned: false };
    const entry = await db.learnedKnowledge.create({
      data: {
        organizationId,
        question: normQ,
        keywords: extractKeywords(question).join('، '),
        answer: answer.slice(0, 4000),
        source: 'FEEDBACK_UP',
        weight: 1,
        upvotes: 1,
        createdById: userId,
      },
    });
    learnedCache.delete(organizationId);
    return { learned: true, entryId: entry.id };
  }

  // DOWN — تصحیح کاربر valuableترین منبع یادگیری است
  const expected = (opts.expectedAnswer || '').trim();
  if (existing) {
    await db.learnedKnowledge.update({
      where: { id: existing.id },
      data: { downvotes: { increment: 1 }, weight: Math.max(0, existing.weight - 0.4) },
    });
  }
  if (expected.length >= 5) {
    if (existing) {
      await db.learnedKnowledge.update({
        where: { id: existing.id },
        data: { answer: expected.slice(0, 4000), source: 'CORRECTION', weight: Math.max(existing.weight, 1.2), active: true },
      });
      learnedCache.delete(organizationId);
      return { learned: true, entryId: existing.id };
    }
    const entry = await db.learnedKnowledge.create({
      data: {
        organizationId,
        question: normQ,
        keywords: extractKeywords(question).join('، '),
        answer: expected.slice(0, 4000),
        source: 'CORRECTION',
        weight: 1.2,
        createdById: userId,
      },
    });
    learnedCache.delete(organizationId);
    return { learned: true, entryId: entry.id };
  }
  learnedCache.delete(organizationId);
  return { learned: false };
}

// ---------- ۴) آمار یادگیری (پنل مدیریت) ----------
export async function learningStats(organizationId: string) {
  const [feedbacks, up, down, corrections, learned, uses] = await Promise.all([
    db.assistantFeedback.count({ where: { organizationId } }),
    db.assistantFeedback.count({ where: { organizationId, rating: 'UP' } }),
    db.assistantFeedback.count({ where: { organizationId, rating: 'DOWN' } }),
    db.learnedKnowledge.count({ where: { organizationId, source: 'CORRECTION' } }),
    db.learnedKnowledge.count({ where: { organizationId, active: true } }),
    db.learnedKnowledge.aggregate({ where: { organizationId }, _sum: { useCount: true } }),
  ]);
  const rate = up + down > 0 ? Math.round((up / (up + down)) * 100) : null;
  return { feedbacks, up, down, corrections, learned, uses: uses._sum.useCount || 0, satisfaction: rate };
}
