// امنیت فایل: پسوند + نوع واقعی + امضای فایل؛ محدودیت حجم؛ تشخیص فایل خراب/رمزشده
// مرجع: OWASP File Upload Cheat Sheet

export const ALLOWED_EXTENSIONS: Record<string, { mime: string; label: string; previewable: boolean }> = {
  '.pdf': { mime: 'application/pdf', label: 'PDF', previewable: true },
  '.png': { mime: 'image/png', label: 'تصویر PNG', previewable: true },
  '.jpg': { mime: 'image/jpeg', label: 'تصویر JPEG', previewable: true },
  '.jpeg': { mime: 'image/jpeg', label: 'تصویر JPEG', previewable: true },
  '.tif': { mime: 'image/tiff', label: 'تصویر TIFF', previewable: false },
  '.tiff': { mime: 'image/tiff', label: 'تصویر TIFF', previewable: false },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word', previewable: false },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel', previewable: false },
  '.csv': { mime: 'text/csv', label: 'CSV', previewable: true },
  '.txt': { mime: 'text/plain', label: 'متن', previewable: true },
  '.dwg': { mime: 'application/acad', label: 'AutoCAD DWG', previewable: false },
  '.dxf': { mime: 'application/dxf', label: 'AutoCAD DXF', previewable: false },
  '.zip': { mime: 'application/zip', label: 'بایگانی ZIP', previewable: false },
};

export const MAX_UPLOAD_MB = 120;

export interface FileCheckResult {
  ok: boolean;
  reason?: string;
  mime: string;
  label: string;
  previewable: boolean;
}

// بررسی امضای باینری (Magic Bytes) — پسوند ادعایی کافی نیست
function sniffSignature(buf: Buffer): string | null {
  if (buf.length < 8) return null;
  const hex = buf.subarray(0, 12).toString('hex').toLowerCase();
  if (hex.startsWith('25504446')) return 'pdf';
  if (hex.startsWith('89504e47')) return 'png';
  if (hex.startsWith('ffd8ff')) return 'jpeg';
  if (hex.startsWith('49492a00') || hex.startsWith('4d4d002a')) return 'tiff';
  if (hex.startsWith('504b0304')) return 'zip'; // docx/xlsx/zip
  if (buf.subarray(0, 4).toString('ascii') === 'AC10' || buf.subarray(0, 6).toString('ascii').startsWith('AC10')) return 'dwg';
  // DXF متنی
  const head = buf.subarray(0, 64).toString('ascii');
  if (head.includes('SECTION') || /^\s*0\s*\r?\n\s*SECTION/.test(head)) return 'dxf';
  if (buf.subarray(0, 4).toString('ascii') === 'PK\x03\x04') return 'zip';
  return null;
}

function looksEncrypted(buf: Buffer, ext: string): boolean {
  if (ext === '.pdf') {
    // PDF رمزشده دارای /Encrypt در بخش اولیه
    const head = buf.subarray(0, Math.min(buf.length, 4096)).toString('latin1');
    if (head.includes('/Encrypt')) return true;
  }
  return false;
}

export function checkFile(originalName: string, buf: Buffer): FileCheckResult {
  const ext = (originalName.match(/\.[a-zA-Z0-9]+$/) || [''])[0].toLowerCase();
  const meta = ALLOWED_EXTENSIONS[ext];
  if (!meta) {
    return { ok: false, reason: `پسوند «${ext || 'نامشخص'}» مجاز نیست.`, mime: 'application/octet-stream', label: 'نامشخص', previewable: false };
  }
  if (buf.length === 0) {
    return { ok: false, reason: 'فایل خالی است.', mime: meta.mime, label: meta.label, previewable: meta.previewable };
  }
  if (buf.length > MAX_UPLOAD_MB * 1024 * 1024) {
    return { ok: false, reason: `حجم فایل از سقف ${MAX_UPLOAD_MB} مگابایت بیشتر است.`, mime: meta.mime, label: meta.label, previewable: meta.previewable };
  }
  const sig = sniffSignature(buf);
  const expectedByExt: Record<string, string> = {
    '.pdf': 'pdf', '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg',
    '.tif': 'tiff', '.tiff': 'tiff', '.docx': 'zip', '.xlsx': 'zip', '.zip': 'zip', '.dwg': 'dwg',
  };
  const wanted = expectedByExt[ext];
  if (wanted && sig !== wanted) {
    // امضای نادرست: احتمال تغییر پسوند یا فایل خراب → رد و قرنطینه
    return {
      ok: false,
      reason: sig ? `محتوای فایل با پسوند «${meta.label}» همخوان نیست (نوع واقعی: ${sig}).` : 'امضای فایل قابل تشخیص نیست؛ فایل ممکن است خراب شده باشد.',
      mime: meta.mime, label: meta.label, previewable: meta.previewable,
    };
  }
  if (looksEncrypted(buf, ext)) {
    return { ok: false, reason: 'فایل PDF رمزگذاری‌شده است؛ رمز را حذف کنید یا نسخه باز ارائه دهید.', mime: meta.mime, label: meta.label, previewable: false };
  }
  return { ok: true, mime: meta.mime, label: meta.label, previewable: meta.previewable };
}
