import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const jobs = await db.processingJob.groupBy({ by: ['type','status'], _count: true })
  console.log('=== ProcessingJob (type/status/count) ===')
  for (const j of jobs) console.log(j.type, j.status, j._count)
  const dead = await db.processingJob.findMany({ where: { status: 'DEAD' }, take: 5, orderBy: { createdAt: 'desc' } })
  for (const d of dead) console.log('DEAD:', d.type, '|', (d.error||'').slice(0,150))
  const docs = await db.document.count()
  const files = await db.fileObject.count()
  const pages = await db.pageText?.count?.() ?? 'n/a'
  const derivs = await db.derivativeObject.count()
  console.log('docs:', docs, 'files:', files, 'pageTexts:', pages, 'derivatives:', derivs)
  const convs = await db.conversation.count()
  console.log('conversations:', convs)
  const ext = await db.docExtraction.count()
  console.log('extractions:', ext)
  const rev = await db.reviewTask.count()
  console.log('reviewTasks:', rev)
  await db.$disconnect()
}
main()
