import { readFileSync } from 'node:fs'
import { buildLegacyAppData } from '../src/lib/legacyBridge'
import { costForPerson } from '../src/lib/bills'
const led = JSON.parse(readFileSync('/tmp/uat/full.json','utf8'))
const d = buildLegacyAppData(led) as unknown as { bills: Record<string,unknown>[]; loans: Record<string,unknown>[]; people: {id:string}[] }
const ME = 'YyioVn9i'
console.log('=== every bridged BILL: location, and what it costs Adam ===')
let total = 0
for (const b of d.bills) {
  const c = costForPerson(b as never, ME, d.people)
  total += c
  console.log(`  ${String(b.name).padEnd(32)} ${String(b.location).padEnd(9)} cost=${String(b.cost).padStart(8)}  -> Adam ${c.toFixed(2).padStart(8)}`)
}
console.log(`  ${'TOTAL bills -> Adam'.padEnd(32)} ${' '.repeat(9)} ${' '.repeat(8)}     ${total.toFixed(2).padStart(8)}`)
console.log()
console.log('=== bridged LOANS ===')
for (const l of d.loans) {
  const c = costForPerson({ ...(l as object), cost: l.monthlyPayment } as never, ME, d.people)
  console.log(`  ${String(l.name).padEnd(32)} ${String(l.location).padEnd(9)} pay=${String(l.monthlyPayment).padStart(8)}  -> Adam ${c.toFixed(2).padStart(8)}`)
}
