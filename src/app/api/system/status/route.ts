// وضعیت واقعی قابلیت‌ها — صادقانه: نصب‌نشده‌ها «نیازمند اتصال/نصب» اعلام می‌شوند
// مرحله B: Worker و OCR و استخراج شناسنامه و جست‌وجوی درون‌مدرک وضعیت واقعی نشان می‌دهند
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jsonOk } from '@/lib/guard';
import { gatewayCircuitOpen } from '@/lib/modelGateway';
import { isMfaEnabled } from '@/lib/settings';
import fs from 'fs';
import path from 'path';

async function workerInfo() {
  const hbRow = await db.setting.findUnique({ where: { key: 'worker.heartbeat' } }).catch(() => null);
  let heartbeat: { at: string; pid: number; version: string; versions?: Record<string, string> } | null = null;
  if (hbRow) { try { heartbeat = JSON.parse(hbRow.value); } catch { heartbeat = null; } }
  const alive = !!heartbeat && Date.now() - new Date(heartbeat.at).getTime() < 90000;
  const [queued, running, dead] = await Promise.all([
    db.processingJob.count({ where: { status: 'QUEUED' } }).catch(() => -1),
    db.processingJob.count({ where: { status: 'RUNNING' } }).catch(() => -1),
    db.processingJob.count({ where: { status: 'DEAD' } }).catch(() => -1),
  ]);
  return { heartbeat, alive, queue: { queued, running, dead } };
}

function ocrReady(): boolean {
  return fs.existsSync(path.join(process.cwd(), 'data', 'tessdata', 'fas.traineddata'));
}

