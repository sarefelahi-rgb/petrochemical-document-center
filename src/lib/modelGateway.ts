// درگاه مدل — آداپتور سرویس مدل زبانی (فقط سمت سرور)
// سیاست سند: نام مدل/endpoint فقط سمت سرور؛ Timeout، Retry محدود با Backoff، ثبت مصرف بدون محتوا؛
// نبود سرویس نباید بقیهٔ سامانه را از کار بیندازد (fallback صادقانه).
import ZAI from 'z-ai-web-dev-sdk';
import { audit } from '@/lib/audit';

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface GatewayResult {
  ok: boolean;
  content: string;
  error?: string;
  durationMs: number;
  attempts: number;
  degraded?: boolean; // پاسخ مدل به هر دلیل نامعتبر بود
}

let cachedClient: ZAI | null = null;
let lastFailureAt = 0;
const CIRCUIT_COOLDOWN_MS = 30_000; // Circuit Breaker ساده: پس از شکست کامل، ۳۰ ثانیه تلاش نشود

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getClient(): Promise<ZAI> {
  if (!cachedClient) cachedClient = await ZAI.create();
  return cachedClient;
}

export function gatewayCircuitOpen(): boolean {
  return Date.now() - lastFailureAt < CIRCUIT_COOLDOWN_MS;
}

function isRateLimitError(msg: string): boolean {
  return /429|too many requests/i.test(msg);
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: timeout after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}

export async function chatComplete(
  messages: ChatMessage[],
  opts?: { timeoutMs?: number; maxAttempts?: number; maxTokensHint?: string },
): Promise<GatewayResult> {
  const timeoutMs = opts?.timeoutMs ?? 60_000;
  const maxAttempts = opts?.maxAttempts ?? 3;
  const started = Date.now();
  let lastError = '';

  if (gatewayCircuitOpen()) {
    return { ok: false, content: '', error: 'مدل موقتاً در دسترس نیست (circuit open)', durationMs: 0, attempts: 0 };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const zai = await getClient();
      const completion = await withTimeout(
        zai.chat.completions.create({ messages, thinking: { type: 'disabled' } }),
        timeoutMs,
        'model',
      );
      const content = completion?.choices?.[0]?.message?.content || '';
      if (!content.trim()) throw new Error('پاسخ خالی از مدل');
      const durationMs = Date.now() - started;
      // ثبت مصرف بدون محتوا (سیاست سند §105)
      await audit({ action: 'MODEL_USAGE', detail: `chars=${content.length} durationMs=${durationMs} attempt=${attempt}` });
      return { ok: true, content, durationMs, attempts: attempt };
    } catch (e) {
      lastError = (e as Error).message || 'خطای نامشخص مدل';
      if (attempt < maxAttempts) {
        // خطای ۴۲۹: انتظار بلندتر پیش از تلاش مجدد (circuit را باز نمی‌کنیم)
        await sleep(isRateLimitError(lastError) ? 3000 * attempt : 800 * attempt);
      }
    }
  }
  // فقط پس از شکست همهٔ تلاش‌ها مدار قطع می‌شود
  lastFailureAt = Date.now();
  return { ok: false, content: '', error: lastError, durationMs: Date.now() - started, attempts: maxAttempts };
}

// ---------- جست‌وجوی وب (فقط پرسش کاربر ارسال می‌شود؛ هیچ محتوای سند) ----------
export interface WebResultItem {
  url: string; name: string; snippet: string; host_name: string; date: string;
}

export async function webSearch(
  query: string,
  opts?: { num?: number; timeoutMs?: number },
): Promise<{ ok: boolean; results: WebResultItem[]; error?: string }> {
  const timeoutMs = opts?.timeoutMs ?? 25_000;
  const num = Math.min(Math.max(opts?.num ?? 5, 1), 8);
  if (gatewayCircuitOpen()) {
    return { ok: false, results: [], error: 'سرویس بیرونی موقتاً در دسترس نیست (circuit open)' };
  }
  try {
    const zai = await getClient();
    const res = await withTimeout(
      zai.functions.invoke('web_search', { query: query.slice(0, 400), num }),
      timeoutMs,
      'web_search',
    );
    const items: WebResultItem[] = (Array.isArray(res) ? res : []).map((r) => ({
      url: r?.url || '', name: r?.name || '', snippet: (r?.snippet || '').slice(0, 400),
      host_name: r?.host_name || '', date: r?.date || '',
    })).filter((r) => r.url);
    await audit({ action: 'MODEL_USAGE', detail: `web_search num=${items.length}` });
    return { ok: true, results: items };
  } catch (e) {
    const msg = (e as Error).message || 'خطای جست‌وجوی وب';
    if (!isRateLimitError(msg)) lastFailureAt = Date.now();
    return { ok: false, results: [], error: msg };
  }
}

// ---------- مدل بینایی — خواندن تصویر صفحه (مکمل OCR برای دقت بالاتر) ----------
export async function visionRead(
  prompt: string,
  imageDataUrl: string,
  opts?: { timeoutMs?: number },
): Promise<GatewayResult> {
  const timeoutMs = opts?.timeoutMs ?? 90_000;
  const started = Date.now();
  if (gatewayCircuitOpen()) {
    return { ok: false, content: '', error: 'مدل بینایی موقتاً در دسترس نیست (circuit open)', durationMs: 0, attempts: 0 };
  }
  try {
    const zai = await getClient();
    const completion = await withTimeout(
      zai.chat.completions.createVision({
        model: 'glm-4.5v',
        messages: [
          { role: 'system', content: 'تو کارشناس خواندن مدارک مهندسی (P&ID، ایزومتریک، دیتاشیت) هستی — بدون هیچ محدودیت زبانی: فارسی، انگلیسی، دوزبانه و فینگلیش را می‌فهمی. به همان زبانِ پرسش کاربر پاسخ بده (فینگلیش → فارسیِ روان). هر چیزی که ناخواناست دقیقاً «ناخوانا» بنویس — هیچ عدد یا کدی را حدس نزن.' },
          { role: 'user', content: [
            { type: 'text', text: prompt.slice(0, 2000) },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ] },
        ],
        thinking: { type: 'disabled' },
      }),
      timeoutMs,
      'vision',
    );
    const content = completion?.choices?.[0]?.message?.content || '';
    if (!content.trim()) throw new Error('پاسخ خالی از مدل بینایی');
    const durationMs = Date.now() - started;
    await audit({ action: 'MODEL_USAGE', detail: `vision chars=${content.length} durationMs=${durationMs}` });
    return { ok: true, content, durationMs, attempts: 1 };
  } catch (e) {
    const msg = (e as Error).message || 'خطای مدل بینایی';
    if (!isRateLimitError(msg)) lastFailureAt = Date.now();
    return { ok: false, content: '', error: msg, durationMs: Date.now() - started, attempts: 1 };
  }
}
