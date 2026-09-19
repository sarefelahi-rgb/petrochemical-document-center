// نقطهٔ اتصال Instrumentation نکست — طبق الگوی رسمی:
// کد node-only در فایل جدا (bootstrap-node.ts) و فقط با شرط استاتیک runtime وارد می‌شود
// تا باندل Edge آن را حذف کند (ماژول‌های crypto/prisma در Edge پشتیبانی نمی‌شوند).
// نکته: در سرور standalone (start پروداکشن) متغیر NEXT_RUNTIME همیشه ست نمی‌شود؛
// بنابراین شرط باید «!= edge» باشد تا bootstrap در استقرار تازه هم اجرا شود
// (ساخت جدول‌ها از schema.sql و بذرکاری admin).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    await import('./bootstrap-node');
  }
}
