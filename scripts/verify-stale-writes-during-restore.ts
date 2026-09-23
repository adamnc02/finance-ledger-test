// PROMPT-16 Part G (2026-09-23) — a second device must not write stale rows
// while another device's restore is syncing down.
//
// 🚨 THE BUG, found in UAT exports rather than in the UAT script. A wholesale
// restore reaches the OTHER device as several server commits: the new rows
// first (inserts), then the old transactions (deletes, child tables first),
// then the old templates, people and pay cycles. In the window between those
// two delete batches, the other device's app sees old templates and pay
// cycles whose occurrences and salary have "gone missing", and
// autoClearDuePayments — which runs on every data change — materialises them
// again. The store diffs them against a shadow that no longer holds them,
// emits inserts, and the server accepts them (right household, no FK). The
// old templates are then deleted; the re-created `auto:` rows stay behind,
// pointing at ids that no longer exist. Eight of them were in Adam's
// before-D export on 2026-09-23. With the second device OFFLINE for the
// restore (UAT section G) nothing stale was written — the control that
// pinned the mechanism.
//
// The rule now: a row id that arrived DELETED from the server during this
// session is never re-inserted from this device's derived state. Only an
// explicit setData (a restore or patch the user asked for) may bring one
// back.
//
// What it asserts:
//  1. the setup reproduces the window: after the first half of the
//     restorer's write, the other device is delivered a snapshot in which the
//     old transactions are gone but the old templates and pay cycles remain,
//     and autoClearDuePayments DOES re-materialise rows from it;
//  2. 🚨 saving that re-materialised state writes NO insert of a row the
//     server deleted (the fix);
//  3. CONTROL — the same save with the guard disabled DOES insert them (the
//     bug, reproduced);
//  4. after the restore completes, the household holds exactly the file's
//     rows: no transaction points at a person, template or pot that does not
//     exist;
//  5. this device's OWN deletes are not confused with remote ones: deleting a
//     transaction here and re-adding it (setData patch) still works;
//  6. an explicit restore (setData) may re-create a remotely deleted id.

