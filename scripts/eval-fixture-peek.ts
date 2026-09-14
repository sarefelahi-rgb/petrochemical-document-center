// بازدید سریع از داده‌ها برای طراحی مجموعه ارزیابی دستیار
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const fa = (s: string | null) => (s || '').replace(/\s+/g, ' ').trim()

async function main() {
  const docs = await db.document.findMany({
    take: 12,
    orderBy: { createdAt: 'asc' },
    include: {
      project: { select: { code: true } },
      revisions: { orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { extractions: true, mtoRows: true } },
    },
  })
  console.log('=== DOCS ===')
  for (const d of docs) {
    const pts = await db.pageText.findMany({ where: { file: { revision: { documentId: d.id } } }, take: 2, orderBy: { pageNumber: 'asc' } })
    const exts = await db.docExtraction.findMany({ where: { documentId: d.id }, take: 8, orderBy: { confidence: 'desc' } })
    const mto = await db.mtoRow.findMany({ where: { documentId: d.id }, take: 3 })
    console.log(`\n# ${d.docNumber} | ${fa(d.title).slice(0, 60)} | proj=${d.project.code} | status=${d.status}/${d.engineeringStatus} | ext=${d._count.extractions} mto=${d._count.mtoRows}`)
    for (const e of exts.slice(0, 5)) console.log(`   ext: ${e.field}=${fa(e.valueRaw)} (${(e.confidence * 100).toFixed(0)}%) p${e.pageNumber}`)
    for (const pt of pts) console.log(`   p${pt.pageNumber} [${pt.source}]: ${fa(pt.textRaw).slice(0, 140)}`)
    for (const m of mto) console.log(`   mto: ${fa(m.rawDesc).slice(0, 50)} | mat=${m.material} size=${m.sizeMain} qty=${m.qty}`)
  }
  const agg = await db.mtoRow.groupBy({ by: ['material'], _sum: { qty: true }, _count: true })
  console.log('\n=== MTO global by material ===', JSON.stringify(agg))
}
main().finally(() => db.$disconnect())
