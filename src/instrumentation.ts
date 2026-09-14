// نقطهٔ اتصال Instrumentation نکست — طبق الگوی رسمی:
// کد node-only در فایل جدا (bootstrap-node.ts) و فقط با شرط استاتیک runtime وارد می‌شود
// تا باندل Edge آن را حذف کند (ماژول‌های crypto/prisma در Edge پشتیبانی نمی‌شوند).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./bootstrap-node');
  }
}
