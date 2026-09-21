// کنترل دسترسی RBAC + ABAC — منع پیش‌فرض
// مشاهده شناسنامه / مشاهده محتوا / دانلود اصل / بارگذاری / اصلاح / حذف / مدیریت = مجوزهای جدا
// نقش‌های سامانه (تصمیم بهره‌بردار ۱۴۰۵): فقط ۶ نقش رسمی اداره مهندسی عمومی فراورش یک

export const ROLES = {
  ADMIN: 'مدیر سامانه',
  ENG_EXPERT: 'کارشناس اداره مهندسی عمومی',
  ENG_HEAD: 'رئیس اداره مهندسی عمومی',
  TECH_HEAD: 'رئیس خدمات فنی فراورش یک',
  OFFICE_MGR: 'مسئول دفتر رئیس اداره مهندسی عمومی',
  CONTRACTOR: 'پیمانکار',
} as const;

export type Role = keyof typeof ROLES;

export const CLEARANCE_ORDER: Record<string, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};

export const CLEARANCE_LABELS: Record<string, string> = {
  PUBLIC: 'عمومی',
  INTERNAL: 'داخلی',
  CONFIDENTIAL: 'محرمانه',
  RESTRICTED: 'بسیار محرمانه',
};

// چه نقش‌هایی چه اقدام‌هایی دارند (پایه؛ سهمیه پروژه در abac اعمال می‌شود)
// doc:review = تأیید/اصلاح مقادیر استخراج‌شدهٔ شناسنامه (صف بازبینی) — مرحله B
// processing:manage = مدیریت صف پردازش/بازپردازش — مرحله B
const ROLE_CAPS: Record<string, string[]> = {
  ADMIN: ['doc:view', 'doc:content', 'doc:download', 'doc:upload', 'doc:edit', 'doc:delete', 'doc:review', 'admin:manage', 'processing:manage', 'audit:view', 'reports:view', 'cartable:view'],
  ENG_EXPERT: ['doc:view', 'doc:content', 'doc:download', 'doc:upload', 'doc:edit', 'doc:review', 'processing:manage', 'reports:view', 'cartable:view', 'vocab:view'],
  ENG_HEAD: ['doc:view', 'doc:content', 'doc:download', 'doc:review', 'reports:view', 'cartable:view', 'vocab:view'],
  TECH_HEAD: ['doc:view', 'doc:content', 'doc:download', 'doc:review', 'reports:view', 'cartable:view'],
  OFFICE_MGR: ['doc:view', 'doc:content', 'doc:download', 'doc:upload', 'cartable:view'],
  CONTRACTOR: ['doc:view', 'doc:content', 'doc:upload', 'cartable:view'],
};

export function roleHas(role: string, cap: string): boolean {
  return (ROLE_CAPS[role] || []).includes(cap);
}

export interface AccessContext {
  role: string;
  clearance: string;
  categoryAccess?: string | null; // "ALL" | JSON array مثل ["PUBLIC","CONFIDENTIAL"] | null = مبتنی بر سطح (legacy)
  organizationId: string;
  projectIds: Set<string>; // عضویت صریح پروژه — منع پیش‌فرض
}

// دسته‌بندی‌های محرمانگی مجاز کاربر — پشتیبانی از انتخاب چندگزینه‌ای + گزینهٔ «همه»
//  - categoryAccess="ALL" → همهٔ دسته‌بندی‌ها
//  - categoryAccess=JSON array → فقط همان‌ها (مستقل از ترتیب سطح)
//  - null/نامعتبر → رفتار کلاسیک: دسته‌هایی با سطح <= سطح کاربر
export function allowedCategoriesFor(ctx: Pick<AccessContext, 'clearance' | 'categoryAccess'>): string[] {
  const all = Object.keys(CLEARANCE_ORDER);
  if (ctx.categoryAccess === 'ALL') return all;
  if (ctx.categoryAccess && ctx.categoryAccess.startsWith('[')) {
    try {
      const arr = JSON.parse(ctx.categoryAccess) as unknown;
      if (Array.isArray(arr)) {
        const valid = arr.filter((c): c is string => typeof c === 'string' && CLEARANCE_ORDER[c] !== undefined);
        if (valid.length > 0) return all.filter((c) => valid.includes(c));
      }
    } catch { /* نامعتبر → رفتار کلاسیک */ }
  }
  const userLevel = CLEARANCE_ORDER[ctx.clearance] ?? 1;
  return all.filter((c) => CLEARANCE_ORDER[c] <= userLevel);
}

export function canViewDocument(ctx: AccessContext, doc: { organizationId: string; projectId: string; confidentiality: string }): boolean {
  if (doc.organizationId !== ctx.organizationId) return false;
  if (!ctx.projectIds.has(doc.projectId)) return false;
  if (CLEARANCE_ORDER[doc.confidentiality] === undefined) return false;
  return allowedCategoriesFor(ctx).includes(doc.confidentiality);
}

export function can(ctx: AccessContext, cap: string, doc?: { organizationId: string; projectId: string; confidentiality: string } | null): boolean {
  if (!roleHas(ctx.role, cap)) return false;
  if (doc) {
    if (!canViewDocument(ctx, doc)) return false;
    if (cap === 'doc:edit' || cap === 'doc:delete') {
      // پیمانکار حق اصلاح/حذف ندارد حتی اگر عضو باشد
      if (ctx.role === 'CONTRACTOR') return false;
    }
  }
  if ((cap === 'doc:edit' || cap === 'doc:delete' || cap === 'admin:manage' || cap === 'doc:upload') && !(ctx.role in ROLE_CAPS)) return false;
  return true;
}
