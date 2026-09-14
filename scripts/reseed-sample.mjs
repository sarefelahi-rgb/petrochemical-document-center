// بازتولید دادهٔ نمونهٔ برچسب‌خورده + خروجی کوتاه
const crypto = await import('crypto');
const { PrismaClient } = await import('@prisma/client');
const db = new PrismaClient();

function base32Decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let b = 0, v = 0; const o = [];
  for (const ch of s) { const i = A.indexOf(ch); if (i < 0) continue; v = (v << 5) | i; b += 5; if (b >= 8) { o.push((v >>> (b - 8)) & 255); b -= 8; } }
  return Buffer.from(o);
}
function totp(sec, step = Math.floor(Date.now() / 30000)) {
  const k = base32Decode(sec);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  buf.writeUInt32BE(step % 0x100000000, 4);
  const h = crypto.createHmac('sha1', k).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1000000).padStart(6, '0');
}

async function main() {
  await db.user.update({ where: { username: 'admin' }, data: { mfaSecret: 'JBSWY3DPEHPK3PXP', mfaEnabled: true } });
  const l1 = await fetch('http://localhost:3000/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASSWORD || 'CHANGE_ME_ADMIN_PASSWORD' }) });
  const d1 = await l1.json();
  const v = await fetch('http://localhost:3000/api/auth/mfa-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mfaToken: d1.mfaToken, code: totp('JBSWY3DPEHPK3PXP') }) });
  const cookie = v.headers.get('set-cookie').split(';')[0];
  const sd = await fetch('http://localhost:3000/api/admin/sample-data', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ action: 'create' }) });
  const out = await sd.json();
  console.log('sample-data:', sd.status, JSON.stringify(out).slice(0, 300));
  await db.$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
