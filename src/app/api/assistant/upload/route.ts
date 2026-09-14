// بارگذاری فایل در گفت‌وگوی دستیار — استخراج اطلاعات و پاسخ مدل بر محتوای فایل
// جریان: بارگذاری → امنیت فایل (امضا/حجم) → استخراج متن (لایهٔ متن/OCR/آفیس/متنی)
//       → ذخیرهٔ AssistantFile (متن برای پرسش‌های بعدی همین گفت‌وگو) → خلاصه‌سازی مدل با استناد [E1]
// صداقت: فایل ناخوانا صادقانه اعلام می‌شود؛ هیچ محتوایی از خود ساخته نمی‌شود.
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, buildAccessContext, jsonOk, jsonError, getClientIp } from '@/lib/guard';
import { checkFile, MAX_UPLOAD_MB } from '@/lib/filesec';
import { storeOriginal, ensureDirs, TMP_ROOT } from '@/lib/storage';
import { extractFromFile } from '@/lib/extract';
import { chatComplete } from '@/lib/modelGateway';
import { audit } from '@/lib/audit';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const maxDuration = 150;

// سقف نرم پردازش همگام: فایل‌های سنگین تصویری/OCR به‌جای تایم‌اوت، پیام صادقانه
const SOFT_SYNC_MB = 30;

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const ctx = await buildAccessContext(auth.user);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError('درخواست multipart نامعتبر است.');
  }
  const file = form.get('file');
  const conversationId = String(form.get('conversationId') || '') || undefined;
  if (!(file instanceof File)) return jsonError('فایل ارسال نشده است.');
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return jsonError(`حجم فایل از سقف ${MAX_UPLOAD_MB} مگابایت بیشتر است.`);

  const buf = Buffer.from(await file.arrayBuffer());
  const originalName = path.basename(file.name || 'file').slice(0, 200);
  const check = checkFile(originalName, buf);
  if (!check.ok) return jsonError(check.reason || 'فایل مجاز نیست.', 422, 'QUARANTINED');

  // فایل‌های سنگین نیازمند OCR → راهنمایی صادقانه به‌جای پردازش همگام طولانی
  const needsOcr = check.mime.startsWith('image/') || ['.tif', '.tiff'].includes((originalName.match(/\.[a-zA-Z0-9]+$/) || [''])[0].toLowerCase());
  if (needsOcr && file.size > SOFT_SYNC_MB * 1024 * 1024) {
    return jsonError(`این فایل تصویری ${Math.round(file.size / 1024 / 1024)} مگابایتی است و OCR همگام آن بیش از حد طول می‌کشد. از «پذیرش اسناد» یا «بارگذاری مدارک» با پردازش پس‌زمینه استفاده کنید.`, 413, 'TOO_LARGE_SYNC');
  }

  ensureDirs();
  const tmpPath = path.join(TMP_ROOT, `af-${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${originalName.replace(/[^\w.\-]/g, '_')}`);
  fs.writeFileSync(tmpPath, buf);
  let extraction;
  try {
    extraction = await extractFromFile(tmpPath, originalName);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* بی‌خطر */ }
  }

  // ذخیرهٔ اصل فایل در مخزن (پوشهٔ مستقل دستیار — سند پروژه محسوب نمی‌شود)
  const tmpStore = await writeTmp(buf, originalName);
  const stored = await storeOriginal(tmpStore, 'assistant-uploads', originalName);
  try { fs.unlinkSync(tmpStore); } catch { /* بی‌خطر */ }

  // گفت‌وگو: ادامه یا ساخت جدید
  let conv = conversationId
    ? await db.conversation.findFirst({ where: { id: conversationId, userId: auth.user.id } })
    : null;
  if (conversationId && !conv) return jsonError('گفت‌وگو یافت نشد.', 404, 'NOT_FOUND');
  if (!conv) {
    conv = await db.conversation.create({ data: { userId: auth.user.id, title: `فایل: ${originalName.slice(0, 50)}` } });
  }

  const af = await db.assistantFile.create({
    data: {
      userId: auth.user.id,
      conversationId: conv.id,
      originalName,
      mimeType: check.mime,
      size: stored.size,
      sha256: stored.sha256,
      storageKey: stored.storageKey,
      textContent: (extraction.text || '').slice(0, 400000),
      textSource: extraction.source || null,
      pageCount: extraction.pageCount ?? null,
      meta: JSON.stringify({ label: check.label, size: stored.size, note: extraction.note || extraction.error || null, ok: extraction.ok }),
    },
  });

  // پیام کاربر (نمایش فایل در چت)
  await db.assistantMessage.create({
    data: { conversationId: conv.id, role: 'USER', content: `📎 بارگذاری فایل: ${originalName} (${(stored.size / 1024).toFixed(0)} کیلوبایت)` },
  });

  const srcLabel = extraction.source === 'OCR' ? 'OCR (فارسی/انگلیسی)' : extraction.source === 'TEXT_LAYER' ? 'لایهٔ متنی PDF' : extraction.source === 'OFFICE' ? 'سند آفیس' : 'متن فایل';
  const extractionNote = extraction.note || extraction.error || '';

  // خلاصه‌سازی مدل — فقط بر متن استخراج‌شده
  let answer: string;
  const textForModel = (extraction.text || '').slice(0, 12000);
  if (extraction.ok && textForModel.length > 0) {
    const res = await chatComplete(
      [
        { role: 'system', content: 'تو «دستیار هوشمند اسناد پتروشیمی» هستی و تازه یک فایل از کاربر دریافت کرده‌ای. فقط فارسی پاسخ بده. فقط بر متن استخراج‌شدهٔ فایل تکیه کن؛ هیچ چیزی از خودت نساز. ساختار پاسخ: (۱) این فایل چیست، (۲) خلاصهٔ اطلاعات کلیدی در جدول یا فهرست، (۳) شماره‌ها/کدها/تاریخ‌های مهم، (۴) نکات ناخوانا یا ناقص. اگر متن ناقص است صریح بگو.' },
        { role: 'user', content: `نام فایل: ${originalName}\nنوع: ${check.label}\nروش استخراج: ${srcLabel}${extraction.pageCount ? ` — ${extraction.pageCount} صفحه` : ''}\n${extractionNote ? `یادداشت: ${extractionNote}\n` : ''}\nمتن استخراج‌شده:\n${textForModel}\n\nاطلاعات این فایل را کامل معرفی و خلاصه کن.` },
      ],
      { timeoutMs: 120_000, maxAttempts: 2 },
    );
    answer = res.ok
      ? res.content.trim()
      : `فایل ذخیره شد و متن آن استخراج شد (${srcLabel})، اما سرویس مدل زبانی موقتاً در دسترس نیست و خلاصهٔ تحلیلی تولید نشد. می‌توانید پرسش‌های مشخصی از محتوای این فایل بپرسید.`;
  } else if (extraction.ok) {
    answer = `فایل ذخیره شد و متن آن استخراج شد (${srcLabel}${extraction.pageCount ? `، ${extraction.pageCount} صفحه` : ''})، اما تولید خلاصهٔ تحلیلی در دسترس نیست. محتوای فایل در این گفت‌وگو ثبت شده — پرسش خود را دربارهٔ آن بنویسید.`;
  } else {
    answer = `فایل «${originalName}» ذخیره شد، اما متن قابل استخراجی یافت نشد. ${extractionNote || ''} می‌توانید تصویر واضح‌تری بارگذاری کنید یا برای PDF اسکنی از «پذیرش اسناد» با پردازش کامل OCR استفاده کنید.`;
  }

  // ثبت شاهد فایل برای نمایش UI — استناد [E1] روی همین فایل
  const citations = [{
    documentId: '',
    docNumber: '',
    title: `فایل بارگذاری‌شده: ${originalName}`,
    project: '',
    revision: null,
    revStatus: null,
    page: extraction.pageCount ?? null,
    snippet: (extraction.text || '').slice(0, 160) || extractionNote,
    source: 'internal' as const,
  }];
  if (extraction.ok) {
    answer += `\n\n— روش استخراج: ${srcLabel}${extraction.pageCount ? ` · ${extraction.pageCount} صفحه` : ''} · ${(extraction.text || '').length.toLocaleString('fa-IR')} نویسه. برای پرسش‌های بعدی دربارهٔ این فایل، همین گفت‌وگو را ادامه دهید.`;
  }

  await db.assistantMessage.create({
    data: { conversationId: conv.id, role: 'ASSISTANT', content: answer, citations: JSON.stringify(citations) },
  });

  await audit({ organizationId: ctx.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'ASSISTANT_FILE_UPLOAD', objectType: 'AssistantFile', objectId: af.id, detail: `name=${originalName} size=${stored.size} source=${extraction.source || 'none'} ok=${extraction.ok}`, ip: getClientIp(req) });

  return jsonOk({
    conversationId: conv.id,
    assistantFileId: af.id,
    answer,
    citations,
    extraction: {
      fileName: originalName,
      label: check.label,
      size: stored.size,
      sha256: stored.sha256.slice(0, 12),
      source: extraction.source || null,
      pageCount: extraction.pageCount ?? null,
      textChars: (extraction.text || '').length,
      note: extractionNote || null,
      ok: extraction.ok,
    },
  });
}

// نوشتن بافر در tmp برای storeOriginal (که مسیر فایل می‌گیرد)
async function writeTmp(buf: Buffer, originalName: string): Promise<string> {
  ensureDirs();
  const p = path.join(TMP_ROOT, `afstore-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(originalName).slice(0, 12)}`);
  fs.writeFileSync(p, buf);
  return p;
}
