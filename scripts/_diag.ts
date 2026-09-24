import type { AppData, Loan, Scenario } from '../src/types/ledger'
import { calculateScenarioImpact, calculateHouseholdScenarioImpact } from '../src/lib/scenarios'
import { summarizeLoan, currentLoanMonthlyCost } from '../src/lib/loans'
import { costForPerson } from '../src/lib/bills'
const virtualLoanBill = (loan: any, cost: number) => ({ id:`loan:${loan.id}`, name:loan.name, cost, dueDay:1, location:loan.location, payee:loan.payee, payeeSharePercent:loan.payeeSharePercent, category:'Loan', ownerId:loan.ownerId, isStandingOrder:true }) as any

const people = [
  { id: 'adam', name: 'Adam', salary: 3000, payFrequency: 'monthly' as const, payDayOfMonth: 25, sharePercent: 50 },
  { id: 'ella', name: 'Ella', salary: 2000, payFrequency: 'monthly' as const, payDayOfMonth: 25, sharePercent: 50 },
]
const jointLoan: Loan = {
  id: 'joint-loan', name: 'Joint loan', firstPaymentDate: '2027-01-01',
  totalAmount: 1200, monthlyPayment: 100, location: 'joint', ownerId: '',
  payee: 'adam', payeeSharePercent: 50,
} as Loan
const data = { people, loans: [jointLoan], bills: [], creditCards: [], savingsPots: [], transactions: [] } as unknown as AppData
const scenario = { id: 'jl1', name: 'Clear joint loan', includeInCumulative: true,
  actions: [{ id: 'jla1', type: 'pay_off_loan', label: '', value: 1200, loanAllocations: [{ loanId: 'joint-loan' }] }] } as unknown as Scenario

console.log('today                      :', new Date().toISOString().slice(0,10))
const s = summarizeLoan(jointLoan)
console.log('summarizeLoan.remaining    :', s.remaining)
console.log('summarizeLoan.monthsRemain :', s.monthsRemaining)
console.log('currentLoanMonthlyCost     :', currentLoanMonthlyCost(jointLoan))
console.log('virtualLoanBill(100)       :', JSON.stringify(virtualLoanBill(jointLoan, 100)))
console.log('costForPerson(bill@100,adam):', costForPerson(virtualLoanBill(jointLoan, 100), 'adam', people as never))
console.log('costForPerson(bill@100,ALL) :', 'n/a')
const a = calculateScenarioImpact(scenario, data, 'adam', 1000)
const h = calculateHouseholdScenarioImpact(scenario, data, 1000)
console.log('--- results ---')
console.log('adam.monthlyImpact  :', a.monthlyImpact, '(expected 50)')
console.log('house.monthlyImpact :', h.monthlyImpact, '(expected 100)')
console.log('adam.debtImpacts    :', JSON.stringify(a.debtImpacts?.map(d => ({ id: d.targetId, now: d.monthlyPaymentNow, total: d.totalMonthlyCashChange, sections: d.sections?.map(x => ({ before: x.monthlyPaymentBefore, after: x.monthlyPaymentAfter, chg: x.monthlyCashChange })) }))))

console.log()
console.log('=== SAME LOAN, but firstPaymentDate ALREADY STARTED (2026-01-01) ===')
const started = { ...jointLoan, firstPaymentDate: '2026-01-01' }
const d2 = { ...data, loans: [started] } as unknown as AppData
const a2 = calculateScenarioImpact(scenario, d2, 'adam', 1000)
const h2 = calculateHouseholdScenarioImpact(scenario, d2, 1000)
console.log('adam.monthlyImpact  :', a2.monthlyImpact)
console.log('house.monthlyImpact :', h2.monthlyImpact)
console.log('sections            :', JSON.stringify(a2.debtImpacts?.map(d => d.sections?.map(x => ({ before: x.monthlyPaymentBefore, after: x.monthlyPaymentAfter, chg: x.monthlyCashChange })))))
