import { readFileSync } from 'node:fs'
import { summarizeLoan as summarizeLedgerLoan } from '../src/lib/ledgerLoans'
const led = JSON.parse(readFileSync('/tmp/uat/ledger.json','utf8'))
const s = summarizeLedgerLoan(led.loans[0], new Date()) as unknown as Record<string, unknown>
console.log(Object.entries(s).map(([k,v]) => `  ${k}: ${JSON.stringify(v)}`).join('\n').slice(0, 1200))
