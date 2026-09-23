// نقشهٔ شماتیک مجتمع — گره‌های درختی (واحد → منطقه → تجهیز) کاملاً قابل مدیریت توسط ادمین
// GET: هر کاربر واردشده (برای غیرادمین فقط گره‌های visible) — POST/PATCH/DELETE: فقط ادمین
// ویرایش ادمین شامل: جابجایی بلوک (x,y)، تغییر اندازه (w,h)، نام/کد/توضیح/رنگ، نمایش/عدم‌نمایش
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, jsonOk, jsonError, getClientIp } from '@/lib/guard';
import { audit } from '@/lib/audit';
import { normalizeCode } from '@/lib/normalize';
import { MAP_COLORS } from '@/lib/plant-map';

const KINDS = ['UNIT', 'AREA', 'EQUIPMENT'] as const;
type Kind = (typeof KINDS)[number];

async function requireAdmin() {
  const auth = await requireUser();
  if ('resp' in auth) return auth;
  if (auth.user.role !== 'ADMIN') return { resp: jsonError('این بخش نیازمند نقش مدیر سامانه است.', 403, 'FORBIDDEN') };
  return auth;
}

const nodeSelect = {
  id: true, parentId: true, kind: true, code: true, name: true, desc: true,
  x: true, y: true, w: true, h: true, color: true, visible: true, sortOrder: true,
} as const;

