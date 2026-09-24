import { summarizeLoan, estimateSettlementFigure } from '../src/lib/loans'
const base: any = { id:'joint-loan', name:'Joint loan', firstPaymentDate:'2027-01-01', totalAmount:1200, monthlyPayment:100, location:'joint', ownerId:'', payee:'adam', payeeSharePercent:50 }
for (const [label, loan] of [['future start 2027-01-01', base], ['started 2026-01-01', {...base, firstPaymentDate:'2026-01-01'}]] as [string, any][]) {
  const s = summarizeLoan(loan)
  console.log(`${label.padEnd(26)} remaining=${s.remaining}  settlement=${estimateSettlementFigure(loan)}`)
}
console.log()
console.log('--- what fields does estimateSettlementFigure need? ---')
console.log(estimateSettlementFigure.toString().slice(0, 700))
