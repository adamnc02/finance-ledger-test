// The cycle statement's date picker offers REAL cycles, and commits the
// bounds it displayed.
//
// The defect this exists to prevent has happened before, in this app:
// `verify-overpayment-picker-real-dates.ts` covers a picker that
// displayed one set of dates and keyed another, silently writing against
// the wrong one. A statement picker has the same shape — a list of dates
// a person taps — and the same failure would be invisible, because the
// file it produced would look entirely plausible.
//
// 🚨 The control is at the bottom: move the opening-balance date and the
// offered list must actually shorten. A check that cannot fail proves
// nothing.

import { statementFixture, ASOF, PAY_CYCLE } from './statementFixture'
import { offerableCycles } from '../src/components/StatementRangeSheet'
import { horizonCycles, THREE_CYCLES_AHEAD, cyclesInRange } from '../src/lib/projection'
import { resolveCycleBounds } from '../src/lib/pensionLedger'
import { buildStatementPayload } from '../src/lib/statement'
import { toLocalIsoDate as iso, parseLocalDate } from '../src/lib/date'
import type { AppDataV2 } from '../src/types/ledger'

let passed = 0
let failed = 0
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    passed++
    console.log(`✓ ${label}`)
  } else {
    failed++
    console.error(`✗ FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
  }
}
const assert = (label: string, condition: boolean) => check(label, condition, true)

const data = statementFixture()
const personId = data.primaryPersonId
const earliest = PAY_CYCLE.openingBalanceDate

const cycles = offerableCycles(data, personId, ASOF, earliest)
const currentIndex = cycles.findIndex((c) => c.current)

// ── E6.1 — display what you key ────────────────────────────────────────
{
  assert('every offered cycle round-trips through resolveCycleBounds', cycles.every((c) => {
    const real = resolveCycleBounds(data, personId, parseLocalDate(c.start))
    return iso(real.start) === c.start && iso(real.end) === c.end
  }))
  assert('no two offered cycles share a start', new Set(cycles.map((c) => c.start)).size === cycles.length)
  assert('the cycles tile with no gap and no overlap', cycles.every((c, i) => {
    if (i === 0) return true
    const previousEnd = parseLocalDate(cycles[i - 1].end)
    return c.start === iso(new Date(previousEnd.getFullYear(), previousEnd.getMonth(), previousEnd.getDate() + 1))
  }))
  assert('exactly one cycle is marked "this cycle"', cycles.filter((c) => c.current).length === 1)
  assert('the current cycle really contains today', cycles[currentIndex].start <= iso(ASOF) && iso(ASOF) <= cycles[currentIndex].end)
}

// ── E3.2 — the default window is the Home page's own horizon ───────────
{
  // 🚨 Read from THREE_CYCLES_AHEAD; never hardcode 4.
  const defaultTo = Math.min(currentIndex + THREE_CYCLES_AHEAD, cycles.length - 1)
  const horizon = horizonCycles(data, personId, 'three_cycles', ASOF)
  check('the default window starts where "Next 3 cycles" starts', cycles[currentIndex].start, iso(horizon[0].start))
  check('and ends where it ends', cycles[defaultTo].end, iso(horizon[horizon.length - 1].end))
  check('which is four whole cycles', defaultTo - currentIndex + 1, horizon.length)
  assert('the constant is genuinely being read, not a coincidence of the number 4', horizon.length === THREE_CYCLES_AHEAD + 1)
}

// ── E3.5 — the floor is listed and disabled, never silently omitted ────
{
  assert('cycles entirely before the reconciliation point are listed', cycles.some((c) => !c.available))
  assert('every unavailable cycle ends before the floor', cycles.filter((c) => !c.available).every((c) => c.end < earliest))
  assert('every available cycle reaches the floor or later', cycles.filter((c) => c.available).every((c) => c.end >= earliest))
  assert('the list reaches back further than the floor, so there is something to disable', cycles[0].start < earliest)
}

// ── The window the picker promises is the window the payload carries ───
{
  const from = cycles[currentIndex]
  const to = cycles[Math.min(currentIndex + THREE_CYCLES_AHEAD, cycles.length - 1)]
  const payload = buildStatementPayload(data, { selectedStart: from.start, selectedEnd: to.end, asOfDate: ASOF })
  check('the payload spans exactly the cycles the picker offered', [payload.meta.fullRangeStart, payload.meta.fullRangeEnd], [from.start, to.end])
  check('one payload cycle per offered cycle in the window', payload.meta.cycles.length, THREE_CYCLES_AHEAD + 1)
  check('the payload cycle labels are the picker\'s labels', payload.meta.cycles.map((c) => c.label), cycles.slice(currentIndex, currentIndex + THREE_CYCLES_AHEAD + 1).map((c) => c.label))

  // E4.3 / §0.5 O2 — exact dates still hold the whole containing cycles.
  const exact = buildStatementPayload(data, { selectedStart: '2026-09-20', selectedEnd: '2026-10-05', asOfDate: ASOF })
  assert('an exact-date window still carries the whole containing cycles', exact.meta.fullRangeStart < exact.meta.selectedStart && exact.meta.fullRangeEnd > exact.meta.selectedEnd)
  check('a window inside ONE cycle is one cycle, not none', exact.meta.cycles.length, 1)
}

// ── B12.13 — a start below the floor is clamped, and says so ───────────
{
  const clamped = buildStatementPayload(data, { selectedStart: '2026-01-01', selectedEnd: '2026-10-31', asOfDate: ASOF })
  check('the window used starts at the floor', clamped.meta.selectedStart, earliest)
  check('the clamp records what was asked for', clamped.meta.clamp?.requestedStart, '2026-01-01')
  assert('and gives a reason naming the reconciliation date', !!clamped.meta.clamp?.reason.includes('14 September 2026'))
  assert('no row predates the floor', clamped.cards.every((c) => c.rows.every((r) => r.date >= earliest)))
}

// ── E3.4 — an impossible window is never offered ───────────────────────
{
  // The sheet disables the invalid rows; the payload must also refuse to
  // invert a window if one ever reached it.
  const reversed = buildStatementPayload(data, { selectedStart: '2026-10-14', selectedEnd: '2026-09-14', asOfDate: ASOF })
  assert('an end before the start collapses to a single cycle rather than an empty file', reversed.meta.cycles.length >= 1)
  assert('and the full range is still ordered', reversed.meta.fullRangeStart <= reversed.meta.fullRangeEnd)
}

// ── 🚨 THE CONTROL ─────────────────────────────────────────────────────
// Move the opening-balance date forward and the offered list must
// genuinely shorten. Without this, every assertion above would still
// pass against a picker that ignored the floor entirely.
{
  const later: AppDataV2 = {
    ...data,
    payCycles: data.payCycles.map((pc) => (pc.personId === personId ? { ...pc, openingBalanceDate: '2026-09-14' } : pc)),
  }
  const withEarlyFloor = offerableCycles(data, personId, ASOF, '2025-01-01')
  const withLateFloor = offerableCycles(later, personId, ASOF, '2026-09-14')
  assert('CONTROL: moving the floor forward reduces how many cycles are selectable', withLateFloor.filter((c) => c.available).length < withEarlyFloor.filter((c) => c.available).length)
  assert('CONTROL: with the floor at the very start, nothing is disabled', withEarlyFloor.every((c) => c.available))
  // And the cycle bounds themselves are untouched by the floor — the
  // floor decides what is OFFERED, never where a cycle begins.
  check('CONTROL: the floor changes availability, never a cycle bound', withLateFloor.map((c) => c.start), withEarlyFloor.map((c) => c.start))
}

// ── E6.3 — one cycle walker, not two ───────────────────────────────────
{
  const walked = cyclesInRange(data, personId, parseLocalDate(cycles[currentIndex].start), parseLocalDate(cycles[currentIndex + 2].end))
  check('the picker\'s cycles and cyclesInRange agree exactly', walked.map((c) => iso(c.start)), cycles.slice(currentIndex, currentIndex + 3).map((c) => c.start))
}

console.log(`\n${passed} passed, ${failed} failed.`)
if (failed > 0) process.exit(1)