export async function GET() {
  const w = await workerInfo();
  const mfaOn = await isMfaEnabled();
  const procNote = w.alive
    ? `فعال — Worker v${w.heartbeat?.version} · صف: ${w.queue.queued} در انتظار، ${w.queue.running} در اجرا، ${w.queue.dead} مرده`
    : 'صف فعال است اما Worker در حال اجرا نیست — راه‌اندازی: bun worker/worker.ts (کارها در صف می‌مانند و فایل‌ها همچنان قابل مدیریت‌اند)';

  const CAPABILITIES = [
    { key: 'lexical_search', label: 'جست‌وجوی دقیق و واژگانی', available: true, note: 'فعال — شماره/Tag/عنوان + جست‌وجو در متن صفحات (لایهٔ متن و OCR)' },
    { key: 'document_registry', label: 'شناسنامه و نسخه‌های سند', available: true, note: 'فعال' },
    { key: 'file_store', label: 'مخزن فایل با SHA-256 و قرنطینه', available: true, note: 'فعال — مخزن دیسک محلی' },
    { key: 'rbac_abac', label: 'کنترل دسترسی پروژه/محرمانگی', available: true, note: 'فعال — منع پیش‌فرض' },
    { key: 'audit', label: 'حسابرسی رویدادها', available: true, note: 'فعال' },
    { key: 'local_auth', label: 'ورود محلی', available: true, note: mfaOn ? 'فعال — ورود دومرحله‌ای (TOTP) برای مدیران الزامی است' : 'فعال — ورود دومرحله‌ای (MFA) طبق تصمیم بهره‌بردار فعلاً غیرفعال است (قابل فعال‌سازی از پنل مدیریت ← تنظیمات)' },
    { key: 'pdf_viewer', label: 'نمایشگر PDF (بزرگ‌نمایی/چرخش/انتخاب متن/جست‌وجوی درون‌مدرک/لینک صفحه)', available: true, note: 'فعال — pdf.js با واترمارک پویا و نوار وضعیت' },
    { key: 'worker_pipeline', label: 'صف پردازش پایدار (Retry/Dead-letter/Heartbeat)', available: w.alive, note: procNote },
    { key: 'ocr', label: 'OCR فارسی/انگلیسی + استخراج شناسنامه', available: w.alive && ocrReady(), note: w.alive && ocrReady() ? `فعال — tesseract ${w.heartbeat?.versions?.tesseract || ''} · langs fas+eng · تا تأیید کارشناس «استخراج‌شده، تأییدنشده»` : 'نیازمند راه‌اندازی Worker + دادهٔ زبان fas' },
    { key: 'review_queue', label: 'صف بازبینی استخراج و کیفیت', available: w.alive, note: 'کارهای خودکار + درخواست دستی — تصمیم نهایی با کارشناس' },
    { key: 'page_links', label: 'لینک صفحه (ارجاع مکانی با هایلایت)', available: true, note: 'فعال — ارجاع سند/صفحه/محدوده' },
    { key: 'model_gateway', label: 'درگاه مدل — دستیار هوشمند مستند (RAG با ارجاع مکانی)', available: !gatewayCircuitOpen(), note: !gatewayCircuitOpen() ? 'فعال — پاسخ فقط بر شواهد بازیابی‌شدهٔ مجاز؛ نبود سرویس باعث قطع بقیهٔ سامانه نمی‌شود' : 'سرویس مدل موقتاً قطع است — حالت واژگانی جایگزین می‌شود' },
    { key: 'conversation_history', label: 'حافظهٔ گفتگو (ساید‌بار سوابق، تغییرنام/حذف)', available: true, note: 'فعال — ذخیره در پایگاه داده، انزوای کامل بین کاربران' },
    { key: 'equipment_dossier', label: 'پروندهٔ تجهیز/خط (گروه‌بندی مدارک، روابط پیشنهادی/تأییدشده)', available: true, note: 'فعال' },
    { key: 'revision_compare', label: 'مقایسهٔ دو ویرایش (تفاوت واژه‌ای متن صفحات + هشدار OCR)', available: true, note: 'فعال — جای بازبینی مهندسی را نمی‌گیرد' },
    { key: 'oidc_saml', label: 'ورود سازمانی OIDC/SAML/AD', available: false, note: 'نیازمند اتصال Identity Provider سازمان' },
    { key: 'cad_convert', label: 'تبدیل CAD (DWG/DXF/STEP/IFC)', available: false, note: 'نیازمند مبدل مجاز و مجوز تجاری — فایل اصل نگهداری می‌شود' },
    { key: 'semantic_search', label: 'جست‌وجوی معنایی (Embedding)', available: false, note: 'نیازمند اتصال سرویس Embedding' },
    { key: 'llm_answer', label: 'پاسخ تولیدی مستند با مدل زبانی', available: !gatewayCircuitOpen(), note: !gatewayCircuitOpen() ? 'فعال — فقط بر شواهد مجاز؛ ارجاع‌ها سمت سرور اعتبارسنجی می‌شوند؛ مقاوم به تزریق دستور' : 'سرویس مدل موقتاً قطع است — حالت واژگانی جایگزین می‌شود' },
    { key: 'viewer_compare', label: 'مقایسه کنارهم/هم‌پوشانی نسخه‌ها', available: false, note: 'اجرا نشده — در Backlog با شناسه' },
    { key: 'web_search', label: 'جست‌وجوی وب دستیار (زمینهٔ عمومی بیرونی)', available: !gatewayCircuitOpen(), note: 'فعال — فقط متن پرسش کاربر ارسال می‌شود؛ محتوای اسناد هرگز به بیرون نمی‌رود (سیاست §89)' },
    { key: 'ai_vision', label: 'خواندن تصویری صفحه با مدل بینایی (مکمل OCR)', available: !gatewayCircuitOpen(), note: 'فعال — از جزئیات سند، دستیار با محدودهٔ سند + شمارهٔ صفحه؛ ناخواناها حدس زده نمی‌شوند' },
    { key: 'assistant_docscope', label: 'پرسش از دستیار محدود به سند (کل اطلاعات سند)', available: true, note: 'فعال — شناسنامه، نسخه‌ها، متن صفحات، استخراج‌ها، روابط، MTO و گردش تأیید' },
    { key: 'mto', label: 'تجمیع MTO/BOM (استخراج پیشنهادی مدل + تأیید کارشناس + تجمیع با کلید فنی)', available: true, note: 'فعال — جمع فقط روی ردیف‌های تأییدشده؛ ردیف ناقص ادغام نمی‌شود؛ منبع هر ردیف حفظ است' },
    { key: 'approval_workflow', label: 'گردش تأیید سند (دورهای بازبینی + منع خودتأییدی)', available: true, note: 'فعال — محولی در کارتابل بازبین؛ پس از تأیید همهٔ دور، نسخهٔ جاری تأیید می‌شود' },
    { key: 'transmittal', label: 'ترنسمیتال ورودی/خروجی + رجیستر MDR', available: true, note: 'فعال — «کنترل مدارک»: ایجاد/اقلام/وضعیت/رسید + خروجی CSV' },
    { key: 'backup_restore', label: 'پشتیبان‌گیری هماهنگ (DB + مخزن اصل + مشتقات)', available: true, note: 'فعال — scripts/backup.mjs و restore.mjs؛ تمرین Restore روی محیط مجزا الزامی است' },
  ];

  return jsonOk({ capabilities: CAPABILITIES, worker: { alive: w.alive, queue: w.queue }, checkedAt: new Date().toISOString() });
}
