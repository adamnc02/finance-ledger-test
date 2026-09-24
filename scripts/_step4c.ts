import { readFileSync } from 'node:fs'
import { buildLegacyAppData } from '../src/lib/legacyBridge'
import { combineBillsWithLoans } from '../src/lib/loans'
import { personalBillsTotal, jointContributionForPerson } from '../src/lib/bills'
const led = JSON.parse(readFileSync('/tmp/uat/full.json','utf8'))
const d = buildLegacyAppData(led) as unknown as { bills: never[]; loans: never[]; people: {id:string}[] }
const ME='YyioVn9i'
const all = combineBillsWithLoans(d.bills, d.loans)
const pb = personalBillsTotal(all as never, ME)
const jc = jointContributionForPerson(all as never, ME, d.people as never)
console.log('  personalBillsTotal      :', pb.toFixed(2))
console.log('  jointContribution       :', jc.toFixed(2))
console.log('  (available = netSalary − the two above)')
