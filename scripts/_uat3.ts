import { readFileSync } from 'node:fs'
import { buildLoanSchedule } from '../src/lib/ledgerLoans'
const led = JSON.parse(readFileSync('/tmp/uat/ledger.json','utf8'))
const sch = buildLoanSchedule(led.loans[0]) as unknown as Record<string, unknown>[]
console.log('entries:', sch.length)
sch.slice(0,3).forEach((e,i) => console.log(` [${i}]`, JSON.stringify(e)))
