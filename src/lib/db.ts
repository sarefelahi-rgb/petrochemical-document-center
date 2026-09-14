import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

// مسیر پایگاه‌داده: ابتدا متغیر محیطی (.env)؛ در نبود آن مسیر مطلق مبتنی بر ریشهٔ پروژه.
// این fallback باعث می‌شود استقرار تازه (بدون .env) هم بلافاصله کار کند —
// جدول‌ها توسط bootstrap-node.ts از prisma/schema.sql ساخته می‌شوند.
function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim()
  if (fromEnv) return fromEnv
  const dir = path.join(process.cwd(), 'db')
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {}
  return 'file:' + path.join(dir, 'custom.db')
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: resolveDatabaseUrl(),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
