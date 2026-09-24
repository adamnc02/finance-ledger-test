import { simulateScenarioLoan, baselineLoanSchedule, currentLoanMonthlyCost } from '../src/lib/loans'
const base: any = { id:'joint-loan', name:'Joint loan', firstPaymentDate:'2027-01-01', totalAmount:1200, monthlyPayment:100, location:'joint', ownerId:'', payee:'adam', payeeSharePercent:50 }
const withApr: any = { ...base, calibratedMonthlyRate: 0.004 }
for (const [label, loan] of [['no interest (the test fixture)', base], ['WITH calibratedMonthlyRate', withApr]] as [string, any][]) {
  const ev = [{ date: '2026-09-23', amount: 1200, recastMode: 'reduce_term' as const }]
  const o: any = simulateScenarioLoan(loan, ev)
  const b: any = baselineLoanSchedule(loan)
  console.log(label)
  console.log('   outcome.hasSchedule   :', o?.hasSchedule)
  console.log('   outcome.fullyPaidOff  :', o?.fullyPaidOff)
  console.log('   baselineSchedule.len  :', b?.length)
  console.log('   currentLoanMonthlyCost:', currentLoanMonthlyCost(loan))
  console.log()
}