import { readFileSync } from 'node:fs'
import { autoClearDuePayments } from '../src/lib/autoClear'
import { parseLedgerBackupJson } from '../src/lib/ledgerStorage'
import { toRows } from '../src/lib/powersync/mapping'
import { regenerateIds } from '../src/lib/powersync/importIds'
import type { Op } from '../src/lib/powersync/writes'
import { createPowerSyncLedgerStore, type SyncDatabase } from '../src/lib/store/powerSyncLedgerStore'
import type { AppDataV2 } from '../src/types/ledger'
import { FakeSyncDb, memoryStorage, tick } from './lib/fakeSyncDb'

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ✓ ${label}`)
  else {
    failures++
    console.log(`  ✗ ${label}`)
    if (detail !== undefined) console.log('     ', JSON.stringify(detail).slice(0, 600))
  }
}

const HH = '11111111-2222-3333-4444-555555555555'
const ADAM = 'user-adam'
const ELLA = 'user-ella'
const raw = readFileSync('/Users/adamcox/Downloads/App Development & Bug Tracking/shared-finance-ledger/finance-ledger-backup-2026-09-15.json', 'utf8')
const silent = { error: () => {}, warn: () => {}, info: () => {} }
const ASOF = new Date('2026-09-23T12:00:00Z')

/** The household as it stands before the restore: a previous generation, with every due occurrence already materialised. */
function household(): AppDataV2 {
  return autoClearDuePayments(regenerateIds(parseLedgerBackupJson(raw)).data, ASOF)
}

/**
 * The restorer's database, seen through a wrapper that lands its write in TWO commits the way the
 * server does: everything up to the old transactions' deletes, then the rest. The other device's
 * onChange fires after each, so it is delivered the in-between state.
 */
function splitWrites(db: FakeSyncDb, onHalf: () => Promise<void>): SyncDatabase {
  return {
    readAll: () => db.readAll(),
    onChange: (cb) => db.onChange(cb),
    write: async (ops: Op[]) => {
      // Split just after the LAST delete of an old transaction: the new rows are in, the old
      // transactions are gone, the old templates / people / pay cycles (parents, deleted last) remain.
      let i = -1
      ops.forEach((op, k) => {
        if (op.kind === 'delete' && op.table === 'transactions') i = k + 1
      })
      if (i <= 0) return db.write(ops)
      await db.write(ops.slice(0, i))
      await onHalf()
      await db.write(ops.slice(i))
    },
  }
}

const idsIn = (d: AppDataV2) => ({
  people: new Set(d.people.map((p) => p.id)),
  templates: new Set(d.recurringTemplates.map((t) => t.id)),
  pots: new Set(d.pots.map((p) => p.id)),
  loans: new Set(d.loans.map((l) => l.id)),
})
/** Transactions whose references point at nothing (the orphans), optionally only among `among` ids. */
function orphans(d: AppDataV2, among?: Set<string>): string[] {
  const ids = idsIn(d)
  return d.transactions
    .filter((t) => !among || among.has(t.id))
    .filter((t) => {
      if (t.ownerId && !ids.people.has(t.ownerId)) return true
      if (t.payee && !ids.people.has(t.payee)) return true
      if (t.personId && !ids.people.has(t.personId)) return true
      if (t.potId && !ids.pots.has(t.potId)) return true
      if (t.sourceType === 'recurring_template' && t.sourceId && !ids.templates.has(t.sourceId)) return true
      if ((t.sourceType === 'loan_recurring_overpayment' || t.sourceType === 'loan') && t.sourceId && !ids.loans.has(t.sourceId)) return true
      return false
    })
    .map((t) => t.id)
}

async function scenario(unsafe: boolean) {
  const before = household()
  const db = new FakeSyncDb()
  db.seed(toRows(before, { householdId: HH }))
  const people = db.tables.get('people')!
  people.get(before.people[0].id)!.linked_user_id = ADAM
  people.get(before.people[1].id)!.linked_user_id = ELLA
  const seededTxIds = new Set(before.transactions.map((t) => t.id))

  // Device B (Ella), online, subscribed — the LedgerProvider stand-in.
  const b = createPowerSyncLedgerStore({ db, householdId: HH, userId: ELLA, firstSync: Promise.resolve(), storageKey: 'kB', storage: memoryStorage(), log: silent, unsafeRecreateRemotelyDeleted: unsafe })
  const deliveries: AppDataV2[] = []
  b.subscribe!((d) => deliveries.push(d))
  await tick(30)
  const bBefore = deliveries[deliveries.length - 1]

  let partial: AppDataV2 | null = null
  let staleInserts: string[] = []
  let materialised = 0
  const onHalf = async () => {
    await tick(30) // B's onChange → deliver
    partial = deliveries[deliveries.length - 1]
    // What LedgerProvider does on every data change: auto-clear, then save if anything settled.
    const settled = autoClearDuePayments(partial, ASOF)
    materialised = settled.transactions.length - partial.transactions.length
    const logBefore = db.log.length
    b.save(settled, partial)
    await b.flush()
    staleInserts = db.log.slice(logBefore).filter((s) => s.kind === 'insert' && s.table === 'transactions' && seededTxIds.has(s.id)).map((s) => s.id)
  }

  // Device A (Adam) restores a foreign file.
  db.actingUser = ADAM
  const a = createPowerSyncLedgerStore({ db: splitWrites(db, onHalf), householdId: HH, userId: ADAM, firstSync: Promise.resolve(), storageKey: 'kA', storage: memoryStorage(), log: silent })
  const loaded = (await a.load())!
  a.save(parseLedgerBackupJson(raw), loaded)
  await a.flush()
  await tick(40)
  const final = deliveries[deliveries.length - 1]
  return { before, bBefore, partial: partial!, materialised, staleInserts, final, db, seededTxIds }
}

console.log('\n1. The window is real: old transactions gone, old templates and pay cycles still there')
const fixed = await scenario(false)
{
  const oldTemplateIds = new Set(fixed.before.recurringTemplates.map((t) => t.id))
  const oldTxIds = new Set(fixed.before.transactions.map((t) => t.id))
  check('before the restore, Device B held the previous generation', fixed.bBefore.transactions.some((t) => oldTxIds.has(t.id)))
  check("in the half-synced snapshot the OLD templates are still present", fixed.partial.recurringTemplates.some((t) => oldTemplateIds.has(t.id)))
  check('…but the OLD transactions are already gone', !fixed.partial.transactions.some((t) => oldTxIds.has(t.id)))
  check('…and autoClearDuePayments re-materialises occurrences from that snapshot (the writer)', fixed.materialised > 0, fixed.materialised)
}

console.log('\n2. 🚨 The fix: nothing the server deleted is re-inserted')
{
  check('Device B wrote NO insert of a transaction the server had deleted', fixed.staleInserts.length === 0, fixed.staleInserts)
}

console.log('\n3. CONTROL — with the guard off, the same save re-creates them (the bug)')
const control = await scenario(true)
{
  check('the control re-inserts previously deleted transaction ids', control.staleInserts.length > 0, control.staleInserts.length)
  check('…and they survive the restore as ORPHANS pointing at ids that no longer exist', orphans(control.final, control.seededTxIds).length > 0, orphans(control.final, control.seededTxIds).slice(0, 4))
}

console.log('\n4. After the restore the household holds exactly the file\'s rows')
{
  // (The 2026-09-15 file itself carries one dangling reference — a "Bills Top Up" whose template was
  // deleted before the export — so orphans are judged among the PREVIOUS generation's ids only.)
  check('no previous-generation transaction survived the restore', orphans(fixed.final, fixed.seededTxIds).length === 0 && !fixed.final.transactions.some((t) => fixed.seededTxIds.has(t.id)), orphans(fixed.final, fixed.seededTxIds).slice(0, 4))
  // Everything else Device B wrote is a legitimate derived row for the NEW generation, so the only
  // dangling references left are the ones the file itself carries — no more, no fewer.
  const fileOrphans = orphans(parseLedgerBackupJson(raw)).length
  check('the only dangling references left are the file\'s own', orphans(fixed.final).length === fileOrphans, [orphans(fixed.final), fileOrphans])
  check('…and the control has MORE than that', orphans(control.final).length > fileOrphans, [orphans(control.final).length, fileOrphans])
}

console.log("\n5. This device's own deletes are not mistaken for remote ones")
{
  const before = household()
  const db = new FakeSyncDb()
  db.seed(toRows(before, { householdId: HH }))
  const s = createPowerSyncLedgerStore({ db, householdId: HH, userId: ADAM, firstSync: Promise.resolve(), storageKey: 'k', storage: memoryStorage(), log: silent })
  const got: AppDataV2[] = []
  s.subscribe!((d) => got.push(d))
  await tick(30)
  const cur = got[got.length - 1]
  const victim = cur.transactions.find((t) => !t.id.startsWith('auto:'))!
  s.save({ ...cur, transactions: cur.transactions.filter((t) => t.id !== victim.id) }, cur)
  await s.flush()
  await tick(30)
  const afterDelete = got[got.length - 1]
  check('deleted here: gone', !afterDelete.transactions.some((t) => t.id === victim.id))
  // The user re-imports the household's own file with the row back (a patch: same ids).
  db.clearLog()
  s.save({ ...JSON.parse(JSON.stringify(afterDelete)), transactions: [...afterDelete.transactions, victim] } as AppDataV2, afterDelete)
  await s.flush()
  check('re-adding it through an explicit setData patch is allowed', db.log.some((x) => x.kind === 'insert' && x.id === victim.id), db.log.map((x) => `${x.kind} ${x.id}`))
}

console.log('\n6. An explicit restore may bring a remotely deleted id back')
{
  const before = household()
  const db = new FakeSyncDb()
  db.seed(toRows(before, { householdId: HH }))
  const s = createPowerSyncLedgerStore({ db, householdId: HH, userId: ELLA, firstSync: Promise.resolve(), storageKey: 'k', storage: memoryStorage(), log: silent })
  const got: AppDataV2[] = []
  s.subscribe!((d) => got.push(d))
  await tick(30)
  const cur = got[got.length - 1]
  const victim = cur.transactions[0]
  // Another device deletes it.
  db.tables.get('transactions')!.delete(victim.id)
  db.remoteChange('people', cur.people[0].id, {})
  await tick(30)
  const afterRemote = got[got.length - 1]
  check('the remote delete was delivered', !afterRemote.transactions.some((t) => t.id === victim.id))
  db.clearLog()
  // A derived save (autoClear-like) that puts it back: dropped.
  s.save({ ...afterRemote, transactions: [...afterRemote.transactions, victim] }, afterRemote)
  await s.flush()
  check('a derived save cannot re-create it', !db.log.some((x) => x.kind === 'insert' && x.id === victim.id))
  // The user restores the household's own file containing it: allowed (a patch, same ids).
  const patched = JSON.parse(JSON.stringify({ ...afterRemote, transactions: [...afterRemote.transactions, victim] })) as AppDataV2
  db.clearLog()
  s.save(patched, afterRemote)
  await s.flush()
  check('an explicit setData restore CAN', db.log.some((x) => x.kind === 'insert' && x.id === victim.id), db.log.map((x) => `${x.kind} ${x.id}`).slice(0, 5))
}

console.log(failures === 0 ? '\nAll stale-write checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
