import type { AppData, Loan, Scenario } from '../src/types/ledger'
import { calculateHouseholdScenarioImpact } from '../src/lib/scenarios'
const people = [{ id:'adam', name:'Adam', salary:3000, payFrequency:'monthly', payDayOfMonth:25, sharePercent:50 }]
const mk = (extra: object = {}) => ({ id:'l', name:'Monzo-like', firstPaymentDate:'2026-01-01', totalAmount:2340, monthlyPayment:195, location:'personal', ownerId:'adam', payee:'adam', payeeSharePercent:100, ...extra }) as unknown as Loan
const data = (loan: Loan) => ({ people, loans:[loan], bills:[], creditCards:[], savingsPots:[], transactions:[] } as unknown as AppData)
const recurring = { id:'s', name:'Overpay', includeInCumulative:true, actions:[{ id:'a', type:'loan_overpayment', label:'', value:50, loanAllocations:[{ loanId:'l' }] }] } as unknown as Scenario
const lump = { id:'s', name:'Clear', includeInCumulative:true, actions:[{ id:'a', type:'pay_off_loan', label:'', value:99999, loanAllocations:[{ loanId:'l' }] }] } as unknown as Scenario
for (const [label, loan] of [['NOT calibrated', mk()], ['calibrated (rate .004)', mk({ calibratedMonthlyRate:0.004 })], ['calibrated to ZERO', mk({ calibratedMonthlyRate:0 })]] as [string, Loan][]) {
  const l = calculateHouseholdScenarioImpact(lump, data(loan), 1000)
  const r = calculateHouseholdScenarioImpact(recurring, data(loan), 1000)
  console.log(`${label.padEnd(24)} lump-clear monthly=${String(l.monthlyImpact).padStart(7)}   recurring-overpay monthly=${String(r.monthlyImpact).padStart(7)}`)
}
