import { readFileSync } from 'node:fs'
import { buildLegacyAppData } from '../src/lib/legacyBridge'
import { summarizeLoan as summarizeLedgerLoan } from '../src/lib/ledgerLoans'
import { summarizeLoan } from '../src/lib/loans'
import { costForPerson } from '../src/lib/bills'
import { calculateScenarioImpact, calculateHouseholdScenarioImpact } from '../src/lib/scenarios'
const led = JSON.parse(readFileSync('/tmp/uat/ledger.json', 'utf8'))
const raw = led.loans[0]
console.log('=== ISSUE 2: what balance does each layer report? ===')
console.log('  ledger truth  summarizeLedgerLoan.remainingBalance :', (summarizeLedgerLoan(raw, new Date()) as never as {remainingBalance:number}).remainingBalance)
const data: never = buildLegacyAppData(led) as never
const bl = (data as unknown as {loans:{id:string;totalAmount:number;firstPaymentDate:string;calibratedMonthlyRate?:number;location:string;payee:string;payeeSharePercent:number;ownerId:string}[]}).loans[0]
console.log('  bridged loan  totalAmount                          :', bl.totalAmount)
console.log('  bridged loan  firstPaymentDate                     :', bl.firstPaymentDate, ' (today!)')
console.log('  bridged loan  calibratedMonthlyRate                :', bl.calibratedMonthlyRate)
console.log('  scenario page summarizeLoan(bridged).remaining     :', summarizeLoan(bl as never).remaining, '  <-- Adam sees 9906.51')
console.log()
console.log('=== ISSUE 3: the monthly share of a POT-located loan ===')
const vBill = { id:'loan:x', name:'Monzo', cost:195, dueDay:1, location:bl.location, payee:bl.payee, payeeSharePercent:bl.payeeSharePercent, category:'Loan', ownerId:bl.ownerId, isStandingOrder:true }
console.log('  location:', bl.location, ' payee:', JSON.stringify(bl.payee), ' share:', bl.payeeSharePercent, ' ownerId:', bl.ownerId)
console.log('  costForPerson(£195 -> Adam) :', costForPerson(vBill as never, 'YyioVn9i', (data as unknown as {people:{id:string}[]}).people))
console.log('  ^^ if 0, monthly impact can never be non-zero')
console.log()
const sc = led.scenarios[0]
const a = calculateScenarioImpact(sc, data, 'YyioVn9i', 1000)
const h = calculateHouseholdScenarioImpact(sc, data, 1000)
console.log('=== end result ===')
console.log('  personal monthlyImpact :', a.monthlyImpact, '  oneOff:', a.oneOffCashImpact)
console.log('  household monthlyImpact:', h.monthlyImpact)
const d0 = a.debtImpacts?.[0]
console.log('  balanceNow            :', d0?.balanceNow, '  (expect 10050)')
console.log('  finishDateNow         :', d0?.finishDateNow)
console.log('  sections              :', JSON.stringify(d0?.sections?.map(s => ({ balBefore: s.balanceOnDateBefore, balAfter: s.balanceOnDateAfter, payBefore: s.monthlyPaymentBefore, payAfter: s.monthlyPaymentAfter, chg: s.monthlyCashChange, finBefore: s.finishDateBefore, finAfter: s.finishDateAfter, paidOff: s.fullyPaidOff })), null, 1))
console.log('  finishDateAfterAll    :', d0?.finishDateAfterAll, '  (expect 2026-09-23, the day the money left)')
