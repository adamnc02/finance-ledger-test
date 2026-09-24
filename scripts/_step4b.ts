import { readFileSync } from 'node:fs'
import { buildLegacyAppData } from '../src/lib/legacyBridge'
import { calculateScenarioImpact } from '../src/lib/scenarios'
const led = JSON.parse(readFileSync('/tmp/uat/full.json','utf8'))
const d = buildLegacyAppData(led) as never
const r = calculateScenarioImpact(led.scenarios[0], d, 'YyioVn9i', 0)
console.log('monthlyAvailableBefore ("Available now (per month)") :', r.monthlyAvailableBefore)
console.log('monthlyAvailableAfter                                :', r.monthlyAvailableAfter)