export async function GET() {
  const auth = await requireUser();
  if ('resp' in auth) return auth.resp;
  const isAdmin = auth.user.role === 'ADMIN';
  const nodes = await db.mapNode.findMany({
    where: isAdmin ? {} : { visible: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: nodeSelect,
  });
  return jsonOk({ nodes, isAdmin });
}

// همگام‌سازی تگ تجهیز — کلید پیوند اسناد (dossier بر اساس تگ جست‌وجو می‌کند)
async function syncEquipmentTag(code: string, name: string) {
  const clean = code.trim();
  if (!clean) return;
  await db.assetTag.upsert({
    where: { tag: normalizeCode(clean) },
    update: {},
    create: { tag: normalizeCode(clean), description: name, tagType: 'EQUIPMENT' },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('resp' in auth) return auth.resp;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const kind = String(b?.kind || '');
  const name = String(b?.name || '').trim();
  if (!KINDS.includes(kind as Kind)) return jsonError('نوع گره نامعتبر است (UNIT/AREA/EQUIPMENT).');
  if (!name) return jsonError('نام گره الزامی است.');

  const parentId = b?.parentId ? String(b.parentId) : null;
  let parent: { id: string; kind: string } | null = null;
  if (parentId) {
    parent = await db.mapNode.findUnique({ where: { id: parentId }, select: { id: true, kind: true } });
    if (!parent) return jsonError('گره والد یافت نشد.');
  }
  // قواعد سلسله‌مراتب: واحد بی‌والد؛ منطقه زیر واحد؛ تجهیز زیر منطقه
  if (kind === 'UNIT' && parent) return jsonError('واحد در سطح سایت است و والد نمی‌پذیرد.');
  if (kind === 'AREA' && (!parent || parent.kind !== 'UNIT')) return jsonError('منطقه باید زیر یک واحد ساخته شود.');
  if (kind === 'EQUIPMENT' && (!parent || parent.kind !== 'AREA')) return jsonError('تجهیز باید زیر یک منطقه ساخته شود.');

  const code = b?.code ? String(b.code).trim() : null;
  if (kind === 'EQUIPMENT' && !code) return jsonError('برای تجهیز، کد/تگ الزامی است (کلید پیوند اسناد).');

  const color = MAP_COLORS.includes(String(b?.color) as never) ? String(b?.color) : 'primary';
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

  const node = await db.mapNode.create({
    data: {
      kind, name, code: code || null,
      desc: b?.desc ? String(b.desc).trim() || null : null,
      parentId,
      x: num(b?.x, 60), y: num(b?.y, 70),
      w: Math.max(100, num(b?.w, kind === 'AREA' ? 260 : 240)),
      h: Math.max(70, num(b?.h, 110)),
      color, visible: b?.visible === false ? false : true,
    },
    select: nodeSelect,
  });

  if (node.kind === 'EQUIPMENT' && node.code) await syncEquipmentTag(node.code, node.name);

  await audit({ organizationId: auth.user.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'MAP_NODE_CREATE', objectType: 'MapNode', objectId: node.id, detail: `${kind} ${node.code || node.name}`, ip: getClientIp(req) });
  return jsonOk({ node }, 201);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ('resp' in auth) return auth.resp;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const id = String(b?.id || '');
  if (!id) return jsonError('شناسهٔ گره الزامی است.');
  const existing = await db.mapNode.findUnique({ where: { id } });
  if (!existing) return jsonError('گره یافت نشد.', 404);

  const data: Record<string, unknown> = {};
  if (b?.name !== undefined) {
    const name = String(b.name).trim();
    if (!name) return jsonError('نام گره نمی‌تواند خالی باشد.');
    data.name = name;
  }
  if (b?.code !== undefined) data.code = String(b.code).trim() || null;
  if (b?.desc !== undefined) data.desc = String(b.desc).trim() || null;
  if (b?.color !== undefined && MAP_COLORS.includes(String(b.color) as never)) data.color = String(b.color);
  if (b?.visible !== undefined) data.visible = !!b.visible;
  if (b?.x !== undefined && Number.isFinite(Number(b.x))) data.x = Number(b.x);
  if (b?.y !== undefined && Number.isFinite(Number(b.y))) data.y = Number(b.y);
  if (b?.w !== undefined && Number.isFinite(Number(b.w))) data.w = Math.max(80, Number(b.w));
  if (b?.h !== undefined && Number.isFinite(Number(b.h))) data.h = Math.max(60, Number(b.h));
  if (b?.sortOrder !== undefined && Number.isFinite(Number(b.sortOrder))) data.sortOrder = Number(b.sortOrder);
  if (Object.keys(data).length === 0) return jsonError('تغییری برای اعمال ارسال نشده است.');

  const node = await db.mapNode.update({ where: { id }, data, select: nodeSelect });

  // اگر کد/نام تجهیز عوض شد، تگ مرتبط هم به‌روز شود تا پیوند اسناد جدید برقرار بماند
  if (node.kind === 'EQUIPMENT' && node.code && (data.code !== undefined || data.name !== undefined)) {
    await syncEquipmentTag(node.code, node.name);
  }

  await audit({ organizationId: auth.user.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'MAP_NODE_UPDATE', objectType: 'MapNode', objectId: node.id, detail: Object.keys(data).join(','), ip: getClientIp(req) });
  return jsonOk({ node });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if ('resp' in auth) return auth.resp;
  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) return jsonError('شناسهٔ گره الزامی است.');
  const existing = await db.mapNode.findUnique({ where: { id }, select: { id: true, kind: true, name: true, code: true } });
  if (!existing) return jsonError('گره یافت نشد.', 404);

  // حذف بازگشتی کل زیرشاخه‌ها (مستقل از pragma foreign_keys — صریح و مطمئن)
  const all = await db.mapNode.findMany({ select: { id: true, parentId: true } });
  const doomed = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of all) {
      if (n.parentId && doomed.has(n.parentId) && !doomed.has(n.id)) { doomed.add(n.id); changed = true; }
    }
  }
  await db.mapNode.deleteMany({ where: { id: { in: Array.from(doomed) } } });

  await audit({ organizationId: auth.user.organizationId, actorId: auth.user.id, actorName: auth.user.fullName, action: 'MAP_NODE_DELETE', objectType: 'MapNode', objectId: id, detail: `${existing.kind} ${existing.code || existing.name} (+${doomed.size - 1} زیرشاخه)`, ip: getClientIp(req) });
  return jsonOk({ deleted: doomed.size });
}
