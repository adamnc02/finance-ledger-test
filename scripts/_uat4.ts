import { simulateScenarioLoan } from '../src/lib/loans'
const loan: any = { id:'l', name:'Car', firstPaymentDate:'2026-10-15', totalAmount:12000, monthlyPayment:250, location:'personal', ownerId:'me', payee:'me', payeeSharePercent:100, calibratedMonthlyRate:0.004 }
const lumpDate = '2026-12-20'   // deliberately NOT on a payment date (payments land on the 15th)
const o: any = simulateScenarioLoan(loan, [{ date: lumpDate, amount: 2000, recastMode: 'reduce_term' }])
console.log('lump dated:', lumpDate, ' (payments land on the 15th)')
console.log('does the schedule have an entry ON the lump date?', o.schedule.some((e: any) => e.date === lumpDate))
console.log('entries around it:')
o.schedule.filter((e: any) => e.date >= '2026-11-15' && e.date <= '2027-02-15').forEach((e: any) =>
  console.log(`   ${e.date}  overpaymentApplied=${String(e.overpaymentApplied).padStart(6)}  balanceAfter=${e.balanceAfter}`))
