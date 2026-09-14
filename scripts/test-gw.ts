import { chatComplete } from '../src/lib/modelGateway'
async function main() {
  const r = await chatComplete([{ role: 'user', content: 'فقط بنویس: سلام، درگاه مدل فعال است.' }], { timeoutMs: 30000 })
  console.log('ok:', r.ok, '| attempts:', r.attempts, '| dur:', r.durationMs)
  console.log('content:', r.content.slice(0, 200))
  if (!r.ok) console.log('error:', r.error)
  process.exit(0)
}
main()
